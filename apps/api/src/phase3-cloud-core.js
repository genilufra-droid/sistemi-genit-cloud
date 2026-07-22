import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const ADMIN_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN'];
const ALL_ROLES = [
  'SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'FINANCIER', 'MAGAZINIER',
  'OPERATOR_PESHORE', 'SHITES', 'ARKETAR', 'AUDITOR', 'READ_ONLY',
];
const LOWER_ROLES = ['MANAGER', 'FINANCIER', 'MAGAZINIER', 'OPERATOR_PESHORE', 'SHITES', 'ARKETAR', 'AUDITOR', 'READ_ONLY'];

const clean = (value) => String(value ?? '').trim();
const lower = (value) => clean(value).toLowerCase();

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function migratePhase3CloudCore(db) {
  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
    ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
    ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
    ALTER TABLE business_partners ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
    ALTER TABLE weight_tickets ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
    ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

    CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      setting_key VARCHAR(120) NOT NULL,
      setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
      version BIGINT NOT NULL DEFAULT 1,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, setting_key)
    );

    CREATE TABLE IF NOT EXISTS cloud_change_events (
      id BIGSERIAL PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      entity_type VARCHAR(80) NOT NULL,
      entity_id UUID,
      operation VARCHAR(20) NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE','POST','CANCEL','STATUS')),
      entity_version BIGINT NOT NULL DEFAULT 1,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cloud_changes_tenant_id ON cloud_change_events(tenant_id, id);
    CREATE INDEX IF NOT EXISTS idx_cloud_changes_company_id ON cloud_change_events(tenant_id, company_id, id);

    CREATE TABLE IF NOT EXISTS api_idempotency_keys (
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      route_key VARCHAR(160) NOT NULL,
      request_key VARCHAR(180) NOT NULL,
      response_status INTEGER NOT NULL,
      response_body JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
      PRIMARY KEY (tenant_id, user_id, route_key, request_key)
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON api_idempotency_keys(expires_at);
  `);
}

function safeUser(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    fullName: row.full_name,
    username: row.username,
    email: row.email,
    role: row.role,
    active: row.active,
    mustChangePassword: Boolean(row.must_change_password),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    version: Number(row.version || 1),
  };
}

async function assertUserAccess(client, actor, targetUserId, accessibleCompanyIds) {
  const { rows } = await client.query(
    `SELECT id,tenant_id,full_name,username,email,role,active,must_change_password,last_login_at,created_at,version
     FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
    [targetUserId, actor.tenant_id],
  );
  const target = rows[0];
  if (!target) throw requestError('Përdoruesi nuk u gjet.', 404);
  if (actor.role === 'SUPER_ADMIN') return target;
  const ownCompanyIds = await accessibleCompanyIds(actor, client);
  const membership = await client.query(
    'SELECT 1 FROM user_companies WHERE user_id=$1 AND company_id=ANY($2::uuid[]) LIMIT 1',
    [target.id, ownCompanyIds],
  );
  if (!membership.rows.length) throw requestError('Përdoruesi nuk i përket kompanive tuaja.', 403);
  if (!LOWER_ROLES.includes(target.role)) throw requestError('Nuk mund të ndryshoni këtë përdorues.', 403);
  return target;
}

async function replaceMemberships(client, tenantId, userId, companyIds, warehouseIds) {
  if (!companyIds.length) throw requestError('Përdoruesi duhet të ketë të paktën një kompani.', 400);
  const companies = await client.query(
    'SELECT id FROM companies WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND active=TRUE',
    [tenantId, companyIds],
  );
  if (companies.rows.length !== companyIds.length) throw requestError('Një kompani e zgjedhur nuk është e vlefshme.', 400);

  let validWarehouseIds = [];
  if (warehouseIds.length) {
    const warehouses = await client.query(
      `SELECT id FROM warehouses
       WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND company_id=ANY($3::uuid[]) AND active=TRUE`,
      [tenantId, warehouseIds, companyIds],
    );
    validWarehouseIds = warehouses.rows.map((row) => row.id);
    if (validWarehouseIds.length !== warehouseIds.length) throw requestError('Një magazinë nuk i përket kompanive të zgjedhura.', 400);
  }

  await client.query('DELETE FROM user_companies WHERE user_id=$1', [userId]);
  await client.query('DELETE FROM user_warehouses WHERE user_id=$1', [userId]);
  for (const companyId of companyIds) {
    await client.query('INSERT INTO user_companies(user_id,company_id) VALUES($1,$2)', [userId, companyId]);
  }
  for (const warehouseId of validWarehouseIds) {
    await client.query('INSERT INTO user_warehouses(user_id,warehouse_id) VALUES($1,$2)', [userId, warehouseId]);
  }
}

export function installPhase3CloudCoreRoutes({
  app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant,
}) {
  const updateUserSchema = z.object({
    fullName: z.string().trim().min(2).max(180),
    username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/),
    email: z.string().trim().email().optional().or(z.literal('')),
    role: z.enum(ALL_ROLES),
    active: z.boolean(),
    companyIds: z.array(z.string().uuid()).min(1),
    warehouseIds: z.array(z.string().uuid()).default([]),
  });
  const resetPasswordSchema = z.object({
    password: z.string().min(8).max(128),
    mustChangePassword: z.boolean().default(true),
  });
  const changePasswordSchema = z.object({
    oldPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  });

  app.get('/api/cloud/capabilities', authRequired, async (req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT COALESCE(MAX(id),0)::bigint AS revision FROM cloud_change_events WHERE tenant_id=$1', [req.user.tenant_id]);
      res.json({
        mode: 'CLOUD_POSTGRESQL', sourceOfTruth: 'POSTGRESQL', multiUser: true, tenantIsolation: true,
        serverAuthentication: true, optimisticVersioning: true, realtime: true, offlineCacheOnly: true,
        revision: Number(rows[0].revision || 0), serverTime: new Date().toISOString(),
      });
    } catch (error) { next(error); }
  });

  app.get('/api/cloud/bootstrap', authRequired, async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const companyIds = await accessibleCompanyIds(req.user, client);
      if (!companyIds.length) {
        await client.query('COMMIT');
        return res.json({ user: safeUser(req.user), access: { companyIds: [], warehouseIds: [] }, companies: [], warehouses: [], categories: [], products: [], partners: [], weights: [], stock: [], documents: [], users: [], audit: [], revision: 0, serverTime: new Date().toISOString() });
      }

      const companyResult = await client.query(
        `SELECT id,name,nipt,address,phone,email,currency,active,created_at,updated_at,version
         FROM companies WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY name`,
        [req.user.tenant_id, companyIds],
      );

      let warehouseResult;
      if (req.user.role === 'SUPER_ADMIN') {
        warehouseResult = await client.query(
          `SELECT id,company_id,name,code,address,active,created_at,updated_at,version
           FROM warehouses WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) ORDER BY name`,
          [req.user.tenant_id, companyIds],
        );
      } else {
        warehouseResult = await client.query(
          `SELECT w.id,w.company_id,w.name,w.code,w.address,w.active,w.created_at,w.updated_at,w.version
           FROM warehouses w INNER JOIN user_warehouses uw ON uw.warehouse_id=w.id
           WHERE uw.user_id=$1 AND w.tenant_id=$2 AND w.company_id=ANY($3::uuid[]) ORDER BY w.name`,
          [req.user.id, req.user.tenant_id, companyIds],
        );
      }
      const warehouseIds = warehouseResult.rows.map((row) => row.id);

      const [categories, products, partners, weights, stock, documents, users, auditRows, revision] = await Promise.all([
        client.query('SELECT * FROM product_categories WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) ORDER BY active DESC,name', [req.user.tenant_id, companyIds]),
        client.query(`SELECT p.*,c.name AS category_name
          FROM products p LEFT JOIN product_categories c ON c.id=p.category_id
          WHERE p.tenant_id=$1 AND p.company_id=ANY($2::uuid[]) ORDER BY p.active DESC,p.name`, [req.user.tenant_id, companyIds]),
        client.query('SELECT * FROM business_partners WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) ORDER BY active DESC,name', [req.user.tenant_id, companyIds]),
        client.query(`SELECT wt.*,p.name AS product_name,bp.name AS supplier_name,w.name AS warehouse_name
          FROM weight_tickets wt JOIN products p ON p.id=wt.product_id
          LEFT JOIN business_partners bp ON bp.id=wt.supplier_id JOIN warehouses w ON w.id=wt.warehouse_id
          WHERE wt.tenant_id=$1 AND wt.company_id=ANY($2::uuid[]) ORDER BY wt.document_date DESC,wt.created_at DESC`, [req.user.tenant_id, companyIds]),
        client.query(`SELECT sm.company_id,sm.warehouse_id,sm.product_id,p.code,p.name,p.base_unit,
          SUM(sm.quantity_base)::numeric AS quantity_base
          FROM stock_movements sm JOIN products p ON p.id=sm.product_id
          WHERE sm.tenant_id=$1 AND sm.company_id=ANY($2::uuid[])
          GROUP BY sm.company_id,sm.warehouse_id,sm.product_id,p.code,p.name,p.base_unit ORDER BY p.name`, [req.user.tenant_id, companyIds]),
        client.query(`SELECT d.id,d.tenant_id,d.company_id,d.warehouse_id,d.partner_id,d.doc_type,d.document_no,d.document_date,
          d.status,d.notes,d.total_net,d.total_vat,d.total_amount,d.created_at,d.updated_at,d.version,
          bp.name AS partner_name,
          COALESCE(jsonb_agg(jsonb_build_object(
            'id',i.id,'product_id',i.product_id,'description',i.description,'unit',i.unit,'coefficient',i.coefficient,
            'quantity',i.quantity,'free_quantity',i.free_quantity,'unit_price',i.unit_price,'vat_rate',i.vat_rate,
            'line_net',i.line_net,'line_vat',i.line_vat,'line_total',i.line_total
          ) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
          FROM business_documents d LEFT JOIN business_partners bp ON bp.id=d.partner_id
          LEFT JOIN business_document_items i ON i.document_id=d.id
          WHERE d.tenant_id=$1 AND d.company_id=ANY($2::uuid[])
          GROUP BY d.id,bp.name ORDER BY d.document_date DESC,d.created_at DESC`, [req.user.tenant_id, companyIds]),
        ADMIN_ROLES.includes(req.user.role)
          ? client.query(`SELECT u.id,u.tenant_id,u.full_name,u.username,u.email,u.role,u.active,u.must_change_password,u.last_login_at,u.created_at,u.version,
              COALESCE(array_agg(DISTINCT uc.company_id) FILTER (WHERE uc.company_id IS NOT NULL),'{}') AS company_ids,
              COALESCE(array_agg(DISTINCT uw.warehouse_id) FILTER (WHERE uw.warehouse_id IS NOT NULL),'{}') AS warehouse_ids
            FROM users u LEFT JOIN user_companies uc ON uc.user_id=u.id LEFT JOIN user_warehouses uw ON uw.user_id=u.id
            WHERE u.tenant_id=$1 GROUP BY u.id ORDER BY u.full_name`, [req.user.tenant_id])
          : Promise.resolve({ rows: [] }),
        client.query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.company_id,a.metadata,a.created_at,u.full_name AS user_name,u.username
          FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
          WHERE a.tenant_id=$1 AND (a.company_id IS NULL OR a.company_id=ANY($2::uuid[]))
          ORDER BY a.created_at DESC LIMIT 100`, [req.user.tenant_id, companyIds]),
        client.query('SELECT COALESCE(MAX(id),0)::bigint AS revision FROM cloud_change_events WHERE tenant_id=$1', [req.user.tenant_id]),
      ]);

      await client.query('COMMIT');
      res.json({
        user: safeUser(req.user),
        access: { companyIds, warehouseIds },
        companies: companyResult.rows,
        warehouses: warehouseResult.rows,
        categories: categories.rows,
        products: products.rows,
        partners: partners.rows,
        weights: weights.rows,
        stock: stock.rows,
        documents: documents.rows,
        users: users.rows,
        audit: auditRows.rows,
        revision: Number(revision.rows[0].revision || 0),
        serverTime: new Date().toISOString(),
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally { client.release(); }
  });

  app.patch('/api/cloud/users/:id', authRequired, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const input = updateUserSchema.parse(req.body);
      await client.query('BEGIN');
      const target = await assertUserAccess(client, req.user, req.params.id, accessibleCompanyIds);
      if (target.id === req.user.id && input.active === false) throw requestError('Nuk mund të çaktivizoni llogarinë tuaj.', 400);
      if (req.user.role === 'COMPANY_ADMIN' && !LOWER_ROLES.includes(input.role)) throw requestError('Administratori i kompanisë mund të caktojë vetëm role operative.', 403);

      const ownCompanies = await accessibleCompanyIds(req.user, client);
      if (input.companyIds.some((id) => !ownCompanies.includes(id))) throw requestError('Një kompani e zgjedhur nuk është në aksesin tuaj.', 403);
      await replaceMemberships(client, req.user.tenant_id, target.id, input.companyIds, input.warehouseIds);

      const { rows } = await client.query(
        `UPDATE users SET full_name=$1,username=$2,email=$3,role=$4,active=$5,version=version+1,updated_at=NOW()
         WHERE id=$6 AND tenant_id=$7
         RETURNING id,tenant_id,full_name,username,email,role,active,must_change_password,last_login_at,created_at,version`,
        [input.fullName, lower(input.username), input.email || null, input.role, input.active, target.id, req.user.tenant_id],
      );
      await audit({ tenantId:req.user.tenant_id,userId:req.user.id,action:'USER_UPDATE_CLOUD',entityType:'user',entityId:target.id,metadata:{role:input.role,active:input.active,companyIds:input.companyIds,warehouseIds:input.warehouseIds},ip:req.ip }, client);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id, 'users', { action:'updated', id:target.id });
      res.json(safeUser(rows[0]));
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/cloud/users/:id/reset-password', authRequired, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const input = resetPasswordSchema.parse(req.body);
      await client.query('BEGIN');
      const target = await assertUserAccess(client, req.user, req.params.id, accessibleCompanyIds);
      const hash = await bcrypt.hash(input.password, 12);
      await client.query(
        `UPDATE users SET password_hash=$1,must_change_password=$2,password_changed_at=NOW(),version=version+1,updated_at=NOW()
         WHERE id=$3 AND tenant_id=$4`,
        [hash, input.mustChangePassword, target.id, req.user.tenant_id],
      );
      await audit({ tenantId:req.user.tenant_id,userId:req.user.id,action:'PASSWORD_RESET_CLOUD',entityType:'user',entityId:target.id,metadata:{mustChangePassword:input.mustChangePassword},ip:req.ip }, client);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id, 'users', { action:'password-reset', id:target.id });
      res.json({ ok:true });
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/cloud/auth/change-password', authRequired, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const input = changePasswordSchema.parse(req.body);
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT id,password_hash FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [req.user.id, req.user.tenant_id]);
      if (!rows[0] || !(await bcrypt.compare(input.oldPassword, rows[0].password_hash))) throw requestError('Fjalëkalimi aktual është i pasaktë.', 400);
      const hash = await bcrypt.hash(input.newPassword, 12);
      await client.query(
        `UPDATE users SET password_hash=$1,must_change_password=FALSE,password_changed_at=NOW(),version=version+1,updated_at=NOW()
         WHERE id=$2 AND tenant_id=$3`, [hash, req.user.id, req.user.tenant_id],
      );
      await audit({ tenantId:req.user.tenant_id,userId:req.user.id,action:'PASSWORD_CHANGE_CLOUD',entityType:'user',entityId:req.user.id,metadata:{},ip:req.ip }, client);
      await client.query('COMMIT');
      res.json({ ok:true });
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.get('/api/cloud/changes', authRequired, async (req, res, next) => {
    try {
      const after = Math.max(0, Number(req.query.after || 0));
      const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 500);
      const companyIds = await accessibleCompanyIds(req.user);
      const { rows } = await pool.query(
        `SELECT id,company_id,entity_type,entity_id,operation,entity_version,metadata,user_id,created_at
         FROM cloud_change_events
         WHERE tenant_id=$1 AND id>$2 AND (company_id IS NULL OR company_id=ANY($3::uuid[]))
         ORDER BY id ASC LIMIT $4`,
        [req.user.tenant_id, after, companyIds, limit],
      );
      res.json({ changes: rows, nextCursor: rows.length ? Number(rows[rows.length - 1].id) : after });
    } catch (error) { next(error); }
  });
}
