import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  BIOBES_PRODUCT_CODES,
  buildBiobesLotCode,
  destinationCountryCode,
  migrateBiobesLotCode,
  productTraceCode,
  rewriteShipmentLotSql,
} from './src/biobes-lot-code.js';
import { migrateBiobesLotStageCompatibility } from './src/biobes-lot-stage-compat.js';

assert.equal(BIOBES_PRODUCT_CODES.length,165);
assert.equal(productTraceCode({code:'105',name:'Ferra'}),'105');
assert.equal(productTraceCode({code:'FER-RAW',name:'Ferra'}),'105');
assert.equal(destinationCountryCode('Germany'),4);
assert.equal(buildBiobesLotCode({movementCode:3,originCode:'S01',routingCode:0,sublotCodes:[9,1,5,5],harvestPeriod:'I',productCode:'105',productionYear:2026}),'B3S010/1/5/9-I-105-26');
assert.match(rewriteShipmentLotSql("SELECT json_build_object('lotNumber',l.lot_number) FROM export_shipment_items si JOIN trace_lots l ON l.id=si.lot_id"),/saleLotNumber/);

if (!process.env.DATABASE_URL) {
  console.log('BioBes unit checks passed; DATABASE_URL mungon, testi PostgreSQL u anashkalua.');
  process.exit(0);
}

const { default:pg } = await import('pg');
const { Pool } = pg;
const pool = new Pool({connectionString:process.env.DATABASE_URL,ssl:false});
const schema = `biobes_${Date.now()}_${Math.floor(Math.random()*10000)}`;
const q = (sql,params=[])=>pool.query(sql,params);

try {
  await q(`CREATE SCHEMA ${schema}`);
  await q(`SET search_path TO ${schema},public`);
  await q(`
    CREATE TABLE tenants(id UUID PRIMARY KEY);
    CREATE TABLE companies(id UUID PRIMARY KEY,tenant_id UUID NOT NULL,name TEXT NOT NULL);
    CREATE TABLE products(id UUID PRIMARY KEY,tenant_id UUID NOT NULL,company_id UUID NOT NULL,code TEXT,name TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE business_partners(id UUID PRIMARY KEY,tenant_id UUID NOT NULL,company_id UUID NOT NULL,code TEXT,name TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE trace_farms(id UUID PRIMARY KEY,tenant_id UUID NOT NULL,company_id UUID NOT NULL,supplier_id UUID,code TEXT,name TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE trace_parcels(id UUID PRIMARY KEY,tenant_id UUID NOT NULL,company_id UUID NOT NULL,farm_id UUID,code TEXT,name TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE weight_tickets(id UUID PRIMARY KEY,tenant_id UUID NOT NULL,company_id UUID NOT NULL,status TEXT DEFAULT 'DRAFT',updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE trace_lot_sequences(tenant_id UUID NOT NULL,company_id UUID NOT NULL,sequence_key TEXT NOT NULL,last_value BIGINT NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(tenant_id,company_id,sequence_key));
    CREATE TABLE process_orders(id UUID PRIMARY KEY);
    CREATE TABLE packaging_orders(id UUID PRIMARY KEY,input_lot_id UUID);
    CREATE TABLE trace_lots(
      id UUID PRIMARY KEY,tenant_id UUID NOT NULL,company_id UUID NOT NULL,product_id UUID NOT NULL,supplier_id UUID,farm_id UUID,parcel_id UUID,
      parent_lot_id UUID,source_weight_ticket_id UUID,source_process_order_id UUID,source_packaging_order_id UUID,
      lot_number TEXT NOT NULL,lot_type TEXT NOT NULL,status TEXT,quality_status TEXT,harvest_date DATE,production_date DATE,
      quantity_created NUMERIC DEFAULT 0,quantity_available NUMERIC DEFAULT 0,quantity_consumed NUMERIC DEFAULT 0,
      UNIQUE(tenant_id,company_id,lot_number)
    );
    ALTER TABLE packaging_orders ADD CONSTRAINT packaging_input_fk FOREIGN KEY(input_lot_id) REFERENCES trace_lots(id);
    CREATE TABLE process_order_inputs(id UUID PRIMARY KEY,process_order_id UUID NOT NULL,lot_id UUID NOT NULL REFERENCES trace_lots(id),quantity NUMERIC NOT NULL);
    CREATE TABLE export_shipments(id UUID PRIMARY KEY,tenant_id UUID NOT NULL,company_id UUID NOT NULL,customer_id UUID NOT NULL,destination TEXT,destination_country TEXT);
    CREATE TABLE export_shipment_items(id UUID PRIMARY KEY,shipment_id UUID NOT NULL REFERENCES export_shipments(id),lot_id UUID NOT NULL REFERENCES trace_lots(id),product_id UUID NOT NULL);
  `);

  await migrateBiobesLotStageCompatibility(pool);
  await migrateBiobesLotCode(pool);

  const tenantId=randomUUID(),companyId=randomUUID(),productId=randomUUID(),supplierId=randomUUID(),farmId=randomUUID(),parcelId=randomUUID(),weightId=randomUUID();
  await q('INSERT INTO tenants(id) VALUES($1)',[tenantId]);
  await q("INSERT INTO companies(id,tenant_id,name,trace_lot_prefix) VALUES($1,$2,'BioBes','B')",[companyId,tenantId]);
  await q("INSERT INTO products(id,tenant_id,company_id,code,name) VALUES($1,$2,$3,'105','Ferra')",[productId,tenantId,companyId]);
  const product=await q('SELECT trace_code FROM products WHERE id=$1',[productId]);
  assert.equal(product.rows[0].trace_code,'105');
  await q("INSERT INTO business_partners(id,tenant_id,company_id,code,name) VALUES($1,$2,$3,'294','Fermer Test')",[supplierId,tenantId,companyId]);
  await q("INSERT INTO trace_farms(id,tenant_id,company_id,supplier_id,code,name,trace_origin_code,trace_group_code) VALUES($1,$2,$3,$4,'S01','Berat','S01',0)",[farmId,tenantId,companyId,supplierId]);
  await q("INSERT INTO trace_parcels(id,tenant_id,company_id,farm_id,code,name,trace_origin_code,trace_group_code) VALUES($1,$2,$3,$4,'P1','Zona 1','S01',0)",[parcelId,tenantId,companyId,farmId]);
  await q("INSERT INTO weight_tickets(id,tenant_id,company_id,status,harvest_period) VALUES($1,$2,$3,'DRAFT','I')",[weightId,tenantId,companyId]);

  const rawIds=[];
  for(let i=1;i<=9;i+=1){
    const id=randomUUID();rawIds.push(id);
    await q(`INSERT INTO trace_lots(id,tenant_id,company_id,product_id,supplier_id,farm_id,parcel_id,source_weight_ticket_id,lot_number,lot_type,status,quality_status,harvest_date,production_date,quantity_created,quantity_available)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'LEGACY','RAW','AVAILABLE','APPROVED','2026-05-01','2026-05-01',100,100)`,[id,tenantId,companyId,productId,supplierId,farmId,parcelId,weightId]);
  }
  const raw=await q('SELECT id,lot_number,routing_code,sublot_codes FROM trace_lots WHERE id=ANY($1::uuid[]) ORDER BY lot_number',[rawIds]);
  assert.equal(raw.rows.length,9);
  const rawBySub=new Map(raw.rows.map((row)=>[Number(row.sublot_codes[0]),row]));
  assert.equal(rawBySub.get(1).lot_number,'B0S010/1-I-105-26');
  assert.equal(rawBySub.get(9).lot_number,'B0S010/9-I-105-26');

  const processId=randomUUID();
  await q('INSERT INTO process_orders(id) VALUES($1)',[processId]);
  for(const sub of [1,5,9])await q('INSERT INTO process_order_inputs(id,process_order_id,lot_id,quantity) VALUES($1,$2,$3,10)',[randomUUID(),processId,rawBySub.get(sub).id]);
  const processedId=randomUUID();
  await q(`INSERT INTO trace_lots(id,tenant_id,company_id,product_id,source_process_order_id,lot_number,lot_type,status,quality_status,production_date,quantity_created,quantity_available)
    VALUES($1,$2,$3,$4,$5,'LEGACY','PROCESSED','AVAILABLE','APPROVED','2026-05-20',30,30)`,[processedId,tenantId,companyId,productId,processId]);
  const processed=await q('SELECT * FROM trace_lots WHERE id=$1',[processedId]);
  assert.equal(processed.rows[0].lot_number,'B6S010/1/5/9-I-105-26');

  const packagingId=randomUUID();
  await q('INSERT INTO packaging_orders(id,input_lot_id) VALUES($1,$2)',[packagingId,processedId]);
  const packagedId=randomUUID();
  await q(`INSERT INTO trace_lots(id,tenant_id,company_id,product_id,source_packaging_order_id,lot_number,lot_type,status,quality_status,production_date,quantity_created,quantity_available)
    VALUES($1,$2,$3,$4,$5,'LEGACY','PACKAGED','AVAILABLE','APPROVED','2026-05-21',30,30)`,[packagedId,tenantId,companyId,productId,packagingId]);
  const packaged=await q('SELECT * FROM trace_lots WHERE id=$1',[packagedId]);
  assert.equal(packaged.rows[0].lot_number,'B6S010/1/5/9-I-105-26');

  const customerId=randomUUID(),shipmentId=randomUUID(),shipmentItemId=randomUUID();
  await q("INSERT INTO business_partners(id,tenant_id,company_id,code,name) VALUES($1,$2,$3,'C01','Klient Gjermani')",[customerId,tenantId,companyId]);
  await q("INSERT INTO export_shipments(id,tenant_id,company_id,customer_id,destination,destination_country) VALUES($1,$2,$3,$4,'Berlin','Germany')",[shipmentId,tenantId,companyId,customerId]);
  await q('INSERT INTO export_shipment_items(id,shipment_id,lot_id,product_id) VALUES($1,$2,$3,$4)',[shipmentItemId,shipmentId,packagedId,productId]);
  const sale=await q('SELECT sale_lot_number,sale_movement_code,sale_routing_code FROM export_shipment_items WHERE id=$1',[shipmentItemId]);
  assert.deepEqual(sale.rows[0],{sale_lot_number:'B3S010/1/5/9-I-105-26',sale_movement_code:3,sale_routing_code:0});

  const organicFarmId=randomUUID(),organicParcelId=randomUUID(),organicWeightId=randomUUID(),organicLotId=randomUUID();
  await q("INSERT INTO trace_farms(id,tenant_id,company_id,supplier_id,code,name,trace_origin_code,trace_group_code) VALUES($1,$2,$3,$4,'W01','Zona Organike','W01',0)",[organicFarmId,tenantId,companyId,supplierId]);
  await q("INSERT INTO trace_parcels(id,tenant_id,company_id,farm_id,code,name,trace_origin_code,trace_group_code) VALUES($1,$2,$3,$4,'OW1','Zona O','W01',0)",[organicParcelId,tenantId,companyId,organicFarmId]);
  await q("INSERT INTO weight_tickets(id,tenant_id,company_id,status,harvest_period) VALUES($1,$2,$3,'DRAFT','I')",[organicWeightId,tenantId,companyId]);
  await q(`INSERT INTO trace_lots(id,tenant_id,company_id,product_id,supplier_id,farm_id,parcel_id,source_weight_ticket_id,lot_number,lot_type,status,quality_status,harvest_date,production_date,quantity_created,quantity_available)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'LEGACY','RAW','AVAILABLE','APPROVED','2026-05-01','2026-05-01',20,20)`,[organicLotId,tenantId,companyId,productId,supplierId,organicFarmId,organicParcelId,organicWeightId]);
  const organicRaw=await q('SELECT lot_number FROM trace_lots WHERE id=$1',[organicLotId]);
  assert.equal(organicRaw.rows[0].lot_number,'B1W010/1-I-105-26');
  const organicItemId=randomUUID();
  await q('INSERT INTO export_shipment_items(id,shipment_id,lot_id,product_id) VALUES($1,$2,$3,$4)',[organicItemId,shipmentId,organicLotId,productId]);
  const organicSale=await q('SELECT sale_lot_number FROM export_shipment_items WHERE id=$1',[organicItemId]);
  assert.equal(organicSale.rows[0].sale_lot_number,'B2W014/1-I-105-26');

  console.log('BioBes PostgreSQL lot lifecycle passed: RAW → PROCESS → PACKAGED → SALE, including organic destination code.');
} finally {
  try{await q(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);}catch{}
  await pool.end();
}
