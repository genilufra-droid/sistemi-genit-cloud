import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const WRITE_ROLES = ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','OPERATOR_PESHORE','SHITES'];
const text = (value) => String(value ?? '').trim();
const num = (value) => Number(value || 0);

export async function migratePhase2(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(160) NOT NULL,
      code VARCHAR(50),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, name)
    );

    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
      code VARCHAR(80) NOT NULL,
      barcode VARCHAR(120),
      name VARCHAR(220) NOT NULL,
      base_unit VARCHAR(30) NOT NULL DEFAULT 'copë',
      pack_unit VARCHAR(30) NOT NULL DEFAULT 'koli',
      pallet_unit VARCHAR(30) NOT NULL DEFAULT 'paletë',
      pack_coefficient NUMERIC(18,6) NOT NULL DEFAULT 1,
      pallet_coefficient NUMERIC(18,6) NOT NULL DEFAULT 1,
      purchase_price NUMERIC(18,4) NOT NULL DEFAULT 0,
      sale_price NUMERIC(18,4) NOT NULL DEFAULT 0,
      vat_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, code)
    );

    CREATE TABLE IF NOT EXISTS business_partners (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      partner_type VARCHAR(20) NOT NULL CHECK (partner_type IN ('CUSTOMER','SUPPLIER','BOTH')),
      code VARCHAR(80),
      name VARCHAR(220) NOT NULL,
      nipt VARCHAR(50),
      address TEXT,
      city VARCHAR(120),
      phone VARCHAR(80),
      email VARCHAR(180),
      credit_limit NUMERIC(18,4) NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, name)
    );

    CREATE TABLE IF NOT EXISTS weight_tickets (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      supplier_id UUID REFERENCES business_partners(id) ON DELETE RESTRICT,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      document_no VARCHAR(60) NOT NULL,
      document_date DATE NOT NULL DEFAULT CURRENT_DATE,
      bags_count NUMERIC(18,3) NOT NULL DEFAULT 0,
      gross_weight NUMERIC(18,4) NOT NULL DEFAULT 0,
      packaging_weight NUMERIC(18,4) NOT NULL DEFAULT 0,
      net_weight NUMERIC(18,4) NOT NULL DEFAULT 0,
      discount_percent NUMERIC(7,4) NOT NULL DEFAULT 0,
      accepted_weight NUMERIC(18,4) NOT NULL DEFAULT 0,
      unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
      total_value NUMERIC(18,4) NOT NULL DEFAULT 0,
      vehicle_plate VARCHAR(40),
      notes TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CONFIRMED','CANCELLED')),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, document_no)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      movement_type VARCHAR(30) NOT NULL,
      quantity_base NUMERIC(18,6) NOT NULL,
      unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
      reference_type VARCHAR(50),
      reference_id UUID,
      reference_no VARCHAR(80),
      movement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_products_scope ON products(tenant_id, company_id, active);
    CREATE INDEX IF NOT EXISTS idx_partners_scope ON business_partners(tenant_id, company_id, partner_type, active);
    CREATE INDEX IF NOT EXISTS idx_weights_scope ON weight_tickets(tenant_id, company_id, document_date DESC);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_scope ON stock_movements(tenant_id, company_id, warehouse_id, product_id, movement_date DESC);
  `);
}

export function installPhase2Routes({ app, pool, authRequired, requireRoles, assertCompanyAccess, audit, emitTenant }) {
  const categorySchema = z.object({
    companyId: z.string().uuid(), name: z.string().trim().min(1).max(160), code: z.string().trim().max(50).optional().default(''), active: z.boolean().optional(),
  });
  const productSchema = z.object({
    companyId: z.string().uuid(), categoryId: z.string().uuid().nullable().optional(), code: z.string().trim().min(1).max(80), barcode: z.string().trim().max(120).optional().default(''),
    name: z.string().trim().min(1).max(220), baseUnit: z.string().trim().min(1).max(30).default('copë'), packUnit: z.string().trim().min(1).max(30).default('koli'), palletUnit: z.string().trim().min(1).max(30).default('paletë'),
    packCoefficient: z.coerce.number().positive().default(1), palletCoefficient: z.coerce.number().positive().default(1), purchasePrice: z.coerce.number().min(0).default(0), salePrice: z.coerce.number().min(0).default(0), vatRate: z.coerce.number().min(0).max(100).default(0), active: z.boolean().optional(),
  });
  const partnerSchema = z.object({
    companyId: z.string().uuid(), partnerType: z.enum(['CUSTOMER','SUPPLIER','BOTH']), code: z.string().trim().max(80).optional().default(''), name: z.string().trim().min(1).max(220), nipt: z.string().trim().max(50).optional().default(''),
    address: z.string().trim().max(500).optional().default(''), city: z.string().trim().max(120).optional().default(''), phone: z.string().trim().max(80).optional().default(''), email: z.string().trim().email().optional().or(z.literal('')), creditLimit: z.coerce.number().min(0).default(0), active: z.boolean().optional(),
  });
  const statusSchema = z.object({ active: z.boolean() });
  const weightSchema = z.object({ companyId:z.string().uuid(), warehouseId:z.string().uuid(), supplierId:z.string().uuid().nullable().optional(), productId:z.string().uuid(), documentNo:z.string().trim().min(1).max(60), documentDate:z.string().date(), bagsCount:z.coerce.number().min(0).default(0), grossWeight:z.coerce.number().min(0), packagingWeight:z.coerce.number().min(0).default(0), discountPercent:z.coerce.number().min(0).max(100).default(0), unitPrice:z.coerce.number().min(0).default(0), vehiclePlate:z.string().trim().max(40).optional().default(''), notes:z.string().trim().max(1000).optional().default('') });

  async function getScoped(table, id, user, client = pool) {
    const { rows } = await client.query(`SELECT * FROM ${table} WHERE id=$1 AND tenant_id=$2 LIMIT 1`, [id, user.tenant_id]);
    const row = rows[0];
    if (!row) { const error = new Error('Rekordi nuk u gjet.'); error.status = 404; throw error; }
    await assertCompanyAccess(user, row.company_id, client);
    return row;
  }

  app.get('/api/categories', authRequired, async (req,res,next)=>{ try { const ids=await accessibleIds(req.user,pool); if(!ids.length)return res.json([]); const {rows}=await pool.query('SELECT * FROM product_categories WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) ORDER BY active DESC,name',[req.user.tenant_id,ids]); res.json(rows); } catch(e){next(e);} });
  app.post('/api/categories', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next)=>{ try { const i=categorySchema.parse(req.body); await assertCompanyAccess(req.user,i.companyId); const id=randomUUID(); const {rows}=await pool.query('INSERT INTO product_categories(id,tenant_id,company_id,name,code,active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[id,req.user.tenant_id,i.companyId,i.name,i.code||null,i.active ?? true]); await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'CATEGORY_CREATE',entityType:'product_category',entityId:id,companyId:i.companyId,metadata:{name:i.name},ip:req.ip}); emitTenant(req.user.tenant_id,'categories',{action:'created',id}); res.status(201).json(rows[0]); } catch(e){next(e);} });
  app.patch('/api/categories/:id', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next)=>{ try { const current=await getScoped('product_categories',req.params.id,req.user); const i=categorySchema.parse(req.body); await assertCompanyAccess(req.user,i.companyId); const {rows}=await pool.query('UPDATE product_categories SET company_id=$1,name=$2,code=$3,active=$4,updated_at=NOW() WHERE id=$5 AND tenant_id=$6 RETURNING *',[i.companyId,i.name,i.code||null,i.active ?? current.active,current.id,req.user.tenant_id]); await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'CATEGORY_UPDATE',entityType:'product_category',entityId:current.id,companyId:i.companyId,metadata:{name:i.name},ip:req.ip}); emitTenant(req.user.tenant_id,'categories',{action:'updated',id:current.id}); res.json(rows[0]); } catch(e){next(e);} });

  app.get('/api/products', authRequired, async (req,res,next)=>{ try { const ids=await accessibleIds(req.user,pool); if(!ids.length)return res.json([]); const q=text(req.query.q); const params=[req.user.tenant_id,ids]; let filter=''; if(q){params.push(`%${q}%`);filter=' AND (p.name ILIKE $3 OR p.code ILIKE $3 OR COALESCE(p.barcode,\'\') ILIKE $3)';} const {rows}=await pool.query(`SELECT p.*,c.name AS category_name,co.name AS company_name FROM products p LEFT JOIN product_categories c ON c.id=p.category_id JOIN companies co ON co.id=p.company_id WHERE p.tenant_id=$1 AND p.company_id=ANY($2::uuid[]) ${filter} ORDER BY p.active DESC,p.name`,params); res.json(rows); } catch(e){next(e);} });
  app.get('/api/products/:id', authRequired, async (req,res,next)=>{ try { res.json(await getScoped('products',req.params.id,req.user)); } catch(e){next(e);} });
  app.post('/api/products', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next)=>{ try { const i=productSchema.parse(req.body); await assertCompanyAccess(req.user,i.companyId); const id=randomUUID(); const {rows}=await pool.query(`INSERT INTO products(id,tenant_id,company_id,category_id,code,barcode,name,base_unit,pack_unit,pallet_unit,pack_coefficient,pallet_coefficient,purchase_price,sale_price,vat_rate,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,[id,req.user.tenant_id,i.companyId,i.categoryId||null,i.code.toUpperCase(),i.barcode||null,i.name,i.baseUnit,i.packUnit,i.palletUnit,i.packCoefficient,i.palletCoefficient,i.purchasePrice,i.salePrice,i.vatRate,i.active ?? true]); await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PRODUCT_CREATE',entityType:'product',entityId:id,companyId:i.companyId,metadata:{code:i.code,name:i.name},ip:req.ip}); emitTenant(req.user.tenant_id,'products',{action:'created',id}); res.status(201).json(rows[0]); } catch(e){next(e);} });
  app.patch('/api/products/:id', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next)=>{ try { const current=await getScoped('products',req.params.id,req.user); const i=productSchema.parse(req.body); await assertCompanyAccess(req.user,i.companyId); const {rows}=await pool.query(`UPDATE products SET company_id=$1,category_id=$2,code=$3,barcode=$4,name=$5,base_unit=$6,pack_unit=$7,pallet_unit=$8,pack_coefficient=$9,pallet_coefficient=$10,purchase_price=$11,sale_price=$12,vat_rate=$13,active=$14,updated_at=NOW() WHERE id=$15 AND tenant_id=$16 RETURNING *`,[i.companyId,i.categoryId||null,i.code.toUpperCase(),i.barcode||null,i.name,i.baseUnit,i.packUnit,i.palletUnit,i.packCoefficient,i.palletCoefficient,i.purchasePrice,i.salePrice,i.vatRate,i.active ?? current.active,current.id,req.user.tenant_id]); await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PRODUCT_UPDATE',entityType:'product',entityId:current.id,companyId:i.companyId,metadata:{code:i.code,name:i.name},ip:req.ip}); emitTenant(req.user.tenant_id,'products',{action:'updated',id:current.id}); res.json(rows[0]); } catch(e){next(e);} });
  app.patch('/api/products/:id/status', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next)=>{ try { const current=await getScoped('products',req.params.id,req.user); const {active}=statusSchema.parse(req.body); const {rows}=await pool.query('UPDATE products SET active=$1,updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING *',[active,current.id,req.user.tenant_id]); await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:active?'PRODUCT_ACTIVATE':'PRODUCT_DEACTIVATE',entityType:'product',entityId:current.id,companyId:current.company_id,metadata:{name:current.name},ip:req.ip}); emitTenant(req.user.tenant_id,'products',{action:'status',id:current.id,active}); res.json(rows[0]); } catch(e){next(e);} });
  app.delete('/api/products/:id', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next)=>{ try { const current=await getScoped('products',req.params.id,req.user); const {rows}=await pool.query('UPDATE products SET active=FALSE,updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *',[current.id,req.user.tenant_id]); await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PRODUCT_DELETE',entityType:'product',entityId:current.id,companyId:current.company_id,metadata:{name:current.name,softDelete:true},ip:req.ip}); emitTenant(req.user.tenant_id,'products',{action:'deleted',id:current.id}); res.json(rows[0]); } catch(e){next(e);} });

  app.get('/api/partners', authRequired, async (req,res,next)=>{ try { const ids=await accessibleIds(req.user,pool); if(!ids.length)return res.json([]); const type=text(req.query.type); const params=[req.user.tenant_id,ids]; let filter=''; if(type){params.push(type);filter=' AND (partner_type=$3 OR partner_type=\'BOTH\')';} const {rows}=await pool.query(`SELECT bp.*,c.name AS company_name FROM business_partners bp JOIN companies c ON c.id=bp.company_id WHERE bp.tenant_id=$1 AND bp.company_id=ANY($2::uuid[]) ${filter} ORDER BY bp.active DESC,bp.name`,params); res.json(rows); } catch(e){next(e);} });
  app.get('/api/partners/:id', authRequired, async (req,res,next)=>{ try { res.json(await getScoped('business_partners',req.params.id,req.user)); } catch(e){next(e);} });
  app.post('/api/partners', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next)=>{ try { const i=partnerSchema.parse(req.body); await assertCompanyAccess(req.user,i.companyId); const id=randomUUID(); const {rows}=await pool.query(`INSERT INTO business_partners(id,tenant_id,company_id,partner_type,code,name,nipt,address,city,phone,email,credit_limit,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[id,req.user.tenant_id,i.companyId,i.partnerType,i.code||null,i.name,i.nipt||null,i.address||null,i.city||null,i.phone||null,i.email||null,i.creditLimit,i.active ?? true]); await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PARTNER_CREATE',entityType:'business_partner',entityId:id,companyId:i.companyId,metadata:{name:i.name,type:i.partnerType},ip:req.ip}); emitTenant(req.user.tenant_id,'partners',{action:'created',id}); res.status(201).json(rows[0]); } catch(e){next(e);} });
  app.patch('/api/partners/:id', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next)=>{ try { const current=await getScoped('business_partners',req.params.id,req.user); const i=partnerSchema.parse(req.body); await assertCompanyAccess(req.user,i.companyId); const {rows}=await pool.query(`UPDATE business_partners SET company_id=$1,partner_type=$2,code=$3,name=$4,nipt=$5,address=$6,city=$7,phone=$8,email=$9,credit_limit=$10,active=$11,updated_at=NOW() WHERE id=$12 AND tenant_id=$13 RETURNING *`,[i.companyId,i.partnerType,i.code||null,i.name,i.nipt||null,i.address||null,i.city||null,i.phone||null,i.email||null,i.creditLimit,i.active ?? current.active,current.id,req.user.tenant_id]); await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PARTNER_UPDATE',entityType:'business_partner',entityId:current.id,companyId:i.companyId,metadata:{name:i.name,type:i.partnerType},ip:req.ip}); emitTenant(req.user.tenant_id,'partners',{action:'updated',id:current.id}); res.json(rows[0]); } catch(e){next(e);} });
  app.patch('/api/partners/:id/status', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next)=>{ try { const current=await getScoped('business_partners',req.params.id,req.user); const {active}=statusSchema.parse(req.body); const {rows}=await pool.query('UPDATE business_partners SET active=$1,updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING *',[active,current.id,req.user.tenant_id]); await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:active?'PARTNER_ACTIVATE':'PARTNER_DEACTIVATE',entityType:'business_partner',entityId:current.id,companyId:current.company_id,metadata:{name:current.name},ip:req.ip}); emitTenant(req.user.tenant_id,'partners',{action:'status',id:current.id,active}); res.json(rows[0]); } catch(e){next(e);} });
  app.delete('/api/partners/:id', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next)=>{ try { const current=await getScoped('business_partners',req.params.id,req.user); const {rows}=await pool.query('UPDATE business_partners SET active=FALSE,updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *',[current.id,req.user.tenant_id]); await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'PARTNER_DELETE',entityType:'business_partner',entityId:current.id,companyId:current.company_id,metadata:{name:current.name,softDelete:true},ip:req.ip}); emitTenant(req.user.tenant_id,'partners',{action:'deleted',id:current.id}); res.json(rows[0]); } catch(e){next(e);} });

  app.get('/api/weights', authRequired, async (req,res,next)=>{ try { const ids=await accessibleIds(req.user,pool); if(!ids.length)return res.json([]); const {rows}=await pool.query(`SELECT wt.*,p.name AS product_name,bp.name AS supplier_name,w.name AS warehouse_name,c.name AS company_name FROM weight_tickets wt JOIN products p ON p.id=wt.product_id LEFT JOIN business_partners bp ON bp.id=wt.supplier_id JOIN warehouses w ON w.id=wt.warehouse_id JOIN companies c ON c.id=wt.company_id WHERE wt.tenant_id=$1 AND wt.company_id=ANY($2::uuid[]) ORDER BY wt.document_date DESC,wt.created_at DESC`,[req.user.tenant_id,ids]); res.json(rows); } catch(e){next(e);} });
  app.post('/api/weights', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next)=>{ const client=await pool.connect(); try { const i=weightSchema.parse(req.body); await assertCompanyAccess(req.user,i.companyId,client); const net=Math.max(0,num(i.grossWeight)-num(i.packagingWeight)); const accepted=net*(1-num(i.discountPercent)/100); const total=accepted*num(i.unitPrice); const id=randomUUID(); await client.query('BEGIN'); const {rows}=await client.query(`INSERT INTO weight_tickets(id,tenant_id,company_id,warehouse_id,supplier_id,product_id,document_no,document_date,bags_count,gross_weight,packaging_weight,net_weight,discount_percent,accepted_weight,unit_price,total_value,vehicle_plate,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,[id,req.user.tenant_id,i.companyId,i.warehouseId,i.supplierId||null,i.productId,i.documentNo,i.documentDate,i.bagsCount,i.grossWeight,i.packagingWeight,net,i.discountPercent,accepted,i.unitPrice,total,i.vehiclePlate||null,i.notes||null,req.user.id]); await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'WEIGHT_CREATE',entityType:'weight_ticket',entityId:id,companyId:i.companyId,metadata:{documentNo:i.documentNo,acceptedWeight:accepted,totalValue:total},ip:req.ip},client); await client.query('COMMIT'); emitTenant(req.user.tenant_id,'weights',{action:'created',id}); res.status(201).json(rows[0]); } catch(e){await client.query('ROLLBACK');next(e);} finally{client.release();} });
  app.post('/api/weights/:id/confirm', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next)=>{ const client=await pool.connect(); try { await client.query('BEGIN'); const {rows}=await client.query('SELECT * FROM weight_tickets WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[req.params.id,req.user.tenant_id]); const w=rows[0]; if(!w){const e=new Error('Formulari i peshës nuk u gjet.');e.status=404;throw e;} await assertCompanyAccess(req.user,w.company_id,client); if(w.status!=='DRAFT'){const e=new Error('Dokumenti nuk është në status Draft.');e.status=409;throw e;} await client.query(`INSERT INTO stock_movements(id,tenant_id,company_id,warehouse_id,product_id,movement_type,quantity_base,unit_cost,reference_type,reference_id,reference_no,created_by) VALUES($1,$2,$3,$4,$5,'WEIGHT_RECEIPT',$6,$7,'weight_ticket',$8,$9,$10)`,[randomUUID(),req.user.tenant_id,w.company_id,w.warehouse_id,w.product_id,w.accepted_weight,w.unit_price,w.id,w.document_no,req.user.id]); await client.query("UPDATE weight_tickets SET status='CONFIRMED',confirmed_at=NOW(),updated_at=NOW() WHERE id=$1",[w.id]); await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'WEIGHT_CONFIRM',entityType:'weight_ticket',entityId:w.id,companyId:w.company_id,metadata:{documentNo:w.document_no},ip:req.ip},client); await client.query('COMMIT'); emitTenant(req.user.tenant_id,'weights',{action:'confirmed',id:w.id}); emitTenant(req.user.tenant_id,'stock',{action:'changed',productId:w.product_id,warehouseId:w.warehouse_id}); res.json({id:w.id,status:'CONFIRMED'}); } catch(e){await client.query('ROLLBACK');next(e);} finally{client.release();} });

  app.get('/api/stock', authRequired, async (req,res,next)=>{ try { const ids=await accessibleIds(req.user,pool); if(!ids.length)return res.json([]); const {rows}=await pool.query(`SELECT sm.company_id,c.name AS company_name,sm.warehouse_id,w.name AS warehouse_name,sm.product_id,p.code,p.name,p.base_unit,SUM(sm.quantity_base)::numeric AS quantity_base,CASE WHEN p.pack_coefficient>0 THEN SUM(sm.quantity_base)/p.pack_coefficient ELSE 0 END::numeric AS quantity_pack FROM stock_movements sm JOIN companies c ON c.id=sm.company_id JOIN warehouses w ON w.id=sm.warehouse_id JOIN products p ON p.id=sm.product_id WHERE sm.tenant_id=$1 AND sm.company_id=ANY($2::uuid[]) GROUP BY sm.company_id,c.name,sm.warehouse_id,w.name,sm.product_id,p.code,p.name,p.base_unit,p.pack_coefficient ORDER BY c.name,w.name,p.name`,[req.user.tenant_id,ids]); res.json(rows); } catch(e){next(e);} });

  app.post('/api/migration/legacy', authRequired, requireRoles('SUPER_ADMIN','COMPANY_ADMIN'), async (req,res,next)=>{ const client=await pool.connect(); try { const companyId=z.string().uuid().parse(req.body.companyId); await assertCompanyAccess(req.user,companyId,client); const payload=req.body.data||{}; await client.query('BEGIN'); const counts={categories:0,products:0,partners:0}; for(const c of payload.categories||[]){await client.query(`INSERT INTO product_categories(id,tenant_id,company_id,name,code,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,company_id,name) DO UPDATE SET code=EXCLUDED.code,active=EXCLUDED.active,updated_at=NOW()`,[safeUuid(c.id),req.user.tenant_id,companyId,text(c.name)||'Pa kategori',text(c.code)||null,c.active!==false]);counts.categories++;} for(const p of payload.products||[]){await client.query(`INSERT INTO products(id,tenant_id,company_id,code,barcode,name,base_unit,pack_unit,pallet_unit,pack_coefficient,pallet_coefficient,purchase_price,sale_price,vat_rate,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(tenant_id,company_id,code) DO UPDATE SET name=EXCLUDED.name,barcode=EXCLUDED.barcode,pack_coefficient=EXCLUDED.pack_coefficient,pallet_coefficient=EXCLUDED.pallet_coefficient,purchase_price=EXCLUDED.purchase_price,sale_price=EXCLUDED.sale_price,vat_rate=EXCLUDED.vat_rate,active=EXCLUDED.active,updated_at=NOW()`,[safeUuid(p.id),req.user.tenant_id,companyId,text(p.code)||`P-${Date.now()}-${counts.products}`,text(p.barcode)||null,text(p.name)||'Pa emër',text(p.baseUnit||p.unit)||'copë',text(p.packUnit)||'koli',text(p.palletUnit)||'paletë',num(p.packCoefficient||p.unitsPerPack||1),num(p.palletCoefficient||p.unitsPerPallet||1),num(p.purchasePrice||p.cost),num(p.salePrice||p.price),num(p.vatRate),p.active!==false]);counts.products++;} const groups=[['SUPPLIER',payload.suppliers||[]],['CUSTOMER',payload.customers||payload.clients||[]]]; for(const [type,list] of groups){for(const x of list){await client.query(`INSERT INTO business_partners(id,tenant_id,company_id,partner_type,code,name,nipt,address,city,phone,email,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(tenant_id,company_id,name) DO UPDATE SET partner_type=CASE WHEN business_partners.partner_type<>EXCLUDED.partner_type THEN 'BOTH' ELSE business_partners.partner_type END,nipt=EXCLUDED.nipt,address=EXCLUDED.address,phone=EXCLUDED.phone,email=EXCLUDED.email,active=EXCLUDED.active,updated_at=NOW()`,[safeUuid(x.id),req.user.tenant_id,companyId,type,text(x.code)||null,text(x.name)||'Pa emër',text(x.nipt)||null,text(x.address)||null,text(x.city)||null,text(x.phone)||null,text(x.email)||null,x.active!==false]);counts.partners++;}} await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'LEGACY_MIGRATION',entityType:'migration',companyId,metadata:counts,ip:req.ip},client); await client.query('COMMIT'); emitTenant(req.user.tenant_id,'migration',{action:'completed',counts}); res.json({ok:true,counts}); } catch(e){await client.query('ROLLBACK');next(e);} finally{client.release();} });
}

async function accessibleIds(user,pool){ if(user.role==='SUPER_ADMIN'){const {rows}=await pool.query('SELECT id FROM companies WHERE tenant_id=$1',[user.tenant_id]);return rows.map(r=>r.id);} const {rows}=await pool.query('SELECT company_id AS id FROM user_companies WHERE user_id=$1',[user.id]);return rows.map(r=>r.id); }
function safeUuid(value){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''))?String(value):randomUUID(); }
