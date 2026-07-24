const base=process.env.PHASE62_API_URL||'http://127.0.0.1:3000';
const deviceHeaders={
  'X-SG-Device-ID':'device-test-galaxy-a73',
  'X-SG-Device-Name':'Galaxy A73 Test',
  'X-SG-Device-Platform':'Android 16',
  'X-SG-Device-Timezone':'Europe/Tirane',
  'X-SG-Client-Time':'2026-07-23T20:00:00.000Z',
  'User-Agent':'SistemiGenit-Test/6.3'
};
async function request(path,options={}){
  const response=await fetch(base+path,{...options,headers:{Accept:'application/json','Content-Type':'application/json',...deviceHeaders,...(options.headers||{})}});
  const raw=await response.text();let body;try{body=raw?JSON.parse(raw):null}catch{body={text:raw}};
  if(!response.ok){const error=new Error(`${response.status} ${path}: ${body?.message||raw}`);error.status=response.status;error.body=body;throw error;}
  return body;
}
function check(condition,message){if(!condition)throw new Error(message);}

const setup=await request('/api/setup/admin',{method:'POST',body:JSON.stringify({
  organizationName:'Genit Traceability',companyName:'Genit Traceability Test',companyNipt:'L62000000T',warehouseName:'Magazina Qendrore',
  adminName:'Administrator Gjurmueshmërie',username:'admin_trace62',email:'trace62@genit.test',password:'AdminTraceability123'
})});
const auth={Authorization:`Bearer ${setup.token}`};
const boot=await request('/api/cloud/bootstrap',{headers:auth});
const company=boot.companies[0],warehouse=boot.warehouses[0];
const supplier=await request('/api/partners',{method:'POST',headers:auth,body:JSON.stringify({
  companyId:company.id,partnerType:'SUPPLIER',code:'264',name:'Fermeri Test 264',nipt:'K62000001F',address:'Lushnjë',city:'Lushnjë',phone:'',email:'',creditLimit:0,active:true
})});
const product=await request('/api/products',{method:'POST',headers:auth,body:JSON.stringify({
  companyId:company.id,categoryId:null,code:'FERRE',barcode:'',name:'Ferrë',baseUnit:'kg',packUnit:'thasë',palletUnit:'paletë',packCoefficient:1,palletCoefficient:1,purchasePrice:100,salePrice:150,vatRate:0,minStock:0,active:true
})});
const farm=await request('/api/trace/farms',{method:'POST',headers:auth,body:JSON.stringify({
  companyId:company.id,supplierId:supplier.id,code:'FERMA-264',name:'Ferma e Fermerit 264',sourceTypeDefault:'CULTIVATED',country:'Shqipëri',region:'Fier',municipality:'Lushnjë',village:'Karbunarë',locationName:'Zona 264',latitude:40.93,longitude:19.70,altitudeM:20,notes:'',active:true
})});
const parcel=await request('/api/trace/parcels',{method:'POST',headers:auth,body:JSON.stringify({
  companyId:company.id,farmId:farm.id,code:'PAR-264-A',name:'Parcela A',sourceType:'CULTIVATED',country:'Shqipëri',region:'Fier',municipality:'Lushnjë',village:'Karbunarë',locationName:'Parcela A',latitude:40.93,longitude:19.70,altitudeM:20,areaHectares:2,notes:'',active:true
})});
const plant=await request('/api/trace/workflow/plants',{method:'POST',headers:auth,body:JSON.stringify({
  companyId:company.id,farmId:farm.id,productId:product.id,code:'BIM-FERRE',name:'Ferrë',botanicalName:'Rubus fruticosus',localName:'Ferrë',plantPart:'Frut',organicStatus:'Në konvertim',certificateNo:'BIO-264',harvestSeason:'Korrik',notes:'',active:true
})});
const registry=await request('/api/trace/workflow/registry',{headers:auth});
check(registry.farms.some(row=>row.id===farm.id),'Ferma e ruajtur nuk u shfaq në regjistër.');
check(registry.plants.some(row=>row.id===plant.id),'Bima e ruajtur nuk u shfaq në regjistër.');

const optionalWeight=await request('/api/trace/weights',{method:'POST',headers:auth,body:JSON.stringify({
  companyId:company.id,warehouseId:warehouse.id,supplierId:supplier.id,productId:product.id,documentDate:'2026-07-24',bagsCount:5,grossWeight:258,packagingWeight:23,discountPercent:0,unitPrice:100,vehiclePlate:'',farmId:null,parcelId:null,harvestDate:'2026-07-24',qualityStatus:'QUARANTINE',notes:'Fermer pa fermë të regjistruar'
})});
await request(`/api/trace/workflow/weights/${optionalWeight.id}/lines`,{method:'PUT',headers:auth,body:JSON.stringify({lines:[{packagingCount:5,grossKg:258,packagingKg:23,note:''}]})});
const optionalDossier=await request(`/api/trace/workflow/weights/${optionalWeight.id}/open-dossier`,{method:'POST',headers:auth,body:JSON.stringify({farmId:null,parcelId:null,plantId:null,packagingUnit:'thasë'})});
const optionalList=await request('/api/trace/workflow/dossiers',{headers:auth});
const optionalRow=optionalList.find(row=>row.id===optionalDossier.id);
check(optionalRow,'Dosja pa Fermë/Bimë nuk u shfaq në regjistrin e dosjeve.');
check(optionalRow.farm_id==null&&optionalRow.plant_id==null,'Ferma/Bima opsionale u ruajtën gabimisht.');
const optionalDetail=await request(`/api/trace/workflow/dossiers/${optionalDossier.id}`,{headers:auth});
check(optionalDetail.dossier.productName==='Ferrë'&&Number(optionalDetail.dossier.acceptedWeight)===235,'Dosja opsionale nuk ruajti artikullin ose peshën neto.');

const weight=await request('/api/trace/weights',{method:'POST',headers:auth,body:JSON.stringify({
  companyId:company.id,warehouseId:warehouse.id,supplierId:supplier.id,productId:product.id,documentDate:'2026-07-23',bagsCount:36,grossWeight:500,packagingWeight:50,discountPercent:0,unitPrice:100,vehiclePlate:'AA 264 TR',farmId:farm.id,parcelId:parcel.id,harvestDate:'2026-07-23',qualityStatus:'QUARANTINE',notes:'Pranim prove'
})});
const savedLines=await request(`/api/trace/workflow/weights/${weight.id}/lines`,{method:'PUT',headers:auth,body:JSON.stringify({lines:[
  {packagingCount:12,grossKg:170,packagingKg:17,note:'Peshimi 1'},
  {packagingCount:12,grossKg:165,packagingKg:16.5,note:'Peshimi 2'},
  {packagingCount:12,grossKg:165,packagingKg:16.5,note:'Peshimi 3'}
]})});
check(savedLines.lineCount===3&&Number(savedLines.packagingCount)===36&&Number(savedLines.grossKg)===500&&Number(savedLines.packagingKg)===50&&Number(savedLines.netKg)===450,`Rreshtat e peshimit gabim: ${JSON.stringify(savedLines)}`);
const weightDetails=await request(`/api/trace/workflow/weights/${weight.id}/details`,{headers:auth});
check(weightDetails.lines.length===3&&Number(weightDetails.weight.accepted_weight)===450,'Formulari nuk ruajti rreshtat realë dhe totalin neto.');
const dossier=await request(`/api/trace/workflow/weights/${weight.id}/open-dossier`,{method:'POST',headers:auth,body:JSON.stringify({farmId:farm.id,parcelId:parcel.id,plantId:plant.id,packagingUnit:'thasë'})});
const qc=await request(`/api/trace/workflow/weights/${weight.id}/quality`,{method:'POST',headers:auth,body:JSON.stringify({result:'APPROVED',moisturePercent:8,impurityPercent:1,laboratoryReference:'LAB-264',notes:'Aprovuar'})});
check(qc.dossierStatus==='QUALITY_APPROVED',`QC status gabim: ${JSON.stringify(qc)}`);
const invoice=await request(`/api/trace/workflow/weights/${weight.id}/purchase-invoice`,{method:'POST',headers:auth,body:JSON.stringify({documentDate:'2026-07-23',notes:'Faturë blerjeje prove'})});
const receipt=await request(`/api/trace/workflow/weights/${weight.id}/receipt`,{method:'POST',headers:auth,body:JSON.stringify({documentDate:'2026-07-23',notes:'Fletë-Hyrje prove'})});
const expectedLot='264-23-07-2026-AMB-36 thasë-PESH-450 kg';
const expectedLabel='264-Ferrë-36 thasë-450 peshë neto';
check(receipt.lot.lotNumber===expectedLot,`Loti është ${receipt.lot.lotNumber}, jo ${expectedLot}`);
check(receipt.lot.label===expectedLabel,`Etiketa është ${receipt.lot.label}, jo ${expectedLabel}`);
check(receipt.dossierId===dossier.id,'Fletë-Hyrja nuk u lidh me dosjen.');
const dossiers=await request('/api/trace/workflow/dossiers',{headers:auth});
const found=dossiers.find(row=>row.id===dossier.id);
check(found&&found.status==='RECEIVED'&&found.lot_number===expectedLot,`Regjistri i dosjeve nuk u përditësua: ${JSON.stringify(found)}`);
const dossierDetail=await request(`/api/trace/workflow/dossiers/${dossier.id}`,{headers:auth});
const timelineTypes=dossierDetail.timeline.map(item=>item.documentType);
for(const required of ['WEIGHT_FORM','INTAKE_QUALITY','PURCHASE_INVOICE','PURCHASE_RECEIPT','LOT_LABEL'])check(timelineTypes.includes(required),`Timeline mungon ${required}: ${timelineTypes.join(',')}`);

await request('/api/audit/client-event',{method:'POST',headers:auth,body:JSON.stringify({
  action:'PDF',companyId:company.id,entityType:'trace_dossier',entityId:dossier.id,documentNo:dossier.dossier_no,sourceView:'traceDossiers',metadata:{format:'merged dossier PDF'}
})});
let events=[];
for(let attempt=0;attempt<30;attempt++){
  events=await request(`/api/audit/events?deviceId=device-test-galaxy-a73&limit=500`,{headers:auth});
  if(events.some(e=>e.action==='PDF')&&events.some(e=>e.document_no===expectedLot||e.document_no===invoice.documentNo||e.entity_type==='weight_ticket'))break;
  await new Promise(resolve=>setTimeout(resolve,300));
}
check(events.length>0,'Auditimi global nuk krijoi evente.');
check(events.some(e=>e.action==='PDF'&&e.entity_id===dossier.id),'Eksporti PDF nuk u auditua.');
check(events.every(e=>e.device_id==='device-test-galaxy-a73'),'Device ID mungon në disa evente.');
check(events.some(e=>e.username_snapshot==='admin_trace62'),'Username nuk u ruajt në audit.');
check(events.some(e=>e.ip_address),'IP nuk u ruajt në audit.');
check(events.every(e=>/^[0-9a-f]{64}$/i.test(e.event_hash)),'Hash-i i auditimit mungon.');
const ordered=events.slice().sort((a,b)=>Number(a.sequence_no)-Number(b.sequence_no));
for(let i=1;i<ordered.length;i++)check(ordered[i].previous_hash===ordered[i-1].event_hash,`Zinxhiri hash u këput te event ${ordered[i].id}`);

console.log(JSON.stringify({supplier:supplier.code,registryFarm:farm.id,registryPlant:plant.id,optionalDossier:optionalDossier.dossier_no,optionalNet:optionalDetail.dossier.acceptedWeight,weight:weight.document_no,weightLines:weightDetails.lines.length,dossier:dossier.dossier_no,invoice:invoice.documentNo,receipt:receipt.receipt.documentNo,lot:receipt.lot.lotNumber,label:receipt.lot.label,auditEvents:events.length,deviceId:events[0].device_id},null,2));
