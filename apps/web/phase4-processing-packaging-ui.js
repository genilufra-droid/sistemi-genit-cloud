/* Sistemi Genit Cloud — Faza 4.2 Procesim & Paketim */
(function (global) {
  'use strict';

  var App = global.App;
  var Cloud = global.CloudERP;
  var Auth = global.Auth;
  if (!App || !Cloud || !Cloud.apiUrl || Cloud.offlineTestMode || global.__SG_PHASE42_UI__) return;
  global.__SG_PHASE42_UI__ = true;

  function esc(v) { return App.esc(v == null ? '' : String(v)); }
  function attr(v) { return esc(v).replace(/"/g, '&quot;'); }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function dateOnly(v) { return v ? String(v).slice(0, 10) : ''; }
  function byId(list,id) { return (list || []).find(function (x) { return x.id === id; }); }
  function camel(row) {
    var out = {};
    Object.keys(row || {}).forEach(function (key) { out[key.replace(/_([a-z])/g,function(_,c){return c.toUpperCase();})] = row[key]; });
    return out;
  }
  function value(id) { var e=document.getElementById(id); return e ? e.value : ''; }
  function selectedCompanyId() { return (App.company && App.company.id) || ((Cloud.getAccess().companyIds || [])[0]) || ''; }
  function statusLabel(v) { return {DRAFT:'Draft',POSTED:'Postuar',CANCELLED:'Anulluar',APPROVED:'Aprovuar',QUARANTINE:'Karantinë',REJECTED:'Refuzuar'}[v] || v || '—'; }
  function safeName(v) { return String(v || 'Dokument').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_'); }
  function fmt(v) { return App.fmt ? App.fmt(v) : num(v).toLocaleString('sq-AL',{maximumFractionDigits:3}); }
  function fmtKg(v) { return App.fmtKg ? App.fmtKg(v) : fmt(v); }
  function productName(id) { var x=byId(App.data.products,id); return x ? x.name : '—'; }
  function warehouseName(id) { var x=byId(App.data.warehouses,id); return x ? x.name : '—'; }
  function companyHeader() { return App.companyHeader ? App.companyHeader() : '<strong>'+esc((App.company||{}).name||'Sistemi Genit')+'</strong>'; }

  function options(rows,selected,label,textFn) {
    return '<option value="">— '+esc(label || 'Zgjidh')+' —</option>'+(rows||[]).map(function(x){
      var text=textFn?textFn(x):((x.code?x.code+' — ':'')+(x.name||x.lotNumber||x.id));
      return '<option value="'+attr(x.id)+'"'+(x.id===selected?' selected':'')+'>'+esc(text)+'</option>';
    }).join('');
  }

  async function loadData() {
    if (Cloud.loadPhase4) await Cloud.loadPhase4();
    var result=await Promise.all([Cloud.request('/api/trace/process-orders'),Cloud.request('/api/trace/packaging-orders')]);
    App.data.processOrders=result[0].map(camel);
    App.data.packagingOrders=result[1].map(camel);
    return {processOrders:App.data.processOrders,packagingOrders:App.data.packagingOrders};
  }
  Cloud.loadPhase42=loadData;

  function processActions(x) {
    var a=[{icon:'👁',label:'Shiko',action:"App.openProcessOrderOnline('"+x.id+"')"}];
    if(x.status==='DRAFT'){
      a.push({icon:'✏️',label:'Edito Draft',action:"App.editProcessOrderOnline('"+x.id+"')"});
      a.push({icon:'✓',label:'Posto Urdhrin',action:"App.postProcessOrderOnline('"+x.id+"')"});
      a.push({icon:'🗑',label:'Fshi Draft',danger:true,action:"App.deleteProcessOrderOnline('"+x.id+"')"});
    }
    a.push({icon:'🖨',label:'Print',action:"App.printProcessOrderOnline('"+x.id+"')"});
    a.push({icon:'📄',label:'PDF',action:"App.exportProcessOrderOnlinePDF('"+x.id+"')"});
    a.push({icon:'📊',label:'Excel',action:"App.exportProcessOrderOnlineExcel('"+x.id+"')"});
    if(x.outputLotId)a.push({icon:'🔎',label:'Gjurmueshmëri 360°',action:"App.openLot360('"+x.outputLotId+"')"});
    return App.rowActionMenu(a);
  }

  function packagingActions(x) {
    var a=[{icon:'👁',label:'Shiko',action:"App.openPackagingOrderOnline('"+x.id+"')"}];
    if(x.status==='DRAFT'){
      a.push({icon:'✏️',label:'Edito Draft',action:"App.editPackagingOrderOnline('"+x.id+"')"});
      a.push({icon:'✓',label:'Posto Paketimin',action:"App.postPackagingOrderOnline('"+x.id+"')"});
      a.push({icon:'🗑',label:'Fshi Draft',danger:true,action:"App.deletePackagingOrderOnline('"+x.id+"')"});
    }
    a.push({icon:'🖨',label:'Print',action:"App.printPackagingOrderOnline('"+x.id+"')"});
    a.push({icon:'📄',label:'PDF',action:"App.exportPackagingOrderOnlinePDF('"+x.id+"')"});
    a.push({icon:'📊',label:'Excel',action:"App.exportPackagingOrderOnlineExcel('"+x.id+"')"});
    if(x.outputLotId)a.push({icon:'🔎',label:'Gjurmueshmëri 360°',action:"App.openLot360('"+x.outputLotId+"')"});
    return App.rowActionMenu(a);
  }

  function renderProcessTable(rows) {
    var body=(rows||[]).map(function(x){
      return '<tr ondblclick="App.openProcessOrderOnline(\''+x.id+'\')"><td><button class="sg-eye-btn" onclick="App.openProcessOrderOnline(\''+x.id+'\')">👁</button></td><td><strong>'+esc(x.workOrderNo)+'</strong></td><td>'+esc(dateOnly(x.orderDate))+'</td><td>'+esc(x.processType)+'</td><td>'+esc(x.outputProductName||productName(x.outputProductId))+'</td><td class="text-right">'+fmtKg(x.inputQuantity)+'</td><td class="text-right">'+fmtKg(x.outputQuantity)+'</td><td class="text-right">'+fmtKg(x.wasteQuantity)+'</td><td class="text-right">'+fmtKg(x.lossQuantity)+'</td><td class="text-right">'+fmt(x.yieldPercent)+'%</td><td>'+esc(x.outputLotNumber||'—')+'</td><td><span class="status-badge status-'+esc(x.status)+'">'+esc(statusLabel(x.status))+'</span></td><td onclick="event.stopPropagation()">'+processActions(x)+'</td></tr>';
    }).join('');
    return '<div class="report-table-wrap"><table><thead><tr><th></th><th>Urdhri</th><th>Data</th><th>Procesi</th><th>Produkti dalës</th><th>Hyrje kg</th><th>Dalje kg</th><th>Mbetje</th><th>Humbje</th><th>Rendiment</th><th>Loti dalës</th><th>Status</th><th>Veprime</th></tr></thead><tbody>'+body+'</tbody></table></div>'+(body?'':'<p class="empty-report">Nuk ka Urdhra Pune. Shtypni “+ Urdhër Pune”.</p>');
  }

  function renderPackagingTable(rows) {
    var body=(rows||[]).map(function(x){
      return '<tr ondblclick="App.openPackagingOrderOnline(\''+x.id+'\')"><td><button class="sg-eye-btn" onclick="App.openPackagingOrderOnline(\''+x.id+'\')">👁</button></td><td><strong>'+esc(x.packagingNo)+'</strong></td><td>'+esc(dateOnly(x.orderDate))+'</td><td>'+esc(x.inputLotNumber||'—')+'</td><td>'+esc(x.outputProductName||productName(x.outputProductId))+'</td><td class="text-right">'+fmtKg(x.inputQuantity)+'</td><td class="text-right">'+fmtKg(x.outputQuantity)+'</td><td class="text-right">'+fmt(x.packageCount)+'</td><td class="text-right">'+fmtKg(x.netWeightPerPackage)+'</td><td>'+esc(dateOnly(x.expiryDate)||'—')+'</td><td>'+esc(x.outputLotNumber||'—')+'</td><td><span class="status-badge status-'+esc(x.status)+'">'+esc(statusLabel(x.status))+'</span></td><td onclick="event.stopPropagation()">'+packagingActions(x)+'</td></tr>';
    }).join('');
    return '<div class="report-table-wrap"><table><thead><tr><th></th><th>Dokumenti</th><th>Data</th><th>Loti hyrës</th><th>Produkti i paketuar</th><th>Hyrje kg</th><th>Dalje kg</th><th>Pako</th><th>Kg/pako</th><th>Skadenca</th><th>Loti dalës</th><th>Status</th><th>Veprime</th></tr></thead><tbody>'+body+'</tbody></table></div>'+(body?'':'<p class="empty-report">Nuk ka dokumente Paketimi. Shtypni “+ Paketim”.</p>');
  }

  App.selectPhase42Tab=function(tab){this._phase42Tab=tab;this.view_traceProcesses();};
  App.view_traceProcesses=async function(){
    try{
      await loadData();
      var tab=this._phase42Tab||'process';
      var processRows=(this.data.processOrders||[]).slice();
      var packagingRows=(this.data.packagingOrders||[]).slice();
      document.getElementById('content').innerHTML='<div class="sg42-flow"><span>Lot RAW</span><b>→</b><span>Urdhër Pune</span><b>→</b><span>Lot PROCESSED</span><b>→</b><span>Paketim</span><b>→</b><span>Lot PACKAGED</span></div><div class="card"><div class="card-title"><span>⚙️ Proces & Paketim Cloud</span><div class="card-title-actions"><button class="btn btn-primary btn-sm" onclick="App.editProcessOrderOnline()">+ Urdhër Pune</button><button class="btn btn-green btn-sm" onclick="App.editPackagingOrderOnline()">+ Paketim</button></div></div><div class="sg42-tabs"><button class="'+(tab==='process'?'active':'')+'" onclick="App.selectPhase42Tab(\'process\')">Urdhra Pune ('+processRows.length+')</button><button class="'+(tab==='packaging'?'active':'')+'" onclick="App.selectPhase42Tab(\'packaging\')">Paketimi ('+packagingRows.length+')</button></div>'+(tab==='process'?renderProcessTable(processRows):renderPackagingTable(packagingRows))+'</div>';
      if(this.enhanceEmptyCreateActions)this.enhanceEmptyCreateActions();
    }catch(e){this.toast(e.message||String(e),'error');}
  };

  function availableLots(warehouseId,type){
    return (App.data.lots||[]).filter(function(l){return l.status==='AVAILABLE'&&l.qualityStatus==='APPROVED'&&num(l.quantityAvailable)>0&&(!warehouseId||l.warehouseId===warehouseId)&&(!type||l.lotType===type);});
  }

  function renderProcessInputs(){
    var tbody=document.getElementById('sg42-process-inputs'); if(!tbody)return;
    var warehouseId=value('sg42-process-warehouse');
    var lots=availableLots(warehouseId);
    tbody.innerHTML=(App._sg42ProcessInputs||[]).map(function(line,index){
      var lot=byId(App.data.lots,line.lotId)||{};
      return '<tr><td>'+(index+1)+'</td><td><select class="sg42-lot" onchange="App.sg42ProcessInputChanged('+index+',this.value)">'+options(lots,line.lotId,'Lot hyrës',function(x){return x.lotNumber+' — '+x.productName+' — '+fmtKg(x.quantityAvailable)+' kg';})+'</select></td><td class="text-right">'+fmtKg(lot.quantityAvailable||0)+'</td><td><input class="sg42-qty" type="number" min="0.001" step="0.001" value="'+attr(line.quantity||0)+'" oninput="App.sg42ProcessQtyChanged('+index+',this.value)"></td><td><button class="btn btn-red btn-sm" onclick="App.removeProcessInputOnline('+index+')">×</button></td></tr>';
    }).join('');
    App.calcProcessOnline();
  }
  App.sg42ProcessInputChanged=function(index,id){this._sg42ProcessInputs[index].lotId=id;renderProcessInputs();};
  App.sg42ProcessQtyChanged=function(index,v){this._sg42ProcessInputs[index].quantity=num(v);this.calcProcessOnline();};
  App.addProcessInputOnline=function(){this._sg42ProcessInputs=this._sg42ProcessInputs||[];this._sg42ProcessInputs.push({lotId:'',quantity:0});renderProcessInputs();};
  App.removeProcessInputOnline=function(index){this._sg42ProcessInputs.splice(index,1);if(!this._sg42ProcessInputs.length)this._sg42ProcessInputs.push({lotId:'',quantity:0});renderProcessInputs();};
  App.calcProcessOnline=function(){
    var input=(this._sg42ProcessInputs||[]).reduce(function(s,x){return s+num(x.quantity);},0),output=num(value('sg42-process-output')),waste=num(value('sg42-process-waste')),loss=num(value('sg42-process-loss'));
    var diff=input-output-waste-loss,yieldPct=input?output/input*100:0,box=document.getElementById('sg42-process-calc');
    if(box)box.innerHTML='<div><span>Hyrje</span><strong>'+fmtKg(input)+' kg</strong></div><div><span>Dalje</span><strong>'+fmtKg(output)+' kg</strong></div><div><span>Mbetje + humbje</span><strong>'+fmtKg(waste+loss)+' kg</strong></div><div class="'+(Math.abs(diff)<0.000001?'ok':'bad')+'"><span>Diferenca</span><strong>'+fmtKg(diff)+' kg</strong></div><div><span>Rendiment</span><strong>'+fmt(yieldPct)+'%</strong></div>';
  };

  App.editProcessOrderOnline=async function(id){
    try{
      await loadData();
      var x=id?camel(await Cloud.request('/api/trace/process-orders/'+encodeURIComponent(id))):{};
      if(x.status&&x.status!=='DRAFT')throw new Error('Vetëm Urdhri Draft mund të editohet.');
      this._sg42ProcessInputs=(x.inputs&&x.inputs.length?x.inputs:[{lotId:'',quantity:0}]).map(function(v){return {lotId:v.lotId,quantity:num(v.quantity)};});
      var companyId=selectedCompanyId();
      var warehouses=(this.data.warehouses||[]).filter(function(w){return !companyId||w.companyId===companyId;});
      var products=(this.data.products||[]).filter(function(p){return p.active!==false&&(!companyId||p.companyId===companyId);});
      var body='<div class="sg42-form-grid"><div class="form-group"><label>Data *</label><input id="sg42-process-date" type="date" value="'+attr(dateOnly(x.orderDate)||new Date().toISOString().slice(0,10))+'"></div><div class="form-group"><label>Lloji i procesit *</label><input id="sg42-process-type" value="'+attr(x.processType||'Pastrim / Tharje')+'"></div><div class="form-group"><label>Magazina *</label><select id="sg42-process-warehouse" onchange="App.sg42ProcessWarehouseChanged()">'+options(warehouses,x.warehouseId||'','Magazinë')+'</select></div><div class="form-group"><label>Produkti dalës *</label><select id="sg42-process-product">'+options(products,x.outputProductId||'','Produkt dalës')+'</select></div><div class="form-group"><label>Sasia dalëse kg *</label><input id="sg42-process-output" type="number" step="0.001" value="'+attr(x.outputQuantity||0)+'" oninput="App.calcProcessOnline()"></div><div class="form-group"><label>Mbetje kg</label><input id="sg42-process-waste" type="number" step="0.001" value="'+attr(x.wasteQuantity||0)+'" oninput="App.calcProcessOnline()"></div><div class="form-group"><label>Humbje kg</label><input id="sg42-process-loss" type="number" step="0.001" value="'+attr(x.lossQuantity||0)+'" oninput="App.calcProcessOnline()"></div><div class="form-group"><label>Kosto direkte</label><input id="sg42-process-cost" type="number" step="0.01" value="'+attr(x.directCost||0)+'"></div><div class="form-group"><label>Cilësia e lotit dalës</label><select id="sg42-process-quality"><option value="APPROVED">Aprovuar</option><option value="QUARANTINE">Karantinë</option><option value="REJECTED">Refuzuar</option></select></div></div><h4>Lotet hyrëse</h4><div class="report-table-wrap"><table><thead><tr><th>#</th><th>Loti</th><th>Disponueshme</th><th>Sasia kg</th><th></th></tr></thead><tbody id="sg42-process-inputs"></tbody></table></div><button class="btn btn-outline btn-sm" onclick="App.addProcessInputOnline()">+ Shto lot hyrës</button><div id="sg42-process-calc" class="sg42-calc"></div><div class="form-group"><label>Shënime</label><textarea id="sg42-process-notes">'+esc(x.notes||'')+'</textarea></div>';
      var footer='<button class="btn btn-outline" onclick="App.closeModal()">Anulo</button><button class="btn btn-primary" onclick="App.saveProcessOrderOnline(\''+(id||'')+'\')">Ruaj Draft</button>';
      this.modal(id?'Edito Urdhrin e Punës':'Urdhër Pune i Ri',body,footer);
      document.getElementById('sg42-process-quality').value=x.outputQualityStatus||'APPROVED';
      renderProcessInputs();
    }catch(e){this.toast(e.message||String(e),'error');}
  };
  App.sg42ProcessWarehouseChanged=function(){renderProcessInputs();};

  function processPayload(){
    var inputs=(App._sg42ProcessInputs||[]).filter(function(x){return x.lotId&&num(x.quantity)>0;}).map(function(x){return {lotId:x.lotId,quantity:num(x.quantity)};});
    return {companyId:selectedCompanyId(),warehouseId:value('sg42-process-warehouse'),outputProductId:value('sg42-process-product'),processType:value('sg42-process-type').trim(),orderDate:value('sg42-process-date'),outputQuantity:num(value('sg42-process-output')),wasteQuantity:num(value('sg42-process-waste')),lossQuantity:num(value('sg42-process-loss')),directCost:num(value('sg42-process-cost')),outputQualityStatus:value('sg42-process-quality')||'APPROVED',notes:value('sg42-process-notes'),inputs:inputs};
  }
  App.saveProcessOrderOnline=async function(id){
    try{Auth.requirePermission(id?'documents.edit':'documents.create');var row=await Cloud.request(id?'/api/trace/process-orders/'+encodeURIComponent(id):'/api/trace/process-orders',{method:id?'PATCH':'POST',body:processPayload()});this.closeModal();await loadData();this._phase42Tab='process';this.view_traceProcesses();this.toast('Urdhri u ruajt: '+(row.work_order_no||row.workOrderNo));}catch(e){this.toast(e.message||String(e),'error');}
  };
  App.postProcessOrderOnline=async function(id){try{Auth.requirePermission('documents.post');if(!global.confirm('Posto Urdhrin e Punës? Lotet hyrëse dhe stoku do të konsumohen dhe do të krijohet loti PROCESSED.'))return;var r=await Cloud.request('/api/trace/process-orders/'+encodeURIComponent(id)+'/post',{method:'POST',body:{}});await Cloud.refresh();this._phase42Tab='process';this.navigate('traceProcesses');this.toast('U krijua loti '+r.outputLot.lotNumber);}catch(e){this.toast(e.message||String(e),'error');}};
  App.deleteProcessOrderOnline=async function(id){try{Auth.requirePermission('documents.cancel');if(!global.confirm('Fshi Urdhrin Draft?'))return;await Cloud.request('/api/trace/process-orders/'+encodeURIComponent(id),{method:'DELETE'});await loadData();this._phase42Tab='process';this.view_traceProcesses();this.toast('Drafti u fshi.');}catch(e){this.toast(e.message||String(e),'error');}};

  function processDocHtml(x){
    var inputs=(x.inputs||[]).map(function(i,index){return '<tr><td>'+(index+1)+'</td><td>'+esc(i.lotNumber||i.lotId)+'</td><td>'+esc(i.productName||productName(i.productId))+'</td><td class="text-right">'+fmtKg(i.quantity)+' kg</td></tr>';}).join('');
    return '<div class="inv-header"><div>'+companyHeader()+'</div><div style="text-align:right"><strong>URDHËR PUNE</strong><br>Nr: '+esc(x.workOrderNo)+'<br>Data: '+esc(dateOnly(x.orderDate))+'<br>Status: '+esc(statusLabel(x.status))+'</div></div><div class="inv-party"><strong>Procesi:</strong> '+esc(x.processType)+'<br><strong>Magazina:</strong> '+esc(x.warehouseName||warehouseName(x.warehouseId))+'<br><strong>Produkti dalës:</strong> '+esc(x.outputProductName||productName(x.outputProductId))+(x.outputLotNumber?'<br><strong>Loti dalës:</strong> '+esc(x.outputLotNumber):'')+'</div><table><thead><tr><th>#</th><th>Loti hyrës</th><th>Artikulli</th><th>Sasia</th></tr></thead><tbody>'+inputs+'</tbody></table><table style="width:420px;margin-left:auto"><tbody><tr><td>Hyrje</td><td class="text-right">'+fmtKg(x.inputQuantity)+' kg</td></tr><tr><td>Dalje</td><td class="text-right">'+fmtKg(x.outputQuantity)+' kg</td></tr><tr><td>Mbetje</td><td class="text-right">'+fmtKg(x.wasteQuantity)+' kg</td></tr><tr><td>Humbje</td><td class="text-right">'+fmtKg(x.lossQuantity)+' kg</td></tr><tr><td>Rendiment</td><td class="text-right">'+fmt(x.yieldPercent)+'%</td></tr><tr><td>Kosto direkte</td><td class="text-right">'+fmt(x.directCost)+' ALL</td></tr></tbody></table><p><strong>Shënime:</strong> '+esc(x.notes||'—')+'</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:80px;margin-top:55px"><div style="border-top:1px solid #555;text-align:center;padding-top:5px">Operatori</div><div style="border-top:1px solid #555;text-align:center;padding-top:5px">Përgjegjësi i Prodhimit</div></div>';
  }

  App.openProcessOrderOnline=async function(id){try{var x=camel(await Cloud.request('/api/trace/process-orders/'+encodeURIComponent(id)));var footer='<button class="btn btn-outline" onclick="App.printProcessOrderOnline(\''+id+'\')">🖨 Print</button><button class="btn btn-red" onclick="App.exportProcessOrderOnlinePDF(\''+id+'\')">PDF</button><button class="btn btn-green" onclick="App.exportProcessOrderOnlineExcel(\''+id+'\')">Excel</button>'+(x.status==='DRAFT'?'<button class="btn btn-primary" onclick="App.closeModal();App.editProcessOrderOnline(\''+id+'\')">✏ Edito</button><button class="btn btn-blue" onclick="App.closeModal();App.postProcessOrderOnline(\''+id+'\')">✓ Posto</button>':'')+(x.outputLotId?'<button class="btn btn-outline" onclick="App.closeModal();App.openLot360(\''+x.outputLotId+'\')">🔎 Loti 360°</button>':'')+'<button class="btn btn-outline" onclick="App.closeModal()">Mbyll</button>';this.modal('Urdhër Pune '+x.workOrderNo,processDocHtml(x),footer);}catch(e){this.toast(e.message||String(e),'error');}};
  App.printProcessOrderOnline=async function(id){var x=camel(await Cloud.request('/api/trace/process-orders/'+encodeURIComponent(id)));this.openPrintWindow(processDocHtml(x),'Urdher Pune '+x.workOrderNo);};
  App.exportProcessOrderOnlinePDF=async function(id){var x=camel(await Cloud.request('/api/trace/process-orders/'+encodeURIComponent(id)));if(!global.PDFEngine)return this.toast('Motori PDF nuk u ngarkua.','error');global.PDFEngine.downloadReport({company:this.company,title:'URDHËR PUNE '+x.workOrderNo,sections:[{title:'Lotet hyrëse',notes:['Data: '+dateOnly(x.orderDate),'Procesi: '+x.processType,'Magazina: '+(x.warehouseName||warehouseName(x.warehouseId)),'Produkti dalës: '+(x.outputProductName||productName(x.outputProductId)),'Statusi: '+statusLabel(x.status)],columns:[{key:'lotNumber',label:'Loti',width:170},{key:'productName',label:'Artikulli',width:220},{key:'quantity',label:'Sasia kg',type:'number',width:100}],rows:(x.inputs||[])},{title:'Bilanci',columns:[{key:'label',label:'Treguesi',width:220},{key:'value',label:'Vlera',type:'number',width:120},{key:'unit',label:'Njësia',width:80}],rows:[{label:'Hyrje',value:num(x.inputQuantity),unit:'kg'},{label:'Dalje',value:num(x.outputQuantity),unit:'kg'},{label:'Mbetje',value:num(x.wasteQuantity),unit:'kg'},{label:'Humbje',value:num(x.lossQuantity),unit:'kg'},{label:'Rendiment',value:num(x.yieldPercent),unit:'%'}]}],orientation:'portrait',filename:'Urdher_Pune_'+safeName(x.workOrderNo)+'.pdf',footer:(this.company||{}).invoiceFooter||''});this.toast('PDF i Urdhrit të Punës u eksportua.');};
  App.exportProcessOrderOnlineExcel=async function(id){var x=camel(await Cloud.request('/api/trace/process-orders/'+encodeURIComponent(id)));if(!global.XLSX||!global.DesktopIO)return this.toast('Motori Excel nuk u ngarkua.','error');var aoa=[['URDHËR PUNE',x.workOrderNo],[(this.company||{}).name||'Sistemi Genit','NIPT: '+((this.company||{}).nipt||'')],['Data',new Date(x.orderDate)],['Procesi',x.processType],['Magazina',x.warehouseName||warehouseName(x.warehouseId)],['Produkti dalës',x.outputProductName||productName(x.outputProductId)],['Statusi',statusLabel(x.status)],[],['Nr.','Loti hyrës','Artikulli','Sasia kg']];(x.inputs||[]).forEach(function(i,k){aoa.push([k+1,i.lotNumber||i.lotId,i.productName||productName(i.productId),num(i.quantity)]);});aoa.push([]);aoa.push(['Hyrje',num(x.inputQuantity),'kg']);aoa.push(['Dalje',num(x.outputQuantity),'kg']);aoa.push(['Mbetje',num(x.wasteQuantity),'kg']);aoa.push(['Humbje',num(x.lossQuantity),'kg']);aoa.push(['Rendiment',num(x.yieldPercent),'%']);aoa.push(['Kosto direkte',num(x.directCost),'ALL']);var ws=XLSX.utils.aoa_to_sheet(aoa,{cellDates:true});ws['!cols']=[{wch:18},{wch:28},{wch:32},{wch:15}];var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Urdhër Pune');DesktopIO.saveWorkbook(wb,'Urdher_Pune_'+safeName(x.workOrderNo)+'.xlsx');this.toast('Excel i Urdhrit të Punës u eksportua.');};

  App.editPackagingOrderOnline=async function(id){
    try{
      await loadData();var x=id?camel(await Cloud.request('/api/trace/packaging-orders/'+encodeURIComponent(id))):{};if(x.status&&x.status!=='DRAFT')throw new Error('Vetëm Paketimi Draft mund të editohet.');
      var companyId=selectedCompanyId(),warehouses=(this.data.warehouses||[]).filter(function(w){return !companyId||w.companyId===companyId;}),products=(this.data.products||[]).filter(function(p){return p.active!==false&&(!companyId||p.companyId===companyId);}),lots=availableLots(x.warehouseId||'','PROCESSED');
      var body='<div class="sg42-form-grid"><div class="form-group"><label>Data *</label><input id="sg42-pack-date" type="date" value="'+attr(dateOnly(x.orderDate)||new Date().toISOString().slice(0,10))+'"></div><div class="form-group"><label>Magazina *</label><select id="sg42-pack-warehouse" onchange="App.sg42PackagingWarehouseChanged()">'+options(warehouses,x.warehouseId||'','Magazinë')+'</select></div><div class="form-group"><label>Loti PROCESSED hyrës *</label><select id="sg42-pack-lot" onchange="App.calcPackagingOnline()">'+options(lots,x.inputLotId||'','Lot PROCESSED',function(l){return l.lotNumber+' — '+l.productName+' — '+fmtKg(l.quantityAvailable)+' kg';})+'</select></div><div class="form-group"><label>Produkti i paketuar *</label><select id="sg42-pack-product">'+options(products,x.outputProductId||'','Produkt i paketuar')+'</select></div><div class="form-group"><label>Hyrje kg *</label><input id="sg42-pack-input" type="number" step="0.001" value="'+attr(x.inputQuantity||0)+'" oninput="App.calcPackagingOnline()"></div><div class="form-group"><label>Dalje kg *</label><input id="sg42-pack-output" type="number" step="0.001" value="'+attr(x.outputQuantity||0)+'" oninput="App.calcPackagingOnline()"></div><div class="form-group"><label>Mbetje kg</label><input id="sg42-pack-waste" type="number" step="0.001" value="'+attr(x.wasteQuantity||0)+'" oninput="App.calcPackagingOnline()"></div><div class="form-group"><label>Nr. pakove *</label><input id="sg42-pack-count" type="number" step="1" value="'+attr(x.packageCount||0)+'" oninput="App.calcPackagingOnline()"></div><div class="form-group"><label>Njësi për pako</label><input id="sg42-pack-units" type="number" step="1" value="'+attr(x.unitsPerPackage||1)+'"></div><div class="form-group"><label>Pesha neto për pako kg *</label><input id="sg42-pack-weight" type="number" step="0.001" value="'+attr(x.netWeightPerPackage||0)+'" oninput="App.calcPackagingOnline()"></div><div class="form-group"><label>Kosto direkte</label><input id="sg42-pack-cost" type="number" step="0.01" value="'+attr(x.directCost||0)+'"></div><div class="form-group"><label>Skadenca</label><input id="sg42-pack-expiry" type="date" value="'+attr(dateOnly(x.expiryDate))+'"></div><div class="form-group"><label>Cilësia e lotit dalës</label><select id="sg42-pack-quality"><option value="APPROVED">Aprovuar</option><option value="QUARANTINE">Karantinë</option><option value="REJECTED">Refuzuar</option></select></div></div><div id="sg42-pack-calc" class="sg42-calc"></div><div class="form-group"><label>Shënime</label><textarea id="sg42-pack-notes">'+esc(x.notes||'')+'</textarea></div>';
      this.modal(id?'Edito Paketimin':'Dokument Paketimi i Ri',body,'<button class="btn btn-outline" onclick="App.closeModal()">Anulo</button><button class="btn btn-green" onclick="App.savePackagingOrderOnline(\''+(id||'')+'\')">Ruaj Draft</button>');document.getElementById('sg42-pack-quality').value=x.outputQualityStatus||'APPROVED';this.calcPackagingOnline();
    }catch(e){this.toast(e.message||String(e),'error');}
  };
  App.sg42PackagingWarehouseChanged=function(){var select=document.getElementById('sg42-pack-lot');if(select)select.innerHTML=options(availableLots(value('sg42-pack-warehouse'),'PROCESSED'),'', 'Lot PROCESSED',function(l){return l.lotNumber+' — '+l.productName+' — '+fmtKg(l.quantityAvailable)+' kg';});this.calcPackagingOnline();};
  App.calcPackagingOnline=function(){var input=num(value('sg42-pack-input')),output=num(value('sg42-pack-output')),waste=num(value('sg42-pack-waste')),count=num(value('sg42-pack-count')),weight=num(value('sg42-pack-weight')),calculated=count*weight,diff=input-output-waste,packDiff=output-calculated,box=document.getElementById('sg42-pack-calc');if(box)box.innerHTML='<div><span>Hyrje</span><strong>'+fmtKg(input)+' kg</strong></div><div><span>Dalje</span><strong>'+fmtKg(output)+' kg</strong></div><div><span>Pako × kg</span><strong>'+fmtKg(calculated)+' kg</strong></div><div class="'+(Math.abs(diff)<0.000001?'ok':'bad')+'"><span>Diferenca masë</span><strong>'+fmtKg(diff)+' kg</strong></div><div class="'+(Math.abs(packDiff)<0.000001?'ok':'bad')+'"><span>Diferenca paketim</span><strong>'+fmtKg(packDiff)+' kg</strong></div>';};
  function packagingPayload(){return {companyId:selectedCompanyId(),warehouseId:value('sg42-pack-warehouse'),inputLotId:value('sg42-pack-lot'),outputProductId:value('sg42-pack-product'),orderDate:value('sg42-pack-date'),inputQuantity:num(value('sg42-pack-input')),outputQuantity:num(value('sg42-pack-output')),wasteQuantity:num(value('sg42-pack-waste')),packageCount:num(value('sg42-pack-count')),unitsPerPackage:num(value('sg42-pack-units')),netWeightPerPackage:num(value('sg42-pack-weight')),directCost:num(value('sg42-pack-cost')),outputQualityStatus:value('sg42-pack-quality')||'APPROVED',expiryDate:value('sg42-pack-expiry')||null,notes:value('sg42-pack-notes')};}
  App.savePackagingOrderOnline=async function(id){try{Auth.requirePermission(id?'documents.edit':'documents.create');var row=await Cloud.request(id?'/api/trace/packaging-orders/'+encodeURIComponent(id):'/api/trace/packaging-orders',{method:id?'PATCH':'POST',body:packagingPayload()});this.closeModal();await loadData();this._phase42Tab='packaging';this.view_traceProcesses();this.toast('Paketimi u ruajt: '+(row.packaging_no||row.packagingNo));}catch(e){this.toast(e.message||String(e),'error');}};
  App.postPackagingOrderOnline=async function(id){try{Auth.requirePermission('documents.post');if(!global.confirm('Posto Paketimin? Loti PROCESSED do të konsumohet dhe do të krijohet loti PACKAGED.'))return;var r=await Cloud.request('/api/trace/packaging-orders/'+encodeURIComponent(id)+'/post',{method:'POST',body:{}});await Cloud.refresh();this._phase42Tab='packaging';this.navigate('traceProcesses');this.toast('U krijua loti '+r.outputLot.lotNumber);}catch(e){this.toast(e.message||String(e),'error');}};
  App.deletePackagingOrderOnline=async function(id){try{Auth.requirePermission('documents.cancel');if(!global.confirm('Fshi Paketimin Draft?'))return;await Cloud.request('/api/trace/packaging-orders/'+encodeURIComponent(id),{method:'DELETE'});await loadData();this._phase42Tab='packaging';this.view_traceProcesses();this.toast('Drafti u fshi.');}catch(e){this.toast(e.message||String(e),'error');}};

  function packagingDocHtml(x){return '<div class="inv-header"><div>'+companyHeader()+'</div><div style="text-align:right"><strong>DOKUMENT PAKETIMI</strong><br>Nr: '+esc(x.packagingNo)+'<br>Data: '+esc(dateOnly(x.orderDate))+'<br>Status: '+esc(statusLabel(x.status))+'</div></div><div class="inv-party"><strong>Loti hyrës:</strong> '+esc(x.inputLotNumber||x.inputLotId)+'<br><strong>Produkti hyrës:</strong> '+esc(x.inputProductName||'—')+'<br><strong>Produkti i paketuar:</strong> '+esc(x.outputProductName||productName(x.outputProductId))+(x.outputLotNumber?'<br><strong>Loti dalës:</strong> '+esc(x.outputLotNumber):'')+'</div><table><thead><tr><th>Hyrje kg</th><th>Dalje kg</th><th>Mbetje kg</th><th>Nr. pakove</th><th>Njësi/pako</th><th>Kg/pako</th><th>Skadenca</th></tr></thead><tbody><tr><td class="text-right">'+fmtKg(x.inputQuantity)+'</td><td class="text-right">'+fmtKg(x.outputQuantity)+'</td><td class="text-right">'+fmtKg(x.wasteQuantity)+'</td><td class="text-right">'+fmt(x.packageCount)+'</td><td class="text-right">'+fmt(x.unitsPerPackage)+'</td><td class="text-right">'+fmtKg(x.netWeightPerPackage)+'</td><td>'+esc(dateOnly(x.expiryDate)||'—')+'</td></tr></tbody></table><p><strong>Shënime:</strong> '+esc(x.notes||'—')+'</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:80px;margin-top:55px"><div style="border-top:1px solid #555;text-align:center;padding-top:5px">Paketuesi</div><div style="border-top:1px solid #555;text-align:center;padding-top:5px">Kontrolli i Cilësisë</div></div>';}
  App.openPackagingOrderOnline=async function(id){try{var x=camel(await Cloud.request('/api/trace/packaging-orders/'+encodeURIComponent(id)));var footer='<button class="btn btn-outline" onclick="App.printPackagingOrderOnline(\''+id+'\')">🖨 Print</button><button class="btn btn-red" onclick="App.exportPackagingOrderOnlinePDF(\''+id+'\')">PDF</button><button class="btn btn-green" onclick="App.exportPackagingOrderOnlineExcel(\''+id+'\')">Excel</button>'+(x.status==='DRAFT'?'<button class="btn btn-primary" onclick="App.closeModal();App.editPackagingOrderOnline(\''+id+'\')">✏ Edito</button><button class="btn btn-blue" onclick="App.closeModal();App.postPackagingOrderOnline(\''+id+'\')">✓ Posto</button>':'')+(x.outputLotId?'<button class="btn btn-outline" onclick="App.closeModal();App.openLot360(\''+x.outputLotId+'\')">🔎 Loti 360°</button>':'')+'<button class="btn btn-outline" onclick="App.closeModal()">Mbyll</button>';this.modal('Paketimi '+x.packagingNo,packagingDocHtml(x),footer);}catch(e){this.toast(e.message||String(e),'error');}};
  App.printPackagingOrderOnline=async function(id){var x=camel(await Cloud.request('/api/trace/packaging-orders/'+encodeURIComponent(id)));this.openPrintWindow(packagingDocHtml(x),'Paketimi '+x.packagingNo);};
  App.exportPackagingOrderOnlinePDF=async function(id){var x=camel(await Cloud.request('/api/trace/packaging-orders/'+encodeURIComponent(id)));if(!global.PDFEngine)return this.toast('Motori PDF nuk u ngarkua.','error');global.PDFEngine.downloadReport({company:this.company,title:'DOKUMENT PAKETIMI '+x.packagingNo,sections:[{title:'Paketimi',notes:['Data: '+dateOnly(x.orderDate),'Loti hyrës: '+(x.inputLotNumber||x.inputLotId),'Produkti i paketuar: '+(x.outputProductName||productName(x.outputProductId)),'Statusi: '+statusLabel(x.status)],columns:[{key:'inputQuantity',label:'Hyrje kg',type:'number',width:90},{key:'outputQuantity',label:'Dalje kg',type:'number',width:90},{key:'wasteQuantity',label:'Mbetje kg',type:'number',width:90},{key:'packageCount',label:'Pako',type:'number',width:80},{key:'unitsPerPackage',label:'Njësi/pako',type:'number',width:90},{key:'netWeightPerPackage',label:'Kg/pako',type:'number',width:90},{key:'expiryDate',label:'Skadenca',type:'date',width:110}],rows:[x]}],orientation:'landscape',filename:'Paketimi_'+safeName(x.packagingNo)+'.pdf',footer:(this.company||{}).invoiceFooter||''});this.toast('PDF i Paketimit u eksportua.');};
  App.exportPackagingOrderOnlineExcel=async function(id){var x=camel(await Cloud.request('/api/trace/packaging-orders/'+encodeURIComponent(id)));if(!global.XLSX||!global.DesktopIO)return this.toast('Motori Excel nuk u ngarkua.','error');var aoa=[['DOKUMENT PAKETIMI',x.packagingNo],[(this.company||{}).name||'Sistemi Genit','NIPT: '+((this.company||{}).nipt||'')],['Data',new Date(x.orderDate)],['Magazina',x.warehouseName||warehouseName(x.warehouseId)],['Loti hyrës',x.inputLotNumber||x.inputLotId],['Produkti hyrës',x.inputProductName||''],['Produkti i paketuar',x.outputProductName||productName(x.outputProductId)],['Loti dalës',x.outputLotNumber||''],['Statusi',statusLabel(x.status)],[],['Hyrje kg','Dalje kg','Mbetje kg','Nr. pakove','Njësi/pako','Kg/pako','Skadenca'],[num(x.inputQuantity),num(x.outputQuantity),num(x.wasteQuantity),num(x.packageCount),num(x.unitsPerPackage),num(x.netWeightPerPackage),x.expiryDate?new Date(x.expiryDate):''],[],['Kosto direkte',num(x.directCost),'ALL'],['Shënime',x.notes||'']];var ws=XLSX.utils.aoa_to_sheet(aoa,{cellDates:true});ws['!cols']=[{wch:18},{wch:22},{wch:18},{wch:16},{wch:16},{wch:16},{wch:16}];var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Paketimi');DesktopIO.saveWorkbook(wb,'Paketimi_'+safeName(x.packagingNo)+'.xlsx');this.toast('Excel i Paketimit u eksportua.');};

  App.SGPhase42={load:loadData};
})(window);
