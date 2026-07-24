import { readFileSync } from 'node:fs';
import { z } from 'zod';

const catalog = JSON.parse(readFileSync(new URL('./biobes-product-codes.json', import.meta.url), 'utf8'));
const WRITE_ROLES = ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','OPERATOR_PESHORE','SHITES'];
const ORIGIN_RE = /^(M(?:0[1-9]|1[0-2])|K(?:0[0-9]|1[0-7])|S(?:0[1-9]|1[0-2])|W\d{2}|A\d{2})$/;
const PERIODS = new Set(['I','II','III']);
const MOVEMENTS = new Set([0,1,2,3,4,5,6,7,8,9]);
const COUNTRY_CODES = new Map([
  ['AUSTRIA',1],['AUSTRI',1],
  ['GREECE',2],['GREQI',2],['GREQIA',2],
  ['HUNGARY',3],['HUNGARI',3],['HUNGARIA',3],
  ['GERMANY',4],['GJERMANI',4],['GJERMANIA',4],
  ['MACEDONIA',5],['MAQEDONI',5],['MAQEDONIA',5],['NORTH MACEDONIA',5],
  ['SERBIA',6],['SERBI',6],
  ['BULGARIA',7],['BULLGARI',7],['BULGARI',7],
  ['ISRAEL',8],['IZRAEL',8],
  ['POLAND',9],['POLONI',9],['POLONIA',9],
]);

export const BIOBES_PRODUCT_CODES = Object.freeze(catalog);

export function normalizeTraceName(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/Ë/g,'E')
    .replace(/Ç/g,'C')
    .replace(/[^A-Z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const uniqueNameIndex = (() => {
  const grouped = new Map();
  for (const item of catalog) {
    const key = normalizeTraceName(item.name);
    if (!key) continue;
    const list = grouped.get(key) || [];
    list.push(item.code);
    grouped.set(key,list);
  }
  const result = new Map();
  for (const [key,codes] of grouped) if (codes.length === 1) result.set(key,codes[0]);
  return result;
})();

export function productTraceCode(product) {
  const explicit = String(product?.trace_code || product?.traceCode || '').trim();
  if (/^\d{3}$/.test(explicit) && catalog.some((item) => item.code === explicit)) return explicit;
  const fromCode = String(product?.code || '').match(/(?:^|\D)(\d{3})(?:\D|$)/)?.[1];
  if (fromCode && catalog.some((item) => item.code === fromCode)) return fromCode;
  const name = normalizeTraceName(product?.name);
  return uniqueNameIndex.get(name) || null;
}

export function destinationCountryCode(value) {
  const normalized = normalizeTraceName(value);
  if (!normalized) return 0;
  for (const [country,code] of COUNTRY_CODES) {
    if (normalized.includes(country)) return code;
  }
  return 0;
}

export function buildBiobesLotCode({
  companyPrefix='B',movementCode,originCode,routingCode=0,sublotCodes,
  harvestPeriod='I',productCode,productionYear,
}) {
  const prefix = String(companyPrefix || 'B').trim().toUpperCase();
  const movement = Number(movementCode);
  const origin = String(originCode || '').trim().toUpperCase();
  const route = Number(routingCode);
  const period = String(harvestPeriod || 'I').trim().toUpperCase();
  const product = String(productCode || '').trim();
  const year = String(productionYear ?? '').slice(-2).padStart(2,'0');
  const sublots = [...new Set((Array.isArray(sublotCodes)?sublotCodes:[sublotCodes])
    .map(Number).filter((value)=>Number.isInteger(value)&&value>=1&&value<=9))].sort((a,b)=>a-b);
  if (!/^[A-Z]$/.test(prefix)) throw new Error('Prefiksi i kompanisë duhet të jetë një shkronjë, p.sh. B.');
  if (!MOVEMENTS.has(movement)) throw new Error('Kodi i lëvizjes duhet të jetë nga 0 në 9.');
  if (!ORIGIN_RE.test(origin)) throw new Error(`Kodi i origjinës ${origin || '—'} nuk është i vlefshëm.`);
  if (!Number.isInteger(route)||route<0||route>9) throw new Error('Kodi i grupit/destinacionit duhet të jetë nga 0 në 9.');
  if (!sublots.length) throw new Error('Duhet të ketë të paktën një nënlot nga 1 në 9.');
  if (!PERIODS.has(period)) throw new Error('Periudha e vjeljes duhet të jetë I, II ose III.');
  if (!/^\d{3}$/.test(product)) throw new Error('Kodi i artikullit duhet të ketë 3 shifra.');
  if (!/^\d{2}$/.test(year)) throw new Error('Viti duhet të japë 2 shifrat e fundit.');
  return `${prefix}${movement}${origin}${route}/${sublots.join('/')}-${period}-${product}-${year}`;
}

function requestError(message,status=400){const error=new Error(message);error.status=status;return error;}

async function seedCatalog(pool) {
  await pool.query(`
    INSERT INTO trace_product_code_catalog(code,name,category,active)
    SELECT x.code,x.name,NULLIF(x.category,''),TRUE
    FROM jsonb_to_recordset($1::jsonb) AS x(code VARCHAR,name TEXT,category TEXT)
    ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,active=TRUE,updated_at=NOW()
  `,[JSON.stringify(catalog)]);
}

async function backfillProductCodes(pool) {
  const { rows } = await pool.query('SELECT id,code,name,trace_code FROM products');
  for (const product of rows) {
    if (/^\d{3}$/.test(String(product.trace_code||''))) continue;
    const code = productTraceCode(product);
    if (code) await pool.query('UPDATE products SET trace_code=$1 WHERE id=$2',[code,product.id]);
  }
}

export async function migrateBiobesLotCode(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trace_product_code_catalog(
      code VARCHAR(3) PRIMARY KEY,
      name VARCHAR(220) NOT NULL,
      category VARCHAR(100),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE products ADD COLUMN IF NOT EXISTS trace_code VARCHAR(3);
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS trace_lot_prefix VARCHAR(1) NOT NULL DEFAULT 'B';
    ALTER TABLE business_partners ADD COLUMN IF NOT EXISTS trace_origin_code VARCHAR(3);
    ALTER TABLE business_partners ADD COLUMN IF NOT EXISTS trace_group_code SMALLINT;
    ALTER TABLE business_partners ADD COLUMN IF NOT EXISTS trace_destination_code SMALLINT;
    ALTER TABLE trace_farms ADD COLUMN IF NOT EXISTS trace_origin_code VARCHAR(3);
    ALTER TABLE trace_farms ADD COLUMN IF NOT EXISTS trace_group_code SMALLINT;
    ALTER TABLE trace_parcels ADD COLUMN IF NOT EXISTS trace_origin_code VARCHAR(3);
    ALTER TABLE trace_parcels ADD COLUMN IF NOT EXISTS trace_group_code SMALLINT;
    ALTER TABLE weight_tickets ADD COLUMN IF NOT EXISTS harvest_period VARCHAR(3) NOT NULL DEFAULT 'I';

    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS movement_code SMALLINT;
    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS origin_code VARCHAR(3);
    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS routing_code SMALLINT;
    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS sublot_codes SMALLINT[];
    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS harvest_period VARCHAR(3);
    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS product_trace_code VARCHAR(3);
    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS production_year SMALLINT;
    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS lot_code_version SMALLINT NOT NULL DEFAULT 1;

    ALTER TABLE export_shipment_items ADD COLUMN IF NOT EXISTS sale_lot_number VARCHAR(160);
    ALTER TABLE export_shipment_items ADD COLUMN IF NOT EXISTS sale_movement_code SMALLINT;
    ALTER TABLE export_shipment_items ADD COLUMN IF NOT EXISTS sale_routing_code SMALLINT;

    DO $$ BEGIN
      ALTER TABLE products ADD CONSTRAINT products_trace_code_format CHECK(trace_code IS NULL OR trace_code ~ '^[0-9]{3}$');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE business_partners ADD CONSTRAINT partners_trace_group_range CHECK(trace_group_code IS NULL OR trace_group_code BETWEEN 0 AND 9);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE business_partners ADD CONSTRAINT partners_destination_range CHECK(trace_destination_code IS NULL OR trace_destination_code BETWEEN 0 AND 9);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE trace_farms ADD CONSTRAINT farms_trace_group_range CHECK(trace_group_code IS NULL OR trace_group_code BETWEEN 0 AND 9);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE trace_parcels ADD CONSTRAINT parcels_trace_group_range CHECK(trace_group_code IS NULL OR trace_group_code BETWEEN 0 AND 9);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE weight_tickets ADD CONSTRAINT weight_harvest_period_check CHECK(harvest_period IN ('I','II','III'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    UPDATE trace_farms SET trace_origin_code=UPPER(code)
      WHERE trace_origin_code IS NULL AND UPPER(code) ~ '^(M(0[1-9]|1[0-2])|K(0[0-9]|1[0-7])|S(0[1-9]|1[0-2])|W[0-9]{2}|A[0-9]{2})$';
    UPDATE trace_parcels SET trace_origin_code=UPPER(code)
      WHERE trace_origin_code IS NULL AND UPPER(code) ~ '^(M(0[1-9]|1[0-2])|K(0[0-9]|1[0-7])|S(0[1-9]|1[0-2])|W[0-9]{2}|A[0-9]{2})$';

    CREATE OR REPLACE FUNCTION sg_biobes_normalize(value TEXT)
    RETURNS TEXT AS $$
      SELECT trim(regexp_replace(translate(upper(COALESCE(value,'')),'ËÇ','EC'),'[^A-Z0-9]+',' ','g'));
    $$ LANGUAGE SQL IMMUTABLE;

    CREATE OR REPLACE FUNCTION sg_biobes_prepare_product_code()
    RETURNS TRIGGER AS $$
    DECLARE v_code TEXT; v_count INTEGER;
    BEGIN
      IF NEW.trace_code IS NOT NULL AND NEW.trace_code <> '' THEN
        IF NOT EXISTS(SELECT 1 FROM trace_product_code_catalog WHERE code=NEW.trace_code AND active=TRUE) THEN
          RAISE EXCEPTION 'Kodi BioBes % nuk gjendet në katalogun KODET.xlsx',NEW.trace_code;
        END IF;
        RETURN NEW;
      END IF;
      SELECT substring(NEW.code FROM '(^|[^0-9])([0-9]{3})([^0-9]|$)') INTO v_code;
      IF v_code IS NOT NULL THEN v_code:=regexp_replace(v_code,'[^0-9]','','g'); END IF;
      IF v_code IS NOT NULL AND EXISTS(SELECT 1 FROM trace_product_code_catalog WHERE code=v_code) THEN
        NEW.trace_code:=v_code; RETURN NEW;
      END IF;
      SELECT COUNT(*),MIN(code) INTO v_count,v_code FROM trace_product_code_catalog
       WHERE sg_biobes_normalize(name)=sg_biobes_normalize(NEW.name) AND active=TRUE;
      IF v_count=1 THEN NEW.trace_code:=v_code; END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_sg_biobes_prepare_product_code ON products;
    CREATE TRIGGER trg_sg_biobes_prepare_product_code
      BEFORE INSERT OR UPDATE OF code,name,trace_code ON products
      FOR EACH ROW EXECUTE FUNCTION sg_biobes_prepare_product_code();

    CREATE OR REPLACE FUNCTION sg_biobes_country_code(value TEXT)
    RETURNS SMALLINT AS $$
    DECLARE v TEXT := sg_biobes_normalize(value);
    BEGIN
      IF v LIKE '%AUSTR%' THEN RETURN 1; END IF;
      IF v LIKE '%GREEC%' OR v LIKE '%GREQ%' THEN RETURN 2; END IF;
      IF v LIKE '%HUNGAR%' THEN RETURN 3; END IF;
      IF v LIKE '%GERMAN%' OR v LIKE '%GJERMAN%' THEN RETURN 4; END IF;
      IF v LIKE '%MACEDON%' OR v LIKE '%MAQEDON%' THEN RETURN 5; END IF;
      IF v LIKE '%SERBI%' THEN RETURN 6; END IF;
      IF v LIKE '%BULGAR%' OR v LIKE '%BULLGAR%' THEN RETURN 7; END IF;
      IF v LIKE '%ISRAEL%' OR v LIKE '%IZRAEL%' THEN RETURN 8; END IF;
      IF v LIKE '%POLAND%' OR v LIKE '%POLON%' THEN RETURN 9; END IF;
      RETURN 0;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    CREATE OR REPLACE FUNCTION sg_biobes_lot_code(p_prefix TEXT,p_movement SMALLINT,p_origin TEXT,p_routing SMALLINT,p_sublots SMALLINT[],p_period TEXT,p_product TEXT,p_year SMALLINT)
    RETURNS TEXT AS $$
    DECLARE v_sublots TEXT;
    BEGIN
      IF p_movement NOT BETWEEN 0 AND 9 THEN RAISE EXCEPTION 'Kodi i lëvizjes duhet 0-9'; END IF;
      IF UPPER(p_origin) !~ '^(M(0[1-9]|1[0-2])|K(0[0-9]|1[0-7])|S(0[1-9]|1[0-2])|W[0-9]{2}|A[0-9]{2})$' THEN RAISE EXCEPTION 'Origjina BioBes % nuk është e vlefshme',p_origin; END IF;
      IF p_routing NOT BETWEEN 0 AND 9 THEN RAISE EXCEPTION 'Kodi grup/destinacion duhet 0-9'; END IF;
      IF UPPER(p_period) NOT IN ('I','II','III') THEN RAISE EXCEPTION 'Periudha duhet I, II ose III'; END IF;
      IF p_product !~ '^[0-9]{3}$' THEN RAISE EXCEPTION 'Kodi i artikullit duhet 3 shifra'; END IF;
      SELECT string_agg(value::TEXT,'/' ORDER BY value) INTO v_sublots
        FROM(SELECT DISTINCT unnest(p_sublots) AS value)x WHERE value BETWEEN 1 AND 9;
      IF COALESCE(v_sublots,'')='' THEN RAISE EXCEPTION 'Loti BioBes kërkon nënlot 1-9'; END IF;
      RETURN UPPER(COALESCE(NULLIF(p_prefix,''),'B'))||p_movement::TEXT||UPPER(p_origin)||p_routing::TEXT||'/'||v_sublots||'-'||UPPER(p_period)||'-'||p_product||'-'||LPAD((p_year%100)::TEXT,2,'0');
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    CREATE OR REPLACE FUNCTION sg_biobes_prepare_inventory_lot()
    RETURNS TRIGGER AS $$
    DECLARE
      v_prefix TEXT; v_product_code TEXT; v_origin TEXT; v_routing SMALLINT; v_manual_routing SMALLINT;
      v_sublots SMALLINT[]; v_period TEXT; v_year SMALLINT; v_movement SMALLINT; v_seq BIGINT;
      v_distinct_origins INTEGER; v_distinct_routing INTEGER; v_distinct_periods INTEGER; v_distinct_years INTEGER;
    BEGIN
      SELECT c.trace_lot_prefix,p.trace_code INTO v_prefix,v_product_code
        FROM companies c JOIN products p ON p.id=NEW.product_id WHERE c.id=NEW.company_id;
      IF v_product_code IS NULL OR v_product_code !~ '^[0-9]{3}$' THEN RETURN NEW; END IF;

      v_origin:=NULLIF(UPPER(COALESCE(NEW.origin_code,'')),'');
      v_routing:=NEW.routing_code; v_sublots:=NEW.sublot_codes;
      v_period:=NULLIF(UPPER(COALESCE(NEW.harvest_period,'')),'');
      v_year:=NEW.production_year; v_movement:=NEW.movement_code;

      IF NEW.source_process_order_id IS NOT NULL THEN
        SELECT COUNT(DISTINCT l.origin_code),COUNT(DISTINCT l.routing_code),COUNT(DISTINCT l.harvest_period),COUNT(DISTINCT l.production_year),
               MIN(l.origin_code),MIN(l.routing_code),MIN(l.harvest_period),MIN(l.production_year),
               ARRAY(SELECT DISTINCT u.s FROM process_order_inputs poi2 JOIN trace_lots l2 ON l2.id=poi2.lot_id CROSS JOIN LATERAL unnest(l2.sublot_codes) AS u(s) WHERE poi2.process_order_id=NEW.source_process_order_id ORDER BY u.s)
          INTO v_distinct_origins,v_distinct_routing,v_distinct_periods,v_distinct_years,v_origin,v_routing,v_period,v_year,v_sublots
          FROM process_order_inputs poi JOIN trace_lots l ON l.id=poi.lot_id WHERE poi.process_order_id=NEW.source_process_order_id;
        IF v_distinct_origins>1 OR v_distinct_routing>1 OR v_distinct_periods>1 OR v_distinct_years>1 THEN
          RAISE EXCEPTION 'Procesi bashkon lote me origjinë/grup/periudhë/vit të ndryshëm. Krijoni dalje të ndara.';
        END IF;
      ELSIF NEW.source_packaging_order_id IS NOT NULL THEN
        SELECT l.origin_code,l.routing_code,l.sublot_codes,l.harvest_period,l.production_year INTO v_origin,v_routing,v_sublots,v_period,v_year
          FROM packaging_orders po JOIN trace_lots l ON l.id=po.input_lot_id WHERE po.id=NEW.source_packaging_order_id;
      ELSIF NEW.parent_lot_id IS NOT NULL THEN
        SELECT origin_code,routing_code,sublot_codes,harvest_period,production_year INTO v_origin,v_routing,v_sublots,v_period,v_year FROM trace_lots WHERE id=NEW.parent_lot_id;
      END IF;

      SELECT COALESCE(v_origin,NULLIF(UPPER(pa.trace_origin_code),''),CASE WHEN UPPER(pa.code)~'^(M(0[1-9]|1[0-2])|K(0[0-9]|1[0-7])|S(0[1-9]|1[0-2])|W[0-9]{2}|A[0-9]{2})$' THEN UPPER(pa.code) END,
             NULLIF(UPPER(f.trace_origin_code),''),CASE WHEN UPPER(f.code)~'^(M(0[1-9]|1[0-2])|K(0[0-9]|1[0-7])|S(0[1-9]|1[0-2])|W[0-9]{2}|A[0-9]{2})$' THEN UPPER(f.code) END,NULLIF(UPPER(bp.trace_origin_code),''),'A01'),
             COALESCE(v_routing,pa.trace_group_code,f.trace_group_code,bp.trace_group_code),
             COALESCE(v_period,wt.harvest_period)
        INTO v_origin,v_manual_routing,v_period
        FROM(SELECT 1)q LEFT JOIN trace_parcels pa ON pa.id=NEW.parcel_id LEFT JOIN trace_farms f ON f.id=NEW.farm_id
        LEFT JOIN business_partners bp ON bp.id=NEW.supplier_id LEFT JOIN weight_tickets wt ON wt.id=NEW.source_weight_ticket_id;
      v_routing:=COALESCE(v_manual_routing,v_routing);
      v_period:=COALESCE(v_period,'I');
      v_year:=COALESCE(v_year,EXTRACT(YEAR FROM COALESCE(NEW.harvest_date,NEW.production_date,CURRENT_DATE))::SMALLINT);

      IF v_sublots IS NULL OR cardinality(v_sublots)=0 THEN
        IF v_routing IS NOT NULL THEN
          INSERT INTO trace_lot_sequences(tenant_id,company_id,sequence_key,last_value)
          VALUES(NEW.tenant_id,NEW.company_id,'BIOBES-SUBLOT-'||v_origin||'-'||v_routing||'-'||v_product_code||'-'||v_period||'-'||v_year,1)
          ON CONFLICT(tenant_id,company_id,sequence_key) DO UPDATE SET last_value=trace_lot_sequences.last_value+1,updated_at=NOW() RETURNING last_value INTO v_seq;
          IF v_seq>9 THEN RAISE EXCEPTION 'U arrit kufiri 9 nënlote për origjinën %, grupin %, artikullin %, periudhën %, vitin %',v_origin,v_routing,v_product_code,v_period,v_year; END IF;
          v_sublots:=ARRAY[v_seq::SMALLINT];
        ELSE
          INSERT INTO trace_lot_sequences(tenant_id,company_id,sequence_key,last_value)
          VALUES(NEW.tenant_id,NEW.company_id,'BIOBES-AUTO-'||v_origin||'-'||v_product_code||'-'||v_period||'-'||v_year,1)
          ON CONFLICT(tenant_id,company_id,sequence_key) DO UPDATE SET last_value=trace_lot_sequences.last_value+1,updated_at=NOW() RETURNING last_value INTO v_seq;
          IF v_seq>90 THEN RAISE EXCEPTION 'U arrit kufiri 90 lote për origjinën %, artikullin %, periudhën %, vitin %',v_origin,v_product_code,v_period,v_year; END IF;
          v_routing:=FLOOR((v_seq-1)/9)::SMALLINT; v_sublots:=ARRAY[((v_seq-1)%9+1)::SMALLINT];
        END IF;
      END IF;

      v_routing:=COALESCE(v_routing,0);
      v_movement:=COALESCE(v_movement,CASE WHEN NEW.lot_type='RAW' AND LEFT(v_origin,1) IN('K','W') THEN 1 WHEN NEW.lot_type='RAW' THEN 0 WHEN NEW.lot_type IN('PROCESSED','PACKAGED') THEN 6 WHEN NEW.lot_type='RETURN' THEN 7 ELSE 6 END);
      NEW.movement_code:=v_movement; NEW.origin_code:=v_origin; NEW.routing_code:=v_routing; NEW.sublot_codes:=v_sublots;
      NEW.harvest_period:=v_period; NEW.product_trace_code:=v_product_code; NEW.production_year:=v_year; NEW.lot_code_version:=1;
      NEW.lot_number:=sg_biobes_lot_code(v_prefix,v_movement,v_origin,v_routing,v_sublots,v_period,v_product_code,v_year);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_sg_biobes_prepare_inventory_lot ON trace_lots;
    CREATE TRIGGER trg_sg_biobes_prepare_inventory_lot
      BEFORE INSERT OR UPDATE OF product_id,company_id,lot_type,harvest_date,production_date,parent_lot_id,source_process_order_id,source_packaging_order_id,origin_code,routing_code,sublot_codes,harvest_period,product_trace_code,production_year,movement_code
      ON trace_lots FOR EACH ROW EXECUTE FUNCTION sg_biobes_prepare_inventory_lot();

    CREATE OR REPLACE FUNCTION sg_biobes_prepare_sale_lot()
    RETURNS TRIGGER AS $$
    DECLARE v_lot trace_lots%ROWTYPE; v_prefix TEXT; v_customer_route SMALLINT; v_country_route SMALLINT; v_route SMALLINT; v_movement SMALLINT;
    BEGIN
      SELECT l.* INTO v_lot FROM trace_lots l WHERE l.id=NEW.lot_id;
      IF v_lot.product_trace_code IS NULL THEN RETURN NEW; END IF;
      SELECT c.trace_lot_prefix,bp.trace_destination_code,sg_biobes_country_code(COALESCE(s.destination_country,s.destination))
        INTO v_prefix,v_customer_route,v_country_route FROM export_shipments s JOIN companies c ON c.id=s.company_id JOIN business_partners bp ON bp.id=s.customer_id WHERE s.id=NEW.shipment_id;
      IF LEFT(v_lot.origin_code,1) IN('K','W') OR v_lot.movement_code IN(1,2,8) THEN v_movement:=2; v_route:=COALESCE(v_customer_route,v_country_route,0);
      ELSE v_movement:=3; v_route:=COALESCE(v_lot.routing_code,0); END IF;
      NEW.sale_movement_code:=v_movement; NEW.sale_routing_code:=v_route;
      NEW.sale_lot_number:=sg_biobes_lot_code(v_prefix,v_movement,v_lot.origin_code,v_route,v_lot.sublot_codes,v_lot.harvest_period,v_lot.product_trace_code,v_lot.production_year);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_sg_biobes_prepare_sale_lot ON export_shipment_items;
    CREATE TRIGGER trg_sg_biobes_prepare_sale_lot BEFORE INSERT OR UPDATE OF shipment_id,lot_id,product_id ON export_shipment_items FOR EACH ROW EXECUTE FUNCTION sg_biobes_prepare_sale_lot();

    CREATE INDEX IF NOT EXISTS idx_trace_lots_biobes_code ON trace_lots(tenant_id,company_id,product_trace_code,origin_code,production_year);
    CREATE INDEX IF NOT EXISTS idx_export_items_sale_lot ON export_shipment_items(sale_lot_number);
  `);
  await seedCatalog(pool);
  await backfillProductCodes(pool);
}

export function rewriteShipmentLotSql(sql) {
  if (typeof sql!=='string') return sql;
  if (!/FROM\s+export_shipment_items\s+si/i.test(sql)||!/'lotNumber'\s*,\s*l\.lot_number/i.test(sql)) return sql;
  return sql.replace(/'lotNumber'\s*,\s*l\.lot_number/i,"'lotNumber',COALESCE(si.sale_lot_number,l.lot_number),'inventoryLotNumber',l.lot_number,'saleLotNumber',si.sale_lot_number");
}

export function installBiobesLotCodeRoutes({app,pool,authRequired,requireRoles,assertCompanyAccess,accessibleCompanyIds}) {
  const metaSchema=z.object({harvestPeriod:z.enum(['I','II','III']).default('I')});
  const farmMetaSchema=z.object({originCode:z.string().trim().toUpperCase().regex(ORIGIN_RE).nullable().optional(),groupCode:z.coerce.number().int().min(0).max(9).nullable().optional()});
  const productMetaSchema=z.object({traceCode:z.string().trim().regex(/^\d{3}$/)});

  app.get('/api/trace/product-codes',authRequired,async(req,res,next)=>{try{res.json(BIOBES_PRODUCT_CODES);}catch(error){next(error);}});
  app.patch('/api/trace/weights/:id/biobes-meta',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{try{const input=metaSchema.parse(req.body||{});const current=await pool.query('SELECT id,company_id,status FROM weight_tickets WHERE id=$1 AND tenant_id=$2',[req.params.id,req.user.tenant_id]);if(!current.rows[0])throw requestError('Formulari i peshës nuk u gjet.',404);await assertCompanyAccess(req.user,current.rows[0].company_id);if(current.rows[0].status!=='DRAFT')throw requestError('Periudha ndryshohet vetëm sa formulari është Draft.',409);const{rows}=await pool.query('UPDATE weight_tickets SET harvest_period=$1,updated_at=NOW() WHERE id=$2 RETURNING id,harvest_period',[input.harvestPeriod,req.params.id]);res.json(rows[0]);}catch(error){next(error);}});
  app.patch('/api/trace/farms/:id/biobes-meta',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{try{const input=farmMetaSchema.parse(req.body||{});const current=await pool.query('SELECT id,company_id FROM trace_farms WHERE id=$1 AND tenant_id=$2',[req.params.id,req.user.tenant_id]);if(!current.rows[0])throw requestError('Ferma nuk u gjet.',404);await assertCompanyAccess(req.user,current.rows[0].company_id);const{rows}=await pool.query('UPDATE trace_farms SET trace_origin_code=$1,trace_group_code=$2,updated_at=NOW() WHERE id=$3 RETURNING *',[input.originCode||null,input.groupCode??null,req.params.id]);res.json(rows[0]);}catch(error){next(error);}});
  app.patch('/api/products/:id/trace-code',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{try{const input=productMetaSchema.parse(req.body||{});if(!BIOBES_PRODUCT_CODES.some((item)=>item.code===input.traceCode))throw requestError('Kodi nuk gjendet në KODET.xlsx.');const current=await pool.query('SELECT id,company_id FROM products WHERE id=$1 AND tenant_id=$2',[req.params.id,req.user.tenant_id]);if(!current.rows[0])throw requestError('Artikulli nuk u gjet.',404);await assertCompanyAccess(req.user,current.rows[0].company_id);const{rows}=await pool.query('UPDATE products SET trace_code=$1,updated_at=NOW() WHERE id=$2 RETURNING id,code,name,trace_code',[input.traceCode,req.params.id]);res.json(rows[0]);}catch(error){next(error);}});
  app.get('/api/trace/lots/:id/biobes-code',authRequired,async(req,res,next)=>{try{const ids=await accessibleCompanyIds(req.user);const{rows}=await pool.query(`SELECT l.id,l.lot_number,l.movement_code,l.origin_code,l.routing_code,l.sublot_codes,l.harvest_period,l.product_trace_code,l.production_year,l.lot_type,l.status,p.name AS product_name FROM trace_lots l JOIN products p ON p.id=l.product_id WHERE l.id=$1 AND l.tenant_id=$2 AND l.company_id=ANY($3::uuid[])`,[req.params.id,req.user.tenant_id,ids]);if(!rows[0])throw requestError('Loti nuk u gjet.',404);res.json(rows[0]);}catch(error){next(error);}});
}
