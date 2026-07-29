import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { refreshInvoicePayment } from './phase5-finance.js';

const WRITE_ROLES=['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','OPERATOR_PESHORE'];
const returnSchema=z.object({
  companyId:z.string().uuid(),warehouseId:z.string().uuid(),partnerId:z.string().uuid(),
  sourceInvoiceId:z.string().uuid(),documentDate:z.string().date().optional(),notes:z.string().trim().max(2000).optional().default(''),
  items:z.array(z.object({productId:z.string().uuid(),quantity:z.coerce.number().positive(),freeQuantity:z.coerce.number().min(0).default(0)})).min(1),
});

function requestError(message,status=400){const error=new Error(message);error.status=status;return error;}
async function lockDocument(client,id,tenantId){const {rows}=await client.query('SELECT * FROM business_documents WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[id,tenantId]);if(!rows[0])throw requestError('Dokumenti nuk u gjet.',404);return rows[0];}
async function nextReturnNo(client,tenantId,companyId){await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${tenantId}:${companyId}:SUPPLIER_RETURN`]);const {rows}=await client.query(`SELECT COALESCE(MAX((substring(document_no FROM '([0-9]+)$'))::int),0)+1 AS n FROM business_documents WHERE tenant_id=$1 AND company_id=$2 AND doc_type='SUPPLIER_RETURN'`,[tenantId,companyId]);return `KF-${new Date().getFullYear()}-${String(rows[0].n).padStart(5,'0')}`;}

async function sourceInvoice(client,input,user){
  const source=await lockDocument(client,input.sourceInvoiceId,user.tenant_id);
  if(source.company_id!==input.companyId||source.doc_type!=='PURCHASE_INVOICE'||source.status!=='CONFIRMED')throw requestError('Zgjidhni një faturë blerjeje të konfirmuar të kompanisë aktive.',409);
  if(source.partner_id!==input.partnerId)throw requestError('Furnitori duhet të jetë i njëjtë me furnitorin e faturës.',409);
  return source;
}

async function buildLines(client,input,source,user){
  const sourceItems=(await client.query('SELECT * FROM business_document_items WHERE document_id=$1',[source.id])).rows;
  const byProduct=new Map(sourceItems.map((x)=>[x.product_id,x]));
  const previous=(await client.query(`SELECT i.product_id,COALESCE(SUM(i.quantity+i.free_quantity),0)::numeric AS qty
    FROM business_documents r JOIN business_document_items i ON i.document_id=r.id
    WHERE r.tenant_id=$1 AND r.source_document_id=$2 AND r.doc_type='SUPPLIER_RETURN' AND r.status<>'CANCELLED'
    GROUP BY i.product_id`,[user.tenant_id,source.id])).rows;
  const returned=new Map(previous.map((x)=>[x.product_id,Number(x.qty)]));
  return input.items.map((line)=>{
    const original=byProduct.get(line.productId);if(!original)throw requestError('Artikulli i kthyer nuk ndodhet në faturën burim.',409);
    const requested=Number(line.quantity)+Number(line.freeQuantity||0),available=Number(original.quantity)+Number(original.free_quantity)-Number(returned.get(line.productId)||0);
    if(requested>available+0.000001)throw requestError(`Sasia e kthimit për ${original.description} tejkalon sasinë e faturuar.`,409);
    const quantity=Number(line.quantity),freeQuantity=Number(line.freeQuantity||0),lineNet=quantity*Number(original.unit_price),lineVat=lineNet*Number(original.vat_rate)/100;
    return {productId:line.productId,description:original.description,unit:original.unit,coefficient:Number(original.coefficient),quantity,freeQuantity,unitPrice:Number(original.unit_price),vatRate:Number(original.vat_rate),lineNet,lineVat,lineTotal:lineNet+lineVat};
  });
}

async function ensureStockAndPost(client,document,items,user,sign){
  for(const item of items){
    const qty=(Number(item.quantity)+Number(item.free_quantity??item.freeQuantity??0))*Number(item.coefficient);
    if(sign<0){const {rows}=await client.query('SELECT COALESCE(SUM(quantity_base),0)::numeric AS qty FROM stock_movements WHERE tenant_id=$1 AND company_id=$2 AND warehouse_id=$3 AND product_id=$4',[user.tenant_id,document.company_id,document.warehouse_id,item.product_id||item.productId]);if(Number(rows[0].qty)+1e-9<qty)throw requestError(`Gjendje e pamjaftueshme për kthim: ${item.description}.`,409);}
    await client.query(`INSERT INTO stock_movements(id,tenant_id,company_id,warehouse_id,product_id,movement_type,quantity_base,unit_cost,reference_type,reference_id,reference_no,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'business_document',$9,$10,$11)`,[randomUUID(),user.tenant_id,document.company_id,document.warehouse_id,item.product_id||item.productId,sign<0?'SUPPLIER_RETURN':'SUPPLIER_RETURN_CANCEL',sign*qty,item.unit_price??item.unitPrice,document.id,document.document_no,user.id]);
  }
}

export async function migratePhase98SupplierReturns(db){
  await db.query(`
    DO $$ DECLARE item record; BEGIN
      FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='business_documents'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%doc_type%' LOOP
        EXECUTE format('ALTER TABLE business_documents DROP CONSTRAINT %I',item.conname);
      END LOOP;
    END $$;
    ALTER TABLE business_documents ADD CONSTRAINT business_documents_doc_type_check CHECK (doc_type IN ('PURCHASE_RFQ','PURCHASE_ORDER','PURCHASE_RECEIPT','PURCHASE_INVOICE','SUPPLIER_RETURN','SALES_QUOTE','SALES_ORDER','DELIVERY_NOTE','SALES_INVOICE'));
    CREATE INDEX IF NOT EXISTS idx_supplier_returns_source ON business_documents(tenant_id,source_document_id) WHERE doc_type='SUPPLIER_RETURN';
  `);
  await db.query(`UPDATE business_documents d SET remaining_amount=GREATEST(d.total_amount-d.paid_amount-COALESCE((SELECT SUM(r.total_amount) FROM business_documents r WHERE r.tenant_id=d.tenant_id AND r.source_document_id=d.id AND r.doc_type='SUPPLIER_RETURN' AND r.status='CONFIRMED'),0),0) WHERE d.doc_type='PURCHASE_INVOICE'`);
}

export function installPhase98SupplierReturnRoutes({app,pool,authRequired,requireRoles,assertCompanyAccess,audit,emitTenant}){
  app.get('/api/supplier-returns/source-invoices',authRequired,async(req,res,next)=>{try{const companyId=z.string().uuid().parse(req.query.companyId);await assertCompanyAccess(req.user,companyId);const {rows}=await pool.query(`SELECT d.id,d.document_no,d.document_date,d.partner_id,d.warehouse_id,d.total_amount,d.remaining_amount,bp.name AS partner_name,w.name AS warehouse_name FROM business_documents d LEFT JOIN business_partners bp ON bp.id=d.partner_id LEFT JOIN warehouses w ON w.id=d.warehouse_id WHERE d.tenant_id=$1 AND d.company_id=$2 AND d.doc_type='PURCHASE_INVOICE' AND d.status='CONFIRMED' ORDER BY d.document_date DESC,d.created_at DESC`,[req.user.tenant_id,companyId]);res.json(rows);}catch(error){next(error);}});
  app.post('/api/supplier-returns',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{const client=await pool.connect();try{const input=returnSchema.parse(req.body);await client.query('BEGIN');await assertCompanyAccess(req.user,input.companyId,client);const source=await sourceInvoice(client,input,req.user);const lines=await buildLines(client,input,source,req.user);const totalNet=lines.reduce((s,x)=>s+x.lineNet,0),totalVat=lines.reduce((s,x)=>s+x.lineVat,0),total=totalNet+totalVat;if(total>Number(source.remaining_amount)+0.0001)throw requestError('Kthimi tejkalon detyrimin e hapur të faturës burim.',409);const id=randomUUID(),documentNo=await nextReturnNo(client,req.user.tenant_id,input.companyId);const {rows}=await client.query(`INSERT INTO business_documents(id,tenant_id,company_id,warehouse_id,partner_id,doc_type,document_no,document_date,status,notes,total_net,total_vat,total_amount,created_by,source_document_id,source_document_type) VALUES($1,$2,$3,$4,$5,'SUPPLIER_RETURN',$6,$7,'DRAFT',$8,$9,$10,$11,$12,$13,'PURCHASE_INVOICE') RETURNING *`,[id,req.user.tenant_id,input.companyId,input.warehouseId,input.partnerId,documentNo,input.documentDate||new Date().toISOString().slice(0,10),input.notes,totalNet,totalVat,total,req.user.id,source.id]);for(const x of lines)await client.query(`INSERT INTO business_document_items(id,document_id,product_id,description,unit,coefficient,quantity,free_quantity,unit_price,vat_rate,line_net,line_vat,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[randomUUID(),id,x.productId,x.description,x.unit,x.coefficient,x.quantity,x.freeQuantity,x.unitPrice,x.vatRate,x.lineNet,x.lineVat,x.lineTotal]);await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'SUPPLIER_RETURN_CREATE',entityType:'business_document',entityId:id,companyId:input.companyId,metadata:{documentNo,sourceInvoice:source.document_no,total},ip:req.ip},client);await client.query('COMMIT');emitTenant(req.user.tenant_id,'documents',{action:'created',id,docType:'SUPPLIER_RETURN'});res.status(201).json(rows[0]);}catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}});
  app.post('/api/supplier-returns/:id/confirm',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{const client=await pool.connect();try{await client.query('BEGIN');const document=await lockDocument(client,req.params.id,req.user.tenant_id);await assertCompanyAccess(req.user,document.company_id,client);if(document.doc_type!=='SUPPLIER_RETURN'||document.status!=='DRAFT')throw requestError('Vetëm kthimi Draft mund të konfirmohet.',409);const source=await lockDocument(client,document.source_document_id,req.user.tenant_id);const credit=(await client.query(`SELECT COALESCE(SUM(total_amount),0)::numeric AS total FROM business_documents WHERE tenant_id=$1 AND source_document_id=$2 AND doc_type='SUPPLIER_RETURN' AND status='CONFIRMED'`,[req.user.tenant_id,source.id])).rows[0];if(Number(credit.total)+Number(document.total_amount)>Number(source.remaining_amount)+Number(credit.total)+0.0001)throw requestError('Kthimi tejkalon shumën ende të hapur të faturës burim.',409);const items=(await client.query('SELECT * FROM business_document_items WHERE document_id=$1 ORDER BY created_at',[document.id])).rows;await ensureStockAndPost(client,document,items,req.user,-1);await client.query("UPDATE business_documents SET status='CONFIRMED',confirmed_at=NOW(),updated_at=NOW() WHERE id=$1",[document.id]);await refreshInvoicePayment(client,source.id);await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'SUPPLIER_RETURN_CONFIRM',entityType:'business_document',entityId:document.id,companyId:document.company_id,metadata:{documentNo:document.document_no,sourceInvoice:source.document_no},ip:req.ip},client);await client.query('COMMIT');emitTenant(req.user.tenant_id,'stock',{action:'changed',warehouseId:document.warehouse_id});emitTenant(req.user.tenant_id,'documents',{action:'confirmed',id:document.id,docType:'SUPPLIER_RETURN'});res.json({id:document.id,status:'CONFIRMED',sourceInvoiceId:source.id});}catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}});
  app.post('/api/supplier-returns/:id/cancel',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{const client=await pool.connect();try{await client.query('BEGIN');const document=await lockDocument(client,req.params.id,req.user.tenant_id);await assertCompanyAccess(req.user,document.company_id,client);if(document.doc_type!=='SUPPLIER_RETURN'||document.status==='CANCELLED')throw requestError('Kthimi nuk mund të anulohet.',409);const source=await lockDocument(client,document.source_document_id,req.user.tenant_id);if(document.status==='CONFIRMED'){const payments=(await client.query(`SELECT COALESCE(SUM(pa.amount),0)::numeric AS total FROM payment_allocations pa JOIN finance_documents f ON f.id=pa.finance_document_id WHERE pa.business_document_id=$1 AND f.status='POSTED'`,[source.id])).rows[0];const otherCredits=(await client.query(`SELECT COALESCE(SUM(total_amount),0)::numeric AS total FROM business_documents WHERE tenant_id=$1 AND source_document_id=$2 AND doc_type='SUPPLIER_RETURN' AND status='CONFIRMED' AND id<>$3`,[req.user.tenant_id,source.id,document.id])).rows[0];if(Number(payments.total)+Number(otherCredits.total)>Number(source.total_amount)+0.0001)throw requestError('Anulimi do të krijonte detyrim të pambuluar; kontrolloni pagesat para anulimit.',409);const items=(await client.query('SELECT * FROM business_document_items WHERE document_id=$1',[document.id])).rows;await ensureStockAndPost(client,document,items,req.user,1);}await client.query("UPDATE business_documents SET status='CANCELLED',cancelled_at=NOW(),updated_at=NOW() WHERE id=$1",[document.id]);await refreshInvoicePayment(client,source.id);await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'SUPPLIER_RETURN_CANCEL',entityType:'business_document',entityId:document.id,companyId:document.company_id,metadata:{documentNo:document.document_no},ip:req.ip},client);await client.query('COMMIT');emitTenant(req.user.tenant_id,'stock',{action:'changed',warehouseId:document.warehouse_id});res.json({id:document.id,status:'CANCELLED'});}catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}});
}
