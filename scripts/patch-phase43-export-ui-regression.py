from pathlib import Path

path=Path(__file__).resolve().parents[1]/'tests/phase43-export-ui-smoke.cjs'
text=path.read_text(encoding='utf-8')

replacements=[
("packing_list_no:'PL-043',customs_declaration_no:'DOG-043'","packing_list_no:'PL-043',commercial_invoice_no:'CI-043',customs_declaration_no:'DOG-043'"),
("await page.evaluate(()=>App.saveLogisticsVehicle(''));await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('TR 043 EX'))","await page.evaluate(()=>App.saveLogisticsVehicle(''));await page.evaluate(()=>App.navigate('logisticsVehicles'));await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('TR 043 EX'))"),
("await page.evaluate(()=>App.saveExportShipment(''));await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('NG-2026-000001'))","await page.evaluate(()=>App.saveExportShipment(''));await page.evaluate(()=>App.navigate('exportShipments'));await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('NG-2026-000001'))"),
("await page.fill('#sg43-action-cmr','CMR-043');await page.evaluate(id=>App.confirmSealExportShipment(id),ids.shipment)","await page.fill('#sg43-action-cmr','CMR-043');await page.fill('#sg43-action-packing','PL-043');await page.fill('#sg43-action-commercial','CI-043');await page.fill('#sg43-action-customs','DOG-043');await page.evaluate(id=>App.confirmSealExportShipment(id),ids.shipment)"),
]
for old,new in replacements:
    if old in text:
        text=text.replace(old,new,1)
    elif new not in text:
        raise SystemExit(f'UI regression anchor missing: {old[:80]}')

mock_anchor="if(req.method==='GET'&&url.pathname==='/api/export/reports/overview')return json(res,200,{status:[{status:'CLOSED',shipments:1,net_weight:78}],byCustomer:[{id:ids.customer,name:customer.name,shipments:1,net_weight:78,logistics_cost:1600}],byCountry:[{destination_country:'Gjermani',shipments:1,net_weight:78}],byVehicle:[{id:ids.vehicle,plate_no:'TR 043 EX',capacity_kg:100,shipments:1,net_weight:78,utilization_pct:78}],byLot:[{lot_number:'PKG-GJF-PKG-20260723-0001',product_name:product.name,shipments:1,quantity:78}],costs:[{shipment_no:'NG-2026-000001',net_weight:78,freight_cost:1200,customs_cost:300,other_cost:100,total_logistics_cost:1600,cost_per_kg:20.5128}],missingDocuments:[]});"
mock_extra="""if(req.method==='GET'&&url.pathname===`/api/export/shipments/${ids.shipment}/timeline`)return json(res,200,{shipmentId:ids.shipment,shipmentNo:'NG-2026-000001',status:(state.shipments[0]||shipmentRow('DRAFT')).status,events:state.actions.map((action,index)=>({id:'event-'+index,action:'EXPORT_SHIPMENT_'+action.toUpperCase().replace('-','_'),metadata:{action},created_at:new Date().toISOString(),user_name:user.fullName}))});
if(req.method==='GET'&&url.pathname===`/api/export/shipments/${ids.shipment}/documents`)return json(res,200,[]);
if(req.method==='GET'&&url.pathname==='/api/export/reports/catalog')return json(res,200,[{code:'shipment-register',name:'Regjistri i ngarkesave'},{code:'status-summary',name:'Ngarkesa sipas statusit'},{code:'customer',name:'Eksport sipas klientit'},{code:'country',name:'Eksport sipas shtetit'},{code:'vehicle',name:'Ngarkesa sipas automjetit'},{code:'capacity',name:'Shfrytëzimi i kapacitetit'},{code:'driver',name:'Ngarkesa sipas shoferit'},{code:'product',name:'Eksport sipas artikullit'},{code:'lot',name:'Eksport sipas lotit'},{code:'month',name:'Eksport mujor'},{code:'incoterm',name:'Eksport sipas Incoterm'},{code:'border',name:'Kalime sipas pikës kufitare'},{code:'documents',name:'Plotësia e dokumenteve'},{code:'delivery-time',name:'Koha e dorëzimit'},{code:'profitability',name:'Fitimi i ngarkesës'}]);
const extensionReport=url.pathname.match(/^\/api\/export\/reports\/([^/]+)$/);
if(req.method==='GET'&&extensionReport){const code=extensionReport[1];if(code==='shipment-register')return json(res,200,[{shipment_no:'NG-2026-000001',shipment_date:'2026-07-23',status:'CLOSED',customer:customer.name,plate_no:'TR 043 EX',net_weight:78,cmr_no:'CMR-043',packing_list_no:'PL-043',commercial_invoice_no:'CI-043'}]);if(code==='profitability')return json(res,200,[{shipment_no:'NG-2026-000001',customer:customer.name,revenue:24960,goods_cost:10160,logistics_cost:1600,profit:13200}]);return json(res,200,[{label:code,shipments:1,net_weight:78}]);}"""
if mock_extra not in text:
    if mock_anchor not in text: raise SystemExit('Export overview mock anchor missing')
    text=text.replace(mock_anchor,mock_anchor+'\n'+mock_extra,1)

old_report="await page.evaluate(()=>App.closeModal());await page.evaluate(()=>App.navigate('exportReports'));await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('Ngarkesa sipas Statusit'));const report=await page.locator('#content').innerText();['Eksport sipas Klientit','Eksport sipas Shtetit','Performanca e Automjeteve','Lotet e Eksportuara','Kosto e Ngarkesave','Dokumentet që Mungojnë','CLOSED','78'].forEach(t=>{if(!report.includes(t))throw new Error('Raporti nuk përmban: '+t);});"
new_report="await page.evaluate(()=>App.closeModal());await page.evaluate(()=>App.navigate('exportReports'));await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('Regjistri i ngarkesave'));let report=await page.locator('#content').innerText();['15 raporte operative','Eksport sipas klientit','Shfrytëzimi i kapacitetit','Plotësia e dokumenteve','Fitimi i ngarkesës','NG-2026-000001','CI-043'].forEach(t=>{if(!report.includes(t))throw new Error('Raporti nuk përmban: '+t);});await page.evaluate(()=>App.sg43SelectReport('profitability'));await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('13200'));report=await page.locator('#content').innerText();if(!report.includes('Fitimi')||!report.includes('13200'))throw new Error('Raporti i fitimit nuk u shfaq.');"
if old_report in text:
    text=text.replace(old_report,new_report,1)
elif new_report not in text:
    raise SystemExit('Old export report assertion anchor missing')

for marker in ["commercial_invoice_no:'CI-043'","#sg43-action-commercial","/api/export/reports/catalog","App.sg43SelectReport('profitability')"]:
    if marker not in text: raise SystemExit(f'UI regression marker missing after patch: {marker}')
path.write_text(text,encoding='utf-8')
print('Phase 4.3 export browser regression updated.')
