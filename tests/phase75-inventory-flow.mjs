import assert from 'node:assert/strict';

const base=process.env.TEST_API_URL||'http://127.0.0.1:3000';
async function api(path,{method='GET',token,body}={}){
  const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
  const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{data=text;}
  if(!response.ok)throw new Error(`${method} ${path} -> ${response.status}: ${typeof data==='string'?data:JSON.stringify(data)}`);
  return data;
}

const setup=await api('/api/setup/admin',{method:'POST',body:{organizationName:'BioBes Test',companyName:'BioBes',companyNipt:'L12345678A',warehouseName:'Magazina Qendrore',adminName:'Administrator',username:'admin',email:'admin@example.com',password:'Test12345!'}});
const token=setup.token,companyId=setup.companyId,warehouseId=setup.warehouseId;
assert.ok(token&&companyId&&warehouseId);

const dashboard=await api('/api/inventory/dashboard',{token});
assert.equal(Number(dashboard.receipts||0),0);
const locations=await api('/api/inventory/locations',{token});
const stock=locations.find((x)=>x.locationType==='STOCK');
const input=locations.find((x)=>x.locationType==='INPUT');
assert.ok(stock&&input,'Lokacionet standarde INPUT/STOCK duhet të krijohen automatikisht.');
const operations=await api('/api/inventory/operation-types',{token});
const receiptOp=operations.find((x)=>x.operationKind==='RECEIPT');
const internalOp=operations.find((x)=>x.operationKind==='INTERNAL');
assert.ok(receiptOp&&internalOp,'Operacionet standarde duhet të krijohen automatikisht.');

const product=await api('/api/products',{method:'POST',token,body:{companyId,categoryId:null,code:'105',barcode:'',name:'Ferra',baseUnit:'kg',packUnit:'thes',palletUnit:'paletë',packCoefficient:1,palletCoefficient:1,purchasePrice:100,salePrice:0,vatRate:0,active:true}});
const supplier=await api('/api/partners',{method:'POST',token,body:{companyId,partnerType:'SUPPLIER',code:'264',name:'Sokol Kola',nipt:'',address:'',city:'',phone:'',email:'',creditLimit:0,active:true}});
const lot=await api('/api/inventory/lots',{method:'POST',token,body:{companyId,warehouseId,productId:product.id,supplierId:supplier.id,lotNumber:'264-FERRA-5-58',qualityStatus:'APPROVED',locationText:'Rafti Sokol',notes:''}});

const receipt=await api('/api/inventory/transfers',{method:'POST',token,body:{companyId,warehouseId,operationTypeId:receiptOp.id,operationKind:'RECEIPT',partnerId:supplier.id,sourceLocationId:null,destinationLocationId:input.id,scheduledDate:'2026-07-25',sourceDocumentType:'WEIGHT_TICKET',sourceDocumentId:null,sourceDocumentNo:'PESH-001',notes:'',lines:[{productId:product.id,lotId:lot.id,plannedQuantity:58,doneQuantity:58,unit:'kg',unitCost:100,fromLocationId:null,toLocationId:input.id,notes:''}]}});
await api(`/api/inventory/transfers/${receipt.id}/validate`,{method:'POST',token});
let quants=await api(`/api/inventory/quants?lotId=${lot.id}`,{token});
assert.equal(Number(quants.find((x)=>x.locationId===input.id)?.onHand),58,'Pranimi duhet të krijojë 58 kg në Hyrje.');

const transfer=await api('/api/inventory/transfers',{method:'POST',token,body:{companyId,warehouseId,operationTypeId:internalOp.id,operationKind:'INTERNAL',partnerId:null,sourceLocationId:input.id,destinationLocationId:stock.id,scheduledDate:'2026-07-25',sourceDocumentType:'',sourceDocumentId:null,sourceDocumentNo:'',notes:'',lines:[{productId:product.id,lotId:lot.id,plannedQuantity:35,doneQuantity:35,unit:'kg',unitCost:100,fromLocationId:input.id,toLocationId:stock.id,notes:''}]}});
await api(`/api/inventory/transfers/${transfer.id}/reserve`,{method:'POST',token});
await api(`/api/inventory/transfers/${transfer.id}/validate`,{method:'POST',token});
quants=await api(`/api/inventory/quants?lotId=${lot.id}`,{token});
assert.equal(Number(quants.find((x)=>x.locationId===input.id)?.onHand),23,'Pas transferimit duhet të mbeten 23 kg në Hyrje.');
assert.equal(Number(quants.find((x)=>x.locationId===stock.id)?.onHand),35,'Në Stok duhet të hyjnë 35 kg.');

const count=await api('/api/inventory/counts',{method:'POST',token,body:{companyId,warehouseId,locationId:stock.id,countDate:'2026-07-25',notes:'Numërim prove',lines:[{productId:product.id,lotId:lot.id,countedQuantity:33,unitCost:100}]}});
await api(`/api/inventory/counts/${count.id}/validate`,{method:'POST',token});
quants=await api(`/api/inventory/quants?lotId=${lot.id}`,{token});
assert.equal(Number(quants.find((x)=>x.locationId===stock.id)?.onHand),33,'Inventari fizik duhet të korrigjojë Stokun në 33 kg.');

for(const endpoint of ['stock','locations','lots','moves','valuation','at-date?date=2026-07-25','slow-stock?days=1','discrepancies']){
  const rows=await api(`/api/inventory/reports/${endpoint}`,{token});
  assert.ok(Array.isArray(rows),`Raporti ${endpoint} duhet të kthejë tabelë.`);
}
const modules=await api('/api/modules',{token});
assert.ok(modules.some((m)=>m.group==='Inventory / Magazina'),'Katalogu duhet të përmbajë Inventory / Magazina.');
console.log('PHASE75_INVENTORY_SUCCESS receipt=58 internal=35 counted=33 reports=8');
