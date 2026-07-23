import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import { installPhase2Routes, migratePhase2 } from './phase2.js';
import { installPhase2DocumentRoutes, migratePhase2Documents } from './phase2-documents.js';
import { installPhase3CloudCoreRoutes, migratePhase3CloudCore } from './phase3-cloud-core.js';
import { installPhase4TraceabilityRoutes, migratePhase4Traceability } from './phase4-traceability.js';
import { installPhase4ProcessingPackagingRoutes, migratePhase4ProcessingPackaging } from './phase4-processing-packaging.js';

const { Pool } = pg;
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

if (!DATABASE_URL) throw new Error('DATABASE_URL mungon. Shtoje te Railway > genit-api > Variables.');
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET mungon ose është më i shkurtër se 32 karaktere.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 12,
  idleTimeoutMillis: 30000,
});

const ROLES = [
  'SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'FINANCIER', 'MAGAZINIER',
  'OPERATOR_PESHORE', 'SHITES', 'ARKETAR', 'AUDITOR', 'READ_ONLY',
];
const ADMIN_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN'];
const LOWER_ROLES = ['MANAGER', 'FINANCIER', 'MAGAZINIER', 'OPERATOR_PESHORE', 'SHITES', 'ARKETAR', 'AUDITOR', 'READ_ONLY'];

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const cleanText = (value) => String(value ?? '').trim();
const lowerText = (value) => cleanText(value).toLowerCase();
const nowIso = () => new Date().toISOString();

function allowedOrigins() {
  if (CORS_ORIGIN === '*') return '*';
  return CORS_ORIGIN.split(',').map((v) => v.trim()).filter(Boolean);
}

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        code VARCHAR(40) NOT NULL UNIQUE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(180) NOT NULL,
        nipt VARCHAR(40),
        address TEXT,
        phone VARCHAR(60),
        email VARCHAR(160),
        currency VARCHAR(8) NOT NULL DEFAULT 'ALL',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, name)
      );
      CREATE TABLE IF NOT EXISTS warehouses (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(180) NOT NULL,
        code VARCHAR(50) NOT NULL,
        address TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, company_id, code)
      );
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        full_name VARCHAR(180) NOT NULL,
        username VARCHAR(80) NOT NULL UNIQUE,
        email VARCHAR(180) UNIQUE,
        password_hash TEXT NOT NULL,
        role VARCHAR(40) NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','OPERATOR_PESHORE','SHITES','ARKETAR','AUDITOR','READ_ONLY'))
      );
      CREATE TABLE IF NOT EXISTS user_companies (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, company_id)
      );
      CREATE TABLE IF NOT EXISTS user_warehouses (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, warehouse_id)
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(80) NOT NULL,
        entity_id UUID,
        company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        ip_address VARCHAR(80),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_companies_tenant ON companies(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_warehouses_tenant_company ON warehouses(tenant_id, company_id);
      CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs(tenant_id, created_at DESC);
    `);
    await migratePhase2(client);
    await migratePhase2Documents(client);
    await migratePhase3CloudCore(client);
    await migratePhase4Traceability(client);
    await migratePhase4ProcessingPackaging(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function signUser(user) {
  return jwt.sign(
    { sub: user.id, tenantId: user.tenant_id, role: user.role, username: user.username },
    JWT_SECRET,
    { expiresIn: '12h', issuer: 'sistemi-genit-cloud' },
  );
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Duhet të identifikoheni.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: 'sistemi-genit-cloud' });
    const { rows } = await pool.query(
      `SELECT id, tenant_id, full_name, username, email, role, active
       FROM users WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
      [payload.sub, payload.tenantId],
    );
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'USER_DISABLED', message: 'Përdoruesi është çaktivizuar.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Sesioni ka skaduar. Hyni përsëri.' });
  }
}

const requireRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Nuk keni leje për këtë veprim.' });
  }
  next();
};

async function accessibleCompanyIds(user, client = pool) {
  if (user.role === 'SUPER_ADMIN') {
    const { rows } = await client.query('SELECT id FROM companies WHERE tenant_id=$1', [user.tenant_id]);
    return rows.map((r) => r.id);
  }
  const { rows } = await client.query(
    `SELECT c.id FROM companies c
     INNER JOIN user_companies uc ON uc.company_id=c.id
     WHERE uc.user_id=$1 AND c.tenant_id=$2`,
    [user.id, user.tenant_id],
  );
  return rows.map((r) => r.id);
}

async function assertCompanyAccess(user, companyId, client = pool) {
  const ids = await accessibleCompanyIds(user, client);
  if (!ids.includes(companyId)) {
    const error = new Error('Nuk keni akses në këtë kompani.');
    error.status = 403;
    throw error;
  }
}

async function audit({ tenantId, userId, action, entityType, entityId = null, companyId = null, metadata = {}, ip = null }, client = pool) {
  await client.query(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, company_id, metadata, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
    [randomUUID(), tenantId, userId, action, entityType, entityId, companyId, JSON.stringify(metadata), ip],
  );
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
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

const setupSchema = z.object({
  organizationName: z.string().trim().min(2).max(160),
  companyName: z.string().trim().min(2).max(180),
  companyNipt: z.string().trim().max(40).optional().default(''),
  warehouseName: z.string().trim().min(2).max(180),
  adminName: z.string().trim().min(2).max(180),
  username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().trim().email().optional().or(z.literal('')),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const companySchema = z.object({
  name: z.string().trim().min(2).max(180),
  nipt: z.string().trim().max(40).optional().default(''),
  address: z.string().trim().max(500).optional().default(''),
  phone: z.string().trim().max(60).optional().default(''),
  email: z.string().trim().email().optional().or(z.literal('')),
  currency: z.string().trim().min(3).max(8).default('ALL'),
});

const warehouseSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().trim().min(2).max(180),
  code: z.string().trim().min(1).max(50),
  address: z.string().trim().max(500).optional().default(''),
});

const userSchema = z.object({
  fullName: z.string().trim().min(2).max(180),
  username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().trim().email().optional().or(z.literal('')),
  password: z.string().min(8).max(128),
  role: z.enum(ROLES),
  companyIds: z.array(z.string().uuid()).default([]),
  warehouseIds: z.array(z.string().uuid()).default([]),
});

const app = express();
const server = http.createServer(app);
const corsOptions = {
  origin: allowedOrigins(),
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

const io = new SocketIOServer(server, { cors: corsOptions, transports: ['websocket', 'polling'] });
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) throw new Error('Token mungon');
    const payload = jwt.verify(token, JWT_SECRET, { issuer: 'sistemi-genit-cloud' });
    const { rows } = await pool.query('SELECT id, tenant_id, role, active FROM users WHERE id=$1 AND tenant_id=$2', [payload.sub, payload.tenantId]);
    if (!rows[0]?.active) throw new Error('Përdorues joaktiv');
    socket.data.user = rows[0];
    next();
  } catch (error) {
    next(error);
  }
});
io.on('connection', (socket) => {
  socket.join(`tenant:${socket.data.user.tenant_id}`);
  socket.emit('system:connected', { at: nowIso() });
});

function emitTenant(tenantId, entity, data) {
  io.to(`tenant:${tenantId}`).emit('entity:update', { entity, data, at: nowIso() });
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', service: 'Sistemi Genit API', time: nowIso() });
}));

app.get('/api/setup/status', asyncRoute(async (_req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  res.json({ needsSetup: rows[0].count === 0 });
}));

app.post('/api/setup/admin', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 }), asyncRoute(async (req, res) => {
  const input = setupSchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT COUNT(*)::int AS count FROM users');
    if (existing.rows[0].count > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'SETUP_LOCKED', message: 'Administratori i parë është krijuar tashmë.' });
    }
    const tenantId = randomUUID();
    const companyId = randomUUID();
    const warehouseId = randomUUID();
    const userId = randomUUID();
    const code = `GENIT-${Date.now().toString(36).toUpperCase()}`;
    const passwordHash = await bcrypt.hash(input.password, 12);
    await client.query('INSERT INTO tenants (id,name,code) VALUES ($1,$2,$3)', [tenantId, input.organizationName, code]);
    await client.query(
      `INSERT INTO companies (id,tenant_id,name,nipt,currency) VALUES ($1,$2,$3,$4,'ALL')`,
      [companyId, tenantId, input.companyName, input.companyNipt || null],
    );
    await client.query(
      `INSERT INTO warehouses (id,tenant_id,company_id,name,code) VALUES ($1,$2,$3,$4,$5)`,
      [warehouseId, tenantId, companyId, input.warehouseName, 'MQ'],
    );
    await client.query(
      `INSERT INTO users (id,tenant_id,full_name,username,email,password_hash,role)
       VALUES ($1,$2,$3,$4,$5,$6,'SUPER_ADMIN')`,
      [userId, tenantId, input.adminName, lowerText(input.username), input.email || null, passwordHash],
    );
    await client.query('INSERT INTO user_companies (user_id,company_id) VALUES ($1,$2)', [userId, companyId]);
    await client.query('INSERT INTO user_warehouses (user_id,warehouse_id) VALUES ($1,$2)', [userId, warehouseId]);
    await audit({ tenantId, userId, action: 'SYSTEM_SETUP', entityType: 'tenant', entityId: tenantId, companyId, metadata: { organizationName: input.organizationName }, ip: req.ip }, client);
    await client.query('COMMIT');
    const user = { id: userId, tenant_id: tenantId, full_name: input.adminName, username: lowerText(input.username), email: input.email || null, role: 'SUPER_ADMIN', active: true };
    res.status(201).json({ token: signUser(user), user: safeUser(user), companyId, warehouseId });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }), asyncRoute(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const login = lowerText(input.username);
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE lower(username)=$1 OR lower(coalesce(email,''))=$1 LIMIT 1`,
    [login],
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Përdoruesi ose fjalëkalimi nuk është i saktë.' });
  }
  if (!user.active) return res.status(403).json({ error: 'USER_DISABLED', message: 'Përdoruesi është çaktivizuar.' });
  await pool.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
  await audit({ tenantId: user.tenant_id, userId: user.id, action: 'LOGIN', entityType: 'user', entityId: user.id, metadata: {}, ip: req.ip });
  res.json({ token: signUser(user), user: safeUser(user) });
}));

app.get('/api/auth/me', authRequired, asyncRoute(async (req, res) => {
  const companyIds = await accessibleCompanyIds(req.user);
  const { rows: warehouses } = await pool.query(
    `SELECT w.id FROM warehouses w INNER JOIN user_warehouses uw ON uw.warehouse_id=w.id
     WHERE uw.user_id=$1 AND w.tenant_id=$2`,
    [req.user.id, req.user.tenant_id],
  );
  res.json({ user: safeUser(req.user), companyIds, warehouseIds: warehouses.map((r) => r.id) });
}));

app.get('/api/meta/roles', authRequired, (_req, res) => res.json({ roles: ROLES }));

app.get('/api/dashboard', authRequired, asyncRoute(async (req, res) => {
  const companyIds = await accessibleCompanyIds(req.user);
  const companyCount = companyIds.length;
  const warehouseResult = companyIds.length
    ? await pool.query('SELECT COUNT(*)::int AS count FROM warehouses WHERE tenant_id=$1 AND company_id = ANY($2::uuid[]) AND active=TRUE', [req.user.tenant_id, companyIds])
    : { rows: [{ count: 0 }] };
  const userResult = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE tenant_id=$1 AND active=TRUE', [req.user.tenant_id]);
  const auditResult = await pool.query('SELECT COUNT(*)::int AS count FROM audit_logs WHERE tenant_id=$1 AND created_at >= CURRENT_DATE', [req.user.tenant_id]);
  res.json({
    companies: companyCount,
    warehouses: warehouseResult.rows[0].count,
    activeUsers: userResult.rows[0].count,
    actionsToday: auditResult.rows[0].count,
    phase: 'Cloud Core 1.0',
  });
}));

app.get('/api/companies', authRequired, asyncRoute(async (req, res) => {
  const ids = await accessibleCompanyIds(req.user);
  if (!ids.length) return res.json([]);
  const { rows } = await pool.query(
    `SELECT id, name, nipt, address, phone, email, currency, active, created_at
     FROM companies WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY name`,
    [req.user.tenant_id, ids],
  );
  res.json(rows);
}));

app.post('/api/companies', authRequired, requireRoles('SUPER_ADMIN'), asyncRoute(async (req, res) => {
  const input = companySchema.parse(req.body);
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO companies (id,tenant_id,name,nipt,address,phone,email,currency)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, req.user.tenant_id, input.name, input.nipt || null, input.address || null, input.phone || null, input.email || null, input.currency.toUpperCase()],
  );
  await pool.query('INSERT INTO user_companies (user_id,company_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, id]);
  await audit({ tenantId: req.user.tenant_id, userId: req.user.id, action: 'COMPANY_CREATE', entityType: 'company', entityId: id, companyId: id, metadata: { name: input.name }, ip: req.ip });
  emitTenant(req.user.tenant_id, 'companies', { action: 'created', id });
  res.status(201).json(rows[0]);
}));

app.patch('/api/companies/:id', authRequired, requireRoles('SUPER_ADMIN'), asyncRoute(async (req, res) => {
  const input = companySchema.partial().parse(req.body);
  const { rows: existingRows } = await pool.query('SELECT * FROM companies WHERE id=$1 AND tenant_id=$2', [req.params.id, req.user.tenant_id]);
  if (!existingRows[0]) return res.status(404).json({ error: 'NOT_FOUND', message: 'Kompania nuk u gjet.' });
  const next = { ...existingRows[0], ...input, updated_at: new Date() };
  const { rows } = await pool.query(
    `UPDATE companies SET name=$1,nipt=$2,address=$3,phone=$4,email=$5,currency=$6,updated_at=NOW()
     WHERE id=$7 AND tenant_id=$8 RETURNING *`,
    [next.name, next.nipt || null, next.address || null, next.phone || null, next.email || null, String(next.currency || 'ALL').toUpperCase(), req.params.id, req.user.tenant_id],
  );
  await audit({ tenantId: req.user.tenant_id, userId: req.user.id, action: 'COMPANY_UPDATE', entityType: 'company', entityId: req.params.id, companyId: req.params.id, metadata: input, ip: req.ip });
  emitTenant(req.user.tenant_id, 'companies', { action: 'updated', id: req.params.id });
  res.json(rows[0]);
}));

app.get('/api/warehouses', authRequired, asyncRoute(async (req, res) => {
  const ids = await accessibleCompanyIds(req.user);
  if (!ids.length) return res.json([]);
  const { rows } = await pool.query(
    `SELECT w.id,w.company_id,w.name,w.code,w.address,w.active,w.created_at,c.name AS company_name
     FROM warehouses w INNER JOIN companies c ON c.id=w.company_id
     WHERE w.tenant_id=$1 AND w.company_id=ANY($2::uuid[])
     ORDER BY c.name,w.name`,
    [req.user.tenant_id, ids],
  );
  res.json(rows);
}));

app.post('/api/warehouses', authRequired, requireRoles(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const input = warehouseSchema.parse(req.body);
  await assertCompanyAccess(req.user, input.companyId);
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO warehouses (id,tenant_id,company_id,name,code,address)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [id, req.user.tenant_id, input.companyId, input.name, input.code.toUpperCase(), input.address || null],
  );
  await pool.query('INSERT INTO user_warehouses (user_id,warehouse_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, id]);
  await audit({ tenantId: req.user.tenant_id, userId: req.user.id, action: 'WAREHOUSE_CREATE', entityType: 'warehouse', entityId: id, companyId: input.companyId, metadata: { name: input.name, code: input.code }, ip: req.ip });
  emitTenant(req.user.tenant_id, 'warehouses', { action: 'created', id });
  res.status(201).json(rows[0]);
}));

app.patch('/api/warehouses/:id', authRequired, requireRoles(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM warehouses WHERE id=$1 AND tenant_id=$2', [req.params.id, req.user.tenant_id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Magazina nuk u gjet.' });
  await assertCompanyAccess(req.user, existing.company_id);
  const input = warehouseSchema.omit({ companyId: true }).partial().extend({ active: z.boolean().optional() }).parse(req.body);
  const next = { ...existing, ...input };
  const { rows } = await pool.query(
    `UPDATE warehouses SET name=$1,code=$2,address=$3,active=$4,updated_at=NOW()
     WHERE id=$5 AND tenant_id=$6 RETURNING *`,
    [next.name, String(next.code).toUpperCase(), next.address || null, next.active, req.params.id, req.user.tenant_id],
  );
  await audit({ tenantId: req.user.tenant_id, userId: req.user.id, action: 'WAREHOUSE_UPDATE', entityType: 'warehouse', entityId: req.params.id, companyId: existing.company_id, metadata: input, ip: req.ip });
  emitTenant(req.user.tenant_id, 'warehouses', { action: 'updated', id: req.params.id });
  res.json(rows[0]);
}));

app.get('/api/users', authRequired, requireRoles(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const companyIds = await accessibleCompanyIds(req.user);
  const params = [req.user.tenant_id];
  let where = 'u.tenant_id=$1';
  if (req.user.role !== 'SUPER_ADMIN') {
    params.push(companyIds);
    where += ` AND EXISTS (SELECT 1 FROM user_companies ux WHERE ux.user_id=u.id AND ux.company_id=ANY($2::uuid[]))`;
  }
  const { rows } = await pool.query(
    `SELECT u.id,u.full_name,u.username,u.email,u.role,u.active,u.last_login_at,u.created_at,
      COALESCE((SELECT json_agg(uc.company_id) FROM user_companies uc WHERE uc.user_id=u.id),'[]'::json) AS company_ids,
      COALESCE((SELECT json_agg(uw.warehouse_id) FROM user_warehouses uw WHERE uw.user_id=u.id),'[]'::json) AS warehouse_ids
     FROM users u WHERE ${where} ORDER BY u.full_name`,
    params,
  );
  res.json(rows);
}));

app.post('/api/users', authRequired, requireRoles(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const input = userSchema.parse(req.body);
  if (req.user.role === 'COMPANY_ADMIN' && !LOWER_ROLES.includes(input.role)) {
    return res.status(403).json({ error: 'ROLE_FORBIDDEN', message: 'Administratori i kompanisë mund të krijojë vetëm role operative.' });
  }
  const ownCompanyIds = await accessibleCompanyIds(req.user);
  if (input.companyIds.some((id) => !ownCompanyIds.includes(id))) {
    return res.status(403).json({ error: 'COMPANY_FORBIDDEN', message: 'Një kompani e zgjedhur nuk është në aksesin tuaj.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(input.password, 12);
    const { rows } = await client.query(
      `INSERT INTO users (id,tenant_id,full_name,username,email,password_hash,role)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,tenant_id,full_name,username,email,role,active,created_at`,
      [userId, req.user.tenant_id, input.fullName, lowerText(input.username), input.email || null, passwordHash, input.role],
    );
    for (const companyId of input.companyIds) {
      await client.query('INSERT INTO user_companies (user_id,company_id) VALUES ($1,$2)', [userId, companyId]);
    }
    if (input.warehouseIds.length) {
      const validWarehouses = await client.query(
        'SELECT id FROM warehouses WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND company_id=ANY($3::uuid[])',
        [req.user.tenant_id, input.warehouseIds, input.companyIds],
      );
      const validIds = validWarehouses.rows.map((r) => r.id);
      if (validIds.length !== input.warehouseIds.length) throw new Error('Një magazinë nuk i përket kompanive të zgjedhura.');
      for (const warehouseId of validIds) {
        await client.query('INSERT INTO user_warehouses (user_id,warehouse_id) VALUES ($1,$2)', [userId, warehouseId]);
      }
    }
    await audit({ tenantId: req.user.tenant_id, userId: req.user.id, action: 'USER_CREATE', entityType: 'user', entityId: userId, metadata: { username: input.username, role: input.role, companyIds: input.companyIds }, ip: req.ip }, client);
    await client.query('COMMIT');
    emitTenant(req.user.tenant_id, 'users', { action: 'created', id: userId });
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

app.patch('/api/users/:id/status', authRequired, requireRoles(...ADMIN_ROLES), asyncRoute(async (req, res) => {
  const input = z.object({ active: z.boolean() }).parse(req.body);
  if (req.params.id === req.user.id && input.active === false) {
    return res.status(400).json({ error: 'SELF_DISABLE', message: 'Nuk mund të çaktivizoni llogarinë tuaj.' });
  }
  const { rows } = await pool.query('SELECT id,tenant_id,role FROM users WHERE id=$1 AND tenant_id=$2', [req.params.id, req.user.tenant_id]);
  const target = rows[0];
  if (!target) return res.status(404).json({ error: 'NOT_FOUND', message: 'Përdoruesi nuk u gjet.' });
  if (req.user.role === 'COMPANY_ADMIN' && !LOWER_ROLES.includes(target.role)) {
    return res.status(403).json({ error: 'ROLE_FORBIDDEN', message: 'Nuk mund të ndryshoni këtë përdorues.' });
  }
  if (req.user.role === 'COMPANY_ADMIN') {
    const ownCompanyIds = await accessibleCompanyIds(req.user);
    const membership = await pool.query(
      'SELECT 1 FROM user_companies WHERE user_id=$1 AND company_id=ANY($2::uuid[]) LIMIT 1',
      [req.params.id, ownCompanyIds],
    );
    if (!membership.rows.length) {
      return res.status(403).json({ error: 'USER_FORBIDDEN', message: 'Përdoruesi nuk i përket kompanive tuaja.' });
    }
  }
  const { rows: updated } = await pool.query('UPDATE users SET active=$1,updated_at=NOW() WHERE id=$2 RETURNING id,active', [input.active, req.params.id]);
  await audit({ tenantId: req.user.tenant_id, userId: req.user.id, action: input.active ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', entityType: 'user', entityId: req.params.id, metadata: {}, ip: req.ip });
  emitTenant(req.user.tenant_id, 'users', { action: input.active ? 'activated' : 'deactivated', id: req.params.id });
  res.json(updated[0]);
}));

app.get('/api/audit', authRequired, requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'AUDITOR'), asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
  const companyIds = await accessibleCompanyIds(req.user);
  const params = [req.user.tenant_id, limit];
  let companyFilter = '';
  if (req.user.role !== 'SUPER_ADMIN') {
    if (!companyIds.length) return res.json([]);
    params.push(companyIds);
    companyFilter = 'AND (a.company_id IS NULL OR a.company_id=ANY($3::uuid[]))';
  }
  const { rows } = await pool.query(
    `SELECT a.id,a.action,a.entity_type,a.entity_id,a.company_id,a.metadata,a.ip_address,a.created_at,
            u.full_name AS user_name,u.username,c.name AS company_name
     FROM audit_logs a
     LEFT JOIN users u ON u.id=a.user_id
     LEFT JOIN companies c ON c.id=a.company_id
     WHERE a.tenant_id=$1 ${companyFilter}
     ORDER BY a.created_at DESC LIMIT $2`,
    params,
  );
  res.json(rows);
}));

app.get('/api/modules', authRequired, (_req, res) => {
  res.json([
    { group: 'Cloud Core', phase: 1, active: true, items: ['Dashboard', 'Kompanitë', 'Magazinat', 'Përdoruesit', 'Audit Log'] },
    { group: 'Blerje & Peshim', phase: 2, active: true, items: ['Formulari i Peshave', 'Kërkesa për Ofertë', 'Porosi Blerjeje', 'Pranime', 'Fatura Blerjeje'] },
    { group: 'Shitje & Magazinë', phase: 2, active: true, items: ['Oferta', 'Porosi Shitjeje', 'Fletë-Dalje', 'Fatura Shitjeje', 'Stoku'] },
    { group: 'Gjurmueshmëri 360°', phase: 4, active: true, items: ['Ferma & Origjina', 'Parcela/Zona', 'Peshim & Pranim', 'Lote Automatike', 'Kontroll Cilësie', 'Proces & Paketim', 'Ngarkesa/Eksport', 'Recall'] },
    { group: 'Arka & Banka', phase: 3, active: false, items: ['Mandat Arkëtimi', 'Mandat Pagese', 'Ditari i Arkës', 'Posta e Bankës', 'Rakordimi', 'Raportet'] },
    { group: 'Operacione', phase: 4, active: true, items: ['Shpenzime', 'Logjistikë', 'Ngarkesa & Eksport', 'Asete & Investime'] },
  ]);
});

installPhase2Routes({ app, pool, authRequired, requireRoles, assertCompanyAccess, audit, emitTenant });
installPhase2DocumentRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, audit, emitTenant });
installPhase3CloudCoreRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });
installPhase4TraceabilityRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });
installPhase4ProcessingPackagingRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });

app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND', message: `Rruga ${req.method} ${req.path} nuk ekziston.` }));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Kontrolloni të dhënat e formularit.', details: error.issues });
  }
  if (error.code === '23505') {
    return res.status(409).json({ error: 'DUPLICATE', message: 'Ekziston një rekord me të njëjtin emër, username, email ose kod.' });
  }
  const status = Number(error.status || 500);
  res.status(status).json({ error: status === 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR', message: status === 500 ? 'Ndodhi një gabim në server.' : error.message });
});

await migrate();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sistemi Genit API u nis në portën ${PORT}`);
});
