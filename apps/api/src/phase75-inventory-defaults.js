import { randomUUID } from 'node:crypto';

const ZERO_UUID='00000000-0000-0000-0000-000000000000';
const num=(value)=>Number(value||0);

async function ensureLocation(client,warehouse,type,suffix,name){
  const code=`${warehouse.code}/${suffix}`;
  const found=await client.query(`SELECT id FROM mrp_locations WHERE tenant_id=$1 AND company_id=$2 AND warehouse_id=$3 AND code=$4 LIMIT 1`,[warehouse.tenant_id,warehouse.company_id,warehouse.id,code]);
  if(found.rows[0])return found.rows[0].id;
  const id=randomUUID();
  await client.query(`INSERT INTO mrp_locations(id,tenant_id,company_id,warehouse_id,code,name,complete_name,location_type,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,[id,warehouse.tenant_id,warehouse.company_id,warehouse.id,code,name,`${warehouse.name}/${name}`,type]);
  return id;
}

async function ensureWarehouse(client,warehouse){
  const defs=[['INPUT','IN','Hyrje'],['QUALITY','QC','Kontroll Cilësie'],['STOCK','STOCK','Stok'],['OUTPUT','OUT','Dalje'],['PACKAGING','PACK','Paketim'],['FINISHED','FIN','Produkt i Gatshëm'],['SCRAP','SCRAP','Mbetje'],['INVENTORY','INV','Rregullim Inventari']];
  const locations={};
  for(const[type,suffix,name]of defs)locations[type]=await ensureLocation(client,warehouse,type,suffix,name);
  const operations=[['IN','Pranime','RECEIPT','IN',null,locations.INPUT],['PUT','Sistemim në Stok','PUTAWAY','PUT',locations.INPUT,locations.STOCK],['INT','Transferime të Brendshme','INTERNAL','INT',locations.STOCK,locations.STOCK],['PICK','Përgatitje Daljeje','PICK','PICK',locations.STOCK,locations.OUTPUT],['OUT','Dërgesa','DELIVERY','OUT',locations.OUTPUT,null]];
  for(const[code,name,kind,prefix,source,destination]of operations)await client.query(`INSERT INTO inventory_operation_types(id,tenant_id,company_id,warehouse_id,code,name,operation_kind,default_source_location_id,default_destination_location_id,sequence_prefix)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(tenant_id,company_id,warehouse_id,code) DO UPDATE SET name=EXCLUDED.name,operation_kind=EXCLUDED.operation_kind,default_source_location_id=EXCLUDED.default_source_location_id,default_destination_location_id=EXCLUDED.default_destination_location_id,active=TRUE,updated_at=NOW()`,[randomUUID(),warehouse.tenant_id,warehouse.company_id,warehouse.id,code,name,kind,source,destination,prefix]);

  const lots=await client.query(`SELECT l.*,COALESCE((SELECT m.to_location_id FROM mrp_stock_moves m WHERE m.lot_id=l.id AND m.state='DONE' AND m.to_location_id IS NOT NULL ORDER BY m.created_at DESC LIMIT 1),
    (SELECT loc.id FROM mrp_locations loc WHERE loc.warehouse_id=l.warehouse_id AND loc.supplier_id=l.supplier_id AND loc.location_type='SUPPLIER_RACK' AND loc.active=TRUE ORDER BY loc.code LIMIT 1),
    CASE WHEN l.lot_type='PACKAGED' THEN $2::uuid WHEN l.lot_type='PROCESSED' THEN $3::uuid ELSE $1::uuid END) AS resolved_location_id
    FROM trace_lots l WHERE l.tenant_id=$4 AND l.company_id=$5 AND l.warehouse_id=$6 AND l.quantity_available>0`,[locations.STOCK,locations.FINISHED,locations.OUTPUT,warehouse.tenant_id,warehouse.company_id,warehouse.id]);
  for(const lot of lots.rows){
    await client.query(`INSERT INTO inventory_quants(id,tenant_id,company_id,warehouse_id,location_id,product_id,lot_id,on_hand,reserved,unit_cost,last_move_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,NOW())) ON CONFLICT(tenant_id,company_id,warehouse_id,location_id,product_id,COALESCE(lot_id,'${ZERO_UUID}'::uuid))
      DO UPDATE SET on_hand=GREATEST(inventory_quants.on_hand,EXCLUDED.on_hand),reserved=LEAST(GREATEST(EXCLUDED.reserved,0),GREATEST(inventory_quants.on_hand,EXCLUDED.on_hand)),unit_cost=CASE WHEN inventory_quants.unit_cost=0 THEN EXCLUDED.unit_cost ELSE inventory_quants.unit_cost END,updated_at=NOW()`,[randomUUID(),lot.tenant_id,lot.company_id,lot.warehouse_id,lot.resolved_location_id,lot.product_id,lot.id,num(lot.quantity_available),Math.min(num(lot.quantity_reserved),num(lot.quantity_available)),num(lot.unit_cost),lot.updated_at||lot.created_at]);
  }

  const globalStock=await client.query(`SELECT sm.product_id,SUM(sm.quantity_base)::numeric AS quantity,CASE WHEN SUM(ABS(sm.quantity_base))>0 THEN SUM(ABS(sm.quantity_base)*sm.unit_cost)/SUM(ABS(sm.quantity_base)) ELSE 0 END::numeric AS cost
    FROM stock_movements sm WHERE sm.tenant_id=$1 AND sm.company_id=$2 AND sm.warehouse_id=$3 GROUP BY sm.product_id HAVING SUM(sm.quantity_base)>0`,[warehouse.tenant_id,warehouse.company_id,warehouse.id]);
  for(const row of globalStock.rows){
    const tracked=await client.query(`SELECT COALESCE(SUM(on_hand),0)::numeric AS quantity FROM inventory_quants WHERE tenant_id=$1 AND company_id=$2 AND warehouse_id=$3 AND product_id=$4`,[warehouse.tenant_id,warehouse.company_id,warehouse.id,row.product_id]);
    const remainder=Math.max(0,num(row.quantity)-num(tracked.rows[0].quantity));
    if(remainder<=0.000001)continue;
    await client.query(`INSERT INTO inventory_quants(id,tenant_id,company_id,warehouse_id,location_id,product_id,lot_id,on_hand,reserved,unit_cost,last_move_at)
      VALUES($1,$2,$3,$4,$5,$6,NULL,$7,0,$8,NOW()) ON CONFLICT(tenant_id,company_id,warehouse_id,location_id,product_id,COALESCE(lot_id,'${ZERO_UUID}'::uuid))
      DO UPDATE SET on_hand=GREATEST(inventory_quants.on_hand,EXCLUDED.on_hand),unit_cost=CASE WHEN inventory_quants.unit_cost=0 THEN EXCLUDED.unit_cost ELSE inventory_quants.unit_cost END,updated_at=NOW()`,[randomUUID(),warehouse.tenant_id,warehouse.company_id,warehouse.id,locations.STOCK,row.product_id,remainder,num(row.cost)]);
  }
}

export function installPhase75InventoryDefaultsMiddleware({app,pool,authRequired,accessibleCompanyIds}){
  app.use('/api/inventory',authRequired,async(req,res,next)=>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const ids=await accessibleCompanyIds(req.user,client);
      if(ids.length){const{rows}=await client.query(`SELECT w.*,c.tenant_id FROM warehouses w JOIN companies c ON c.id=w.company_id WHERE w.tenant_id=$1 AND w.company_id=ANY($2::uuid[]) AND w.active=TRUE ORDER BY w.code`,[req.user.tenant_id,ids]);for(const warehouse of rows)await ensureWarehouse(client,warehouse);}
      await client.query('COMMIT');next();
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });
}
