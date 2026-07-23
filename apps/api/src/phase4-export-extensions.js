import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const WRITE_ROLES=['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','SHITES'];
function requestError(message,status=400){const error=new Error(message);error.status=status;return error;}

export async function migratePhase4ExportExtensions(db){
  await db.query(`
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS commercial_invoice_no VARCHAR(100);
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS loading_started_at TIMESTAMPTZ;
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
    ALTER TABLE export_shipments ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS export_shipment_documents(
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      shipment_id UUID NOT NULL REFERENCES export_shipments(id) ON DELETE CASCADE,
      document_type VARCHAR(50) NOT NULL,
      document_no VARCHAR(140),
      document_date DATE,
      template_key VARCHAR(100),
      filename VARCHAR(240),
      storage_url TEXT,
      snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(shipment_id,document_type,document_no)
    );
    CREATE INDEX IF NOT EXISTS idx_export_documents_shipment ON export_shipment_documents(shipment_id,document_type,created_at);
  `);
}

export function installPhase4ExportExtensionRoutes({app,pool,authRequired,requireRoles,assertCompanyAccess,accessibleCompanyIds,audit,emitTenant}){
  const documentSchema=z.object({
    documentType:z.enum(['CMR','PACKING_LIST','COMMERCIAL_INVOICE','CUSTOMS_DECLARATION','CERTIFICATE_OF_ORIGIN','PHYTOSANITARY','QUALITY_CERTIFICATE','DELIVERY_PROOF','OTHER']),
    documentNo:z.string().trim().max(140).optional().default(''),documentDate:z.string().date().nullable().optional(),templateKey:z.string().trim().max(100).optional().default(''),
    filename:z.string().trim().max(240).optional().default(''),storageUrl:z.string().trim().max(2000).optional().default(''),snapshot:z.record(z.string(),z.unknown()).optional().default({}),notes:z.string().trim().max(2000).optional().default(''),
  });

  async function readShipment(user,id,client=pool){
    const {rows}=await client.query('SELECT * FROM export_shipments WHERE id=$1 AND tenant_id=$2',[id,user.tenant_id]);
    if(!rows[0])throw requestError('Ngarkesa nuk u gjet.',404);await assertCompanyAccess(user,rows[0].company_id,client);return rows[0];
  }

  app.get('/api/export/shipments/:id/timeline',authRequired,async(req,res,next)=>{
    try{
      const shipment=await readShipment(req.user,req.params.id);
      const {rows}=await pool.query(`SELECT a.id,a.action,a.metadata,a.created_at,u.full_name AS user_name
        FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
        WHERE a.tenant_id=$1 AND a.entity_type='export_shipment' AND a.entity_id=$2 ORDER BY a.created_at`,[req.user.tenant_id,shipment.id]);
      res.json({shipmentId:shipment.id,shipmentNo:shipment.shipment_no,status:shipment.status,events:rows});
    }catch(error){next(error);}
  });

  app.get('/api/export/shipments/:id/documents',authRequired,async(req,res,next)=>{
    try{const shipment=await readShipment(req.user,req.params.id);const {rows}=await pool.query('SELECT * FROM export_shipment_documents WHERE shipment_id=$1 ORDER BY document_type,created_at',[shipment.id]);res.json(rows);}catch(error){next(error);}
  });

  app.post('/api/export/shipments/:id/documents',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const input=documentSchema.parse(req.body);await client.query('BEGIN');const shipment=await readShipment(req.user,req.params.id,client);const id=randomUUID();
      const {rows}=await client.query(`INSERT INTO export_shipment_documents(id,tenant_id,company_id,shipment_id,document_type,document_no,document_date,template_key,filename,storage_url,snapshot,notes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13) RETURNING *`,[id,req.user.tenant_id,shipment.company_id,shipment.id,input.documentType,input.documentNo||null,input.documentDate||null,input.templateKey||null,input.filename||null,input.storageUrl||null,JSON.stringify(input.snapshot||{}),input.notes||null,req.user.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'EXPORT_DOCUMENT_ADD',entityType:'export_shipment',entityId:shipment.id,companyId:shipment.company_id,metadata:{shipmentNo:shipment.shipment_no,documentType:input.documentType,documentNo:input.documentNo},ip:req.ip},client);
      await client.query('COMMIT');emitTenant(req.user.tenant_id,'exportShipments',{action:'documentAdded',id:shipment.id,documentId:id});res.status(201).json(rows[0]);
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  app.delete('/api/export/shipments/:shipmentId/documents/:documentId',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN');const shipment=await readShipment(req.user,req.params.shipmentId,client);if(['DISPATCHED','AT_BORDER','DELIVERED','CLOSED'].includes(shipment.status))throw requestError('Dokumentet e ngarkesës së nisur nuk fshihen; shtohet version korrigjues.',409);
      const result=await client.query('DELETE FROM export_shipment_documents WHERE id=$1 AND shipment_id=$2 RETURNING *',[req.params.documentId,shipment.id]);if(!result.rowCount)throw requestError('Dokumenti nuk u gjet.',404);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'EXPORT_DOCUMENT_DELETE',entityType:'export_shipment',entityId:shipment.id,companyId:shipment.company_id,metadata:{shipmentNo:shipment.shipment_no,documentType:result.rows[0].document_type,documentNo:result.rows[0].document_no},ip:req.ip},client);await client.query('COMMIT');res.json({id:req.params.documentId,deleted:true});
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });

  app.get('/api/export/reports/catalog',authRequired,(_req,res)=>res.json([
    {code:'shipment-register',name:'Regjistri i ngarkesave'},{code:'status-summary',name:'Ngarkesa sipas statusit'},{code:'customer',name:'Eksport sipas klientit'},
    {code:'country',name:'Eksport sipas shtetit'},{code:'vehicle',name:'Ngarkesa sipas automjetit'},{code:'capacity',name:'Shfrytëzimi i kapacitetit'},
    {code:'driver',name:'Ngarkesa sipas shoferit'},{code:'product',name:'Eksport sipas artikullit'},{code:'lot',name:'Eksport sipas lotit'},
    {code:'month',name:'Eksport mujor'},{code:'incoterm',name:'Eksport sipas Incoterm'},{code:'border',name:'Kalime sipas pikës kufitare'},
    {code:'documents',name:'Plotësia e dokumenteve'},{code:'delivery-time',name:'Koha e dorëzimit'},{code:'profitability',name:'Fitimi i ngarkesës'},
  ]));

  app.get('/api/export/reports/:code',authRequired,async(req,res,next)=>{
    try{
      const companyIds=await accessibleCompanyIds(req.user);if(!companyIds.length)return res.json([]);
      const filter=z.object({from:z.string().date().optional(),to:z.string().date().optional()}).parse(req.query);
      const params=[req.user.tenant_id,companyIds,filter.from||'1900-01-01',filter.to||'2999-12-31'];
      const base=`s.tenant_id=$1 AND s.company_id=ANY($2::uuid[]) AND s.shipment_date BETWEEN $3 AND $4`;
      let sql;
      switch(req.params.code){
        case 'shipment-register':sql=`SELECT s.shipment_no,s.shipment_date,s.status,bp.name AS customer,v.plate_no,s.driver_name,s.destination,s.destination_country,s.net_weight,s.gross_weight,s.pallet_count,s.package_count,s.cmr_no,s.packing_list_no,s.commercial_invoice_no,s.customs_declaration_no,s.seal_no,s.freight_cost+s.customs_cost+s.other_cost AS logistics_cost,d.document_no AS delivery_note FROM export_shipments s JOIN business_partners bp ON bp.id=s.customer_id LEFT JOIN logistics_vehicles v ON v.id=s.vehicle_id LEFT JOIN business_documents d ON d.id=s.delivery_document_id WHERE ${base} ORDER BY s.shipment_date DESC,s.shipment_no`;break;
        case 'status-summary':sql=`SELECT s.status AS label,COUNT(*)::int AS shipments,COALESCE(SUM(s.net_weight),0)::numeric AS net_weight,COALESCE(SUM(s.package_count),0)::numeric AS packages FROM export_shipments s WHERE ${base} GROUP BY s.status ORDER BY s.status`;break;
        case 'customer':sql=`SELECT bp.id,bp.name AS label,COUNT(*)::int AS shipments,COALESCE(SUM(s.net_weight),0)::numeric AS net_weight,COALESCE(SUM(si.quantity*si.unit_price),0)::numeric AS value FROM export_shipments s JOIN business_partners bp ON bp.id=s.customer_id LEFT JOIN export_shipment_items si ON si.shipment_id=s.id WHERE ${base} AND s.status<>'CANCELLED' GROUP BY bp.id,bp.name ORDER BY net_weight DESC`;break;
        case 'country':sql=`SELECT COALESCE(s.destination_country,'Pa shtet') AS label,COUNT(DISTINCT s.id)::int AS shipments,COALESCE(SUM(s.net_weight),0)::numeric AS net_weight FROM export_shipments s WHERE ${base} AND s.status<>'CANCELLED' GROUP BY s.destination_country ORDER BY net_weight DESC`;break;
        case 'vehicle':sql=`SELECT COALESCE(v.plate_no,'Pa mjet') AS label,COUNT(*)::int AS shipments,COALESCE(SUM(s.net_weight),0)::numeric AS net_weight,COALESCE(SUM(s.distance_km),0)::numeric AS distance_km FROM export_shipments s LEFT JOIN logistics_vehicles v ON v.id=s.vehicle_id WHERE ${base} AND s.status<>'CANCELLED' GROUP BY v.plate_no ORDER BY net_weight DESC`;break;
        case 'capacity':sql=`SELECT s.shipment_no,v.plate_no,v.capacity_kg,s.net_weight,CASE WHEN v.capacity_kg>0 THEN ROUND(s.net_weight/v.capacity_kg*100,2) ELSE 0 END AS utilization_percent,CASE WHEN v.capacity_kg>0 AND s.net_weight>v.capacity_kg THEN TRUE ELSE FALSE END AS overloaded FROM export_shipments s LEFT JOIN logistics_vehicles v ON v.id=s.vehicle_id WHERE ${base} AND s.status<>'CANCELLED' ORDER BY utilization_percent DESC`;break;
        case 'driver':sql=`SELECT COALESCE(NULLIF(s.driver_name,''),'Pa shofer') AS label,COUNT(*)::int AS shipments,COALESCE(SUM(s.net_weight),0)::numeric AS net_weight,COALESCE(SUM(s.distance_km),0)::numeric AS distance_km FROM export_shipments s WHERE ${base} AND s.status<>'CANCELLED' GROUP BY s.driver_name ORDER BY net_weight DESC`;break;
        case 'product':sql=`SELECT p.id,p.code,p.name AS label,COUNT(DISTINCT s.id)::int AS shipments,COALESCE(SUM(si.quantity),0)::numeric AS quantity,COALESCE(SUM(si.quantity*si.unit_price),0)::numeric AS value FROM export_shipments s JOIN export_shipment_items si ON si.shipment_id=s.id JOIN products p ON p.id=si.product_id WHERE ${base} AND s.status<>'CANCELLED' GROUP BY p.id,p.code,p.name ORDER BY quantity DESC`;break;
        case 'lot':sql=`SELECT l.id,l.lot_number AS label,p.name AS product_name,COUNT(DISTINCT s.id)::int AS shipments,COALESCE(SUM(si.quantity),0)::numeric AS quantity FROM export_shipments s JOIN export_shipment_items si ON si.shipment_id=s.id JOIN trace_lots l ON l.id=si.lot_id JOIN products p ON p.id=si.product_id WHERE ${base} AND s.status<>'CANCELLED' GROUP BY l.id,l.lot_number,p.name ORDER BY quantity DESC`;break;
        case 'month':sql=`SELECT TO_CHAR(s.shipment_date,'YYYY-MM') AS label,COUNT(*)::int AS shipments,COALESCE(SUM(s.net_weight),0)::numeric AS net_weight,COALESCE(SUM(s.freight_cost+s.customs_cost+s.other_cost),0)::numeric AS logistics_cost FROM export_shipments s WHERE ${base} AND s.status<>'CANCELLED' GROUP BY 1 ORDER BY 1`;break;
        case 'incoterm':sql=`SELECT COALESCE(NULLIF(s.incoterm,''),'Pa Incoterm') AS label,COUNT(*)::int AS shipments,COALESCE(SUM(s.net_weight),0)::numeric AS net_weight FROM export_shipments s WHERE ${base} AND s.status<>'CANCELLED' GROUP BY s.incoterm ORDER BY net_weight DESC`;break;
        case 'border':sql=`SELECT COALESCE(NULLIF(s.border_point,''),'Pa pikë kufitare') AS label,COUNT(*)::int AS shipments,COALESCE(SUM(s.net_weight),0)::numeric AS net_weight FROM export_shipments s WHERE ${base} AND s.status<>'CANCELLED' GROUP BY s.border_point ORDER BY net_weight DESC`;break;
        case 'documents':sql=`SELECT s.shipment_no,s.status,s.cmr_no,s.packing_list_no,s.commercial_invoice_no,s.customs_declaration_no,s.seal_no,(s.cmr_no IS NOT NULL AND s.packing_list_no IS NOT NULL AND s.commercial_invoice_no IS NOT NULL AND s.seal_no IS NOT NULL) AS complete,ARRAY_REMOVE(ARRAY[CASE WHEN s.cmr_no IS NULL THEN 'CMR' END,CASE WHEN s.packing_list_no IS NULL THEN 'PACKING_LIST' END,CASE WHEN s.commercial_invoice_no IS NULL THEN 'COMMERCIAL_INVOICE' END,CASE WHEN s.seal_no IS NULL THEN 'SEAL' END],NULL) AS missing FROM export_shipments s WHERE ${base} ORDER BY s.shipment_date DESC`;break;
        case 'delivery-time':sql=`SELECT s.shipment_no,s.driver_name,s.destination,s.departure_at,s.delivered_at,ROUND(EXTRACT(EPOCH FROM (s.delivered_at-s.departure_at))/3600,2) AS delivery_hours FROM export_shipments s WHERE ${base} AND s.delivered_at IS NOT NULL AND s.departure_at IS NOT NULL ORDER BY s.delivered_at DESC`;break;
        case 'profitability':sql=`SELECT s.shipment_no,bp.name AS customer,s.net_weight,COALESCE(SUM(si.quantity*si.unit_price),0)::numeric AS revenue,COALESCE(SUM(si.quantity*si.unit_cost),0)::numeric AS goods_cost,(s.freight_cost+s.customs_cost+s.other_cost)::numeric AS logistics_cost,(COALESCE(SUM(si.quantity*si.unit_price),0)-COALESCE(SUM(si.quantity*si.unit_cost),0)-(s.freight_cost+s.customs_cost+s.other_cost))::numeric AS profit FROM export_shipments s JOIN business_partners bp ON bp.id=s.customer_id LEFT JOIN export_shipment_items si ON si.shipment_id=s.id WHERE ${base} AND s.status<>'CANCELLED' GROUP BY s.id,s.shipment_no,bp.name,s.net_weight,s.freight_cost,s.customs_cost,s.other_cost ORDER BY profit DESC`;break;
        default:throw requestError('Raporti i eksportit nuk njihet.',404);
      }
      const {rows}=await pool.query(sql,params);res.json(rows);
    }catch(error){next(error);}
  });
}
