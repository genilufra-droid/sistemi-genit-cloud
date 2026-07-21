import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const WRITE_ROLES = ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','OPERATOR_PESHORE','SHITES'];
export const DOCUMENT_TYPES = [
  'PURCHASE_RFQ','PURCHASE_ORDER','PURCHASE_RECEIPT','PURCHASE_INVOICE',
  'SALES_QUOTE','SALES_ORDER','DELIVERY_NOTE','SALES_INVOICE',
];
const STOCK_TYPES = { PURCHASE_RECEIPT: 1, DELIVERY_NOTE: -1 };

export async function migratePhase2Documents(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS business_documents (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
      partner_id UUID REFERENCES business_partners(id) ON DELETE RESTRICT,
      doc_type VARCHAR(40) NOT NULL CHECK (doc_type IN ('PURCHASE_RFQ','PURCHASE_ORDER','PURCHASE_RECEIPT','PURCHASE_INVOICE','SALES_QUOTE','SALES_ORDER','DELIVERY_NOTE','SALES_INVOICE')),
      document_no VARCHAR(80) NOT NULL,
      document_date DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CONFIRMED','CANCELLED')),
      notes TEXT,
      total_net NUMERIC(18,4) NOT NULL DEFAULT 0,
      total_vat NUMERIC(18,4) NOT NULL DEFAULT 0,
      total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, doc_type, document_no)
    );
    CREATE TABLE IF NOT EXISTS business_document_items (
      id UUID PRIMARY KEY,
      document_id UUID NOT NULL REFERENCES business_documents(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      description VARCHAR(240) NOT NULL,
      unit VARCHAR(30) NOT NULL,
      coefficient NUMERIC(18,6) NOT NULL DEFAULT 1,
      quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
      free_quantity NUMERIC(18,6) NOT NULL DEFAULT 0,
      unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
      vat_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
      line_net NUMERIC(18,4) NOT NULL DEFAULT 0,
      line_vat NUMERIC(18,4) NOT NULL DEFAULT 0,
      line_total NUMERIC(18,4) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_documents_scope ON business_documents(tenant_id,company_id,doc_type,document_date DESC);
    CREATE INDEX IF NOT EXISTS idx_document_items_doc ON business_document_items(document_id);
  `);
}

const itemSchema = z.object({
  productId: z.string().uuid(),
  unit: z.string().trim().min(1).max(30).default('copë'),
  coefficient: z.coerce.number().positive().default(1),
  quantity: z.coerce.number().positive(),
  freeQuantity: z.coerce.number().min(0).default(0),
  unitPrice: z.coerce.number().min(0).default(0),
  vatRate: z.coerce.number().min(0).max(100).default(0),
});
const documentSchema = z.object({
  companyId: z.string().uuid(),
  warehouseId: z.string().uuid().nullable().optional(),
  partnerId: z.string().uuid().nullable().optional(),
  docType: z.enum(DOCUMENT_TYPES),
  documentNo: z.string().trim().max(80).optional().default(''),
  documentDate: z.string().date(),
  notes: z.string().trim().max(2000).optional().default(''),
  items: z.array(itemSchema).min(1),
});

export function installPhase2DocumentRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, audit, emitTenant }) {
  app.get('/api/documents', authRequired, async (req,res,next) => {
    try {
      const type = z.enum(DOCUMENT_TYPES).parse(req.query.type);
      const ids = await accessibleCompanyIds(req.user,pool);
      if (!ids.length) return res.json([]);
      const { rows } = await pool.query(`
        SELECT d.*,c.name AS company_name,w.name AS warehouse_name,bp.name AS partner_name,
          COALESCE((SELECT json_agg(json_build_object('id',i.id,'productId',i.product_id,'description',i.description,'unit',i.unit,'coefficient',i.coefficient,'quantity',i.quantity,'freeQuantity',i.free_quantity,'unitPrice',i.unit_price,'vatRate',i.vat_rate,'lineTotal',i.line_total) ORDER BY i.created_at) FROM business_document_items i WHERE i.document_id=d.id),'[]'::json) AS items
        FROM business_documents d
        JOIN companies c ON c.id=d.company_id
        LEFT JOIN warehouses w ON w.id=d.warehouse_id
        LEFT JOIN business_partners bp ON bp.id=d.partner_id
        WHERE d.tenant_id=$1 AND d.company_id=ANY($2::uuid[]) AND d.doc_type=$3
        ORDER BY d.document_date DESC,d.created_at DESC`, [req.user.tenant_id,ids,type]);
      res.json(rows);
    } catch (e) { next(e); }
  });

  app.post('/api/documents', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = documentSchema.parse(req.body);
      await client.query('BEGIN');
      await assertCompanyAccess(req.user,input.companyId,client);
      if (input.warehouseId) {
        const w = await client.query('SELECT 1 FROM warehouses WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE',[input.warehouseId,req.user.tenant_id,input.companyId]);
        if (!w.rowCount) throw requestError('Magazina nuk i përket kompanisë.',400);
      }
      if (input.partnerId) {
        const p = await client.query('SELECT 1 FROM business_partners WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE',[input.partnerId,req.user.tenant_id,input.companyId]);
        if (!p.rowCount) throw requestError('Partneri nuk i përket kompanisë.',400);
      }
      const productIds = [...new Set(input.items.map(x=>x.productId))];
      const products = await client.query('SELECT id,name,company_id FROM products WHERE tenant_id=$1 AND company_id=$2 AND id=ANY($3::uuid[]) AND active=TRUE',[req.user.tenant_id,input.companyId,productIds]);
      if (products.rowCount !== productIds.length) throw requestError('Një ose më shumë artikuj nuk janë të vlefshëm.',400);
      const productMap = new Map(products.rows.map(x=>[x.id,x]));
      const documentNo = input.documentNo || await nextDocumentNo(client,req.user.tenant_id,input.companyId,input.docType);
      let totalNet=0,totalVat=0,totalAmount=0;
      const calculated = input.items.map(x=>{
        const lineNet = Number(x.quantity)*Number(x.unitPrice);
        const lineVat = lineNet*Number(x.vatRate)/100;
        const lineTotal = lineNet+lineVat;
        totalNet+=lineNet; totalVat+=lineVat; totalAmount+=lineTotal;
        return {...x,description:productMap.get(x.productId).name,lineNet,lineVat,lineTotal};
      });
      const id=randomUUID();
      const {rows}=await client.query(`INSERT INTO business_documents(id,tenant_id,company_id,warehouse_id,partner_id,doc_type,document_no,document_date,notes,total_net,total_vat,total_amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[id,req.user.tenant_id,input.companyId,input.warehouseId||null,input.partnerId||null,input.docType,documentNo,input.documentDate,input.notes||null,totalNet,totalVat,totalAmount,req.user.id]);
      for (const x of calculated) {
        await client.query(`INSERT INTO business_document_items(id,document_id,product_id,description,unit,coefficient,quantity,free_quantity,unit_price,vat_rate,line_net,line_vat,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[randomUUID(),id,x.productId,x.description,x.unit,x.coefficient,x.quantity,x.freeQuantity,x.unitPrice,x.vatRate,x.lineNet,x.lineVat,x.lineTotal]);
      }
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'DOCUMENT_CREATE',entityType:'business_document',entityId:id,companyId:input.companyId,metadata:{docType:input.docType,documentNo,totalAmount},ip:req.ip},client);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'documents',{action:'created',id,docType:input.docType});
      res.status(201).json(rows[0]);
    } catch(e) { await client.query('ROLLBACK'); next(e); } finally { client.release(); }
  });

  app.post('/api/documents/:id/confirm', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const {rows}=await client.query('SELECT * FROM business_documents WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[req.params.id,req.user.tenant_id]);
      const doc=rows[0];
      if(!doc) throw requestError('Dokumenti nuk u gjet.',404);
      await assertCompanyAccess(req.user,doc.company_id,client);
      if(doc.status!=='DRAFT') throw requestError('Vetëm dokumenti Draft mund të konfirmohet.',409);
      const items=(await client.query('SELECT * FROM business_document_items WHERE document_id=$1 ORDER BY created_at',[doc.id])).rows;
      const sign=STOCK_TYPES[doc.doc_type];
      if(sign) {
        if(!doc.warehouse_id) throw requestError('Zgjidhni magazinën para konfirmimit.',400);
        for(const item of items) {
          const qty=(Number(item.quantity)+Number(item.free_quantity))*Number(item.coefficient);
          if(sign<0) {
            const available=await client.query('SELECT COALESCE(SUM(quantity_base),0)::numeric AS qty FROM stock_movements WHERE tenant_id=$1 AND company_id=$2 AND warehouse_id=$3 AND product_id=$4',[req.user.tenant_id,doc.company_id,doc.warehouse_id,item.product_id]);
            if(Number(available.rows[0].qty)+1e-9<qty) throw requestError(`Gjendje e pamjaftueshme për ${item.description}.`,409);
          }
          await client.query(`INSERT INTO stock_movements(id,tenant_id,company_id,warehouse_id,product_id,movement_type,quantity_base,unit_cost,reference_type,reference_id,reference_no,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'business_document',$9,$10,$11)`,[randomUUID(),req.user.tenant_id,doc.company_id,doc.warehouse_id,item.product_id,doc.doc_type,sign*qty,item.unit_price,doc.id,doc.document_no,req.user.id]);
        }
      }
      await client.query("UPDATE business_documents SET status='CONFIRMED',confirmed_at=NOW(),updated_at=NOW() WHERE id=$1",[doc.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'DOCUMENT_CONFIRM',entityType:'business_document',entityId:doc.id,companyId:doc.company_id,metadata:{docType:doc.doc_type,documentNo:doc.document_no},ip:req.ip},client);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'documents',{action:'confirmed',id:doc.id,docType:doc.doc_type});
      if(sign) emitTenant(req.user.tenant_id,'stock',{action:'changed',warehouseId:doc.warehouse_id});
      res.json({id:doc.id,status:'CONFIRMED'});
    } catch(e) { await client.query('ROLLBACK'); next(e); } finally { client.release(); }
  });
}

async function nextDocumentNo(client,tenantId,companyId,type) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${tenantId}:${companyId}:${type}`]);
  const {rows}=await client.query('SELECT COUNT(*)::int+1 AS n FROM business_documents WHERE tenant_id=$1 AND company_id=$2 AND doc_type=$3',[tenantId,companyId,type]);
  const prefix={PURCHASE_RFQ:'KO',PURCHASE_ORDER:'PB',PURCHASE_RECEIPT:'PR',PURCHASE_INVOICE:'FB',SALES_QUOTE:'OS',SALES_ORDER:'PS',DELIVERY_NOTE:'FD',SALES_INVOICE:'FS'}[type]||'DOK';
  return `${prefix}-${new Date().getFullYear()}-${String(rows[0].n).padStart(5,'0')}`;
}
async function accessibleCompanyIds(user,db){if(user.role==='SUPER_ADMIN'){const {rows}=await db.query('SELECT id FROM companies WHERE tenant_id=$1',[user.tenant_id]);return rows.map(r=>r.id);}const {rows}=await db.query('SELECT company_id AS id FROM user_companies WHERE user_id=$1',[user.id]);return rows.map(r=>r.id);}
function requestError(message,status){const e=new Error(message);e.status=status;return e;}
