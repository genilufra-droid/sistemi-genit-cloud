import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const ENTITY_RULES = Object.freeze({
  FARMER: { roles: ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','MAGAZINIER','OPERATOR_PESHORE'], permission: 'masters.manage' },
  DRIVER: { roles: ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','MAGAZINIER'], permission: 'masters.manage' },
  ROUTE: { roles: ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','MAGAZINIER'], permission: 'masters.manage' },
  AGENT: { roles: ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER'], permission: 'masters.manage' },
  ASSET: { roles: ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER'], permission: 'masters.manage' },
  EXPENSE_CATEGORY: { roles: ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER'], permission: 'expenses.manage' },
  CASH_ACCOUNT: { roles: ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','ARKETAR'], permission: 'cash.manage' },
  BANK_ACCOUNT: { roles: ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER'], permission: 'bank.manage' },
});

const text = (value) => String(value ?? '').trim();
const entityType = (value) => text(value).toUpperCase().replace(/[^A-Z0-9_]+/g, '_');

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function ruleFor(value) {
  const key = entityType(value);
  const rule = ENTITY_RULES[key];
  if (!rule) throw requestError('Ky lloj master-data nuk mbështetet.', 404);
  return { key, ...rule };
}

function assertCreateRole(user, rule) {
  if (!rule.roles.includes(user.role)) throw requestError('Nuk keni leje krijimi për këtë regjistër.', 403);
}

function mapRow(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    entityType: row.entity_type,
    code: row.code || '',
    name: row.name,
    description: row.description || '',
    metadata: row.metadata || {},
    active: row.active !== false,
    version: Number(row.version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function migrateGlobalMasterData(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS global_master_records (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      entity_type VARCHAR(60) NOT NULL,
      code VARCHAR(100),
      name VARCHAR(220) NOT NULL,
      description TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      version BIGINT NOT NULL DEFAULT 1,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT global_master_entity_check CHECK (entity_type IN ('FARMER','DRIVER','ROUTE','AGENT','ASSET','EXPENSE_CATEGORY','CASH_ACCOUNT','BANK_ACCOUNT'))
    );
    CREATE INDEX IF NOT EXISTS idx_global_master_scope
      ON global_master_records(tenant_id,company_id,entity_type,active,name);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_global_master_code
      ON global_master_records(tenant_id,company_id,entity_type,LOWER(code))
      WHERE code IS NOT NULL AND BTRIM(code) <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS uq_global_master_name
      ON global_master_records(tenant_id,company_id,entity_type,LOWER(name));
  `);
}

export function installGlobalMasterDataRoutes({ app, pool, authRequired, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant }) {
  const createSchema = z.object({
    companyId: z.string().uuid(),
    code: z.string().trim().max(100).optional().default(''),
    name: z.string().trim().min(2).max(220),
    description: z.string().trim().max(3000).optional().default(''),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
    active: z.boolean().optional().default(true),
  });
  const updateSchema = createSchema.omit({ companyId: true }).extend({ version: z.coerce.number().int().positive().optional() });

  app.get('/api/master-data/capabilities', authRequired, (req, res) => {
    const capabilities = Object.entries(ENTITY_RULES).map(([key, rule]) => ({
      entityType: key,
      permission: rule.permission,
      canCreate: rule.roles.includes(req.user.role),
    }));
    res.json(capabilities);
  });

  app.get('/api/master-data/:entityType', authRequired, async (req, res, next) => {
    try {
      const rule = ruleFor(req.params.entityType);
      const companyIds = await accessibleCompanyIds(req.user);
      if (!companyIds.length) return res.json([]);
      const requestedCompanyId = text(req.query.companyId);
      if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) throw requestError('Nuk keni akses në këtë kompani.', 403);
      const q = text(req.query.q);
      const activeOnly = String(req.query.activeOnly ?? 'true').toLowerCase() !== 'false';
      const params = [req.user.tenant_id, requestedCompanyId ? [requestedCompanyId] : companyIds, rule.key];
      let filter = '';
      if (q) {
        params.push(`%${q}%`);
        filter += ` AND (name ILIKE $${params.length} OR COALESCE(code,'') ILIKE $${params.length} OR COALESCE(description,'') ILIKE $${params.length})`;
      }
      if (activeOnly) filter += ' AND active=TRUE';
      const { rows } = await pool.query(`
        SELECT * FROM global_master_records
        WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) AND entity_type=$3${filter}
        ORDER BY active DESC,name,code LIMIT 250`, params);
      res.json(rows.map(mapRow));
    } catch (error) { next(error); }
  });

  app.post('/api/master-data/:entityType', authRequired, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const rule = ruleFor(req.params.entityType);
      assertCreateRole(req.user, rule);
      const input = createSchema.parse(req.body);
      await client.query('BEGIN');
      await assertCompanyAccess(req.user, input.companyId, client);
      const id = randomUUID();
      const { rows } = await client.query(`
        INSERT INTO global_master_records
          (id,tenant_id,company_id,entity_type,code,name,description,metadata,active,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$10)
        RETURNING *`,
      [id, req.user.tenant_id, input.companyId, rule.key, input.code || null, input.name, input.description || null, JSON.stringify(input.metadata || {}), input.active, req.user.id]);
      await audit({
        tenantId: req.user.tenant_id, userId: req.user.id, action: 'MASTER_DATA_CREATE',
        entityType: `master_${rule.key.toLowerCase()}`, entityId: id, companyId: input.companyId,
        metadata: { entityType: rule.key, code: input.code, name: input.name }, ip: req.ip,
      }, client);
      await client.query(`INSERT INTO cloud_change_events(tenant_id,company_id,entity_type,entity_id,operation,metadata,user_id)
        VALUES($1,$2,$3,$4,'CREATE',$5::jsonb,$6)`,
      [req.user.tenant_id, input.companyId, `master_${rule.key.toLowerCase()}`, id, JSON.stringify({ code: input.code, name: input.name }), req.user.id]);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id, 'masterData', { action: 'created', entityType: rule.key, id });
      res.status(201).json(mapRow(rows[0]));
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally { client.release(); }
  });

  app.patch('/api/master-data/:entityType/:id', authRequired, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const rule = ruleFor(req.params.entityType);
      assertCreateRole(req.user, rule);
      const input = updateSchema.parse(req.body);
      await client.query('BEGIN');
      const currentResult = await client.query(
        'SELECT * FROM global_master_records WHERE id=$1 AND tenant_id=$2 AND entity_type=$3 FOR UPDATE',
        [req.params.id, req.user.tenant_id, rule.key],
      );
      const current = currentResult.rows[0];
      if (!current) throw requestError('Rekordi nuk u gjet.', 404);
      await assertCompanyAccess(req.user, current.company_id, client);
      if (input.version && Number(input.version) !== Number(current.version)) throw requestError('Rekordi është ndryshuar nga një përdorues tjetër. Rifreskoje dhe provo përsëri.', 409);
      const { rows } = await client.query(`
        UPDATE global_master_records SET code=$1,name=$2,description=$3,metadata=$4::jsonb,active=$5,
          version=version+1,updated_by=$6,updated_at=NOW()
        WHERE id=$7 RETURNING *`,
      [input.code || null, input.name, input.description || null, JSON.stringify(input.metadata || {}), input.active, req.user.id, current.id]);
      await audit({
        tenantId: req.user.tenant_id, userId: req.user.id, action: 'MASTER_DATA_UPDATE',
        entityType: `master_${rule.key.toLowerCase()}`, entityId: current.id, companyId: current.company_id,
        metadata: { entityType: rule.key, code: input.code, name: input.name }, ip: req.ip,
      }, client);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id, 'masterData', { action: 'updated', entityType: rule.key, id: current.id });
      res.json(mapRow(rows[0]));
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally { client.release(); }
  });
}
