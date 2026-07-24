const camel=(row)=>{const out={};for(const [k,v] of Object.entries(row||{}))out[k.replace(/_([a-z])/g,(_m,c)=>c.toUpperCase())]=v;return out;};
const fail=(message,status=404)=>Object.assign(new Error(message),{status});
async function one(db,sql,params,message){const {rows}=await db.query(sql,params);if(!rows[0])throw fail(message||'Dokumenti nuk u gjet.');return rows[0];}

export function installPhase71ManufacturingDocumentRoutes({app,pool,authRequired}){
  const wrap=(fn)=>async(req,res)=>{try{await fn(req,res);}catch(error){res.status(error.status||500).json({error:'MFG_DOCUMENT_ERROR',message:error.message||String(error)});}};

  app.get('/api/manufacturing/samples/:id',authRequired,wrap(async(req,res)=>{
    const header=await one(pool,`SELECT s.*,bp.name customer_name,bp.code customer_code,p.name product_name,p.code product_code,w.name warehouse_name
      FROM mfg_samples s JOIN business_partners bp ON bp.id=s.customer_id JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id
      WHERE s.id=$1 AND s.tenant_id=$2`,[req.params.id,req.user.tenant_id],'Mostra nuk u gjet.');
    const {rows:lines}=await pool.query(`SELECT sl.*,l.lot_number,l.quantity_available,p.name product_name,bp.name supplier_name,bp.code supplier_code,wt.ticket_no weight_ticket_no
      FROM mfg_sample_lines sl JOIN trace_lots l ON l.id=sl.lot_id JOIN products p ON p.id=l.product_id LEFT JOIN business_partners bp ON bp.id=sl.supplier_id LEFT JOIN weight_tickets wt ON wt.id=l.source_weight_ticket_id
      WHERE sl.sample_id=$1 ORDER BY bp.name,l.lot_number`,[header.id]);
    const {rows:campaigns}=await pool.query('SELECT id,campaign_no,status,planned_quantity FROM mfg_campaigns WHERE sample_id=$1 ORDER BY created_at',[header.id]);
    res.json({...camel(header),lines:lines.map(camel),campaigns:campaigns.map(camel)});
  }));

  app.get('/api/manufacturing/campaigns/:id',authRequired,wrap(async(req,res)=>{
    const header=await one(pool,`SELECT c.*,bp.name customer_name,bp.code customer_code,p.name product_name,p.code product_code,w.name warehouse_name,s.sample_no,s.status sample_status
      FROM mfg_campaigns c JOIN business_partners bp ON bp.id=c.customer_id JOIN products p ON p.id=c.product_id JOIN warehouses w ON w.id=c.warehouse_id JOIN mfg_samples s ON s.id=c.sample_id
      WHERE c.id=$1 AND c.tenant_id=$2`,[req.params.id,req.user.tenant_id],'Fushata nuk u gjet.');
    const {rows:components}=await pool.query(`SELECT cc.*,l.lot_number,l.quantity_available,bp.name supplier_name,bp.code supplier_code,p.name product_name
      FROM mfg_campaign_components cc JOIN trace_lots l ON l.id=cc.lot_id JOIN products p ON p.id=l.product_id LEFT JOIN business_partners bp ON bp.id=cc.supplier_id
      WHERE cc.campaign_id=$1 ORDER BY bp.name,l.lot_number`,[header.id]);
    const {rows:orders}=await pool.query(`SELECT po.id,po.work_order_no,po.status,po.qc_status,po.order_date,po.output_quantity,po.output_lot_id,mp.name process_name,wc.name workcenter_name,l.lot_number output_lot_number
      FROM process_orders po LEFT JOIN mfg_processes mp ON mp.id=po.process_id LEFT JOIN mfg_workcenters wc ON wc.id=po.workcenter_id LEFT JOIN trace_lots l ON l.id=po.output_lot_id
      WHERE po.campaign_id=$1 ORDER BY po.created_at`,[header.id]);
    res.json({...camel(header),components:components.map(camel),workOrders:orders.map(camel)});
  }));

  app.get('/api/manufacturing/work-orders/:id',authRequired,wrap(async(req,res)=>{
    const header=await one(pool,`SELECT po.*,mp.name process_name,mp.code process_code,wc.name workcenter_name,wc.code workcenter_code,c.campaign_no,s.sample_no,p.name output_product_name,p.code output_product_code,w.name warehouse_name,l.lot_number output_lot_number
      FROM process_orders po LEFT JOIN mfg_processes mp ON mp.id=po.process_id LEFT JOIN mfg_workcenters wc ON wc.id=po.workcenter_id LEFT JOIN mfg_campaigns c ON c.id=po.campaign_id LEFT JOIN mfg_samples s ON s.id=c.sample_id JOIN products p ON p.id=po.output_product_id JOIN warehouses w ON w.id=po.warehouse_id LEFT JOIN trace_lots l ON l.id=po.output_lot_id
      WHERE po.id=$1 AND po.tenant_id=$2`,[req.params.id,req.user.tenant_id],'Urdhri i Punës nuk u gjet.');
    const {rows:inputs}=await pool.query(`SELECT poi.*,l.lot_number,l.quantity_available,p.name product_name,p.code product_code,bp.name supplier_name,bp.code supplier_code,wt.ticket_no weight_ticket_no
      FROM process_order_inputs poi JOIN trace_lots l ON l.id=poi.lot_id JOIN products p ON p.id=l.product_id LEFT JOIN business_partners bp ON bp.id=l.supplier_id LEFT JOIN weight_tickets wt ON wt.id=l.source_weight_ticket_id
      WHERE poi.process_order_id=$1 ORDER BY bp.name,l.lot_number`,[header.id]);
    const {rows:quality}=await pool.query(`SELECT q.*,u.full_name inspector_name FROM mfg_quality_gates q LEFT JOIN users u ON u.id=q.inspector_id WHERE q.process_order_id=$1 ORDER BY checked_at`,[header.id]);
    const {rows:transfers}=await pool.query(`SELECT t.*,COALESCE(json_agg(json_build_object('lotId',tl.lot_id,'lotNumber',l.lot_number,'quantity',tl.quantity)) FILTER(WHERE tl.id IS NOT NULL),'[]') lines
      FROM mfg_internal_transfers t LEFT JOIN mfg_internal_transfer_lines tl ON tl.transfer_id=t.id LEFT JOIN trace_lots l ON l.id=tl.lot_id WHERE t.process_order_id=$1 GROUP BY t.id ORDER BY t.transferred_at`,[header.id]);
    const {rows:nextOrders}=await pool.query(`SELECT id,work_order_no,status,qc_status,process_type FROM process_orders WHERE campaign_id=$1 AND created_at>$2 ORDER BY created_at LIMIT 1`,[header.campaign_id,header.created_at]);
    res.json({...camel(header),inputs:inputs.map(camel),qualityChecks:quality.map(camel),transfers:transfers.map(camel),nextOrder:nextOrders[0]?camel(nextOrders[0]):null});
  }));

  app.get('/api/manufacturing/transfers/:id',authRequired,wrap(async(req,res)=>{
    const header=await one(pool,`SELECT t.*,po.work_order_no FROM mfg_internal_transfers t JOIN process_orders po ON po.id=t.process_order_id WHERE t.id=$1 AND t.tenant_id=$2`,[req.params.id,req.user.tenant_id],'Transferimi nuk u gjet.');
    const {rows:lines}=await pool.query(`SELECT tl.*,l.lot_number,p.name product_name,bp.name supplier_name FROM mfg_internal_transfer_lines tl JOIN trace_lots l ON l.id=tl.lot_id JOIN products p ON p.id=l.product_id LEFT JOIN business_partners bp ON bp.id=l.supplier_id WHERE tl.transfer_id=$1`,[header.id]);
    res.json({...camel(header),lines:lines.map(camel)});
  }));
}
