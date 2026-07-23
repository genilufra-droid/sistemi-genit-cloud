import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const WRITE_ROLES = ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','SHITES'];
const EPSILON = 0.000001;
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

async function nextShipmentNo(client, tenantId, companyId, dateValue) {
  const dateText = dateValue instanceof Date ? dateValue.toISOString().slice(0,10) : String(dateValue || new Date().toISOString().slice(0,10)).slice(0,10);
  const year = dateText.slice(0,4);
  const value = await nextSequence(client,tenantId,companyId,`NGK-${year}`);
  return `NGK-${year}-${String(value).padStart(6,'0')}`;
}

async function addChange(client,user,companyId,entityType,entityId,operation,metadata={}) {
  await client.query(`INSERT INTO cloud_change_events(tenant_id,company_id,entity_type,entity_id,operation,metadata,user_id)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,[user.tenant_id,companyId,entityType,entityId,operation,JSON.stringify(metadata),user.id]);
}

async function addEvent(client,{user,shipmentId,companyId,eventType,fromStatus=null,toStatus=null,notes='',metadata={}}) {
  await client.query(`INSERT INTO export_shipment_events(id,tenant_id,company_id,shipment_id,event_type,from_status,to_status,notes,metadata,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,[randomUUID(),user.tenant_id,companyId,shipmentId,eventType,fromStatus,toStatus,notes||null,JSON.stringify(metadata),user.id]);
}

export async function migratePhase4ExportShipments(db) {
  await db.query(`
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS planned_departure_at TIMESTAMPTZ;
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS loading_started_at TIMESTAMPTZ;
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS sealed_at TIMESTAMPTZ;
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS border_arrival_at TIMESTAMPTZ;
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS destination_country VARCHAR(120);
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS packing_list_no VARCHAR(100);
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS commercial_invoice_no VARCHAR(100);
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS customs_reference VARCHAR(140);
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS proof_of_delivery_reference VARCHAR(180);
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS delivery_document_id UUID REFERENCES business_documents(id) ON DELETE SET NULL;
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS sales_document_id UUID REFERENCES business_documents(id) ON DELETE SET NULL;
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS currency VARCHAR(8) NOT NULL DEFAULT 'ALL';
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS total_value NUMERIC(18,4) NOT NULL DEFAULT 0;
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

    ALTER TABLE export_shipment_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(18,4) NOT NULL DEFAULT 0;
    ALTER TABLE export_shipment_items ADD COLUMN IF NOT EXISTS line_total NUMERIC(18,4) NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS export_shipment_events (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      shipment_id UUID NOT NULL REFERENCES export_shipments(id) ON DELETE CASCADE,
      event_type VARCHAR(60) NOT NULL,
      from_status VARCHAR(30),
      to_status VARCHAR(30),
      notes TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS export_shipment_documents (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      shipment_id UUID NOT NULL REFERENCES export_shipments(id) ON DELETE CASCADE,
      document_type VARCHAR(50) NOT NULL,
      document_no VARCHAR(140),
      document_date DATE,
      filename VARCHAR(240),
      storage_url TEXT,
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(shipment_id,document_type,document_no)
    );

    CREATE INDEX IF NOT EXISTS idx_export_events_shipment ON export_shipment_events(shipment_id,created_at);
    CREATE INDEX IF NOT EXISTS idx_export_documents_shipment ON export_shipment_documents(shipment_id,document_type);
    CREATE INDEX IF NOT EXISTS idx_export_items_lot ON export_shipment_items(lot_id,shipment_id);
  `);
}

export function installPhase4ExportShipmentRoutes({app,pool,authRequired,requireRoles,assertCompanyAccess,accessibleCompanyIds,audit,emitTenant}) {
  const itemSchema = z.object({
    lotId:z.string().uuid(), quantity:z.coerce.number().positive(), packageCount:z.coerce.number().min(0).default(0),
    palletReference:z.string().trim().max(120).optional().default(''), salesDocumentId:z.string().uuid().nullable().optional(),
    unitPrice:z.coerce.number().min(0).default(0),
  });
  const shipmentSchema = z.object({
    companyId:z.string().uuid(), warehouseId:z.string().uuid(), customerId:z.string().uuid(), vehicleId:z.string().uuid().nullable().optional(),
    shipmentDate:z.string().date(), plannedDepartureAt:z.string().nullable().optional(), driverName:z.string().trim().min(2).max(180),
    trailerPlate:z.string().trim().max(40).optional().default(''), containerNo:z.string().trim().max(80).optional().default(''),
    origin:z.string().trim().min(2).max(220), destination:z.string().trim().min(2).max(220), destinationCountry:z.string().trim().max(120).optional().default(''),
    borderPoint:z.string().trim().max(180).optional().default(''), incoterm:z.string().trim().max(20).optional().default(''),
    grossWeight:z.coerce.number().min(0).default(0), currency:z.string().trim().min(3).max(8).default('ALL'),
    notes:z.string().trim().max(3000).optional().default(''), lines:z.array(itemSchema).min(1),
  });
  const sealSchema = z.object({
    sealNo:z.string().trim().min(1).max(80), cmrNo:z.string().trim().min(1).max(100), packingListNo:z.string().trim().min(1).max(100),
    commercialInvoiceNo:z.string().trim().min(1).max(100), customsReference:z.string().trim().max(140).optional().default(''), notes:z.string().trim().max(1000).optional().default(''),
  });
  const documentSchema = z.object({
    documentType:z.enum(['CMR','PACKING_LIST','COMMERCIAL_INVOICE','CUSTOMS','CERTIFICATE_OF_ORIGIN','PHYTOSANITARY','QUALITY_CERTIFICATE','OTHER']),
    documentNo:z.string().trim().max(140).optional().default(''), documentDate:z.string().date().nullable().optional(), filename:z.string().trim().max(240).optional().default(''),
    storageUrl:z.string().trim().max(2000).optional().default(''), notes:z.string().trim().max(1000).optional().default(''),
  });

  async function validateHeader(client,user,input) {
    await assertCompanyAccess(user,input.companyId,client);
    const warehouse=await client.query(`SELECT id,name FROM warehouses WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`,[input.warehouseId,user.tenant_id,input.companyId]);
    if(!warehouse.rowCount)throw requestError('Magazina nuk është e vlefshme.');
    const customer=await client.query(`SELECT id,name,nipt FROM business_partners WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE AND partner_type IN ('CUSTOMER','BOTH')`,[input.customerId,user.tenant_id,input.companyId]);
    if(!customer.rowCount)throw requestError('Klienti nuk është i vlefshëm.');
    let vehicle=null;
    if(input.vehicleId){
      const result=await client.query(`SELECT * FROM logistics_vehicles WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`,[input.vehicleId,user.tenant_id,input.companyId]);
      if(!result.rowCount)throw requestError('Automjeti nuk është i vlefshëm.');
      vehicle=result.rows[0];
    }
    return {warehouse:warehouse.rows[0],customer:customer.rows[0],vehicle};
  }

  async function loadLines(client,user,input,{forUpdate=false}={}) {
    const ids=input.lines.map(x=>x.lotId);
    if(new Set(ids).size!==ids.length)throw requestError('I njëjti lot nuk mund të përsëritet në ngarkesë.');
    const lock=forUpdate?' FOR UPDATE':'';
    const {rows}=await client.query(`SELECT l.*,p.code AS product_code,p.name AS product_name,p.base_unit
      FROM trace_lots l JOIN products p ON p.id=l.product_id
      WHERE l.id=ANY($1::uuid[]) AND l.tenant_id=$2 AND l.company_id=$3 ORDER BY l.id${lock}`,[ids,user.tenant_id,input.companyId]);
    if(rows.length!==ids.length)throw requestError('Një ose më shumë lote nuk u gjetën.');
    const byId=new Map(rows.map(row=>[row.id,row]));
    return input.lines.map(line=>{
      const lot=byId.get(line.lotId);
      if(lot.warehouse_id!==input.warehouseId)throw requestError(`Loti ${lot.lot_number} nuk ndodhet në magazinën e ngarkesës.`);
      if(lot.lot_type!=='PACKAGED')throw requestError(`Ngarkesa e eksportit pranon vetëm lote PACKAGED. ${lot.lot_number} është ${lot.lot_type}.`,409);
      if(lot.status!=='AVAILABLE'||lot.quality_status!=='APPROVED')throw requestError(`Loti ${lot.lot_number} duhet të jetë i aprovuar dhe i disponueshëm.`,409);
      if(num(lot.quantity_available)+EPSILON<num(line.quantity))throw requestError(`Gjendja e lotit ${lot.lot_number} është ${num(lot.quantity_available)}, kërkohen ${num(line.quantity)}.`,409);
      return {...line,lot,lineTotal:num(line.quantity)*num(line.unitPrice)};
    });
  }

  function totals(lines,grossWeight){
    const netWeight=lines.reduce((sum,x)=>sum+num(x.quantity),0);
    const packageCount=lines.reduce((sum,x)=>sum+num(x.packageCount),0);
    const pallets=new Set(lines.map(x=>text(x.palletReference)).filter(Boolean));
    const totalValue=lines.reduce((sum,x)=>sum+num(x.lineTotal),0);
    if(num(grossWeight)>0&&num(grossWeight)+EPSILON<netWeight)throw requestError('Pesha bruto nuk mund të jetë më e vogël se pesha neto.');
    return {netWeight,grossWeight:num(grossWeight)||netWeight,packageCount,palletCount:pallets.size,totalValue};
  }

  async function replaceItems(client,shipmentId,lines){
    await client.query('DELETE FROM export_shipment_items WHERE shipment_id=$1',[shipmentId]);
    for(const line of lines){
      await client.query(`INSERT INTO export_shipment_items(id,shipment_id,lot_id,product_id,quantity,package_count,pallet_reference,sales_document_id,unit_price,line_total)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[randomUUID(),shipmentId,line.lot.id,line.lot.product_id,line.quantity,line.packageCount,line.palletReference||null,line.salesDocumentId||null,line.unitPrice,line.lineTotal]);
    }
  }

  app.get('/api/export/shipments',authRequired,async(req,res,next)=>{
    try{
      const companyIds=await accessibleCompanyIds(req.user);if(!companyIds.length)return res.json([]);
      const {rows}=await pool.query(`SELECT s.*,bp.name AS customer_name,bp.nipt AS customer_nipt,w.name AS warehouse_name,v.plate_no,v.make,v.model,
        d.document_no AS delivery_document_no,(SELECT COUNT(*)::int FROM export_shipment_items si WHERE si.shipment_id=s.id) AS line_count
        FROM export_shipments s JOIN business_partners bp ON bp.id=s.customer_id JOIN warehouses w ON w.id=s.warehouse_id
        LEFT JOIN logistics_vehicles v ON v.id=s.vehicle_id LEFT JOIN business_documents d ON d.id=s.delivery_document_id
        WHERE s.tenant_id=$1 AND s.company_id=ANY($2::uuid[]) ORDER BY s.created_at DESC`,[req.user.tenant_id,companyIds]);
      res.json(rows);
    }catch(error){next(error);}
  });

  app.get('/api/export/shipments/:id',authRequired,async(req,res,next)=>{
    try{
      const {rows}=await pool.query(`SELECT s.*,bp.name AS customer_name,bp.nipt AS customer_nipt,w.name AS warehouse_name,v.plate_no,v.make,v.model,d.document_no AS delivery_document_no
        FROM export_shipments s JOIN business_partners bp ON bp.id=s.customer_id JOIN warehouses w ON w.id=s.warehouse_id
        LEFT JOIN logistics_vehicles v ON v.id=s.vehicle_id LEFT JOIN business_documents d ON d.id=s.delivery_document_id
        WHERE s.id=$1 AND s.tenant_id=$2 LIMIT 1`,[req.params.id,req.user.tenant_id]);
      const shipment=rows[0];if(!shipment)throw requestError('Ngarkesa nuk u gjet.',404);await assertCompanyAccess(req.user,shipment.company_id);
      const [items,events,documents]=await Promise.all([
        pool.query(`SELECT si.*,l.lot_number,l.lot_type,l.quality_status,l.status AS lot_status,p.code AS product_code,p.name AS product_name,p.base_unit
          FROM export_shipment_items si JOIN trace_lots l ON l.id=si.lot_id JOIN products p ON p.id=si.product_id WHERE si.shipment_id=$1 ORDER BY si.pallet_reference,p.name,l.lot_number`,[shipment.id]),
        pool.query(`SELECT e.*,u.full_name AS created_by_name FROM export_shipment_events e LEFT JOIN users u ON u.id=e.created_by WHERE e.shipment_id=$1 ORDER BY e.created_at`,[shipment.id]),
        pool.query(`SELECT * FROM export_shipment_documents WHERE shipment_id=$1 ORDER BY document_type,created_at`,[shipment.id]),
      ]);
      res.json({shipment,items:items.rows,events:events.rows,documents:documents.rows});
    }catch(error){next(error);}
  });

  app.post('/api/export/shipments',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const input=shipmentSchema.parse(req.body);await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');await validateHeader(client,req.user,input);
      const lines=await loadLines(client,req.user,input);const summary=totals(lines,input.grossWeight);const id=randomUUID();const shipmentNo=await nextShipmentNo(client,req.user.tenant_id,input.companyId,input.shipmentDate);
      const {rows}=await client.query(`INSERT INTO export_shipments(id,tenant_id,company_id,warehouse_id,customer_id,vehicle_id,shipment_no,status,planned_departure_at,driver_name,trailer_plate,container_no,origin,destination,destination_country,border_point,incoterm,net_weight,gross_weight,pallet_count,package_count,currency,total_value,notes,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$25) RETURNING *`,[id,req.user.tenant_id,input.companyId,input.warehouseId,input.customerId,input.vehicleId||null,shipmentNo,input.plannedDepartureAt||null,input.driverName,input.trailerPlate||null,input.containerNo||null,input.origin,input.destination,input.destinationCountry||null,input.borderPoint||null,input.incoterm||null,summary.netWeight,summary.grossWeight,summary.palletCount,summary.packageCount,input.currency,summary.totalValue,input.notes||null,req.user.id]);
      await replaceItems(client,id,lines);await addEvent(client,{user:req.user,shipmentId:id,companyId:input.companyId,eventType:'CREATED',toStatus:'DRAFT',metadata:{shipmentNo}});
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'EXPORT_SHIPMENT_CREATE',entityType:'export_shipment',entityId:id,companyId:input.companyId,metadata:{shipmentNo,netWeight:summary.netWeight,packageCount:summary.packageCount},ip:req.ip},client);
      await addChange(client,req.user,input.companyId,'export_shipment',id,'CREATE',{shipmentNo,status:'DRAFT'});await client.query('COMMIT');emitTenant(req.user.tenant_id,'exportShipments',{action:'created',id});res.status(201).json({...rows[0],items:lines});
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  app.patch('/api/export/shipments/:id',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const input=shipmentSchema.parse(req.body);await client.query('BEGIN');const result=await client.query('SELECT * FROM export_shipments WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[req.params.id,req.user.tenant_id]);const current=result.rows[0];
      if(!current)throw requestError('Ngarkesa nuk u gjet.',404);await assertCompanyAccess(req.user,current.company_id,client);if(!['DRAFT','PLANNED'].includes(current.status))throw requestError('Ngarkesa mund të editohet vetëm në Draft ose Planifikuar.',409);if(input.companyId!==current.company_id)throw requestError('Kompania nuk mund të ndryshohet.');
      await validateHeader(client,req.user,input);const lines=await loadLines(client,req.user,input);const summary=totals(lines,input.grossWeight);
      const {rows}=await client.query(`UPDATE export_shipments SET warehouse_id=$1,customer_id=$2,vehicle_id=$3,planned_departure_at=$4,driver_name=$5,trailer_plate=$6,container_no=$7,origin=$8,destination=$9,destination_country=$10,border_point=$11,incoterm=$12,net_weight=$13,gross_weight=$14,pallet_count=$15,package_count=$16,currency=$17,total_value=$18,notes=$19,version=version+1,updated_by=$20,updated_at=NOW() WHERE id=$21 RETURNING *`,[input.warehouseId,input.customerId,input.vehicleId||null,input.plannedDepartureAt||null,input.driverName,input.trailerPlate||null,input.containerNo||null,input.origin,input.destination,input.destinationCountry||null,input.borderPoint||null,input.incoterm||null,summary.netWeight,summary.grossWeight,summary.palletCount,summary.packageCount,input.currency,summary.totalValue,input.notes||null,req.user.id,current.id]);
      await replaceItems(client,current.id,lines);await addEvent(client,{user:req.user,shipmentId:current.id,companyId:current.company_id,eventType:'UPDATED',fromStatus:current.status,toStatus:current.status});await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'EXPORT_SHIPMENT_UPDATE',entityType:'export_shipment',entityId:current.id,companyId:current.company_id,metadata:{shipmentNo:current.shipment_no},ip:req.ip},client);await addChange(client,req.user,current.company_id,'export_shipment',current.id,'UPDATE',{shipmentNo:current.shipment_no,status:current.status});
      await client.query('COMMIT');emitTenant(req.user.tenant_id,'exportShipments',{action:'updated',id:current.id});res.json({...rows[0],items:lines});
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  async function changeStatus(req,res,next,{allowed,to,eventType,fields={},bodyNotes=''}){
    const client=await pool.connect();
    try{
      await client.query('BEGIN');const result=await client.query('SELECT * FROM export_shipments WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[req.params.id,req.user.tenant_id]);const row=result.rows[0];if(!row)throw requestError('Ngarkesa nuk u gjet.',404);await assertCompanyAccess(req.user,row.company_id,client);if(!allowed.includes(row.status))throw requestError(`Kalimi ${row.status} → ${to} nuk lejohet.`,409);
      const assignments=['status=$1','version=version+1','updated_by=$2','updated_at=NOW()'];const values=[to,req.user.id];let index=3;
      for(const [column,value] of Object.entries(fields)){assignments.push(`${column}=$${index++}`);values.push(value);}values.push(row.id);
      await client.query(`UPDATE export_shipments SET ${assignments.join(',')} WHERE id=$${index}`,values);await addEvent(client,{user:req.user,shipmentId:row.id,companyId:row.company_id,eventType,fromStatus:row.status,toStatus:to,notes:bodyNotes});await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:`EXPORT_SHIPMENT_${eventType}`,entityType:'export_shipment',entityId:row.id,companyId:row.company_id,metadata:{shipmentNo:row.shipment_no,from:row.status,to},ip:req.ip},client);await addChange(client,req.user,row.company_id,'export_shipment',row.id,'STATUS',{shipmentNo:row.shipment_no,from:row.status,to});await client.query('COMMIT');emitTenant(req.user.tenant_id,'exportShipments',{action:'status',id:row.id,status:to});res.json({id:row.id,shipmentNo:row.shipment_no,status:to});
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  }

  app.post('/api/export/shipments/:id/plan',authRequired,requireRoles(...WRITE_ROLES),(req,res,next)=>changeStatus(req,res,next,{allowed:['DRAFT'],to:'PLANNED',eventType:'PLANNED',fields:{planned_departure_at:req.body?.plannedDepartureAt||new Date().toISOString()},bodyNotes:text(req.body?.notes)}));
  app.post('/api/export/shipments/:id/start-loading',authRequired,requireRoles(...WRITE_ROLES),(req,res,next)=>changeStatus(req,res,next,{allowed:['PLANNED'],to:'LOADING',eventType:'LOADING_STARTED',fields:{loading_started_at:new Date().toISOString()},bodyNotes:text(req.body?.notes)}));

  app.post('/api/export/shipments/:id/seal',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const input=sealSchema.parse(req.body);return changeStatus(req,res,next,{allowed:['LOADING'],to:'SEALED',eventType:'SEALED',fields:{seal_no:input.sealNo,cmr_no:input.cmrNo,packing_list_no:input.packingListNo,commercial_invoice_no:input.commercialInvoiceNo,customs_reference:input.customsReference||null,sealed_at:new Date().toISOString()},bodyNotes:input.notes});
  });

  app.post('/api/export/shipments/:id/dispatch',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');const result=await client.query('SELECT * FROM export_shipments WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[req.params.id,req.user.tenant_id]);const shipment=result.rows[0];if(!shipment)throw requestError('Ngarkesa nuk u gjet.',404);await assertCompanyAccess(req.user,shipment.company_id,client);if(shipment.status!=='SEALED')throw requestError('Vetëm ngarkesa e vulosur mund të niset.',409);if(!shipment.seal_no||!shipment.cmr_no||!shipment.packing_list_no||!shipment.commercial_invoice_no)throw requestError('Vula, CMR, Packing List dhe Commercial Invoice janë të detyrueshme.',409);
      const itemResult=await client.query(`SELECT si.lot_id AS "lotId",si.quantity,si.package_count AS "packageCount",si.pallet_reference AS "palletReference",si.sales_document_id AS "salesDocumentId",si.unit_price AS "unitPrice" FROM export_shipment_items si WHERE si.shipment_id=$1 ORDER BY si.lot_id`,[shipment.id]);
      const input={companyId:shipment.company_id,warehouseId:shipment.warehouse_id,lines:itemResult.rows};const lines=await loadLines(client,req.user,input,{forUpdate:true});
      const deliveryId=randomUUID();const deliveryNo=`FD-${shipment.shipment_no}`.slice(0,80);const total=lines.reduce((sum,x)=>sum+x.lineTotal,0);
      await client.query(`INSERT INTO business_documents(id,tenant_id,company_id,warehouse_id,partner_id,doc_type,document_no,document_date,status,notes,total_net,total_vat,total_amount,created_by,confirmed_at)
        VALUES($1,$2,$3,$4,$5,'DELIVERY_NOTE',$6,CURRENT_DATE,'CONFIRMED',$7,$8,0,$8,$9,NOW())`,[deliveryId,req.user.tenant_id,shipment.company_id,shipment.warehouse_id,shipment.customer_id,deliveryNo,`Fletë-Dalje automatike nga ngarkesa ${shipment.shipment_no}`,total,req.user.id]);
      for(const line of lines){
        await client.query(`INSERT INTO business_document_items(id,document_id,product_id,description,unit,coefficient,quantity,free_quantity,unit_price,vat_rate,line_net,line_vat,line_total)
          VALUES($1,$2,$3,$4,$5,1,$6,0,$7,0,$8,0,$8)`,[randomUUID(),deliveryId,line.lot.product_id,`${line.lot.product_name} · Lot ${line.lot.lot_number}`,line.lot.base_unit||'kg',line.quantity,line.unitPrice,line.lineTotal]);
        const availableAfter=num(line.lot.quantity_available)-num(line.quantity);const consumedAfter=num(line.lot.quantity_consumed)+num(line.quantity);const statusAfter=availableAfter<=EPSILON?'DEPLETED':line.lot.status;
        await client.query(`UPDATE trace_lots SET quantity_available=$1,quantity_consumed=$2,status=$3,version=version+1,updated_at=NOW() WHERE id=$4`,[Math.max(0,availableAfter),consumedAfter,statusAfter,line.lot.id]);
        await client.query(`INSERT INTO trace_lot_movements(id,tenant_id,company_id,lot_id,warehouse_id,product_id,movement_type,quantity,balance_after,source_document_type,source_document_id,source_document_no,metadata,created_by)
          VALUES($1,$2,$3,$4,$5,$6,'SHIPMENT_OUT',$7,$8,'EXPORT_SHIPMENT',$9,$10,$11::jsonb,$12)`,[randomUUID(),req.user.tenant_id,shipment.company_id,line.lot.id,shipment.warehouse_id,line.lot.product_id,-num(line.quantity),Math.max(0,availableAfter),shipment.id,shipment.shipment_no,JSON.stringify({deliveryDocumentId:deliveryId,deliveryDocumentNo:deliveryNo,palletReference:line.palletReference,packageCount:line.packageCount,customerId:shipment.customer_id}),req.user.id]);
        await client.query(`INSERT INTO stock_movements(id,tenant_id,company_id,warehouse_id,product_id,movement_type,quantity_base,unit_cost,reference_type,reference_id,reference_no,created_by)
          VALUES($1,$2,$3,$4,$5,'DELIVERY_NOTE',$6,$7,'EXPORT_SHIPMENT',$8,$9,$10)`,[randomUUID(),req.user.tenant_id,shipment.company_id,shipment.warehouse_id,line.lot.product_id,-num(line.quantity),num(line.lot.unit_cost),shipment.id,shipment.shipment_no,req.user.id]);
      }
      await client.query(`UPDATE export_shipments SET status='DISPATCHED',departure_at=COALESCE(departure_at,NOW()),dispatched_at=NOW(),delivery_document_id=$1,total_value=$2,version=version+1,updated_by=$3,updated_at=NOW() WHERE id=$4`,[deliveryId,total,req.user.id,shipment.id]);
      await addEvent(client,{user:req.user,shipmentId:shipment.id,companyId:shipment.company_id,eventType:'DISPATCHED',fromStatus:'SEALED',toStatus:'DISPATCHED',metadata:{deliveryId,deliveryNo,sealNo:shipment.seal_no,cmrNo:shipment.cmr_no}});await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'EXPORT_SHIPMENT_DISPATCH',entityType:'export_shipment',entityId:shipment.id,companyId:shipment.company_id,metadata:{shipmentNo:shipment.shipment_no,deliveryNo,netWeight:shipment.net_weight,customerId:shipment.customer_id},ip:req.ip},client);await addChange(client,req.user,shipment.company_id,'export_shipment',shipment.id,'DISPATCH',{shipmentNo:shipment.shipment_no,deliveryId,deliveryNo});await addChange(client,req.user,shipment.company_id,'business_document',deliveryId,'POST',{docType:'DELIVERY_NOTE',documentNo:deliveryNo});await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'exportShipments',{action:'dispatched',id:shipment.id,deliveryId});emitTenant(req.user.tenant_id,'documents',{action:'confirmed',id:deliveryId,docType:'DELIVERY_NOTE'});emitTenant(req.user.tenant_id,'stock',{action:'changed',warehouseId:shipment.warehouse_id});res.json({id:shipment.id,shipmentNo:shipment.shipment_no,status:'DISPATCHED',deliveryDocument:{id:deliveryId,documentNo:deliveryNo},lots:lines.map(x=>({lotId:x.lot.id,lotNumber:x.lot.lot_number,quantity:x.quantity}))});
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  app.post('/api/export/shipments/:id/at-border',authRequired,requireRoles(...WRITE_ROLES),(req,res,next)=>changeStatus(req,res,next,{allowed:['DISPATCHED'],to:'AT_BORDER',eventType:'AT_BORDER',fields:{border_arrival_at:new Date().toISOString(),border_point:text(req.body?.borderPoint)||null},bodyNotes:text(req.body?.notes)}));
  app.post('/api/export/shipments/:id/deliver',authRequired,requireRoles(...WRITE_ROLES),(req,res,next)=>changeStatus(req,res,next,{allowed:['DISPATCHED','AT_BORDER'],to:'DELIVERED',eventType:'DELIVERED',fields:{delivered_at:new Date().toISOString(),proof_of_delivery_reference:text(req.body?.proofOfDeliveryReference)||null},bodyNotes:text(req.body?.notes)}));
  app.post('/api/export/shipments/:id/close',authRequired,requireRoles(...WRITE_ROLES),(req,res,next)=>changeStatus(req,res,next,{allowed:['DELIVERED'],to:'CLOSED',eventType:'CLOSED',fields:{closed_at:new Date().toISOString()},bodyNotes:text(req.body?.notes)}));
  app.post('/api/export/shipments/:id/cancel',authRequired,requireRoles(...WRITE_ROLES),(req,res,next)=>changeStatus(req,res,next,{allowed:['DRAFT','PLANNED','LOADING','SEALED'],to:'CANCELLED',eventType:'CANCELLED',bodyNotes:text(req.body?.notes)}));

  app.post('/api/export/shipments/:id/documents',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const input=documentSchema.parse(req.body);await client.query('BEGIN');const result=await client.query('SELECT * FROM export_shipments WHERE id=$1 AND tenant_id=$2',[req.params.id,req.user.tenant_id]);const shipment=result.rows[0];if(!shipment)throw requestError('Ngarkesa nuk u gjet.',404);await assertCompanyAccess(req.user,shipment.company_id,client);const id=randomUUID();const {rows}=await client.query(`INSERT INTO export_shipment_documents(id,tenant_id,company_id,shipment_id,document_type,document_no,document_date,filename,storage_url,notes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[id,req.user.tenant_id,shipment.company_id,shipment.id,input.documentType,input.documentNo||null,input.documentDate||null,input.filename||null,input.storageUrl||null,input.notes||null,req.user.id]);await addEvent(client,{user:req.user,shipmentId:shipment.id,companyId:shipment.company_id,eventType:'DOCUMENT_ADDED',fromStatus:shipment.status,toStatus:shipment.status,metadata:{documentType:input.documentType,documentNo:input.documentNo}});await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'EXPORT_DOCUMENT_ADD',entityType:'export_shipment',entityId:shipment.id,companyId:shipment.company_id,metadata:{documentType:input.documentType,documentNo:input.documentNo},ip:req.ip},client);await client.query('COMMIT');res.status(201).json(rows[0]);
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  app.get('/api/export/reports/:type',authRequired,async(req,res,next)=>{
    try{
      const companyIds=await accessibleCompanyIds(req.user);if(!companyIds.length)return res.json([]);const params=[req.user.tenant_id,companyIds];let sql;
      switch(req.params.type){
        case 'overview':sql=`SELECT COUNT(*)::int AS shipments,COALESCE(SUM(net_weight),0)::numeric AS net_weight,COALESCE(SUM(gross_weight),0)::numeric AS gross_weight,COALESCE(SUM(package_count),0)::numeric AS packages,COALESCE(SUM(pallet_count),0)::numeric AS pallets,COALESCE(SUM(total_value),0)::numeric AS total_value FROM export_shipments WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) AND status<>'CANCELLED'`;break;
        case 'customer':sql=`SELECT bp.id,bp.name,COUNT(*)::int AS shipments,SUM(s.net_weight)::numeric AS net_weight,SUM(s.total_value)::numeric AS total_value FROM export_shipments s JOIN business_partners bp ON bp.id=s.customer_id WHERE s.tenant_id=$1 AND s.company_id=ANY($2::uuid[]) AND s.status<>'CANCELLED' GROUP BY bp.id,bp.name ORDER BY net_weight DESC`;break;
        case 'country':sql=`SELECT COALESCE(destination_country,'Pa shtet') AS label,COUNT(*)::int AS shipments,SUM(net_weight)::numeric AS net_weight,SUM(total_value)::numeric AS total_value FROM export_shipments WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) AND status<>'CANCELLED' GROUP BY destination_country ORDER BY net_weight DESC`;break;
        case 'vehicle':sql=`SELECT COALESCE(v.plate_no,'Pa mjet') AS label,COUNT(*)::int AS shipments,SUM(s.net_weight)::numeric AS net_weight,AVG(CASE WHEN v.capacity_kg>0 THEN s.net_weight/v.capacity_kg*100 END)::numeric AS avg_capacity_percent FROM export_shipments s LEFT JOIN logistics_vehicles v ON v.id=s.vehicle_id WHERE s.tenant_id=$1 AND s.company_id=ANY($2::uuid[]) AND s.status<>'CANCELLED' GROUP BY v.plate_no ORDER BY net_weight DESC`;break;
        case 'product':sql=`SELECT p.id,p.code,p.name,SUM(si.quantity)::numeric AS quantity,SUM(si.line_total)::numeric AS total_value,COUNT(DISTINCT si.shipment_id)::int AS shipments FROM export_shipment_items si JOIN export_shipments s ON s.id=si.shipment_id JOIN products p ON p.id=si.product_id WHERE s.tenant_id=$1 AND s.company_id=ANY($2::uuid[]) AND s.status<>'CANCELLED' GROUP BY p.id,p.code,p.name ORDER BY quantity DESC`;break;
        case 'lot':sql=`SELECT l.id,l.lot_number,p.name AS product_name,SUM(si.quantity)::numeric AS quantity,COUNT(DISTINCT si.shipment_id)::int AS shipments FROM export_shipment_items si JOIN export_shipments s ON s.id=si.shipment_id JOIN trace_lots l ON l.id=si.lot_id JOIN products p ON p.id=l.product_id WHERE s.tenant_id=$1 AND s.company_id=ANY($2::uuid[]) AND s.status<>'CANCELLED' GROUP BY l.id,l.lot_number,p.name ORDER BY quantity DESC`;break;
        case 'status':sql=`SELECT status AS label,COUNT(*)::int AS shipments,SUM(net_weight)::numeric AS net_weight FROM export_shipments WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) GROUP BY status ORDER BY status`;break;
        case 'month':sql=`SELECT TO_CHAR(COALESCE(dispatched_at,planned_departure_at,created_at),'YYYY-MM') AS label,COUNT(*)::int AS shipments,SUM(net_weight)::numeric AS net_weight,SUM(total_value)::numeric AS total_value FROM export_shipments WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) AND status<>'CANCELLED' GROUP BY 1 ORDER BY 1`;break;
        case 'driver':sql=`SELECT driver_name AS label,COUNT(*)::int AS shipments,SUM(net_weight)::numeric AS net_weight FROM export_shipments WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) AND status<>'CANCELLED' GROUP BY driver_name ORDER BY net_weight DESC`;break;
        case 'incoterm':sql=`SELECT COALESCE(incoterm,'Pa Incoterm') AS label,COUNT(*)::int AS shipments,SUM(net_weight)::numeric AS net_weight,SUM(total_value)::numeric AS total_value FROM export_shipments WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) AND status<>'CANCELLED' GROUP BY incoterm ORDER BY net_weight DESC`;break;
        case 'border':sql=`SELECT COALESCE(border_point,'Pa pikë kufitare') AS label,COUNT(*)::int AS shipments,SUM(net_weight)::numeric AS net_weight FROM export_shipments WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) AND status<>'CANCELLED' GROUP BY border_point ORDER BY net_weight DESC`;break;
        case 'documents':sql=`SELECT s.shipment_no,s.status,s.cmr_no,s.packing_list_no,s.commercial_invoice_no,s.customs_reference,s.seal_no,(s.cmr_no IS NOT NULL AND s.packing_list_no IS NOT NULL AND s.commercial_invoice_no IS NOT NULL AND s.seal_no IS NOT NULL) AS complete FROM export_shipments s WHERE s.tenant_id=$1 AND s.company_id=ANY($2::uuid[]) ORDER BY s.created_at DESC`;break;
        case 'delivery-time':sql=`SELECT shipment_no,driver_name,destination,dispatched_at,delivered_at,EXTRACT(EPOCH FROM (delivered_at-dispatched_at))/3600 AS delivery_hours FROM export_shipments WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) AND delivered_at IS NOT NULL AND dispatched_at IS NOT NULL ORDER BY delivered_at DESC`;break;
        default:throw requestError('Lloji i raportit të eksportit nuk njihet.',404);
      }
      const {rows}=await pool.query(sql,params);res.json(rows);
    }catch(error){next(error);}
  });
}
