/* SG_PHASE62_TRACEABILITY_WORKFLOW_UI_START — Sistemi Genit */
(function (global) {
  'use strict';
  var App = global.App;
  var Cloud = global.CloudERP;
  var Auth = global.Auth;
  if (!App || !Cloud || !Cloud.apiUrl || Cloud.offlineTestMode || global.__SG_PHASE62_TRACEABILITY_WORKFLOW_UI__) return;
  global.__SG_PHASE62_TRACEABILITY_WORKFLOW_UI__ = true;

  var weightState = { id:null, lines:[], dossier:null };
  var dossierState = null;

  function esc(value) { return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function attr(value) { return esc(value); }
  function num(value) { var n=Number(value); return Number.isFinite(n)?n:0; }
  function fmt(value) { return num(value).toLocaleString('sq-AL',{maximumFractionDigits:3}); }
  function camel(row) { var out={}; Object.keys(row||{}).forEach(function(k){out[k.replace(/_([a-z])/g,function(_m,c){return c.toUpperCase();})]=row[k];}); return out; }
  function value(id) { var el=document.getElementById(id); return el?el.value:''; }
  function byId(rows,id) { return (rows||[]).find(function(x){return x.id===id;}); }
  function companyId() { return (App.company&&App.company.id)||((Cloud.getAccess&&Cloud.getAccess().companyIds||[])[0])||''; }
  function today() { return new Date().toISOString().slice(0,10); }
  function dateSq(value) { if(!value)return '—'; var p=String(value).slice(0,10).split('-'); return p.length===3?p[2]+'-'+p[1]+'-'+p[0]:String(value); }
  function statusLabel(status) {
    var map={WEIGHED:'Peshimi',QUALITY_PENDING:'Cilësi në pritje',QUALITY_APPROVED:'Cilësi e aprovuar',QUALITY_REJECTED:'Refuzuar',PURCHASE_INVOICED:'Faturë Blerje',RECEIVED:'Fletë-Hyrje / Lot RAW',IN_PROCESS:'Në Proces',SALES_ORDERED:'Porosi Shitje',CLOSED:'Mbyllur',DRAFT:'Draft',CONFIRMED:'Postuar'};
    return map[status]||status||'—';
  }
  function badge(status) { var good=/APPROVED|RECEIVED|CONFIRMED|CLOSED|SALES_ORDERED/.test(status||''); var bad=/REJECTED|CANCELLED/.test(status||''); return '<span class="sg62-badge '+(good?'ok':bad?'bad':'wait')+'">'+esc(statusLabel(status))+'</span>'; }
  function options(rows,selected,label,textFn) {
    return '<option value="">— '+esc(label)+' —</option>'+(rows||[]).map(function(x){var text=textFn?textFn(x):((x.code?x.code+' — ':'')+(x.name||x.productName||x.supplierName||x.id));return '<option value="'+attr(x.id)+'"'+(x.id===selected?' selected':'')+'>'+esc(text)+'</option>';}).join('');
  }
  function selectedId(id) {
    var el=document.getElementById(id);
    if(!el)return '';
    if(global.SAC&&typeof global.SAC.getSelectedId==='function')return global.SAC.getSelectedId(el)||el.value||'';
    return el.value||'';
  }
  function toastError(error) { App.toast(error&&error.message?error.message:String(error),'error'); }

  async function loadWorkflow() {
    if (Cloud.loadPhase4) await Cloud.loadPhase4();
    var results=await Promise.all([
      Cloud.request('/api/trace/workflow/registry'),
      Cloud.request('/api/trace/workflow/dossiers')
    ]);
    var registry=results[0]||{};
    App.data.traceFarms=(registry.farms||[]).map(camel);
    App.data.tracePlants=(registry.plants||[]).map(camel);
    App.data.traceParcels=(registry.parcels||[]).map(camel);
    App.data.traceDossiers=(results[1]||[]).map(camel);
    return {registry:registry,dossiers:App.data.traceDossiers};
  }
  Cloud.loadTraceabilityWorkflow=loadWorkflow;

  function installMenu() {
    if(document.getElementById('sg62-trace-nav'))return;
    var sidebar=document.querySelector('.sidebar');
    if(!sidebar)return;
    var section=document.createElement('div');
    section.id='sg62-trace-nav';
    section.className='nav-section sg62-nav';
    section.innerHTML='<div class="nav-section-title">GJURMUESHMËRI 360°</div>'+
      '<div class="nav-item" data-sg62-view="traceRegistry" onclick="App.navigate(\'traceRegistry\')"><span class="icon">🌱</span><span>Ferma &amp; Bimët</span></div>'+
      '<div class="nav-item" data-sg62-view="weightList" onclick="App.navigate(\'weightList\')"><span class="icon">⚖️</span><span>Formularët e Peshës</span></div>'+
      '<div class="nav-item" data-sg62-view="traceDossiers" onclick="App.navigate(\'traceDossiers\')"><span class="icon">📁</span><span>Dosjet e Gjurmueshmërisë</span></div>'+
      '<div class="nav-item" data-sg62-view="traceLots" onclick="App.navigate(\'traceLots\')"><span class="icon">🏷️</span><span>Lotet &amp; Etiketat</span></div>';
    var operations=document.getElementById('sg6-nav-section');
    if(operations&&operations.parentNode===sidebar)sidebar.insertBefore(section,operations);else sidebar.appendChild(section);
  }
  function activate(view,title) {
    App.currentView=view;
    document.querySelectorAll('.nav-item').forEach(function(item){item.classList.toggle('active',item.dataset.sg62View===view);});
    var h=document.querySelector('.topbar h2');if(h)h.textContent=title;
  }

  function registryToolbar() {
    return '<div class="sg62-toolbar"><div class="sg62-actions"><button class="btn btn-primary" onclick="App.sg62EditFarm()">+ Ferma</button><button class="btn btn-primary" onclick="App.sg62EditPlant()">+ Bima</button></div><div class="sg62-search"><span>⌕</span><input id="sg62-registry-search" placeholder="Kërko kod fermeri, fermë, bimë, zonë..." oninput="App.sg62FilterRegistry(this.value)"></div></div>';
  }

  App.view_traceRegistry=async function(){
    try{
      activate('traceRegistry','Ferma, Origjina dhe Bimët');
      await loadWorkflow();
      var farms=(this.data.traceFarms||[]).map(function(f){
        var plants=(App.data.tracePlants||[]).filter(function(p){return p.farmId===f.id;});
        var parcels=(App.data.traceParcels||[]).filter(function(p){return p.farmId===f.id;});
        var search=[f.supplierCode,f.supplierName,f.code,f.name,f.region,f.municipality,f.village].concat(plants.map(function(p){return p.code+' '+p.name+' '+p.botanicalName;})).join(' ');
        return '<tr data-search="'+attr(search.toLocaleLowerCase('sq-AL'))+'"><td><button class="sg-eye-btn" data-entity-id="'+f.id+'" onclick="App.sg62OpenFarm(\''+f.id+'\')">👁</button></td><td><strong>'+esc(f.supplierCode||'—')+'</strong><br><small>'+esc(f.supplierName||'Pa furnitor')+'</small></td><td><strong>'+esc(f.code)+'</strong><br>'+esc(f.name)+'</td><td>'+esc([f.village,f.municipality,f.region].filter(Boolean).join(', ')||'—')+'</td><td class="text-right">'+plants.length+'</td><td class="text-right">'+parcels.length+'</td><td>'+badge(f.active!==false?'CONFIRMED':'CANCELLED')+'</td><td><button class="btn btn-outline btn-sm" onclick="App.sg62EditPlant(null,\''+f.id+'\')">+ Bimë</button></td></tr>';
      }).join('');
      document.getElementById('content').innerHTML=registryToolbar()+'<div class="card"><div class="card-title"><span>Regjistri Ferma → Bimë</span><span>'+(this.data.traceFarms||[]).length+' ferma · '+(this.data.tracePlants||[]).length+' bimë</span></div><div class="report-table-wrap"><table id="sg62-registry-table"><thead><tr><th></th><th>Fermeri/Furnitori</th><th>Ferma</th><th>Origjina</th><th>Bimë</th><th>Parcela</th><th>Status</th><th>Veprime</th></tr></thead><tbody>'+farms+'</tbody></table></div>'+(farms?'':'<p class="empty-report">Nuk ka ferma. Krijoni fermerin te Furnitorët, pastaj Ferma dhe Bima.</p>')+'</div>';
    }catch(error){toastError(error);}
  };
  App.sg62FilterRegistry=function(query){var q=String(query||'').toLocaleLowerCase('sq-AL').trim();document.querySelectorAll('#sg62-registry-table tbody tr').forEach(function(row){row.style.display=!q||String(row.dataset.search||'').indexOf(q)>=0?'':'none';});};

  App.sg62EditFarm=function(){
    var suppliers=(this.data.suppliers||[]).filter(function(x){return x.active!==false;});
    var body='<div class="sg62-form-grid"><div class="form-group"><label>Fermeri/Furnitori *</label><select id="sg62-farm-supplier">'+options(suppliers,'','Kërko fermerin/furnitorin',function(x){return (x.code?x.code+' — ':'')+x.name;})+'</select></div><div class="form-group"><label>Kodi i Fermës *</label><input id="sg62-farm-code"></div><div class="form-group sg62-span-2"><label>Emri i Fermës/Zonës *</label><input id="sg62-farm-name"></div><div class="form-group"><label>Qarku/Rajoni</label><input id="sg62-farm-region"></div><div class="form-group"><label>Bashkia</label><input id="sg62-farm-municipality"></div><div class="form-group"><label>Fshati</label><input id="sg62-farm-village"></div><div class="form-group"><label>Emri i vendndodhjes</label><input id="sg62-farm-location"></div><div class="form-group"><label>Latitude</label><input id="sg62-farm-lat" type="number" step="0.000001"></div><div class="form-group"><label>Longitude</label><input id="sg62-farm-lng" type="number" step="0.000001"></div><div class="form-group sg62-span-2"><label>Shënime</label><textarea id="sg62-farm-notes"></textarea></div></div>';
    this.modal('Krijo Fermë / Origjinë',body,'<button class="btn btn-outline" onclick="App.closeModal()">Anulo</button><button class="btn btn-primary" onclick="App.sg62SaveFarm()">Ruaj Fermën</button>');
  };
  App.sg62SaveFarm=async function(){
    try{
      var payload={companyId:companyId(),supplierId:selectedId('sg62-farm-supplier')||null,code:value('sg62-farm-code'),name:value('sg62-farm-name'),sourceTypeDefault:'CULTIVATED',country:'Shqipëri',region:value('sg62-farm-region'),municipality:value('sg62-farm-municipality'),village:value('sg62-farm-village'),locationName:value('sg62-farm-location'),latitude:value('sg62-farm-lat')?num(value('sg62-farm-lat')):null,longitude:value('sg62-farm-lng')?num(value('sg62-farm-lng')):null,altitudeM:null,notes:value('sg62-farm-notes'),active:true};
      if(!payload.supplierId||!payload.code||!payload.name)throw new Error('Fermeri, kodi dhe emri i fermës janë të detyrueshëm.');
      await Cloud.request('/api/trace/farms',{method:'POST',body:payload});this.closeModal();this.toast('Ferma u krijua në regjistër.');this.navigate('traceRegistry');
    }catch(error){toastError(error);}
  };

  App.sg62EditPlant=function(existingId,farmId){
    var existing=existingId?byId(this.data.tracePlants,existingId):null;
    var farms=(this.data.traceFarms||[]).filter(function(x){return x.active!==false;});
    var products=(this.data.products||[]).filter(function(x){return x.active!==false;});
    var selectedFarm=farmId||(existing&&existing.farmId)||'';
    var body='<div class="sg62-form-grid"><div class="form-group"><label>Ferma *</label><select id="sg62-plant-farm">'+options(farms,selectedFarm,'Kërko fermën',function(x){return (x.supplierCode?x.supplierCode+' · ':'')+x.code+' — '+x.name;})+'</select></div><div class="form-group"><label>Artikulli i lidhur</label><select id="sg62-plant-product">'+options(products,existing&&existing.productId||'','Kërko artikullin')+'</select></div><div class="form-group"><label>Kodi i Bimës *</label><input id="sg62-plant-code" value="'+attr(existing&&existing.code||'')+'"></div><div class="form-group"><label>Emri i Bimës *</label><input id="sg62-plant-name" value="'+attr(existing&&existing.name||'')+'"></div><div class="form-group"><label>Emri botanik</label><input id="sg62-plant-botanical" value="'+attr(existing&&existing.botanicalName||'')+'"></div><div class="form-group"><label>Emri lokal</label><input id="sg62-plant-local" value="'+attr(existing&&existing.localName||'')+'"></div><div class="form-group"><label>Pjesa e bimës</label><input id="sg62-plant-part" value="'+attr(existing&&existing.plantPart||'')+'"></div><div class="form-group"><label>Statusi organik</label><input id="sg62-plant-organic" value="'+attr(existing&&existing.organicStatus||'')+'"></div><div class="form-group"><label>Nr. Certifikate</label><input id="sg62-plant-cert" value="'+attr(existing&&existing.certificateNo||'')+'"></div><div class="form-group"><label>Sezoni i vjeljes</label><input id="sg62-plant-season" value="'+attr(existing&&existing.harvestSeason||'')+'"></div><div class="form-group sg62-span-2"><label>Shënime</label><textarea id="sg62-plant-notes">'+esc(existing&&existing.notes||'')+'</textarea></div></div>';
    this.modal(existing?'Edito Bimën':'Krijo Bimë',body,'<button class="btn btn-outline" onclick="App.closeModal()">Anulo</button><button class="btn btn-primary" onclick="App.sg62SavePlant(\''+(existingId||'')+'\')">Ruaj Bimën</button>');
  };
  App.sg62SavePlant=async function(existingId){
    try{
      var payload={companyId:companyId(),farmId:selectedId('sg62-plant-farm'),productId:selectedId('sg62-plant-product')||null,code:value('sg62-plant-code'),name:value('sg62-plant-name'),botanicalName:value('sg62-plant-botanical'),localName:value('sg62-plant-local'),plantPart:value('sg62-plant-part'),organicStatus:value('sg62-plant-organic'),certificateNo:value('sg62-plant-cert'),harvestSeason:value('sg62-plant-season'),notes:value('sg62-plant-notes'),active:true};
      if(!payload.farmId||!payload.code||!payload.name)throw new Error('Ferma, kodi dhe emri i bimës janë të detyrueshëm.');
      var path=existingId?'/api/trace/workflow/plants/'+encodeURIComponent(existingId):'/api/trace/workflow/plants';
      if(existingId)delete payload.companyId;
      await Cloud.request(path,{method:existingId?'PATCH':'POST',body:payload});this.closeModal();this.toast(existingId?'Bima u përditësua.':'Bima u shtua në fermë.');this.navigate('traceRegistry');
    }catch(error){toastError(error);}
  };

  App.sg62OpenFarm=function(id){
    var farm=byId(this.data.traceFarms,id);if(!farm)return;
    var plants=(this.data.tracePlants||[]).filter(function(x){return x.farmId===id;});
    var parcels=(this.data.traceParcels||[]).filter(function(x){return x.farmId===id;});
    var body='<div class="sg62-master-card"><div><small>FERMERI</small><strong>'+esc(farm.supplierCode||'—')+' · '+esc(farm.supplierName||'—')+'</strong></div><div><small>FERMA</small><strong>'+esc(farm.code)+' · '+esc(farm.name)+'</strong></div><div><small>ORIGJINA</small><strong>'+esc([farm.village,farm.municipality,farm.region].filter(Boolean).join(', ')||'—')+'</strong></div></div><h4>Bimët</h4><div class="report-table-wrap"><table><thead><tr><th>Kodi</th><th>Bima</th><th>Botanike</th><th>Pjesa</th><th>Artikulli</th><th>Veprime</th></tr></thead><tbody>'+plants.map(function(p){return '<tr><td><strong>'+esc(p.code)+'</strong></td><td>'+esc(p.name)+'</td><td>'+esc(p.botanicalName||'—')+'</td><td>'+esc(p.plantPart||'—')+'</td><td>'+esc(p.productName||'—')+'</td><td><button class="btn btn-outline btn-sm" onclick="App.closeModal();App.sg62EditPlant(\''+p.id+'\')">Edito</button></td></tr>';}).join('')+'</tbody></table></div><h4>Parcela/Zona</h4><div class="sg62-chip-row">'+(parcels.length?parcels.map(function(p){return '<span>'+esc(p.code)+' · '+esc(p.name)+'</span>';}).join(''):'<span>Pa parcela</span>')+'</div>';
    this.modal('Kartela e Fermës',body,'<button class="btn btn-outline" onclick="App.closeModal()">Mbyll</button><button class="btn btn-primary" onclick="App.closeModal();App.sg62EditPlant(null,\''+id+'\')">+ Bimë</button>');
  };

  function emptyLine(){return {packagingCount:0,grossKg:0,packagingKg:0,note:''};}
  function lineNet(line){return Math.max(0,num(line.grossKg)-num(line.packagingKg));}
  function ensureLineRows(lines){var result=(lines||[]).map(function(x){return {packagingCount:num(x.packagingCount!=null?x.packagingCount:x.bagCount),grossKg:num(x.grossKg),packagingKg:num(x.packagingKg),note:x.note||''};});while(result.length<8)result.push(emptyLine());return result;}
  function weightTotals(){return weightState.lines.reduce(function(out,line){out.packagingCount+=num(line.packagingCount);out.grossKg+=num(line.grossKg);out.packagingKg+=num(line.packagingKg);out.netKg+=lineNet(line);return out;},{packagingCount:0,grossKg:0,packagingKg:0,netKg:0});}
  function renderWeightRows(){
    var body=document.getElementById('sg62-weight-lines-body');if(!body)return;
    body.innerHTML=weightState.lines.map(function(line,index){return '<tr><td>'+(index+1)+'</td><td><input inputmode="decimal" value="'+attr(line.packagingCount||'')+'" oninput="App.sg62WeightLine('+index+',\'packagingCount\',this.value)"></td><td><input inputmode="decimal" value="'+attr(line.grossKg||'')+'" oninput="App.sg62WeightLine('+index+',\'grossKg\',this.value)"></td><td><input inputmode="decimal" value="'+attr(line.packagingKg||'')+'" oninput="App.sg62WeightLine('+index+',\'packagingKg\',this.value)"></td><td class="sg62-net-cell" id="sg62-line-net-'+index+'"><strong>'+fmt(lineNet(line))+'</strong></td><td><button class="sg62-remove" onclick="App.sg62RemoveWeightLine('+index+')">×</button></td></tr>';}).join('');
    renderWeightTotals();
  }
  function renderWeightTotals(){var t=weightTotals();[['amb',t.packagingCount],['gross',t.grossKg],['pack',t.packagingKg],['net',t.netKg]].forEach(function(pair){var el=document.getElementById('sg62-total-'+pair[0]);if(el)el.textContent=fmt(pair[1]);});}
  App.sg62WeightLine=function(index,key,val){if(!weightState.lines[index])return;weightState.lines[index][key]=num(val);var cell=document.getElementById('sg62-line-net-'+index);if(cell)cell.innerHTML='<strong>'+fmt(lineNet(weightState.lines[index]))+'</strong>';renderWeightTotals();};
  App.sg62AddWeightLine=function(){weightState.lines.push(emptyLine());renderWeightRows();};
  App.sg62RemoveWeightLine=function(index){if(weightState.lines.length<=1)return;weightState.lines.splice(index,1);renderWeightRows();};

  function workflowSteps(dossier){
    var status=dossier&&dossier.status||'DRAFT';
    var order=['WEIGHED','QUALITY_APPROVED','PURCHASE_INVOICED','RECEIVED'];
    var current=order.indexOf(status);if(status==='QUALITY_PENDING')current=0;if(status==='QUALITY_REJECTED')current=0;if(/IN_PROCESS|SALES_ORDERED|CLOSED/.test(status))current=3;
    return '<div class="sg62-stepper">'+[
      ['⚖️','Formulari i Peshës'],['🧪','Kontroll Cilësie'],['🧾','Faturë Blerje'],['📥','Fletë-Hyrje'],['🏷️','Lot & Etiketë 58 mm']
    ].map(function(step,index){var done=index===0?Boolean(dossier):index<=current+1;var active=(index===current+1)||(!dossier&&index===0);return '<div class="'+(done?'done ':'')+(active?'active':'')+'"><span>'+step[0]+'</span><small>'+step[1]+'</small></div>';}).join('<b>›</b>')+'</div>';
  }
  function weightActions(id,dossier){
    var buttons='<button class="btn btn-outline" onclick="App.navigate(\'weightList\')">← Regjistri</button><button class="btn btn-primary" onclick="App.sg62SaveWeight(\''+(id||'')+'\')">Ruaj Draft</button>';
    if(!id)return buttons;
    if(!dossier)return buttons;
    if(['WEIGHED','QUALITY_PENDING','QUALITY_REJECTED'].indexOf(dossier.status)>=0)buttons+='<button class="btn btn-green" onclick="App.sg62Quality(\''+id+'\')">🧪 Kontroll Cilësie</button>';
    if(dossier.status==='QUALITY_APPROVED')buttons+='<button class="btn btn-green" onclick="App.sg62CreatePurchaseInvoice(\''+id+'\')">🧾 Krijo Faturë Blerje</button>';
    if(dossier.status==='PURCHASE_INVOICED')buttons+='<button class="btn btn-green" onclick="App.sg62CreateReceipt(\''+id+'\')">📥 Fletë-Hyrje + Lot + Etiketë</button>';
    if(dossier.id)buttons+='<button class="btn btn-outline" onclick="App.openTraceDossier(\''+dossier.id+'\')">👁 Dosja</button>';
    if(dossier.rootLotId)buttons+='<button class="btn btn-outline" onclick="App.openLotLabel58(\''+dossier.rootLotId+'\')">🏷️ 58 mm</button>';
    return buttons;
  }

  App._viewWeightForm=async function(existingId){
    try{
      activate('weightList',existingId?'Edito Formularin e Peshës':'Formular i Ri i Peshës');
      await loadWorkflow();
      var wf=existingId?byId(this.data.weightForms,existingId):null;
      var details=null;
      if(existingId)details=await Cloud.request('/api/trace/workflow/weights/'+encodeURIComponent(existingId)+'/details');
      var detailWeight=camel(details&&details.weight||{});
      var detailLines=(details&&details.lines||[]).map(camel);
      var dossier=(this.data.traceDossiers||[]).find(function(x){return x.weightTicketId===existingId;})||null;
      weightState={id:existingId||null,lines:ensureLineRows(detailLines.length?detailLines:(wf&&wf.lines||[])),dossier:dossier};
      var suppliers=(this.data.suppliers||[]).filter(function(x){return x.active!==false;});
      var products=(this.data.products||[]).filter(function(x){return x.active!==false;});
      var warehouses=(this.data.warehouses||[]).filter(function(x){return x.active!==false;});
      var farms=(this.data.traceFarms||[]).filter(function(x){return x.active!==false;});
      var selectedFarm=detailWeight.farmId||(wf&&wf.farmId)||'';
      var plants=(this.data.tracePlants||[]).filter(function(x){return !selectedFarm||x.farmId===selectedFarm;});
      var parcels=(this.data.traceParcels||[]).filter(function(x){return !selectedFarm||x.farmId===selectedFarm;});
      var form='<div class="sg62-weight-document"><div class="sg62-weight-head"><div><small>FORMULARI I PESHËS</small><h2>'+esc(detailWeight.productName||(wf&&wf.productName)||'Bima / Artikulli')+'</h2><p>Hedhje e shpejtë sipas modelit të peshimit</p></div><div class="sg62-weight-no"><small>NUMRI</small><strong>'+esc(detailWeight.documentNo||(wf&&wf.docNumber)||'AUTOMATIK')+'</strong><small>STATUSI</small>'+badge(detailWeight.status||(wf&&wf.status)||'DRAFT')+'</div></div>'+workflowSteps(dossier)+'<div class="sg62-form-grid sg62-weight-meta"><div class="form-group"><label>Data *</label><input id="wf-date" type="date" value="'+attr(String(detailWeight.documentDate||(wf&&wf.date)||today()).slice(0,10))+'"></div><div class="form-group"><label>Fermeri/Furnitori *</label><select id="wf-supplier">'+options(suppliers,detailWeight.supplierId||(wf&&wf.supplierId)||'','Kërko fermerin',function(x){return (x.code?x.code+' — ':'')+x.name;})+'</select></div><div class="form-group"><label>Artikulli/Bima e magazinës *</label><select id="wf-product">'+options(products,detailWeight.productId||(wf&&wf.productId)||'','Kërko artikullin')+'</select></div><div class="form-group"><label>Magazina *</label><select id="wf-warehouse">'+options(warehouses,detailWeight.warehouseId||(wf&&wf.warehouseId)||'','Kërko magazinën')+'</select></div><div class="form-group"><label>Ferma *</label><select id="wf-p4-farm" onchange="App.sg62FarmChanged()">'+options(farms,selectedFarm,'Kërko fermën',function(x){return (x.supplierCode?x.supplierCode+' · ':'')+x.code+' — '+x.name;})+'</select></div><div class="form-group"><label>Bima *</label><select id="sg62-weight-plant">'+options(plants,detailWeight.plantId||(dossier&&dossier.plantId)||'','Kërko bimën',function(x){return x.code+' — '+x.name;})+'</select></div><div class="form-group"><label>Parcela/Zona</label><select id="wf-p4-parcel">'+options(parcels,detailWeight.parcelId||(wf&&wf.parcelId)||'','Kërko parcelën')+'</select></div><div class="form-group"><label>Njësia e AMB *</label><select id="sg62-pack-unit"><option value="thasë">Thasë</option><option value="kuti">Kuti</option><option value="arka">Arka</option><option value="paleta">Paleta</option><option value="copë">Copë</option></select></div><div class="form-group"><label>Çmimi / kg</label><input id="wf-price" type="number" step="0.01" value="'+attr(detailWeight.unitPrice||(wf&&wf.unitPriceExclVat)||0)+'"></div><div class="form-group"><label>Zbritje %</label><input id="wf-percent" type="number" step="0.01" value="'+attr(detailWeight.discountPercent||(wf&&wf.percentDeduction)||0)+'"></div><div class="form-group"><label>Targa</label><input id="wf-p4-plate" value="'+attr(detailWeight.vehiclePlate||(wf&&wf.vehiclePlate)||'')+'"></div><div class="form-group"><label>Data e vjeljes</label><input id="wf-p4-harvest" type="date" value="'+attr(String(detailWeight.harvestDate||(wf&&wf.harvestDate)||(wf&&wf.date)||today()).slice(0,10))+'"></div><input id="wf-p4-quality" type="hidden" value="QUARANTINE"><div class="form-group sg62-span-2"><label>Shënime</label><textarea id="wf-notes">'+esc(detailWeight.notes||(wf&&wf.notes)||'')+'</textarea></div></div><div class="sg62-weight-table-wrap"><table class="sg62-weight-table"><thead><tr><th>Nr.</th><th>Nr. Ambalazheve</th><th>KG</th><th>Peshorja / Ambalazhi</th><th>Shuma / Pesha Neto</th><th></th></tr></thead><tbody id="sg62-weight-lines-body"></tbody><tfoot><tr><th colspan="1">TOTAL</th><th id="sg62-total-amb">0</th><th id="sg62-total-gross">0</th><th id="sg62-total-pack">0</th><th id="sg62-total-net">0</th><th></th></tr></tfoot></table><button class="btn btn-outline sg62-add-line" onclick="App.sg62AddWeightLine()">+ Shto rresht</button></div><div class="sg62-form-actions">'+weightActions(existingId,dossier)+'</div></div>';
      document.getElementById('content').innerHTML=form;
      var unit=document.getElementById('sg62-pack-unit');if(unit)unit.value=detailWeight.packagingUnit||'thasë';
      renderWeightRows();
    }catch(error){toastError(error);}
  };
  App.view_weightForm=function(){return this._viewWeightForm();};
  App.openWeightForm=function(id){return this._viewWeightForm(id);};
  App.sg62FarmChanged=function(){
    var farmId=selectedId('wf-p4-farm');
    var plant=document.getElementById('sg62-weight-plant');var parcel=document.getElementById('wf-p4-parcel');
    if(plant)plant.innerHTML=options((App.data.tracePlants||[]).filter(function(x){return x.farmId===farmId&&x.active!==false;}),'','Kërko bimën',function(x){return x.code+' — '+x.name;});
    if(parcel)parcel.innerHTML=options((App.data.traceParcels||[]).filter(function(x){return x.farmId===farmId&&x.active!==false;}),'','Kërko parcelën');
  };
  App.sg62SaveWeight=async function(existingId){
    try{
      if(Auth&&Auth.requirePermission)Auth.requirePermission(existingId?'documents.edit':'documents.create');
      var lines=weightState.lines.filter(function(line){return num(line.packagingCount)>0||num(line.grossKg)>0||num(line.packagingKg)>0||String(line.note||'').trim();});
      if(!lines.length)throw new Error('Plotësoni të paktën një rresht peshimi.');
      var totals=lines.reduce(function(out,line){out.packagingCount+=num(line.packagingCount);out.grossKg+=num(line.grossKg);out.packagingKg+=num(line.packagingKg);return out;},{packagingCount:0,grossKg:0,packagingKg:0});
      var payload={companyId:companyId(),warehouseId:selectedId('wf-warehouse'),supplierId:selectedId('wf-supplier'),productId:selectedId('wf-product'),documentDate:value('wf-date'),bagsCount:totals.packagingCount,grossWeight:totals.grossKg,packagingWeight:totals.packagingKg,discountPercent:num(value('wf-percent')),unitPrice:num(value('wf-price')),vehiclePlate:value('wf-p4-plate'),farmId:selectedId('wf-p4-farm')||null,parcelId:selectedId('wf-p4-parcel')||null,harvestDate:value('wf-p4-harvest')||value('wf-date'),qualityStatus:'QUARANTINE',notes:value('wf-notes')};
      var plantId=selectedId('sg62-weight-plant');var packagingUnit=value('sg62-pack-unit');
      if(!payload.warehouseId||!payload.supplierId||!payload.productId||!payload.farmId||!plantId)throw new Error('Magazina, fermeri, artikulli, ferma dhe bima janë të detyrueshme.');
      if(totals.grossKg<=totals.packagingKg)throw new Error('Pesha bruto duhet të jetë më e madhe se ambalazhi.');
      var row=await Cloud.request(existingId?'/api/trace/weights/'+encodeURIComponent(existingId):'/api/trace/weights',{method:existingId?'PATCH':'POST',body:payload});
      var id=existingId||row.id;
      await Cloud.request('/api/trace/workflow/weights/'+encodeURIComponent(id)+'/lines',{method:'PUT',body:{lines:lines}});
      await Cloud.request('/api/trace/workflow/weights/'+encodeURIComponent(id)+'/open-dossier',{method:'POST',body:{farmId:payload.farmId,parcelId:payload.parcelId,plantId:plantId,packagingUnit:packagingUnit}});
      this.toast('Formulari dhe dosja u ruajtën.');await this._viewWeightForm(id);
    }catch(error){toastError(error);}
  };

  App.sg62Quality=function(weightId){
    var body='<div class="sg62-form-grid"><div class="form-group"><label>Rezultati *</label><select id="sg62-qc-result"><option value="APPROVED">Aprovuar</option><option value="QUARANTINE">Karantinë</option><option value="PARTIAL_APPROVAL">Aprovim i pjesshëm</option><option value="REJECTED">Refuzuar</option></select></div><div class="form-group"><label>Lagështia %</label><input id="sg62-qc-moisture" type="number" step="0.01"></div><div class="form-group"><label>Papastërtia %</label><input id="sg62-qc-impurity" type="number" step="0.01"></div><div class="form-group"><label>Referenca laboratorike</label><input id="sg62-qc-lab"></div><div class="form-group sg62-span-2"><label>Shënime</label><textarea id="sg62-qc-notes"></textarea></div></div>';
    this.modal('Kontroll Cilësie në Pranim',body,'<button class="btn btn-outline" onclick="App.closeModal()">Anulo</button><button class="btn btn-primary" onclick="App.sg62SaveQuality(\''+weightId+'\')">Ruaj Kontrollin</button>');
  };
  App.sg62SaveQuality=async function(weightId){try{await Cloud.request('/api/trace/workflow/weights/'+encodeURIComponent(weightId)+'/quality',{method:'POST',body:{result:value('sg62-qc-result'),moisturePercent:value('sg62-qc-moisture')?num(value('sg62-qc-moisture')):null,impurityPercent:value('sg62-qc-impurity')?num(value('sg62-qc-impurity')):null,laboratoryReference:value('sg62-qc-lab'),notes:value('sg62-qc-notes')}});this.closeModal();this.toast('Kontrolli i cilësisë u regjistrua.');await this._viewWeightForm(weightId);}catch(error){toastError(error);}};
  App.sg62CreatePurchaseInvoice=async function(weightId){try{if(!global.confirm('Krijo Faturën e Blerjes nga pesha neto e aprovuar?'))return;var result=await Cloud.request('/api/trace/workflow/weights/'+encodeURIComponent(weightId)+'/purchase-invoice',{method:'POST',body:{documentDate:value('wf-date')||today(),notes:'Krijuar nga dosja e gjurmueshmërisë'}});this.toast('Fatura e Blerjes u krijua: '+(result.documentNo||result.document_no));await this._viewWeightForm(weightId);}catch(error){toastError(error);}};
  App.sg62CreateReceipt=async function(weightId){try{if(!global.confirm('Krijo Fletë-Hyrjen, lotin RAW, stokun dhe etiketën termike 58 mm?'))return;var result=await Cloud.request('/api/trace/workflow/weights/'+encodeURIComponent(weightId)+'/receipt',{method:'POST',body:{documentDate:value('wf-date')||today(),notes:'Krijuar nga dosja e gjurmueshmërisë'}});this.toast('Fletë-Hyrja dhe loti u krijuan: '+result.lot.lotNumber);await loadWorkflow();await this.openLotLabel58(result.lot.id);}catch(error){toastError(error);}};

  App.view_traceDossiers=async function(){
    try{
      activate('traceDossiers','Dosjet e Gjurmueshmërisë');await loadWorkflow();
      var rows=(this.data.traceDossiers||[]).map(function(d){var search=[d.dossierNo,d.supplierCode,d.supplierName,d.farmCode,d.farmName,d.plantCode,d.plantName,d.weightDocumentNo,d.lotNumber,d.status].join(' ').toLocaleLowerCase('sq-AL');return '<tr data-search="'+attr(search)+'"><td><button class="sg-eye-btn" data-entity-id="'+d.id+'" data-document-no="'+attr(d.dossierNo)+'" onclick="App.openTraceDossier(\''+d.id+'\')">👁</button></td><td><strong>'+esc(d.dossierNo)+'</strong></td><td><strong>'+esc(d.supplierCode)+'</strong><br>'+esc(d.supplierName)+'</td><td>'+esc(d.farmCode)+' · '+esc(d.farmName)+'</td><td>'+esc(d.plantCode)+' · '+esc(d.plantName)+'</td><td>'+esc(d.weightDocumentNo||'—')+'</td><td>'+esc(d.lotNumber||'—')+'</td><td>'+badge(d.status)+'</td><td><button class="btn btn-outline btn-sm" onclick="App.openTraceDossier(\''+d.id+'\')">Dosja</button>'+(d.rootLotId?'<button class="btn btn-outline btn-sm" onclick="App.openLotLabel58(\''+d.rootLotId+'\')">58 mm</button>':'')+'</td></tr>';}).join('');
      document.getElementById('content').innerHTML='<div class="sg62-toolbar"><div><strong>Dosje të lidhura nga Ferma deri te Shitja</strong></div><div class="sg62-search"><span>⌕</span><input placeholder="Kërko dosje, fermer, bimë, lot..." oninput="App.sg62FilterDossiers(this.value)"></div></div><div class="card"><div class="card-title"><span>Regjistri i Dosjeve</span><span>'+(this.data.traceDossiers||[]).length+' dosje</span></div><div class="report-table-wrap"><table id="sg62-dossiers-table"><thead><tr><th></th><th>Dosja</th><th>Fermeri</th><th>Ferma</th><th>Bima</th><th>Peshimi</th><th>Loti</th><th>Status</th><th>Veprime</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+(rows?'':'<p class="empty-report">Nuk ka dosje. Ruani një Formular Peshimi me Fermë dhe Bimë.</p>')+'</div>';
    }catch(error){toastError(error);}
  };
  App.sg62FilterDossiers=function(q){q=String(q||'').toLocaleLowerCase('sq-AL').trim();document.querySelectorAll('#sg62-dossiers-table tbody tr').forEach(function(row){row.style.display=!q||String(row.dataset.search||'').indexOf(q)>=0?'':'none';});};

  function snapshotRows(snapshot){var rows=[];Object.keys(snapshot||{}).forEach(function(key){var val=snapshot[key];if(val&&typeof val==='object')val=JSON.stringify(val);rows.push([key,val==null?'':val]);});return rows;}
  function timelineHtml(data){
    return (data.timeline||[]).map(function(item,index){var type=item.documentType||item.entityType;var isLabel=type==='LOT_LABEL';return '<article class="sg62-timeline-item"><div class="sg62-timeline-dot">'+(isLabel?'🏷️':'📄')+'</div><div class="sg62-timeline-card"><header><div><small>'+esc(type)+'</small><h4>'+esc(item.title||type)+'</h4></div>'+badge(item.status)+'</header><p><strong>'+esc(item.documentNo||'Pa numër')+'</strong> · '+esc(dateSq(item.documentDate||item.createdAt))+'</p><div class="sg62-timeline-actions"><button class="btn btn-outline btn-sm" data-entity-id="'+esc(item.entityId||'')+'" data-document-no="'+esc(item.documentNo||'')+'" onclick="App.sg62OpenTimelineDocument('+index+')">👁 Shiko</button>'+(isLabel?'<button class="btn btn-outline btn-sm" onclick="App.openLotLabel58(\''+esc(item.entityId)+'\')">🏷️ 58 mm</button>':'')+'</div></div></article>';}).join('');
  }
  function auditHtml(events){return '<div class="report-table-wrap"><table class="sg62-audit-table"><thead><tr><th>Data/Ora</th><th>User</th><th>Veprimi</th><th>Dokumenti</th><th>IP</th><th>Pajisja</th><th>Rezultat</th></tr></thead><tbody>'+(events||[]).map(function(e){var x=camel(e);return '<tr><td>'+esc(new Date(x.occurredAt).toLocaleString('sq-AL'))+'</td><td><strong>'+esc(x.userFullName||x.usernameSnapshot||'—')+'</strong></td><td>'+esc(x.action)+'</td><td>'+esc(x.documentNo||x.entityType||'—')+'</td><td>'+esc(x.ipAddress||'—')+'</td><td>'+esc(x.deviceName||x.deviceId||'—')+'<br><small>'+esc(x.devicePlatform||'')+'</small></td><td>'+badge(x.result==='SUCCESS'?'CONFIRMED':'CANCELLED')+'</td></tr>';}).join('')+'</tbody></table></div>';}
  App.openTraceDossier=async function(id){
    try{
      var results=await Promise.all([Cloud.request('/api/trace/workflow/dossiers/'+encodeURIComponent(id)),Cloud.request('/api/trace/workflow/dossiers/'+encodeURIComponent(id)+'/audit')]);
      var data=results[0];data.audit=(results[1]||[]).map(camel);dossierState=data;
      var d=data.dossier||{};
      var body='<div class="sg62-dossier-head"><div><small>DOSJA E GJURMUESHMËRISË</small><h2>'+esc(d.dossierNo)+'</h2><p>'+esc(d.supplierCode)+' · '+esc(d.supplierName)+' → '+esc(d.plantName)+'</p></div><div>'+badge(d.status)+'<p>Loti: <strong>'+esc((data.lots&&data.lots[0]&&data.lots[0].lotNumber)||'—')+'</strong></p></div></div><div class="sg62-dossier-kpis"><div><small>Ferma</small><strong>'+esc(d.farmCode)+' · '+esc(d.farmName)+'</strong></div><div><small>Bima</small><strong>'+esc(d.plantCode)+' · '+esc(d.plantName)+'</strong></div><div><small>AMB</small><strong>'+fmt(d.bagsCount)+' '+esc(d.packagingUnit||'')+'</strong></div><div><small>Peshë Neto</small><strong>'+fmt(d.acceptedWeight)+' kg</strong></div></div><h3>Timeline i Dokumenteve</h3><div class="sg62-timeline">'+timelineHtml(data)+'</div><h3>Gjurmë User / Ora / IP / Pajisje</h3>'+auditHtml(data.audit);
      var footer='<button class="btn btn-outline" onclick="App.sg62PrintDossier()">🖨 Print Dosjen</button><button class="btn btn-outline" onclick="App.sg62PdfDossier()">📄 PDF Dosjen</button><button class="btn btn-outline" onclick="App.sg62ExcelDossier()">📊 Excel Dosjen</button><button class="btn btn-primary" onclick="App.closeModal()">Mbyll</button>';
      this.modal('Dosja e Gjurmueshmërisë',body,footer);setTimeout(function(){var modal=document.querySelector('.modal-content');if(modal)modal.classList.add('sg62-dossier-modal');},0);
    }catch(error){toastError(error);}
  };
  App.sg62OpenTimelineDocument=function(index){if(!dossierState)return;var item=dossierState.timeline[index];if(!item)return;if(item.documentType==='LOT_LABEL')return this.openLotLabel58(item.entityId);var rows=snapshotRows(item.snapshot||{});var body='<div class="sg62-document-view"><header><small>'+esc(item.documentType||item.entityType)+'</small><h2>'+esc(item.title||'Dokument')+'</h2><p>'+esc(item.documentNo||'')+' · '+esc(dateSq(item.documentDate||item.createdAt))+'</p></header><table><tbody>'+rows.map(function(r){return '<tr><th>'+esc(r[0])+'</th><td>'+esc(r[1])+'</td></tr>';}).join('')+'</tbody></table></div>';this.modal(item.title||'Dokument',body,'<button class="btn btn-primary" onclick="App.closeModal()">Mbyll</button>');};

  function dossierPrintHtml(){
    if(!dossierState)return '';
    var d=dossierState.dossier||{};
    var sections=(dossierState.timeline||[]).map(function(item){var rows=snapshotRows(item.snapshot||{});if(item.documentType==='LOT_LABEL'){return '<section class="sg62-print-page"><h2>'+esc(item.title)+'</h2><div class="sg62-print-label58"><strong>'+esc((item.snapshot&&item.snapshot.supplierCode)||d.supplierCode) +' · '+esc((item.snapshot&&item.snapshot.productName)||d.plantName)+'</strong><div><span>AMB<br><b>'+fmt(item.snapshot&&item.snapshot.packageCount)+' '+esc(item.snapshot&&item.snapshot.packageUnit||'')+'</b></span><span>PESHË NETO<br><b>'+fmt(item.snapshot&&item.snapshot.netWeight)+' KG</b></span></div><small>'+esc(item.documentNo||'')+'</small></div></section>';}
      return '<section class="sg62-print-page"><header><small>'+esc(item.documentType||'')+'</small><h2>'+esc(item.title||'Dokument')+'</h2><p>'+esc(item.documentNo||'')+' · '+esc(dateSq(item.documentDate||item.createdAt))+'</p></header><table>'+rows.map(function(r){return '<tr><th>'+esc(r[0])+'</th><td>'+esc(r[1])+'</td></tr>';}).join('')+'</table></section>';}).join('');
    return '<section class="sg62-print-page sg62-index"><h1>DOSJA E GJURMUESHMËRISË</h1><h2>'+esc(d.dossierNo)+'</h2><p>'+esc(d.supplierCode)+' · '+esc(d.supplierName)+'</p><p>'+esc(d.farmName)+' → '+esc(d.plantName)+'</p><ol>'+(dossierState.timeline||[]).map(function(x){return '<li>'+esc(x.title)+' — '+esc(x.documentNo||'')+'</li>';}).join('')+'</ol></section>'+sections;
  }
  App.sg62PrintDossier=function(){if(!dossierState)return;var win=global.open('','_blank');if(!win)return this.toast('Shfletuesi bllokoi printimin.','error');var css='@page{size:A4;margin:12mm}body{font-family:Arial;color:#111}.sg62-print-page{page-break-after:always}.sg62-print-page header{border-bottom:2px solid #714b67}.sg62-print-page table{width:100%;border-collapse:collapse}.sg62-print-page th,.sg62-print-page td{border:1px solid #bbb;padding:6px;text-align:left}.sg62-print-label58{width:54mm;border:2px solid #000;margin:20mm auto;padding:2mm;text-align:center}.sg62-print-label58>strong{font-size:17px}.sg62-print-label58>div{display:grid;grid-template-columns:1fr 1fr;border-top:2px solid #000;border-bottom:2px solid #000;margin:6px 0}.sg62-print-label58 span{padding:8px 3px;font-weight:bold}.sg62-print-label58 span+span{border-left:2px solid #000}.sg62-print-label58 b{font-size:20px}';win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(dossierState.dossier.dossierNo)+'</title><style>'+css+'</style></head><body>'+dossierPrintHtml()+'<script>window.onload=function(){window.print();};<\/script></body></html>');win.document.close();};
  App.sg62PdfDossier=function(){
    if(!dossierState)return;if(!global.jspdf||!global.jspdf.jsPDF)return this.toast('PDF nuk është i disponueshëm.','error');
    var jsPDF=global.jspdf.jsPDF;var doc=new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});var d=dossierState.dossier||{};doc.setFontSize(18);doc.text('DOSJA E GJURMUESHMERISE',15,20);doc.setFontSize(13);doc.text(String(d.dossierNo||''),15,29);doc.setFontSize(9);doc.text(String((d.supplierCode||'')+' · '+(d.supplierName||'')),15,36);doc.text(String((d.farmName||'')+' -> '+(d.plantName||'')),15,42);var y=52;(dossierState.timeline||[]).forEach(function(item,index){doc.setFontSize(9);doc.text((index+1)+'. '+String(item.title||item.documentType)+' — '+String(item.documentNo||''),15,y);y+=6;if(y>280){doc.addPage('a4','portrait');y=20;}});
    (dossierState.timeline||[]).forEach(function(item){if(item.documentType==='LOT_LABEL'){doc.addPage([58,72],'portrait');doc.setLineWidth(.35);doc.rect(2,2,54,68);doc.setFontSize(10);doc.text('ETIKETE LOTI',29,8,{align:'center'});doc.setFontSize(13);doc.text(String((item.snapshot&&item.snapshot.supplierCode)||d.supplierCode||''),12,17,{align:'center'});doc.text(String((item.snapshot&&item.snapshot.productName)||d.plantName||'').slice(0,20),38,17,{align:'center'});doc.line(2,21,56,21);doc.line(29,21,29,44);doc.setFontSize(8);doc.text('AMB',15.5,26,{align:'center'});doc.text('PESHE NETO',42.5,26,{align:'center'});doc.setFontSize(20);doc.text(fmt(item.snapshot&&item.snapshot.packageCount),15.5,36,{align:'center'});doc.text(fmt(item.snapshot&&item.snapshot.netWeight),42.5,36,{align:'center'});doc.setFontSize(7);doc.text(String(item.snapshot&&item.snapshot.packageUnit||'').toUpperCase(),15.5,41,{align:'center'});doc.text('KG',42.5,41,{align:'center'});doc.line(2,44,56,44);doc.setFontSize(6);var lines=doc.splitTextToSize(String(item.documentNo||''),50);doc.text(lines,29,50,{align:'center'});return;}
      doc.addPage('a4','portrait');doc.setFontSize(14);doc.text(String(item.title||item.documentType||'Dokument'),15,18);doc.setFontSize(9);doc.text(String(item.documentNo||'')+' · '+dateSq(item.documentDate||item.createdAt),15,25);var rows=snapshotRows(item.snapshot||{});var yy=34;rows.forEach(function(r){var line=String(r[0])+': '+String(r[1]);var parts=doc.splitTextToSize(line,180);doc.text(parts,15,yy);yy+=parts.length*4+2;if(yy>280){doc.addPage('a4','portrait');yy=20;}});
    });
    doc.save('Dosja_'+String(d.dossierNo||d.id).replace(/[^a-z0-9_-]+/gi,'_')+'.pdf');
  };
  App.sg62ExcelDossier=function(){if(!dossierState)return;if(!global.XLSX)return this.toast('Excel nuk është i disponueshëm.','error');var wb=global.XLSX.utils.book_new();var d=dossierState.dossier||{};var indexRows=[['DOSJA E GJURMUESHMËRISË',d.dossierNo],['Fermeri',(d.supplierCode||'')+' · '+(d.supplierName||'')],['Ferma',(d.farmCode||'')+' · '+(d.farmName||'')],['Bima',(d.plantCode||'')+' · '+(d.plantName||'')],[],['Nr.','Dokumenti','Numri','Data','Status']];(dossierState.timeline||[]).forEach(function(item,i){indexRows.push([i+1,item.title,item.documentNo,dateSq(item.documentDate||item.createdAt),item.status]);});global.XLSX.utils.book_append_sheet(wb,global.XLSX.utils.aoa_to_sheet(indexRows),'Indeks');var used={Indeks:true};(dossierState.timeline||[]).forEach(function(item,index){var base=(index+1)+'_'+String(item.title||item.documentType||'Dokument').replace(/[\\/?*\[\]:]/g,' ').slice(0,25);var name=base.slice(0,31);var n=2;while(used[name]){name=(base.slice(0,27)+'_'+n++).slice(0,31);}used[name]=true;var rows=[['Dokumenti',item.title],['Numri',item.documentNo],['Data',dateSq(item.documentDate||item.createdAt)],['Status',item.status],[]].concat(snapshotRows(item.snapshot||{}));var ws=global.XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:28},{wch:70}];global.XLSX.utils.book_append_sheet(wb,ws,name);});global.XLSX.writeFile(wb,'Dosja_'+String(d.dossierNo||d.id).replace(/[^a-z0-9_-]+/gi,'_')+'.xlsx');};

  var previousNavigate=App.navigate;
  App.navigate=function(view){if(view==='traceRegistry')return this.view_traceRegistry();if(view==='traceDossiers')return this.view_traceDossiers();return previousNavigate.apply(this,arguments);};

  installMenu();
  var observer=new MutationObserver(function(){installMenu();});observer.observe(document.documentElement,{childList:true,subtree:true});
})(window);
/* SG_PHASE62_TRACEABILITY_WORKFLOW_UI_END */
