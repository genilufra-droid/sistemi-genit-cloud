'use strict';
const base=process.env.TEST_API_URL||'http://127.0.0.1:3000';
async function request(path,options={}){
  const response=await fetch(base+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const raw=await response.text();let body;try{body=JSON.parse(raw)}catch{body={text:raw}};
  if(!response.ok){const error=new Error(`${response.status} ${path}: ${body.message||raw}`);error.status=response.status;error.body=body;throw error;}
  return body;
}
async function main(){
  const setup=await request('/api/setup/admin',{method:'POST',body:JSON.stringify({organizationName:'Genit Export Test',companyName:'Kompania Eksportit',companyNipt:'L43000000E',warehouseName:'Magazina Eksport',adminName:'Administrator Eksporti',username:'admin_phase43',email:'admin43@example.com',password:'AdminPhase43123'})});
  const auth={Authorization:`Bearer ${setup.token}`};
  const boot=await request('/api/cloud/bootstrap',{headers:auth});
  const company=boot.companies[0],warehouse=boot.warehouses[0];
  const rawProduct=await request('/api/products',{method:'POST',headers:auth,body:JSON.stringify({companyId:company.id,code:'GJF',name:'Gjethe Ferre RAW',baseUnit:'kg',packUnit:'thes',palletUnit:'palete',packCoefficient:1,palletCoefficient:1,purchasePrice:100,salePrice:180,vatRate:0,active:true})});
  const processedProduct=await request('/api/products',{method:'POST',headers:auth,body:JSON.stringify({companyId:company.id,code:'GJF-PRC',name:'Gjethe Ferre e Përpunuar',baseUnit:'kg',packUnit:'thes',palletUnit:'palete',packCoefficient:1,palletCoefficient:1,purchasePrice:0,salePrice:240,vatRate:0,active:true})});
  const packagedProduct=await request('/api/products',{method:'POST',headers:auth,body:JSON.stringify({companyId:company.id,code:'GJF-PKG',name:'Gjethe Ferre Paketë 500g',baseUnit:'kg',packUnit:'pako',palletUnit:'palete',packCoefficient:0.5,palletCoefficient:1,purchasePrice:0,salePrice:320,vatRate:0,active:true})});
  const supplier=await request('/api/partners',{method:'POST',headers:auth,body:JSON.stringify({companyId:company.id,partnerType:'SUPPLIER',code:'FER-043',name:'Fermeri Tomorri Export',nipt:'K43000000T',address:'Skrapar',city:'Skrapar',phone:'',email:'',creditLimit:0,active:true})});
  const customer=await request('/api/partners',{method:'POST',headers:auth,body:JSON.stringify({companyId:company.id,partnerType:'CUSTOMER',code:'KLI-043',name:'Herbal Import GmbH',nipt:'DE43000000',address:'Berlin',city:'Berlin',phone:'+49 30 0000',email:'import@example.com',creditLimit:100000,active:true})});
  const farm=await request('/api/trace/farms',{method:'POST',headers:auth,body:JSON.stringify({companyId:company.id,supplierId:supplier.id,code:'FERMA-043',name:'Ferma Mali i Tomorrit',sourceTypeDefault:'WILD_COLLECTION',country:'Shqiperi',region:'Berat',municipality:'Skrapar',village:'Gjerbes',locationName:'Mali i Tomorrit',active:true})});
  const parcel=await request('/api/trace/parcels',{method:'POST',headers:auth,body:JSON.stringify({companyId:company.id,farmId:farm.id,code:'ZONA-043',name:'Zona e Mbledhjes 43',sourceType:'WILD_COLLECTION',country:'Shqiperi',region:'Berat',municipality:'Skrapar',village:'Gjerbes',locationName:'Shpatet e Tomorrit',active:true})});
  const weight=await request('/api/trace/weights',{method:'POST',headers:auth,body:JSON.stringify({companyId:company.id,warehouseId:warehouse.id,supplierId:supplier.id,productId:rawProduct.id,documentDate:'2026-07-23',bagsCount:20,grossWeight:205,packagingWeight:5,discountPercent:0,unitPrice:100,vehiclePlate:'AA043AA',farmId:farm.id,parcelId:parcel.id,harvestDate:'2026-07-21',qualityStatus:'QUARANTINE',notes:'Pranim për eksport'})});
  const receipt=await request(`/api/weights/${weight.id}/post-receipt`,{method:'POST',headers:auth,body:JSON.stringify({farmId:farm.id,parcelId:parcel.id,harvestDate:'2026-07-21',qualityStatus:'QUARANTINE',botanicalName:'Rubus fruticosus',plantPart:'Gjethe',notes:'RAW për eksport'})});
  await request(`/api/trace/lots/${receipt.lot.id}/quality-check`,{method:'POST',headers:auth,body:JSON.stringify({result:'APPROVED',moisturePercent:9,impurityPercent:1,laboratoryReference:'LAB-43',notes:'Aprovuar'})});
  const process=await request('/api/trace/process-orders',{method:'POST',headers:auth,body:JSON.stringify({companyId:company.id,warehouseId:warehouse.id,outputProductId:processedProduct.id,processType:'Pastrim dhe tharje',orderDate:'2026-07-23',outputQuantity:90,wasteQuantity:3,lossQuantity:7,directCost:900,outputQualityStatus:'APPROVED',notes:'100 RAW në 90 PRC',inputs:[{lotId:receipt.lot.id,quantity:100}]})});
  const processPosted=await request(`/api/trace/process-orders/${process.id}/post`,{method:'POST',headers:auth,body:'{}'});
  const packaging=await request('/api/trace/packaging-orders',{method:'POST',headers:auth,body:JSON.stringify({companyId:company.id,warehouseId:warehouse.id,inputLotId:processPosted.outputLot.id,outputProductId:packagedProduct.id,orderDate:'2026-07-23',inputQuantity:80,outputQuantity:78,wasteQuantity:2,packageCount:156,unitsPerPackage:1,netWeightPerPackage:0.5,directCost:500,outputQualityStatus:'APPROVED',expiryDate:'2028-07-23',notes:'156 pako për eksport'})});
  const packagingPosted=await request(`/api/trace/packaging-orders/${packaging.id}/post`,{method:'POST',headers:auth,body:'{}'});
  const vehicle=await request('/api/logistics/vehicles',{method:'POST',headers:auth,body:JSON.stringify({companyId:company.id,code:'KAM-043',plateNo:'TR 043 EX',vehicleType:'Kamion frigoriferik',make:'Mercedes',model:'Actros',year:2024,capacityKg:100,odometerKm:25000,fuelType:'Naftë',fuelNormL100Km:28,ownershipType:'OWNED',chassisNo:'WDB430000043',registrationExpiry:'2027-07-23',insuranceExpiry:'2027-07-23',technicalInspectionExpiry:'2027-01-23',active:true,notes:'Kamion eksporti'})});
  const shipmentBody={companyId:company.id,warehouseId:warehouse.id,customerId:customer.id,vehicleId:vehicle.id,salesDocumentId:null,shipmentDate:'2026-07-23',plannedDepartureAt:'2026-07-23T08:00:00+02:00',driverName:'Shoferi Eksport',driverPhone:'+355690000043',carrierName:'Kompania Eksportit',trailerPlate:'TR 043 RM',containerNo:'CONT-043',sealNo:'',origin:'Lushnjë, Shqipëri',destination:'Berlin, Gjermani',destinationCountry:'Gjermani',borderPoint:'Kapshticë',routeText:'Lushnjë → Kapshticë → Selanik → Beograd → Berlin',incoterm:'DAP',distanceKm:1750,grossWeight:82,palletCount:2,packageCount:156,cmrNo:'CMR-043',packingListNo:'PL-043',customsDeclarationNo:'DOG-043',freightCost:1200,customsCost:300,otherCost:100,notes:'Ngarkesë test eksporti',items:[{lotId:packagingPosted.outputLot.id,quantity:78,packageCount:156,palletCount:2,palletReference:'PAL-043-A',grossWeight:82,unitPrice:320}]};
  const shipment=await request('/api/export/shipments',{method:'POST',headers:auth,body:JSON.stringify(shipmentBody)});
  if(shipment.status!=='DRAFT'||shipment.shipment_no!=='NG-2026-000001')throw new Error(`Numri/statusi i ngarkesës gabim: ${shipment.shipment_no} ${shipment.status}`);
  const competitor=await request('/api/export/shipments',{method:'POST',headers:auth,body:JSON.stringify({...shipmentBody,containerNo:'CONT-044',cmrNo:'CMR-044',packingListNo:'PL-044',customsDeclarationNo:'DOG-044',items:[{...shipmentBody.items[0],quantity:1,packageCount:2,palletCount:0,palletReference:'PAL-044'}]})});
  await request(`/api/export/shipments/${shipment.id}/plan`,{method:'POST',headers:auth,body:'{}'});
  let reservationBlocked=false;try{await request(`/api/export/shipments/${competitor.id}/plan`,{method:'POST',headers:auth,body:'{}'});}catch(error){reservationBlocked=error.status===409;}
  if(!reservationBlocked)throw new Error('Rezervimi konkurrues i të njëjtit lot nuk u bllokua.');
  await request(`/api/export/shipments/${shipment.id}/start-loading`,{method:'POST',headers:auth,body:'{}'});
  await request(`/api/export/shipments/${shipment.id}/seal`,{method:'POST',headers:auth,body:JSON.stringify({sealNo:'SEAL-043',containerNo:'CONT-043',cmrNo:'CMR-043'})});
  const dispatched=await request(`/api/export/shipments/${shipment.id}/dispatch`,{method:'POST',headers:auth,body:'{}'});
  if(dispatched.status!=='DISPATCHED'||dispatched.delivery.documentNo!=='FD-2026-000001')throw new Error(`Nisja/Fletë-Dalja gabim: ${JSON.stringify(dispatched)}`);
  let duplicateDispatchBlocked=false;try{await request(`/api/export/shipments/${shipment.id}/dispatch`,{method:'POST',headers:auth,body:'{}'});}catch(error){duplicateDispatchBlocked=error.status===409;}
  if(!duplicateDispatchBlocked)throw new Error('Nisja e dyfishtë nuk u bllokua.');
  const lotsAfter=await request('/api/trace/lots',{headers:auth});
  const packagedAfter=lotsAfter.find((row)=>row.id===packagingPosted.outputLot.id);
  if(Number(packagedAfter.quantity_available)!==0||packagedAfter.status!=='DEPLETED')throw new Error(`Loti PACKAGED nuk u konsumua saktë: ${JSON.stringify(packagedAfter)}`);
  const stock=await request('/api/stock',{headers:auth});
  const packagedStock=Number((stock.find((row)=>row.product_id===packagedProduct.id&&row.warehouse_id===warehouse.id)||{}).quantity_base||0);
  if(packagedStock!==0)throw new Error(`Stoku i artikullit PACKAGED duhet 0, doli ${packagedStock}.`);
  const deliveryNotes=await request('/api/documents?type=DELIVERY_NOTE',{headers:auth});
  if(deliveryNotes.length!==1||deliveryNotes[0].document_no!=='FD-2026-000001'||deliveryNotes[0].status!=='CONFIRMED')throw new Error('Fletë-Dalja automatike nuk u krijua saktë.');
  await request(`/api/export/shipments/${shipment.id}/at-border`,{method:'POST',headers:auth,body:'{}'});
  await request(`/api/export/shipments/${shipment.id}/deliver`,{method:'POST',headers:auth,body:JSON.stringify({deliveryProofRef:'POD-043',deliveredAt:'2026-07-25T15:30:00+02:00'})});
  await request(`/api/export/shipments/${shipment.id}/close`,{method:'POST',headers:auth,body:'{}'});
  const detail=await request(`/api/export/shipments/${shipment.id}`,{headers:auth});
  if(detail.status!=='CLOSED'||detail.seal_no!=='SEAL-043'||detail.delivery_proof_ref!=='POD-043'||detail.delivery_document_no!=='FD-2026-000001')throw new Error(`Mbyllja e ngarkesës gabim: ${JSON.stringify(detail)}`);
  const trace=await request(`/api/trace/lots/${packagingPosted.outputLot.id}/360`,{headers:auth});
  if(!trace.shipments.some((row)=>row.shipment_no==='NG-2026-000001'&&row.status==='CLOSED'))throw new Error('Ngarkesa nuk u shfaq në Gjurmueshmërinë 360° të lotit.');
  const reports=await request('/api/export/reports/overview?from=2026-07-01&to=2026-07-31',{headers:auth});
  if(!reports.status.some((row)=>row.status==='CLOSED'&&Number(row.net_weight)===78))throw new Error('Raporti sipas statusit është gabim.');
  if(!reports.byCustomer.some((row)=>row.name==='Herbal Import GmbH'&&Number(row.net_weight)===79))throw new Error('Raporti sipas klientit është gabim.');
  if(!reports.byCountry.some((row)=>row.destination_country==='Gjermani'))throw new Error('Raporti sipas shtetit është gabim.');
  if(!reports.byVehicle.some((row)=>row.plate_no==='TR 043 EX'))throw new Error('Raporti sipas automjetit është gabim.');
  if(!reports.byLot.some((row)=>row.lot_number===packagingPosted.outputLot.lotNumber&&Number(row.quantity)===79))throw new Error('Raporti sipas lotit duhet të përfshijë Draftin konkurrues dhe ngarkesën kryesore.');
  await request(`/api/export/shipments/${competitor.id}/cancel`,{method:'POST',headers:auth,body:'{}'});
  console.log(JSON.stringify({result:'TEST_SUCCESS',shipmentNo:shipment.shipment_no,status:'CLOSED',packagedLot:packagingPosted.outputLot.lotNumber,quantityDispatched:78,deliveryNote:dispatched.delivery.documentNo,sealNo:'SEAL-043',cmrNo:'CMR-043',proofOfDelivery:'POD-043',reservationBlocked,duplicateDispatchBlocked,lotAvailable:0,stockAvailable:0,reports:{status:reports.status.length,customers:reports.byCustomer.length,countries:reports.byCountry.length,vehicles:reports.byVehicle.length,lots:reports.byLot.length,costs:reports.costs.length}},null,2));
}
main().catch((error)=>{console.error(error.stack||error);if(error.body)console.error(JSON.stringify(error.body,null,2));process.exit(1);});
