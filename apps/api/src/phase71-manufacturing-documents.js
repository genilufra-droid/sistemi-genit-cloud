const camel=(row)=>Object.fromEntries(Object.entries(row||{}).map(([k,v])=>[k.replace(/_([a-z])/g,(_m,c)=>c.toUpperCase()),v]));
const notFound=(message)=>Object.assign(new Error(message),{status:404});

export function installPhase71ManufacturingDocumentRoutes({app,pool,authRequired,accessibleCompanyIds}){
  async function allowed(req,companyId){const ids=await accessibleCompanyIds(req.user,pool);return ids.includes(companyId);}

  app.get('/api/manufacturing/samples/:id',authRequired,async(req,res,next)=>{try{
    const {rows}=await pool.query(`SELECT s.*,bp.name AS customer_name,p.name AS product_name,w.name AS warehouse_name,
      COALESCE(jsonb_agg(jsonb_build_object('id',sl.id,'lotId',sl.lot_id,'lotNumber',l.lot_number,'supplierId',sl.supplier_id,'supplierName',sp.name,'quantity',sl.quantity,'ratioPercent',sl.ratio_percent)) FILTER(WHERE sl.id IS NOT NULL),'[]'::jsonb) AS lines
      FROM manufacturing_samples s JOIN business_partners bp ON bp.id=s.customer_id JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id
      LEFT JOIN manufacturing_sample_lines sl ON sl.sample_id=s.id LEFT JOIN trace_lots l ON l.id=sl.lot_id LEFT JOIN business_partners sp ON sp.id=sl.supplier_id
      WHERE s.id=$1 AND s.tenant_id=$2 GROUP BY s.id,bp.name,p.name,w.name`,[req.params.id,req.user.tenant_id]);
    const row=rows[0];if(!row||!(await allowed(req,row.company_id)))throw notFound('Dokumenti i mostrës nuk u gjet.');res.json(camel(row));
  }catch(e){next(e);}});

  app.get('/api/manufacturing/campaigns/:id',authRequired,async(req,res,next)=>{try{
    const {rows}=await pool.query(`SELECT c.*,bp.name AS customer_name,p.name AS product_name,s.sample_no,
      COALESCE(jsonb_agg(jsonb_build_object('id',cs.id,'supplierId',cs.supplier_id,'supplierName',sp.name,'sourceLotId',cs.source_lot_id,'lotNumber',l.lot_number,'ratioPercent',cs.ratio_percent,'plannedQuantity',cs.planned_quantity)) FILTER(WHERE cs.id IS NOT NULL),'[]'::jsonb) AS sources,
      (SELECT COUNT(*)::int FROM manufacturing_work_orders wo WHERE wo.campaign_id=c.id) AS work_order_count
      FROM manufacturing_campaigns c JOIN business_partners bp ON bp.id=c.customer_id JOIN products p ON p.id=c.product_id LEFT JOIN manufacturing_samples s ON s.id=c.sample_id
      LEFT JOIN manufacturing_campaign_sources cs ON cs.campaign_id=c.id LEFT JOIN business_partners sp ON sp.id=cs.supplier_id LEFT JOIN trace_lots l ON l.id=cs.source_lot_id
      WHERE c.id=$1 AND c.tenant_id=$2 GROUP BY c.id,bp.name,p.name,s.sample_no`,[req.params.id,req.user.tenant_id]);
    const row=rows[0];if(!row||!(await allowed(req,row.company_id)))throw notFound('Fushata e prodhimit nuk u gjet.');res.json(camel(row));
  }catch(e){next(e);}});

  app.get('/api/manufacturing/work-orders/:id',authRequired,async(req,res,next)=>{try{
    const {rows}=await pool.query(`SELECT w.*,pr.code AS process_code,pr.name AS process_name,pr.input_location,pr.output_location,m.code AS machine_code,m.name AS machine_name,m.capacity_kg_hour,
      c.campaign_no,p1.name AS input_product_name,p2.name AS output_product_name,wh.name AS warehouse_name,l.lot_number AS output_lot_number,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id',i.id,'lotId',i.lot_id,'lotNumber',il.lot_number,'supplierId',i.supplier_id,'supplierName',bp.name,'bagCount',i.bag_count,'labelNetQty',i.label_net_qty,'plannedQty',i.planned_qty,'actualInputQty',i.actual_input_qty)) FILTER(WHERE i.id IS NOT NULL),'[]'::jsonb) AS inputs,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'stage',q.stage,'result',q.result,'inspectorId',q.inspector_id,'inspectorName',u.full_name,'moisturePercent',q.moisture_percent,'impurityPercent',q.impurity_percent,'checkedAt',q.checked_at,'notes',q.notes) ORDER BY q.checked_at) FROM manufacturing_quality_checks q LEFT JOIN users u ON u.id=q.inspector_id WHERE q.work_order_id=w.id),'[]'::jsonb) AS quality_checks,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'transferNo',t.transfer_no,'transferType',t.transfer_type,'sourceLocation',t.source_location,'destinationLocation',t.destination_location,'status',t.status,'transferAt',t.transfer_at) ORDER BY t.transfer_at) FROM manufacturing_transfers t WHERE t.work_order_id=w.id),'[]'::jsonb) AS transfers
      FROM manufacturing_work_orders w JOIN manufacturing_processes pr ON pr.id=w.process_id JOIN manufacturing_machines m ON m.id=w.machine_id LEFT JOIN manufacturing_campaigns c ON c.id=w.campaign_id
      JOIN products p1 ON p1.id=w.input_product_id JOIN products p2 ON p2.id=w.output_product_id JOIN warehouses wh ON wh.id=w.warehouse_id LEFT JOIN trace_lots l ON l.id=w.output_lot_id
      LEFT JOIN manufacturing_work_order_inputs i ON i.work_order_id=w.id LEFT JOIN trace_lots il ON il.id=i.lot_id LEFT JOIN business_partners bp ON bp.id=i.supplier_id
      WHERE w.id=$1 AND w.tenant_id=$2 GROUP BY w.id,pr.code,pr.name,pr.input_location,pr.output_location,m.code,m.name,m.capacity_kg_hour,c.campaign_no,p1.name,p2.name,wh.name,l.lot_number`,[req.params.id,req.user.tenant_id]);
    const row=rows[0];if(!row||!(await allowed(req,row.company_id)))throw notFound('Urdhri i Punës nuk u gjet.');res.json(camel(row));
  }catch(e){next(e);}});

  app.get('/api/manufacturing/transfers',authRequired,async(req,res,next)=>{try{
    const ids=await accessibleCompanyIds(req.user,pool);const {rows}=await pool.query(`SELECT t.*,w.work_order_no,
      COALESCE(jsonb_agg(jsonb_build_object('id',tl.id,'lotId',tl.lot_id,'lotNumber',l.lot_number,'productId',tl.product_id,'productName',p.name,'quantity',tl.quantity)) FILTER(WHERE tl.id IS NOT NULL),'[]'::jsonb) AS lines
      FROM manufacturing_transfers t LEFT JOIN manufacturing_work_orders w ON w.id=t.work_order_id LEFT JOIN manufacturing_transfer_lines tl ON tl.transfer_id=t.id LEFT JOIN trace_lots l ON l.id=tl.lot_id LEFT JOIN products p ON p.id=tl.product_id
      WHERE t.tenant_id=$1 AND t.company_id=ANY($2::uuid[]) GROUP BY t.id,w.work_order_no ORDER BY t.transfer_at DESC`,[req.user.tenant_id,ids]);res.json(rows.map(camel));
  }catch(e){next(e);}});

  app.get('/api/manufacturing/transfers/:id',authRequired,async(req,res,next)=>{try{
    const {rows}=await pool.query(`SELECT t.*,w.work_order_no,
      COALESCE(jsonb_agg(jsonb_build_object('id',tl.id,'lotId',tl.lot_id,'lotNumber',l.lot_number,'productId',tl.product_id,'productName',p.name,'quantity',tl.quantity)) FILTER(WHERE tl.id IS NOT NULL),'[]'::jsonb) AS lines
      FROM manufacturing_transfers t LEFT JOIN manufacturing_work_orders w ON w.id=t.work_order_id LEFT JOIN manufacturing_transfer_lines tl ON tl.transfer_id=t.id LEFT JOIN trace_lots l ON l.id=tl.lot_id LEFT JOIN products p ON p.id=tl.product_id
      WHERE t.id=$1 AND t.tenant_id=$2 GROUP BY t.id,w.work_order_no`,[req.params.id,req.user.tenant_id]);
    const row=rows[0];if(!row||!(await allowed(req,row.company_id)))throw notFound('Transferimi nuk u gjet.');res.json(camel(row));
  }catch(e){next(e);}});
}
