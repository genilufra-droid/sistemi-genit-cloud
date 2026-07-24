import http from 'node:http';
import net from 'node:net';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import {
  installBiobesLotCodeRoutes,
  migrateBiobesLotCode,
  rewriteShipmentLotSql,
} from './biobes-lot-code.js';
import { migrateBiobesLotStageCompatibility } from './biobes-lot-stage-compat.js';

const realCreateServer = http.createServer;
const realListen = net.Server.prototype.listen;
let capturedApp = null;
const pendingServers = [];

http.createServer = function captureBiobesApp(app,...args) {
  capturedApp = app;
  return realCreateServer.call(this,app,...args);
};
net.Server.prototype.listen = function deferBiobesListen(...args) {
  pendingServers.push({server:this,args});
  return this;
};

const previousQuery = pg.Client.prototype.query;
if (!previousQuery.__sgBiobesLotRewrite) {
  const patchedQuery = function biobesLotQuery(config,...args) {
    if (typeof config==='string') config=rewriteShipmentLotSql(config);
    else if (config&&typeof config==='object'&&typeof config.text==='string') config={...config,text:rewriteShipmentLotSql(config.text)};
    return previousQuery.call(this,config,...args);
  };
  patchedQuery.__sgBiobesLotRewrite=true;
  pg.Client.prototype.query=patchedQuery;
}

const { Pool } = pg;
const pool = new Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false,
  max:4,
  idleTimeoutMillis:30000,
});
const JWT_SECRET=process.env.JWT_SECRET;

async function accessibleCompanyIds(user,client=pool){
  if(user.role==='SUPER_ADMIN')return(await client.query('SELECT id FROM companies WHERE tenant_id=$1',[user.tenant_id])).rows.map((row)=>row.id);
  return(await client.query(`SELECT c.id FROM companies c JOIN user_companies uc ON uc.company_id=c.id WHERE uc.user_id=$1 AND c.tenant_id=$2`,[user.id,user.tenant_id])).rows.map((row)=>row.id);
}
async function assertCompanyAccess(user,companyId,client=pool){
  if(!(await accessibleCompanyIds(user,client)).includes(companyId)){const error=new Error('Nuk keni akses në këtë kompani.');error.status=403;throw error;}
}
async function authRequired(req,res,next){
  const header=req.headers.authorization||'';const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token)return res.status(401).json({error:'AUTH_REQUIRED',message:'Duhet të identifikoheni.'});
  try{
    const payload=jwt.verify(token,JWT_SECRET,{issuer:'sistemi-genit-cloud'});
    const{rows}=await pool.query('SELECT id,tenant_id,full_name,username,email,role,active FROM users WHERE id=$1 AND tenant_id=$2 LIMIT 1',[payload.sub,payload.tenantId]);
    if(!rows[0]?.active)return res.status(401).json({error:'USER_DISABLED',message:'Përdoruesi është çaktivizuar.'});
    req.user=rows[0];next();
  }catch{return res.status(401).json({error:'INVALID_TOKEN',message:'Sesioni ka skaduar. Hyni përsëri.'});}
}
const requireRoles=(...roles)=>(req,res,next)=>req.user&&roles.includes(req.user.role)?next():res.status(403).json({error:'FORBIDDEN',message:'Nuk keni leje për këtë veprim.'});

try {
  await import('./phase5-launcher.js');
  http.createServer=realCreateServer;
  if(!capturedApp)throw new Error('Bootstrap-i BioBes nuk arriti të kapë Express API.');

  await migrateBiobesLotStageCompatibility(pool);
  await migrateBiobesLotCode(pool);
  const router=capturedApp.router||capturedApp._router;
  if(!router?.stack)throw new Error('Express route stack nuk u gjet për logjikën BioBes.');
  const terminalLayers=router.stack.splice(-2);
  installBiobesLotCodeRoutes({app:capturedApp,pool,authRequired,requireRoles,assertCompanyAccess,accessibleCompanyIds});
  router.stack.push(...terminalLayers);

  net.Server.prototype.listen=realListen;
  if(!pendingServers.length)throw new Error('Bootstrap-i BioBes nuk gjeti server për nisje.');
  for(const pending of pendingServers)realListen.apply(pending.server,pending.args);
  console.log('Logjika reale BioBes u instalua: B0/B1 hyrje, B6 gjendje/proces, B2/B3 lot shitjeje, origjinë, grup, nënlote, periudhë, kod artikulli dhe vit.');
} catch(error) {
  http.createServer=realCreateServer;
  net.Server.prototype.listen=realListen;
  await pool.end().catch(()=>{});
  throw error;
}
