/* SG_PHASE74_SIMPLE_WORK_ORDER_UI_START — Sistemi Genit */
(function (global) {
  'use strict';

  var App = global.App;
  var Cloud = global.CloudERP;
  if (!App || !Cloud || !App.SGPhase71 || global.__SG_PHASE74_SIMPLE_WORK_ORDER_UI__) return;
  global.__SG_PHASE74_SIMPLE_WORK_ORDER_UI__ = true;

  var draft = { campaignId:'', stepId:'', processId:'', centerId:'', warehouseId:'', outputProductId:'', rows:[] };

  function state() { return App.SGPhase71.state || {}; }
  function rows(name) { return state()[name] || []; }
  function lots() { return (App.data && App.data.lots) || []; }
  function products() { return (App.data && App.data.products) || []; }
  function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function fmt(value, digits) { return num(value).toLocaleString('sq-AL', { maximumFractionDigits:digits == null ? 3 : digits }); }
  function esc(value) { return App.esc ? App.esc(value == null ? '' : String(value)) : String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function attr(value) { return esc(value).replace(/"/g,'&quot;'); }
  function byId(list, id) { return (list || []).find(function (item) { return item.id === id; }); }
  function value(id) { var element = document.getElementById(id); return element ? element.value : ''; }
  function button(label, handler, className) { return '<button type="button" class="sg71-btn '+(className || '')+'" onclick="'+handler+'">'+label+'</button>'; }
  function option(list, selected, label, textFn) {
    return '<option value="">— '+esc(label || 'Zgjidh')+' —</option>'+(list || []).map(function (item) {
      var text = textFn ? textFn(item) : ((item.code ? item.code+' — ' : '')+(item.name || item.lotNumber || item.id));
      return '<option value="'+attr(item.id)+'"'+(item.id === selected ? ' selected' : '')+'>'+esc(text)+'</option>';
    }).join('');
  }
  function toastError(error) { App.toast(error && error.message ? error.message : String(error), 'error'); }

  function campaign() { return byId(rows('campaigns'), draft.campaignId); }
  function routeForCampaign() { var current = campaign(); return current && byId(rows('routes'), current.routeId); }
  function currentStep() { var route = routeForCampaign(); return route && byId(route.steps || [], draft.stepId); }
  function currentCenter() { return byId(rows('centers'), draft.centerId); }
  function currentProduct() { return byId(products(), draft.outputProductId); }
  function currentWarehouse() { return byId((App.data && App.data.warehouses) || [], draft.warehouseId); }

  function nextStepForCampaign(currentCampaign) {
    var route = currentCampaign && byId(rows('routes'), currentCampaign.routeId);
    var steps = (route && route.steps || []).slice().sort(function (a,b) { return num(a.sequenceNo)-num(b.sequenceNo); });
    var used = {};
    rows('orders').filter(function (order) {
      return order.campaignId === currentCampaign.id && order.mrpState !== 'CANCELLED';
    }).forEach(function (order) { if (order.routeStepId) used[order.routeStepId] = true; });
    return steps.find(function (step) { return !used[step.id]; }) || steps[0] || null;
  }

  function centerForStep(step) {
    if (!step) return null;
    var preferred = byId(rows('centers'), step.workCenterId);
    if (preferred && preferred.active !== false && preferred.status === 'AVAILABLE') return preferred;
    return rows('centers').find(function (center) {
      return center.processId === step.processId && center.active !== false && center.status === 'AVAILABLE';
    }) || rows('centers').find(function (center) { return center.processId === step.processId && center.active !== false; }) || null;
  }

  function locationForLot(lot) {
    var locations = rows('locations');
    return locations.find(function (location) {
      return location.locationType === 'SUPPLIER_RACK' && lot.supplierId && location.supplierId === lot.supplierId && (!location.warehouseId || location.warehouseId === lot.warehouseId);
    }) || locations.find(function (location) {
      return location.locationType === 'STOCK' && (!location.warehouseId || location.warehouseId === lot.warehouseId);
    }) || null;
  }

  function availableLots() {
    var current = campaign();
    return lots().filter(function (lot) {
      return lot.status === 'AVAILABLE' && lot.qualityStatus === 'APPROVED' && num(lot.quantityAvailable) > 0 &&
        (!current || lot.productId === current.productId) && (!draft.warehouseId || lot.warehouseId === draft.warehouseId);
    });
  }

  function totals() {
    return draft.rows.reduce(function (result, row) {
      result.kg += num(row.plannedQuantity);
      result.bags += num(row.bagCount);
      return result;
    }, { kg:0, bags:0 });
  }

  function renderHeader() {
    var element = document.getElementById('sg74-auto-head');
    if (!element) return;
    var currentCampaign = campaign();
    var step = currentStep();
    var process = step && byId(rows('processes'), step.processId);
    var center = currentCenter();
    var total = totals();
    var centers = rows('centers').filter(function (item) { return !step || item.processId === step.processId; });
    element.innerHTML = '<div class="sg74-auto-grid">'+
      '<div><span>Artikulli</span><strong>'+esc((currentProduct() || {}).name || (currentCampaign || {}).productName || 'Zgjidhet nga fushata')+'</strong></div>'+
      '<div><span>Procesi</span><strong>'+esc((process || {}).name || (step || {}).processName || 'Nuk u gjet procesi')+'</strong></div>'+
      '<div><span>Makineria</span><select id="sg74-center" onchange="App.sg74CenterChanged(this.value)">'+option(centers,draft.centerId,'Makineri',function(x){return x.code+' — '+x.name+(x.status !== 'AVAILABLE' ? ' — '+x.status : '');})+'</select>'+(centers.length ? '' : '<button type="button" class="sg71-btn sg71-btn-sm" onclick="App.sg71NewCenter()">+ Shto Makineri</button>')+'</div>'+
      '<div><span>Magazina</span><strong>'+esc((currentWarehouse() || {}).name || 'Merret nga loti i parë')+'</strong></div>'+
      '<div><span>Totali i planifikuar</span><strong>'+fmt(total.kg)+' kg</strong></div>'+
      '<div><span>Thasë të planifikuar</span><strong>'+fmt(total.bags,0)+'</strong></div>'+
    '</div>';
  }

  function renderRows() {
    var element = document.getElementById('sg74-input-rows');
    if (!element) return;
    var available = availableLots();
    var body = draft.rows.map(function (row, index) {
      var lot = byId(lots(), row.lotId) || {};
      var location = byId(rows('locations'), row.sourceLocationId) || {};
      return '<tr>'+
        '<td><select onchange="App.sg74LotChanged('+index+',this.value)">'+option(available,row.lotId,'Kërko lotin',function(item){return item.lotNumber+' — '+(item.supplierName || 'Pa furnitor')+' — '+fmt(item.quantityAvailable)+' kg';})+'</select></td>'+
        '<td><strong>'+esc(lot.supplierName || '—')+'</strong><br><small>'+esc(lot.lotNumber || '')+'</small></td>'+
        '<td class="sg74-right">'+fmt(lot.quantityAvailable)+' kg</td>'+
        '<td><input type="number" inputmode="numeric" min="0" step="1" value="'+attr(row.bagCount)+'" oninput="App.sg74NumberChanged('+index+',\'bagCount\',this.value)"></td>'+
        '<td><input type="number" inputmode="decimal" min="0" step="0.001" value="'+attr(row.plannedQuantity)+'" oninput="App.sg74NumberChanged('+index+',\'plannedQuantity\',this.value)"></td>'+
        '<td>'+esc(location.name || 'Zgjidhet vetë')+'</td>'+
        '<td><button type="button" class="sg71-btn sg71-btn-sm sg71-btn-danger" onclick="App.sg74RemoveRow('+index+')">×</button></td>'+
      '</tr>';
    }).join('');
    element.innerHTML = '<div class="sg71-table-wrap"><table class="sg71-table sg74-movement-table"><thead><tr><th>Loti</th><th>Furnitori</th><th>Gjendja</th><th>Thasë të marrë</th><th>Kg sipas etiketës</th><th>Rafti</th><th></th></tr></thead><tbody>'+body+'</tbody></table></div>'+
      '<div class="sg74-totals"><span>Gjithsej: <strong id="sg74-total-bags">'+fmt(totals().bags,0)+' thasë</strong></span><span>Peshë e planifikuar: <strong id="sg74-total-kg">'+fmt(totals().kg)+' kg</strong></span></div>';
    renderHeader();
  }

  function updateTotalsOnly() {
    var total = totals();
    var kg = document.getElementById('sg74-total-kg');
    var bags = document.getElementById('sg74-total-bags');
    if (kg) kg.textContent = fmt(total.kg)+' kg';
    if (bags) bags.textContent = fmt(total.bags,0)+' thasë';
    renderHeader();
  }

  App.sg71NewWorkOrder = function (campaignId) {
    var campaigns = rows('campaigns').filter(function (item) { return item.status === 'PLANNED' || item.status === 'IN_PROGRESS'; });
    if (!campaigns.length) return App.toast('Krijoni fillimisht një fushatë prodhimi.', 'error');
    draft = { campaignId:campaignId || campaigns[0].id, stepId:'', processId:'', centerId:'', warehouseId:'', outputProductId:'', rows:[{lotId:'',plannedQuantity:0,bagCount:0,sourceLocationId:''}] };
    var body = '<div class="sg74-simple-order">'+
      '<div class="sg74-help"><strong>Si plotësohet:</strong> zgjidh fushatën, pastaj vetëm lotet dhe thasët. Artikulli, procesi, makineria, rafti dhe magazina plotësohen automatikisht.</div>'+
      '<div class="sg71-field"><label>Fushata e prodhimit *</label><select id="sg74-campaign" onchange="App.sg74CampaignChanged(this.value)">'+option(campaigns,draft.campaignId,'Fushatë',function(x){return x.campaignNo+' — '+x.productName+' — '+x.customerName;})+'</select></div>'+
      '<div id="sg74-auto-head"></div>'+
      '<section class="sg74-document-block"><header><div><small>FLETË-DALJE E BRENDSHME</small><h3>Materiali që merret nga magazina për në proces</h3></div><span>Hapi 1</span></header><div id="sg74-input-rows"></div><button type="button" class="sg71-btn sg71-btn-sm" onclick="App.sg74AddRow()">+ Shto lot tjetër</button></section>'+
      '<div class="sg71-field"><label>Shënime, vetëm kur duhen</label><textarea id="sg74-notes" placeholder="Mund të lihet bosh"></textarea></div>'+
    '</div>';
    App.modal('Urdhër Pune i Ri',body,button('Anulo','App.closeModal()')+button('Ruaj Urdhrin','App.sg74SaveWorkOrder()','sg71-btn-primary'));
    App.sg74CampaignChanged(draft.campaignId);
  };

  App.sg74CampaignChanged = function (campaignId) {
    draft.campaignId = campaignId || value('sg74-campaign');
    var current = campaign();
    var step = nextStepForCampaign(current);
    draft.stepId = step ? step.id : '';
    draft.processId = step ? step.processId : '';
    draft.outputProductId = (step && step.outputProductId) || (current && current.productId) || '';
    var center = centerForStep(step);
    draft.centerId = center ? center.id : '';
    draft.warehouseId = '';
    draft.rows = [{lotId:'',plannedQuantity:0,bagCount:0,sourceLocationId:''}];
    renderRows();
  };

  App.sg74CenterChanged = function (id) { draft.centerId = id || ''; };
  App.sg74AddRow = function () { draft.rows.push({lotId:'',plannedQuantity:0,bagCount:0,sourceLocationId:''}); renderRows(); };
  App.sg74RemoveRow = function (index) { draft.rows.splice(index,1); if (!draft.rows.length) draft.rows.push({lotId:'',plannedQuantity:0,bagCount:0,sourceLocationId:''}); renderRows(); };
  App.sg74LotChanged = function (index, lotId) {
    var lot = byId(lots(), lotId);
    var row = draft.rows[index];
    if (!row) return;
    row.lotId = lotId;
    if (lot) {
      if (!draft.warehouseId) draft.warehouseId = lot.warehouseId || '';
      row.plannedQuantity = num(lot.quantityAvailable);
      row.bagCount = num(lot.bagCount || lot.packageCount || lot.numberOfBags || 0);
      var location = locationForLot(lot);
      row.sourceLocationId = location ? location.id : '';
    }
    renderRows();
  };
  App.sg74NumberChanged = function (index, key, raw) {
    if (!draft.rows[index]) return;
    draft.rows[index][key] = raw;
    updateTotalsOnly();
  };

  App.sg74SaveWorkOrder = async function () {
    try {
      var current = campaign();
      var step = currentStep();
      var lines = draft.rows.filter(function (row) { return row.lotId && num(row.plannedQuantity) > 0; }).map(function (row) {
        return { lotId:row.lotId, plannedQuantity:num(row.plannedQuantity), bagCount:num(row.bagCount), sourceLocationId:row.sourceLocationId || null };
      });
      if (!current) throw new Error('Zgjidhni fushatën.');
      if (!step) throw new Error('Fushata nuk ka proces të radhës. Kontrolloni Rrugën e Prodhimit.');
      if (!draft.centerId) throw new Error('Procesi nuk ka makineri. Krijoni ose zgjidhni një makineri.');
      if (!lines.length) throw new Error('Shtoni të paktën një lot nga magazina.');
      var warehouseId = draft.warehouseId || (byId(lots(),lines[0].lotId) || {}).warehouseId;
      if (!warehouseId) throw new Error('Magazina e lotit nuk u gjet.');
      var total = totals();
      await Cloud.request('/api/mrp/work-orders',{method:'POST',body:{
        companyId:(App.company && App.company.id) || ((Cloud.getAccess && Cloud.getAccess().companyIds || [])[0]),
        campaignId:draft.campaignId,routeStepId:draft.stepId,warehouseId:warehouseId,workCenterId:draft.centerId,
        outputProductId:draft.outputProductId,orderDate:new Date().toISOString().slice(0,10),plannedQuantity:total.kg,bagCount:total.bags,
        notes:value('sg74-notes'),inputs:lines
      }});
      App.closeModal();
      await App.sg71Reload('mrpWorkOrders');
      App.toast('Urdhri u krijua. Hapi tjetër: Kontrolli i Cilësisë para procesit.');
    } catch (error) { toastError(error); }
  };

  App.sg71Start = async function (id) {
    try {
      var order = await Cloud.request('/api/mrp/work-orders/'+encodeURIComponent(id));
      var body = '<div class="sg74-simple-order"><div class="sg74-help"><strong>Kontrollo vetëm peshën reale.</strong> Vlerat janë marrë nga Urdhri. Ndryshoji vetëm kur peshorja tregon ndryshe.</div>'+
        '<section class="sg74-document-block"><header><div><small>FLETË-DALJE E BRENDSHME</small><h3>Nga magazina → '+esc(order.processName)+' / '+esc(order.workCenterName || 'Makineria')+'</h3></div><span>Hapi 2</span></header>'+
        '<div class="sg71-table-wrap"><table class="sg71-table"><thead><tr><th>Loti / Furnitori</th><th>Kg sipas etiketës</th><th>Pesha reale në makineri</th><th>Thasë realë</th></tr></thead><tbody>'+
        (order.inputs || []).map(function (line) { return '<tr><td><strong>'+esc(line.lotNumber)+'</strong><br><small>'+esc(line.supplierName || '—')+'</small></td><td>'+fmt(line.plannedQuantity || line.quantity)+' kg</td><td><input id="sg71-start-'+attr(line.id)+'" type="number" inputmode="decimal" step="0.001" value="'+attr(line.plannedQuantity || line.quantity)+'"></td><td><input id="sg71-start-bags-'+attr(line.id)+'" type="number" inputmode="numeric" step="1" value="'+attr(line.bagCount || 0)+'"></td></tr>'; }).join('')+
        '</tbody></table></div></section></div>';
      App.modal('Fillo Procesin — '+order.workOrderNo,body,button('Anulo','App.closeModal()')+button('Konfirmo Fletë-Daljen dhe Fillo','App.sg71ConfirmStart(\''+id+'\')','sg71-btn-success'));
      App._sg71CurrentOrder = order;
    } catch (error) { toastError(error); }
  };

  function balanceHtml(input, output, waste, loss) {
    var difference = num(input)-num(output)-num(waste)-num(loss);
    return '<div class="sg74-balance"><div><span>Pesha e futur në proces</span><strong>'+fmt(input)+' kg</strong></div><div><span>Produkti i mirë në magazinë</span><strong>'+fmt(output)+' kg</strong></div><div><span>Mbetje e regjistrueshme</span><strong>'+fmt(waste)+' kg</strong></div><div><span>Humbje teknologjike</span><strong>'+fmt(loss)+' kg</strong></div><div class="'+(Math.abs(difference)<0.000001?'ok':'bad')+'"><span>Diferenca duhet 0</span><strong>'+fmt(difference)+' kg</strong></div></div>';
  }

  App.sg74CalcBalance = function (input) {
    var element = document.getElementById('sg74-balance');
    if (element) element.innerHTML = balanceHtml(input,value('sg71-end-output'),value('sg71-end-waste'),value('sg71-end-loss'));
  };

  App.sg71Complete = async function (id) {
    try {
      var order = await Cloud.request('/api/mrp/work-orders/'+encodeURIComponent(id));
      var input = num(order.actualInputQuantity);
      var process = byId(rows('processes'),order.mrpProcessId || order.mrp_process_id) || {};
      var expectedLoss = Math.max(0,input*num(process.expectedLossPercent)/100);
      var expectedOutput = Math.max(0,input-expectedLoss);
      var body = '<div class="sg74-simple-order"><div class="sg74-help"><strong>Plotëso vetëm rezultatin e peshimit.</strong> Sistemi krijon vetë lotin e ri, Fletë-Hyrjen dhe Urdhrin Draft për procesin pasues.</div>'+
        '<section class="sg74-document-block"><header><div><small>FLETË-HYRJE NGA PROCESI</small><h3>'+esc(order.processName)+' / '+esc(order.workCenterName || 'Makineria')+' → Magazinë</h3></div><span>Hapi 3</span></header>'+
        '<div class="sg74-output-grid"><label><span>Produkti i mirë që hyn në magazinë *</span><input id="sg71-end-output" type="number" inputmode="decimal" step="0.001" value="'+attr(expectedOutput)+'" oninput="App.sg74CalcBalance('+input+')"></label>'+
        '<label><span>Mbetje e regjistrueshme</span><input id="sg71-end-waste" type="number" inputmode="decimal" step="0.001" value="0" oninput="App.sg74CalcBalance('+input+')"></label>'+
        '<label><span>Humbje teknologjike</span><input id="sg71-end-loss" type="number" inputmode="decimal" step="0.001" value="'+attr(expectedLoss)+'" oninput="App.sg74CalcBalance('+input+')"></label>'+
        '<label><span>Cilësia e produktit</span><select id="sg71-end-quality"><option value="APPROVED">Aprovuar</option><option value="QUARANTINE">Karantinë</option><option value="REJECTED">Refuzuar</option><option value="PARTIAL_APPROVAL">Aprovim i pjesshëm</option></select></label></div>'+
        '<input id="sg71-end-cost" type="hidden" value="0"><div id="sg74-balance">'+balanceHtml(input,expectedOutput,0,expectedLoss)+'</div></section>'+
        '<div class="sg71-field"><label>Shënime, vetëm kur duhen</label><textarea id="sg71-end-notes" placeholder="Mund të lihet bosh"></textarea></div></div>';
      App.modal('Përfundo Procesin — '+order.workOrderNo,body,button('Anulo','App.closeModal()')+button('Krijo Fletë-Hyrjen dhe Përfundo','App.sg71ConfirmComplete(\''+id+'\')','sg71-btn-primary'));
    } catch (error) { toastError(error); }
  };

  function replaceText(root, from, to) {
    Array.prototype.slice.call(root.querySelectorAll('span,th,small,h3')).forEach(function (node) {
      if ((node.textContent || '').trim() === from) node.textContent = to;
    });
  }

  var baseOpenWorkOrder = App.sg71OpenWorkOrder;
  App.sg71OpenWorkOrder = async function () {
    var result = await baseOpenWorkOrder.apply(this,arguments);
    setTimeout(function () {
      var root = document.getElementById('modal-box') || document.querySelector('.modal-content');
      if (!root) return;
      replaceText(root,'Hyrja','Pesha e futur në proces');
      replaceText(root,'Dalja','Produkti i mirë në magazinë');
      replaceText(root,'Mbetje','Mbetje e regjistrueshme');
      replaceText(root,'Humbje','Humbje teknologjike');
    },0);
    return result;
  };

  var baseWorkOrders = App.view_mrpWorkOrders;
  App.view_mrpWorkOrders = async function () {
    var result = await baseWorkOrders.apply(this,arguments);
    setTimeout(function () {
      var root = document.getElementById('content');
      if (!root) return;
      replaceText(root,'Dalje kg','Produkt i mirë kg');
      replaceText(root,'Peshim Dalje','Fletë-Hyrje nga Procesi');
    },0);
    return result;
  };

  var style = document.createElement('style');
  style.id = 'sg74-simple-work-order-style';
  style.textContent = '.sg74-simple-order{display:grid;gap:14px}.sg74-help{border-left:4px solid #714b67;background:#f7f2f6;padding:12px 14px;border-radius:6px;color:#4b3046}.sg74-document-block{border:1px solid #d9dce1;border-radius:10px;background:#fff;overflow:hidden}.sg74-document-block>header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 16px;background:#f5f6f8;border-bottom:1px solid #d9dce1}.sg74-document-block>header small{display:block;color:#714b67;font-weight:800;letter-spacing:.07em}.sg74-document-block>header h3{margin:3px 0 0;font-size:16px}.sg74-document-block>header>span{background:#714b67;color:#fff;padding:5px 9px;border-radius:14px;font-size:11px;font-weight:800}.sg74-document-block>.sg71-table-wrap,.sg74-document-block>#sg74-input-rows{padding:12px}.sg74-auto-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.sg74-auto-grid>div{border:1px solid #e1e4e8;border-radius:8px;padding:10px;background:#fff}.sg74-auto-grid span{display:block;color:#777;font-size:11px;margin-bottom:4px}.sg74-auto-grid strong{display:block}.sg74-auto-grid select{width:100%}.sg74-totals{display:flex;justify-content:flex-end;gap:24px;padding:10px 4px 0}.sg74-right{text-align:right}.sg74-output-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:14px}.sg74-output-grid label span{display:block;font-size:12px;font-weight:700;margin-bottom:5px}.sg74-output-grid input,.sg74-output-grid select{width:100%;min-height:42px}.sg74-balance{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;padding:0 14px 14px}.sg74-balance>div{border:1px solid #ddd;border-radius:8px;padding:9px}.sg74-balance span{display:block;color:#777;font-size:10px}.sg74-balance strong{display:block;margin-top:4px}.sg74-balance .ok{border-color:#65a765;background:#f2fbf2}.sg74-balance .bad{border-color:#d56b6b;background:#fff3f3}@media(max-width:760px){.sg74-auto-grid,.sg74-output-grid{grid-template-columns:1fr}.sg74-balance{grid-template-columns:1fr 1fr}.sg74-movement-table{min-width:850px}.sg74-totals{justify-content:flex-start;flex-wrap:wrap}}';
  document.head.appendChild(style);
})(window);
/* SG_PHASE74_SIMPLE_WORK_ORDER_UI_END */
