import { z } from 'zod';

const text=(value)=>String(value??'').trim();
const camel=(row)=>Object.fromEntries(Object.entries(row||{}).map(([key,value])=>[key.replace(/_([a-z])/g,(_m,c)=>c.toUpperCase()),value]));
const num=(value)=>Number(value||0);

export const PHASE76_REPORTS=[
  {id:'stock-current',label:'Gjendja Aktuale e Stokut',category:'Gjendja',description:'Gjendja, rezervimi, sasia e lirë dhe vlera sipas lotit dhe lokacionit.'},
  {id:'stock-by-warehouse',label:'Stoku sipas Magazinës',category:'Gjendja',description:'Përmbledhje e artikujve për çdo magazinë.'},
  {id:'stock-by-location',label:'Stoku sipas Lokacionit',category:'Gjendja',description:'Gjendja sipas zonës, raftit dhe lokacionit fizik.'},
  {id:'stock-by-product',label:'Stoku sipas Artikullit',category:'Gjendja',description:'Përmbledhje e gjendjes dhe vlerës për artikull.'},
  {id:'stock-by-lot',label:'Stoku sipas Lotit',category:'Gjendja',description:'Gjendja, furnitori dhe cilësia për çdo lot.'},
  {id:'free-reserved',label:'Stoku i Lirë dhe i Rezervuar',category:'Gjendja',description:'Sasitë e lira, të rezervuara dhe bllokuara.'},
  {id:'product-ledger',label:'Kartela e Artikullit',category:'Kartela',description:'Të gjitha lëvizjet e artikullit me dokument burimor.'},
  {id:'lot-ledger',label:'Kartela e Lotit',category:'Kartela',description:'Historiku i plotë i lotit nga hyrja deri te dalja.'},
  {id:'receipts-register',label:'Regjistri i Fletë-Hyrjeve',category:'Dokumente',description:'Fletë-Hyrjet e validuara dhe draft me artikujt përkatës.'},
  {id:'deliveries-register',label:'Regjistri i Fletë-Daljeve',category:'Dokumente',description:'Fletë-Daljet, marrësit dhe sasitë e dërguara.'},
  {id:'moves-history',label:'Historiku i Lëvizjeve',category:'Lëvizje',description:'Çdo lëvizje nga një lokacion në tjetrin.'},
  {id:'internal-transfers',label:'Transferimet e Brendshme',category:'Lëvizje',description:'Sistemime, transferime dhe përgatitje daljeje.'},
  {id:'stock-at-date',label:'Stoku në një Datë',category:'Analizë',description:'Gjendja e rikonstruktuar në datën e zgjedhur.'},
  {id:'valuation',label:'Vlerësimi i Stokut',category:'Vlerësim',description:'Sasia, kostoja mesatare dhe vlera e inventarit.'},
  {id:'discrepancies',label:'Diferencat e Inventarit',category:'Inventar',description:'Teorikja, numërimi fizik dhe diferencat.'},
  {id:'slow-stock',label:'Stoku pa Lëvizje',category:'Analizë',description:'Artikujt pa lëvizje për numrin e zgjedhur të ditëve.'},
  {id:'below-minimum',label:'Artikujt nën Minimum',category:'Furnizim',description:'Rregullat min/max dhe sasia e rekomanduar për porosi.'},
  {id:'turnover',label:'Qarkullimi i Stokut',category:'Analizë',description:'Hyrjet, daljet, gjendja dhe treguesi i qarkullimit.'},
  {id:'in-out-period',label:'Hyrje-Dalje sipas Periudhës',category:'Analizë',description:'Përmbledhje e hyrjeve dhe daljeve për intervalin e datave.'},
  {id:'supplier-lot-customer',label:'Gjurmueshmëria Furnitor-Lot-Klient',category:'Gjurmueshmëri',description:'Lidhja e lotit me furnitorin, magazinën, klientët dhe dokumentet e daljes.'},
];

const detailsSchema=z.object({
  destinationAddress:z.string().max(500).optional().default(''),
  authorizedPerson:z.string().max(180).optional().default(''),
  vehiclePlate:z.string().max(80).optional().default(''),
  receiverName:z.string().max(180).optional().default(''),
  transporterName:z.string().max(180).optional().default(''),
  accountantName:z.string().max(180).optional().default(''),
  warehouseKeeperName:z.string().max(180).optional().default(''),
});

export async function migratePhase76InventoryReports(pool){
  await pool.query(`
    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS destination_address TEXT;
    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS authorized_person VARCHAR(180);
    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS vehicle_plate VARCHAR(80);
    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS receiver_name VARCHAR(180);
    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS transporter_name VARCHAR(180);
    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS accountant_name VARCHAR(180);
    ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS warehouse_keeper_name VARCHAR(180);
    CREATE INDEX IF NOT EXISTS idx_inventory_transfers_report_date ON inventory_transfers(tenant_id,company_id,scheduled_date,operation_kind,state);
  `);
}

function buildFilters(req,params,config={}){
  let where='';
  const add=(raw,expression,transform=(v)=>v)=>{const value=text(raw);if(!value)return;params.push(transform(value));where+=` AND ${expression.replace('?',`$${params.length}`)}`;};
  if(config.dateColumn){add(req.query.from,`${config.dateColumn}::date>=?::date`);add(req.query.to,`${config.dateColumn}::date<=?::date`);}
  if(config.warehouseColumn)add(req.query.warehouseId,`${config.warehouseColumn}=?::uuid`);
  if(config.locationColumn)add(req.query.locationId,`${config.locationColumn}=?::uuid`);
  if(config.productColumn)add(req.query.productId,`${config.productColumn}=?::uuid`);
  if(config.lotColumn)add(req.query.lotId,`${config.lotColumn}=?::uuid`);
  if(config.partnerColumn)add(req.query.partnerId,`${config.partnerColumn}=?::uuid`);
  const q=text(req.query.q);
  if(q&&config.searchColumns?.length){params.push(`%${q}%`);where+=` AND (${config.searchColumns.map((column)=>`COALESCE(${column}::text,'') ILIKE $${params.length}`).join(' OR ')})`;}
  return where;
}

function reportQuery(type,req,tenantId,companyIds){
  const params=[tenantId,companyIds];
  let sql='';
  if(type==='stock-current'||type==='free-reserved'){
    const where=buildFilters(req,params,{warehouseColumn:'q.warehouse_id',locationColumn:'q.location_id',productColumn:'q.product_id',lotColumn:'q.lot_id',searchColumns:['p.code','p.name','l.lot_number','bp.name','w.name','loc.complete_name']});
    sql=`SELECT p.code AS product_code,p.name AS product_name,COALESCE(l.lot_number,'—') AS lot_number,COALESCE(bp.name,'—') AS supplier_name,w.name AS warehouse_name,loc.complete_name AS location_name,q.on_hand::numeric,q.reserved::numeric,(q.on_hand-q.reserved)::numeric AS available_quantity,q.unit_cost::numeric,(q.on_hand*q.unit_cost)::numeric AS stock_value,l.quality_status,l.id AS lot_id,q.product_id,q.warehouse_id,q.location_id
      FROM inventory_quants q JOIN products p ON p.id=q.product_id LEFT JOIN trace_lots l ON l.id=q.lot_id LEFT JOIN business_partners bp ON bp.id=l.supplier_id JOIN warehouses w ON w.id=q.warehouse_id JOIN mrp_locations loc ON loc.id=q.location_id
      WHERE q.tenant_id=$1 AND q.company_id=ANY($2::uuid[])${where} ORDER BY p.name,l.lot_number,w.name,loc.complete_name`;
  }else if(type==='stock-by-warehouse'){
    const where=buildFilters(req,params,{warehouseColumn:'q.warehouse_id',productColumn:'q.product_id',searchColumns:['p.code','p.name','w.name']});
    sql=`SELECT w.name AS warehouse_name,p.code AS product_code,p.name AS product_name,SUM(q.on_hand)::numeric AS on_hand,SUM(q.reserved)::numeric AS reserved,SUM(q.on_hand-q.reserved)::numeric AS available_quantity,CASE WHEN SUM(q.on_hand)>0 THEN SUM(q.on_hand*q.unit_cost)/SUM(q.on_hand) ELSE 0 END::numeric AS average_cost,SUM(q.on_hand*q.unit_cost)::numeric AS stock_value,q.product_id,q.warehouse_id
      FROM inventory_quants q JOIN products p ON p.id=q.product_id JOIN warehouses w ON w.id=q.warehouse_id WHERE q.tenant_id=$1 AND q.company_id=ANY($2::uuid[])${where} GROUP BY w.name,p.code,p.name,q.product_id,q.warehouse_id ORDER BY w.name,p.name`;
  }else if(type==='stock-by-location'){
    const where=buildFilters(req,params,{warehouseColumn:'q.warehouse_id',locationColumn:'q.location_id',productColumn:'q.product_id',searchColumns:['p.code','p.name','w.name','loc.complete_name']});
    sql=`SELECT w.name AS warehouse_name,loc.code AS location_code,loc.complete_name AS location_name,p.code AS product_code,p.name AS product_name,SUM(q.on_hand)::numeric AS on_hand,SUM(q.reserved)::numeric AS reserved,SUM(q.on_hand-q.reserved)::numeric AS available_quantity,SUM(q.on_hand*q.unit_cost)::numeric AS stock_value,q.product_id,q.warehouse_id,q.location_id
      FROM inventory_quants q JOIN products p ON p.id=q.product_id JOIN warehouses w ON w.id=q.warehouse_id JOIN mrp_locations loc ON loc.id=q.location_id WHERE q.tenant_id=$1 AND q.company_id=ANY($2::uuid[])${where} GROUP BY w.name,loc.code,loc.complete_name,p.code,p.name,q.product_id,q.warehouse_id,q.location_id ORDER BY w.name,loc.complete_name,p.name`;
  }else if(type==='stock-by-product'){
    const where=buildFilters(req,params,{warehouseColumn:'q.warehouse_id',productColumn:'q.product_id',searchColumns:['p.code','p.name']});
    sql=`SELECT p.code AS product_code,p.name AS product_name,p.base_unit,SUM(q.on_hand)::numeric AS on_hand,SUM(q.reserved)::numeric AS reserved,SUM(q.on_hand-q.reserved)::numeric AS available_quantity,COUNT(DISTINCT q.lot_id)::int AS lot_count,COUNT(DISTINCT q.location_id)::int AS location_count,CASE WHEN SUM(q.on_hand)>0 THEN SUM(q.on_hand*q.unit_cost)/SUM(q.on_hand) ELSE 0 END::numeric AS average_cost,SUM(q.on_hand*q.unit_cost)::numeric AS stock_value,q.product_id
      FROM inventory_quants q JOIN products p ON p.id=q.product_id WHERE q.tenant_id=$1 AND q.company_id=ANY($2::uuid[])${where} GROUP BY p.code,p.name,p.base_unit,q.product_id ORDER BY p.name`;
  }else if(type==='stock-by-lot'){
    const where=buildFilters(req,params,{warehouseColumn:'q.warehouse_id',productColumn:'q.product_id',lotColumn:'q.lot_id',searchColumns:['p.code','p.name','l.lot_number','bp.code','bp.name']});
    sql=`SELECT l.id AS lot_id,l.lot_number,p.code AS product_code,p.name AS product_name,COALESCE(bp.code,'') AS supplier_code,COALESCE(bp.name,'—') AS supplier_name,l.quality_status,l.status,SUM(q.on_hand)::numeric AS on_hand,SUM(q.reserved)::numeric AS reserved,SUM(q.on_hand-q.reserved)::numeric AS available_quantity,MAX(q.unit_cost)::numeric AS unit_cost,SUM(q.on_hand*q.unit_cost)::numeric AS stock_value,q.product_id
      FROM inventory_quants q JOIN products p ON p.id=q.product_id JOIN trace_lots l ON l.id=q.lot_id LEFT JOIN business_partners bp ON bp.id=l.supplier_id WHERE q.tenant_id=$1 AND q.company_id=ANY($2::uuid[])${where} GROUP BY l.id,l.lot_number,p.code,p.name,bp.code,bp.name,l.quality_status,l.status,q.product_id ORDER BY p.name,l.lot_number`;
  }else if(type==='product-ledger'||type==='lot-ledger'||type==='moves-history'){
    const where=buildFilters(req,params,{dateColumn:'m.move_date',warehouseColumn:'m.warehouse_id',locationColumn:'COALESCE(m.to_location_id,m.from_location_id)',productColumn:'m.product_id',lotColumn:'m.lot_id',searchColumns:['p.code','p.name','l.lot_number','t.transfer_no','fl.complete_name','tl.complete_name']});
    sql=`SELECT m.move_date,t.transfer_no AS document_no,t.id AS document_id,t.operation_kind,t.state,p.code AS product_code,p.name AS product_name,COALESCE(l.lot_number,'—') AS lot_number,COALESCE(fl.complete_name,'Jashtë magazine') AS from_location,COALESCE(tl.complete_name,'Jashtë magazine') AS to_location,m.quantity::numeric,m.unit_cost::numeric,(m.quantity*m.unit_cost)::numeric AS movement_value,m.move_type,m.product_id,m.lot_id,m.warehouse_id
      FROM inventory_moves m JOIN products p ON p.id=m.product_id LEFT JOIN trace_lots l ON l.id=m.lot_id LEFT JOIN inventory_transfers t ON t.id=m.transfer_id LEFT JOIN mrp_locations fl ON fl.id=m.from_location_id LEFT JOIN mrp_locations tl ON tl.id=m.to_location_id WHERE m.tenant_id=$1 AND m.company_id=ANY($2::uuid[])${where} ORDER BY m.move_date DESC,t.transfer_no,p.name`;
  }else if(type==='receipts-register'||type==='deliveries-register'||type==='internal-transfers'){
    const kinds=type==='receipts-register'?["RECEIPT"]:type==='deliveries-register'?["DELIVERY"]:["PUTAWAY","INTERNAL","PICK"];
    params.push(kinds);const kindPos=params.length;
    const where=buildFilters(req,params,{dateColumn:'t.scheduled_date',warehouseColumn:'t.warehouse_id',productColumn:'ln.product_id',lotColumn:'ln.lot_id',partnerColumn:'t.partner_id',searchColumns:['t.transfer_no','t.source_document_no','bp.name','p.code','p.name','l.lot_number','sl.complete_name','dl.complete_name']});
    sql=`SELECT t.scheduled_date,t.transfer_no AS document_no,t.id AS document_id,t.operation_kind,t.state,COALESCE(bp.name,'—') AS partner_name,COALESCE(sl.complete_name,'Jashtë magazine') AS from_location,COALESCE(dl.complete_name,'Jashtë magazine') AS to_location,p.code AS product_code,p.name AS product_name,COALESCE(l.lot_number,'—') AS lot_number,ln.unit,CASE WHEN ln.done_quantity>0 THEN ln.done_quantity ELSE ln.planned_quantity END::numeric AS quantity,ln.unit_cost::numeric,((CASE WHEN ln.done_quantity>0 THEN ln.done_quantity ELSE ln.planned_quantity END)*ln.unit_cost)::numeric AS line_value,t.vehicle_plate,t.destination_address,ln.product_id,ln.lot_id,t.warehouse_id,t.partner_id
      FROM inventory_transfers t JOIN inventory_transfer_lines ln ON ln.transfer_id=t.id JOIN products p ON p.id=ln.product_id LEFT JOIN trace_lots l ON l.id=ln.lot_id LEFT JOIN business_partners bp ON bp.id=t.partner_id LEFT JOIN mrp_locations sl ON sl.id=t.source_location_id LEFT JOIN mrp_locations dl ON dl.id=t.destination_location_id WHERE t.tenant_id=$1 AND t.company_id=ANY($2::uuid[]) AND t.operation_kind=ANY($${kindPos}::varchar[])${where} ORDER BY t.scheduled_date DESC,t.transfer_no,p.name`;
  }else if(type==='stock-at-date'){
    const atDate=text(req.query.atDate||req.query.to||new Date().toISOString().slice(0,10));params.push(atDate);const datePos=params.length;
    const where=buildFilters(req,params,{warehouseColumn:'x.warehouse_id',locationColumn:'x.location_id',productColumn:'x.product_id',lotColumn:'x.lot_id',searchColumns:['p.code','p.name','l.lot_number','w.name','loc.complete_name']});
    sql=`WITH movements AS(
      SELECT m.tenant_id,m.company_id,m.warehouse_id,m.product_id,m.lot_id,m.to_location_id AS location_id,m.quantity AS delta,m.move_date FROM inventory_moves m WHERE m.to_location_id IS NOT NULL
      UNION ALL SELECT m.tenant_id,m.company_id,m.warehouse_id,m.product_id,m.lot_id,m.from_location_id AS location_id,-m.quantity AS delta,m.move_date FROM inventory_moves m WHERE m.from_location_id IS NOT NULL
    ) SELECT $${datePos}::date AS report_date,w.name AS warehouse_name,loc.complete_name AS location_name,p.code AS product_code,p.name AS product_name,COALESCE(l.lot_number,'—') AS lot_number,SUM(x.delta)::numeric AS on_hand_at_date,x.product_id,x.lot_id,x.warehouse_id,x.location_id
      FROM movements x JOIN products p ON p.id=x.product_id LEFT JOIN trace_lots l ON l.id=x.lot_id JOIN warehouses w ON w.id=x.warehouse_id JOIN mrp_locations loc ON loc.id=x.location_id WHERE x.tenant_id=$1 AND x.company_id=ANY($2::uuid[]) AND x.move_date::date<=$${datePos}::date${where} GROUP BY w.name,loc.complete_name,p.code,p.name,l.lot_number,x.product_id,x.lot_id,x.warehouse_id,x.location_id HAVING ABS(SUM(x.delta))>0.000001 ORDER BY p.name,l.lot_number,loc.complete_name`;
  }else if(type==='valuation'){
    const where=buildFilters(req,params,{warehouseColumn:'q.warehouse_id',locationColumn:'q.location_id',productColumn:'q.product_id',lotColumn:'q.lot_id',searchColumns:['p.code','p.name','l.lot_number','w.name','loc.complete_name']});
    sql=`SELECT p.code AS product_code,p.name AS product_name,COALESCE(l.lot_number,'—') AS lot_number,w.name AS warehouse_name,loc.complete_name AS location_name,q.on_hand::numeric,q.unit_cost::numeric,(q.on_hand*q.unit_cost)::numeric AS stock_value,q.product_id,q.lot_id,q.warehouse_id,q.location_id FROM inventory_quants q JOIN products p ON p.id=q.product_id LEFT JOIN trace_lots l ON l.id=q.lot_id JOIN warehouses w ON w.id=q.warehouse_id JOIN mrp_locations loc ON loc.id=q.location_id WHERE q.tenant_id=$1 AND q.company_id=ANY($2::uuid[])${where} ORDER BY stock_value DESC,p.name`;
  }else if(type==='discrepancies'){
    const where=buildFilters(req,params,{dateColumn:'c.count_date',warehouseColumn:'c.warehouse_id',locationColumn:'c.location_id',productColumn:'cl.product_id',lotColumn:'cl.lot_id',searchColumns:['c.count_no','p.code','p.name','l.lot_number','w.name','loc.complete_name']});
    sql=`SELECT c.count_date,c.count_no AS document_no,c.id AS document_id,c.state,w.name AS warehouse_name,loc.complete_name AS location_name,p.code AS product_code,p.name AS product_name,COALESCE(l.lot_number,'—') AS lot_number,cl.theoretical_quantity::numeric,cl.counted_quantity::numeric,cl.difference_quantity::numeric,cl.unit_cost::numeric,(cl.difference_quantity*cl.unit_cost)::numeric AS difference_value,cl.product_id,cl.lot_id,c.warehouse_id,c.location_id FROM inventory_counts c JOIN inventory_count_lines cl ON cl.count_id=c.id JOIN products p ON p.id=cl.product_id LEFT JOIN trace_lots l ON l.id=cl.lot_id JOIN warehouses w ON w.id=c.warehouse_id JOIN mrp_locations loc ON loc.id=c.location_id WHERE c.tenant_id=$1 AND c.company_id=ANY($2::uuid[])${where} ORDER BY c.count_date DESC,c.count_no,p.name`;
  }else if(type==='slow-stock'){
    const days=Math.max(1,Math.min(3650,num(req.query.days)||90));params.push(days);const daysPos=params.length;
    const where=buildFilters(req,params,{warehouseColumn:'q.warehouse_id',locationColumn:'q.location_id',productColumn:'q.product_id',lotColumn:'q.lot_id',searchColumns:['p.code','p.name','l.lot_number','w.name','loc.complete_name']});
    sql=`SELECT p.code AS product_code,p.name AS product_name,COALESCE(l.lot_number,'—') AS lot_number,w.name AS warehouse_name,loc.complete_name AS location_name,q.on_hand::numeric,q.reserved::numeric,q.last_move_at,EXTRACT(DAY FROM NOW()-COALESCE(q.last_move_at,q.updated_at))::int AS days_without_move,(q.on_hand*q.unit_cost)::numeric AS stock_value,q.product_id,q.lot_id,q.warehouse_id,q.location_id FROM inventory_quants q JOIN products p ON p.id=q.product_id LEFT JOIN trace_lots l ON l.id=q.lot_id JOIN warehouses w ON w.id=q.warehouse_id JOIN mrp_locations loc ON loc.id=q.location_id WHERE q.tenant_id=$1 AND q.company_id=ANY($2::uuid[]) AND q.on_hand>0 AND COALESCE(q.last_move_at,q.updated_at)<NOW()-($${daysPos}::int||' days')::interval${where} ORDER BY days_without_move DESC,p.name`;
  }else if(type==='below-minimum'){
    const where=buildFilters(req,params,{warehouseColumn:'r.warehouse_id',locationColumn:'r.location_id',productColumn:'r.product_id',searchColumns:['p.code','p.name','w.name','loc.complete_name']});
    sql=`SELECT w.name AS warehouse_name,loc.complete_name AS location_name,p.code AS product_code,p.name AS product_name,r.min_quantity::numeric,r.max_quantity::numeric,r.reorder_quantity::numeric,COALESCE(SUM(q.on_hand-q.reserved),0)::numeric AS available_quantity,GREATEST(r.max_quantity-COALESCE(SUM(q.on_hand-q.reserved),0),r.reorder_quantity)::numeric AS suggested_order,r.product_id,r.warehouse_id,r.location_id FROM inventory_reordering_rules r JOIN products p ON p.id=r.product_id JOIN warehouses w ON w.id=r.warehouse_id JOIN mrp_locations loc ON loc.id=r.location_id LEFT JOIN inventory_quants q ON q.location_id=r.location_id AND q.product_id=r.product_id WHERE r.tenant_id=$1 AND r.company_id=ANY($2::uuid[]) AND r.active=TRUE${where} GROUP BY w.name,loc.complete_name,p.code,p.name,r.min_quantity,r.max_quantity,r.reorder_quantity,r.product_id,r.warehouse_id,r.location_id HAVING COALESCE(SUM(q.on_hand-q.reserved),0)<r.min_quantity ORDER BY suggested_order DESC,p.name`;
  }else if(type==='turnover'||type==='in-out-period'){
    const where=buildFilters(req,params,{dateColumn:'t.scheduled_date',warehouseColumn:'t.warehouse_id',productColumn:'ln.product_id',searchColumns:['p.code','p.name','w.name']});
    sql=`SELECT p.code AS product_code,p.name AS product_name,w.name AS warehouse_name,SUM(CASE WHEN t.operation_kind='RECEIPT' AND t.state='DONE' THEN CASE WHEN ln.done_quantity>0 THEN ln.done_quantity ELSE ln.planned_quantity END ELSE 0 END)::numeric AS incoming_quantity,SUM(CASE WHEN t.operation_kind='DELIVERY' AND t.state='DONE' THEN CASE WHEN ln.done_quantity>0 THEN ln.done_quantity ELSE ln.planned_quantity END ELSE 0 END)::numeric AS outgoing_quantity,SUM(CASE WHEN t.operation_kind IN('PUTAWAY','INTERNAL','PICK') AND t.state='DONE' THEN CASE WHEN ln.done_quantity>0 THEN ln.done_quantity ELSE ln.planned_quantity END ELSE 0 END)::numeric AS internal_quantity,COALESCE((SELECT SUM(q.on_hand) FROM inventory_quants q WHERE q.product_id=p.id AND q.warehouse_id=w.id),0)::numeric AS current_stock,CASE WHEN COALESCE((SELECT SUM(q.on_hand) FROM inventory_quants q WHERE q.product_id=p.id AND q.warehouse_id=w.id),0)>0 THEN SUM(CASE WHEN t.operation_kind='DELIVERY' AND t.state='DONE' THEN CASE WHEN ln.done_quantity>0 THEN ln.done_quantity ELSE ln.planned_quantity END ELSE 0 END)/COALESCE((SELECT SUM(q.on_hand) FROM inventory_quants q WHERE q.product_id=p.id AND q.warehouse_id=w.id),1) ELSE 0 END::numeric AS turnover_index,p.id AS product_id,w.id AS warehouse_id FROM inventory_transfers t JOIN inventory_transfer_lines ln ON ln.transfer_id=t.id JOIN products p ON p.id=ln.product_id JOIN warehouses w ON w.id=t.warehouse_id WHERE t.tenant_id=$1 AND t.company_id=ANY($2::uuid[])${where} GROUP BY p.id,p.code,p.name,w.id,w.name ORDER BY outgoing_quantity DESC,p.name`;
  }else if(type==='supplier-lot-customer'){
    const where=buildFilters(req,params,{warehouseColumn:'l.warehouse_id',productColumn:'l.product_id',lotColumn:'l.id',partnerColumn:'l.supplier_id',searchColumns:['p.code','p.name','l.lot_number','sup.code','sup.name','w.name','cust.name','dt.transfer_no']});
    sql=`SELECT l.id AS lot_id,l.lot_number,p.code AS product_code,p.name AS product_name,COALESCE(sup.code,'') AS supplier_code,COALESCE(sup.name,'—') AS supplier_name,w.name AS warehouse_name,l.quality_status,l.quantity_created::numeric,l.quantity_available::numeric,l.quantity_consumed::numeric,COALESCE(STRING_AGG(DISTINCT cust.name,', ') FILTER(WHERE cust.name IS NOT NULL),'—') AS customers,COALESCE(STRING_AGG(DISTINCT dt.transfer_no,', ') FILTER(WHERE dt.transfer_no IS NOT NULL),'—') AS delivery_documents,COALESCE(SUM(CASE WHEN dt.state='DONE' THEN CASE WHEN dl.done_quantity>0 THEN dl.done_quantity ELSE dl.planned_quantity END ELSE 0 END),0)::numeric AS delivered_quantity,l.product_id,l.warehouse_id,l.supplier_id FROM trace_lots l JOIN products p ON p.id=l.product_id LEFT JOIN business_partners sup ON sup.id=l.supplier_id JOIN warehouses w ON w.id=l.warehouse_id LEFT JOIN inventory_transfer_lines dl ON dl.lot_id=l.id LEFT JOIN inventory_transfers dt ON dt.id=dl.transfer_id AND dt.operation_kind='DELIVERY' LEFT JOIN business_partners cust ON cust.id=dt.partner_id WHERE l.tenant_id=$1 AND l.company_id=ANY($2::uuid[])${where} GROUP BY l.id,l.lot_number,p.code,p.name,sup.code,sup.name,w.name,l.quality_status,l.quantity_created,l.quantity_available,l.quantity_consumed,l.product_id,l.warehouse_id,l.supplier_id ORDER BY p.name,l.lot_number`;
  }else{
    const error=new Error('Raporti Inventory nuk u gjet.');error.status=404;throw error;
  }
  return{sql,params};
}

export function installPhase76InventoryReportsRoutes({app,pool,authRequired,requireRoles,assertCompanyAccess,accessibleCompanyIds,audit}){
  app.get('/api/inventory/reports-v2',authRequired,(_req,res)=>res.json(PHASE76_REPORTS));
  app.get('/api/inventory/reports-v2/:type',authRequired,async(req,res,next)=>{try{const ids=await accessibleCompanyIds(req.user);if(!ids.length)return res.json([]);const{sql,params}=reportQuery(req.params.type,req,req.user.tenant_id,ids);const{rows}=await pool.query(sql,params);res.json(rows.map(camel));}catch(error){next(error);}});

  app.patch('/api/inventory/transfers/:id/document-details',authRequired,requireRoles('SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','OPERATOR_PESHORE'),async(req,res,next)=>{try{const input=detailsSchema.parse(req.body);const found=await pool.query('SELECT company_id FROM inventory_transfers WHERE id=$1 AND tenant_id=$2',[req.params.id,req.user.tenant_id]);if(!found.rows[0]){const error=new Error('Dokumenti Inventory nuk u gjet.');error.status=404;throw error;}await assertCompanyAccess(req.user,found.rows[0].company_id);const{rows}=await pool.query(`UPDATE inventory_transfers SET destination_address=$1,authorized_person=$2,vehicle_plate=$3,receiver_name=$4,transporter_name=$5,accountant_name=$6,warehouse_keeper_name=$7,updated_at=NOW() WHERE id=$8 AND tenant_id=$9 RETURNING *`,[input.destinationAddress||null,input.authorizedPerson||null,input.vehiclePlate||null,input.receiverName||null,input.transporterName||null,input.accountantName||null,input.warehouseKeeperName||req.user.full_name||null,req.params.id,req.user.tenant_id]);await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'INVENTORY_DOCUMENT_DETAILS_UPDATE',entityType:'inventory_transfer',entityId:req.params.id,companyId:found.rows[0].company_id,metadata:input,ip:req.ip});res.json(camel(rows[0]));}catch(error){next(error);}});

  app.get('/api/inventory/transfers/:id/print-data',authRequired,async(req,res,next)=>{try{const{rows}=await pool.query(`SELECT t.*,c.name AS company_name,c.nipt AS company_nipt,c.address AS company_address,c.phone AS company_phone,c.email AS company_email,c.currency,w.name AS warehouse_name,w.code AS warehouse_code,w.address AS warehouse_address,bp.name AS partner_name,bp.code AS partner_code,bp.address AS partner_address,bp.city AS partner_city,sl.complete_name AS source_location_name,dl.complete_name AS destination_location_name,u.full_name AS created_by_name,vu.full_name AS validated_by_name,
      COALESCE((SELECT json_agg(json_build_object('id',ln.id,'productId',ln.product_id,'productCode',p.code,'productName',p.name,'lotId',ln.lot_id,'lotNumber',l.lot_number,'unit',ln.unit,'plannedQuantity',ln.planned_quantity,'doneQuantity',ln.done_quantity,'quantity',CASE WHEN ln.done_quantity>0 THEN ln.done_quantity ELSE ln.planned_quantity END,'unitCost',ln.unit_cost,'lineValue',(CASE WHEN ln.done_quantity>0 THEN ln.done_quantity ELSE ln.planned_quantity END)*ln.unit_cost) ORDER BY ln.created_at,ln.id) FROM inventory_transfer_lines ln JOIN products p ON p.id=ln.product_id LEFT JOIN trace_lots l ON l.id=ln.lot_id WHERE ln.transfer_id=t.id),'[]'::json) AS lines
      FROM inventory_transfers t JOIN companies c ON c.id=t.company_id JOIN warehouses w ON w.id=t.warehouse_id LEFT JOIN business_partners bp ON bp.id=t.partner_id LEFT JOIN mrp_locations sl ON sl.id=t.source_location_id LEFT JOIN mrp_locations dl ON dl.id=t.destination_location_id LEFT JOIN users u ON u.id=t.created_by LEFT JOIN users vu ON vu.id=t.validated_by WHERE t.id=$1 AND t.tenant_id=$2`,[req.params.id,req.user.tenant_id]);if(!rows[0]){const error=new Error('Dokumenti Inventory nuk u gjet.');error.status=404;throw error;}await assertCompanyAccess(req.user,rows[0].company_id);const result=camel(rows[0]);result.totalQuantity=(result.lines||[]).reduce((sum,line)=>sum+num(line.quantity),0);result.totalValue=(result.lines||[]).reduce((sum,line)=>sum+num(line.lineValue),0);res.json(result);}catch(error){next(error);}});
}
