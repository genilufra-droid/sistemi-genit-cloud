/* Sistemi Genit — Faza 4: Lot automatik dhe Gjurmueshmëri 360° */
(function (global) {
  'use strict';

  var App = global.App;
  var Cloud = global.CloudERP;
  var Auth = global.Auth;
  var C = global.Calc;
  if (!App || !Cloud || !Cloud.apiUrl || Cloud.offlineTestMode) return;
  if (global.__SG_PHASE4_TRACEABILITY_UI__) return;
  global.__SG_PHASE4_TRACEABILITY_UI__ = true;

  function esc(value) { return App.esc(value == null ? '' : String(value)); }
  function attr(value) { return esc(value).replace(/"/g, '&quot;'); }
  function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function camel(row) {
    var result = {};
    Object.keys(row || {}).forEach(function (key) {
      result[key.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); })] = row[key];
    });
    return result;
  }
  function byId(list, id) { return (list || []).find(function (row) { return row.id === id; }); }
  function isoDate(value) {
    if (!value) return '';
    var text = value instanceof Date ? value.toISOString() : String(value);
    return text.slice(0, 10);
  }
  function selectedValue(id) { var element = document.getElementById(id); return element ? element.value : ''; }
  function selectedCompanyId() {
    var company = App.company || {};
    return company.id || (Cloud.getAccess().companyIds || [])[0] || '';
  }
  function normalizeStatus(status) {
    var labels = {
      DRAFT: 'Draft', CONFIRMED: 'Postuar', QUARANTINE: 'Karantinë', AVAILABLE: 'I disponueshëm',
      BLOCKED: 'Bllokuar', DEPLETED: 'I konsumuar', CANCELLED: 'Anulluar', RECALLED: 'Tërhequr',
      APPROVED: 'Aprovuar', REJECTED: 'Refuzuar', PARTIAL_APPROVAL: 'Aprovim i pjesshëm'
    };
    return labels[status] || status || '—';
  }
  function mapFarm(row) {
    var x = camel(row);
    return {
      id:x.id, companyId:x.companyId, supplierId:x.supplierId || '', supplierName:x.supplierName || '', code:x.code || '', name:x.name || '',
      sourceTypeDefault:x.sourceTypeDefault || 'CULTIVATED', country:x.country || 'Shqipëri', region:x.region || '', municipality:x.municipality || '',
      village:x.village || '', locationName:x.locationName || '', latitude:x.latitude, longitude:x.longitude, altitudeM:x.altitudeM,
      notes:x.notes || '', active:x.active !== false, createdAt:x.createdAt, updatedAt:x.updatedAt
    };
  }
  function mapParcel(row) {
    var x = camel(row);
    return {
      id:x.id, companyId:x.companyId, farmId:x.farmId, farmName:x.farmName || '', farmCode:x.farmCode || '', code:x.code || '', name:x.name || '',
      sourceType:x.sourceType || 'CULTIVATED', country:x.country || 'Shqipëri', region:x.region || '', municipality:x.municipality || '', village:x.village || '',
      locationName:x.locationName || '', latitude:x.latitude, longitude:x.longitude, altitudeM:x.altitudeM, areaHa:num(x.areaHectares), areaHectares:num(x.areaHectares),
      notes:x.notes || '', active:x.active !== false, createdAt:x.createdAt, updatedAt:x.updatedAt
    };
  }
  function mapLot(row) {
    var x = camel(row);
    return {
      id:x.id, companyId:x.companyId, warehouseId:x.warehouseId, warehouseName:x.warehouseName || '', productId:x.productId,
      productCode:x.productCode || '', productName:x.productName || '', supplierId:x.supplierId || '', supplierName:x.supplierName || '',
      farmId:x.farmId || '', farmCode:x.farmCode || '', farmName:x.farmName || '', parcelId:x.parcelId || '', parcelCode:x.parcelCode || '', parcelName:x.parcelName || '',
      sourceWeightTicketId:x.sourceWeightTicketId || '', sourceDocumentId:x.sourceDocumentId || '', weightDocumentNo:x.weightDocumentNo || '', receiptDocumentNo:x.receiptDocumentNo || '',
      lotNumber:x.lotNumber || '', lotType:x.lotType || 'RAW', status:x.status || 'QUARANTINE', qualityStatus:x.qualityStatus || 'QUARANTINE',
      harvestDate:x.harvestDate, productionDate:x.productionDate, expiryDate:x.expiryDate,
      quantityCreated:num(x.quantityCreated), quantityAvailable:num(x.quantityAvailable), quantityConsumed:num(x.quantityConsumed), baseUnit:x.baseUnit || 'kg',
      unitCost:num(x.unitCost), botanicalName:x.botanicalName || '', plantPart:x.plantPart || '', locationText:x.locationText || '', notes:x.notes || '',
      createdAt:x.createdAt, updatedAt:x.updatedAt
    };
  }
  function mapWeight(row) {
    var x = camel(row);
    var gross = num(x.grossWeight), packaging = num(x.packagingWeight), net = num(x.netWeight), accepted = num(x.acceptedWeight), bags = num(x.bagsCount);
    var product = byId(App.data.products, x.productId) || {};
    var supplier = byId(App.data.suppliers, x.supplierId) || {};
    return {
      id:x.id, companyId:x.companyId, warehouseId:x.warehouseId, supplierId:x.supplierId, supplierName:x.supplierName || supplier.name || '',
      productId:x.productId, productName:x.productName || product.name || '', docNumber:x.documentNo || '', date:x.documentDate,
      totalBagCount:bags, bagsCount:bags, grossWeightTotal:gross, packagingWeightTotal:packaging, netWeightBeforePercent:net,
      percentDeduction:num(x.discountPercent), percentDeductionKg:Math.max(0, net-accepted), netWeightAfterPercent:accepted,
      unitPriceExclVat:num(x.unitPrice), baseAmount:num(x.totalValue), vatAmount:0, purchaseTotal:num(x.totalValue), totalAmount:num(x.totalValue),
      vehiclePlate:x.vehiclePlate || '', notes:x.notes || '', status:x.status || 'DRAFT', farmId:x.farmId || '', traceFarmId:x.farmId || '',
      parcelId:x.parcelId || '', traceParcelId:x.parcelId || '', harvestDate:x.harvestDate || '', qualityStatus:x.qualityStatus || 'QUARANTINE',
      lotId:x.lotId || '', receiptDocumentId:x.receiptDocumentId || '', createdAt:x.createdAt, updatedAt:x.updatedAt, cloudVersion:x.version || 1,
      lines:[{ bagCount:bags, grossKg:gross, packagingKg:packaging, note:x.notes || '' }]
    };
  }

  async function loadPhase4Data() {
    var results = await Promise.all([
      Cloud.request('/api/trace/farms'), Cloud.request('/api/trace/parcels'), Cloud.request('/api/trace/lots'), Cloud.request('/api/weights')
    ]);
    var companyId = selectedCompanyId();
    App.data.traceFarms = results[0].map(mapFarm).filter(function (x) { return !companyId || x.companyId === companyId; });
    App.data.traceParcels = results[1].map(mapParcel).filter(function (x) { return !companyId || x.companyId === companyId; });
    App.data.lots = results[2].map(mapLot).filter(function (x) { return !companyId || x.companyId === companyId; });
    App.data.weightForms = results[3].map(mapWeight).filter(function (x) { return !companyId || x.companyId === companyId; });
    App.data.weightFormLines = [];
    App.data.weightForms.forEach(function (wf) {
      (wf.lines || []).forEach(function (line, index) { App.data.weightFormLines.push(Object.assign({ id:wf.id + '-line-' + index, weightFormId:wf.id }, line)); });
    });
    return { farms:App.data.traceFarms, parcels:App.data.traceParcels, lots:App.data.lots, weights:App.data.weightForms };
  }

  var baseCloudRefresh = Cloud.refresh.bind(Cloud);
  Cloud.refresh = async function () {
    await baseCloudRefresh();
    await loadPhase4Data();
    if (App.currentView) App.navigate(App.currentView);
  };
  Cloud.loadPhase4 = loadPhase4Data;

  function optionRows(rows, selectedId, emptyLabel) {
    return '<option value="">— '+esc(emptyLabel || 'Zgjidh')+' —</option>' + (rows || []).map(function (x) {
      return '<option value="'+attr(x.id)+'"'+(x.id === selectedId ? ' selected' : '')+'>'+esc((x.code ? x.code+' — ' : '')+(x.name || x.lotNumber || x.id))+'</option>';
    }).join('');
  }

  function renderParcelOptions(selectedId) {
    var farmId = selectedValue('wf-p4-farm');
    var rows = (App.data.traceParcels || []).filter(function (x) { return x.active !== false && (!farmId || x.farmId === farmId); });
    var select = document.getElementById('wf-p4-parcel');
    if (select) select.innerHTML = optionRows(rows, selectedId || '', 'Parcelë / Zonë mbledhjeje');
  }
  App.phase4FarmChanged = function () { renderParcelOptions(''); };

  var baseViewWeightForm = App._viewWeightForm;
  App._viewWeightForm = function (existingId) {
    baseViewWeightForm.call(this, existingId);
    var wf = existingId ? byId(this.data.weightForms, existingId) : null;
    var lotInput = document.getElementById('wf-lot');
    if (lotInput) {
      lotInput.value = wf && wf.lotId ? (byId(this.data.lots, wf.lotId) || {}).lotNumber || 'I krijuar automatikisht' : 'AUTOMATIK NË POSTIM';
      lotInput.readOnly = true;
      lotInput.title = 'Numri i lotit krijohet vetëm nga postimi i Peshimit/Pranimit.';
      var label = lotInput.parentElement && lotInput.parentElement.querySelector('label'); if (label) label.textContent = 'Loti automatik';
    }
    var alert = document.querySelector('#content .alert-info');
    if (alert) alert.innerHTML = '📌 Ruajeni formularin si <strong>Draft online</strong>. Kur shtypni <strong>Posto Pranimin & Krijo Lotin</strong>, serveri krijon në një transaksion Fletë-Hyrjen, lotin RAW, hyrjen e stokut dhe Audit Log.';
    var rows = document.querySelectorAll('#content .wf-header-grid');
    var anchor = rows.length > 1 ? rows[1] : (document.getElementById('wf-lines-table') || {}).parentElement;
    if (anchor && !document.getElementById('sg-p4-origin-panel')) {
      var panel = document.createElement('div');
      panel.id = 'sg-p4-origin-panel'; panel.className = 'sg-p4-origin-panel';
      panel.innerHTML = '<h4>🌱 Origjina dhe gjurmueshmëria</h4><p class="hint">Fermeri merret nga fusha Furnitori. Ferma/Zona dhe Parcela përcaktojnë origjinën fizike. Loti nuk shkruhet nga përdoruesi.</p>'+
        '<div class="sg-p4-origin-grid">'+
        '<div class="form-group"><label>Ferma / Zona *</label><select id="wf-p4-farm" onchange="App.phase4FarmChanged()">'+optionRows((this.data.traceFarms||[]).filter(function(x){return x.active!==false;}),wf && wf.farmId || '','Ferma / Zona')+'</select></div>'+
        '<div class="form-group"><label>Parcela / Zona mbledhjeje *</label><select id="wf-p4-parcel"></select></div>'+
        '<div class="form-group"><label>Data e korrjes/mbledhjes *</label><input id="wf-p4-harvest" type="date" value="'+attr(isoDate(wf && wf.harvestDate) || isoDate(wf && wf.date) || new Date().toISOString().slice(0,10))+'"></div>'+
        '<div class="form-group"><label>Statusi fillestar i cilësisë</label><select id="wf-p4-quality"><option value="QUARANTINE">Karantinë</option><option value="APPROVED">Aprovuar</option><option value="REJECTED">Refuzuar</option></select></div>'+
        '<div class="form-group"><label>Targa e mjetit</label><input id="wf-p4-plate" value="'+attr(wf && wf.vehiclePlate || '')+'" placeholder="AA 000 AA"></div>'+
        '<div class="form-group"><label>Dokumenti burim</label><div class="sg-p4-auto-lot">Peshim → Fletë-Hyrje → Lot RAW → Stok</div></div>'+
        '</div>';
      anchor.insertAdjacentElement('afterend', panel);
      renderParcelOptions(wf && wf.parcelId || '');
      var quality = document.getElementById('wf-p4-quality'); if (quality) quality.value = wf && wf.qualityStatus || 'QUARANTINE';
    }
    var actions = document.querySelector('#content .card-title-actions');
    if (actions && existingId && wf) {
      if (wf.status === 'DRAFT') {
        var postButton = document.createElement('button');
        postButton.className = 'btn btn-green btn-sm sg-p4-action-primary';
        postButton.innerHTML = '✓ Posto Pranimin &amp; Krijo Lotin';
        postButton.onclick = function () { App.postWeightReceipt(existingId); };
        actions.insertBefore(postButton, actions.children[1] || null);
      } else if (wf.lotId) {
        var traceButton = document.createElement('button');
        traceButton.className = 'btn btn-green btn-sm'; traceButton.innerHTML = '👁 Gjurmueshmëri 360°';
        traceButton.onclick = function () { App.openLot360(wf.lotId); };
        actions.insertBefore(traceButton, actions.children[1] || null);
      }
    }
  };

  function readWeightPayload() {
    var supplierId = global.SAC.getSelectedId(document.getElementById('wf-supplier'));
    var productId = global.SAC.getSelectedId(document.getElementById('wf-product'));
    var warehouseId = global.SAC.getSelectedId(document.getElementById('wf-warehouse'));
    var gross = 0, packaging = 0, bags = 0;
    (App._wfLines || []).forEach(function (line) {
      gross += num(line.grossKg); packaging += num(line.packagingKg); bags += num(line.bagCount != null ? line.bagCount : line.sacks);
    });
    var payload = {
      companyId:selectedCompanyId(), warehouseId:warehouseId, supplierId:supplierId, productId:productId,
      documentDate:selectedValue('wf-date'), bagsCount:bags, grossWeight:gross, packagingWeight:packaging,
      discountPercent:num(selectedValue('wf-percent')), unitPrice:num(selectedValue('wf-price')), vehiclePlate:selectedValue('wf-p4-plate'),
      farmId:selectedValue('wf-p4-farm') || null, parcelId:selectedValue('wf-p4-parcel') || null,
      harvestDate:selectedValue('wf-p4-harvest') || null, qualityStatus:selectedValue('wf-p4-quality') || 'QUARANTINE', notes:selectedValue('wf-notes')
    };
    if (!payload.companyId || !payload.warehouseId || !payload.supplierId || !payload.productId) throw new Error('Kompania, magazina, fermeri/furnitori dhe artikulli janë të detyrueshëm.');
    if (!payload.documentDate) throw new Error('Data e dokumentit është e detyrueshme.');
    if (payload.grossWeight <= 0) throw new Error('Pesha bruto duhet të jetë më e madhe se zero.');
    return payload;
  }

  App.saveWeightForm = async function (existingId, options) {
    options = options || {};
    try {
      Auth.requirePermission(existingId ? 'documents.edit' : 'documents.create');
      var payload = readWeightPayload();
      var row = await Cloud.request(existingId ? '/api/trace/weights/'+encodeURIComponent(existingId) : '/api/trace/weights', { method:existingId ? 'PATCH' : 'POST', body:payload });
      await loadPhase4Data();
      this.toast(existingId ? 'Drafti u përditësua në PostgreSQL.' : 'Formulari u ruajt online: '+(row.document_no || row.documentNo));
      if (!options.stay) {
        if (existingId) this._viewWeightForm(existingId); else this._viewWeightForm(row.id);
      }
      return mapWeight(row);
    } catch (error) { this.toast(error.message || String(error),'error'); throw error; }
  };

  App.postWeightReceipt = async function (weightId) {
    try {
      Auth.requirePermission('documents.post');
      var payload = readWeightPayload();
      await this.saveWeightForm(weightId,{stay:true});
      if (!payload.farmId || !payload.parcelId || !payload.harvestDate) throw new Error('Ferma/Zona, Parcela dhe Data e mbledhjes janë të detyrueshme për postim.');
      if (!global.confirm('Posto pranimin? Do të krijohen Fletë-Hyrja, loti automatik dhe stoku. Dokumenti nuk do të editohet më.')) return;
      var result = await Cloud.request('/api/weights/'+encodeURIComponent(weightId)+'/post-receipt',{method:'POST',body:{
        farmId:payload.farmId, parcelId:payload.parcelId, harvestDate:payload.harvestDate, qualityStatus:payload.qualityStatus,
        botanicalName:'', plantPart:'', notes:payload.notes
      }});
      await Cloud.refresh();
      this.toast('Pranimi u postua: '+result.receipt.documentNo+' · Loti '+result.lot.lotNumber);
      this.navigate('traceLots');
      await this.openLot360(result.lot.id);
    } catch (error) { this.toast(error.message || String(error),'error'); }
  };

  App.deleteWeightFormDraft = async function (id) {
    try {
      Auth.requirePermission('documents.cancel');
      var wf = byId(this.data.weightForms,id); if (!wf) return;
      if (wf.status !== 'DRAFT') throw new Error('Vetëm Drafti mund të fshihet.');
      if (!global.confirm('Fshi draftin '+wf.docNumber+'?')) return;
      await Cloud.request('/api/trace/weights/'+encodeURIComponent(id),{method:'DELETE'});
      this.closeModal(); await Cloud.refresh(); this.navigate('weightList'); this.toast('Drafti u fshi nga PostgreSQL.');
    } catch (error) { this.toast(error.message || String(error),'error'); }
  };

  App._wfTable = function (forms) {
    if (!forms.length) return '<p class="empty-report">Nuk ka formularë peshimi.</p>';
    return '<div class="report-table-wrap"><table><thead><tr><th></th><th>Nr. Peshimit</th><th>Fermeri/Furnitori</th><th>Artikulli</th><th>Origjina</th><th>Data</th><th>Thasë</th><th>Bruto</th><th>Neto pranuar</th><th>Loti</th><th>Status</th><th>Veprime</th></tr></thead><tbody>'+
      forms.map(function (wf) {
        var farm=byId(App.data.traceFarms,wf.farmId)||{}, parcel=byId(App.data.traceParcels,wf.parcelId)||{}, lot=byId(App.data.lots,wf.lotId)||{};
        var actions=[{icon:'👁',label:'Shiko',action:"App._viewWeightForm('"+wf.id+"')"}];
        if(wf.status==='DRAFT'){
          actions.push({icon:'✏️',label:'Edito Draft',action:"App._viewWeightForm('"+wf.id+"')"});
          actions.push({icon:'✓',label:'Posto Pranimin',action:"App._viewWeightForm('"+wf.id+"')"});
          actions.push({icon:'🗑',label:'Fshi Draft',danger:true,action:"App.deleteWeightFormDraft('"+wf.id+"')"});
        } else if(wf.lotId) actions.push({icon:'🔎',label:'Gjurmueshmëri 360°',action:"App.openLot360('"+wf.lotId+"')"});
        actions.push({icon:'🖨',label:'Print',action:"App.printWeightForm('"+wf.id+"')"},{icon:'📄',label:'PDF',action:"App.exportWeightFormPDF('"+wf.id+"')"},{icon:'📊',label:'Excel',action:"App.exportWeightFormExcel('"+wf.id+"')"});
        return '<tr><td><button class="sg-eye-btn" onclick="App._viewWeightForm(\''+wf.id+'\')">👁</button></td><td><strong>'+esc(wf.docNumber)+'</strong></td><td>'+esc(wf.supplierName||'—')+'</td><td>'+esc(wf.productName||'—')+'</td><td>'+esc((farm.code||'')+(parcel.code?' / '+parcel.code:''))+'</td><td>'+App.fmtDate(wf.date)+'</td><td class="text-right">'+App.fmt(wf.totalBagCount)+'</td><td class="text-right">'+App.fmtKg(wf.grossWeightTotal)+'</td><td class="text-right"><strong>'+App.fmtKg(wf.netWeightAfterPercent)+'</strong></td><td>'+esc(lot.lotNumber||'—')+'</td><td><span class="status-badge status-'+esc(wf.status)+'">'+esc(normalizeStatus(wf.status))+'</span></td><td onclick="event.stopPropagation()">'+App.rowActionMenu(actions)+'</td></tr>';
      }).join('')+'</tbody></table></div>';
  };

  App.view_weightForm = async function () { try { await loadPhase4Data(); this._viewWeightForm(); } catch(e){this.toast(e.message,'error');} };
  App.view_weightList = async function () { try { await loadPhase4Data(); this._viewWeightList(); } catch(e){this.toast(e.message,'error');} };
  App.openWeightForm = async function (id) { try { await loadPhase4Data(); this._viewWeightForm(id); } catch(e){this.toast(e.message,'error');} };

  App.view_traceLots = async function () {
    try { await loadPhase4Data(); } catch(error) { this.toast(error.message||String(error),'error'); return; }
    var rows=(this.data.lots||[]).slice().sort(function(a,b){return new Date(b.createdAt||0)-new Date(a.createdAt||0);});
    var htmlRows=rows.map(function(x){
      var actions=[{icon:'👁',label:'Shiko 360°',action:"App.openLot360('"+x.id+"')"},{icon:'🖨',label:'Print',action:"App.printLot360('"+x.id+"')"},{icon:'📄',label:'PDF',action:"App.exportLot360PDF('"+x.id+"')"},{icon:'📊',label:'Excel',action:"App.exportLot360Excel('"+x.id+"')"}];
      return '<tr><td><button class="sg-eye-btn" onclick="App.openLot360(\''+x.id+'\')">👁</button></td><td><strong>'+esc(x.lotNumber)+'</strong></td><td>'+esc(x.lotType)+'</td><td>'+esc(x.productName)+'</td><td>'+esc(x.supplierName||'—')+'</td><td>'+esc((x.farmCode||'—')+' / '+(x.parcelCode||'—'))+'</td><td>'+App.fmtDate(x.harvestDate)+'</td><td class="text-right">'+App.fmtKg(x.quantityCreated)+'</td><td class="text-right">'+App.fmtKg(x.quantityConsumed)+'</td><td class="text-right"><strong>'+App.fmtKg(x.quantityAvailable)+'</strong></td><td><span class="status-badge status-'+esc(x.status)+'">'+esc(normalizeStatus(x.status))+'</span></td><td>'+App.rowActionMenu(actions)+'</td></tr>';
    }).join('');
    document.getElementById('content').innerHTML='<div class="sg-p4-no-manual"><strong>Loti nuk krijohet manualisht.</strong> Krijohet automatikisht nga postimi i Peshimit/Pranimit, Urdhrit të Punës, Paketimit ose Kthimit.</div><div class="sg-p4-flow"><span>Fermeri</span><b>→</b><span>Ferma/Parcela</span><b>→</b><span>Peshimi</span><b>→</b><span>Fletë-Hyrja</span><b>→</b><span>Loti</span><b>→</b><span>Procesi/Paketimi</span><b>→</b><span>Ngarkesa</span><b>→</b><span>Klienti/Pagesa</span></div><div class="card"><div class="card-title"><span>🏷️ Regjistri automatik i loteve</span><span>'+rows.length+' lote</span></div><div class="report-table-wrap"><table><thead><tr><th></th><th>Loti</th><th>Tipi</th><th>Artikulli</th><th>Fermeri</th><th>Origjina</th><th>Mbledhja</th><th>Krijuar kg</th><th>Konsumuar kg</th><th>Gjendje kg</th><th>Status</th><th>Veprime</th></tr></thead><tbody>'+htmlRows+'</tbody></table></div>'+(htmlRows?'':'<p class="empty-report">Nuk ka lote. Postoni një Formular Peshimi/Pranimi.</p>')+'</div>';
  };

  async function getLot360(id) { return Cloud.request('/api/trace/lots/'+encodeURIComponent(id)+'/360'); }
  function traceRows(data) {
    var lot=camel(data.lot||{}), rows=[];
    rows.push(['Origjina','Fermeri/Furnitori',lot.supplierName||'—']);
    rows.push(['Origjina','Ferma/Zona',(lot.farmCode||'')+' — '+(lot.farmName||'—')]);
    rows.push(['Origjina','Parcela/Zona',(lot.parcelCode||'')+' — '+(lot.parcelName||'—')]);
    rows.push(['Pranimi','Peshimi',lot.weightDocumentNo||'—']);
    rows.push(['Pranimi','Fletë-Hyrja',lot.receiptDocumentNo||'—']);
    rows.push(['Loti','Numri',lot.lotNumber||'—']);
    rows.push(['Loti','Sasia e krijuar',num(lot.quantityCreated)]);
    rows.push(['Loti','Sasia e konsumuar',num(lot.quantityConsumed)]);
    rows.push(['Loti','Gjendja',num(lot.quantityAvailable)]);
    (data.qualityChecks||[]).forEach(function(row){var x=camel(row);rows.push(['Cilësia',x.checkNo||'Kontroll',normalizeStatus(x.result)]);});
    (data.processes||[]).forEach(function(row){var x=camel(row);rows.push(['Procesi',x.workOrderNo||x.processType,num(x.quantity)]);});
    (data.shipments||[]).forEach(function(row){var x=camel(row);rows.push(['Ngarkesa',x.shipmentNo||'Ngarkesë',(x.customerName||'')+' · '+num(x.quantity)+' kg']);});
    return rows;
  }
  function lot360Body(data) {
    var lot=camel(data.lot||{}), q=data.qualityChecks||[], p=data.processes||[], s=data.shipments||[], m=data.movements||[];
    var location=[lot.locationName,lot.village,lot.municipality,lot.region].filter(Boolean).join(', ');
    var movementHtml=m.map(function(row){var x=camel(row);return '<tr><td>'+App.fmtDate(x.movementAt)+'</td><td>'+esc(x.movementType)+'</td><td>'+esc(x.sourceDocumentNo||'—')+'</td><td class="text-right">'+App.fmtKg(x.quantity)+'</td><td class="text-right">'+App.fmtKg(x.balanceAfter)+'</td></tr>';}).join('');
    var timeline='<div class="sg-p4-timeline"><div class="sg-p4-step"><h5>🌱 Origjina</h5><p><strong>'+esc(lot.supplierName||'—')+'</strong> · '+esc((lot.farmCode||'')+' '+(lot.farmName||''))+' · '+esc((lot.parcelCode||'')+' '+(lot.parcelName||''))+'</p><p>'+esc(location||'Pa lokacion')+' · Mbledhja: '+App.fmtDate(lot.harvestDate)+'</p></div><div class="sg-p4-step"><h5>⚖ Pranimi</h5><p>Peshimi: <strong>'+esc(lot.weightDocumentNo||'—')+'</strong> · Fletë-Hyrja: <strong>'+esc(lot.receiptDocumentNo||'—')+'</strong></p><p>Bruto '+App.fmtKg(lot.grossWeight)+' kg · Ambalazh '+App.fmtKg(lot.packagingWeight)+' kg · Pranuar '+App.fmtKg(lot.acceptedWeight)+' kg</p></div><div class="sg-p4-step"><h5>🏷️ Loti automatik</h5><p><strong>'+esc(lot.lotNumber)+'</strong> · '+esc(lot.productName||'')+' · '+esc(normalizeStatus(lot.status))+'</p></div>';
    p.forEach(function(row){var x=camel(row);timeline+='<div class="sg-p4-step"><h5>⚙️ Procesi '+esc(x.workOrderNo||'')+'</h5><p>'+esc(x.processType||'')+' · konsum '+App.fmtKg(x.quantity)+' kg</p></div>';});
    s.forEach(function(row){var x=camel(row);timeline+='<div class="sg-p4-step"><h5>🚚 Ngarkesa '+esc(x.shipmentNo||'')+'</h5><p>'+esc(x.customerName||'')+' · '+App.fmtKg(x.quantity)+' kg · '+esc(x.plateNo||'')+'</p></div>';});
    timeline+='</div>';
    return '<div class="sg-p4-kpis"><div class="sg-p4-kpi"><small>Krijuar</small><strong>'+App.fmtKg(lot.quantityCreated)+' kg</strong></div><div class="sg-p4-kpi"><small>Konsumuar</small><strong>'+App.fmtKg(lot.quantityConsumed)+' kg</strong></div><div class="sg-p4-kpi"><small>Gjendje</small><strong>'+App.fmtKg(lot.quantityAvailable)+' kg</strong></div><div class="sg-p4-kpi"><small>Cilësia</small><strong>'+esc(normalizeStatus(lot.qualityStatus))+'</strong></div></div>'+timeline+'<div class="card"><div class="card-title">Lëvizjet e lotit</div><div class="report-table-wrap"><table><thead><tr><th>Data</th><th>Veprimi</th><th>Dokumenti</th><th>Sasia</th><th>Bilanci</th></tr></thead><tbody>'+movementHtml+'</tbody></table></div></div><p><strong>Kontrolle cilësie:</strong> '+q.length+' · <strong>Procese:</strong> '+p.length+' · <strong>Ngarkesa:</strong> '+s.length+'</p>';
  }

  App.openLot360 = async function (id) {
    try {
      var data=await getLot360(id), lot=camel(data.lot||{});
      this.modal('Gjurmueshmëri 360° — '+(lot.lotNumber||''),lot360Body(data),'<button class="btn btn-outline btn-sm" onclick="App.printLot360(\''+id+'\')">🖨 Print</button><button class="btn btn-outline btn-sm" onclick="App.exportLot360PDF(\''+id+'\')">📄 PDF</button><button class="btn btn-outline btn-sm" onclick="App.exportLot360Excel(\''+id+'\')">📊 Excel</button><button class="btn btn-outline" onclick="App.closeModal()">Mbyll</button>');
    } catch(error){this.toast(error.message||String(error),'error');}
  };
  App.printLot360 = async function (id) {
    try { var data=await getLot360(id),lot=camel(data.lot||{});this.openPrintWindow('<div class="inv-header"><div>'+this.companyHeader()+'</div><div style="text-align:right"><strong>GJURMUESHMËRI 360°</strong><br>'+esc(lot.lotNumber)+'</div></div>'+lot360Body(data),'Gjurmueshmëri '+lot.lotNumber); } catch(e){this.toast(e.message,'error');}
  };
  App.exportLot360PDF = async function (id) {
    try { var data=await getLot360(id),lot=camel(data.lot||{}),rows=traceRows(data).map(function(r){return {stage:r[0],field:r[1],value:r[2]};});global.PDFEngine.downloadReport({company:this.company,title:'GJURMUESHMËRI 360° — '+lot.lotNumber,filtersText:'Artikulli: '+(lot.productName||'')+' | Fermeri: '+(lot.supplierName||''),columns:[{key:'stage',label:'Faza',width:120},{key:'field',label:'Fusha',width:180},{key:'value',label:'Vlera',width:300}],rows:rows,filename:'Gjurmueshmeri_360_'+lot.lotNumber+'.pdf',footer:(this.company||{}).invoiceFooter||''});this.toast('PDF i gjurmueshmërisë u eksportua.'); } catch(e){this.toast(e.message,'error');}
  };
  App.exportLot360Excel = async function (id) {
    try { var data=await getLot360(id),lot=camel(data.lot||{}),aoa=[['GJURMUESHMËRI 360°',lot.lotNumber],[(this.company||{}).name||'Sistemi Genit','NIPT: '+((this.company||{}).nipt||'')],['Artikulli',lot.productName||''],['Fermeri/Furnitori',lot.supplierName||''],[],['Faza','Fusha','Vlera']];traceRows(data).forEach(function(r){aoa.push(r);});var ws=global.XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:20},{wch:28},{wch:48}];ws['!freeze']={xSplit:0,ySplit:6};ws['!autofilter']={ref:'A6:C6'};ws['!margins']={left:0.3,right:0.3,top:0.5,bottom:0.5,header:0.2,footer:0.2};ws['!printArea']='A1:C'+aoa.length;var wb=global.XLSX.utils.book_new();global.XLSX.utils.book_append_sheet(wb,ws,'Gjurmueshmëri 360');global.DesktopIO.saveWorkbook(wb,'Gjurmueshmeri_360_'+lot.lotNumber+'.xlsx');this.toast('Excel .xlsx i gjurmueshmërisë u eksportua.'); } catch(e){this.toast(e.message,'error');}
  };

  var baseViewTraceOrigins = App.view_traceOrigins;
  if (baseViewTraceOrigins) App.view_traceOrigins = async function () { try { await loadPhase4Data(); baseViewTraceOrigins.call(this); } catch(e){this.toast(e.message,'error');} };

  global.SGPhase4 = { load:loadPhase4Data, mapLot:mapLot, mapWeight:mapWeight };
})(window);
