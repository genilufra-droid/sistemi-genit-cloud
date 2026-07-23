'use strict';
const http = require('node:http');
const { chromium } = require('playwright');

const ids = {
  tenant:'11111111-1111-4111-8111-111111111111', company:'22222222-2222-4222-8222-222222222222',
  warehouse:'33333333-3333-4333-8333-333333333333', user:'44444444-4444-4444-8444-444444444444',
  product:'55555555-5555-4555-8555-555555555555', supplier:'66666666-6666-4666-8666-666666666666',
  farm:'77777777-7777-4777-8777-777777777777', parcel:'88888888-8888-4888-8888-888888888888',
  weight:'99999999-9999-4999-8999-999999999999', lot:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', receipt:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
};
const token='phase4-browser-token';
const user={id:ids.user,tenantId:ids.tenant,fullName:'Administrator Cloud',username:'admin_cloud',email:'admin@test.local',role:'SUPER_ADMIN',active:true,mustChangePassword:false};
const state={patchCalls:0,postCalls:0,bootstrapCalls:0,lots:[]};
const product={id:ids.product,tenant_id:ids.tenant,company_id:ids.company,code:'GJF',name:'Gjethe Ferre',base_unit:'kg',pack_unit:'thes',pallet_unit:'palete',pack_coefficient:'1',pallet_coefficient:'1',purchase_price:'100',sale_price:'180',vat_rate:'0',active:true,version:1};
const supplier={id:ids.supplier,tenant_id:ids.tenant,company_id:ids.company,partner_type:'SUPPLIER',code:'FER-001',name:'Fermeri Test',nipt:'K00000000T',address:'Skrapar',city:'Skrapar',active:true,version:1};
const farm={id:ids.farm,tenant_id:ids.tenant,company_id:ids.company,supplier_id:ids.supplier,supplier_name:'Fermeri Test',code:'FERMA-001',name:'Ferma Mali i Tomorrit',source_type_default:'WILD_COLLECTION',country:'Shqipëri',region:'Berat',municipality:'Skrapar',village:'Gjerbës',location_name:'Mali i Tomorrit',active:true};
const parcel={id:ids.parcel,tenant_id:ids.tenant,company_id:ids.company,farm_id:ids.farm,farm_name:farm.name,farm_code:farm.code,code:'ZONA-04',name:'Zona e Mbledhjes 04',source_type:'WILD_COLLECTION',country:'Shqipëri',region:'Berat',municipality:'Skrapar',village:'Gjerbës',location_name:'Shpatet e Tomorrit',active:true};
let weight={id:ids.weight,tenant_id:ids.tenant,company_id:ids.company,warehouse_id:ids.warehouse,supplier_id:ids.supplier,supplier_name:supplier.name,product_id:ids.product,product_name:product.name,document_no:'PESH-2026-000001',document_date:'2026-07-22',bags_count:'20',gross_weight:'205',packaging_weight:'5',net_weight:'200',discount_percent:'0',accepted_weight:'200',unit_price:'100',total_value:'20000',vehicle_plate:'AA001AA',farm_id:ids.farm,parcel_id:ids.parcel,harvest_date:'2026-07-20',quality_status:'QUARANTINE',status:'DRAFT',version:1};

function json(res,status,payload){const body=JSON.stringify(payload);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'});res.end(body);}
function authorized(req){return req.headers.authorization===`Bearer ${token}`;}
function readBody(req){return new Promise((resolve,reject)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{try{resolve(body?JSON.parse(body):{})}catch(e){reject(e)}});req.on('error',reject);});}
function bootstrap(){return {user,access:{companyIds:[ids.company],warehouseIds:[ids.warehouse]},companies:[{id:ids.company,name:'Kompania Test',nipt:'L12345678A',currency:'ALL',active:true,version:1}],warehouses:[{id:ids.warehouse,company_id:ids.company,code:'MQ',name:'Magazina Qendrore',active:true,version:1}],categories:[],products:[product],partners:[supplier],weights:[weight],stock:[{company_id:ids.company,warehouse_id:ids.warehouse,product_id:ids.product,code:'GJF',name:'Gjethe Ferre',base_unit:'kg',quantity_base:state.lots.length?'200':'0'}],documents:[],users:[{...user,tenant_id:ids.tenant,full_name:user.fullName,company_ids:[ids.company],warehouse_ids:[ids.warehouse]}],audit:[],revision:state.patchCalls+state.postCalls,serverTime:new Date().toISOString()};}
function lotRow(){return {id:ids.lot,tenant_id:ids.tenant,company_id:ids.company,warehouse_id:ids.warehouse,warehouse_name:'Magazina Qendrore',product_id:ids.product,product_code:'GJF',product_name:'Gjethe Ferre',supplier_id:ids.supplier,supplier_name:'Fermeri Test',farm_id:ids.farm,farm_code:'FERMA-001',farm_name:farm.name,parcel_id:ids.parcel,parcel_code:'ZONA-04',parcel_name:parcel.name,source_weight_ticket_id:ids.weight,source_document_id:ids.receipt,weight_document_no:'PESH-2026-000001',receipt_document_no:'FH-2026-000001',lot_number:'RAW-GJF-20260722-0001',lot_type:'RAW',status:'QUARANTINE',quality_status:'QUARANTINE',harvest_date:'2026-07-20',production_date:'2026-07-22',quantity_created:'200',quantity_available:'200',quantity_consumed:'0',base_unit:'kg',unit_cost:'100',botanical_name:'Rubus fruticosus',plant_part:'Gjethe',location_text:'Shpatet e Tomorrit, Gjerbës, Skrapar, Berat, Shqipëri',created_at:new Date().toISOString()};}

const api=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS') return json(res,204,{});
  const url=new URL(req.url,'http://127.0.0.1:3100');
  try{
    if(req.method==='GET'&&url.pathname==='/api/setup/status') return json(res,200,{needsSetup:false});
    if(req.method==='GET'&&url.pathname==='/api/auth/me') return authorized(req)?json(res,200,{user,companyIds:[ids.company],warehouseIds:[ids.warehouse]}):json(res,401,{message:'Pa autorizim'});
    if(!authorized(req)) return json(res,401,{message:'Pa autorizim'});
    if(req.method==='GET'&&url.pathname==='/api/cloud/bootstrap'){state.bootstrapCalls++;return json(res,200,bootstrap());}
    if(req.method==='GET'&&url.pathname==='/api/master-data/capabilities')return json(res,200,[{entityType:'FARMER',canCreate:true},{entityType:'DRIVER',canCreate:true},{entityType:'ROUTE',canCreate:true},{entityType:'AGENT',canCreate:true},{entityType:'ASSET',canCreate:true},{entityType:'EXPENSE_CATEGORY',canCreate:true},{entityType:'CASH_ACCOUNT',canCreate:true,native:true},{entityType:'BANK_ACCOUNT',canCreate:true,native:true}]);
    if(req.method==='GET'&&url.pathname==='/api/trace/farms') return json(res,200,[farm]);
    if(req.method==='GET'&&url.pathname==='/api/trace/parcels') return json(res,200,[parcel]);
    if(req.method==='GET'&&url.pathname==='/api/trace/lots') return json(res,200,state.lots);
    if(req.method==='GET'&&url.pathname==='/api/weights') return json(res,200,[weight]);
    if(req.method==='PATCH'&&url.pathname===`/api/trace/weights/${ids.weight}`){const body=await readBody(req);state.patchCalls++;weight={...weight,warehouse_id:body.warehouseId,supplier_id:body.supplierId,product_id:body.productId,document_date:body.documentDate,bags_count:String(body.bagsCount),gross_weight:String(body.grossWeight),packaging_weight:String(body.packagingWeight),net_weight:String(Number(body.grossWeight)-Number(body.packagingWeight)),discount_percent:String(body.discountPercent),accepted_weight:String((Number(body.grossWeight)-Number(body.packagingWeight))*(1-Number(body.discountPercent)/100)),unit_price:String(body.unitPrice),vehicle_plate:body.vehiclePlate,farm_id:body.farmId,parcel_id:body.parcelId,harvest_date:body.harvestDate,quality_status:body.qualityStatus,notes:body.notes,version:weight.version+1};return json(res,200,weight);}
    if(req.method==='POST'&&url.pathname===`/api/weights/${ids.weight}/post-receipt`){state.postCalls++;weight={...weight,status:'CONFIRMED',lot_id:ids.lot,receipt_document_id:ids.receipt};state.lots=[lotRow()];return json(res,200,{weightTicketId:ids.weight,status:'CONFIRMED',lot:{id:ids.lot,lotNumber:'RAW-GJF-20260722-0001',status:'QUARANTINE',qualityStatus:'QUARANTINE',quantityCreated:200,quantityAvailable:200},receipt:{id:ids.receipt,documentNo:'FH-2026-000001',status:'CONFIRMED'}});}
    if(req.method==='GET'&&url.pathname===`/api/trace/lots/${ids.lot}/360`){const lot={...lotRow(),supplier_nipt:supplier.nipt,region:'Berat',municipality:'Skrapar',village:'Gjerbës',location_name:'Shpatet e Tomorrit',latitude:'40.52',longitude:'20.22',weight_document_date:'2026-07-22',gross_weight:'205',packaging_weight:'5',net_weight:'200',discount_percent:'0',accepted_weight:'200',receipt_document_date:'2026-07-22'};return json(res,200,{lot,movements:[{id:'m1',lot_id:ids.lot,movement_type:'RECEIPT_IN',quantity:'200',balance_after:'200',source_document_no:'FH-2026-000001',movement_at:new Date().toISOString()}],qualityChecks:[],processes:[],shipments:[]});}
    return json(res,404,{message:`${req.method} ${url.pathname}`});
  }catch(error){return json(res,500,{message:error.message});}
});

(async()=>{
  await new Promise((resolve,reject)=>api.listen(3100,'127.0.0.1',e=>e?reject(e):resolve()));
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1500,height:1000}});
  await context.addInitScript(t=>localStorage.setItem('sg_cloud_access_token_v1',t),token);
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
  page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`)});
  page.on('dialog',d=>d.accept());
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#app-shell',{state:'visible',timeout:30000});
  await page.waitForFunction(()=>Boolean(window.SGPhase4&&window.CloudERP&&window.App));
  await page.waitForFunction(()=>App.currentView==='dashboard'&&App.company&&App.company.name==='Kompania Test',null,{timeout:30000});
  await page.evaluate(()=>App.navigate('weightList'));
  await page.waitForSelector(`button[onclick*="${ids.weight}"]`,{timeout:30000});
  await page.evaluate(id=>App._viewWeightForm(id),ids.weight);
  await page.waitForSelector('#sg-p4-origin-panel',{state:'visible'});
  await page.waitForSelector('#wf-lot');
  await page.waitForSelector('#wf-p4-farm');
  await page.waitForSelector('#wf-p4-parcel');
  const formState=await page.evaluate(()=>({lotValue:document.getElementById('wf-lot').value,lotReadonly:document.getElementById('wf-lot').readOnly,farm:document.getElementById('wf-p4-farm').value,parcel:document.getElementById('wf-p4-parcel').value,postButton:[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Posto Pranimin'))}));
  if(!formState.lotReadonly||!formState.lotValue.includes('AUTOMATIK')||formState.farm!==ids.farm||formState.parcel!==ids.parcel||!formState.postButton) throw new Error(`Formulari Phase 4 nuk u konfigurua: ${JSON.stringify(formState)}`);

  await page.evaluate(id=>App.postWeightReceipt(id),ids.weight);
  await page.waitForTimeout(1000);
  if(state.patchCalls!==1||state.postCalls!==1){
    const diagnostic=await page.evaluate(()=>({content:document.getElementById('content')?.innerText.slice(0,1500),toast:document.body.innerText.slice(-700),farm:document.getElementById('wf-p4-farm')?.value,parcel:document.getElementById('wf-p4-parcel')?.value}));
    throw new Error(`Postimi i operatorit nuk arriti në API: state=${JSON.stringify(state)} diagnostic=${JSON.stringify(diagnostic)}`);
  }

  await page.evaluate(()=>App.view_traceLots());
  await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('RAW-GJF-20260722-0001'),null,{timeout:30000});
  const traceListText=await page.locator('#content').innerText();
  if(traceListText.includes('+ Lot i Ri')||!traceListText.includes('Loti nuk krijohet manualisht')) throw new Error('Lista e loteve lejon krijim manual ose nuk shpjegon rrjedhën automatike.');
  await page.evaluate(id=>App.openLot360(id),ids.lot);
  await page.waitForSelector('.sg-p4-timeline',{state:'visible'});
  const modalText=await page.locator('#modal-box').innerText();
  if(!modalText.includes('PESH-2026-000001')||!modalText.includes('FH-2026-000001')||!modalText.includes('200')) throw new Error('Kartela 360° nuk tregon Peshimin, Fletë-Hyrjen dhe 200 kg.');
  if(state.bootstrapCalls<2) throw new Error(`Bootstrap-i Cloud nuk u rifreskua pas postimit: ${JSON.stringify(state)}`);
  if(errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({result:'TEST_SUCCESS',manualLotButton:false,originPanel:true,weightDraftPatched:state.patchCalls,receiptPosted:state.postCalls,lot:'RAW-GJF-20260722-0001',trace360:true},null,2));
  await browser.close(); api.close();
})().catch(async error=>{console.error(error.stack||error);api.close();process.exit(1);});
