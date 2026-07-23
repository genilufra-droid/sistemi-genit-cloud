import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const WRITE_ROLES = ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','OPERATOR_PESHORE'];
const QUALITY_STATUSES = ['QUARANTINE','APPROVED','REJECTED','PARTIAL_APPROVAL'];
const LOT_STATUSES = ['QUARANTINE','AVAILABLE','BLOCKED','DEPLETED','CANCELLED','RECALLED'];
const text = (value) => String(value ?? '').trim();
const num = (value) => Number(value || 0);

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeToken(value, fallback = 'ART') {
  let token = text(value).toUpperCase();
  token = token.normalize ? token.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : token;
  token = token.replace(/Ë/g, 'E').replace(/Ç/g, 'C').replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
  return token || fallback;
}

function lotStatusFromQuality(qualityStatus) {
  if (qualityStatus === 'APPROVED') return 'AVAILABLE';
  if (qualityStatus === 'REJECTED') return 'BLOCKED';
  return 'QUARANTINE';
}

export async function migratePhase4Traceability(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS trace_farms (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      supplier_id UUID REFERENCES business_partners(id) ON DELETE SET NULL,
      code VARCHAR(80) NOT NULL,
      name VARCHAR(220) NOT NULL,
      source_type_default VARCHAR(30) NOT NULL DEFAULT 'CULTIVATED' CHECK (source_type_default IN ('CULTIVATED','WILD_COLLECTION','MIXED')),
      country VARCHAR(100) NOT NULL DEFAULT 'Shqipëri',
      region VARCHAR(140),
      municipality VARCHAR(140),
      village VARCHAR(140),
      location_name VARCHAR(220),
      latitude NUMERIC(11,8),
      longitude NUMERIC(11,8),
      altitude_m NUMERIC(10,2),
      notes TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      version BIGINT NOT NULL DEFAULT 1,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, code)
    );

    CREATE TABLE IF NOT EXISTS trace_parcels (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      farm_id UUID NOT NULL REFERENCES trace_farms(id) ON DELETE RESTRICT,
      code VARCHAR(80) NOT NULL,
      name VARCHAR(220) NOT NULL,
      source_type VARCHAR(30) NOT NULL DEFAULT 'CULTIVATED' CHECK (source_type IN ('CULTIVATED','WILD_COLLECTION','MIXED')),
      country VARCHAR(100) NOT NULL DEFAULT 'Shqipëri',
      region VARCHAR(140),
      municipality VARCHAR(140),
      village VARCHAR(140),
      location_name VARCHAR(220),
      latitude NUMERIC(11,8),
      longitude NUMERIC(11,8),
      altitude_m NUMERIC(10,2),
      area_hectares NUMERIC(18,4),
      notes TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      version BIGINT NOT NULL DEFAULT 1,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, code)
    );

    CREATE TABLE IF NOT EXISTS trace_lot_sequences (
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      sequence_key VARCHAR(120) NOT NULL,
      last_value BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, company_id, sequence_key)
    );

    CREATE TABLE IF NOT EXISTS trace_lots (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      supplier_id UUID REFERENCES business_partners(id) ON DELETE RESTRICT,
      farm_id UUID REFERENCES trace_farms(id) ON DELETE RESTRICT,
      parcel_id UUID REFERENCES trace_parcels(id) ON DELETE RESTRICT,
      parent_lot_id UUID REFERENCES trace_lots(id) ON DELETE RESTRICT,
      source_weight_ticket_id UUID UNIQUE REFERENCES weight_tickets(id) ON DELETE RESTRICT,
      source_document_id UUID REFERENCES business_documents(id) ON DELETE RESTRICT,
      lot_number VARCHAR(120) NOT NULL,
      lot_type VARCHAR(20) NOT NULL CHECK (lot_type IN ('RAW','PROCESSED','PACKAGED','RETURN')),
      status VARCHAR(30) NOT NULL CHECK (status IN ('QUARANTINE','AVAILABLE','BLOCKED','DEPLETED','CANCELLED','RECALLED')),
      quality_status VARCHAR(30) NOT NULL CHECK (quality_status IN ('QUARANTINE','APPROVED','REJECTED','PARTIAL_APPROVAL')),
      harvest_date DATE,
      production_date DATE,
      expiry_date DATE,
      quantity_created NUMERIC(18,6) NOT NULL,
      quantity_available NUMERIC(18,6) NOT NULL,
      quantity_consumed NUMERIC(18,6) NOT NULL DEFAULT 0,
      base_unit VARCHAR(30) NOT NULL DEFAULT 'kg',
      unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
      botanical_name VARCHAR(220),
      plant_part VARCHAR(140),
      location_text TEXT,
      notes TEXT,
      version BIGINT NOT NULL DEFAULT 1,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, lot_number),
      CHECK (quantity_created >= 0 AND quantity_available >= 0 AND quantity_consumed >= 0),
      CHECK (quantity_available + quantity_consumed <= quantity_created + 0.000001)
    );

    CREATE TABLE IF NOT EXISTS trace_lot_movements (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE RESTRICT,
      warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      movement_type VARCHAR(40) NOT NULL,
      quantity NUMERIC(18,6) NOT NULL,
      balance_after NUMERIC(18,6) NOT NULL,
      source_document_type VARCHAR(60),
      source_document_id UUID,
      source_document_no VARCHAR(120),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      movement_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trace_quality_checks (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE RESTRICT,
      check_no VARCHAR(100) NOT NULL,
      check_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      result VARCHAR(30) NOT NULL CHECK (result IN ('QUARANTINE','APPROVED','REJECTED','PARTIAL_APPROVAL')),
      moisture_percent NUMERIC(8,4),
      impurity_percent NUMERIC(8,4),
      laboratory_reference VARCHAR(180),
      notes TEXT,
      checked_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, check_no)
    );

    CREATE TABLE IF NOT EXISTS process_orders (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      output_product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      work_order_no VARCHAR(100) NOT NULL,
      process_type VARCHAR(60) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','CANCELLED')),
      order_date DATE NOT NULL DEFAULT CURRENT_DATE,
      output_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
      waste_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
      loss_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
      direct_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
      asset_id UUID,
      operator_id UUID REFERENCES users(id) ON DELETE SET NULL,
      output_lot_id UUID REFERENCES trace_lots(id) ON DELETE RESTRICT,
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      posted_by UUID REFERENCES users(id) ON DELETE SET NULL,
      posted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, work_order_no)
    );

    CREATE TABLE IF NOT EXISTS process_order_inputs (
      id UUID PRIMARY KEY,
      process_order_id UUID NOT NULL REFERENCES process_orders(id) ON DELETE CASCADE,
      lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE RESTRICT,
      quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (process_order_id, lot_id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      expense_no VARCHAR(100) NOT NULL,
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
      category VARCHAR(120) NOT NULL,
      description TEXT NOT NULL,
      amount_net NUMERIC(18,4) NOT NULL DEFAULT 0,
      vat_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
      total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
      currency VARCHAR(8) NOT NULL DEFAULT 'ALL',
      payment_method VARCHAR(30),
      supplier_id UUID REFERENCES business_partners(id) ON DELETE SET NULL,
      lot_id UUID REFERENCES trace_lots(id) ON DELETE SET NULL,
      process_order_id UUID REFERENCES process_orders(id) ON DELETE SET NULL,
      shipment_id UUID,
      vehicle_id UUID,
      asset_id UUID,
      cost_center VARCHAR(120),
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','POSTED','CANCELLED')),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, expense_no)
    );

    CREATE TABLE IF NOT EXISTS logistics_vehicles (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code VARCHAR(80) NOT NULL,
      plate_no VARCHAR(40) NOT NULL,
      vehicle_type VARCHAR(60) NOT NULL,
      make VARCHAR(80),
      model VARCHAR(80),
      year INTEGER,
      capacity_kg NUMERIC(18,3),
      odometer_km NUMERIC(18,2) NOT NULL DEFAULT 0,
      fuel_type VARCHAR(40),
      fuel_norm_l_100km NUMERIC(10,4),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, code),
      UNIQUE (tenant_id, company_id, plate_no)
    );

    CREATE TABLE IF NOT EXISTS export_shipments (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      customer_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE RESTRICT,
      vehicle_id UUID REFERENCES logistics_vehicles(id) ON DELETE SET NULL,
      shipment_no VARCHAR(100) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PLANNED','LOADING','SEALED','DISPATCHED','AT_BORDER','DELIVERED','CLOSED','CANCELLED')),
      departure_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      driver_name VARCHAR(180),
      trailer_plate VARCHAR(40),
      container_no VARCHAR(80),
      seal_no VARCHAR(80),
      origin VARCHAR(220),
      destination VARCHAR(220),
      border_point VARCHAR(180),
      incoterm VARCHAR(20),
      net_weight NUMERIC(18,4) NOT NULL DEFAULT 0,
      gross_weight NUMERIC(18,4) NOT NULL DEFAULT 0,
      pallet_count NUMERIC(18,3) NOT NULL DEFAULT 0,
      package_count NUMERIC(18,3) NOT NULL DEFAULT 0,
      cmr_no VARCHAR(100),
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, shipment_no)
    );

    CREATE TABLE IF NOT EXISTS export_shipment_items (
      id UUID PRIMARY KEY,
      shipment_id UUID NOT NULL REFERENCES export_shipments(id) ON DELETE CASCADE,
      lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE RESTRICT,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
      package_count NUMERIC(18,3) NOT NULL DEFAULT 0,
      pallet_reference VARCHAR(120),
      sales_document_id UUID REFERENCES business_documents(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fixed_assets (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      asset_code VARCHAR(80) NOT NULL,
      asset_name VARCHAR(220) NOT NULL,
      category VARCHAR(120) NOT NULL,
      serial_no VARCHAR(120),
      location VARCHAR(220),
      responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      supplier_id UUID REFERENCES business_partners(id) ON DELETE SET NULL,
      purchase_document_id UUID REFERENCES business_documents(id) ON DELETE SET NULL,
      acquisition_date DATE,
      activation_date DATE,
      acquisition_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
      residual_value NUMERIC(18,4) NOT NULL DEFAULT 0,
      useful_life_months INTEGER,
      depreciation_method VARCHAR(40) NOT NULL DEFAULT 'STRAIGHT_LINE',
      status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','MAINTENANCE','OUT_OF_SERVICE','DISPOSED')),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, asset_code)
    );

    ALTER TABLE weight_tickets ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES trace_farms(id) ON DELETE RESTRICT;
    ALTER TABLE weight_tickets ADD COLUMN IF NOT EXISTS parcel_id UUID REFERENCES trace_parcels(id) ON DELETE RESTRICT;
    ALTER TABLE weight_tickets ADD COLUMN IF NOT EXISTS harvest_date DATE;
    ALTER TABLE weight_tickets ADD COLUMN IF NOT EXISTS quality_status VARCHAR(30) DEFAULT 'QUARANTINE';
    ALTER TABLE weight_tickets ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES trace_lots(id) ON DELETE RESTRICT;
    ALTER TABLE weight_tickets ADD COLUMN IF NOT EXISTS receipt_document_id UUID REFERENCES business_documents(id) ON DELETE RESTRICT;
    ALTER TABLE weight_tickets ADD COLUMN IF NOT EXISTS posted_by UUID REFERENCES users(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_trace_farms_scope ON trace_farms(tenant_id,company_id,active,name);
    CREATE INDEX IF NOT EXISTS idx_trace_parcels_scope ON trace_parcels(tenant_id,company_id,farm_id,active,name);
    CREATE INDEX IF NOT EXISTS idx_trace_lots_scope ON trace_lots(tenant_id,company_id,product_id,status,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_trace_lots_origin ON trace_lots(tenant_id,company_id,farm_id,parcel_id);
    CREATE INDEX IF NOT EXISTS idx_trace_movements_lot ON trace_lot_movements(lot_id,movement_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shipments_scope ON export_shipments(tenant_id,company_id,status,departure_at DESC);
    CREATE INDEX IF NOT EXISTS idx_expenses_scope ON expenses(tenant_id,company_id,expense_date DESC,category);
    CREATE INDEX IF NOT EXISTS idx_assets_scope ON fixed_assets(tenant_id,company_id,status,category);
  `);
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

async function nextLotNumber(client, tenantId, companyId, product, lotType, sourceDate) {
  const prefixMap = { RAW: 'RAW', PROCESSED: 'PRC', PACKAGED: 'PKG', RETURN: 'RTN' };
  const prefix = prefixMap[lotType] || 'LOT';
  const productToken = normalizeToken(product.code || product.name, 'ART').slice(0, 18);
  const dateText = sourceDate instanceof Date ? sourceDate.toISOString().slice(0, 10) : String(sourceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const day = dateText.replace(/-/g, '');
  const key = `${prefix}-${productToken}-${day}`;
  const value = await nextSequence(client, tenantId, companyId, key);
  return `${key}-${String(value).padStart(4, '0')}`;
}

async function nextWeightNo(client, tenantId, companyId, documentDate) {
  const dateText = documentDate instanceof Date ? documentDate.toISOString().slice(0, 10) : String(documentDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const year = dateText.slice(0, 4);
  const value = await nextSequence(client, tenantId, companyId, `PESH-${year}`);
  return `PESH-${year}-${String(value).padStart(6, '0')}`;
}

async function nextReceiptNo(client, tenantId, companyId, documentDate) {
  const dateText = documentDate instanceof Date ? documentDate.toISOString().slice(0, 10) : String(documentDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const year = dateText.slice(0, 4);
  const key = `FH-${year}`;
  const value = await nextSequence(client, tenantId, companyId, key);
  return `FH-${year}-${String(value).padStart(6, '0')}`;
}

async function addChange(client, user, companyId, entityType, entityId, operation, metadata = {}) {
  await client.query(`INSERT INTO cloud_change_events(tenant_id,company_id,entity_type,entity_id,operation,metadata,user_id)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`, [user.tenant_id, companyId, entityType, entityId, operation, JSON.stringify(metadata), user.id]);
}

export function installPhase4TraceabilityRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant }) {
  const farmSchema = z.object({
    companyId: z.string().uuid(), supplierId: z.string().uuid().nullable().optional(), code: z.string().trim().min(1).max(80),
    name: z.string().trim().min(2).max(220), sourceTypeDefault: z.enum(['CULTIVATED','WILD_COLLECTION','MIXED']).default('CULTIVATED'),
    country: z.string().trim().max(100).default('Shqipëri'), region: z.string().trim().max(140).optional().default(''),
    municipality: z.string().trim().max(140).optional().default(''), village: z.string().trim().max(140).optional().default(''),
    locationName: z.string().trim().max(220).optional().default(''), latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(), altitudeM: z.coerce.number().nullable().optional(),
    notes: z.string().trim().max(2000).optional().default(''), active: z.boolean().optional(),
  });
  const parcelSchema = z.object({
    companyId: z.string().uuid(), farmId: z.string().uuid(), code: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(220),
    sourceType: z.enum(['CULTIVATED','WILD_COLLECTION','MIXED']).default('CULTIVATED'), country: z.string().trim().max(100).default('Shqipëri'),
    region: z.string().trim().max(140).optional().default(''), municipality: z.string().trim().max(140).optional().default(''),
    village: z.string().trim().max(140).optional().default(''), locationName: z.string().trim().max(220).optional().default(''),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(), longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    altitudeM: z.coerce.number().nullable().optional(), areaHectares: z.coerce.number().min(0).nullable().optional(),
    notes: z.string().trim().max(2000).optional().default(''), active: z.boolean().optional(),
  });
  const postWeightSchema = z.object({
    farmId: z.string().uuid(), parcelId: z.string().uuid(), harvestDate: z.string().date(),
    qualityStatus: z.enum(QUALITY_STATUSES).default('QUARANTINE'), receiptDocumentNo: z.string().trim().max(80).optional().default(''),
    botanicalName: z.string().trim().max(220).optional().default(''), plantPart: z.string().trim().max(140).optional().default(''),
    notes: z.string().trim().max(2000).optional().default(''),
  });
  const weightDraftSchema = z.object({
    companyId: z.string().uuid(), warehouseId: z.string().uuid(), supplierId: z.string().uuid(), productId: z.string().uuid(),
    documentDate: z.string().date(), bagsCount: z.coerce.number().min(0).default(0), grossWeight: z.coerce.number().positive(),
    packagingWeight: z.coerce.number().min(0).default(0), discountPercent: z.coerce.number().min(0).max(100).default(0),
    unitPrice: z.coerce.number().min(0).default(0), vehiclePlate: z.string().trim().max(40).optional().default(''),
    farmId: z.string().uuid().nullable().optional(), parcelId: z.string().uuid().nullable().optional(), harvestDate: z.string().date().nullable().optional(),
    qualityStatus: z.enum(QUALITY_STATUSES).default('QUARANTINE'), notes: z.string().trim().max(2000).optional().default(''),
  });
  const qualitySchema = z.object({
    result: z.enum(QUALITY_STATUSES), moisturePercent: z.coerce.number().min(0).max(100).nullable().optional(),
    impurityPercent: z.coerce.number().min(0).max(100).nullable().optional(), laboratoryReference: z.string().trim().max(180).optional().default(''),
    notes: z.string().trim().max(2000).optional().default(''),
  });

  app.get('/api/trace/farms', authRequired, async (req,res,next) => {
    try {
      const companyIds = await accessibleCompanyIds(req.user);
      if (!companyIds.length) return res.json([]);
      const { rows } = await pool.query(`SELECT f.*,bp.name AS supplier_name
        FROM trace_farms f LEFT JOIN business_partners bp ON bp.id=f.supplier_id
        WHERE f.tenant_id=$1 AND f.company_id=ANY($2::uuid[]) ORDER BY f.active DESC,f.name`, [req.user.tenant_id, companyIds]);
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.post('/api/trace/farms', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = farmSchema.parse(req.body);
      await client.query('BEGIN');
      await assertCompanyAccess(req.user,input.companyId,client);
      if (input.supplierId) {
        const partner = await client.query(`SELECT id FROM business_partners WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [input.supplierId,req.user.tenant_id,input.companyId]);
        if (!partner.rowCount) throw requestError('Fermeri/Furnitori nuk është i vlefshëm.');
      }
      const id = randomUUID();
      const { rows } = await client.query(`INSERT INTO trace_farms(id,tenant_id,company_id,supplier_id,code,name,source_type_default,country,region,municipality,village,location_name,latitude,longitude,altitude_m,notes,active,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`, [id,req.user.tenant_id,input.companyId,input.supplierId||null,input.code.toUpperCase(),input.name,input.sourceTypeDefault,input.country,input.region||null,input.municipality||null,input.village||null,input.locationName||null,input.latitude??null,input.longitude??null,input.altitudeM??null,input.notes||null,input.active??true,req.user.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'TRACE_FARM_CREATE',entityType:'trace_farm',entityId:id,companyId:input.companyId,metadata:{code:input.code,name:input.name},ip:req.ip},client);
      await addChange(client,req.user,input.companyId,'trace_farm',id,'CREATE',{code:input.code});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'traceFarms',{action:'created',id});
      res.status(201).json(rows[0]);
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.get('/api/trace/parcels', authRequired, async (req,res,next) => {
    try {
      const companyIds = await accessibleCompanyIds(req.user);
      if (!companyIds.length) return res.json([]);
      const { rows } = await pool.query(`SELECT p.*,f.name AS farm_name,f.code AS farm_code
        FROM trace_parcels p JOIN trace_farms f ON f.id=p.farm_id
        WHERE p.tenant_id=$1 AND p.company_id=ANY($2::uuid[]) ORDER BY p.active DESC,f.name,p.name`, [req.user.tenant_id, companyIds]);
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.post('/api/trace/parcels', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = parcelSchema.parse(req.body);
      await client.query('BEGIN');
      await assertCompanyAccess(req.user,input.companyId,client);
      const farm = await client.query(`SELECT * FROM trace_farms WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [input.farmId,req.user.tenant_id,input.companyId]);
      if (!farm.rowCount) throw requestError('Ferma/Zona nuk është e vlefshme.');
      const id = randomUUID();
      const { rows } = await client.query(`INSERT INTO trace_parcels(id,tenant_id,company_id,farm_id,code,name,source_type,country,region,municipality,village,location_name,latitude,longitude,altitude_m,area_hectares,notes,active,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`, [id,req.user.tenant_id,input.companyId,input.farmId,input.code.toUpperCase(),input.name,input.sourceType,input.country,input.region||null,input.municipality||null,input.village||null,input.locationName||null,input.latitude??null,input.longitude??null,input.altitudeM??null,input.areaHectares??null,input.notes||null,input.active??true,req.user.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'TRACE_PARCEL_CREATE',entityType:'trace_parcel',entityId:id,companyId:input.companyId,metadata:{code:input.code,name:input.name,farmId:input.farmId},ip:req.ip},client);
      await addChange(client,req.user,input.companyId,'trace_parcel',id,'CREATE',{code:input.code});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'traceParcels',{action:'created',id});
      res.status(201).json(rows[0]);
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.get('/api/trace/lots', authRequired, async (req,res,next) => {
    try {
      const companyIds = await accessibleCompanyIds(req.user);
      if (!companyIds.length) return res.json([]);
      const { rows } = await pool.query(`SELECT l.*,p.code AS product_code,p.name AS product_name,bp.name AS supplier_name,
        f.code AS farm_code,f.name AS farm_name,pa.code AS parcel_code,pa.name AS parcel_name,w.name AS warehouse_name,
        wt.document_no AS weight_document_no,d.document_no AS receipt_document_no
        FROM trace_lots l JOIN products p ON p.id=l.product_id JOIN warehouses w ON w.id=l.warehouse_id
        LEFT JOIN business_partners bp ON bp.id=l.supplier_id LEFT JOIN trace_farms f ON f.id=l.farm_id
        LEFT JOIN trace_parcels pa ON pa.id=l.parcel_id LEFT JOIN weight_tickets wt ON wt.id=l.source_weight_ticket_id
        LEFT JOIN business_documents d ON d.id=l.source_document_id
        WHERE l.tenant_id=$1 AND l.company_id=ANY($2::uuid[]) ORDER BY l.created_at DESC`, [req.user.tenant_id,companyIds]);
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.get('/api/trace/lots/:id/360', authRequired, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT l.*,p.code AS product_code,p.name AS product_name,bp.name AS supplier_name,bp.nipt AS supplier_nipt,
        f.code AS farm_code,f.name AS farm_name,f.region,f.municipality,f.village,
        pa.code AS parcel_code,pa.name AS parcel_name,pa.location_name,pa.latitude,pa.longitude,
        w.name AS warehouse_name,wt.document_no AS weight_document_no,wt.document_date AS weight_document_date,
        wt.gross_weight,wt.packaging_weight,wt.net_weight,wt.discount_percent,wt.accepted_weight,
        d.document_no AS receipt_document_no,d.document_date AS receipt_document_date
        FROM trace_lots l JOIN products p ON p.id=l.product_id JOIN warehouses w ON w.id=l.warehouse_id
        LEFT JOIN business_partners bp ON bp.id=l.supplier_id LEFT JOIN trace_farms f ON f.id=l.farm_id
        LEFT JOIN trace_parcels pa ON pa.id=l.parcel_id LEFT JOIN weight_tickets wt ON wt.id=l.source_weight_ticket_id
        LEFT JOIN business_documents d ON d.id=l.source_document_id
        WHERE l.id=$1 AND l.tenant_id=$2 LIMIT 1`, [req.params.id,req.user.tenant_id]);
      const lot = rows[0];
      if (!lot) throw requestError('Loti nuk u gjet.',404);
      await assertCompanyAccess(req.user,lot.company_id);
      const [movements,quality,processInputs,shipmentItems] = await Promise.all([
        pool.query(`SELECT * FROM trace_lot_movements WHERE lot_id=$1 ORDER BY movement_at,created_at`,[lot.id]),
        pool.query(`SELECT q.*,u.full_name AS checked_by_name FROM trace_quality_checks q LEFT JOIN users u ON u.id=q.checked_by WHERE q.lot_id=$1 ORDER BY q.check_date`,[lot.id]),
        pool.query(`SELECT po.*,poi.quantity FROM process_order_inputs poi JOIN process_orders po ON po.id=poi.process_order_id WHERE poi.lot_id=$1 ORDER BY po.created_at`,[lot.id]),
        pool.query(`SELECT s.*,si.quantity,si.package_count,si.pallet_reference,bp.name AS customer_name,v.plate_no
          FROM export_shipment_items si JOIN export_shipments s ON s.id=si.shipment_id
          JOIN business_partners bp ON bp.id=s.customer_id LEFT JOIN logistics_vehicles v ON v.id=s.vehicle_id
          WHERE si.lot_id=$1 ORDER BY s.created_at`,[lot.id]),
      ]);
      res.json({lot,movements:movements.rows,qualityChecks:quality.rows,processes:processInputs.rows,shipments:shipmentItems.rows});
    } catch (error) { next(error); }
  });

  async function validateWeightRelations(client, user, input) {
    await assertCompanyAccess(user,input.companyId,client);
    const warehouse = await client.query(`SELECT id FROM warehouses WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [input.warehouseId,user.tenant_id,input.companyId]);
    if (!warehouse.rowCount) throw requestError('Magazina nuk është e vlefshme.');
    const supplier = await client.query(`SELECT id FROM business_partners WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE AND partner_type IN ('SUPPLIER','BOTH')`, [input.supplierId,user.tenant_id,input.companyId]);
    if (!supplier.rowCount) throw requestError('Fermeri/Furnitori nuk është i vlefshëm.');
    const product = await client.query(`SELECT id FROM products WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [input.productId,user.tenant_id,input.companyId]);
    if (!product.rowCount) throw requestError('Artikulli nuk është i vlefshëm.');
    if (input.farmId || input.parcelId) {
      if (!input.farmId || !input.parcelId) throw requestError('Ferma dhe parcela duhet të zgjidhen së bashku.');
      const origin = await client.query(`SELECT f.supplier_id FROM trace_farms f JOIN trace_parcels p ON p.farm_id=f.id
        WHERE f.id=$1 AND p.id=$2 AND f.tenant_id=$3 AND f.company_id=$4 AND f.active=TRUE AND p.active=TRUE`, [input.farmId,input.parcelId,user.tenant_id,input.companyId]);
      if (!origin.rowCount) throw requestError('Ferma dhe parcela/zona nuk përputhen.');
      if (origin.rows[0].supplier_id && origin.rows[0].supplier_id !== input.supplierId) throw requestError('Ferma nuk i përket fermerit të zgjedhur.');
    }
  }

  app.post('/api/trace/weights', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = weightDraftSchema.parse(req.body);
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await validateWeightRelations(client,req.user,input);
      const net = Math.max(0,num(input.grossWeight)-num(input.packagingWeight));
      const accepted = net*(1-num(input.discountPercent)/100);
      if (accepted <= 0) throw requestError('Pesha neto e pranuar duhet të jetë më e madhe se zero.');
      const documentNo = await nextWeightNo(client,req.user.tenant_id,input.companyId,input.documentDate);
      const id = randomUUID();
      const total = accepted*num(input.unitPrice);
      const { rows } = await client.query(`INSERT INTO weight_tickets(id,tenant_id,company_id,warehouse_id,supplier_id,product_id,document_no,document_date,bags_count,gross_weight,packaging_weight,net_weight,discount_percent,accepted_weight,unit_price,total_value,vehicle_plate,notes,status,created_by,farm_id,parcel_id,harvest_date,quality_status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'DRAFT',$19,$20,$21,$22,$23) RETURNING *`, [id,req.user.tenant_id,input.companyId,input.warehouseId,input.supplierId,input.productId,documentNo,input.documentDate,input.bagsCount,input.grossWeight,input.packagingWeight,net,input.discountPercent,accepted,input.unitPrice,total,input.vehiclePlate||null,input.notes||null,req.user.id,input.farmId||null,input.parcelId||null,input.harvestDate||null,input.qualityStatus]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'WEIGHT_DRAFT_CREATE',entityType:'weight_ticket',entityId:id,companyId:input.companyId,metadata:{documentNo,acceptedWeight:accepted},ip:req.ip},client);
      await addChange(client,req.user,input.companyId,'weight_ticket',id,'CREATE',{documentNo,status:'DRAFT'});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'weights',{action:'created',id});
      res.status(201).json(rows[0]);
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.patch('/api/trace/weights/:id', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = weightDraftSchema.parse(req.body);
      await client.query('BEGIN');
      const currentResult = await client.query(`SELECT * FROM weight_tickets WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [req.params.id,req.user.tenant_id]);
      const current = currentResult.rows[0];
      if (!current) throw requestError('Formulari i peshës nuk u gjet.',404);
      await assertCompanyAccess(req.user,current.company_id,client);
      if (current.status !== 'DRAFT') throw requestError('Vetëm Formulari Draft mund të editohet.',409);
      if (input.companyId !== current.company_id) throw requestError('Kompania nuk mund të ndryshohet.');
      await validateWeightRelations(client,req.user,input);
      const net = Math.max(0,num(input.grossWeight)-num(input.packagingWeight));
      const accepted = net*(1-num(input.discountPercent)/100);
      if (accepted <= 0) throw requestError('Pesha neto e pranuar duhet të jetë më e madhe se zero.');
      const total = accepted*num(input.unitPrice);
      const { rows } = await client.query(`UPDATE weight_tickets SET warehouse_id=$1,supplier_id=$2,product_id=$3,document_date=$4,bags_count=$5,gross_weight=$6,packaging_weight=$7,net_weight=$8,discount_percent=$9,accepted_weight=$10,unit_price=$11,total_value=$12,vehicle_plate=$13,notes=$14,farm_id=$15,parcel_id=$16,harvest_date=$17,quality_status=$18,version=version+1,updated_at=NOW()
        WHERE id=$19 AND tenant_id=$20 RETURNING *`, [input.warehouseId,input.supplierId,input.productId,input.documentDate,input.bagsCount,input.grossWeight,input.packagingWeight,net,input.discountPercent,accepted,input.unitPrice,total,input.vehiclePlate||null,input.notes||null,input.farmId||null,input.parcelId||null,input.harvestDate||null,input.qualityStatus,current.id,req.user.tenant_id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'WEIGHT_DRAFT_UPDATE',entityType:'weight_ticket',entityId:current.id,companyId:current.company_id,metadata:{documentNo:current.document_no,acceptedWeight:accepted},ip:req.ip},client);
      await addChange(client,req.user,current.company_id,'weight_ticket',current.id,'UPDATE',{documentNo:current.document_no,status:'DRAFT'});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'weights',{action:'updated',id:current.id});
      res.json(rows[0]);
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.delete('/api/trace/weights/:id', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const currentResult = await client.query(`SELECT * FROM weight_tickets WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [req.params.id,req.user.tenant_id]);
      const current = currentResult.rows[0];
      if (!current) throw requestError('Formulari i peshës nuk u gjet.',404);
      await assertCompanyAccess(req.user,current.company_id,client);
      if (current.status !== 'DRAFT') throw requestError('Vetëm Drafti mund të fshihet.',409);
      await client.query(`DELETE FROM weight_tickets WHERE id=$1`,[current.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'WEIGHT_DRAFT_DELETE',entityType:'weight_ticket',entityId:current.id,companyId:current.company_id,metadata:{documentNo:current.document_no},ip:req.ip},client);
      await addChange(client,req.user,current.company_id,'weight_ticket',current.id,'DELETE',{documentNo:current.document_no});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'weights',{action:'deleted',id:current.id});
      res.json({id:current.id,deleted:true});
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/weights/:id/post-receipt', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = postWeightSchema.parse(req.body);
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const weightResult = await client.query(`SELECT * FROM weight_tickets WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [req.params.id,req.user.tenant_id]);
      const weight = weightResult.rows[0];
      if (!weight) throw requestError('Formulari i peshës nuk u gjet.',404);
      await assertCompanyAccess(req.user,weight.company_id,client);
      if (weight.status !== 'DRAFT') throw requestError('Peshimi është postuar ose anuluar më parë.',409);
      if (weight.lot_id) throw requestError('Ky peshim ka krijuar lot më parë.',409);
      if (num(weight.accepted_weight) <= 0) throw requestError('Pesha neto e pranuar duhet të jetë më e madhe se zero.');
      if (!weight.supplier_id) throw requestError('Zgjidhni fermerin/furnitorin në formularin e peshës.');

      const origin = await client.query(`SELECT f.*,pa.id AS parcel_id,pa.code AS parcel_code,pa.name AS parcel_name,pa.location_name AS parcel_location,
        pa.country AS parcel_country,pa.region AS parcel_region,pa.municipality AS parcel_municipality,pa.village AS parcel_village
        FROM trace_farms f JOIN trace_parcels pa ON pa.farm_id=f.id
        WHERE f.id=$1 AND pa.id=$2 AND f.tenant_id=$3 AND f.company_id=$4 AND f.active=TRUE AND pa.active=TRUE`, [input.farmId,input.parcelId,req.user.tenant_id,weight.company_id]);
      if (!origin.rowCount) throw requestError('Ferma dhe parcela/zona e mbledhjes nuk përputhen.');
      const farm = origin.rows[0];
      if (farm.supplier_id && farm.supplier_id !== weight.supplier_id) throw requestError('Ferma nuk i përket fermerit/furnitorit të zgjedhur.');

      const productResult = await client.query(`SELECT * FROM products WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [weight.product_id,req.user.tenant_id,weight.company_id]);
      const product = productResult.rows[0];
      if (!product) throw requestError('Artikulli nuk është i vlefshëm.');
      const warehouseResult = await client.query(`SELECT * FROM warehouses WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [weight.warehouse_id,req.user.tenant_id,weight.company_id]);
      if (!warehouseResult.rowCount) throw requestError('Magazina nuk është e vlefshme.');

      const lotNumber = await nextLotNumber(client,req.user.tenant_id,weight.company_id,product,'RAW',weight.document_date);
      const receiptNo = input.receiptDocumentNo || await nextReceiptNo(client,req.user.tenant_id,weight.company_id,weight.document_date);
      const lotId = randomUUID();
      const receiptId = randomUUID();
      const movementId = randomUUID();
      const stockMovementId = randomUUID();
      const quantity = num(weight.accepted_weight);
      const total = num(weight.total_value);
      const qualityStatus = input.qualityStatus;
      const lotStatus = lotStatusFromQuality(qualityStatus);
      const locationText = [farm.parcel_location||farm.parcel_name,farm.parcel_village,farm.parcel_municipality,farm.parcel_region,farm.parcel_country||farm.country].filter(Boolean).join(', ');

      await client.query(`INSERT INTO business_documents(id,tenant_id,company_id,warehouse_id,partner_id,doc_type,document_no,document_date,status,notes,total_net,total_vat,total_amount,created_by,confirmed_at)
        VALUES($1,$2,$3,$4,$5,'PURCHASE_RECEIPT',$6,$7,'CONFIRMED',$8,$9,0,$9,$10,NOW())`, [receiptId,req.user.tenant_id,weight.company_id,weight.warehouse_id,weight.supplier_id,receiptNo,weight.document_date,input.notes||`Pranim automatik nga peshimi ${weight.document_no}`,total,req.user.id]);
      await client.query(`INSERT INTO business_document_items(id,document_id,product_id,description,unit,coefficient,quantity,free_quantity,unit_price,vat_rate,line_net,line_vat,line_total)
        VALUES($1,$2,$3,$4,$5,1,$6,0,$7,0,$8,0,$8)`, [randomUUID(),receiptId,product.id,product.name,product.base_unit||'kg',quantity,num(weight.unit_price),total]);

      await client.query(`INSERT INTO trace_lots(id,tenant_id,company_id,warehouse_id,product_id,supplier_id,farm_id,parcel_id,source_weight_ticket_id,source_document_id,lot_number,lot_type,status,quality_status,harvest_date,production_date,quantity_created,quantity_available,quantity_consumed,base_unit,unit_cost,botanical_name,plant_part,location_text,notes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'RAW',$12,$13,$14,$15,$16,$16,0,$17,$18,$19,$20,$21,$22,$23)`, [lotId,req.user.tenant_id,weight.company_id,weight.warehouse_id,product.id,weight.supplier_id,input.farmId,input.parcelId,weight.id,receiptId,lotNumber,lotStatus,qualityStatus,input.harvestDate,weight.document_date,quantity,product.base_unit||'kg',num(weight.unit_price),input.botanicalName||null,input.plantPart||null,locationText,input.notes||weight.notes||null,req.user.id]);

      await client.query(`INSERT INTO trace_lot_movements(id,tenant_id,company_id,lot_id,warehouse_id,product_id,movement_type,quantity,balance_after,source_document_type,source_document_id,source_document_no,metadata,created_by)
        VALUES($1,$2,$3,$4,$5,$6,'RECEIPT_IN',$7,$7,'PURCHASE_RECEIPT',$8,$9,$10::jsonb,$11)`, [movementId,req.user.tenant_id,weight.company_id,lotId,weight.warehouse_id,product.id,quantity,receiptId,receiptNo,JSON.stringify({weightTicketId:weight.id,weightDocumentNo:weight.document_no,farmId:input.farmId,parcelId:input.parcelId}),req.user.id]);
      await client.query(`INSERT INTO stock_movements(id,tenant_id,company_id,warehouse_id,product_id,movement_type,quantity_base,unit_cost,reference_type,reference_id,reference_no,created_by)
        VALUES($1,$2,$3,$4,$5,'PURCHASE_RECEIPT',$6,$7,'business_document',$8,$9,$10)`, [stockMovementId,req.user.tenant_id,weight.company_id,weight.warehouse_id,product.id,quantity,num(weight.unit_price),receiptId,receiptNo,req.user.id]);
      await client.query(`UPDATE weight_tickets SET status='CONFIRMED',farm_id=$1,parcel_id=$2,harvest_date=$3,quality_status=$4,lot_id=$5,receipt_document_id=$6,posted_by=$7,confirmed_at=NOW(),updated_at=NOW() WHERE id=$8`, [input.farmId,input.parcelId,input.harvestDate,qualityStatus,lotId,receiptId,req.user.id,weight.id]);

      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'WEIGHT_POST_AUTO_LOT',entityType:'weight_ticket',entityId:weight.id,companyId:weight.company_id,metadata:{weightDocumentNo:weight.document_no,receiptDocumentNo:receiptNo,lotNumber,quantity,farmId:input.farmId,parcelId:input.parcelId},ip:req.ip},client);
      await addChange(client,req.user,weight.company_id,'weight_ticket',weight.id,'POST',{lotId,lotNumber,receiptId,receiptNo});
      await addChange(client,req.user,weight.company_id,'trace_lot',lotId,'CREATE',{lotNumber,quantity,status:lotStatus});
      await addChange(client,req.user,weight.company_id,'business_document',receiptId,'POST',{docType:'PURCHASE_RECEIPT',documentNo:receiptNo});
      await client.query('COMMIT');

      emitTenant(req.user.tenant_id,'weights',{action:'posted',id:weight.id,lotId,receiptId});
      emitTenant(req.user.tenant_id,'traceLots',{action:'created',id:lotId,lotNumber});
      emitTenant(req.user.tenant_id,'documents',{action:'confirmed',id:receiptId,docType:'PURCHASE_RECEIPT'});
      emitTenant(req.user.tenant_id,'stock',{action:'changed',productId:product.id,warehouseId:weight.warehouse_id});
      res.json({weightTicketId:weight.id,status:'CONFIRMED',lot:{id:lotId,lotNumber,status:lotStatus,qualityStatus,quantityCreated:quantity,quantityAvailable:quantity},receipt:{id:receiptId,documentNo:receiptNo,status:'CONFIRMED'}});
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/trace/lots/:id/quality-check', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = qualitySchema.parse(req.body);
      await client.query('BEGIN');
      const lotResult = await client.query(`SELECT * FROM trace_lots WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [req.params.id,req.user.tenant_id]);
      const lot = lotResult.rows[0];
      if (!lot) throw requestError('Loti nuk u gjet.',404);
      await assertCompanyAccess(req.user,lot.company_id,client);
      if (['CANCELLED','DEPLETED'].includes(lot.status)) throw requestError('Statusi i lotit nuk lejon kontroll cilësie.',409);
      const sequence = await nextSequence(client,req.user.tenant_id,lot.company_id,`QC-${new Date().getFullYear()}`);
      const checkNo = `QC-${new Date().getFullYear()}-${String(sequence).padStart(6,'0')}`;
      const id = randomUUID();
      await client.query(`INSERT INTO trace_quality_checks(id,tenant_id,company_id,lot_id,check_no,result,moisture_percent,impurity_percent,laboratory_reference,notes,checked_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id,req.user.tenant_id,lot.company_id,lot.id,checkNo,input.result,input.moisturePercent??null,input.impurityPercent??null,input.laboratoryReference||null,input.notes||null,req.user.id]);
      const newStatus = lotStatusFromQuality(input.result);
      await client.query(`UPDATE trace_lots SET quality_status=$1,status=$2,version=version+1,updated_at=NOW() WHERE id=$3`, [input.result,newStatus,lot.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'LOT_QUALITY_CHECK',entityType:'trace_lot',entityId:lot.id,companyId:lot.company_id,metadata:{lotNumber:lot.lot_number,checkNo,result:input.result,newStatus},ip:req.ip},client);
      await addChange(client,req.user,lot.company_id,'trace_lot',lot.id,'STATUS',{qualityStatus:input.result,status:newStatus,checkNo});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'traceLots',{action:'quality',id:lot.id,status:newStatus});
      res.status(201).json({id,checkNo,lotId:lot.id,qualityStatus:input.result,status:newStatus});
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });
}
