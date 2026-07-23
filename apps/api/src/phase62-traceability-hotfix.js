import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const WRITE_ROLES = ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','OPERATOR_PESHORE'];
const num = (value) => Number(value || 0);
const text = (value) => String(value ?? '').trim();

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function nextSequence(client, tenantId, companyId, key) {
  const { rows } = await client.query(`
    INSERT INTO trace_lot_sequences(tenant_id,company_id,sequence_key,last_value)
    VALUES($1,$2,$3,1)
    ON CONFLICT(tenant_id,company_id,sequence_key)
    DO UPDATE SET last_value=trace_lot_sequences.last_value+1,updated_at=NOW()
    RETURNING last_value`, [tenantId,companyId,key]);
  return Number(rows[0].last_value);
}

async function nextDocumentNo(client, tenantId, companyId, prefix, sourceDate) {
  const dateText = String(sourceDate || new Date().toISOString().slice(0,10)).slice(0,10);
  const year = dateText.slice(0,4);
  const value = await nextSequence(client,tenantId,companyId,`${prefix}-${year}`);
  return `${prefix}-${year}-${String(value).padStart(6,'0')}`;
}

async function addDossierDocument(client, input) {
  const sequenceResult = await client.query(`SELECT COALESCE(MAX(sequence_no),0)+1 AS next_no FROM trace_dossier_documents WHERE dossier_id=$1`, [input.dossierId]);
  const sequenceNo = Number(sequenceResult.rows[0].next_no || 1);
  await client.query(`INSERT INTO trace_dossier_documents(
      id,dossier_id,document_type,entity_type,entity_id,document_no,document_date,sequence_no,status,title,snapshot,metadata,created_by
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13)
    ON CONFLICT(dossier_id,document_type,entity_id)
    DO UPDATE SET document_no=EXCLUDED.document_no,document_date=EXCLUDED.document_date,status=EXCLUDED.status,title=EXCLUDED.title,
      snapshot=EXCLUDED.snapshot,metadata=EXCLUDED.metadata,updated_at=NOW()`, [
    randomUUID(),input.dossierId,input.documentType,input.entityType,input.entityId,input.documentNo||null,input.documentDate||null,sequenceNo,
    input.status||'POSTED',input.title||input.documentType,JSON.stringify(input.snapshot||{}),JSON.stringify(input.metadata||{}),input.createdBy||null,
  ]);
}

export async function migratePhase62TraceabilityHotfix(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS trace_weight_ticket_lines (
      id UUID PRIMARY KEY,
      weight_ticket_id UUID NOT NULL REFERENCES weight_tickets(id) ON DELETE CASCADE,
      line_no INTEGER NOT NULL,
      packaging_count NUMERIC(18,3) NOT NULL DEFAULT 0,
      gross_kg NUMERIC(18,6) NOT NULL DEFAULT 0,
      packaging_kg NUMERIC(18,6) NOT NULL DEFAULT 0,
      net_kg NUMERIC(18,6) NOT NULL DEFAULT 0,
      note VARCHAR(500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(weight_ticket_id,line_no),
      CHECK(packaging_count >= 0 AND gross_kg >= 0 AND packaging_kg >= 0 AND net_kg >= 0),
      CHECK(packaging_kg <= gross_kg + 0.000001)
    );
    CREATE INDEX IF NOT EXISTS idx_trace_weight_lines_ticket ON trace_weight_ticket_lines(weight_ticket_id,line_no);
  `);
}

export function installPhase62TraceabilityHotfixRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant }) {
  const lineSchema = z.object({
    packagingCount:z.coerce.number().min(0), grossKg:z.coerce.number().min(0), packagingKg:z.coerce.number().min(0), note:z.string().trim().max(500).optional().default(''),
  }).refine((line)=>line.packagingKg <= line.grossKg,{message:'Pesha e ambalazhit nuk mund të jetë më e madhe se pesha bruto.'});
  const linesSchema = z.object({ lines:z.array(lineSchema).min(1).max(500) });
  const openDossierSchema = z.object({
    farmId:z.string().uuid(), parcelId:z.string().uuid().nullable().optional(), plantId:z.string().uuid(), packagingUnit:z.string().trim().min(1).max(40).default('thasë'),
  });
  const plantUpdateSchema = z.object({
    farmId:z.string().uuid(), productId:z.string().uuid().nullable().optional(), code:z.string().trim().min(1).max(80), name:z.string().trim().min(1).max(220),
    botanicalName:z.string().trim().max(220).optional().default(''), localName:z.string().trim().max(220).optional().default(''), plantPart:z.string().trim().max(140).optional().default(''),
    organicStatus:z.string().trim().max(80).optional().default(''), certificateNo:z.string().trim().max(140).optional().default(''), harvestSeason:z.string().trim().max(140).optional().default(''),
    notes:z.string().trim().max(2000).optional().default(''), active:z.boolean().optional().default(true),
  });

  app.post('/api/trace/workflow/weights/:id/open-dossier', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = openDossierSchema.parse(req.body);
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const weightResult = await client.query(`SELECT wt.*,bp.code AS supplier_code,bp.name AS supplier_name,p.code AS product_code,p.name AS product_name,
          w.name AS warehouse_name,f.name AS farm_name,f.code AS farm_code,pa.name AS parcel_name,pa.code AS parcel_code,
          tp.name AS plant_name,tp.botanical_name,tp.plant_part
        FROM weight_tickets wt
        JOIN business_partners bp ON bp.id=wt.supplier_id
        JOIN products p ON p.id=wt.product_id
        JOIN warehouses w ON w.id=wt.warehouse_id
        LEFT JOIN trace_farms f ON f.id=wt.farm_id
        LEFT JOIN trace_parcels pa ON pa.id=wt.parcel_id
        LEFT JOIN trace_plants tp ON tp.id=wt.plant_id
        WHERE wt.id=$1 AND wt.tenant_id=$2 FOR UPDATE OF wt`, [req.params.id,req.user.tenant_id]);
      const weight = weightResult.rows[0];
      if (!weight) throw requestError('Formulari i peshës nuk u gjet.',404);
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

      let dossier = null;
      if (weight.trace_dossier_id) {
        const existingResult = await client.query(`SELECT * FROM trace_dossiers WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [weight.trace_dossier_id,req.user.tenant_id]);
        dossier = existingResult.rows[0] || null;
      }
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
      const linesResult = await client.query(`SELECT line_no,packaging_count,gross_kg,packaging_kg,net_kg,note FROM trace_weight_ticket_lines WHERE weight_ticket_id=$1 ORDER BY line_no`, [weight.id]);
      await addDossierDocument(client,{
        dossierId:dossier.id,documentType:'WEIGHT_FORM',entityType:'weight_ticket',entityId:weight.id,documentNo:weight.document_no,
        documentDate:weight.document_date,title:'Formulari i Peshës',status:'DRAFT',createdBy:req.user.id,
        snapshot:{
          supplierCode:weight.supplier_code,supplierName:weight.supplier_name,productCode:weight.product_code,productName:weight.product_name,
          bagsCount:num(weight.bags_count),packagingUnit:input.packagingUnit,grossWeight:num(weight.gross_weight),packagingWeight:num(weight.packaging_weight),
          netWeight:num(weight.accepted_weight),unitPrice:num(weight.unit_price),totalValue:num(weight.total_value),farmName:origin.rows[0].name,plantName:plant.name,
          lines:linesResult.rows.map((row)=>({lineNo:row.line_no,packagingCount:num(row.packaging_count),grossKg:num(row.gross_kg),packagingKg:num(row.packaging_kg),netKg:num(row.net_kg),note:row.note||''})),
        },
      });
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'TRACE_DOSSIER_OPEN',entityType:'trace_dossier',entityId:dossier.id,companyId:weight.company_id,
        metadata:{dossierNo:dossier.dossier_no,weightTicketId:weight.id,plantId:input.plantId,lineCount:linesResult.rowCount},ip:req.ip},client);
      await client.query(`INSERT INTO cloud_change_events(tenant_id,company_id,entity_type,entity_id,operation,metadata,user_id)
        VALUES($1,$2,'trace_dossier',$3,'UPSERT',$4::jsonb,$5)`, [req.user.tenant_id,weight.company_id,dossier.id,JSON.stringify({status:'WEIGHED',weightTicketId:weight.id}),req.user.id]);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'traceDossiers',{action:'upserted',id:dossier.id});
      res.status(weight.trace_dossier_id?200:201).json(dossier);
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.get('/api/trace/workflow/weights/:id/details', authRequired, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT wt.*,bp.code AS supplier_code,bp.name AS supplier_name,p.code AS product_code,p.name AS product_name,
        w.code AS warehouse_code,w.name AS warehouse_name,f.code AS farm_code,f.name AS farm_name,pa.code AS parcel_code,pa.name AS parcel_name,
        tp.code AS plant_code,tp.name AS plant_name,tp.botanical_name,tp.local_name,tp.plant_part,td.dossier_no,td.status AS dossier_status
        FROM weight_tickets wt JOIN business_partners bp ON bp.id=wt.supplier_id JOIN products p ON p.id=wt.product_id JOIN warehouses w ON w.id=wt.warehouse_id
        LEFT JOIN trace_farms f ON f.id=wt.farm_id LEFT JOIN trace_parcels pa ON pa.id=wt.parcel_id LEFT JOIN trace_plants tp ON tp.id=wt.plant_id
        LEFT JOIN trace_dossiers td ON td.id=wt.trace_dossier_id WHERE wt.id=$1 AND wt.tenant_id=$2 LIMIT 1`, [req.params.id,req.user.tenant_id]);
      const weight = rows[0];
      if (!weight) throw requestError('Formulari i peshës nuk u gjet.',404);
      await assertCompanyAccess(req.user,weight.company_id);
      const lines = await pool.query(`SELECT * FROM trace_weight_ticket_lines WHERE weight_ticket_id=$1 ORDER BY line_no`, [weight.id]);
      res.json({weight,lines:lines.rows});
    } catch (error) { next(error); }
  });

  app.put('/api/trace/workflow/weights/:id/lines', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = linesSchema.parse(req.body);
      await client.query('BEGIN');
      const currentResult = await client.query(`SELECT * FROM weight_tickets WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [req.params.id,req.user.tenant_id]);
      const current = currentResult.rows[0];
      if (!current) throw requestError('Formulari i peshës nuk u gjet.',404);
      await assertCompanyAccess(req.user,current.company_id,client);
      if (current.status !== 'DRAFT') throw requestError('Rreshtat mund të ndryshohen vetëm sa dokumenti është Draft.',409);
      const lines = input.lines.filter((line)=>num(line.packagingCount)>0 || num(line.grossKg)>0 || num(line.packagingKg)>0 || text(line.note));
      if (!lines.length) throw requestError('Duhet të ketë të paktën një rresht peshimi.');
      const totals = lines.reduce((out,line)=>{
        out.packagingCount += num(line.packagingCount);
        out.grossKg += num(line.grossKg);
        out.packagingKg += num(line.packagingKg);
        return out;
      },{packagingCount:0,grossKg:0,packagingKg:0});
      const net = totals.grossKg - totals.packagingKg;
      const accepted = net * (1-num(current.discount_percent)/100);
      if (net <= 0 || accepted <= 0) throw requestError('Pesha neto e pranuar duhet të jetë më e madhe se zero.');
      await client.query(`DELETE FROM trace_weight_ticket_lines WHERE weight_ticket_id=$1`, [current.id]);
      for (let index=0; index<lines.length; index++) {
        const line = lines[index];
        const lineNet = num(line.grossKg)-num(line.packagingKg);
        await client.query(`INSERT INTO trace_weight_ticket_lines(id,weight_ticket_id,line_no,packaging_count,gross_kg,packaging_kg,net_kg,note)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(),current.id,index+1,line.packagingCount,line.grossKg,line.packagingKg,lineNet,line.note||null]);
      }
      const totalValue = accepted*num(current.unit_price);
      await client.query(`UPDATE weight_tickets SET bags_count=$1,gross_weight=$2,packaging_weight=$3,net_weight=$4,accepted_weight=$5,total_value=$6,version=version+1,updated_at=NOW() WHERE id=$7`,
        [totals.packagingCount,totals.grossKg,totals.packagingKg,net,accepted,totalValue,current.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'WEIGHT_LINES_REPLACE',entityType:'weight_ticket',entityId:current.id,companyId:current.company_id,
        metadata:{lineCount:lines.length,packagingCount:totals.packagingCount,grossKg:totals.grossKg,packagingKg:totals.packagingKg,netKg:accepted},ip:req.ip},client);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'weights',{action:'linesUpdated',id:current.id});
      res.json({id:current.id,lineCount:lines.length,...totals,netKg:accepted,totalValue});
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.patch('/api/trace/workflow/plants/:id', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = plantUpdateSchema.parse(req.body);
      await client.query('BEGIN');
      const currentResult = await client.query(`SELECT * FROM trace_plants WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [req.params.id,req.user.tenant_id]);
      const current = currentResult.rows[0];
      if (!current) throw requestError('Bima nuk u gjet.',404);
      await assertCompanyAccess(req.user,current.company_id,client);
      const farm = await client.query(`SELECT id FROM trace_farms WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [input.farmId,req.user.tenant_id,current.company_id]);
      if (!farm.rowCount) throw requestError('Ferma nuk është e vlefshme.');
      if (input.productId) {
        const product = await client.query(`SELECT id FROM products WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [input.productId,req.user.tenant_id,current.company_id]);
        if (!product.rowCount) throw requestError('Artikulli i lidhur nuk është i vlefshëm.');
      }
      const { rows } = await client.query(`UPDATE trace_plants SET farm_id=$1,product_id=$2,code=$3,name=$4,botanical_name=$5,local_name=$6,plant_part=$7,
        organic_status=$8,certificate_no=$9,harvest_season=$10,notes=$11,active=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,
        [input.farmId,input.productId||null,input.code.toUpperCase(),input.name,input.botanicalName||null,input.localName||null,input.plantPart||null,input.organicStatus||null,
         input.certificateNo||null,input.harvestSeason||null,input.notes||null,input.active,current.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'TRACE_PLANT_UPDATE',entityType:'trace_plant',entityId:current.id,companyId:current.company_id,
        metadata:{farmId:input.farmId,code:input.code,name:input.name},ip:req.ip},client);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'tracePlants',{action:'updated',id:current.id});
      res.json(rows[0]);
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.get('/api/trace/workflow/registry', authRequired, async (req,res,next) => {
    try {
      const companyIds = await accessibleCompanyIds(req.user);
      if (!companyIds.length) return res.json({farms:[],plants:[],parcels:[]});
      const [farms,plants,parcels] = await Promise.all([
        pool.query(`SELECT f.*,bp.code AS supplier_code,bp.name AS supplier_name,COUNT(DISTINCT tp.id)::int AS plant_count,COUNT(DISTINCT pa.id)::int AS parcel_count
          FROM trace_farms f LEFT JOIN business_partners bp ON bp.id=f.supplier_id LEFT JOIN trace_plants tp ON tp.farm_id=f.id LEFT JOIN trace_parcels pa ON pa.farm_id=f.id
          WHERE f.tenant_id=$1 AND f.company_id=ANY($2::uuid[]) GROUP BY f.id,bp.code,bp.name ORDER BY f.active DESC,bp.code,f.name`, [req.user.tenant_id,companyIds]),
        pool.query(`SELECT tp.*,f.code AS farm_code,f.name AS farm_name,bp.code AS supplier_code,bp.name AS supplier_name,p.code AS product_code,p.name AS product_name
          FROM trace_plants tp JOIN trace_farms f ON f.id=tp.farm_id LEFT JOIN business_partners bp ON bp.id=f.supplier_id LEFT JOIN products p ON p.id=tp.product_id
          WHERE tp.tenant_id=$1 AND tp.company_id=ANY($2::uuid[]) ORDER BY tp.active DESC,bp.code,f.name,tp.name`, [req.user.tenant_id,companyIds]),
        pool.query(`SELECT pa.*,f.code AS farm_code,f.name AS farm_name FROM trace_parcels pa JOIN trace_farms f ON f.id=pa.farm_id
          WHERE pa.tenant_id=$1 AND pa.company_id=ANY($2::uuid[]) ORDER BY pa.active DESC,f.name,pa.name`, [req.user.tenant_id,companyIds]),
      ]);
      res.json({farms:farms.rows,plants:plants.rows,parcels:parcels.rows});
    } catch (error) { next(error); }
  });

  app.get('/api/trace/workflow/dossiers/:id/audit', authRequired, async (req,res,next) => {
    try {
      const dossierResult = await pool.query(`SELECT * FROM trace_dossiers WHERE id=$1 AND tenant_id=$2`, [req.params.id,req.user.tenant_id]);
      const dossier = dossierResult.rows[0];
      if (!dossier) throw requestError('Dosja nuk u gjet.',404);
      await assertCompanyAccess(req.user,dossier.company_id);
      const { rows } = await pool.query(`SELECT e.*,u.full_name AS user_full_name FROM system_action_events e LEFT JOIN users u ON u.id=e.user_id
        WHERE e.tenant_id=$1 AND (
          (e.entity_type='trace_dossier' AND e.entity_id=$2) OR
          e.entity_id IN (SELECT entity_id FROM trace_dossier_documents WHERE dossier_id=$2) OR
          e.entity_id IN (SELECT lot_id FROM trace_dossier_lots WHERE dossier_id=$2) OR
          e.document_no IN (SELECT document_no FROM trace_dossier_documents WHERE dossier_id=$2 AND document_no IS NOT NULL)
        ) ORDER BY e.occurred_at,e.sequence_no`, [req.user.tenant_id,dossier.id]);
      res.json(rows);
    } catch (error) { next(error); }
  });
}
