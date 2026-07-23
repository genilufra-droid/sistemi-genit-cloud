import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const WRITE_ROLES = ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','OPERATOR_PESHORE'];
const QUALITY_STATUSES = ['QUARANTINE','APPROVED','REJECTED','PARTIAL_APPROVAL'];
const EPSILON = 0.000001;
const num = (value) => Number(value || 0);
const text = (value) => String(value ?? '').trim();

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

function assertMassBalance(inputQuantity, outputQuantity, wasteQuantity, lossQuantity = 0) {
  const difference = Math.abs(num(inputQuantity) - num(outputQuantity) - num(wasteQuantity) - num(lossQuantity));
  if (difference > EPSILON) {
    throw requestError(`Bilanci i masës nuk përputhet. Hyrje ${num(inputQuantity)} kg; dalje + mbetje + humbje ${num(outputQuantity) + num(wasteQuantity) + num(lossQuantity)} kg.`);
  }
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
  const dateText = sourceDate instanceof Date ? sourceDate.toISOString().slice(0, 10) : String(sourceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const year = dateText.slice(0, 4);
  const value = await nextSequence(client, tenantId, companyId, `${prefix}-${year}`);
  return `${prefix}-${year}-${String(value).padStart(6, '0')}`;
}

async function nextLotNumber(client, tenantId, companyId, product, lotType, sourceDate) {
  const prefix = lotType === 'PACKAGED' ? 'PKG' : 'PRC';
  const productToken = normalizeToken(product.code || product.name, 'ART').slice(0, 18);
  const dateText = sourceDate instanceof Date ? sourceDate.toISOString().slice(0, 10) : String(sourceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const day = dateText.replace(/-/g, '');
  const key = `${prefix}-${productToken}-${day}`;
  const value = await nextSequence(client, tenantId, companyId, key);
  return `${key}-${String(value).padStart(4, '0')}`;
}

async function addChange(client, user, companyId, entityType, entityId, operation, metadata = {}) {
  await client.query(`INSERT INTO cloud_change_events(tenant_id,company_id,entity_type,entity_id,operation,metadata,user_id)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`, [user.tenant_id, companyId, entityType, entityId, operation, JSON.stringify(metadata), user.id]);
}

async function validateWarehouseAndProduct(client, user, companyId, warehouseId, productId) {
  const warehouse = await client.query(`SELECT * FROM warehouses WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [warehouseId,user.tenant_id,companyId]);
  if (!warehouse.rowCount) throw requestError('Magazina nuk është e vlefshme.');
  const product = await client.query(`SELECT * FROM products WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [productId,user.tenant_id,companyId]);
  if (!product.rowCount) throw requestError('Artikulli i daljes nuk është i vlefshëm.');
  return { warehouse: warehouse.rows[0], product: product.rows[0] };
}

async function loadLots(client, user, companyId, warehouseId, inputs, { forUpdate = false, packagedOnly = false } = {}) {
  const ids = [...new Set(inputs.map((line) => line.lotId))];
  if (ids.length !== inputs.length) throw requestError('I njëjti lot nuk mund të përsëritet në dokument.');
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const { rows } = await client.query(`SELECT l.*,p.code AS product_code,p.name AS product_name
    FROM trace_lots l JOIN products p ON p.id=l.product_id
    WHERE l.tenant_id=$1 AND l.company_id=$2 AND l.id=ANY($3::uuid[]) ORDER BY l.id${lock}`, [user.tenant_id,companyId,ids]);
  if (rows.length !== ids.length) throw requestError('Një ose më shumë lote hyrëse nuk u gjetën.');
  const byId = new Map(rows.map((row) => [row.id,row]));
  for (const line of inputs) {
    const lot = byId.get(line.lotId);
    if (lot.warehouse_id !== warehouseId) throw requestError(`Loti ${lot.lot_number} nuk ndodhet në magazinën e dokumentit.`);
    if (lot.status !== 'AVAILABLE' || lot.quality_status !== 'APPROVED') throw requestError(`Loti ${lot.lot_number} duhet të jetë i aprovuar dhe AVAILABLE.`,409);
    if (packagedOnly && lot.lot_type !== 'PROCESSED') throw requestError(`Paketimi pranon vetëm lote PROCESSED. Loti ${lot.lot_number} është ${lot.lot_type}.`,409);
    if (num(lot.quantity_available) + EPSILON < num(line.quantity)) throw requestError(`Gjendja e lotit ${lot.lot_number} është ${num(lot.quantity_available)} kg, ndërsa kërkohen ${num(line.quantity)} kg.`,409);
  }
  return inputs.map((line) => ({ ...line, lot: byId.get(line.lotId) }));
}

function sharedOrigin(lines) {
  const lots = lines.map((line) => line.lot);
  const same = (key) => lots.every((lot) => lot[key] === lots[0][key]);
  return {
    supplierId: same('supplier_id') ? lots[0].supplier_id : null,
    farmId: same('farm_id') ? lots[0].farm_id : null,
    parcelId: same('parcel_id') ? lots[0].parcel_id : null,
    harvestDate: same('harvest_date') ? lots[0].harvest_date : null,
    botanicalName: same('botanical_name') ? lots[0].botanical_name : null,
    plantPart: same('plant_part') ? lots[0].plant_part : null,
    locationText: same('location_text') ? lots[0].location_text : `Përzierje e ${lots.length} loteve hyrëse`,
    parentLotId: lots.length === 1 ? lots[0].id : null,
  };
}

async function consumeLot(client, { user, orderId, orderNo, companyId, warehouseId, line, movementType, stockMovementType }) {
  const lot = line.lot;
  const quantity = num(line.quantity);
  const availableAfter = num(lot.quantity_available) - quantity;
  const consumedAfter = num(lot.quantity_consumed) + quantity;
  const statusAfter = availableAfter <= EPSILON ? 'DEPLETED' : lot.status;
  await client.query(`UPDATE trace_lots SET quantity_available=$1,quantity_consumed=$2,status=$3,version=version+1,updated_at=NOW() WHERE id=$4`, [Math.max(0,availableAfter),consumedAfter,statusAfter,lot.id]);
  await client.query(`INSERT INTO trace_lot_movements(id,tenant_id,company_id,lot_id,warehouse_id,product_id,movement_type,quantity,balance_after,source_document_type,source_document_id,source_document_no,metadata,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`, [randomUUID(),user.tenant_id,companyId,lot.id,warehouseId,lot.product_id,movementType,-quantity,Math.max(0,availableAfter),stockMovementType,orderId,orderNo,JSON.stringify({inputLotNumber:lot.lot_number}),user.id]);
  await client.query(`INSERT INTO stock_movements(id,tenant_id,company_id,warehouse_id,product_id,movement_type,quantity_base,unit_cost,reference_type,reference_id,reference_no,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [randomUUID(),user.tenant_id,companyId,warehouseId,lot.product_id,stockMovementType,-quantity,num(lot.unit_cost),stockMovementType,orderId,orderNo,user.id]);
  return { lotId: lot.id, lotNumber: lot.lot_number, quantity, balanceAfter: Math.max(0,availableAfter), statusAfter };
}

async function createOutputLot(client, { user, companyId, warehouseId, product, sourceDate, lotType, qualityStatus, quantity, unitCost, origin, sourceDocumentId, sourceDocumentNo, movementType, stockMovementType, expiryDate = null, notes = '' }) {
  const lotId = randomUUID();
  const lotNumber = await nextLotNumber(client,user.tenant_id,companyId,product,lotType,sourceDate);
  const status = lotStatusFromQuality(qualityStatus);
  await client.query(`INSERT INTO trace_lots(id,tenant_id,company_id,warehouse_id,product_id,supplier_id,farm_id,parcel_id,parent_lot_id,source_document_id,lot_number,lot_type,status,quality_status,harvest_date,production_date,expiry_date,quantity_created,quantity_available,quantity_consumed,base_unit,unit_cost,botanical_name,plant_part,location_text,notes,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18,0,$19,$20,$21,$22,$23,$24,$25)`, [lotId,user.tenant_id,companyId,warehouseId,product.id,origin.supplierId,origin.farmId,origin.parcelId,origin.parentLotId,sourceDocumentId,lotNumber,lotType,status,qualityStatus,origin.harvestDate,sourceDate,expiryDate,quantity,product.base_unit||'kg',unitCost,origin.botanicalName,origin.plantPart,origin.locationText,notes||null,user.id]);
  await client.query(`INSERT INTO trace_lot_movements(id,tenant_id,company_id,lot_id,warehouse_id,product_id,movement_type,quantity,balance_after,source_document_type,source_document_id,source_document_no,metadata,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12::jsonb,$13)`, [randomUUID(),user.tenant_id,companyId,lotId,warehouseId,product.id,movementType,quantity,stockMovementType,sourceDocumentId,sourceDocumentNo,JSON.stringify({lotType}),user.id]);
  await client.query(`INSERT INTO stock_movements(id,tenant_id,company_id,warehouse_id,product_id,movement_type,quantity_base,unit_cost,reference_type,reference_id,reference_no,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [randomUUID(),user.tenant_id,companyId,warehouseId,product.id,stockMovementType,quantity,unitCost,stockMovementType,sourceDocumentId,sourceDocumentNo,user.id]);
  return { id:lotId, lotNumber, lotType, status, qualityStatus, quantityCreated:quantity, quantityAvailable:quantity, unitCost };
}

export async function migratePhase4ProcessingPackaging(db) {
  await db.query(`
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS input_quantity NUMERIC(18,6) NOT NULL DEFAULT 0;
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS output_quality_status VARCHAR(30) NOT NULL DEFAULT 'QUARANTINE';
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS yield_percent NUMERIC(10,4) NOT NULL DEFAULT 0;
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

    CREATE TABLE IF NOT EXISTS packaging_orders (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      input_lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE RESTRICT,
      output_product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      packaging_no VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','CANCELLED')),
      order_date DATE NOT NULL DEFAULT CURRENT_DATE,
      input_quantity NUMERIC(18,6) NOT NULL,
      output_quantity NUMERIC(18,6) NOT NULL,
      waste_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
      package_count NUMERIC(18,3) NOT NULL,
      units_per_package NUMERIC(18,3) NOT NULL DEFAULT 1,
      net_weight_per_package NUMERIC(18,6) NOT NULL,
      direct_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
      output_quality_status VARCHAR(30) NOT NULL DEFAULT 'APPROVED',
      expiry_date DATE,
      output_lot_id UUID REFERENCES trace_lots(id) ON DELETE RESTRICT,
      notes TEXT,
      version BIGINT NOT NULL DEFAULT 1,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      posted_by UUID REFERENCES users(id) ON DELETE SET NULL,
      posted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, packaging_no),
      CHECK (input_quantity > 0 AND output_quantity > 0 AND waste_quantity >= 0 AND package_count > 0 AND net_weight_per_package > 0)
    );

    CREATE INDEX IF NOT EXISTS idx_process_orders_scope ON process_orders(tenant_id,company_id,status,order_date DESC);
    CREATE INDEX IF NOT EXISTS idx_process_inputs_lot ON process_order_inputs(lot_id,process_order_id);
    CREATE INDEX IF NOT EXISTS idx_packaging_orders_scope ON packaging_orders(tenant_id,company_id,status,order_date DESC);
    CREATE INDEX IF NOT EXISTS idx_packaging_orders_input_lot ON packaging_orders(input_lot_id,status);
  `);
}

export function installPhase4ProcessingPackagingRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant }) {
  const processSchema = z.object({
    companyId:z.string().uuid(), warehouseId:z.string().uuid(), outputProductId:z.string().uuid(),
    processType:z.string().trim().min(2).max(60), orderDate:z.string().date(),
    outputQuantity:z.coerce.number().positive(), wasteQuantity:z.coerce.number().min(0).default(0),
    lossQuantity:z.coerce.number().min(0).default(0), directCost:z.coerce.number().min(0).default(0),
    outputQualityStatus:z.enum(QUALITY_STATUSES).default('QUARANTINE'), assetId:z.string().uuid().nullable().optional(),
    notes:z.string().trim().max(3000).optional().default(''),
    inputs:z.array(z.object({lotId:z.string().uuid(),quantity:z.coerce.number().positive()})).min(1),
  });

  const packagingSchema = z.object({
    companyId:z.string().uuid(), warehouseId:z.string().uuid(), inputLotId:z.string().uuid(), outputProductId:z.string().uuid(),
    orderDate:z.string().date(), inputQuantity:z.coerce.number().positive(), outputQuantity:z.coerce.number().positive(),
    wasteQuantity:z.coerce.number().min(0).default(0), packageCount:z.coerce.number().positive(),
    unitsPerPackage:z.coerce.number().positive().default(1), netWeightPerPackage:z.coerce.number().positive(),
    directCost:z.coerce.number().min(0).default(0), outputQualityStatus:z.enum(QUALITY_STATUSES).default('APPROVED'),
    expiryDate:z.string().date().nullable().optional(), notes:z.string().trim().max(3000).optional().default(''),
  });

  async function validateProcessDraft(client,user,input,{forUpdate=false}={}) {
    await assertCompanyAccess(user,input.companyId,client);
    const relations = await validateWarehouseAndProduct(client,user,input.companyId,input.warehouseId,input.outputProductId);
    const lines = await loadLots(client,user,input.companyId,input.warehouseId,input.inputs,{forUpdate});
    const inputQuantity = lines.reduce((sum,line)=>sum+num(line.quantity),0);
    assertMassBalance(inputQuantity,input.outputQuantity,input.wasteQuantity,input.lossQuantity);
    return { ...relations, lines, inputQuantity };
  }

  async function replaceProcessInputs(client,orderId,inputs) {
    await client.query('DELETE FROM process_order_inputs WHERE process_order_id=$1',[orderId]);
    for (const line of inputs) {
      await client.query('INSERT INTO process_order_inputs(id,process_order_id,lot_id,quantity) VALUES($1,$2,$3,$4)',[randomUUID(),orderId,line.lotId,line.quantity]);
    }
  }

  app.get('/api/trace/process-orders',authRequired,async(req,res,next)=>{
    try {
      const companyIds=await accessibleCompanyIds(req.user); if(!companyIds.length)return res.json([]);
      const {rows}=await pool.query(`SELECT po.*,p.code AS output_product_code,p.name AS output_product_name,w.name AS warehouse_name,l.lot_number AS output_lot_number,
        COALESCE((SELECT json_agg(json_build_object('id',poi.id,'lotId',poi.lot_id,'lotNumber',il.lot_number,'productId',il.product_id,'quantity',poi.quantity) ORDER BY il.lot_number)
          FROM process_order_inputs poi JOIN trace_lots il ON il.id=poi.lot_id WHERE poi.process_order_id=po.id),'[]'::json) AS inputs
        FROM process_orders po JOIN products p ON p.id=po.output_product_id JOIN warehouses w ON w.id=po.warehouse_id LEFT JOIN trace_lots l ON l.id=po.output_lot_id
        WHERE po.tenant_id=$1 AND po.company_id=ANY($2::uuid[]) ORDER BY po.order_date DESC,po.created_at DESC`,[req.user.tenant_id,companyIds]);
      res.json(rows);
    }catch(error){next(error);}
  });

  app.get('/api/trace/process-orders/:id',authRequired,async(req,res,next)=>{
    try {
      const {rows}=await pool.query(`SELECT po.*,p.code AS output_product_code,p.name AS output_product_name,w.name AS warehouse_name,l.lot_number AS output_lot_number,
        COALESCE((SELECT json_agg(json_build_object('id',poi.id,'lotId',poi.lot_id,'lotNumber',il.lot_number,'productId',il.product_id,'productName',ip.name,'quantity',poi.quantity,'available',il.quantity_available) ORDER BY il.lot_number)
          FROM process_order_inputs poi JOIN trace_lots il ON il.id=poi.lot_id JOIN products ip ON ip.id=il.product_id WHERE poi.process_order_id=po.id),'[]'::json) AS inputs
        FROM process_orders po JOIN products p ON p.id=po.output_product_id JOIN warehouses w ON w.id=po.warehouse_id LEFT JOIN trace_lots l ON l.id=po.output_lot_id
        WHERE po.id=$1 AND po.tenant_id=$2 LIMIT 1`,[req.params.id,req.user.tenant_id]);
      if(!rows[0])throw requestError('Urdhri i Punës nuk u gjet.',404);
      await assertCompanyAccess(req.user,rows[0].company_id);
      res.json(rows[0]);
    }catch(error){next(error);}
  });

  app.post('/api/trace/process-orders',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const input=processSchema.parse(req.body); await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const validated=await validateProcessDraft(client,req.user,input);
      const id=randomUUID(); const workOrderNo=await nextDocumentNo(client,req.user.tenant_id,input.companyId,'UP',input.orderDate);
      const yieldPercent=validated.inputQuantity?num(input.outputQuantity)/validated.inputQuantity*100:0;
      const {rows}=await client.query(`INSERT INTO process_orders(id,tenant_id,company_id,warehouse_id,output_product_id,work_order_no,process_type,status,order_date,input_quantity,output_quantity,waste_quantity,loss_quantity,direct_cost,asset_id,operator_id,output_quality_status,yield_percent,notes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,[id,req.user.tenant_id,input.companyId,input.warehouseId,input.outputProductId,workOrderNo,input.processType,input.orderDate,validated.inputQuantity,input.outputQuantity,input.wasteQuantity,input.lossQuantity,input.directCost,input.assetId||null,req.user.id,input.outputQualityStatus,yieldPercent,input.notes||null,req.user.id]);
      await replaceProcessInputs(client,id,input.inputs);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PROCESS_ORDER_CREATE',entityType:'process_order',entityId:id,companyId:input.companyId,metadata:{workOrderNo,inputQuantity:validated.inputQuantity,outputQuantity:input.outputQuantity},ip:req.ip},client);
      await addChange(client,req.user,input.companyId,'process_order',id,'CREATE',{workOrderNo,status:'DRAFT'});
      await client.query('COMMIT'); emitTenant(req.user.tenant_id,'processOrders',{action:'created',id}); res.status(201).json({...rows[0],inputs:input.inputs});
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  app.patch('/api/trace/process-orders/:id',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const input=processSchema.parse(req.body); await client.query('BEGIN');
      const currentResult=await client.query('SELECT * FROM process_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[req.params.id,req.user.tenant_id]); const current=currentResult.rows[0];
      if(!current)throw requestError('Urdhri i Punës nuk u gjet.',404); await assertCompanyAccess(req.user,current.company_id,client);
      if(current.status!=='DRAFT')throw requestError('Vetëm Urdhri Draft mund të editohet.',409); if(input.companyId!==current.company_id)throw requestError('Kompania nuk mund të ndryshohet.');
      const validated=await validateProcessDraft(client,req.user,input); const yieldPercent=num(input.outputQuantity)/validated.inputQuantity*100;
      const {rows}=await client.query(`UPDATE process_orders SET warehouse_id=$1,output_product_id=$2,process_type=$3,order_date=$4,input_quantity=$5,output_quantity=$6,waste_quantity=$7,loss_quantity=$8,direct_cost=$9,asset_id=$10,output_quality_status=$11,yield_percent=$12,notes=$13,version=version+1,updated_at=NOW() WHERE id=$14 RETURNING *`,[input.warehouseId,input.outputProductId,input.processType,input.orderDate,validated.inputQuantity,input.outputQuantity,input.wasteQuantity,input.lossQuantity,input.directCost,input.assetId||null,input.outputQualityStatus,yieldPercent,input.notes||null,current.id]);
      await replaceProcessInputs(client,current.id,input.inputs);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PROCESS_ORDER_UPDATE',entityType:'process_order',entityId:current.id,companyId:current.company_id,metadata:{workOrderNo:current.work_order_no},ip:req.ip},client);
      await addChange(client,req.user,current.company_id,'process_order',current.id,'UPDATE',{workOrderNo:current.work_order_no,status:'DRAFT'});
      await client.query('COMMIT'); emitTenant(req.user.tenant_id,'processOrders',{action:'updated',id:current.id}); res.json({...rows[0],inputs:input.inputs});
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  app.delete('/api/trace/process-orders/:id',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN'); const result=await client.query('SELECT * FROM process_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[req.params.id,req.user.tenant_id]); const row=result.rows[0];
      if(!row)throw requestError('Urdhri i Punës nuk u gjet.',404); await assertCompanyAccess(req.user,row.company_id,client); if(row.status!=='DRAFT')throw requestError('Vetëm Urdhri Draft mund të fshihet.',409);
      await client.query('DELETE FROM process_orders WHERE id=$1',[row.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PROCESS_ORDER_DELETE',entityType:'process_order',entityId:row.id,companyId:row.company_id,metadata:{workOrderNo:row.work_order_no},ip:req.ip},client);
      await addChange(client,req.user,row.company_id,'process_order',row.id,'DELETE',{workOrderNo:row.work_order_no});
      await client.query('COMMIT'); emitTenant(req.user.tenant_id,'processOrders',{action:'deleted',id:row.id}); res.json({id:row.id,deleted:true});
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  app.post('/api/trace/process-orders/:id/post',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const orderResult=await client.query('SELECT * FROM process_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[req.params.id,req.user.tenant_id]); const order=orderResult.rows[0];
      if(!order)throw requestError('Urdhri i Punës nuk u gjet.',404); await assertCompanyAccess(req.user,order.company_id,client); if(order.status!=='DRAFT')throw requestError('Urdhri i Punës është postuar ose anulluar.',409);
      const inputResult=await client.query('SELECT lot_id AS "lotId",quantity FROM process_order_inputs WHERE process_order_id=$1 ORDER BY lot_id',[order.id]);
      const inputPayload=inputResult.rows.map((line)=>({lotId:line.lotId,quantity:num(line.quantity)}));
      const relations=await validateWarehouseAndProduct(client,req.user,order.company_id,order.warehouse_id,order.output_product_id);
      const lines=await loadLots(client,req.user,order.company_id,order.warehouse_id,inputPayload,{forUpdate:true});
      const inputQuantity=lines.reduce((sum,line)=>sum+num(line.quantity),0); assertMassBalance(inputQuantity,order.output_quantity,order.waste_quantity,order.loss_quantity);
      const inputCost=lines.reduce((sum,line)=>sum+num(line.quantity)*num(line.lot.unit_cost),0); const outputCost=(inputCost+num(order.direct_cost))/num(order.output_quantity);
      const origin=sharedOrigin(lines);
      const consumed=[]; for(const line of lines)consumed.push(await consumeLot(client,{user:req.user,orderId:order.id,orderNo:order.work_order_no,companyId:order.company_id,warehouseId:order.warehouse_id,line,movementType:'PROCESS_CONSUME',stockMovementType:'PROCESS_ORDER'}));
      const outputLot=await createOutputLot(client,{user:req.user,companyId:order.company_id,warehouseId:order.warehouse_id,product:relations.product,sourceDate:order.order_date,lotType:'PROCESSED',qualityStatus:order.output_quality_status,quantity:num(order.output_quantity),unitCost:outputCost,origin,sourceDocumentId:order.id,sourceDocumentNo:order.work_order_no,movementType:'PROCESS_OUTPUT',stockMovementType:'PROCESS_ORDER',notes:order.notes||''});
      await client.query(`UPDATE process_orders SET status='POSTED',input_quantity=$1,output_lot_id=$2,posted_by=$3,posted_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$4`,[inputQuantity,outputLot.id,req.user.id,order.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PROCESS_ORDER_POST',entityType:'process_order',entityId:order.id,companyId:order.company_id,metadata:{workOrderNo:order.work_order_no,inputQuantity,outputLotNumber:outputLot.lotNumber,outputQuantity:order.output_quantity,wasteQuantity:order.waste_quantity,lossQuantity:order.loss_quantity},ip:req.ip},client);
      await addChange(client,req.user,order.company_id,'process_order',order.id,'POST',{workOrderNo:order.work_order_no,outputLotId:outputLot.id,outputLotNumber:outputLot.lotNumber});
      await addChange(client,req.user,order.company_id,'trace_lot',outputLot.id,'CREATE',{lotNumber:outputLot.lotNumber,lotType:'PROCESSED',sourceProcessOrderId:order.id});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'processOrders',{action:'posted',id:order.id,outputLotId:outputLot.id}); emitTenant(req.user.tenant_id,'traceLots',{action:'processed',id:outputLot.id}); emitTenant(req.user.tenant_id,'stock',{action:'changed',warehouseId:order.warehouse_id});
      res.json({id:order.id,workOrderNo:order.work_order_no,status:'POSTED',inputQuantity,outputQuantity:num(order.output_quantity),wasteQuantity:num(order.waste_quantity),lossQuantity:num(order.loss_quantity),yieldPercent:num(order.yield_percent),consumedLots:consumed,outputLot});
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  async function validatePackagingDraft(client,user,input,{forUpdate=false}={}) {
    await assertCompanyAccess(user,input.companyId,client); const relations=await validateWarehouseAndProduct(client,user,input.companyId,input.warehouseId,input.outputProductId);
    const lines=await loadLots(client,user,input.companyId,input.warehouseId,[{lotId:input.inputLotId,quantity:input.inputQuantity}],{forUpdate,packagedOnly:true});
    assertMassBalance(input.inputQuantity,input.outputQuantity,input.wasteQuantity,0);
    const calculated=num(input.packageCount)*num(input.netWeightPerPackage);
    if(Math.abs(calculated-num(input.outputQuantity))>EPSILON)throw requestError(`Sasia e paketuar duhet të jetë Pakot × Pesha neto për pako. Llogaritur ${calculated} kg.`);
    return {...relations,line:lines[0]};
  }

  app.get('/api/trace/packaging-orders',authRequired,async(req,res,next)=>{
    try{
      const companyIds=await accessibleCompanyIds(req.user); if(!companyIds.length)return res.json([]);
      const {rows}=await pool.query(`SELECT po.*,il.lot_number AS input_lot_number,ip.name AS input_product_name,op.code AS output_product_code,op.name AS output_product_name,ol.lot_number AS output_lot_number,w.name AS warehouse_name
        FROM packaging_orders po JOIN trace_lots il ON il.id=po.input_lot_id JOIN products ip ON ip.id=il.product_id JOIN products op ON op.id=po.output_product_id JOIN warehouses w ON w.id=po.warehouse_id LEFT JOIN trace_lots ol ON ol.id=po.output_lot_id
        WHERE po.tenant_id=$1 AND po.company_id=ANY($2::uuid[]) ORDER BY po.order_date DESC,po.created_at DESC`,[req.user.tenant_id,companyIds]); res.json(rows);
    }catch(error){next(error);}
  });

  app.get('/api/trace/packaging-orders/:id',authRequired,async(req,res,next)=>{
    try{
      const {rows}=await pool.query(`SELECT po.*,il.lot_number AS input_lot_number,ip.name AS input_product_name,op.code AS output_product_code,op.name AS output_product_name,ol.lot_number AS output_lot_number,w.name AS warehouse_name
        FROM packaging_orders po JOIN trace_lots il ON il.id=po.input_lot_id JOIN products ip ON ip.id=il.product_id JOIN products op ON op.id=po.output_product_id JOIN warehouses w ON w.id=po.warehouse_id LEFT JOIN trace_lots ol ON ol.id=po.output_lot_id
        WHERE po.id=$1 AND po.tenant_id=$2 LIMIT 1`,[req.params.id,req.user.tenant_id]); if(!rows[0])throw requestError('Urdhri i Paketimit nuk u gjet.',404); await assertCompanyAccess(req.user,rows[0].company_id); res.json(rows[0]);
    }catch(error){next(error);}
  });

  app.post('/api/trace/packaging-orders',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const input=packagingSchema.parse(req.body); await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); await validatePackagingDraft(client,req.user,input);
      const id=randomUUID(); const packagingNo=await nextDocumentNo(client,req.user.tenant_id,input.companyId,'PAK',input.orderDate);
      const {rows}=await client.query(`INSERT INTO packaging_orders(id,tenant_id,company_id,warehouse_id,input_lot_id,output_product_id,packaging_no,status,order_date,input_quantity,output_quantity,waste_quantity,package_count,units_per_package,net_weight_per_package,direct_cost,output_quality_status,expiry_date,notes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,[id,req.user.tenant_id,input.companyId,input.warehouseId,input.inputLotId,input.outputProductId,packagingNo,input.orderDate,input.inputQuantity,input.outputQuantity,input.wasteQuantity,input.packageCount,input.unitsPerPackage,input.netWeightPerPackage,input.directCost,input.outputQualityStatus,input.expiryDate||null,input.notes||null,req.user.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PACKAGING_ORDER_CREATE',entityType:'packaging_order',entityId:id,companyId:input.companyId,metadata:{packagingNo,inputLotId:input.inputLotId,outputQuantity:input.outputQuantity},ip:req.ip},client); await addChange(client,req.user,input.companyId,'packaging_order',id,'CREATE',{packagingNo,status:'DRAFT'});
      await client.query('COMMIT'); emitTenant(req.user.tenant_id,'packagingOrders',{action:'created',id}); res.status(201).json(rows[0]);
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  app.patch('/api/trace/packaging-orders/:id',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const input=packagingSchema.parse(req.body); await client.query('BEGIN'); const result=await client.query('SELECT * FROM packaging_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[req.params.id,req.user.tenant_id]); const row=result.rows[0];
      if(!row)throw requestError('Urdhri i Paketimit nuk u gjet.',404); await assertCompanyAccess(req.user,row.company_id,client); if(row.status!=='DRAFT')throw requestError('Vetëm Paketimi Draft mund të editohet.',409); if(input.companyId!==row.company_id)throw requestError('Kompania nuk mund të ndryshohet.');
      await validatePackagingDraft(client,req.user,input);
      const {rows}=await client.query(`UPDATE packaging_orders SET warehouse_id=$1,input_lot_id=$2,output_product_id=$3,order_date=$4,input_quantity=$5,output_quantity=$6,waste_quantity=$7,package_count=$8,units_per_package=$9,net_weight_per_package=$10,direct_cost=$11,output_quality_status=$12,expiry_date=$13,notes=$14,version=version+1,updated_at=NOW() WHERE id=$15 RETURNING *`,[input.warehouseId,input.inputLotId,input.outputProductId,input.orderDate,input.inputQuantity,input.outputQuantity,input.wasteQuantity,input.packageCount,input.unitsPerPackage,input.netWeightPerPackage,input.directCost,input.outputQualityStatus,input.expiryDate||null,input.notes||null,row.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PACKAGING_ORDER_UPDATE',entityType:'packaging_order',entityId:row.id,companyId:row.company_id,metadata:{packagingNo:row.packaging_no},ip:req.ip},client); await addChange(client,req.user,row.company_id,'packaging_order',row.id,'UPDATE',{packagingNo:row.packaging_no,status:'DRAFT'});
      await client.query('COMMIT'); emitTenant(req.user.tenant_id,'packagingOrders',{action:'updated',id:row.id}); res.json(rows[0]);
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  app.delete('/api/trace/packaging-orders/:id',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN'); const result=await client.query('SELECT * FROM packaging_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[req.params.id,req.user.tenant_id]); const row=result.rows[0];
      if(!row)throw requestError('Urdhri i Paketimit nuk u gjet.',404); await assertCompanyAccess(req.user,row.company_id,client); if(row.status!=='DRAFT')throw requestError('Vetëm Paketimi Draft mund të fshihet.',409);
      await client.query('DELETE FROM packaging_orders WHERE id=$1',[row.id]); await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PACKAGING_ORDER_DELETE',entityType:'packaging_order',entityId:row.id,companyId:row.company_id,metadata:{packagingNo:row.packaging_no},ip:req.ip},client); await addChange(client,req.user,row.company_id,'packaging_order',row.id,'DELETE',{packagingNo:row.packaging_no});
      await client.query('COMMIT'); emitTenant(req.user.tenant_id,'packagingOrders',{action:'deleted',id:row.id}); res.json({id:row.id,deleted:true});
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  app.post('/api/trace/packaging-orders/:id/post',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); const result=await client.query('SELECT * FROM packaging_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[req.params.id,req.user.tenant_id]); const order=result.rows[0];
      if(!order)throw requestError('Urdhri i Paketimit nuk u gjet.',404); await assertCompanyAccess(req.user,order.company_id,client); if(order.status!=='DRAFT')throw requestError('Urdhri i Paketimit është postuar ose anulluar.',409);
      const input={companyId:order.company_id,warehouseId:order.warehouse_id,inputLotId:order.input_lot_id,outputProductId:order.output_product_id,orderDate:String(order.order_date).slice(0,10),inputQuantity:num(order.input_quantity),outputQuantity:num(order.output_quantity),wasteQuantity:num(order.waste_quantity),packageCount:num(order.package_count),unitsPerPackage:num(order.units_per_package),netWeightPerPackage:num(order.net_weight_per_package),directCost:num(order.direct_cost),outputQualityStatus:order.output_quality_status,expiryDate:order.expiry_date?String(order.expiry_date).slice(0,10):null,notes:order.notes||''};
      const validated=await validatePackagingDraft(client,req.user,input,{forUpdate:true}); const line=validated.line; const inputCost=num(line.quantity)*num(line.lot.unit_cost); const outputCost=(inputCost+num(order.direct_cost))/num(order.output_quantity);
      const origin=sharedOrigin([line]); const consumed=await consumeLot(client,{user:req.user,orderId:order.id,orderNo:order.packaging_no,companyId:order.company_id,warehouseId:order.warehouse_id,line,movementType:'PACKAGING_CONSUME',stockMovementType:'PACKAGING_ORDER'});
      const outputLot=await createOutputLot(client,{user:req.user,companyId:order.company_id,warehouseId:order.warehouse_id,product:validated.product,sourceDate:order.order_date,lotType:'PACKAGED',qualityStatus:order.output_quality_status,quantity:num(order.output_quantity),unitCost:outputCost,origin,sourceDocumentId:order.id,sourceDocumentNo:order.packaging_no,movementType:'PACKAGING_OUTPUT',stockMovementType:'PACKAGING_ORDER',expiryDate:order.expiry_date,notes:`${order.notes||''}${order.notes?' · ':''}${num(order.package_count)} pako × ${num(order.net_weight_per_package)} kg`});
      await client.query(`UPDATE packaging_orders SET status='POSTED',output_lot_id=$1,posted_by=$2,posted_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$3`,[outputLot.id,req.user.id,order.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PACKAGING_ORDER_POST',entityType:'packaging_order',entityId:order.id,companyId:order.company_id,metadata:{packagingNo:order.packaging_no,inputLotNumber:line.lot.lot_number,outputLotNumber:outputLot.lotNumber,packageCount:order.package_count,outputQuantity:order.output_quantity},ip:req.ip},client); await addChange(client,req.user,order.company_id,'packaging_order',order.id,'POST',{packagingNo:order.packaging_no,outputLotId:outputLot.id,outputLotNumber:outputLot.lotNumber}); await addChange(client,req.user,order.company_id,'trace_lot',outputLot.id,'CREATE',{lotNumber:outputLot.lotNumber,lotType:'PACKAGED',sourcePackagingOrderId:order.id});
      await client.query('COMMIT'); emitTenant(req.user.tenant_id,'packagingOrders',{action:'posted',id:order.id,outputLotId:outputLot.id}); emitTenant(req.user.tenant_id,'traceLots',{action:'packaged',id:outputLot.id}); emitTenant(req.user.tenant_id,'stock',{action:'changed',warehouseId:order.warehouse_id});
      res.json({id:order.id,packagingNo:order.packaging_no,status:'POSTED',inputQuantity:num(order.input_quantity),outputQuantity:num(order.output_quantity),wasteQuantity:num(order.waste_quantity),packageCount:num(order.package_count),unitsPerPackage:num(order.units_per_package),netWeightPerPackage:num(order.net_weight_per_package),consumedLot:consumed,outputLot});
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  app.get('/api/trace/lots/:id/lineage',authRequired,async(req,res,next)=>{
    try{
      const lotResult=await pool.query('SELECT * FROM trace_lots WHERE id=$1 AND tenant_id=$2',[req.params.id,req.user.tenant_id]); const lot=lotResult.rows[0]; if(!lot)throw requestError('Loti nuk u gjet.',404); await assertCompanyAccess(req.user,lot.company_id);
      const ancestors=await pool.query(`WITH RECURSIVE chain AS (
        SELECT l.id,l.lot_number,l.lot_type,l.parent_lot_id,0 AS depth FROM trace_lots l WHERE l.id=$1
        UNION ALL
        SELECT p.id,p.lot_number,p.lot_type,p.parent_lot_id,c.depth+1 FROM trace_lots p JOIN chain c ON p.id=c.parent_lot_id WHERE c.depth<30
      ) SELECT * FROM chain ORDER BY depth DESC`,[lot.id]);
      const descendants=await pool.query(`WITH RECURSIVE chain AS (
        SELECT l.id,l.lot_number,l.lot_type,l.parent_lot_id,0 AS depth FROM trace_lots l WHERE l.id=$1
        UNION ALL
        SELECT c.id,c.lot_number,c.lot_type,c.parent_lot_id,p.depth+1 FROM trace_lots c JOIN chain p ON c.parent_lot_id=p.id WHERE p.depth<30
      ) SELECT * FROM chain ORDER BY depth,id`,[lot.id]);
      const producedByProcess=await pool.query(`SELECT po.* FROM process_orders po WHERE po.output_lot_id=$1`,[lot.id]);
      const consumedByProcesses=await pool.query(`SELECT po.*,poi.quantity FROM process_order_inputs poi JOIN process_orders po ON po.id=poi.process_order_id WHERE poi.lot_id=$1 ORDER BY po.created_at`,[lot.id]);
      const producedByPackaging=await pool.query(`SELECT po.* FROM packaging_orders po WHERE po.output_lot_id=$1`,[lot.id]);
      const consumedByPackaging=await pool.query(`SELECT po.* FROM packaging_orders po WHERE po.input_lot_id=$1 ORDER BY po.created_at`,[lot.id]);
      res.json({lot,ancestors:ancestors.rows,descendants:descendants.rows,producedByProcess:producedByProcess.rows[0]||null,consumedByProcesses:consumedByProcesses.rows,producedByPackaging:producedByPackaging.rows[0]||null,consumedByPackaging:consumedByPackaging.rows});
    }catch(error){next(error);}
  });
}
