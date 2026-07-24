import { randomUUID } from 'node:crypto';

const WRITE_ROLES=['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','MAGAZINIER','OPERATOR_PESHORE'];
const text=(v)=>String(v??'').trim();
const num=(v)=>Number(v||0);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});

function camel(row){
  const out={};
  for(const [key,value] of Object.entries(row||{})) out[key.replace(/_([a-z])/g,(_m,c)=>c.toUpperCase())]=value;
  return out;
}
async function nextNo(client,tenantId,companyId,key,prefix){
  const year=new Date().getFullYear();
  const sequenceKey=`${key}:${year}`;
  const {rows}=await client.query(`
    INSERT INTO mfg_sequences(tenant_id,company_id,sequence_key,last_value)
    VALUES($1,$2,$3,1)
    ON CONFLICT(tenant_id,company_id,sequence_key)
    DO UPDATE SET last_value=mfg_sequences.last_value+1,updated_at=NOW()
    RETURNING last_value`,[tenantId,companyId,sequenceKey]);
  return `${prefix}/${year}/${String(rows[0].last_value).padStart(5,'0')}`;
}
async function one(client,sql,params,message='Rekordi nuk u gjet.'){
  const {rows}=await client.query(sql,params);
  if(!rows[0]) throw fail(message,404);
  return rows[0];
}

export async function migratePhase71OdooManufacturing(db){
  await db.query(`
    CREATE TABLE IF NOT EXISTS mfg_sequences(
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      sequence_key VARCHAR(120) NOT NULL,
      last_value BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(tenant_id,company_id,sequence_key)
    );

    CREATE TABLE IF NOT EXISTS mfg_processes(
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code VARCHAR(60) NOT NULL,
      name VARCHAR(180) NOT NULL,
      sequence_no INTEGER NOT NULL DEFAULT 10,
      input_location VARCHAR(180) NOT NULL,
      output_location VARCHAR(180) NOT NULL,
      next_process_id UUID REFERENCES mfg_processes(id) ON DELETE SET NULL,
      quality_gate_required BOOLEAN NOT NULL DEFAULT TRUE,
      normal_loss_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id,company_id,code)
    );

    CREATE TABLE IF NOT EXISTS mfg_workcenters(
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      process_id UUID NOT NULL REFERENCES mfg_processes(id) ON DELETE RESTRICT,
      asset_id UUID,
      code VARCHAR(60) NOT NULL,
      name VARCHAR(180) NOT NULL,
      location VARCHAR(180),
      capacity_kg_hour NUMERIC(18,4) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','MAINTENANCE','OUT_OF_SERVICE')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id,company_id,code)
    );

    CREATE TABLE IF NOT EXISTS mfg_samples(
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE RESTRICT,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      sample_no VARCHAR(100) NOT NULL,
      sample_date DATE NOT NULL DEFAULT CURRENT_DATE,
      sent_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','SENT','APPROVED','REJECTED','CANCELLED')),
      client_reference VARCHAR(180),
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id,company_id,sample_no)
    );

    CREATE TABLE IF NOT EXISTS mfg_sample_lines(
      id UUID PRIMARY KEY,
      sample_id UUID NOT NULL REFERENCES mfg_samples(id) ON DELETE CASCADE,
      lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE RESTRICT,
      supplier_id UUID REFERENCES business_partners(id) ON DELETE RESTRICT,
      quantity_kg NUMERIC(18,6) NOT NULL CHECK(quantity_kg>0),
      percentage NUMERIC(9,4) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(sample_id,lot_id)
    );

    CREATE TABLE IF NOT EXISTS mfg_campaigns(
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES business_partners(id) ON DELETE RESTRICT,
      sample_id UUID NOT NULL REFERENCES mfg_samples(id) ON DELETE RESTRICT,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      campaign_no VARCHAR(100) NOT NULL,
      planned_quantity NUMERIC(18,6) NOT NULL CHECK(planned_quantity>0),
      status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','PLANNED','IN_PROGRESS','DONE','CANCELLED')),
      process_route JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id,company_id,campaign_no)
    );

    CREATE TABLE IF NOT EXISTS mfg_campaign_components(
      id UUID PRIMARY KEY,
      campaign_id UUID NOT NULL REFERENCES mfg_campaigns(id) ON DELETE CASCADE,
      lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE RESTRICT,
      supplier_id UUID REFERENCES business_partners(id) ON DELETE RESTRICT,
      planned_quantity NUMERIC(18,6) NOT NULL CHECK(planned_quantity>0),
      percentage NUMERIC(9,4) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(campaign_id,lot_id)
    );

    CREATE TABLE IF NOT EXISTS mfg_quality_gates(
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      process_order_id UUID NOT NULL REFERENCES process_orders(id) ON DELETE CASCADE,
      gate_type VARCHAR(30) NOT NULL DEFAULT 'PRE_PROCESS',
      result VARCHAR(20) NOT NULL CHECK(result IN('APPROVED','QUARANTINE','REJECTED')),
      inspector_id UUID REFERENCES users(id) ON DELETE SET NULL,
      moisture_percent NUMERIC(8,4),
      impurity_percent NUMERIC(8,4),
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT,
      UNIQUE(process_order_id,gate_type)
    );

    CREATE TABLE IF NOT EXISTS mfg_internal_transfers(
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      process_order_id UUID NOT NULL REFERENCES process_orders(id) ON DELETE CASCADE,
      transfer_no VARCHAR(100) NOT NULL,
      source_location VARCHAR(180) NOT NULL,
      destination_location VARCHAR(180) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
      transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id,company_id,transfer_no)
    );

    CREATE TABLE IF NOT EXISTS mfg_internal_transfer_lines(
      id UUID PRIMARY KEY,
      transfer_id UUID NOT NULL REFERENCES mfg_internal_transfers(id) ON DELETE CASCADE,
      lot_id UUID NOT NULL REFERENCES trace_lots(id) ON DELETE RESTRICT,
      quantity NUMERIC(18,6) NOT NULL CHECK(quantity>0)
    );

    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES mfg_campaigns(id) ON DELETE SET NULL;
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS process_id UUID REFERENCES mfg_processes(id) ON DELETE SET NULL;
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS workcenter_id UUID REFERENCES mfg_workcenters(id) ON DELETE SET NULL;
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS source_location VARCHAR(180);
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS destination_location VARCHAR(180);
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    ALTER TABLE process_orders ADD COLUMN IF NOT EXISTS qc_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
    ALTER TABLE process_orders DROP CONSTRAINT IF EXISTS process_orders_status_check;
    ALTER TABLE process_orders ADD CONSTRAINT process_orders_status_check CHECK(status IN('DRAFT','PLANNED','READY','IN_PROGRESS','DONE','POSTED','CANCELLED'));
  `);
}

export function installPhase71OdooManufacturingRoutes({app,pool,authRequired,requireRoles,assertCompanyAccess,audit}){
  const write=[authRequired,requireRoles(...WRITE_ROLES)];
  const wrap=(fn)=>async(req,res)=>{try{await fn(req,res);}catch(error){res.status(error.status||500).json({error:'MFG_ERROR',message:error.message||String(error)});}};

  app.get('/api/manufacturing/bootstrap',authRequired,wrap(async(req,res)=>{
    const ids=await (req.user.role==='SUPER_ADMIN'?pool.query('SELECT id FROM companies WHERE tenant_id=$1',[req.user.tenant_id]):pool.query('SELECT company_id AS id FROM user_companies WHERE user_id=$1',[req.user.id]));
    const companyIds=ids.rows.map(x=>x.id); if(!companyIds.length)return res.json({processes:[],workcenters:[],samples:[],campaigns:[],workOrders:[]});
    const [p,w,s,c,o]=await Promise.all([
      pool.query('SELECT * FROM mfg_processes WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) ORDER BY sequence_no,name',[req.user.tenant_id,companyIds]),
      pool.query(`SELECT wc.*,p.name process_name FROM mfg_workcenters wc JOIN mfg_processes p ON p.id=wc.process_id WHERE wc.tenant_id=$1 AND wc.company_id=ANY($2::uuid[]) ORDER BY wc.name`,[req.user.tenant_id,companyIds]),
      pool.query(`SELECT s.*,bp.name customer_name,p.name product_name,COALESCE(SUM(sl.quantity_kg),0) sample_quantity FROM mfg_samples s JOIN business_partners bp ON bp.id=s.customer_id JOIN products p ON p.id=s.product_id LEFT JOIN mfg_sample_lines sl ON sl.sample_id=s.id WHERE s.tenant_id=$1 AND s.company_id=ANY($2::uuid[]) GROUP BY s.id,bp.name,p.name ORDER BY s.created_at DESC LIMIT 300`,[req.user.tenant_id,companyIds]),
      pool.query(`SELECT c.*,bp.name customer_name,p.name product_name,s.sample_no FROM mfg_campaigns c JOIN business_partners bp ON bp.id=c.customer_id JOIN products p ON p.id=c.product_id JOIN mfg_samples s ON s.id=c.sample_id WHERE c.tenant_id=$1 AND c.company_id=ANY($2::uuid[]) ORDER BY c.created_at DESC LIMIT 300`,[req.user.tenant_id,companyIds]),
      pool.query(`SELECT po.*,mp.name process_name,wc.name workcenter_name,c.campaign_no,p.name output_product_name FROM process_orders po LEFT JOIN mfg_processes mp ON mp.id=po.process_id LEFT JOIN mfg_workcenters wc ON wc.id=po.workcenter_id LEFT JOIN mfg_campaigns c ON c.id=po.campaign_id JOIN products p ON p.id=po.output_product_id WHERE po.tenant_id=$1 AND po.company_id=ANY($2::uuid[]) ORDER BY po.created_at DESC LIMIT 500`,[req.user.tenant_id,companyIds])
    ]);
    res.json({processes:p.rows.map(camel),workcenters:w.rows.map(camel),samples:s.rows.map(camel),campaigns:c.rows.map(camel),workOrders:o.rows.map(camel)});
  }));

  app.post('/api/manufacturing/processes',...write,wrap(async(req,res)=>{
    const b=req.body||{}; await assertCompanyAccess(req.user,b.companyId);
    const row=await one(pool,`INSERT INTO mfg_processes(id,tenant_id,company_id,code,name,sequence_no,input_location,output_location,next_process_id,quality_gate_required,normal_loss_percent,active,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[randomUUID(),req.user.tenant_id,b.companyId,text(b.code),text(b.name),num(b.sequenceNo)||10,text(b.inputLocation),text(b.outputLocation),b.nextProcessId||null,b.qualityGateRequired!==false,num(b.normalLossPercent),b.active!==false,text(b.notes)]);
    await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'CREATE',entityType:'MFG_PROCESS',entityId:row.id,companyId:b.companyId});res.status(201).json(camel(row));
  }));

  app.post('/api/manufacturing/workcenters',...write,wrap(async(req,res)=>{
    const b=req.body||{}; await assertCompanyAccess(req.user,b.companyId);
    const row=await one(pool,`INSERT INTO mfg_workcenters(id,tenant_id,company_id,process_id,asset_id,code,name,location,capacity_kg_hour,status,active,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[randomUUID(),req.user.tenant_id,b.companyId,b.processId,b.assetId||null,text(b.code),text(b.name),text(b.location),num(b.capacityKgHour),b.status||'ACTIVE',b.active!==false,text(b.notes)]);
    await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'CREATE',entityType:'MFG_WORKCENTER',entityId:row.id,companyId:b.companyId});res.status(201).json(camel(row));
  }));

  app.post('/api/manufacturing/samples',...write,wrap(async(req,res)=>{
    const b=req.body||{},lines=Array.isArray(b.lines)?b.lines:[]; if(!lines.length)throw fail('Mostra duhet të ketë të paktën një lot.'); await assertCompanyAccess(req.user,b.companyId);
    const client=await pool.connect();try{await client.query('BEGIN');const sampleNo=await nextNo(client,req.user.tenant_id,b.companyId,'SAMPLE','MOSTER');const id=randomUUID();await client.query(`INSERT INTO mfg_samples(id,tenant_id,company_id,customer_id,product_id,warehouse_id,sample_no,sample_date,status,client_reference,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT',$9,$10,$11)`,[id,req.user.tenant_id,b.companyId,b.customerId,b.productId,b.warehouseId,sampleNo,b.sampleDate||new Date().toISOString().slice(0,10),text(b.clientReference),text(b.notes),req.user.id]);const total=lines.reduce((s,x)=>s+num(x.quantityKg),0);for(const line of lines){const lot=await one(client,'SELECT id,supplier_id,quantity_available FROM trace_lots WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[line.lotId,req.user.tenant_id],'Loti i mostrës nuk u gjet.');if(num(line.quantityKg)>num(lot.quantity_available))throw fail('Sasia e mostrës tejkalon gjendjen e lotit.');await client.query(`INSERT INTO mfg_sample_lines(id,sample_id,lot_id,supplier_id,quantity_kg,percentage) VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),id,lot.id,lot.supplier_id,num(line.quantityKg),total?num(line.quantityKg)/total*100:0]);}await client.query('COMMIT');res.status(201).json({id,sampleNo,status:'DRAFT'});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }));

  app.post('/api/manufacturing/samples/:id/send',...write,wrap(async(req,res)=>{const row=await one(pool,`UPDATE mfg_samples SET status='SENT',sent_at=NOW(),updated_at=NOW() WHERE id=$1 AND tenant_id=$2 AND status='DRAFT' RETURNING *`,[req.params.id,req.user.tenant_id],'Mostra nuk është Draft.');res.json(camel(row));}));
  app.post('/api/manufacturing/samples/:id/approve',...write,wrap(async(req,res)=>{const row=await one(pool,`UPDATE mfg_samples SET status='APPROVED',approved_at=NOW(),client_reference=COALESCE(NULLIF($3,''),client_reference),updated_at=NOW() WHERE id=$1 AND tenant_id=$2 AND status IN('DRAFT','SENT') RETURNING *`,[req.params.id,req.user.tenant_id,text(req.body?.clientReference)],'Mostra nuk mund të aprovohet.');res.json(camel(row));}));

  app.post('/api/manufacturing/campaigns',...write,wrap(async(req,res)=>{
    const b=req.body||{},components=Array.isArray(b.components)?b.components:[],route=Array.isArray(b.processRoute)?b.processRoute:[];if(!components.length||!route.length)throw fail('Fushata kërkon lote dhe rrugë procesesh.');await assertCompanyAccess(req.user,b.companyId);const sample=await one(pool,"SELECT * FROM mfg_samples WHERE id=$1 AND tenant_id=$2 AND status='APPROVED'",[b.sampleId,req.user.tenant_id],'Mostra duhet të jetë e aprovuar.');const client=await pool.connect();try{await client.query('BEGIN');const campaignNo=await nextNo(client,req.user.tenant_id,b.companyId,'CAMPAIGN','FUSHATE');const id=randomUUID();await client.query(`INSERT INTO mfg_campaigns(id,tenant_id,company_id,customer_id,sample_id,product_id,warehouse_id,campaign_no,planned_quantity,status,process_route,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'PLANNED',$10::jsonb,$11,$12)`,[id,req.user.tenant_id,b.companyId,sample.customer_id,b.sampleId,b.productId||sample.product_id,b.warehouseId||sample.warehouse_id,campaignNo,num(b.plannedQuantity),JSON.stringify(route),text(b.notes),req.user.id]);const total=components.reduce((s,x)=>s+num(x.plannedQuantity),0);for(const line of components){const lot=await one(client,'SELECT id,supplier_id,quantity_available FROM trace_lots WHERE id=$1 AND tenant_id=$2',[line.lotId,req.user.tenant_id]);if(num(line.plannedQuantity)>num(lot.quantity_available))throw fail('Sasia e planifikuar tejkalon gjendjen e lotit.');await client.query(`INSERT INTO mfg_campaign_components(id,campaign_id,lot_id,supplier_id,planned_quantity,percentage) VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),id,lot.id,lot.supplier_id,num(line.plannedQuantity),total?num(line.plannedQuantity)/total*100:0]);}await client.query('COMMIT');res.status(201).json({id,campaignNo,status:'PLANNED'});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }));

  app.post('/api/manufacturing/campaigns/:id/launch',...write,wrap(async(req,res)=>{
    const campaign=await one(pool,"SELECT * FROM mfg_campaigns WHERE id=$1 AND tenant_id=$2 AND status='PLANNED'",[req.params.id,req.user.tenant_id],'Fushata nuk është e planifikuar.');const route=campaign.process_route||[];const first=route[0];if(!first?.processId)throw fail('Rruga e proceseve është bosh.');const process=await one(pool,'SELECT * FROM mfg_processes WHERE id=$1 AND tenant_id=$2',[first.processId,req.user.tenant_id]);const client=await pool.connect();try{await client.query('BEGIN');const workOrderNo=await nextNo(client,req.user.tenant_id,campaign.company_id,'WORK_ORDER','UP');const orderId=randomUUID();await client.query(`INSERT INTO process_orders(id,tenant_id,company_id,warehouse_id,output_product_id,work_order_no,process_type,status,order_date,output_quantity,waste_quantity,loss_quantity,direct_cost,campaign_id,process_id,workcenter_id,source_location,destination_location,qc_status,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'PLANNED',CURRENT_DATE,0,0,0,0,$8,$9,$10,$11,$12,'PENDING',$13,$14)`,[orderId,req.user.tenant_id,campaign.company_id,campaign.warehouse_id,campaign.product_id,workOrderNo,process.name,campaign.id,process.id,first.workcenterId||null,process.input_location,process.output_location,text(campaign.notes),req.user.id]);const {rows:parts}=await client.query('SELECT lot_id,planned_quantity FROM mfg_campaign_components WHERE campaign_id=$1',[campaign.id]);for(const part of parts)await client.query('INSERT INTO process_order_inputs(id,process_order_id,lot_id,quantity) VALUES($1,$2,$3,$4)',[randomUUID(),orderId,part.lot_id,part.planned_quantity]);await client.query("UPDATE mfg_campaigns SET status='IN_PROGRESS',updated_at=NOW() WHERE id=$1",[campaign.id]);await client.query('COMMIT');res.status(201).json({orderId,workOrderNo,status:'PLANNED'});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }));

  app.post('/api/manufacturing/work-orders/:id/quality',...write,wrap(async(req,res)=>{
    const b=req.body||{};const order=await one(pool,'SELECT * FROM process_orders WHERE id=$1 AND tenant_id=$2',[req.params.id,req.user.tenant_id]);await pool.query(`INSERT INTO mfg_quality_gates(id,tenant_id,company_id,process_order_id,gate_type,result,inspector_id,moisture_percent,impurity_percent,notes) VALUES($1,$2,$3,$4,'PRE_PROCESS',$5,$6,$7,$8,$9) ON CONFLICT(process_order_id,gate_type) DO UPDATE SET result=EXCLUDED.result,inspector_id=EXCLUDED.inspector_id,moisture_percent=EXCLUDED.moisture_percent,impurity_percent=EXCLUDED.impurity_percent,notes=EXCLUDED.notes,checked_at=NOW()`,[randomUUID(),req.user.tenant_id,order.company_id,order.id,b.result||'APPROVED',req.user.id,b.moisturePercent||null,b.impurityPercent||null,text(b.notes)]);await pool.query('UPDATE process_orders SET qc_status=$2,status=CASE WHEN $2=\'APPROVED\' THEN \'READY\' ELSE status END,updated_at=NOW() WHERE id=$1',[order.id,b.result||'APPROVED']);res.json({id:order.id,qcStatus:b.result||'APPROVED'});
  }));

  app.post('/api/manufacturing/work-orders/:id/start',...write,wrap(async(req,res)=>{
    const order=await one(pool,"SELECT * FROM process_orders WHERE id=$1 AND tenant_id=$2 AND status IN('PLANNED','READY') FOR UPDATE",[req.params.id,req.user.tenant_id],'Urdhri nuk mund të fillojë.');if(order.qc_status!=='APPROVED')throw fail('Kontrolli i cilësisë duhet të jetë i aprovuar.');if(!order.workcenter_id&& !req.body?.workcenterId)throw fail('Zgjidhni makinerinë/Qendrën e Punës.');const client=await pool.connect();try{await client.query('BEGIN');const transferNo=await nextNo(client,req.user.tenant_id,order.company_id,'TRANSFER','TRF');const transferId=randomUUID();await client.query(`INSERT INTO mfg_internal_transfers(id,tenant_id,company_id,process_order_id,transfer_no,source_location,destination_location) VALUES($1,$2,$3,$4,$5,$6,$7)`,[transferId,req.user.tenant_id,order.company_id,order.id,transferNo,order.source_location||'Magazina Lëndë e Parë',order.destination_location||'Proces']);const {rows:inputs}=await client.query('SELECT lot_id,quantity FROM process_order_inputs WHERE process_order_id=$1',[order.id]);for(const line of inputs)await client.query('INSERT INTO mfg_internal_transfer_lines(id,transfer_id,lot_id,quantity) VALUES($1,$2,$3,$4)',[randomUUID(),transferId,line.lot_id,line.quantity]);await client.query("UPDATE process_orders SET status='IN_PROGRESS',workcenter_id=COALESCE($2,workcenter_id),started_at=NOW(),updated_at=NOW() WHERE id=$1",[order.id,req.body?.workcenterId||null]);await client.query('COMMIT');res.json({id:order.id,status:'IN_PROGRESS',transferNo});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }));

  app.post('/api/manufacturing/work-orders/:id/complete',...write,wrap(async(req,res)=>{
    const b=req.body||{},output=num(b.outputQuantity),waste=num(b.wasteQuantity),loss=num(b.lossQuantity);if(output<=0)throw fail('Pesha dalëse duhet të jetë më e madhe se zero.');const client=await pool.connect();try{await client.query('BEGIN');const order=await one(client,"SELECT * FROM process_orders WHERE id=$1 AND tenant_id=$2 AND status='IN_PROGRESS' FOR UPDATE",[req.params.id,req.user.tenant_id],'Urdhri nuk është në proces.');const {rows:inputs}=await client.query(`SELECT poi.*,l.quantity_available,l.product_id,l.supplier_id FROM process_order_inputs poi JOIN trace_lots l ON l.id=poi.lot_id WHERE poi.process_order_id=$1 FOR UPDATE OF l`,[order.id]);const total=inputs.reduce((s,x)=>s+num(x.quantity),0);if(Math.abs(total-output-waste-loss)>0.01)throw fail('Bilanci nuk mbyllet: hyrja duhet të jetë dalje + mbetje + humbje.');for(const line of inputs){if(num(line.quantity)>num(line.quantity_available))throw fail('Gjendja e një loti hyrës nuk mjafton.');const available=num(line.quantity_available)-num(line.quantity);await client.query('UPDATE trace_lots SET quantity_available=$2,quantity_consumed=quantity_consumed+$3,status=CASE WHEN $2<=0.000001 THEN \'DEPLETED\' ELSE status END,updated_at=NOW() WHERE id=$1',[line.lot_id,available,line.quantity]);await client.query(`INSERT INTO trace_lot_movements(id,tenant_id,company_id,lot_id,warehouse_id,product_id,movement_type,quantity,balance_after,source_document_type,source_document_id,source_document_no,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6,'PROCESS_CONSUMPTION',$7,$8,'WORK_ORDER',$9,$10,$11::jsonb,$12)`,[randomUUID(),req.user.tenant_id,order.company_id,line.lot_id,order.warehouse_id,line.product_id,-num(line.quantity),available,order.id,order.work_order_no,JSON.stringify({campaignId:order.campaign_id,processId:order.process_id}),req.user.id]);}
      const lotNo=`WIP-${String(order.work_order_no).replace(/[^A-Z0-9]/gi,'-')}`;const lotId=randomUUID();await client.query(`INSERT INTO trace_lots(id,tenant_id,company_id,warehouse_id,product_id,parent_lot_id,lot_number,lot_type,status,quality_status,production_date,quantity_created,quantity_available,quantity_consumed,base_unit,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'PROCESSED','AVAILABLE','APPROVED',CURRENT_DATE,$8,$8,0,'kg',$9,$10)`,[lotId,req.user.tenant_id,order.company_id,order.warehouse_id,order.output_product_id,inputs[0]?.lot_id||null,lotNo,output,`Urdhër Pune ${order.work_order_no}; përmban ${inputs.length} lote hyrëse.`,req.user.id]);await client.query(`INSERT INTO trace_lot_movements(id,tenant_id,company_id,lot_id,warehouse_id,product_id,movement_type,quantity,balance_after,source_document_type,source_document_id,source_document_no,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6,'PROCESS_OUTPUT',$7,$7,'WORK_ORDER',$8,$9,$10::jsonb,$11)`,[randomUUID(),req.user.tenant_id,order.company_id,lotId,order.warehouse_id,order.output_product_id,output,order.id,order.work_order_no,JSON.stringify({inputLots:inputs.map(x=>({lotId:x.lot_id,quantity:num(x.quantity)}))}),req.user.id]);await client.query("UPDATE process_orders SET status='DONE',output_quantity=$2,waste_quantity=$3,loss_quantity=$4,output_lot_id=$5,completed_at=NOW(),updated_at=NOW() WHERE id=$1",[order.id,output,waste,loss,lotId]);
      const campaign=order.campaign_id?await one(client,'SELECT * FROM mfg_campaigns WHERE id=$1',[order.campaign_id]):null;let nextOrder=null;if(campaign){const route=campaign.process_route||[];const index=route.findIndex(x=>x.processId===order.process_id);const next=route[index+1];if(next?.processId){const process=await one(client,'SELECT * FROM mfg_processes WHERE id=$1',[next.processId]);const no=await nextNo(client,req.user.tenant_id,order.company_id,'WORK_ORDER','UP');const id=randomUUID();await client.query(`INSERT INTO process_orders(id,tenant_id,company_id,warehouse_id,output_product_id,work_order_no,process_type,status,order_date,output_quantity,waste_quantity,loss_quantity,direct_cost,campaign_id,process_id,workcenter_id,source_location,destination_location,qc_status,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'PLANNED',CURRENT_DATE,0,0,0,0,$8,$9,$10,$11,$12,'PENDING',$13,$14)`,[id,req.user.tenant_id,order.company_id,order.warehouse_id,order.output_product_id,no,process.name,campaign.id,process.id,next.workcenterId||null,process.input_location,process.output_location,`Krijuar automatikisht nga ${order.work_order_no}`,req.user.id]);await client.query('INSERT INTO process_order_inputs(id,process_order_id,lot_id,quantity) VALUES($1,$2,$3,$4)',[randomUUID(),id,lotId,output]);nextOrder={id,workOrderNo:no};}else await client.query("UPDATE mfg_campaigns SET status='DONE',updated_at=NOW() WHERE id=$1",[campaign.id]);}
      await client.query('COMMIT');res.json({id:order.id,status:'DONE',outputLot:{id:lotId,lotNumber:lotNo,quantity:output},nextOrder});
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }));
}
