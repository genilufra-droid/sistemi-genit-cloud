import { createHash, randomUUID } from 'node:crypto';

const WRITE_METHODS = new Set(['POST','PUT','PATCH','DELETE']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value) => String(value ?? '').trim();

function truncate(value, length = 500) {
  const source = text(value);
  return source.length > length ? `${source.slice(0, length)}…` : source;
}

function safeUuid(value) {
  const source = text(value);
  return UUID_RE.test(source) ? source : null;
}

function clientIp(req) {
  const forwarded = text(req.headers['x-forwarded-for']).split(',')[0].trim();
  return truncate(req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || forwarded || req.ip || req.socket?.remoteAddress, 120) || null;
}

function deviceContext(req) {
  return {
    deviceId: truncate(req.headers['x-sg-device-id'], 120) || null,
    deviceName: truncate(req.headers['x-sg-device-name'], 180) || null,
    devicePlatform: truncate(req.headers['x-sg-device-platform'], 180) || null,
    deviceSerial: truncate(req.headers['x-sg-device-serial'], 180) || null,
    timezone: truncate(req.headers['x-sg-device-timezone'], 100) || null,
    clientTime: truncate(req.headers['x-sg-client-time'], 80) || null,
    userAgent: truncate(req.headers['user-agent'], 1000) || null,
  };
}

function sanitize(value, depth = 0) {
  if (depth > 5) return '[MAX_DEPTH]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return truncate(value, 1000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (typeof value !== 'object') return truncate(value, 1000);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/password|secret|token|authorization|cookie|signature/i.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitize(item, depth + 1);
    }
  }
  return result;
}

function responseSummary(value) {
  if (!value || typeof value !== 'object') return sanitize(value);
  const source = value.result && typeof value.result === 'object' ? value.result : value;
  const keys = ['id','documentId','documentNo','document_no','status','lotId','lotNumber','dossierId','dossierNo','expenseNo','shipmentNo','checkNo','error','message'];
  const result = {};
  for (const key of keys) if (source[key] != null) result[key] = sanitize(source[key]);
  if (source.document && typeof source.document === 'object') result.document = responseSummary(source.document);
  if (source.lot && typeof source.lot === 'object') result.lot = responseSummary(source.lot);
  if (source.receipt && typeof source.receipt === 'object') result.receipt = responseSummary(source.receipt);
  return Object.keys(result).length ? result : sanitize(source);
}

function inferAction(method, path) {
  const value = String(path || '').toLowerCase();
  if (/cancel|void|anull/.test(value)) return 'CANCEL';
  if (/post|confirm|approve|dispatch|receive|close|activate|depreciate|pay/.test(value)) return 'POST';
  if (method === 'DELETE') return 'DELETE_DRAFT';
  if (method === 'PATCH' || method === 'PUT') return 'UPDATE';
  return 'CREATE';
}

function inferEntityType(path) {
  const value = String(path || '').toLowerCase();
  const rules = [
    [/weights|pesh/, 'weight_ticket'],
    [/trace\/dossiers|dossier/, 'trace_dossier'],
    [/trace\/lots|lot/, 'trace_lot'],
    [/quality/, 'quality_check'],
    [/process/, 'process_order'],
    [/packag/, 'packaging_order'],
    [/shipments|shipment|ngarkes/, 'shipment'],
    [/documents|invoice|receipt|delivery/, 'business_document'],
    [/finance|cash|bank|mandat/, 'finance_document'],
    [/expense/, 'expense'],
    [/asset/, 'fixed_asset'],
    [/partner|supplier|client/, 'business_partner'],
    [/product|article/, 'product'],
    [/farm|ferma/, 'trace_farm'],
    [/plant|bim/, 'trace_plant'],
    [/parcel/, 'trace_parcel'],
  ];
  const found = rules.find(([pattern]) => pattern.test(value));
  return found ? found[1] : 'api_resource';
}

function entityIdFrom(req, responseBody) {
  const candidates = [
    responseBody?.id,
    responseBody?.documentId,
    responseBody?.weightTicketId,
    responseBody?.dossierId,
    responseBody?.lotId,
    responseBody?.result?.id,
    responseBody?.document?.id,
    responseBody?.lot?.id,
    responseBody?.receipt?.id,
    req.params?.id,
    req.body?.id,
  ];
  return candidates.map(safeUuid).find(Boolean) || null;
}

function companyIdFrom(req, responseBody) {
  const candidates = [
    req.body?.companyId,
    req.body?.company_id,
    responseBody?.companyId,
    responseBody?.company_id,
    responseBody?.result?.companyId,
    responseBody?.result?.company_id,
    responseBody?.document?.companyId,
    responseBody?.document?.company_id,
  ];
  return candidates.map(safeUuid).find(Boolean) || null;
}

function documentNoFrom(req, responseBody) {
  const candidates = [
    responseBody?.documentNo,
    responseBody?.document_no,
    responseBody?.dossierNo,
    responseBody?.lotNumber,
    responseBody?.expenseNo,
    responseBody?.shipmentNo,
    responseBody?.result?.documentNo,
    responseBody?.result?.document_no,
    responseBody?.document?.documentNo,
    responseBody?.document?.document_no,
    responseBody?.lot?.lotNumber,
    responseBody?.receipt?.documentNo,
    req.body?.documentNo,
    req.body?.document_no,
  ];
  return truncate(candidates.find((item) => text(item)) || '', 180) || null;
}

async function insertImmutableEvent(client, event) {
  const occurredAt = event.occurredAt || new Date().toISOString();
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sg-audit-${event.tenantId}`]);
  const previousResult = await client.query(
    `SELECT event_hash FROM system_action_events WHERE tenant_id=$1 ORDER BY sequence_no DESC LIMIT 1`,
    [event.tenantId],
  );
  const previousHash = previousResult.rows[0]?.event_hash || null;
  const canonical = JSON.stringify({
    previousHash,
    tenantId:event.tenantId,
    companyId:event.companyId || null,
    userId:event.userId || null,
    username:event.username || null,
    action:event.action,
    entityType:event.entityType,
    entityId:event.entityId || null,
    documentNo:event.documentNo || null,
    requestId:event.requestId,
    method:event.method,
    path:event.path,
    statusCode:event.statusCode,
    result:event.result,
    ipAddress:event.ipAddress || null,
    device:event.device || {},
    occurredAt,
  });
  const eventHash = createHash('sha256').update(canonical).digest('hex');
  const id = randomUUID();
  await client.query(
    `INSERT INTO system_action_events(
       id,tenant_id,company_id,user_id,username_snapshot,action,entity_type,entity_id,document_no,
       request_id,http_method,request_path,status_code,result,ip_address,device_id,device_name,device_platform,
       device_serial,user_agent,timezone,client_time,request_data,response_data,previous_hash,event_hash,occurred_at
     ) VALUES(
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24::jsonb,$25,$26,$27
     )`,
    [
      id,event.tenantId,event.companyId||null,event.userId||null,event.username||null,event.action,event.entityType,event.entityId||null,event.documentNo||null,
      event.requestId,event.method,event.path,event.statusCode,event.result,event.ipAddress||null,event.device?.deviceId||null,event.device?.deviceName||null,
      event.device?.devicePlatform||null,event.device?.deviceSerial||null,event.device?.userAgent||null,event.device?.timezone||null,event.device?.clientTime||null,
      JSON.stringify(event.requestData||{}),JSON.stringify(event.responseData||{}),previousHash,eventHash,occurredAt,
    ],
  );

  if (event.device?.deviceId) {
    await client.query(
      `INSERT INTO system_devices(
         id,tenant_id,user_id,device_id,device_name,device_platform,device_serial,user_agent,timezone,first_ip,last_ip,first_seen_at,last_seen_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$11)
       ON CONFLICT(tenant_id,device_id)
       DO UPDATE SET user_id=EXCLUDED.user_id,device_name=EXCLUDED.device_name,device_platform=EXCLUDED.device_platform,
         device_serial=COALESCE(EXCLUDED.device_serial,system_devices.device_serial),user_agent=EXCLUDED.user_agent,timezone=EXCLUDED.timezone,
         last_ip=EXCLUDED.last_ip,last_seen_at=EXCLUDED.last_seen_at`,
      [randomUUID(),event.tenantId,event.userId||null,event.device.deviceId,event.device.deviceName||null,event.device.devicePlatform||null,
       event.device.deviceSerial||null,event.device.userAgent||null,event.device.timezone||null,event.ipAddress||null,occurredAt],
    );
  }

  await client.query(
    `INSERT INTO audit_logs(id,tenant_id,user_id,action,entity_type,entity_id,company_id,metadata,ip_address)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
    [randomUUID(),event.tenantId,event.userId||null,`GLOBAL_${event.action}`,event.entityType,event.entityId||null,event.companyId||null,
     JSON.stringify({requestId:event.requestId,documentNo:event.documentNo,result:event.result,statusCode:event.statusCode,deviceId:event.device?.deviceId||null,eventHash}),
     event.ipAddress||null],
  );
  return { id, eventHash, previousHash };
}

export async function migrateGlobalAuditTrail(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS system_devices (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      device_id VARCHAR(120) NOT NULL,
      device_name VARCHAR(180),
      device_platform VARCHAR(180),
      device_serial VARCHAR(180),
      user_agent TEXT,
      timezone VARCHAR(100),
      first_ip VARCHAR(120),
      last_ip VARCHAR(120),
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id,device_id)
    );

    CREATE TABLE IF NOT EXISTS system_action_events (
      sequence_no BIGSERIAL UNIQUE NOT NULL,
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      username_snapshot VARCHAR(180),
      action VARCHAR(80) NOT NULL,
      entity_type VARCHAR(100) NOT NULL,
      entity_id UUID,
      document_no VARCHAR(180),
      request_id UUID NOT NULL,
      http_method VARCHAR(10) NOT NULL,
      request_path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      result VARCHAR(30) NOT NULL,
      ip_address VARCHAR(120),
      device_id VARCHAR(120),
      device_name VARCHAR(180),
      device_platform VARCHAR(180),
      device_serial VARCHAR(180),
      user_agent TEXT,
      timezone VARCHAR(100),
      client_time VARCHAR(80),
      request_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      response_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      previous_hash CHAR(64),
      event_hash CHAR(64) NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_system_action_tenant_time ON system_action_events(tenant_id,occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_system_action_entity ON system_action_events(tenant_id,entity_type,entity_id,occurred_at);
    CREATE INDEX IF NOT EXISTS idx_system_action_document ON system_action_events(tenant_id,document_no,occurred_at);
    CREATE INDEX IF NOT EXISTS idx_system_action_user ON system_action_events(tenant_id,user_id,occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_system_action_device ON system_action_events(tenant_id,device_id,occurred_at DESC);

    CREATE OR REPLACE FUNCTION sg_prevent_system_action_event_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'System action events are immutable';
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_system_action_events_immutable ON system_action_events;
    CREATE TRIGGER trg_system_action_events_immutable
    BEFORE UPDATE OR DELETE ON system_action_events
    FOR EACH ROW EXECUTE FUNCTION sg_prevent_system_action_event_mutation();
  `);
}

export function installGlobalAuditTrail({ app, router, pool, authRequired, accessibleCompanyIds }) {
  const middleware = (req, res, next) => {
    if (!String(req.path || '').startsWith('/api/') || !WRITE_METHODS.has(req.method) || req.path === '/api/audit/client-event') return next();
    const requestId = randomUUID();
    const startedAt = Date.now();
    const device = deviceContext(req);
    let responseBody = null;
    res.setHeader('X-SG-Request-ID', requestId);
    const originalJson = res.json;
    res.json = function auditJson(body) {
      responseBody = body;
      return originalJson.call(this, body);
    };
    const originalSend = res.send;
    res.send = function auditSend(body) {
      if (responseBody == null && body && typeof body === 'object') responseBody = body;
      return originalSend.call(this, body);
    };
    res.once('finish', () => {
      if (!req.user?.tenant_id) return;
      const event = {
        tenantId:req.user.tenant_id,
        companyId:companyIdFrom(req,responseBody),
        userId:req.user.id,
        username:req.user.username || req.user.full_name,
        action:inferAction(req.method,req.path),
        entityType:inferEntityType(req.path),
        entityId:entityIdFrom(req,responseBody),
        documentNo:documentNoFrom(req,responseBody),
        requestId,
        method:req.method,
        path:req.originalUrl || req.path,
        statusCode:res.statusCode,
        result:res.statusCode >= 200 && res.statusCode < 400 ? 'SUCCESS' : 'FAILED',
        ipAddress:clientIp(req),
        device,
        requestData:{body:sanitize(req.body||{}),params:sanitize(req.params||{}),query:sanitize(req.query||{}),durationMs:Date.now()-startedAt},
        responseData:responseSummary(responseBody),
      };
      const clientPromise = pool.connect();
      void clientPromise.then(async (client) => {
        try {
          await client.query('BEGIN');
          await insertImmutableEvent(client,event);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK').catch(()=>{});
          console.error('Global audit event failed:',error.message);
        } finally {
          client.release();
        }
      }).catch((error)=>console.error('Global audit connection failed:',error.message));
    });
    next();
  };

  app.use(middleware);
  const layer = router.stack.pop();
  const firstRouteIndex = router.stack.findIndex((item) => item.route);
  router.stack.splice(firstRouteIndex < 0 ? router.stack.length : firstRouteIndex, 0, layer);

  app.post('/api/audit/client-event', authRequired, async (req,res,next) => {
    const client = await pool.connect();
    try {
      const allowedActions = new Set(['VIEW','PREVIEW','PRINT','PDF','EXCEL','DOWNLOAD','SHARE']);
      const action = text(req.body?.action).toUpperCase();
      if (!allowedActions.has(action)) {
        const error = new Error('Veprimi i auditimit nuk është i vlefshëm.');
        error.status = 400;
        throw error;
      }
      const companyId = safeUuid(req.body?.companyId);
      if (companyId) {
        const companyIds = await accessibleCompanyIds(req.user,client);
        if (!companyIds.includes(companyId)) {
          const error = new Error('Nuk keni akses në këtë kompani.');
          error.status = 403;
          throw error;
        }
      }
      await client.query('BEGIN');
      const result = await insertImmutableEvent(client,{
        tenantId:req.user.tenant_id,
        companyId,
        userId:req.user.id,
        username:req.user.username || req.user.full_name,
        action,
        entityType:truncate(req.body?.entityType,100) || 'document',
        entityId:safeUuid(req.body?.entityId),
        documentNo:truncate(req.body?.documentNo,180) || null,
        requestId:randomUUID(),
        method:'CLIENT',
        path:truncate(req.body?.sourceView || req.headers.referer || '/web',1000),
        statusCode:200,
        result:'SUCCESS',
        ipAddress:clientIp(req),
        device:deviceContext(req),
        requestData:{metadata:sanitize(req.body?.metadata||{})},
        responseData:{logged:true},
      });
      await client.query('COMMIT');
      res.status(201).json({logged:true,eventId:result.id,eventHash:result.eventHash});
    } catch (error) {
      await client.query('ROLLBACK').catch(()=>{});
      next(error);
    } finally {
      client.release();
    }
  });

  app.get('/api/audit/events', authRequired, async (req,res,next) => {
    try {
      const companyIds = await accessibleCompanyIds(req.user);
      const limit = Math.min(Math.max(Number(req.query.limit)||100,1),500);
      const values = [req.user.tenant_id,companyIds,limit];
      const filters = [`e.tenant_id=$1`,`(e.company_id=ANY($2::uuid[]) OR e.company_id IS NULL)`];
      if (req.query.entityType) { values.push(truncate(req.query.entityType,100)); filters.push(`e.entity_type=$${values.length}`); }
      if (safeUuid(req.query.entityId)) { values.push(req.query.entityId); filters.push(`e.entity_id=$${values.length}`); }
      if (req.query.documentNo) { values.push(`%${truncate(req.query.documentNo,180)}%`); filters.push(`e.document_no ILIKE $${values.length}`); }
      if (safeUuid(req.query.userId)) { values.push(req.query.userId); filters.push(`e.user_id=$${values.length}`); }
      if (req.query.deviceId) { values.push(truncate(req.query.deviceId,120)); filters.push(`e.device_id=$${values.length}`); }
      const { rows } = await pool.query(`
        SELECT e.*,u.full_name AS user_full_name
        FROM system_action_events e LEFT JOIN users u ON u.id=e.user_id
        WHERE ${filters.join(' AND ')}
        ORDER BY e.occurred_at DESC,e.sequence_no DESC LIMIT $3`, values);
      res.json(rows);
    } catch (error) { next(error); }
  });
}
