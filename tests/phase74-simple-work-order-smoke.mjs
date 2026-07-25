import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="modal-box"></div><div id="content"></div></body></html>', { url:'http://localhost/' });
const { window } = dom;
const { document } = window;

let lastRequest = null;
const state = {
  loaded:true,
  locations:[{id:'rack1',name:'Rafti Sokol',locationType:'SUPPLIER_RACK',supplierId:'sup1',warehouseId:'wh1'}],
  processes:[{id:'proc1',code:'PASTRIM',name:'Pastrim',expectedLossPercent:5}],
  centers:[{id:'center1',code:'PAST-01',name:'Makineria e Pastrimit',processId:'proc1',status:'AVAILABLE',active:true}],
  routes:[{id:'route1',name:'Rruga Ferra',steps:[{id:'step1',processId:'proc1',processName:'Pastrim',workCenterId:'center1',outputProductId:'p1',sequenceNo:10}]}],
  campaigns:[{id:'camp1',campaignNo:'FUSH-001',status:'PLANNED',routeId:'route1',productId:'p1',productName:'Ferra',customerName:'Klienti Test'}],
  orders:[]
};

const App = {
  company:{id:'company1'},
  data:{
    lots:[{id:'lot1',lotNumber:'LOT-SOK-001',supplierId:'sup1',supplierName:'Sokol Kola',productId:'p1',warehouseId:'wh1',status:'AVAILABLE',qualityStatus:'APPROVED',quantityAvailable:58}],
    products:[{id:'p1',code:'105',name:'Ferra'}],
    warehouses:[{id:'wh1',name:'Magazina Lëndë e Parë'}]
  },
  SGPhase71:{state},
  esc(value){return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
  modal(title,body,footer){document.getElementById('modal-box').innerHTML=`<h1>${title}</h1>${body}<footer>${footer}</footer>`;},
  closeModal(){document.getElementById('modal-box').innerHTML='';},
  toast(message,type){if(type==='error') throw new Error(message);},
  async sg71Reload(){},
  async sg71OpenWorkOrder(){},
  async view_mrpWorkOrders(){},
  async sg71ConfirmStart(){},
  async sg71ConfirmComplete(){},
  sg71NewCenter(){},
};

const CloudERP = {
  getAccess(){return {companyIds:['company1']};},
  async request(url,options={}){
    lastRequest={url,options};
    if(url==='/api/mrp/work-orders/wo1'){
      return {id:'wo1',workOrderNo:'UP-001',mrpProcessId:'proc1',processName:'Pastrim',workCenterName:'Makineria e Pastrimit',actualInputQuantity:58,inputs:[{id:'in1',lotNumber:'LOT-SOK-001',supplierName:'Sokol Kola',plannedQuantity:58,bagCount:5}]};
    }
    return {id:'new'};
  }
};

window.App=App;
window.CloudERP=CloudERP;
const context=vm.createContext({window,document,console,App,CloudERP,Number,String,Object,Array,Date,Math,Promise,setTimeout,clearTimeout});
const source=fs.readFileSync(path.join(process.cwd(),'apps/web/phase74-simple-work-order-ui.js'),'utf8');
assert.equal(source.includes('MutationObserver'),false,'Phase 7.4 nuk duhet të përdorë MutationObserver.');
vm.runInContext(source,context,{filename:'phase74-simple-work-order-ui.js'});

App.sg71NewWorkOrder('camp1');
assert.match(document.getElementById('modal-box').textContent,/FLETË-DALJE E BRENDSHME/);
assert.match(document.getElementById('modal-box').textContent,/Materiali që merret nga magazina për në proces/);
assert.match(document.getElementById('modal-box').textContent,/Pastrim/);
assert.match(document.getElementById('modal-box').textContent,/Makineria e Pastrimit/);

App.sg74LotChanged(0,'lot1');
let kgInput=document.querySelector('.sg74-movement-table tbody input[inputmode="decimal"]');
assert.equal(kgInput.value,'58','Pesha e lotit duhet të plotësohet automatikisht.');
App.sg74NumberChanged(0,'bagCount','5');
assert.match(document.getElementById('sg74-total-bags').textContent,/5 thasë/);
assert.match(document.getElementById('sg74-total-kg').textContent,/58 kg/);

await App.sg74SaveWorkOrder();
assert.equal(lastRequest.url,'/api/mrp/work-orders');
assert.equal(lastRequest.options.body.routeStepId,'step1');
assert.equal(lastRequest.options.body.workCenterId,'center1');
assert.equal(lastRequest.options.body.warehouseId,'wh1');
assert.equal(lastRequest.options.body.outputProductId,'p1');
assert.equal(lastRequest.options.body.plannedQuantity,58);
assert.equal(lastRequest.options.body.bagCount,5);
assert.equal(lastRequest.options.body.inputs[0].sourceLocationId,'rack1');

await App.sg71Start('wo1');
assert.match(document.getElementById('modal-box').textContent,/FLETË-DALJE E BRENDSHME/);
assert.match(document.getElementById('modal-box').textContent,/Pesha reale në makineri/);
assert.equal(document.getElementById('sg71-start-in1').value,'58');

await App.sg71Complete('wo1');
assert.match(document.getElementById('modal-box').textContent,/FLETË-HYRJE NGA PROCESI/);
assert.match(document.getElementById('modal-box').textContent,/Produkti i mirë që hyn në magazinë/);
assert.equal(document.getElementById('sg71-end-output').value,'55.1');
assert.equal(document.getElementById('sg71-end-loss').value,'2.9');
assert.match(document.getElementById('sg74-balance').textContent,/Diferenca duhet 0/);

console.log('PHASE74_SIMPLE_WORK_ORDER_SUCCESS');
