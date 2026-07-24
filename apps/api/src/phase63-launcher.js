import http from 'node:http';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { installPhase63TraceabilityFixes, migratePhase63TraceabilityFixes } from './phase63-traceability-fixes.js';

const realListen = http.Server.prototype.listen;
let deferred = null;
http.Server.prototype.listen = function deferPhase63Listen(...args) {
  deferred = { server:this, args };
  return this;
};

await import('./phase5-launcher.js');
http.Server.prototype.listen = realListen;

if (!deferred?.server) throw new Error('Phase 6.3 nuk arriti të kapë serverin API para nisjes.');
const app = deferred.server.listeners('request')[0];
const router = app?.router || app?._router;
if (!app || !router?.stack) throw new Error('Phase 6.3 nuk gjeti Express app/router.');

const { Pool } = pg;
const pool = new Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false,
  max:6,
  idleTimeoutMillis:30000,
});

async function accessibleCompanyIds(user, client = pool) {
  if (user.role === 'SUPER_ADMIN') {
    const { rows } = await client.query('SELECT id FROM companies WHERE tenant_id=$1', [user.tenant_id]);
    return rows.map((row) => row.id);
  }
  const { rows } = await client.query(
    `SELECT c.id FROM companies c JOIN user_companies uc ON uc.company_id=c.id
     WHERE uc.user_id=$1 AND c.tenant_id=$2`,
    [user.id, user.tenant_id],
  );
  return rows.map((row) => row.id);
}

async function assertCompanyAccess(user, companyId, client = pool) {
  const ids = await accessibleCompanyIds(user, client);
  if (!ids.includes(companyId)) {
    const error = new Error('Nuk keni akses në këtë kompani.');
    error.status = 403;
    throw error;
  }
}

async function audit({ tenantId,userId,action,entityType,entityId=null,companyId=null,metadata={},ip=null }, client=pool) {
  await client.query(
    `INSERT INTO audit_logs(id,tenant_id,user_id,action,entity_type,entity_id,company_id,metadata,ip_address)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
    [randomUUID(),tenantId,userId,action,entityType,entityId,companyId,JSON.stringify(metadata),ip],
  );
}

await migratePhase63TraceabilityFixes(pool);
installPhase63TraceabilityFixes({
  router,
  pool,
  assertCompanyAccess,
  accessibleCompanyIds,
  audit,
  emitTenant:() => {},
});

deferred.server.listen = realListen;
realListen.apply(deferred.server, deferred.args);
console.log('Sistemi Genit Cloud Phase 6.3 optional origin, registry verification and 58 mm weight preview installed.');
