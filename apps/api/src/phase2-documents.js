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
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, doc_type, document_no)
    );
    ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

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
      const { rows } = await pool.query(`${documentSelectSql()}
        WHERE d.tenant_id=$1 AND d.company_id=ANY($2::uuid[]) AND d.doc_type=$3
        ORDER BY d.document_date DESC,d.created_at DESC`, [req.user.tenant_id,ids,type]);
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.get('/api/documents/:id', authRequired, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`${documentSelectSql()} WHERE d.id=$1 AND d.tenant_id=$2 LIMIT 1`, [req.params.id, req.user.tenant_id]);
      const document = rows[0];
      if (!document) throw requestError('Dokumenti nuk u gjet.', 404);
      await assertCompanyAccess(req.user, document.company_id);
      res.json(document);
    } catch (error) { next(error); }
  });

  app.post('/api/documents', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = documentSchema.parse(req.body);
      await client.query('BEGIN');
      const prepared = await prepareDocumentInput(client, req.user, input, assertCompanyAccess);
      const documentNo = input.documentNo || await nextDocumentNo(client,req.user.tenant_id,input.companyId,input.docType);
      const id = randomUUID();
      const { rows } = await client.query(`
        INSERT INTO business_documents(
          id,tenant_id,company_id,warehouse_id,partner_id,doc_type,document_no,document_date,notes,total_net,total_vat,total_amount,created_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [
        id,req.user.tenant_id,input.companyId,input.warehouseId||null,input.partnerId||null,input.docType,
        documentNo,input.documentDate,input.notes||null,prepared.totalNet,prepared.totalVat,prepared.totalAmount,req.user.id,
      ]);
      await replaceItems(client, id, prepared.items);
      await audit({
        tenantId:req.user.tenant_id,userId:req.user.id,action:'DOCUMENT_CREATE',entityType:'business_document',
        entityId:id,companyId:input.companyId,metadata:{docType:input.docType,documentNo,totalAmount:prepared.totalAmount},ip:req.ip,
      },client);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'documents',{action:'created',id,docType:input.docType});
      res.status(201).json(rows[0]);
    } catch(error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.patch('/api/documents/:id', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = documentSchema.parse(req.body);
      await client.query('BEGIN');
      const current = await lockDocument(client, req.params.id, req.user.tenant_id);
      await assertCompanyAccess(req.user,current.company_id,client);
      if (current.status !== 'DRAFT') throw requestError('Vetëm dokumenti Draft mund të editohet.',409);
      if (input.docType !== current.doc_type) throw requestError('Lloji i dokumentit nuk mund të ndryshohet.',400);
      if (input.companyId !== current.company_id) throw requestError('Kompania nuk mund të ndryshohet pas krijimit.',400);
      const prepared = await prepareDocumentInput(client, req.user, input, assertCompanyAccess);
      const documentNo = input.documentNo || current.document_no;
      const { rows } = await client.query(`
        UPDATE business_documents SET warehouse_id=$1,partner_id=$2,document_no=$3,document_date=$4,notes=$5,
          total_net=$6,total_vat=$7,total_amount=$8,updated_at=NOW()
        WHERE id=$9 AND tenant_id=$10 RETURNING *`, [
        input.warehouseId||null,input.partnerId||null,documentNo,input.documentDate,input.notes||null,
        prepared.totalNet,prepared.totalVat,prepared.totalAmount,current.id,req.user.tenant_id,
      ]);
      await replaceItems(client,current.id,prepared.items);
      await audit({
        tenantId:req.user.tenant_id,userId:req.user.id,action:'DOCUMENT_UPDATE',entityType:'business_document',
        entityId:current.id,companyId:current.company_id,metadata:{docType:current.doc_type,documentNo,totalAmount:prepared.totalAmount},ip:req.ip,
      },client);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'documents',{action:'updated',id:current.id,docType:current.doc_type});
      res.json(rows[0]);
    } catch(error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/documents/:id/confirm', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const document = await lockDocument(client,req.params.id,req.user.tenant_id);
      await assertCompanyAccess(req.user,document.company_id,client);
      if(document.status!=='DRAFT') throw requestError('Vetëm dokumenti Draft mund të konfirmohet.',409);
      const items = await readItems(client,document.id);
      const sign = STOCK_TYPES[document.doc_type];
      if(sign) {
        if(!document.warehouse_id) throw requestError('Zgjidhni magazinën para konfirmimit.',400);
        for(const item of items) {
          const quantityBase=(Number(item.quantity)+Number(item.free_quantity))*Number(item.coefficient);
          if(sign<0) {
            const available=await client.query(
              'SELECT COALESCE(SUM(quantity_base),0)::numeric AS qty FROM stock_movements WHERE tenant_id=$1 AND company_id=$2 AND warehouse_id=$3 AND product_id=$4',
              [req.user.tenant_id,document.company_id,document.warehouse_id,item.product_id],
            );
            if(Number(available.rows[0].qty)+1e-9<quantityBase) {
              throw requestError(`Gjendje e pamjaftueshme për ${item.description}.`,409);
            }
          }
          await insertStockMovement(client, {
            tenantId:req.user.tenant_id, companyId:document.company_id, warehouseId:document.warehouse_id,
            productId:item.product_id, movementType:document.doc_type, quantityBase:sign*quantityBase,
            unitCost:item.unit_price, referenceId:document.id, referenceNo:document.document_no, userId:req.user.id,
          });
        }
      }
      await client.query("UPDATE business_documents SET status='CONFIRMED',confirmed_at=NOW(),cancelled_at=NULL,updated_at=NOW() WHERE id=$1",[document.id]);
      await audit({
        tenantId:req.user.tenant_id,userId:req.user.id,action:'DOCUMENT_CONFIRM',entityType:'business_document',
        entityId:document.id,companyId:document.company_id,metadata:{docType:document.doc_type,documentNo:document.document_no},ip:req.ip,
      },client);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'documents',{action:'confirmed',id:document.id,docType:document.doc_type});
      if(sign) emitTenant(req.user.tenant_id,'stock',{action:'changed',warehouseId:document.warehouse_id});
      res.json({id:document.id,status:'CONFIRMED'});
    } catch(error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/documents/:id/cancel', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const document = await lockDocument(client,req.params.id,req.user.tenant_id);
      await assertCompanyAccess(req.user,document.company_id,client);
      if(document.status==='CANCELLED') throw requestError('Dokumenti është anuluar më parë.',409);
      const sign = STOCK_TYPES[document.doc_type];
      if(document.status==='CONFIRMED' && sign) {
        const items = await readItems(client,document.id);
        for(const item of items) {
          const quantityBase=(Number(item.quantity)+Number(item.free_quantity))*Number(item.coefficient);
          if (sign > 0) {
            const available = await client.query(
              'SELECT COALESCE(SUM(quantity_base),0)::numeric AS qty FROM stock_movements WHERE tenant_id=$1 AND company_id=$2 AND warehouse_id=$3 AND product_id=$4',
              [req.user.tenant_id,document.company_id,document.warehouse_id,item.product_id],
            );
            if (Number(available.rows[0].qty) + 1e-9 < quantityBase) {
              throw requestError(`Anulimi do të krijonte stok negativ për ${item.description}.`,409);
            }
          }
          await insertStockMovement(client, {
            tenantId:req.user.tenant_id, companyId:document.company_id, warehouseId:document.warehouse_id,
            productId:item.product_id, movementType:`${document.doc_type}_CANCEL`, quantityBase:-sign*quantityBase,
            unitCost:item.unit_price, referenceId:document.id, referenceNo:`ANULIM ${document.document_no}`, userId:req.user.id,
          });
        }
      }
      await client.query("UPDATE business_documents SET status='CANCELLED',cancelled_at=NOW(),updated_at=NOW() WHERE id=$1",[document.id]);
      await audit({
        tenantId:req.user.tenant_id,userId:req.user.id,action:'DOCUMENT_CANCEL',entityType:'business_document',
        entityId:document.id,companyId:document.company_id,metadata:{docType:document.doc_type,documentNo:document.document_no,previousStatus:document.status},ip:req.ip,
      },client);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'documents',{action:'cancelled',id:document.id,docType:document.doc_type});
      if(sign && document.status==='CONFIRMED') emitTenant(req.user.tenant_id,'stock',{action:'changed',warehouseId:document.warehouse_id});
      res.json({id:document.id,status:'CANCELLED'});
    } catch(error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });
}

function documentSelectSql() {
  return `SELECT d.*,c.name AS company_name,w.name AS warehouse_name,bp.name AS partner_name,
    COALESCE((SELECT json_agg(json_build_object(
      'id',i.id,'productId',i.product_id,'description',i.description,'unit',i.unit,'coefficient',i.coefficient,
      'quantity',i.quantity,'freeQuantity',i.free_quantity,'unitPrice',i.unit_price,'vatRate',i.vat_rate,
      'lineNet',i.line_net,'lineVat',i.line_vat,'lineTotal',i.line_total
    ) ORDER BY i.created_at) FROM business_document_items i WHERE i.document_id=d.id),'[]'::json) AS items
    FROM business_documents d
    JOIN companies c ON c.id=d.company_id
    LEFT JOIN warehouses w ON w.id=d.warehouse_id
    LEFT JOIN business_partners bp ON bp.id=d.partner_id`;
}

async function prepareDocumentInput(client,user,input,assertCompanyAccess) {
  await assertCompanyAccess(user,input.companyId,client);
  if (input.warehouseId) {
    const warehouse = await client.query(
      'SELECT 1 FROM warehouses WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE',
      [input.warehouseId,user.tenant_id,input.companyId],
    );
    if (!warehouse.rowCount) throw requestError('Magazina nuk i përket kompanisë ose është joaktive.',400);
  }
  if (input.partnerId) {
    const partner = await client.query(
      'SELECT 1 FROM business_partners WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE',
      [input.partnerId,user.tenant_id,input.companyId],
    );
    if (!partner.rowCount) throw requestError('Partneri nuk i përket kompanisë ose është joaktiv.',400);
  }
  const productIds=[...new Set(input.items.map((item)=>item.productId))];
  const productResult=await client.query(
    'SELECT id,name,company_id FROM products WHERE tenant_id=$1 AND company_id=$2 AND id=ANY($3::uuid[]) AND active=TRUE',
    [user.tenant_id,input.companyId,productIds],
  );
  if(productResult.rowCount!==productIds.length) throw requestError('Një ose më shumë artikuj nuk janë të vlefshëm.',400);
  const productMap=new Map(productResult.rows.map((product)=>[product.id,product]));
  let totalNet=0; let totalVat=0; let totalAmount=0;
  const items=input.items.map((item)=>{
    const lineNet=Number(item.quantity)*Number(item.unitPrice);
    const lineVat=lineNet*Number(item.vatRate)/100;
    const lineTotal=lineNet+lineVat;
    totalNet+=lineNet; totalVat+=lineVat; totalAmount+=lineTotal;
    return {...item,description:productMap.get(item.productId).name,lineNet,lineVat,lineTotal};
  });
  return {items,totalNet,totalVat,totalAmount};
}

async function replaceItems(client,documentId,items) {
  await client.query('DELETE FROM business_document_items WHERE document_id=$1',[documentId]);
  for(const item of items) {
    await client.query(`
      INSERT INTO business_document_items(
        id,document_id,product_id,description,unit,coefficient,quantity,free_quantity,unit_price,vat_rate,line_net,line_vat,line_total
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
      randomUUID(),documentId,item.productId,item.description,item.unit,item.coefficient,item.quantity,item.freeQuantity,
      item.unitPrice,item.vatRate,item.lineNet,item.lineVat,item.lineTotal,
    ]);
  }
}

async function lockDocument(client,id,tenantId) {
  const {rows}=await client.query('SELECT * FROM business_documents WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[id,tenantId]);
  if(!rows[0]) throw requestError('Dokumenti nuk u gjet.',404);
  return rows[0];
}

async function readItems(client,documentId) {
  return (await client.query('SELECT * FROM business_document_items WHERE document_id=$1 ORDER BY created_at',[documentId])).rows;
}

async function insertStockMovement(client,input) {
  await client.query(`
    INSERT INTO stock_movements(
      id,tenant_id,company_id,warehouse_id,product_id,movement_type,quantity_base,unit_cost,
      reference_type,reference_id,reference_no,created_by
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'business_document',$9,$10,$11)`, [
    randomUUID(),input.tenantId,input.companyId,input.warehouseId,input.productId,input.movementType,
    input.quantityBase,input.unitCost,input.referenceId,input.referenceNo,input.userId,
  ]);
}

async function nextDocumentNo(client,tenantId,companyId,type) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${tenantId}:${companyId}:${type}`]);
  const {rows}=await client.query('SELECT COUNT(*)::int+1 AS n FROM business_documents WHERE tenant_id=$1 AND company_id=$2 AND doc_type=$3',[tenantId,companyId,type]);
  const prefix={PURCHASE_RFQ:'KO',PURCHASE_ORDER:'PB',PURCHASE_RECEIPT:'FH',PURCHASE_INVOICE:'FB',SALES_QUOTE:'OS',SALES_ORDER:'PS',DELIVERY_NOTE:'FD',SALES_INVOICE:'FS'}[type]||'DOK';
  return `${prefix}-${new Date().getFullYear()}-${String(rows[0].n).padStart(5,'0')}`;
}

async function accessibleCompanyIds(user,db) {
  if(user.role==='SUPER_ADMIN') {
    const {rows}=await db.query('SELECT id FROM companies WHERE tenant_id=$1',[user.tenant_id]);
    return rows.map((row)=>row.id);
  }
  const {rows}=await db.query('SELECT company_id AS id FROM user_companies WHERE user_id=$1',[user.id]);
  return rows.map((row)=>row.id);
}

function requestError(message,status) {
  const error=new Error(message);
  error.status=status;
  return error;
}
