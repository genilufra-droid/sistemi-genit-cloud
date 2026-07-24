/* SG_PHASE63_TRACEABILITY_UI_HOTFIX_START — Sistemi Genit */
(function (global) {
  'use strict';
  var App=global.App,Cloud=global.CloudERP,Auth=global.Auth;
  if(!App||!Cloud||!Cloud.apiUrl||Cloud.offlineTestMode||global.__SG_PHASE63_TRACEABILITY_UI_HOTFIX__)return;
  global.__SG_PHASE63_TRACEABILITY_UI_HOTFIX__=true;

  var previewData=null;
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function num(v){var n=Number(String(v==null?'':v).replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:0;}
  function fmt(v){return num(v).toLocaleString('sq-AL',{maximumFractionDigits:3});}
  function value(id){var el=document.getElementById(id);return el?el.value:'';}
  function selectedId(id){var el=document.getElementById(id);if(!el)return'';if(global.SAC&&typeof global.SAC.getSelectedId==='function')return global.SAC.getSelectedId(el)||el.value||'';return el.value||'';}
  function selectedText(id){var el=document.getElementById(id);if(!el)return'';var option=el.options&&el.options[el.selectedIndex];return option?String(option.textContent||'').trim():String(el.value||'');}
  function companyId(){return(App.company&&App.company.id)||((Cloud.getAccess&&Cloud.getAccess().companyIds||[])[0])||'';}
  function operatorName(){try{var u=(Auth&&Auth.currentUser)||(Auth&&Auth.getCurrentUser&&Auth.getCurrentUser());return(u&&(u.displayName||u.fullName||u.username))||'Administrator';}catch(_){return'Administrator';}}
  function toastError(error){App.toast(error&&error.message?error.message:String(error),'error');}

  function makeOptionalLabel(id,text){var el=document.getElementById(id);if(!el)return;var group=el.closest('.form-group');var label=group&&group.querySelector('label');if(label)label.textContent=text+' (opsionale)';}
  function applyOptionalOriginUi(){
    makeOptionalLabel('wf-p4-farm','Ferma');
    makeOptionalLabel('sg62-weight-plant','Bima');
    makeOptionalLabel('wf-p4-parcel','Parcela/Zona');
    var meta=document.querySelector('.sg62-weight-meta');
    if(meta&&!meta.querySelector('.sg63-origin-note')){
      var note=document.createElement('div');note.className='alert alert-info sg62-span-2 sg63-origin-note';
      note.textContent='Ferma, Bima dhe Parcela plotësohen vetëm kur fermeri i ka të regjistruara. Artikulli i magazinës mbetet i detyrueshëm.';
      meta.insertBefore(note,meta.firstChild);
    }
  }

  var originalWeightView=App._viewWeightForm;
  if(typeof originalWeightView==='function'){
    App._viewWeightForm=async function(existingId){var result=await originalWeightView.call(this,existingId);applyOptionalOriginUi();return result;};
  }

  App.sg62SaveFarm=async function(){
    try{
      var payload={companyId:companyId(),supplierId:selectedId('sg62-farm-supplier')||null,code:value('sg62-farm-code'),name:value('sg62-farm-name'),sourceTypeDefault:'CULTIVATED',country:'Shqipëri',region:value('sg62-farm-region'),municipality:value('sg62-farm-municipality'),village:value('sg62-farm-village'),locationName:value('sg62-farm-location'),latitude:value('sg62-farm-lat')?num(value('sg62-farm-lat')):null,longitude:value('sg62-farm-lng')?num(value('sg62-farm-lng')):null,altitudeM:null,notes:value('sg62-farm-notes'),active:true};
      if(!payload.supplierId||!payload.code||!payload.name)throw new Error('Fermeri, kodi dhe emri i fermës janë të detyrueshëm.');
      var created=await Cloud.request('/api/trace/farms',{method:'POST',body:payload});
      await Cloud.loadTraceabilityWorkflow();
      if(!(App.data.traceFarms||[]).some(function(row){return row.id===created.id;}))throw new Error('Ferma u ruajt, por nuk u kthye në regjistër. Rifreskoni dhe provoni përsëri.');
      this.closeModal();this.toast('Ferma u ruajt dhe u shfaq në regjistër.');await this.view_traceRegistry();
    }catch(error){toastError(error);}
  };

  App.sg62SavePlant=async function(existingId){
    try{
      var payload={companyId:companyId(),farmId:selectedId('sg62-plant-farm'),productId:selectedId('sg62-plant-product')||null,code:value('sg62-plant-code'),name:value('sg62-plant-name'),botanicalName:value('sg62-plant-botanical'),localName:value('sg62-plant-local'),plantPart:value('sg62-plant-part'),organicStatus:value('sg62-plant-organic'),certificateNo:value('sg62-plant-cert'),harvestSeason:value('sg62-plant-season'),notes:value('sg62-plant-notes'),active:true};
      if(!payload.farmId||!payload.code||!payload.name)throw new Error('Ferma, kodi dhe emri i bimës janë të detyrueshëm.');
      var path=existingId?'/api/trace/workflow/plants/'+encodeURIComponent(existingId):'/api/trace/workflow/plants';
      if(existingId)delete payload.companyId;
      var saved=await Cloud.request(path,{method:existingId?'PATCH':'POST',body:payload});
      await Cloud.loadTraceabilityWorkflow();
      if(!(App.data.tracePlants||[]).some(function(row){return row.id===(saved.id||existingId);}))throw new Error('Bima u ruajt, por nuk u kthye në regjistër.');
      this.closeModal();this.toast(existingId?'Bima u përditësua në regjistër.':'Bima u ruajt dhe u shfaq në regjistër.');await this.view_traceRegistry();
    }catch(error){toastError(error);}
  };

  function collectLines(){var lines=[];document.querySelectorAll('#sg62-weight-lines-body tr').forEach(function(row){var inputs=row.querySelectorAll('input');var item={packagingCount:num(inputs[0]&&inputs[0].value),grossKg:num(inputs[1]&&inputs[1].value),packagingKg:num(inputs[2]&&inputs[2].value),note:''};if(item.packagingCount||item.grossKg||item.packagingKg)lines.push(item);});return lines;}

  App.sg62SaveWeight=async function(existingId){
    try{
      if(Auth&&Auth.requirePermission)Auth.requirePermission(existingId?'documents.edit':'documents.create');
      var lines=collectLines();if(!lines.length)throw new Error('Plotësoni të paktën një rresht peshimi.');
      var totals=lines.reduce(function(o,x){o.packagingCount+=x.packagingCount;o.grossKg+=x.grossKg;o.packagingKg+=x.packagingKg;return o;},{packagingCount:0,grossKg:0,packagingKg:0});
      var farmId=selectedId('wf-p4-farm')||null,parcelId=selectedId('wf-p4-parcel')||null,plantId=selectedId('sg62-weight-plant')||null;
      if((parcelId||plantId)&&!farmId)throw new Error('Zgjidhni Fermën vetëm kur përdorni Bimë ose Parcelë.');
      var payload={companyId:companyId(),warehouseId:selectedId('wf-warehouse'),supplierId:selectedId('wf-supplier'),productId:selectedId('wf-product'),documentDate:value('wf-date'),bagsCount:totals.packagingCount,grossWeight:totals.grossKg,packagingWeight:totals.packagingKg,discountPercent:num(value('wf-percent')),unitPrice:num(value('wf-price')),vehiclePlate:value('wf-p4-plate'),farmId:farmId,parcelId:parcelId,harvestDate:value('wf-p4-harvest')||value('wf-date'),qualityStatus:'QUARANTINE',notes:value('wf-notes')};
      if(!payload.warehouseId||!payload.supplierId||!payload.productId)throw new Error('Magazina, fermeri/furnitori dhe artikulli janë të detyrueshëm.');
      if(totals.grossKg<=totals.packagingKg)throw new Error('Pesha bruto duhet të jetë më e madhe se ambalazhi.');
      var row=await Cloud.request(existingId?'/api/trace/weights/'+encodeURIComponent(existingId):'/api/trace/weights',{method:existingId?'PATCH':'POST',body:payload});
      var id=existingId||row.id;
      await Cloud.request('/api/trace/workflow/weights/'+encodeURIComponent(id)+'/lines',{method:'PUT',body:{lines:lines}});
      await Cloud.request('/api/trace/workflow/weights/'+encodeURIComponent(id)+'/open-dossier',{method:'POST',body:{farmId:farmId,parcelId:parcelId,plantId:plantId,packagingUnit:value('sg62-pack-unit')||'thasë'}});
      this.toast('Formulari u ruajt në regjistër dhe dosja u hap.');await this._viewWeightForm(id);
    }catch(error){toastError(error);}
  };

  function collectPreview(){
    var lines=collectLines();var totals=lines.reduce(function(o,x){o.amb+=x.packagingCount;o.net+=Math.max(0,x.grossKg-x.packagingKg);return o;},{amb:0,net:0});
    var no=((document.querySelector('.sg62-weight-no strong')||{}).textContent||'AUTOMATIK').trim();
    return{documentNo:no,date:value('wf-date'),supplier:selectedText('wf-supplier'),product:selectedText('wf-product'),packagingUnit:value('sg62-pack-unit')||'thasë',amb:totals.amb,net:totals.net,operator:operatorName()};
  }
  function company(){return App.company||{name:'Sistemi Genit',nipt:''};}
  function receiptHtml(data){var c=company();return '<main class="sg63-ticket"><section class="sg63-controls"><button onclick="window.print()">Printo</button><button class="close" onclick="window.close()">Mbyll</button></section><article><header><h3>KOPJE FORMULARI</h3><h1>FORMULARI I PESHËS</h1><h2>'+esc(c.name||'Sistemi Genit')+'</h2><p>'+esc(data.supplier||'')+'</p></header><hr><dl><div><dt>NIPT:</dt><dd>'+esc(c.nipt||'—')+'</dd></div><div><dt>Data/Ora:</dt><dd>'+esc(data.date||'—')+'</dd></div><div><dt>Dokumenti Nr:</dt><dd>'+esc(data.documentNo||'AUTOMATIK')+'</dd></div><div><dt>Operatori:</dt><dd>'+esc(data.operator)+'</dd></div><div><dt>Artikulli:</dt><dd>'+esc(data.product||'—')+'</dd></div></dl><hr><section class="sg63-values"><div><span>AMB</span><strong>'+fmt(data.amb)+' '+esc(data.packagingUnit)+'</strong></div><div><span>PESHË NETO</span><strong>'+fmt(data.net)+' kg</strong></div></section><hr><footer><p>Sistemi Genit Cloud</p><p>'+esc(data.documentNo||'')+'</p></footer></article></main>';}
  function ticketCss(){return '@page{size:58mm auto;margin:2mm}*{box-sizing:border-box}body{margin:0;background:#f3f3f3;font-family:Arial,sans-serif;color:#111}.sg63-controls{padding:10px;background:#fff;display:flex;gap:8px;position:sticky;top:0}.sg63-controls button{border:0;border-radius:4px;padding:10px 14px;background:#714b67;color:#fff;font-size:15px;font-weight:700}.sg63-controls .close{background:#e5e7eb;color:#111}.sg63-ticket article{width:58mm;min-height:82mm;margin:10px auto;background:#fff;padding:3mm;box-shadow:0 2px 12px rgba(0,0,0,.15)}header{text-align:center}header h3,header h1,header h2,header p{margin:1mm 0}header h3{font-size:12px}header h1{font-size:17px}header h2{font-size:13px}header p{font-size:10px}hr{border:0;border-top:.35mm solid #111;margin:2mm 0}dl{margin:0;font-size:9px}dl div{display:flex;justify-content:space-between;gap:3mm;margin:1mm 0}dt{font-weight:700}dd{margin:0;text-align:right}.sg63-values{display:grid;grid-template-columns:1fr 1fr;border:.35mm solid #111}.sg63-values div{text-align:center;padding:3mm 1mm}.sg63-values div+div{border-left:.35mm solid #111}.sg63-values span{display:block;font-size:10px;font-weight:800}.sg63-values strong{display:block;font-size:16px;margin-top:2mm}footer{text-align:center;font-size:8px}footer p{margin:1mm 0}@media print{body{background:#fff}.sg63-controls{display:none}.sg63-ticket article{box-shadow:none;margin:0;width:54mm;padding:1mm}}';}

  App.sg62OpenWeightDocumentPreview=function(){
    try{previewData=collectPreview();if(!previewData.amb&&!previewData.net)throw new Error('Plotësoni të dhënat e peshimit.');var w=global.open('','_blank');if(!w)return this.toast('Shfletuesi bllokoi pamjen e printimit.','error');w.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(previewData.documentNo)+'</title><style>'+ticketCss()+'</style></head><body>'+receiptHtml(previewData)+'</body></html>');w.document.close();}catch(error){toastError(error);}
  };
  App.sg62PrintWeightDocument=function(){if(!previewData)previewData=collectPreview();var w=global.open('','_blank');if(!w)return this.toast('Shfletuesi bllokoi printimin.','error');w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(previewData.documentNo)+'</title><style>'+ticketCss()+'</style></head><body>'+receiptHtml(previewData)+'<script>window.onload=function(){window.print();};<\/script></body></html>');w.document.close();};
  App.sg62PdfWeightDocument=function(){try{previewData=previewData||collectPreview();if(!global.jspdf||!global.jspdf.jsPDF)throw new Error('PDF nuk është i disponueshëm.');var doc=new global.jspdf.jsPDF({unit:'mm',format:[58,82],orientation:'portrait'}),c=company();doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('KOPJE FORMULARI',29,7,{align:'center'});doc.setFontSize(13);doc.text('FORMULARI I PESHES',29,13,{align:'center'});doc.setFontSize(10);doc.text(String(c.name||'Sistemi Genit').slice(0,28),29,18,{align:'center'});doc.setLineWidth(.3);doc.line(2,23,56,23);doc.setFontSize(7);doc.setFont('helvetica','normal');doc.text('Dokumenti: '+String(previewData.documentNo||''),3,28);doc.text('Data: '+String(previewData.date||''),3,32);doc.text('Artikulli: '+String(previewData.product||'').slice(0,28),3,36);doc.line(2,40,56,40);doc.line(29,40,29,65);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('AMB',15.5,46,{align:'center'});doc.text('PESHE NETO',42.5,46,{align:'center'});doc.setFontSize(15);doc.text(fmt(previewData.amb),15.5,57,{align:'center'});doc.text(fmt(previewData.net),42.5,57,{align:'center'});doc.setFontSize(7);doc.text(String(previewData.packagingUnit||''),15.5,62,{align:'center'});doc.text('kg',42.5,62,{align:'center'});doc.line(2,65,56,65);doc.setFont('helvetica','normal');doc.setFontSize(6);doc.text('Sistemi Genit Cloud',29,74,{align:'center'});doc.save('Formular_Peshe_58mm_'+String(previewData.documentNo||'').replace(/[^a-z0-9_-]+/gi,'_')+'.pdf');}catch(error){toastError(error);}};

  var observer=new MutationObserver(function(){applyOptionalOriginUi();});observer.observe(document.documentElement,{childList:true,subtree:true});
  applyOptionalOriginUi();
})(window);
/* SG_PHASE63_TRACEABILITY_UI_HOTFIX_END */
