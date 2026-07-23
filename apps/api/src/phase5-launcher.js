import http from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { installPhase5FinanceRoutes, migratePhase5Finance } from './phase5-finance.js';

const originalCreateServer = http.createServer;
let capturedApp = null;
let pendingListen = null;
http.createServer = function captureApp(app, ...args) {
  capturedApp = app;
  const server = originalCreateServer.call(this, app, ...args);
  const originalListen = server.listen;
  server.listen = function deferListen(...listenArgs) {
    pendingListen = { server, originalListen, listenArgs };
    return server;
  };
  return server;
};

await import('./server.js');
http.createServer = originalCreateServer;
if (!capturedApp || !pendingListen) throw new Error('Phase 5 nuk arriti të kapë nisjen e Express API.');

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 8,
  idleTimeoutMillis: 30000,
});
const JWT_SECRET = process.env.JWT_SECRET;

async function accessibleCompanyIds(user, client = pool) {
  if (user.role === 'SUPER_ADMIN') {
    const { rows } = await client.query('SELECT id FROM companies WHERE tenant_id=$1', [user.tenant_id]);
    return rows.map((row) => row.id);
  }
  const { rows } = await client.query(
    `SELECT c.id FROM companies c
     JOIN user_companies uc ON uc.company_id=c.id
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
async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error:'AUTH_REQUIRED', message:'Duhet të identifikoheni.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer:'sistemi-genit-cloud' });
    const { rows } = await pool.query(
      'SELECT id,tenant_id,full_name,username,email,role,active FROM users WHERE id=$1 AND tenant_id=$2 LIMIT 1',
      [payload.sub, payload.tenantId],
    );
    if (!rows[0]?.active) return res.status(401).json({ error:'USER_DISABLED', message:'Përdoruesi është çaktivizuar.' });
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error:'INVALID_TOKEN', message:'Sesioni ka skaduar. Hyni përsëri.' });
  }
}
const requireRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error:'FORBIDDEN', message:'Nuk keni leje për këtë veprim.' });
  next();
};
async function audit({ tenantId,userId,action,entityType,entityId=null,companyId=null,metadata={},ip=null }, client=pool) {
  await client.query(
    `INSERT INTO audit_logs(id,tenant_id,user_id,action,entity_type,entity_id,company_id,metadata,ip_address)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
    [randomUUID(),tenantId,userId,action,entityType,entityId,companyId,JSON.stringify(metadata),ip],
  );
}
function emitTenant() {}

const router = capturedApp.router || capturedApp._router;
if (!router?.stack || router.stack.length < 2) throw new Error('Express route stack nuk u gjet.');
const terminalLayers = router.stack.splice(-2);
await migratePhase5Finance(pool);
await pool.query(`
  CREATE OR REPLACE FUNCTION sg_sync_business_document_payment_fields()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.paid_amount := COALESCE(NEW.paid_amount,0);
    NEW.remaining_amount := GREATEST(COALESCE(NEW.total_amount,0)-NEW.paid_amount,0);
    NEW.payment_status := CASE
      WHEN NEW.paid_amount<=0 THEN 'UNPAID'
      WHEN NEW.remaining_amount<=0.0001 THEN 'PAID'
      ELSE 'PARTIAL'
    END;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS trg_sg_sync_business_document_payment_fields ON business_documents;
  CREATE TRIGGER trg_sg_sync_business_document_payment_fields
  BEFORE INSERT OR UPDATE OF total_amount,paid_amount ON business_documents
  FOR EACH ROW EXECUTE FUNCTION sg_sync_business_document_payment_fields();
`);
installPhase5FinanceRoutes({ app:capturedApp, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });
router.stack.push(...terminalLayers);

const modulesLayer = router.stack.find((layer) => layer.route?.path === '/api/modules');
if (modulesLayer?.route?.stack?.length) {
  const target = modulesLayer.route.stack[modulesLayer.route.stack.length - 1];
  target.handle = (_req, res) => res.json([
    { group:'Cloud Core',phase:1,active:true,items:['Dashboard','Kompanitë','Magazinat','Përdoruesit','Audit Log'] },
    { group:'Blerje & Peshim',phase:2,active:true,items:['Formulari i Peshave','Kërkesa për Ofertë','Porosi Blerjeje','Pranime','Fatura Blerjeje'] },
    { group:'Shitje & Magazinë',phase:2,active:true,items:['Oferta','Porosi Shitjeje','Fletë-Dalje','Fatura Shitjeje','Stoku'] },
    { group:'Gjurmueshmëri 360°',phase:4,active:true,items:['Ferma & Origjina','Parcela/Zona','Peshim & Pranim','Lote Automatike','Kontroll Cilësie','Proces & Paketim','Ngarkesa/Eksport','Recall'] },
    { group:'Arka & Banka',phase:5,active:true,items:['Mandat Arkëtimi','Mandat Pagese','Ditari i Arkës','Posta e Bankës','Rakordimi','Mbyllja Ditore','Raportet'] },
    { group:'Operacione',phase:4,active:true,items:['Shpenzime','Logjistikë','Ngarkesa & Eksport','Asete & Investime'] },
  ]);
}

pendingListen.server.listen = pendingListen.originalListen;
pendingListen.originalListen.apply(pendingListen.server, pendingListen.listenArgs);
console.log('Sistemi Genit Cloud Phase 5 Finance routes installed.');
