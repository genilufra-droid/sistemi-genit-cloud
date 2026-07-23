import http from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { installPhase5FinanceRoutes, migratePhase5Finance } from './phase5-finance.js';
import { installPhase6AssetDisposalRoute } from './phase6-asset-disposal.js';
import { installPhase6LogisticsReportHotfix } from './phase6-logistics-report-hotfix.js';
import { installPhase6OperationsRoutes, migratePhase6Operations } from './phase6-operations.js';
import { installPhase62TraceabilityDossierRoutes, migratePhase62TraceabilityDossier } from './phase62-traceability-dossier.js';
import { installPhase62TraceabilityHotfixRoutes, migratePhase62TraceabilityHotfix } from './phase62-traceability-hotfix.js';
import { installGlobalAuditTrail, migrateGlobalAuditTrail } from './global-audit-trail.js';

pg.types.setTypeParser(1082, (value) => value);

function normalizeTraceabilitySql(sql) {
  if (typeof sql !== 'string') return sql;
  let normalized = sql;
  if (/INSERT\s+INTO\s+cloud_change_events/i.test(normalized) && /'UPSERT'/i.test(normalized)) {
    normalized = normalized.replace(/'UPSERT'/gi, "'UPDATE'");
  }
  if (/INSERT\s+INTO\s+trace_lots/i.test(normalized) && /trace_dossier_id\s*,\s*display_label\s*,\s*packaging_count\s*,\s*packaging_unit/i.test(normalized) && /,\$26\)\s*$/i.test(normalized)) {
    normalized = normalized.replace(/,\$26\)\s*$/i, ')');
  }
  if (/FROM\s+trace_lots\s+l/i.test(normalized) && /bp\.name\s+AS\s+supplier_name\s*,\s*bp\.nipt\s+AS\s+supplier_nipt/i.test(normalized) && !/bp\.code\s+AS\s+supplier_code/i.test(normalized)) {
    normalized = normalized.replace(/bp\.name\s+AS\s+supplier_name\s*,\s*bp\.nipt\s+AS\s+supplier_nipt/i, 'bp.code AS supplier_code,bp.name AS supplier_name,bp.nipt AS supplier_nipt');
  }
  if (/FROM\s+weight_tickets\s+wt/i.test(normalized) && /LEFT\s+JOIN/i.test(normalized) && !/FOR\s+UPDATE\s+OF\s+wt/i.test(normalized)) {
    normalized = normalized.replace(/FOR\s+UPDATE\s*$/i, 'FOR UPDATE OF wt');
  }
  return normalized;
}
const originalPgQuery = pg.Client.prototype.query;
if (!originalPgQuery.__sgTraceabilitySqlFix) {
  const patchedPgQuery = function patchedPgQuery(config, ...args) {
    if (typeof config === 'string') config = normalizeTraceabilitySql(config);
    else if (config && typeof config === 'object' && typeof config.text === 'string') config = { ...config, text: normalizeTraceabilitySql(config.text) };
    return originalPgQuery.call(this, config, ...args);
  };
  patchedPgQuery.__sgTraceabilitySqlFix = true;
  pg.Client.prototype.query = patchedPgQuery;
}

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
if (!capturedApp || !pendingListen) throw new Error('Phase 6 nuk arriti të kapë nisjen e Express API.');

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
await migratePhase6Operations(pool);
await migratePhase62TraceabilityDossier(pool);
await migrateGlobalAuditTrail(pool);
await migratePhase62TraceabilityHotfix(pool);
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

installGlobalAuditTrail({ app:capturedApp, router, pool, authRequired, accessibleCompanyIds });
installPhase5FinanceRoutes({ app:capturedApp, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });
installPhase6AssetDisposalRoute({ app:capturedApp, pool, authRequired, requireRoles, assertCompanyAccess, audit, emitTenant });
installPhase6LogisticsReportHotfix({ app:capturedApp, pool, authRequired, accessibleCompanyIds });
installPhase6OperationsRoutes({ app:capturedApp, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });
installPhase62TraceabilityHotfixRoutes({ app:capturedApp, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });
installPhase62TraceabilityDossierRoutes({ app:capturedApp, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });
router.stack.push(...terminalLayers);

const modulesLayer = router.stack.find((layer) => layer.route?.path === '/api/modules');
if (modulesLayer?.route?.stack?.length) {
  const target = modulesLayer.route.stack[modulesLayer.route.stack.length - 1];
  target.handle = (_req, res) => res.json([
    { group:'Cloud Core',phase:1,active:true,items:['Dashboard','Kompanitë','Magazinat','Përdoruesit','Audit Log','Gjurmë Përdoruesi & Pajisjeje'] },
    { group:'Blerje & Peshim',phase:2,active:true,items:['Formulari i Peshave','Kërkesa për Ofertë','Porosi Blerjeje','Pranime','Fatura Blerjeje'] },
    { group:'Shitje & Magazinë',phase:2,active:true,items:['Oferta','Porosi Shitjeje','Fletë-Dalje','Fatura Shitjeje','Stoku'] },
    { group:'Gjurmueshmëri 360°',phase:6.2,active:true,items:['Ferma & Origjina','Bimët','Formulari i Peshës','Kontroll Cilësie','Faturë Blerje','Fletë-Hyrje & Etiketë 58 mm','Lote Automatike','Proces 1..N','Magazina Produkt i Gatshëm','Loti Final i Shitjes','Dosja e Dokumenteve'] },
    { group:'Arka & Banka',phase:5,active:true,items:['Mandat Arkëtimi','Mandat Pagese','Ditari i Arkës','Posta e Bankës','Rakordimi','Mbyllja Ditore','Raportet'] },
    { group:'Operacione',phase:6,active:true,items:['Shpenzime','Kategori Shpenzimesh','Shoferë','Itinerare','Udhëtime','Karburant','Mirëmbajtje & Riparime','15 Raporte Logjistike','Asete & Investime','Amortizim','Raporte Asetesh'] },
  ]);
}

pendingListen.server.listen = pendingListen.originalListen;
pendingListen.originalListen.apply(pendingListen.server, pendingListen.listenArgs);
console.log('Sistemi Genit Cloud Phase 6.2 traceability, 58mm label and immutable audit routes installed.');
