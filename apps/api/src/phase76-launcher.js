import http from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { PHASE76_REPORTS, installPhase76InventoryReportsRoutes, migratePhase76InventoryReports } from './phase76-inventory-reports.js';
import { installElectronicArchiveRoutes, migrateElectronicArchive } from './phase84-electronic-archive.js';
import { installPhase97DocumentPdfRoutes } from './phase97-document-pdf.js';

const originalCreateServer=http.createServer;
let capturedApp=null;
http.createServer=function capturePhase76App(app,...args){capturedApp=app;return originalCreateServer.call(this,app,...args);};

await import('./phase75-query-hotfix-launcher.js');
http.createServer=originalCreateServer;
if(!capturedApp)throw new Error('Phase 7.6 nuk arriti të kapë Express API.');

const{Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false,max:6,idleTimeoutMillis:30000});
const JWT_SECRET=process.env.JWT_SECRET;

async function accessibleCompanyIds(user,client=pool){
  if(user.role==='SUPER_ADMIN'){const{rows}=await client.query('SELECT id FROM companies WHERE tenant_id=$1',[user.tenant_id]);return rows.map((row)=>row.id);}
  const{rows}=await client.query(`SELECT c.id FROM companies c JOIN user_companies uc ON uc.company_id=c.id WHERE uc.user_id=$1 AND c.tenant_id=$2`,[user.id,user.tenant_id]);
  return rows.map((row)=>row.id);
}
async function assertCompanyAccess(user,companyId,client=pool){const ids=await accessibleCompanyIds(user,client);if(!ids.includes(companyId)){const error=new Error('Nuk keni akses në këtë kompani.');error.status=403;throw error;}}
async function authRequired(req,res,next){
  const header=req.headers.authorization||'',token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token)return res.status(401).json({error:'AUTH_REQUIRED',message:'Duhet të identifikoheni.'});
  try{const payload=jwt.verify(token,JWT_SECRET,{issuer:'sistemi-genit-cloud'});const{rows}=await pool.query('SELECT id,tenant_id,full_name,username,email,role,active FROM users WHERE id=$1 AND tenant_id=$2 LIMIT 1',[payload.sub,payload.tenantId]);if(!rows[0]?.active)return res.status(401).json({error:'USER_DISABLED',message:'Përdoruesi është çaktivizuar.'});req.user=rows[0];next();}catch{return res.status(401).json({error:'INVALID_TOKEN',message:'Sesioni ka skaduar. Hyni përsëri.'});}
}
const requireRoles=(...roles)=>(req,res,next)=>{if(!req.user||!roles.includes(req.user.role))return res.status(403).json({error:'FORBIDDEN',message:'Nuk keni leje për këtë veprim.'});next();};
async function audit({tenantId,userId,action,entityType,entityId=null,companyId=null,metadata={},ip=null},client=pool){await client.query(`INSERT INTO audit_logs(id,tenant_id,user_id,action,entity_type,entity_id,company_id,metadata,ip_address) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,[randomUUID(),tenantId,userId,action,entityType,entityId,companyId,JSON.stringify(metadata),ip]);}

const router=capturedApp.router||capturedApp._router;
if(!router?.stack||router.stack.length<2)throw new Error('Express route stack nuk u gjet për Phase 7.6.');
const terminalLayers=router.stack.splice(-2);
await migratePhase76InventoryReports(pool);
await migrateElectronicArchive(pool);
installPhase76InventoryReportsRoutes({app:capturedApp,pool,authRequired,requireRoles,assertCompanyAccess,accessibleCompanyIds,audit});
installElectronicArchiveRoutes({app:capturedApp,pool,authRequired,requireRoles,assertCompanyAccess,audit});
installPhase97DocumentPdfRoutes({app:capturedApp,pool,authRequired,assertCompanyAccess});
router.stack.push(...terminalLayers);

const modulesLayer=router.stack.find((layer)=>layer.route?.path==='/api/modules');
if(modulesLayer?.route?.stack?.length){
  const target=modulesLayer.route.stack[modulesLayer.route.stack.length-1],previous=target.handle;
  target.handle=async(req,res,next)=>{
    const fake={json(payload){const modules=Array.isArray(payload)?payload:[];const inventory=modules.find((item)=>item.group==='Inventory / Magazina');if(inventory){inventory.phase=7.6;inventory.items=['Paneli Inventory','Pranime / Fletë-Hyrje','Sistemim në Stok','Transferime të Brendshme','Përgatitje Daljeje','Dërgesa / Fletë-Dalje','Rregullime Inventari','Gjendja e Stokut','Lokacionet','Lotet','Rregullat e Furnizimit',...PHASE76_REPORTS.map((report)=>report.label)];}return res.json(modules);}};
    return previous(req,fake,next);
  };
}

console.log('Sistemi Genit Cloud Phase 8.4: Inventory dhe Arkiva Elektronike cloud installed.');
