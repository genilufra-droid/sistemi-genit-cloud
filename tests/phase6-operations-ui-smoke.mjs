import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';

const loader=await fs.readFile(new URL('../apps/web/phase6-operations-ui.js',import.meta.url),'utf8');
const match=loader.match(/var payload='([^']+)'/);
if(!match)throw new Error('Payload-i i kompresuar Faza 6 mungon.');
const source=gunzipSync(Buffer.from(match[1],'base64')).toString('utf8');
const dom=new JSDOM('<!doctype html><html><body><aside class="sidebar"></aside><header class="topbar"><h2></h2></header><main id="content"></main><div id="modal-overlay"><div id="modal-box"></div></div></body></html>',{runScripts:'outside-only',url:'https://genit.test'});
const {window}=dom;
const calls=[];
window.App={currentView:'dashboard',data:{suppliers:[],warehouses:[],users:[]},company:{id:'c1',name:'Test'},esc:(v)=>String(v??''),navigate(){},toast(){},modal(_t,b){window.document.getElementById('modal-box').innerHTML=b||'';},closeModal(){},rowActionMenu(){return'';}};
window.Auth={requirePermission(){},hasPermission(){return true;}};
window.CloudERP={apiUrl:'https://api.test',offlineTestMode:false,getAccess(){return{companyIds:['c1']};},request(path){calls.push(path);return Promise.resolve([]);}};
window.eval(source);
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
function assert(c,m){if(!c)throw new Error(m);}
assert(window.SGPhase6Operations?.cloud===true,'Marker-i global mungon.');
assert(window.document.querySelector('#sg6-nav-section'),'Menuja Faza 6 mungon.');
assert(window.document.body.textContent.includes('Shpenzime'),'Shpenzimet mungojnë në menu.');
assert(window.document.body.textContent.includes('Asete & Investime'),'Asetet mungojnë në menu.');
await window.App.view_opsDashboard();
assert(calls.includes('/api/operations/expenses'),'Dashboard-i nuk kërkoi shpenzimet.');
assert(calls.includes('/api/operations/assets'),'Dashboard-i nuk kërkoi asetet.');
assert(calls.includes('/api/operations/trips'),'Dashboard-i nuk kërkoi udhëtimet.');
console.log(JSON.stringify({result:'TEST_SUCCESS',menu:true,expenses:true,logistics:true,assets:true,cloudRequests:calls.length},null,2));
