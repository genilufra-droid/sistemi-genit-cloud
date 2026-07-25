import http from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { installPhase75InventoryRoutes, migratePhase75Inventory } from './phase75-inventory.js';
import { installPhase75InventoryDefaultsMiddleware } from './phase75-inventory-defaults.js';

const originalListen=http.Server.prototype.listen;
let pending=null;
http.Server.prototype.listen=function captureFinalListen(...args){pending={server:this,args};return this;};
try{await import('./phase5-launcher.js');}finally{http.Server.prototype.listen=originalListen;}
if(!pending?.server)throw new Error('Phase 7.5 nuk arriti të kapë serverin e Sistemi Genit.');

const capturedApp=pending.server.listeners('request').find((listener)=>listener?.router||listener?._router);
if(!capturedApp)throw new Error('Phase 7.5 nuk gjeti Express app.');
const router=capturedApp.router||capturedApp._router;
if(!router?.stack)throw new Error('Phase 7.5 nuk gjeti Express router.');

const{Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false,max:8,idleTimeoutMillis:30000});
const JWT_SECRET=process.env.JWT_SECRET;
async function accessibleCompanyIds(user,client=pool){if(user.role==='SUPER_ADMIN'){const{rows}=await client.query('SELECT id FROM companies WHERE tenant_id=$1',[user.tenant_id]);return rows.map((row)=>row.id);}const{rows}=await client.query(`SELECT c.id FROM companies c JOIN user_companies uc ON uc.company_id=c.id WHERE uc.user_id=$1 AND c.tenant_id=$2`,[user.id,user.tenant_id]);return rows.map((row)=>row.id);}
async function assertCompanyAccess(user,companyId,client=pool){const ids=await accessibleCompanyIds(user,client);if(!ids.includes(companyId)){const error=new Error('Nuk keni akses në këtë kompani.');error.status=403;throw error;}}
async function authRequired(req,res,next){const header=req.headers.authorization||'',token=header.startsWith('Bearer ')?header.slice(7):'';if(!token)return res.status(401).json({error:'AUTH_REQUIRED',message:'Duhet të identifikoheni.'});try{const payload=jwt.verify(token,JWT_SECRET,{issuer:'sistemi-genit-cloud'});const{rows}=await pool.query('SELECT id,tenant_id,full_name,username,email,role,active FROM users WHERE id=$1 AND tenant_id=$2 LIMIT 1',[payload.sub,payload.tenantId]);if(!rows[0]?.active)return res.status(401).json({error:'USER_DISABLED',message:'Përdoruesi është çaktivizuar.'});req.user=rows[0];next();}catch{return res.status(401).json({error:'INVALID_TOKEN',message:'Sesioni ka skaduar. Hyni përsëri.'});}}
const requireRoles=(...roles)=>(req,res,next)=>{if(!req.user||!roles.includes(req.user.role))return res.status(403).json({error:'FORBIDDEN',message:'Nuk keni leje për këtë veprim.'});next();};
async function audit({tenantId,userId,action,entityType,entityId=null,companyId=null,metadata={},ip=null},client=pool){await client.query(`INSERT INTO audit_logs(id,tenant_id,user_id,action,entity_type,entity_id,company_id,metadata,ip_address) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,[randomUUID(),tenantId,userId,action,entityType,entityId,companyId,JSON.stringify(metadata),ip]);}
function emitTenant(){}

const terminalLayers=router.stack.splice(-2);
await migratePhase75Inventory(pool);
installPhase75InventoryDefaultsMiddleware({app:capturedApp,pool,authRequired,accessibleCompanyIds});
installPhase75InventoryRoutes({app:capturedApp,pool,authRequired,requireRoles,assertCompanyAccess,accessibleCompanyIds,audit,emitTenant});
router.stack.push(...terminalLayers);

const modulesLayer=router.stack.find((layer)=>layer.route?.path==='/api/modules');
if(modulesLayer?.route?.stack?.length){const target=modulesLayer.route.stack[modulesLayer.route.stack.length-1];target.handle=(_req,res)=>res.json([
  {group:'Cloud Core',phase:1,active:true,items:['Dashboard','Kompanitë','Magazinat','Përdoruesit','Audit Log','Gjurmë Përdoruesi & Pajisjeje']},
  {group:'Blerje & Peshim',phase:2,active:true,items:['Formulari i Peshave','Kërkesa për Ofertë','Porosi Blerjeje','Pranime','Fatura Blerjeje']},
  {group:'Shitje',phase:2,active:true,items:['Oferta','Porosi Shitjeje','Fletë-Dalje','Fatura Shitjeje']},
  {group:'Inventory / Magazina',phase:7.5,active:true,items:['Paneli Inventory','Pranime','Sistemim në Stok','Transferime të Brendshme','Përgatitje Daljeje','Dërgesa','Rregullime Inventari','Gjendja','Lokacionet','Lotet','Rregullat e Furnizimit','Raport Stoku','Raport Lokacionesh','Historiku i Lëvizjeve','Vlerësimi','Stoku në Datë','Stoku pa Lëvizje','Diferencat e Inventarit']},
  {group:'Gjurmueshmëri 360°',phase:6.9,active:true,items:['Ferma & Origjina','Katalogu me 165 kode BioBes','Bimët','Formulari i Peshës','Kontroll Cilësie','Fletë-Hyrje & Etiketë 58 mm','Lote B0/B1','Proces & Gjendje B6','Loti Final B2/B3','Dosja e Dokumenteve']},
  {group:'Prodhimi / Manufacturing',phase:7.4,active:true,items:['Paneli i Prodhimit','Mostrat','Fushatat','Urdhrat e Punës','Proceset','Makineritë','Rrugët e Prodhimit','Lokacionet e Procesit','Kontrollet e Cilësisë','Paketimi','Lotet Finale']},
  {group:'Arka & Banka',phase:5,active:true,items:['Shpenzime','Kategori Shpenzimesh','Mandat Arkëtimi','Mandat Pagese','Ditari i Arkës','Posta e Bankës','Rakordimi','Mbyllja Ditore','Raportet']},
  {group:'Operacione & Logjistikë',phase:6,active:true,items:['Shoferë','Itinerare','Udhëtime','Karburant','Mirëmbajtje & Riparime','Raporte Logjistike','Asete & Investime','Amortizim','Raporte Asetesh']}
]);}

pending.server.listen=originalListen;
originalListen.apply(pending.server,pending.args);
console.log('Sistemi Genit Cloud Phase 7.5: Odoo Inventory, search-as-you-type, transferime, inventar dhe raporte installed.');
