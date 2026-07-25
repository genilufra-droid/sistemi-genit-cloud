import assert from 'node:assert/strict';

const base=process.env.TEST_API_URL||'http://127.0.0.1:3000';
async function api(path,{method='GET',token,body}={}){
  const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
  const raw=await response.text();let data;try{data=raw?JSON.parse(raw):null;}catch{data=raw;}
  if(!response.ok)throw new Error(`${method} ${path} -> ${response.status}: ${typeof data==='string'?data:JSON.stringify(data)}`);
  return data;
}

const setup=await api('/api/setup/admin',{method:'POST',body:{organizationName:'BioBes Phase76',companyName:'BIOBES',companyNipt:'L12345678A',warehouseName:'Magazina Qendrore',adminName:'Administrator',username:'admin',email:'admin76@example.com',password:'Test12345!'}});
const token=setup.token,companyId=setup.companyId,warehouseId=setup.warehouseId;
assert.ok(token&&companyId&&warehouseId);

const locations=await api('/api/inventory/locations',{token});
const input=locations.find((x)=>x.locationType==='INPUT');
const stock=locations.find((x)=>x.locationType==='STOCK');
const output=locations.find((x)=>x.locationType==='OUTPUT');
assert.ok(input&&stock&&output);
const operations=await api('/api/inventory/operation-types',{token});
const receiptOp=operations.find((x)=>x.operationKind==='RECEIPT');
const internalOp=operations.find((x)=>x.operationKind==='INTERNAL');
const deliveryOp=operations.find((x)=>x.operationKind==='DELIVERY');
assert.ok(receiptOp&&internalOp&&deliveryOp);

const product=await api('/api/products',{method:'POST',token,body:{companyId,categoryId:null,code:'105',barcode:'',name:'Ferra',baseUnit:'kg',packUnit:'thes',palletUnit:'paletë',packCoefficient:1,palletCoefficient:1,purchasePrice:100,salePrice:150,vatRate:0,active:true}});
const supplier=await api('/api/partners',{method:'POST',token,body:{companyId,partnerType:'SUPPLIER',code:'264',name:'Sokol Kola',nipt:'',address:'Lushnjë',city:'Lushnjë',phone:'',email:'',creditLimit:0,active:true}});
const customer=await api('/api/partners',{method:'POST',token,body:{companyId,partnerType:'CUSTOMER',code:'GEM',name:'GEM',nipt:'',address:'Gjermani',city:'Berlin',phone:'',email:'',creditLimit:0,active:true}});
const lot=await api('/api/inventory/lots',{method:'POST',token,body:{companyId,warehouseId,productId:product.id,supplierId:supplier.id,lotNumber:'264-FERRA-5-58',qualityStatus:'APPROVED',locationText:'Rafti Sokol',notes:''}});

const receipt=await api('/api/inventory/transfers',{method:'POST',token,body:{companyId,warehouseId,operationTypeId:receiptOp.id,operationKind:'RECEIPT',partnerId:supplier.id,sourceLocationId:null,destinationLocationId:input.id,scheduledDate:'2026-07-25',sourceDocumentType:'WEIGHT_TICKET',sourceDocumentId:null,sourceDocumentNo:'PESH-001',notes:'Pranim prove',lines:[{productId:product.id,lotId:lot.id,plannedQuantity:58,doneQuantity:58,unit:'kg',unitCost:100,fromLocationId:null,toLocationId:input.id,notes:''}]}});
await api(`/api/inventory/transfers/${receipt.id}/document-details`,{method:'PATCH',token,body:{destinationAddress:'Magazina Qendrore',authorizedPerson:'Sokol Kola',vehiclePlate:'AA 123 BB',receiverName:'Magazinieri',transporterName:'Transportuesi',accountantName:'Llogaritari',warehouseKeeperName:'Magazinieri'}});
await api(`/api/inventory/transfers/${receipt.id}/validate`,{method:'POST',token});

const internal=await api('/api/inventory/transfers',{method:'POST',token,body:{companyId,warehouseId,operationTypeId:internalOp.id,operationKind:'INTERNAL',partnerId:null,sourceLocationId:input.id,destinationLocationId:stock.id,scheduledDate:'2026-07-25',sourceDocumentType:'',sourceDocumentId:null,sourceDocumentNo:'',notes:'Sistemim',lines:[{productId:product.id,lotId:lot.id,plannedQuantity:35,doneQuantity:35,unit:'kg',unitCost:100,fromLocationId:input.id,toLocationId:stock.id,notes:''}]}});
await api(`/api/inventory/transfers/${internal.id}/reserve`,{method:'POST',token});
await api(`/api/inventory/transfers/${internal.id}/validate`,{method:'POST',token});

const delivery=await api('/api/inventory/transfers',{method:'POST',token,body:{companyId,warehouseId,operationTypeId:deliveryOp.id,operationKind:'DELIVERY',partnerId:customer.id,sourceLocationId:stock.id,destinationLocationId:null,scheduledDate:'2026-07-26',sourceDocumentType:'SALE',sourceDocumentId:null,sourceDocumentNo:'FAT-001',notes:'Dërgesë prove',lines:[{productId:product.id,lotId:lot.id,plannedQuantity:10,doneQuantity:10,unit:'kg',unitCost:150,fromLocationId:stock.id,toLocationId:null,notes:''}]}});
await api(`/api/inventory/transfers/${delivery.id}/document-details`,{method:'PATCH',token,body:{destinationAddress:'GEM, Gjermani',authorizedPerson:'Përfaqësues GEM',vehiclePlate:'TR 001 AB',receiverName:'GEM',transporterName:'Transportuesi Test',accountantName:'Financa BIOBES',warehouseKeeperName:'Magazinieri BIOBES'}});
await api(`/api/inventory/transfers/${delivery.id}/reserve`,{method:'POST',token});
await api(`/api/inventory/transfers/${delivery.id}/validate`,{method:'POST',token});

const count=await api('/api/inventory/counts',{method:'POST',token,body:{companyId,warehouseId,locationId:stock.id,countDate:'2026-07-27',notes:'Numërim prove',lines:[{productId:product.id,lotId:lot.id,countedQuantity:24,unitCost:100}]}});
await api(`/api/inventory/counts/${count.id}/validate`,{method:'POST',token});

const catalog=await api('/api/inventory/reports-v2',{token});
assert.equal(catalog.length,20,'Duhet të ketë saktësisht 20 raporte Inventory.');
const ids=catalog.map((x)=>x.id);
assert.equal(new Set(ids).size,20,'ID-të e raporteve duhet të jenë unike.');
for(const report of catalog){
  let path=`/api/inventory/reports-v2/${report.id}?from=2026-01-01&to=2026-12-31`;
  if(report.id==='stock-at-date')path+='&atDate=2026-07-27';
  if(report.id==='slow-stock')path+='&days=1';
  const rows=await api(path,{token});
  assert.ok(Array.isArray(rows),`${report.label} duhet të kthejë tabelë.`);
}

const printData=await api(`/api/inventory/transfers/${delivery.id}/print-data`,{token});
assert.equal(printData.transferNo.startsWith('OUT-'),true);
assert.equal(printData.destinationAddress,'GEM, Gjermani');
assert.equal(printData.vehiclePlate,'TR 001 AB');
assert.equal(printData.lines.length,1);
assert.equal(Number(printData.totalQuantity),10);
assert.equal(Number(printData.totalValue),1500);

const modules=await api('/api/modules',{token});
const inventory=modules.find((x)=>x.group==='Inventory / Magazina');
assert.equal(inventory.phase,7.6);
assert.ok(inventory.items.includes('Regjistri i Fletë-Hyrjeve'));
assert.ok(inventory.items.includes('Regjistri i Fletë-Daljeve'));
assert.ok(inventory.items.includes('Gjurmueshmëria Furnitor-Lot-Klient'));
console.log('PHASE76_SUCCESS reports=20 receipt=58 internal=35 delivery=10 count=24 document=FLETE_DALJE');
