import http from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { migratePhase71Manufacturing, installPhase71ManufacturingRoutes } from './phase71-manufacturing.js';
import { installPhase71ManufacturingDocumentRoutes } from './phase71-manufacturing-documents.js';

const realCreateServer=http.createServer;
let capturedApp=null;
let deferredListen=null;
http.createServer=function capturePhase71(app,...args){
  capturedApp=app;
  const server=realCreateServer.call(this,app,...args);
  const realListen=server.listen;
  server.listen=function deferPhase71(...listenArgs){deferredListen={server,realListen,listenArgs};return server;};
  return server;
};

await import('./phase5-launcher.js');
http.createServer=realCreateServer;
if(!capturedApp||!deferredListen)throw new Error('Phase 7.1 nuk arriti të kapë API-në para nisjes.');

const {Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false,max:8,idleTimeoutMillis:30000});
const JWT_SECRET=process.env.JWT_SECRET;

async function accessibleCompanyIds(user,client=pool){
  if(user.role==='SUPER_ADMIN'){
    const {rows}=await client.query('SELECT id FROM companies WHERE tenant_id=$1',[user.tenant_id]);
    return rows.map((row)=>row.id);
  }
  const {rows}=await client.query(`SELECT c.id FROM companies c JOIN user_companies uc ON uc.company_id=c.id WHERE uc.user_id=$1 AND c.tenant_id=$2`,[user.id,user.tenant_id]);
  return rows.map((row)=>row.id);
}
async function assertCompanyAccess(user,companyId,client=pool){
  const ids=await accessibleCompanyIds(user,client);
  if(!ids.includes(companyId)){const error=new Error('Nuk keni akses në këtë kompani.');error.status=403;throw error;}
}
async function authRequired(req,res,next){
  const header=req.headers.authorization||'';const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token)return res.status(401).json({error:'AUTH_REQUIRED',message:'Duhet të identifikoheni.'});
  try{
    const payload=jwt.verify(token,JWT_SECRET,{issuer:'sistemi-genit-cloud'});
    const {rows}=await pool.query('SELECT id,tenant_id,full_name,username,email,role,active FROM users WHERE id=$1 AND tenant_id=$2 LIMIT 1',[payload.sub,payload.tenantId]);
    if(!rows[0]?.active)return res.status(401).json({error:'USER_DISABLED',message:'Përdoruesi është çaktivizuar.'});
    req.user=rows[0];next();
  }catch{return res.status(401).json({error:'INVALID_TOKEN',message:'Sesioni ka skaduar. Hyni përsëri.'});}
}
const requireRoles=(...roles)=>(req,res,next)=>{if(!req.user||!roles.includes(req.user.role))return res.status(403).json({error:'FORBIDDEN',message:'Nuk keni leje për këtë veprim.'});next();};
async function audit({tenantId,userId,action,entityType,entityId=null,companyId=null,metadata={},ip=null},client=pool){
  await client.query(`INSERT INTO audit_logs(id,tenant_id,user_id,action,entity_type,entity_id,company_id,metadata,ip_address) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,[randomUUID(),tenantId,userId,action,entityType,entityId,companyId,JSON.stringify(metadata),ip]);
}

const router=capturedApp.router||capturedApp._router;
if(!router?.stack)throw new Error('Express route stack nuk u gjet për Prodhimin.');
const terminalLayers=router.stack.splice(-2);
await migratePhase71Manufacturing(pool);
installPhase71ManufacturingRoutes({app:capturedApp,pool,authRequired,requireRoles,assertCompanyAccess,accessibleCompanyIds,audit});
installPhase71ManufacturingDocumentRoutes({app:capturedApp,pool,authRequired,accessibleCompanyIds});
router.stack.push(...terminalLayers);

const modulesLayer=router.stack.find((layer)=>layer.route?.path==='/api/modules');
if(modulesLayer?.route?.stack?.length){
  const target=modulesLayer.route.stack[modulesLayer.route.stack.length-1];
  const previous=target.handle;
  target.handle=async(req,res,next)=>{
    let payload=null;
    const proxy={json(value){payload=value;return proxy;},status(){return proxy;}};
    await previous(req,proxy,next);
    const modules=Array.isArray(payload)?payload.slice():[];
    modules.splice(4,0,{group:'Prodhimi / Manufacturing',phase:7.1,active:true,items:['Paneli i Prodhimit','Proceset','Makineritë','Mostrat e Klientit','Fushatat e Prodhimit','Urdhrat e Punës','Kontrollet e Cilësisë','Transferimet Proces–Proces','Gjenealogjia e Loteve','Paketimi','Loti Final i Klientit']});
    return res.json(modules);
  };
}

deferredListen.server.listen=deferredListen.realListen;
deferredListen.realListen.apply(deferredListen.server,deferredListen.listenArgs);
console.log('Sistemi Genit Cloud Phase 7.1 Odoo Manufacturing installed.');
