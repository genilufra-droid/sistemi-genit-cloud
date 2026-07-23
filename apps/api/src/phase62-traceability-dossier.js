import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const WRITE_ROLES = ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','OPERATOR_PESHORE'];
const QUALITY_RESULTS = ['QUARANTINE','APPROVED','REJECTED','PARTIAL_APPROVAL'];
const text = (value) => String(value ?? '').trim();
const num = (value) => Number(value || 0);

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function camel(row) {
  const out = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    out[key.replace(/_([a-z])/g, (_m, c) => c.toUpperCase())] = value;
  });
  return out;
}

function normalizeToken(value, fallback = 'REF') {
  let token = text(value).toUpperCase();
  token = token.normalize ? token.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : token;
  token = token.replace(/Ë/g, 'E').replace(/Ç/g, 'C').replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
  return token || fallback;
}

function formatQuantity(value) {
  const amount = num(value);
  if (Number.isInteger(amount)) return String(amount);
  return amount.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
}

function albanianDate(value) {
  const source = String(value || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const [year, month, day] = source.split('-');
  return `${day}-${month}-${year}`;
}

function lotStatusFromQuality(result) {
  if (result === 'APPROVED') return 'AVAILABLE';
  if (result === 'REJECTED') return 'BLOCKED';
  return 'QUARANTINE';
}

async function nextSequence(client, tenantId, companyId, key) {
  const { rows } = await client.query(`
    INSERT INTO trace_lot_sequences(tenant_id,company_id,sequence_key,last_value)
    VALUES($1,$2,$3,1)
    ON CONFLICT(tenant_id,company_id,sequence_key)
    DO UPDATE SET last_value=trace_lot_sequences.last_value+1,updated_at=NOW()
    RETURNING last_value`, [tenantId, companyId, key]);
  return Number(rows[0].last_value);
}

async function nextDocumentNo(client, tenantId, companyId, prefix, sourceDate) {
  const dateText = String(sourceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const year = dateText.slice(0, 4);
  const sequence = await nextSequence(client, tenantId, companyId, `${prefix}-${year}`);
  return `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
}

async function uniqueRawLotNumber(client, tenantId, companyId, { supplierCode, documentDate, packageCount, packageUnit, netKg }) {
  const base = `${normalizeToken(supplierCode, 'FURN')}-${albanianDate(documentDate)}-AMB-${formatQuantity(packageCount)} ${text(packageUnit || 'Thase')}-PESH-${formatQuantity(netKg)} kg`;
  const exists = await client.query(`SELECT 1 FROM trace_lots WHERE tenant_id=$1 AND company_id=$2 AND lot_number=$3`, [tenantId, companyId, base]);
  if (!exists.rowCount) return base;
  const suffix = await nextSequence(client, tenantId, companyId, `RAW-DUP-${normalizeToken(supplierCode)}-${String(documentDate).slice(0,10)}`);
  return `${base}-${String(suffix).padStart(2,'0')}`;
}

function rawLabel({ supplierCode, productName, packageCount, packageUnit, netKg }) {
  return `${text(supplierCode) || 'FURN'}-${text(productName) || 'Artikull'}-${formatQuantity(packageCount)} ${text(packageUnit || 'thase')}-${formatQuantity(netKg)} peshë neto`;
}

async function addChange(client, user, companyId, entityType, entityId, operation, metadata = {}) {
  await client.query(`INSERT INTO cloud_change_events(tenant_id,company_id,entity_type,entity_id,operation,metadata,user_id)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`, [user.tenant_id, companyId, entityType, entityId, operation, JSON.stringify(metadata), user.id]);
}

async function addDossierDocument(client, {
  dossierId, documentType, entityType, entityId, documentNo, documentDate, title, status = 'POSTED', snapshot = {}, metadata = {}, createdBy,
}) {
  const sequenceResult = await client.query(`SELECT COALESCE(MAX(sequence_no),0)+1 AS next_no FROM trace_dossier_documents WHERE dossier_id=$1`, [dossierId]);
  const sequenceNo = Number(sequenceResult.rows[0].next_no || 1);
  const id = randomUUID();
  await client.query(`INSERT INTO trace_dossier_documents(
      id,dossier_id,document_type,entity_type,entity_id,document_no,document_date,sequence_no,status,title,snapshot,metadata,created_by
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13)
    ON CONFLICT(dossier_id,document_type,entity_id)
    DO UPDATE SET document_no=EXCLUDED.document_no,document_date=EXCLUDED.document_date,status=EXCLUDED.status,title=EXCLUDED.title,
      snapshot=EXCLUDED.snapshot,metadata=EXCLUDED.metadata,updated_at=NOW()`, [
    id,dossierId,documentType,entityType,entityId,documentNo||null,documentDate||null,sequenceNo,status,title||documentType,
    JSON.stringify(snapshot||{}),JSON.stringify(metadata||{}),createdBy||null,
  ]);
}

async function ensureWeightAndDossier(client, user, weightId, forUpdate = true) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const { rows } = await client.query(`SELECT wt.*,bp.code AS supplier_code,bp.name AS supplier_name,p.code AS product_code,p.name AS product_name,
      w.name AS warehouse_name,f.name AS farm_name,f.code AS farm_code,pa.name AS parcel_name,pa.code AS parcel_code,
      tp.name AS plant_name,tp.botanical_name,tp.plant_part
    FROM weight_tickets wt
    JOIN business_partners bp ON bp.id=wt.supplier_id
    JOIN products p ON p.id=wt.product_id
    JOIN warehouses w ON w.id=wt.warehouse_id
    LEFT JOIN trace_farms f ON f.id=wt.farm_id
    LEFT JOIN trace_parcels pa ON pa.id=wt.parcel_id
    LEFT JOIN trace_plants tp ON tp.id=wt.plant_id
    WHERE wt.id=$1 AND wt.tenant_id=$2${lock}`, [weightId, user.tenant_id]);
  const weight = rows[0];
  if (!weight) throw requestError('Formulari i peshës nuk u gjet.', 404);
  let dossier = null;
  if (weight.trace_dossier_id) {
    const dossierResult = await client.query(`SELECT * FROM trace_dossiers WHERE id=$1 AND tenant_id=$2${lock}`, [weight.trace_dossier_id, user.tenant_id]);
    dossier = dossierResult.rows[0] || null;
  }
  return { weight, dossier };
}

async function assertDossier(client, user, dossierId, assertCompanyAccess, forUpdate = false) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const { rows } = await client.query(`SELECT * FROM trace_dossiers WHERE id=$1 AND tenant_id=$2${lock}`, [dossierId, user.tenant_id]);
  const dossier = rows[0];
  if (!dossier) throw requestError('Dosja e gjurmueshmërisë nuk u gjet.', 404);
  await assertCompanyAccess(user, dossier.company_id, client);
  return dossier;
}

export async function migratePhase62TraceabilityDossier(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS trace_plants (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      farm_id UUID NOT NULL REFERENCES trace_farms(id) ON DELETE RESTRICT,
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      code VARCHAR(80) NOT NULL,
      name VARCHAR(220) NOT NULL,
      botanical_name VARCHAR(220),
      local_name VARCHAR(220),
      plant_part VARCHAR(140),
      organic_status VARCHAR(80),
      certificate_no VARCHAR(140),
      harvest_season VARCHAR(140),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id,company_id,farm_id,code)
    );

    CREATE TABLE IF NOT EXISTS trace_dossiers (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      dossier_no VARCHAR(100) NOT NULL,
      supplier_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE RESTRICT,
      farm_id UUID NOT NULL REFERENCES trace_farms(id) ON DELETE RESTRICT,
      parcel_id UUID REFERENCES trace_parcels(id) ON DELETE RESTRICT,
      plant_id UUID NOT NULL REFERENCES trace_plants(id) ON DELETE RESTRICT,
      weight_ticket_id UUID UNIQUE NOT NULL REFERENCES weight_tickets(id) ON DELETE RESTRICT,
      root_lot_id UUID REFERENCES trace_lots(id) ON DELETE RESTRICT,
      status VARCHAR(40) NOT NULL DEFAULT 'WEIGHED',
      title VARCHAR(260),
      version BIGINT NOT NULL DEFAULT 1,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id,company_id,dossier_no)
    );

    CREATE TABLE IF NOT EXISTS trace_intake_quality_checks (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      dossier_id UUID NOT NULL REFERENCES trace_dossiers(id) ON DELETE CASCADE,
      weight_ticket_id UUID NOT NULL REFERENCES weight_tickets(id) ON DELETE RESTRICT,
      check_no VARCHAR(100) NOT NULL,
      check_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      result VARCHAR(30) NOT NULL,
      moisture_percent NUMERIC(8,4),
      impurity_percent NUMERIC(8,4),
      laboratory_reference VARCHAR(180),
      notes TEXT,
      checked_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id,company_id,check_no)
    );

    CREATE TABLE IF NOT EXISTS trace_dossier_documents (
      id UUID PRIMARY KEY,
      dossier_id UUID NOT NULL REFERENCES trace_dossiers(id) ON DELETE CASCADE,
      document_type VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id UUID NOT NULL,
      document_no VARCHAR(140),
      document_date DATE,
      sequence_no INTEGER NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'POSTED',
      title VARCHAR(260) NOT NULL,
      snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(dossier_id,document_type,entity_id)
    );

    CREATE TABLE IF NOT EXISTS trace_dossier_lots (
      dossier_id UUID NOT NULL REFERENCES trace_dossiers(id) ON DELETE CASCADE,
      lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE RESTRICT,
      relation_type VARCHAR(40) NOT NULL DEFAULT 'OUTPUT',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(dossier_id,lot_id)
    );

    CREATE TABLE IF NOT EXISTS trace_lot_lineage (
      parent_lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE RESTRICT,
      child_lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE RESTRICT,
      process_order_id UUID REFERENCES process_orders(id) ON DELETE SET NULL,
      input_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(parent_lot_id,child_lot_id)
    );

    ALTER TABLE weight_tickets ADD COLUMN IF NOT EXISTS plant_id UUID REFERENCES trace_plants(id) ON DELETE RESTRICT;
    ALTER TABLE weight_tickets ADD COLUMN IF NOT EXISTS trace_dossier_id UUID REFERENCES trace_dossiers(id) ON DELETE RESTRICT;
    ALTER TABLE weight_tickets ADD COLUMN IF NOT EXISTS packaging_unit VARCHAR(40) NOT NULL DEFAULT 'thasë';

    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS trace_dossier_id UUID REFERENCES trace_dossiers(id) ON DELETE RESTRICT;
    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS display_label VARCHAR(300);
    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS packaging_count NUMERIC(18,3) NOT NULL DEFAULT 0;
    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS packaging_unit VARCHAR(40) NOT NULL DEFAULT 'thasë';
    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS sales_lot_number VARCHAR(180);

    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS trace_dossier_id UUID REFERENCES trace_dossiers(id) ON DELETE SET NULL;
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS packaging_count NUMERIC(18,3) NOT NULL DEFAULT 0;
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS packaging_unit VARCHAR(40) NOT NULL DEFAULT 'thasë';
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS supplier_code_snapshot VARCHAR(80);
    ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS trace_dossier_id UUID REFERENCES trace_dossiers(id) ON DELETE SET NULL;
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS trace_dossier_id UUID REFERENCES trace_dossiers(id) ON DELETE SET NULL;
    ALTER TABLE IF EXISTS finance_documents ADD COLUMN IF NOT EXISTS trace_dossier_id UUID REFERENCES trace_dossiers(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_trace_plants_farm ON trace_plants(tenant_id,company_id,farm_id,active,name);
    CREATE INDEX IF NOT EXISTS idx_trace_dossiers_scope ON trace_dossiers(tenant_id,company_id,status,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_trace_dossier_docs ON trace_dossier_documents(dossier_id,sequence_no,created_at);
    CREATE INDEX IF NOT EXISTS idx_trace_dossier_lots_lot ON trace_dossier_lots(lot_id,dossier_id);
    CREATE INDEX IF NOT EXISTS idx_trace_lineage_child ON trace_lot_lineage(child_lot_id,parent_lot_id);
  `);
}

export function installPhase62TraceabilityDossierRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant }) {
  const plantSchema = z.object({
    companyId:z.string().uuid(), farmId:z.string().uuid(), productId:z.string().uuid().nullable().optional(), code:z.string().trim().min(1).max(80),
    name:z.string().trim().min(1).max(220), botanicalName:z.string().trim().max(220).optional().default(''), localName:z.string().trim().max(220).optional().default(''),
    plantPart:z.string().trim().max(140).optional().default(''), organicStatus:z.string().trim().max(80).optional().default(''), certificateNo:z.string().trim().max(140).optional().default(''),
    harvestSeason:z.string().trim().max(140).optional().default(''), notes:z.string().trim().max(2000).optional().default(''), active:z.boolean().optional().default(true),
  });
  const openDossierSchema = z.object({
    farmId:z.string().uuid(), parcelId:z.string().uuid().nullable().optional(), plantId:z.string().uuid(), packagingUnit:z.string().trim().min(1).max(40).default('thasë'),
  });
  const intakeQualitySchema = z.object({
    result:z.enum(QUALITY_RESULTS), moisturePercent:z.coerce.number().min(0).max(100).nullable().optional(), impurityPercent:z.coerce.number().min(0).max(100).nullable().optional(),
    laboratoryReference:z.string().trim().max(180).optional().default(''), notes:z.string().trim().max(2000).optional().default(''),
  });
  const invoiceSchema = z.object({ documentNo:z.string().trim().max(100).optional().default(''), documentDate:z.string().date().optional(), notes:z.string().trim().max(2000).optional().default('') });
  const receiptSchema = z.object({ documentNo:z.string().trim().max(100).optional().default(''), documentDate:z.string().date().optional(), notes:z.string().trim().max(2000).optional().default('') });
  const processSchema = z.object({ processStep:z.string().trim().min(1).max(100), packagingCount:z.coerce.number().min(0), packagingUnit:z.string().trim().min(1).max(40), notes:z.string().trim().max(2000).optional().default('') });
  const finalSaleSchema = z.object({ salesOrderId:z.string().uuid(), notes:z.string().trim().max(1000).optional().default('') });
  const linkDocumentSchema = z.object({
    documentType:z.string().trim().min(1).max(80), entityType:z.string().trim().min(1).max(80), entityId:z.string().uuid(), documentNo:z.string().trim().max(140).optional().default(''),
    documentDate:z.string().date().nullable().optional(), status:z.string().trim().max(40).optional().default('POSTED'), title:z.string().trim().min(1).max(260), snapshot:z.record(z.any()).optional().default({}), metadata:z.record(z.any()).optional().default({}),
  });

  app.get('/api/trace/workflow/plants', authRequired, async (req,res,next) => {
    try {
      const companyIds = await accessibleCompanyIds(req.user);
      if (!companyIds.length) return res.json([]);
      const { rows } = await pool.query(`SELECT tp.*,f.code AS farm_code,f.name AS farm_name,bp.code AS supplier_code,bp.name AS supplier_name,p.code AS product_code,p.name AS product_name
        FROM trace_plants tp JOIN trace_farms f ON f.id=tp.farm_id LEFT JOIN business_partners bp ON bp.id=f.supplier_id LEFT JOIN products p ON p.id=tp.product_id
        WHERE tp.tenant_id=$1 AND tp.company_id=ANY($2::uuid[]) ORDER BY tp.active DESC,f.name,tp.name`, [req.user.tenant_id, companyIds]);
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.post('/api/trace/workflow/plants', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = plantSchema.parse(req.body);
      await client.query('BEGIN');
      await assertCompanyAccess(req.user,input.companyId,client);
      const farmResult = await client.query(`SELECT * FROM trace_farms WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [input.farmId,req.user.tenant_id,input.companyId]);
      if (!farmResult.rowCount) throw requestError('Ferma nuk është e vlefshme.');
      if (input.productId) {
        const product = await client.query(`SELECT id FROM products WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [input.productId,req.user.tenant_id,input.companyId]);
        if (!product.rowCount) throw requestError('Artikulli i lidhur nuk është i vlefshëm.');
      }
      const id = randomUUID();
      const { rows } = await client.query(`INSERT INTO trace_plants(id,tenant_id,company_id,farm_id,product_id,code,name,botanical_name,local_name,plant_part,organic_status,certificate_no,harvest_season,active,notes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`, [id,req.user.tenant_id,input.companyId,input.farmId,input.productId||null,input.code.toUpperCase(),input.name,input.botanicalName||null,input.localName||null,input.plantPart||null,input.organicStatus||null,input.certificateNo||null,input.harvestSeason||null,input.active,input.notes||null,req.user.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'TRACE_PLANT_CREATE',entityType:'trace_plant',entityId:id,companyId:input.companyId,metadata:{farmId:input.farmId,code:input.code,name:input.name},ip:req.ip},client);
      await addChange(client,req.user,input.companyId,'trace_plant',id,'CREATE',{farmId:input.farmId,code:input.code});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'tracePlants',{action:'created',id});
      res.status(201).json(rows[0]);
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.get('/api/trace/workflow/dossiers', authRequired, async (req,res,next) => {
    try {
      const companyIds = await accessibleCompanyIds(req.user);
      if (!companyIds.length) return res.json([]);
      const { rows } = await pool.query(`SELECT td.*,bp.code AS supplier_code,bp.name AS supplier_name,f.code AS farm_code,f.name AS farm_name,
        pa.code AS parcel_code,pa.name AS parcel_name,tp.code AS plant_code,tp.name AS plant_name,wt.document_no AS weight_document_no,
        l.lot_number,l.display_label,l.sales_lot_number
        FROM trace_dossiers td JOIN business_partners bp ON bp.id=td.supplier_id JOIN trace_farms f ON f.id=td.farm_id
        LEFT JOIN trace_parcels pa ON pa.id=td.parcel_id JOIN trace_plants tp ON tp.id=td.plant_id
        JOIN weight_tickets wt ON wt.id=td.weight_ticket_id LEFT JOIN trace_lots l ON l.id=td.root_lot_id
        WHERE td.tenant_id=$1 AND td.company_id=ANY($2::uuid[]) ORDER BY td.created_at DESC`, [req.user.tenant_id,companyIds]);
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.post('/api/trace/workflow/weights/:id/open-dossier', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = openDossierSchema.parse(req.body);
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const { weight, dossier:existing } = await ensureWeightAndDossier(client,req.user,req.params.id,true);
      await assertCompanyAccess(req.user,weight.company_id,client);
      if (weight.status !== 'DRAFT') throw requestError('Dosja hapet nga Formulari i Peshës Draft.',409);
      const origin = await client.query(`SELECT f.*,pa.id AS matched_parcel FROM trace_farms f LEFT JOIN trace_parcels pa ON pa.farm_id=f.id AND pa.id=$2
        WHERE f.id=$1 AND f.tenant_id=$3 AND f.company_id=$4 AND f.active=TRUE`, [input.farmId,input.parcelId||null,req.user.tenant_id,weight.company_id]);
      if (!origin.rowCount || (input.parcelId && !origin.rows[0].matched_parcel)) throw requestError('Ferma/Parcela nuk është e vlefshme.');
      if (origin.rows[0].supplier_id && origin.rows[0].supplier_id !== weight.supplier_id) throw requestError('Ferma nuk i përket fermerit/furnitorit të peshimit.');
      const plantResult = await client.query(`SELECT * FROM trace_plants WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND farm_id=$4 AND active=TRUE`, [input.plantId,req.user.tenant_id,weight.company_id,input.farmId]);
      const plant = plantResult.rows[0];
      if (!plant) throw requestError('Bima nuk i përket fermës së zgjedhur.');
      if (plant.product_id && plant.product_id !== weight.product_id) throw requestError('Bima është lidhur me një artikull tjetër.');

      let dossier = existing;
      if (!dossier) {
        const dossierNo = await nextDocumentNo(client,req.user.tenant_id,weight.company_id,'DOS',weight.document_date);
        const dossierId = randomUUID();
        const title = `${weight.supplier_code} · ${plant.name} · ${weight.document_no}`;
        const { rows } = await client.query(`INSERT INTO trace_dossiers(id,tenant_id,company_id,dossier_no,supplier_id,farm_id,parcel_id,plant_id,weight_ticket_id,status,title,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'WEIGHED',$10,$11) RETURNING *`, [dossierId,req.user.tenant_id,weight.company_id,dossierNo,weight.supplier_id,input.farmId,input.parcelId||null,input.plantId,weight.id,title,req.user.id]);
        dossier = rows[0];
      } else {
        const { rows } = await client.query(`UPDATE trace_dossiers SET farm_id=$1,parcel_id=$2,plant_id=$3,title=$4,version=version+1,updated_at=NOW() WHERE id=$5 RETURNING *`, [input.farmId,input.parcelId||null,input.plantId,`${weight.supplier_code} · ${plant.name} · ${weight.document_no}`,dossier.id]);
        dossier = rows[0];
      }
      await client.query(`UPDATE weight_tickets SET farm_id=$1,parcel_id=$2,plant_id=$3,trace_dossier_id=$4,packaging_unit=$5,updated_at=NOW() WHERE id=$6`, [input.farmId,input.parcelId||null,input.plantId,dossier.id,input.packagingUnit,weight.id]);
      await addDossierDocument(client,{dossierId:dossier.id,documentType:'WEIGHT_FORM',entityType:'weight_ticket',entityId:weight.id,documentNo:weight.document_no,documentDate:weight.document_date,title:'Formulari i Peshës',status:'DRAFT',snapshot:{supplierCode:weight.supplier_code,supplierName:weight.supplier_name,productCode:weight.product_code,productName:weight.product_name,bagsCount:num(weight.bags_count),packagingUnit:input.packagingUnit,grossWeight:num(weight.gross_weight),packagingWeight:num(weight.packaging_weight),netWeight:num(weight.accepted_weight),unitPrice:num(weight.unit_price),totalValue:num(weight.total_value),farmName:origin.rows[0].name,plantName:plant.name},createdBy:req.user.id});
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'TRACE_DOSSIER_OPEN',entityType:'trace_dossier',entityId:dossier.id,companyId:weight.company_id,metadata:{dossierNo:dossier.dossier_no,weightTicketId:weight.id,plantId:input.plantId},ip:req.ip},client);
      await addChange(client,req.user,weight.company_id,'trace_dossier',dossier.id,'UPSERT',{status:'WEIGHED',weightTicketId:weight.id});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'traceDossiers',{action:'upserted',id:dossier.id});
      res.status(existing?200:201).json(dossier);
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/trace/workflow/weights/:id/quality', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = intakeQualitySchema.parse(req.body);
      await client.query('BEGIN');
      const { weight, dossier } = await ensureWeightAndDossier(client,req.user,req.params.id,true);
      await assertCompanyAccess(req.user,weight.company_id,client);
      if (!dossier) throw requestError('Ruani Formularin e Peshës dhe hapni dosjen para kontrollit të cilësisë.',409);
      if (weight.status !== 'DRAFT') throw requestError('Kontrolli i pranimit bëhet para Fletë-Hyrjes.',409);
      const checkNo = await nextDocumentNo(client,req.user.tenant_id,weight.company_id,'QC',weight.document_date);
      const id = randomUUID();
      const { rows } = await client.query(`INSERT INTO trace_intake_quality_checks(id,tenant_id,company_id,dossier_id,weight_ticket_id,check_no,result,moisture_percent,impurity_percent,laboratory_reference,notes,checked_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [id,req.user.tenant_id,weight.company_id,dossier.id,weight.id,checkNo,input.result,input.moisturePercent??null,input.impurityPercent??null,input.laboratoryReference||null,input.notes||null,req.user.id]);
      const dossierStatus = input.result === 'APPROVED' ? 'QUALITY_APPROVED' : input.result === 'REJECTED' ? 'QUALITY_REJECTED' : 'QUALITY_PENDING';
      await client.query(`UPDATE trace_dossiers SET status=$1,version=version+1,updated_at=NOW() WHERE id=$2`, [dossierStatus,dossier.id]);
      await client.query(`UPDATE weight_tickets SET quality_status=$1,updated_at=NOW() WHERE id=$2`, [input.result,weight.id]);
      await addDossierDocument(client,{dossierId:dossier.id,documentType:'INTAKE_QUALITY',entityType:'trace_intake_quality_check',entityId:id,documentNo:checkNo,documentDate:String(weight.document_date).slice(0,10),title:'Kontroll Cilësie në Pranim',status:input.result,snapshot:{result:input.result,moisturePercent:input.moisturePercent,impurityPercent:input.impurityPercent,laboratoryReference:input.laboratoryReference,notes:input.notes},createdBy:req.user.id});
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'INTAKE_QUALITY_CHECK',entityType:'trace_dossier',entityId:dossier.id,companyId:weight.company_id,metadata:{checkNo,result:input.result,weightTicketId:weight.id},ip:req.ip},client);
      await addChange(client,req.user,weight.company_id,'trace_dossier',dossier.id,'STATUS',{status:dossierStatus,checkNo});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'traceDossiers',{action:'quality',id:dossier.id,status:dossierStatus});
      res.status(201).json({...rows[0],dossierStatus});
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/trace/workflow/weights/:id/purchase-invoice', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = invoiceSchema.parse(req.body);
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const { weight, dossier } = await ensureWeightAndDossier(client,req.user,req.params.id,true);
      await assertCompanyAccess(req.user,weight.company_id,client);
      if (!dossier) throw requestError('Dosja e gjurmueshmërisë mungon.',409);
      const approved = await client.query(`SELECT * FROM trace_intake_quality_checks WHERE dossier_id=$1 AND result='APPROVED' ORDER BY check_date DESC LIMIT 1`, [dossier.id]);
      if (!approved.rowCount) throw requestError('Fatura e blerjes krijohet vetëm pas Kontrollit të Cilësisë të aprovuar.',409);
      const duplicate = await client.query(`SELECT * FROM business_documents WHERE trace_dossier_id=$1 AND doc_type='PURCHASE_INVOICE' AND status<>'CANCELLED' LIMIT 1`, [dossier.id]);
      if (duplicate.rowCount) return res.json(duplicate.rows[0]);
      const documentDate = input.documentDate || String(weight.document_date).slice(0,10);
      const documentNo = input.documentNo || await nextDocumentNo(client,req.user.tenant_id,weight.company_id,'FB',documentDate);
      const id = randomUUID();
      const total = num(weight.total_value);
      await client.query(`INSERT INTO business_documents(id,tenant_id,company_id,warehouse_id,partner_id,doc_type,document_no,document_date,status,notes,total_net,total_vat,total_amount,created_by,confirmed_at,trace_dossier_id)
        VALUES($1,$2,$3,$4,$5,'PURCHASE_INVOICE',$6,$7,'CONFIRMED',$8,$9,0,$9,$10,NOW(),$11)`, [id,req.user.tenant_id,weight.company_id,weight.warehouse_id,weight.supplier_id,documentNo,documentDate,input.notes||`Faturë blerje nga ${weight.document_no}`,total,req.user.id,dossier.id]);
      await client.query(`INSERT INTO business_document_items(id,document_id,product_id,description,unit,coefficient,quantity,free_quantity,unit_price,vat_rate,line_net,line_vat,line_total)
        VALUES($1,$2,$3,$4,$5,1,$6,0,$7,0,$8,0,$8)`, [randomUUID(),id,weight.product_id,weight.product_name,weight.base_unit||'kg',num(weight.accepted_weight),num(weight.unit_price),total]);
      await client.query(`UPDATE trace_dossiers SET status='PURCHASE_INVOICED',version=version+1,updated_at=NOW() WHERE id=$1`, [dossier.id]);
      await addDossierDocument(client,{dossierId:dossier.id,documentType:'PURCHASE_INVOICE',entityType:'business_document',entityId:id,documentNo,documentDate,title:'Faturë Blerje',snapshot:{supplierCode:weight.supplier_code,supplierName:weight.supplier_name,productName:weight.product_name,quantity:num(weight.accepted_weight),unitPrice:num(weight.unit_price),total},createdBy:req.user.id});
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'TRACE_PURCHASE_INVOICE_CREATE',entityType:'business_document',entityId:id,companyId:weight.company_id,metadata:{documentNo,dossierId:dossier.id,weightTicketId:weight.id},ip:req.ip},client);
      await addChange(client,req.user,weight.company_id,'business_document',id,'POST',{docType:'PURCHASE_INVOICE',documentNo,dossierId:dossier.id});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'documents',{action:'confirmed',id,docType:'PURCHASE_INVOICE'});
      emitTenant(req.user.tenant_id,'traceDossiers',{action:'status',id:dossier.id,status:'PURCHASE_INVOICED'});
      res.status(201).json({id,documentNo,documentDate,status:'CONFIRMED',dossierId:dossier.id});
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/trace/workflow/weights/:id/receipt', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = receiptSchema.parse(req.body);
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const { weight, dossier } = await ensureWeightAndDossier(client,req.user,req.params.id,true);
      await assertCompanyAccess(req.user,weight.company_id,client);
      if (!dossier) throw requestError('Dosja e gjurmueshmërisë mungon.',409);
      if (weight.status !== 'DRAFT' || weight.lot_id) throw requestError('Fletë-Hyrja dhe loti janë krijuar më parë.',409);
      const approved = await client.query(`SELECT * FROM trace_intake_quality_checks WHERE dossier_id=$1 AND result='APPROVED' ORDER BY check_date DESC LIMIT 1`, [dossier.id]);
      if (!approved.rowCount) throw requestError('Fletë-Hyrja krijohet vetëm pas Kontrollit të Cilësisë të aprovuar.',409);
      const invoice = await client.query(`SELECT * FROM business_documents WHERE trace_dossier_id=$1 AND doc_type='PURCHASE_INVOICE' AND status='CONFIRMED' ORDER BY created_at DESC LIMIT 1`, [dossier.id]);
      if (!invoice.rowCount) throw requestError('Krijoni Faturën e Blerjes para Fletë-Hyrjes.',409);
      const documentDate = input.documentDate || String(weight.document_date).slice(0,10);
      const documentNo = input.documentNo || await nextDocumentNo(client,req.user.tenant_id,weight.company_id,'FH',documentDate);
      const lotNumber = await uniqueRawLotNumber(client,req.user.tenant_id,weight.company_id,{supplierCode:weight.supplier_code,documentDate,packageCount:num(weight.bags_count),packageUnit:weight.packaging_unit,netKg:num(weight.accepted_weight)});
      const label = rawLabel({supplierCode:weight.supplier_code,productName:weight.product_name,packageCount:num(weight.bags_count),packageUnit:weight.packaging_unit,netKg:num(weight.accepted_weight)});
      const receiptId = randomUUID();
      const lotId = randomUUID();
      const total = num(weight.total_value);
      const quantity = num(weight.accepted_weight);
      await client.query(`INSERT INTO business_documents(id,tenant_id,company_id,warehouse_id,partner_id,doc_type,document_no,document_date,status,notes,total_net,total_vat,total_amount,created_by,confirmed_at,trace_dossier_id)
        VALUES($1,$2,$3,$4,$5,'PURCHASE_RECEIPT',$6,$7,'CONFIRMED',$8,$9,0,$9,$10,NOW(),$11)`, [receiptId,req.user.tenant_id,weight.company_id,weight.warehouse_id,weight.supplier_id,documentNo,documentDate,input.notes||`Fletë-Hyrje nga ${weight.document_no}`,total,req.user.id,dossier.id]);
      await client.query(`INSERT INTO business_document_items(id,document_id,product_id,description,unit,coefficient,quantity,free_quantity,unit_price,vat_rate,line_net,line_vat,line_total)
        VALUES($1,$2,$3,$4,$5,1,$6,0,$7,0,$8,0,$8)`, [randomUUID(),receiptId,weight.product_id,weight.product_name,weight.base_unit||'kg',quantity,num(weight.unit_price),total]);
      await client.query(`INSERT INTO trace_lots(id,tenant_id,company_id,warehouse_id,product_id,supplier_id,farm_id,parcel_id,source_weight_ticket_id,source_document_id,lot_number,lot_type,status,quality_status,harvest_date,production_date,quantity_created,quantity_available,quantity_consumed,base_unit,unit_cost,botanical_name,plant_part,location_text,notes,created_by,trace_dossier_id,display_label,packaging_count,packaging_unit)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'RAW','AVAILABLE','APPROVED',$12,$13,$14,$14,0,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`, [lotId,req.user.tenant_id,weight.company_id,weight.warehouse_id,weight.product_id,weight.supplier_id,dossier.farm_id,dossier.parcel_id,weight.id,receiptId,lotNumber,weight.harvest_date||documentDate,documentDate,quantity,weight.base_unit||'kg',num(weight.unit_price),weight.botanical_name||null,weight.plant_part||null,[weight.farm_name,weight.parcel_name].filter(Boolean).join(' / '),input.notes||weight.notes||null,req.user.id,dossier.id,label,num(weight.bags_count),weight.packaging_unit]);
      await client.query(`INSERT INTO trace_dossier_lots(dossier_id,lot_id,relation_type) VALUES($1,$2,'ROOT') ON CONFLICT DO NOTHING`, [dossier.id,lotId]);
      await client.query(`INSERT INTO trace_lot_movements(id,tenant_id,company_id,lot_id,warehouse_id,product_id,movement_type,quantity,balance_after,source_document_type,source_document_id,source_document_no,metadata,created_by)
        VALUES($1,$2,$3,$4,$5,$6,'RECEIPT_IN',$7,$7,'PURCHASE_RECEIPT',$8,$9,$10::jsonb,$11)`, [randomUUID(),req.user.tenant_id,weight.company_id,lotId,weight.warehouse_id,weight.product_id,quantity,receiptId,documentNo,JSON.stringify({dossierId:dossier.id,weightTicketId:weight.id,invoiceId:invoice.rows[0].id,label}),req.user.id]);
      await client.query(`INSERT INTO stock_movements(id,tenant_id,company_id,warehouse_id,product_id,movement_type,quantity_base,unit_cost,reference_type,reference_id,reference_no,created_by)
        VALUES($1,$2,$3,$4,$5,'PURCHASE_RECEIPT',$6,$7,'business_document',$8,$9,$10)`, [randomUUID(),req.user.tenant_id,weight.company_id,weight.warehouse_id,weight.product_id,quantity,num(weight.unit_price),receiptId,documentNo,req.user.id]);
      await client.query(`UPDATE weight_tickets SET status='CONFIRMED',quality_status='APPROVED',lot_id=$1,receipt_document_id=$2,posted_by=$3,confirmed_at=NOW(),updated_at=NOW() WHERE id=$4`, [lotId,receiptId,req.user.id,weight.id]);
      await client.query(`UPDATE trace_dossiers SET root_lot_id=$1,status='RECEIVED',version=version+1,updated_at=NOW() WHERE id=$2`, [lotId,dossier.id]);
      await addDossierDocument(client,{dossierId:dossier.id,documentType:'PURCHASE_RECEIPT',entityType:'business_document',entityId:receiptId,documentNo,documentDate,title:'Fletë-Hyrje',snapshot:{supplierCode:weight.supplier_code,supplierName:weight.supplier_name,productName:weight.product_name,quantity,unitPrice:num(weight.unit_price),total,lotNumber,label},createdBy:req.user.id});
      await addDossierDocument(client,{dossierId:dossier.id,documentType:'LOT_LABEL',entityType:'trace_lot',entityId:lotId,documentNo:lotNumber,documentDate,title:'Etiketa e Lotit RAW',snapshot:{lotNumber,label,supplierCode:weight.supplier_code,productName:weight.product_name,packageCount:num(weight.bags_count),packageUnit:weight.packaging_unit,netWeight:quantity},createdBy:req.user.id});
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'TRACE_RECEIPT_RAW_LOT_CREATE',entityType:'trace_dossier',entityId:dossier.id,companyId:weight.company_id,metadata:{receiptDocumentNo:documentNo,lotNumber,label,quantity},ip:req.ip},client);
      await addChange(client,req.user,weight.company_id,'trace_lot',lotId,'CREATE',{lotNumber,label,dossierId:dossier.id,quantity});
      await addChange(client,req.user,weight.company_id,'trace_dossier',dossier.id,'STATUS',{status:'RECEIVED',lotId,receiptId});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'traceLots',{action:'created',id:lotId,lotNumber});
      emitTenant(req.user.tenant_id,'traceDossiers',{action:'status',id:dossier.id,status:'RECEIVED'});
      emitTenant(req.user.tenant_id,'stock',{action:'changed',productId:weight.product_id,warehouseId:weight.warehouse_id});
      res.status(201).json({dossierId:dossier.id,receipt:{id:receiptId,documentNo},lot:{id:lotId,lotNumber,label,quantity,status:'AVAILABLE'}});
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/trace/workflow/processes/:id/register', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = processSchema.parse(req.body);
      await client.query('BEGIN');
      const processResult = await client.query(`SELECT po.*,p.name AS output_product_name,p.code AS output_product_code,l.lot_number AS output_lot_number,l.quantity_created AS output_lot_quantity
        FROM process_orders po JOIN products p ON p.id=po.output_product_id LEFT JOIN trace_lots l ON l.id=po.output_lot_id
        WHERE po.id=$1 AND po.tenant_id=$2 FOR UPDATE`, [req.params.id,req.user.tenant_id]);
      const process = processResult.rows[0];
      if (!process) throw requestError('Procesi nuk u gjet.',404);
      await assertCompanyAccess(req.user,process.company_id,client);
      if (process.status !== 'POSTED' || !process.output_lot_id) throw requestError('Procesi duhet të jetë i postuar dhe të ketë lot dalje.',409);
      const inputs = await client.query(`SELECT poi.quantity,l.*,bp.code AS supplier_code FROM process_order_inputs poi JOIN trace_lots l ON l.id=poi.lot_id LEFT JOIN business_partners bp ON bp.id=l.supplier_id WHERE poi.process_order_id=$1`, [process.id]);
      if (!inputs.rowCount) throw requestError('Procesi nuk ka lote hyrëse.',409);
      const supplierCodes = [...new Set(inputs.rows.map((row) => row.supplier_code).filter(Boolean))];
      const supplierCode = supplierCodes.length === 1 ? supplierCodes[0] : 'MIX';
      const dossierIdsResult = await client.query(`SELECT DISTINCT dl.dossier_id FROM trace_dossier_lots dl WHERE dl.lot_id=ANY($1::uuid[])`, [inputs.rows.map((row) => row.id)]);
      const dossierIds = dossierIdsResult.rows.map((row) => row.dossier_id);
      if (!dossierIds.length) throw requestError('Lotet hyrëse nuk janë të lidhura me dosje gjurmueshmërie.',409);
      const outputLabel = `${supplierCode}-${process.output_product_name}-${formatQuantity(input.packagingCount)} ${input.packagingUnit}-${formatQuantity(process.output_lot_quantity)} kg`;
      await client.query(`UPDATE process_orders SET packaging_count=$1,packaging_unit=$2,supplier_code_snapshot=$3,trace_dossier_id=$4,notes=CASE WHEN $5='' THEN notes ELSE CONCAT_WS(E'\n',notes,$5) END,updated_at=NOW() WHERE id=$6`, [input.packagingCount,input.packagingUnit,supplierCode,dossierIds.length===1?dossierIds[0]:null,input.notes,process.id]);
      await client.query(`UPDATE trace_lots SET display_label=$1,packaging_count=$2,packaging_unit=$3,trace_dossier_id=$4,updated_at=NOW() WHERE id=$5`, [outputLabel,input.packagingCount,input.packagingUnit,dossierIds.length===1?dossierIds[0]:null,process.output_lot_id]);
      for (const row of inputs.rows) {
        await client.query(`INSERT INTO trace_lot_lineage(parent_lot_id,child_lot_id,process_order_id,input_quantity) VALUES($1,$2,$3,$4)
          ON CONFLICT(parent_lot_id,child_lot_id) DO UPDATE SET process_order_id=EXCLUDED.process_order_id,input_quantity=EXCLUDED.input_quantity`, [row.id,process.output_lot_id,process.id,num(row.quantity)]);
      }
      for (const dossierId of dossierIds) {
        await client.query(`INSERT INTO trace_dossier_lots(dossier_id,lot_id,relation_type) VALUES($1,$2,'PROCESS_OUTPUT') ON CONFLICT DO NOTHING`, [dossierId,process.output_lot_id]);
        await client.query(`UPDATE trace_dossiers SET status='IN_PROCESS',version=version+1,updated_at=NOW() WHERE id=$1`, [dossierId]);
        await addDossierDocument(client,{dossierId,documentType:'PROCESS_ORDER',entityType:'process_order',entityId:process.id,documentNo:process.work_order_no,documentDate:process.order_date,title:`Proces ${input.processStep}`,snapshot:{processStep:input.processStep,processType:process.process_type,inputLots:inputs.rows.map((row)=>({lotNumber:row.lot_number,quantity:num(row.quantity)})),outputLotNumber:process.output_lot_number,outputProduct:process.output_product_name,outputQuantity:num(process.output_lot_quantity),packagingCount:input.packagingCount,packagingUnit:input.packagingUnit,outputLabel},createdBy:req.user.id});
      }
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'TRACE_PROCESS_REGISTER',entityType:'process_order',entityId:process.id,companyId:process.company_id,metadata:{dossierIds,outputLotId:process.output_lot_id,processStep:input.processStep,outputLabel},ip:req.ip},client);
      await addChange(client,req.user,process.company_id,'process_order',process.id,'TRACE_REGISTER',{dossierIds,outputLotId:process.output_lot_id});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'traceDossiers',{action:'process',ids:dossierIds,processId:process.id});
      res.json({processId:process.id,dossierIds,outputLotId:process.output_lot_id,outputLabel});
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/trace/workflow/lots/:id/finalize-sale', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = finalSaleSchema.parse(req.body);
      await client.query('BEGIN');
      const lotResult = await client.query(`SELECT l.*,p.name AS product_name FROM trace_lots l JOIN products p ON p.id=l.product_id WHERE l.id=$1 AND l.tenant_id=$2 FOR UPDATE`, [req.params.id,req.user.tenant_id]);
      const lot = lotResult.rows[0];
      if (!lot) throw requestError('Loti nuk u gjet.',404);
      await assertCompanyAccess(req.user,lot.company_id,client);
      const orderResult = await client.query(`SELECT d.*,bp.name AS customer_name FROM business_documents d JOIN business_partners bp ON bp.id=d.partner_id
        WHERE d.id=$1 AND d.tenant_id=$2 AND d.company_id=$3 AND d.doc_type='SALES_ORDER'`, [input.salesOrderId,req.user.tenant_id,lot.company_id]);
      const order = orderResult.rows[0];
      if (!order) throw requestError('Porosia e klientit nuk u gjet.',404);
      const ancestors = await client.query(`WITH RECURSIVE ancestry(id) AS (
          SELECT $1::uuid UNION SELECT ll.parent_lot_id FROM trace_lot_lineage ll JOIN ancestry a ON a.id=ll.child_lot_id
        ) SELECT COUNT(DISTINCT id)-1 AS input_count FROM ancestry`, [lot.id]);
      const inputCount = Math.max(1,Number(ancestors.rows[0].input_count||0));
      const salesLotNumber = `${normalizeToken(order.document_no,'POR')}-${albanianDate(order.document_date)}-L${inputCount}`;
      await client.query(`UPDATE trace_lots SET sales_lot_number=$1,updated_at=NOW() WHERE id=$2`, [salesLotNumber,lot.id]);
      const dossiers = await client.query(`SELECT dossier_id FROM trace_dossier_lots WHERE lot_id=$1`, [lot.id]);
      for (const row of dossiers.rows) {
        await client.query(`UPDATE trace_dossiers SET status='SALES_ORDERED',version=version+1,updated_at=NOW() WHERE id=$1`, [row.dossier_id]);
        await addDossierDocument(client,{dossierId:row.dossier_id,documentType:'SALES_ORDER',entityType:'business_document',entityId:order.id,documentNo:order.document_no,documentDate:order.document_date,title:'Porosi Klienti / Loti Final',snapshot:{customerName:order.customer_name,orderNo:order.document_no,orderDate:order.document_date,finalLotNumber:salesLotNumber,inputLotCount:inputCount,productName:lot.product_name,quantity:num(lot.quantity_available),notes:input.notes},createdBy:req.user.id});
      }
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'TRACE_FINAL_SALES_LOT',entityType:'trace_lot',entityId:lot.id,companyId:lot.company_id,metadata:{salesLotNumber,salesOrderId:order.id,inputCount},ip:req.ip},client);
      await addChange(client,req.user,lot.company_id,'trace_lot',lot.id,'SALES_FINALIZE',{salesLotNumber,salesOrderId:order.id,inputCount});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'traceLots',{action:'salesFinalized',id:lot.id,salesLotNumber});
      res.json({lotId:lot.id,salesLotNumber,salesOrderId:order.id,inputLotCount:inputCount});
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/trace/workflow/dossiers/:id/link-document', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = linkDocumentSchema.parse(req.body);
      await client.query('BEGIN');
      const dossier = await assertDossier(client,req.user,req.params.id,assertCompanyAccess,true);
      await addDossierDocument(client,{dossierId:dossier.id,...input,createdBy:req.user.id});
      await addChange(client,req.user,dossier.company_id,'trace_dossier',dossier.id,'LINK_DOCUMENT',{documentType:input.documentType,entityId:input.entityId,documentNo:input.documentNo});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'traceDossiers',{action:'documentLinked',id:dossier.id});
      res.status(201).json({dossierId:dossier.id,linked:true});
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.get('/api/trace/workflow/dossiers/:id', authRequired, async (req,res,next) => {
    try {
      const dossier = await assertDossier(pool,req.user,req.params.id,assertCompanyAccess,false);
      const [header, documents, lots, lineage, quality, processes, shipments] = await Promise.all([
        pool.query(`SELECT td.*,bp.code AS supplier_code,bp.name AS supplier_name,bp.nipt AS supplier_nipt,f.code AS farm_code,f.name AS farm_name,
          pa.code AS parcel_code,pa.name AS parcel_name,tp.code AS plant_code,tp.name AS plant_name,tp.botanical_name,tp.local_name,tp.plant_part,
          wt.document_no AS weight_document_no,wt.document_date AS weight_document_date,wt.bags_count,wt.packaging_unit,wt.gross_weight,wt.packaging_weight,wt.accepted_weight,wt.unit_price,wt.total_value
          FROM trace_dossiers td JOIN business_partners bp ON bp.id=td.supplier_id JOIN trace_farms f ON f.id=td.farm_id LEFT JOIN trace_parcels pa ON pa.id=td.parcel_id
          JOIN trace_plants tp ON tp.id=td.plant_id JOIN weight_tickets wt ON wt.id=td.weight_ticket_id WHERE td.id=$1`, [dossier.id]),
        pool.query(`SELECT * FROM trace_dossier_documents WHERE dossier_id=$1 ORDER BY sequence_no,created_at`, [dossier.id]),
        pool.query(`SELECT l.*,p.code AS product_code,p.name AS product_name,w.name AS warehouse_name,dl.relation_type
          FROM trace_dossier_lots dl JOIN trace_lots l ON l.id=dl.lot_id JOIN products p ON p.id=l.product_id JOIN warehouses w ON w.id=l.warehouse_id
          WHERE dl.dossier_id=$1 ORDER BY l.created_at`, [dossier.id]),
        pool.query(`SELECT ll.*,p.lot_number AS parent_lot_number,c.lot_number AS child_lot_number,po.work_order_no
          FROM trace_lot_lineage ll JOIN trace_lots p ON p.id=ll.parent_lot_id JOIN trace_lots c ON c.id=ll.child_lot_id LEFT JOIN process_orders po ON po.id=ll.process_order_id
          WHERE ll.parent_lot_id IN (SELECT lot_id FROM trace_dossier_lots WHERE dossier_id=$1) OR ll.child_lot_id IN (SELECT lot_id FROM trace_dossier_lots WHERE dossier_id=$1)
          ORDER BY ll.created_at`, [dossier.id]),
        pool.query(`SELECT q.*,u.full_name AS checked_by_name FROM trace_intake_quality_checks q LEFT JOIN users u ON u.id=q.checked_by WHERE q.dossier_id=$1 ORDER BY q.check_date`, [dossier.id]),
        pool.query(`SELECT DISTINCT po.*,p.name AS output_product_name,l.lot_number AS output_lot_number,l.display_label AS output_label
          FROM process_orders po JOIN products p ON p.id=po.output_product_id LEFT JOIN trace_lots l ON l.id=po.output_lot_id
          WHERE po.trace_dossier_id=$1 OR po.output_lot_id IN (SELECT lot_id FROM trace_dossier_lots WHERE dossier_id=$1)
          OR po.id IN (SELECT poi.process_order_id FROM process_order_inputs poi WHERE poi.lot_id IN (SELECT lot_id FROM trace_dossier_lots WHERE dossier_id=$1))
          ORDER BY po.created_at`, [dossier.id]),
        pool.query(`SELECT DISTINCT s.*,bp.name AS customer_name,v.plate_no FROM export_shipments s JOIN export_shipment_items si ON si.shipment_id=s.id
          JOIN business_partners bp ON bp.id=s.customer_id LEFT JOIN logistics_vehicles v ON v.id=s.vehicle_id
          WHERE s.trace_dossier_id=$1 OR si.lot_id IN (SELECT lot_id FROM trace_dossier_lots WHERE dossier_id=$1) ORDER BY s.created_at`, [dossier.id]),
      ]);
      const timeline = documents.rows.map(camel);
      for (const process of processes.rows) {
        if (!timeline.some((item)=>item.entityId===process.id)) timeline.push({documentType:'PROCESS_ORDER',entityType:'process_order',entityId:process.id,documentNo:process.work_order_no,documentDate:process.order_date,title:`Proces: ${process.process_type}`,status:process.status,snapshot:camel(process),createdAt:process.created_at});
      }
      for (const shipment of shipments.rows) {
        if (!timeline.some((item)=>item.entityId===shipment.id)) timeline.push({documentType:'SHIPMENT',entityType:'export_shipment',entityId:shipment.id,documentNo:shipment.shipment_no,documentDate:shipment.departure_at,title:'Ngarkesa / Dërgesa',status:shipment.status,snapshot:camel(shipment),createdAt:shipment.created_at});
      }
      timeline.sort((a,b)=>new Date(a.createdAt||a.documentDate||0)-new Date(b.createdAt||b.documentDate||0));
      res.json({dossier:camel(header.rows[0]||dossier),documents:documents.rows.map(camel),timeline,lots:lots.rows.map(camel),lineage:lineage.rows.map(camel),qualityChecks:quality.rows.map(camel),processes:processes.rows.map(camel),shipments:shipments.rows.map(camel)});
    } catch (error) { next(error); }
  });

  app.get('/api/trace/workflow/lots/:id/dossier', authRequired, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT td.id FROM trace_dossiers td WHERE td.tenant_id=$2 AND (td.root_lot_id=$1 OR EXISTS(SELECT 1 FROM trace_dossier_lots dl WHERE dl.dossier_id=td.id AND dl.lot_id=$1)) ORDER BY td.created_at LIMIT 1`, [req.params.id,req.user.tenant_id]);
      if (!rows[0]) throw requestError('Dosja për këtë lot nuk u gjet.',404);
      res.json({dossierId:rows[0].id});
    } catch (error) { next(error); }
  });
}
