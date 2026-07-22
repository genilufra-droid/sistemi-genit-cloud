/* Sistemi Genit — Odoo-style Traceability Actions */
(function (global) {
  'use strict';

  var App = global.App;
  var DB = global.DB;
  var C = global.Calc;
  var S = global.Services;
  var T = global.Traceability;
  if (!App || !DB || !C || !S || !T) return;
  if (global.__SG_ODOO_TRACEABILITY_ACTIONS__) return;
  global.__SG_ODOO_TRACEABILITY_ACTIONS__ = true;

  function demoToken() {
    var source = App && App.company && (App.company.code || App.company.id || App.company.name) || 'DEFAULT';
    return String(source).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10) || 'DEFAULT';
  }
  function scopedDemoId(base) { return base + '-' + demoToken().toLowerCase(); }
  var DEMO = {};
  Object.defineProperties(DEMO, {
    supplierId: { get: function () { return scopedDemoId('sg-demo-ferre-supplier'); } },
    customerId: { get: function () { return scopedDemoId('sg-demo-ferre-customer'); } },
    warehouseId: { get: function () { return scopedDemoId('sg-demo-ferre-warehouse'); } },
    productId: { get: function () { return scopedDemoId('sg-demo-ferre-product'); } },
    outputProductId: { get: function () { return scopedDemoId('sg-demo-ferre-output-product'); } },
    farmId: { get: function () { return scopedDemoId('sg-demo-ferre-farm'); } },
    parcelId: { get: function () { return scopedDemoId('sg-demo-ferre-parcel'); } },
    lotId: { get: function () { return scopedDemoId('sg-demo-ferre-lot'); } },
    lotNumber: { get: function () { return 'LOT-FERRE-DEMO-' + demoToken() + '-001'; } },
    saleId: { get: function () { return scopedDemoId('sg-demo-ferre-sale'); } },
    saleItemId: { get: function () { return scopedDemoId('sg-demo-ferre-sale-item'); } },
    saleNumber: { get: function () { return 'FS-DEMO-FERRE-' + demoToken() + '-001'; } },
    batchId: { get: function () { return scopedDemoId('sg-demo-ferre-work-order'); } },
    batchNumber: { get: function () { return 'UP-DEMO-FERRE-' + demoToken() + '-001'; } }
  });

  function num(v) { return C.toNum(v); }
  function round2(v) { return C.round2(v); }
  function round3(v) { return C.round3(v); }
  function nowIso() { return new Date().toISOString(); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function esc(v) { return App.esc(v == null ? '' : String(v)); }
  function attr(v) { return esc(v).replace(/"/g, '&quot;'); }
  function selected(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function actor() {
    var u = global.Auth && global.Auth.getCurrentUser ? global.Auth.getCurrentUser() : null;
    return u || { id: 'system', username: 'system', displayName: 'System' };
  }
  function requirePermission(permission) {
    if (global.Auth && global.Auth.requirePermission) global.Auth.requirePermission(permission);
  }
  function audit(entity, id, action, before, after, number) {
    return C.auditEntry ? C.auditEntry(entity, id, action, before || null, after || null, number || id) : {
      id: DB.genId('audit'), entityType: entity, entityId: id, action: action,
      before: before || null, after: after || null, reference: number || id,
      timestamp: nowIso(), username: actor().username
    };
  }
  function byId(list, id) { return (list || []).find(function (x) { return x.id === id; }); }
  function normalizeToken(value, fallback) {
    var text = String(value || '').trim().toLocaleUpperCase('sq-AL');
    text = text.normalize ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : text;
    text = text.replace(/Ë/g, 'E').replace(/Ç/g, 'C').replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
    return text || String(fallback || 'LOT');
  }
  function statusLabel(status) {
    var map = { DRAFT: 'Draft', AVAILABLE: 'I disponueshëm', QUARANTINE: 'Karantinë', BLOCKED: 'Bllokuar', DEPLETED: 'I konsumuar', CANCELLED: 'Anulluar', POSTED: 'Postuar', APPROVED: 'Aprovuar', REJECTED: 'Refuzuar' };
    return map[status] || status || '—';
  }
  function optionRows(list, selectedId, label) {
    return '<option value="">— ' + esc(label || 'Zgjidh') + ' —</option>' + (list || []).map(function (x) {
      return '<option value="' + attr(x.id) + '"' + (x.id === selectedId ? ' selected' : '') + '>' + esc(x.code ? x.code + ' — ' + (x.name || '') : (x.name || x.lotNumber || x.id)) + '</option>';
    }).join('');
  }
  function safeFilename(value) { return String(value || 'Dokument').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_'); }
  function refreshTo(view) { return App.refreshAll().then(function () { App.navigate(view); }); }

  function nextManualLotNumber(product, allLots) {
    var base = 'LOT-' + normalizeToken(product && (product.traceLotPrefix || product.code || product.name), 'ART') + '-' + today().replace(/-/g, '');
    var max = 0;
    (allLots || []).forEach(function (x) {
      var m = String(x.lotNumber || '').match(new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-(\\d+)$'));
      if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
    });
    return base + '-' + String(max + 1).padStart(3, '0');
  }

  async function saveManualLot(input) {
    requirePermission('documents.create');
    input = input || {};
    if (!input.productId) throw new Error('Artikulli është i detyrueshëm.');
    if (!input.supplierId) throw new Error('Fermeri/Furnitori është i detyrueshëm.');
    if (!input.farmId) throw new Error('Ferma/Origjina është e detyrueshme.');
    if (!input.parcelId) throw new Error('Parcela/Zona e mbledhjes është e detyrueshme.');
    if (!input.warehouseId) throw new Error('Magazina është e detyrueshme.');
    var qty = round3(input.plannedQuantity);
    if (qty <= 0) throw new Error('Sasia e lotit duhet të jetë më e madhe se zero.');
    var existing = input.id ? await DB.get('lots', input.id) : null;
    if (existing && existing.status !== 'DRAFT') throw new Error('Vetëm loti Draft mund të editohet.');
    var product = await DB.get('products', input.productId);
    var supplier = await DB.get('suppliers', input.supplierId);
    var farm = await DB.get('traceFarms', input.farmId);
    var parcel = await DB.get('traceParcels', input.parcelId);
    var warehouse = await DB.get('warehouses', input.warehouseId);
    if (!product || !supplier || !farm || !parcel || !warehouse) throw new Error('Artikulli, partneri, origjina ose magazina nuk u gjet.');
    var allLots = await DB.getAll('lots');
    var lotNumber = String(input.lotNumber || '').trim() || nextManualLotNumber(product, allLots);
    if (allLots.some(function (x) { return x.id !== input.id && String(x.lotNumber).toUpperCase() === lotNumber.toUpperCase(); })) throw new Error('Numri i lotit ekziston.');
    var now = nowIso();
    var rec = Object.assign({}, existing || {}, {
      id: input.id || DB.genId('lot'), lotNumber: lotNumber, lotType: input.lotType || 'RAW', status: 'DRAFT',
      qualityStatus: input.qualityStatus || 'APPROVED', productId: product.id, productName: product.name,
      supplierId: supplier.id, supplierName: supplier.name, farmId: farm.id, farmCode: farm.code, farmName: farm.name,
      parcelId: parcel.id, parcelCode: parcel.code, parcelName: parcel.name,
      sourceType: input.sourceType || parcel.sourceType || farm.sourceTypeDefault || 'CULTIVATED',
      warehouseId: warehouse.id, warehouseName: warehouse.name,
      sourceDate: input.sourceDate || today(), harvestDate: input.harvestDate || input.sourceDate || today(), productionDate: input.sourceDate || today(),
      botanicalName: input.botanicalName || product.botanicalName || '', plantPart: input.plantPart || product.plantPart || '',
      country: parcel.country || farm.country || 'Shqipëri', region: parcel.region || farm.region || '', municipality: parcel.municipality || farm.municipality || '',
      village: parcel.village || farm.village || '', locationName: parcel.locationName || parcel.name || farm.locationName || farm.name || '',
      latitude: parcel.latitude != null ? parcel.latitude : farm.latitude, longitude: parcel.longitude != null ? parcel.longitude : farm.longitude,
      altitudeM: parcel.altitudeM != null ? parcel.altitudeM : farm.altitudeM,
      locationText: [parcel.locationName || parcel.name, parcel.village, parcel.municipality, parcel.region, parcel.country || farm.country].filter(Boolean).join(', '),
      mapUrl: parcel.mapUrl || farm.mapUrl || '', plannedQuantity: qty,
      quantityCreated: existing ? num(existing.quantityCreated) : 0, quantityAvailable: existing ? num(existing.quantityAvailable) : 0,
      quantityConsumed: existing ? num(existing.quantityConsumed) : 0, baseUnit: product.baseUnit || 'kg',
      notes: input.notes || '', createdAt: existing && existing.createdAt || now, updatedAt: now,
      createdBy: existing && existing.createdBy || actor().username, updatedBy: actor().username, manualEntry: true
    });
    await DB.atomicTx(['lots', 'auditLogs'], 'readwrite', function (stores) {
      stores.lots.put(rec); stores.auditLogs.put(audit('lot', rec.id, existing ? 'UPDATE_DRAFT' : 'CREATE_DRAFT', existing, rec, rec.lotNumber));
    });
    return rec;
  }

  async function confirmManualLot(id) {
    requirePermission('documents.post');
    var lot = await DB.get('lots', id);
    if (!lot) throw new Error('Loti nuk u gjet.');
    if (lot.status !== 'DRAFT') throw new Error('Vetëm loti Draft mund të konfirmohet.');
    var product = await DB.get('products', lot.productId);
    if (!product) throw new Error('Artikulli nuk u gjet.');
    var qty = round3(lot.plannedQuantity || lot.quantityCreated);
    if (qty <= 0) throw new Error('Sasia e lotit nuk është e vlefshme.');
    var before = JSON.parse(JSON.stringify(lot)), now = nowIso();
    var newStock = round3(num(product.stock) + qty), quality = lot.qualityStatus || 'APPROVED';
    lot.quantityCreated = qty; lot.quantityAvailable = qty; lot.quantityConsumed = 0;
    lot.status = quality === 'APPROVED' ? 'AVAILABLE' : (quality === 'REJECTED' ? 'BLOCKED' : 'QUARANTINE');
    lot.confirmedAt = now; lot.confirmedBy = actor().username; lot.updatedAt = now;
    product.stock = newStock; product.traceabilityEnabled = true; product.updatedAt = now;
    await DB.atomicTx(['lots', 'products', 'lotMovements', 'stockMovements', 'productCards', 'auditLogs'], 'readwrite', function (stores) {
      stores.lots.put(lot); stores.products.put(product);
      stores.lotMovements.put({ id: DB.genId('lm'), lotId: lot.id, lotNumber: lot.lotNumber, productId: lot.productId, movementType: 'MANUAL_LOT_IN', quantity: qty, balanceAfter: qty, sourceDocType: 'manualLot', sourceDocId: lot.id, sourceDocNumber: lot.lotNumber, supplierId: lot.supplierId, farmId: lot.farmId, parcelId: lot.parcelId, warehouseId: lot.warehouseId, timestamp: now, createdBy: actor().username });
      stores.stockMovements.put({ id: DB.genId('sm'), productId: lot.productId, warehouseId: lot.warehouseId, movementType: 'IN_MANUAL_LOT', sourceDocType: 'manualLot', sourceDocId: lot.id, sourceDocNumber: lot.lotNumber, quantity: qty, baseUnitQuantity: qty, unit: lot.baseUnit || product.baseUnit || 'kg', timestamp: now, lotId: lot.id, lotNumber: lot.lotNumber });
      stores.productCards.put({ id: DB.genId('pc'), productId: lot.productId, sourceDocId: lot.id, sourceDocNumber: lot.lotNumber, type: 'MANUAL_LOT_IN', date: lot.sourceDate || today(), quantityIn: qty, quantityOut: 0, balance: newStock, timestamp: now, lotId: lot.id, lotNumber: lot.lotNumber });
      stores.auditLogs.put(audit('lot', lot.id, 'CONFIRM_ATOMIC', before, lot, lot.lotNumber));
    });
    return lot;
  }

  async function deleteManualLot(id) {
    requirePermission('documents.cancel');
    var lot = await DB.get('lots', id);
    if (!lot) return;
    if (lot.status !== 'DRAFT') throw new Error('Vetëm loti Draft mund të fshihet. Loti i konfirmuar anullohet me dokument korrigjues.');
    await DB.atomicTx(['lots', 'auditLogs'], 'readwrite', function (stores) {
      stores.lots.delete(id); stores.auditLogs.put(audit('lot', id, 'DELETE_DRAFT', lot, null, lot.lotNumber));
    });
  }

  function lotForm(id) {
    var x = id ? byId(App.data.lots, id) : null;
    if (x && x.status !== 'DRAFT') { App.toast('Vetëm loti Draft mund të editohet.', 'error'); return; }
    x = x || {};
    var farms = (App.data.traceFarms || []).filter(function (y) { return y.active !== false; });
    var parcels = (App.data.traceParcels || []).filter(function (y) { return y.active !== false; });
    var body = '<div class="sg-odoo-form"><div class="sg-odoo-statusbar"><span class="active">Draft</span><span>Konfirmuar</span><span>Në proces</span><span>Shitur</span></div>' +
      '<div class="sg-odoo-section"><h4>Identifikimi i lotit</h4><div class="form-grid"><div class="form-group"><label>Numri i lotit</label><input id="sg-lot-number" value="' + attr(x.lotNumber || '') + '" placeholder="Automatik nëse lihet bosh"></div><div class="form-group"><label>Artikulli *</label><select id="sg-lot-product">' + optionRows(App.data.products, x.productId, 'Artikull') + '</select></div><div class="form-group"><label>Sasia hyrëse (kg) *</label><input id="sg-lot-qty" type="number" step="0.001" min="0.001" value="' + attr(x.plannedQuantity || x.quantityCreated || '') + '"></div><div class="form-group"><label>Magazina *</label><select id="sg-lot-warehouse">' + optionRows(App.data.warehouses, x.warehouseId, 'Magazinë') + '</select></div><div class="form-group"><label>Data e hyrjes *</label><input id="sg-lot-source-date" type="date" value="' + attr((x.sourceDate || today()).slice(0, 10)) + '"></div><div class="form-group"><label>Data e korrjes/mbledhjes</label><input id="sg-lot-harvest-date" type="date" value="' + attr((x.harvestDate || x.sourceDate || today()).slice(0, 10)) + '"></div></div></div>' +
      '<div class="sg-odoo-section"><h4>Origjina GACP</h4><div class="form-grid"><div class="form-group"><label>Fermeri/Furnitori *</label><select id="sg-lot-supplier">' + optionRows(App.data.suppliers, x.supplierId, 'Fermer/Furnitor') + '</select></div><div class="form-group"><label>Ferma/Origjina *</label><select id="sg-lot-farm">' + optionRows(farms, x.farmId, 'Fermë/Origjinë') + '</select></div><div class="form-group"><label>Parcela/Zona *</label><select id="sg-lot-parcel">' + optionRows(parcels, x.parcelId, 'Parcelë/Zonë') + '</select></div><div class="form-group"><label>Lloji i burimit</label><select id="sg-lot-source-type"><option value="CULTIVATED"' + ((x.sourceType || '') !== 'WILD_COLLECTION' ? ' selected' : '') + '>E kultivuar</option><option value="WILD_COLLECTION"' + (x.sourceType === 'WILD_COLLECTION' ? ' selected' : '') + '>Mbledhje e egër</option></select></div><div class="form-group"><label>Status cilësie</label><select id="sg-lot-quality"><option value="APPROVED"' + ((x.qualityStatus || 'APPROVED') === 'APPROVED' ? ' selected' : '') + '>Aprovuar</option><option value="QUARANTINE"' + (x.qualityStatus === 'QUARANTINE' ? ' selected' : '') + '>Karantinë</option><option value="REJECTED"' + (x.qualityStatus === 'REJECTED' ? ' selected' : '') + '>Refuzuar</option></select></div><div class="form-group"><label>Pjesa e bimës</label><input id="sg-lot-plant-part" value="' + attr(x.plantPart || '') + '" placeholder="p.sh. Gjethe"></div></div></div><div class="sg-odoo-section"><h4>Shënime</h4><textarea id="sg-lot-notes">' + esc(x.notes || '') + '</textarea></div></div>';
    App.modal(id ? '✏️ Edito Lotin Draft' : '🏷️ Lot i Ri', body, '<button class="btn btn-outline" onclick="App.closeModal()">Anulo</button><button class="btn btn-primary" onclick="App.saveManualLotForm(\'' + (id || '') + '\')">💾 Ruaj Draft</button>');
  }
  App.editManualLot = lotForm;
  App.saveManualLotForm = async function (id) {
    try {
      var rec = await saveManualLot({ id: id || '', lotNumber: selected('sg-lot-number'), productId: selected('sg-lot-product'), plannedQuantity: selected('sg-lot-qty'), warehouseId: selected('sg-lot-warehouse'), sourceDate: selected('sg-lot-source-date'), harvestDate: selected('sg-lot-harvest-date'), supplierId: selected('sg-lot-supplier'), farmId: selected('sg-lot-farm'), parcelId: selected('sg-lot-parcel'), sourceType: selected('sg-lot-source-type'), qualityStatus: selected('sg-lot-quality'), plantPart: selected('sg-lot-plant-part'), notes: selected('sg-lot-notes') });
      App.closeModal(); await refreshTo('traceLots'); App.toast('Loti u ruajt si Draft: ' + rec.lotNumber);
    } catch (e) { App.toast(e.message || String(e), 'error'); }
  };
  App.confirmManualLot = async function (id) { if (!global.confirm('Konfirmo lotin dhe rrit stokun?')) return; try { await confirmManualLot(id); await refreshTo('traceLots'); App.toast('Loti u konfirmua dhe stoku u përditësua.'); } catch (e) { App.toast(e.message || String(e), 'error'); } };
  App.deleteManualLot = async function (id) { if (!global.confirm('Fshi lotin Draft?')) return; try { await deleteManualLot(id); await refreshTo('traceLots'); App.toast('Loti Draft u fshi.'); } catch (e) { App.toast(e.message || String(e), 'error'); } };

  function lotRows(lot) {
    return [{ label: 'Numri i lotit', value: lot.lotNumber }, { label: 'Artikulli', value: lot.productName }, { label: 'Fermeri', value: lot.supplierName }, { label: 'Ferma/Origjina', value: lot.farmName }, { label: 'Parcela/Zona', value: lot.parcelCode + (lot.parcelName ? ' — ' + lot.parcelName : '') }, { label: 'Lokacioni', value: lot.locationText }, { label: 'Data e mbledhjes', value: App.fmtDate(lot.harvestDate || lot.sourceDate) }, { label: 'Sasi e krijuar', value: App.fmtKg(lot.quantityCreated || lot.plannedQuantity) + ' ' + (lot.baseUnit || 'kg') }, { label: 'Sasi e shitur/konsumuar', value: App.fmtKg(lot.quantityConsumed) + ' ' + (lot.baseUnit || 'kg') }, { label: 'Gjendje', value: App.fmtKg(lot.quantityAvailable) + ' ' + (lot.baseUnit || 'kg') }, { label: 'Status', value: statusLabel(lot.status) }, { label: 'Cilësia', value: statusLabel(lot.qualityStatus) }];
  }
  function lotExportColumns() { return [{ key: 'label', label: 'Fusha', width: 180 }, { key: 'value', label: 'Vlera', width: 300 }]; }
  App.exportLotOdooPDF = function (id) { var lot = byId(this.data.lots, id); if (!lot) return; global.PDFEngine.downloadReport({ company: this.company, title: 'KARTELA E LOTIT ' + lot.lotNumber, columns: lotExportColumns(), rows: lotRows(lot), filename: 'Kartela_Lotit_' + safeFilename(lot.lotNumber) + '.pdf', footer: (this.company || {}).invoiceFooter || '' }); this.toast('PDF i lotit u eksportua.'); };
  App.exportLotOdooExcel = function (id) { var lot = byId(this.data.lots, id); if (!lot || !global.XLSX) return; var aoa = [['KARTELA E LOTIT', lot.lotNumber], [], ['Fusha', 'Vlera']].concat(lotRows(lot).map(function (r) { return [r.label, r.value]; })); var ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = [{ wch: 28 }, { wch: 48 }]; var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Loti'); if (global.DesktopIO && DesktopIO.saveWorkbook) DesktopIO.saveWorkbook(wb, 'Kartela_Lotit_' + safeFilename(lot.lotNumber) + '.xlsx'); else XLSX.writeFile(wb, 'Kartela_Lotit_' + safeFilename(lot.lotNumber) + '.xlsx'); this.toast('Excel i lotit u eksportua.'); };
  App.printLotOdoo = function (id) { var lot = byId(this.data.lots, id); if (!lot) return; var w = global.open('', '_blank', 'width=950,height=800'); if (!w) { this.toast('Browser-i bllokoi dritaren e printimit.', 'error'); return; } var rows = lotRows(lot).map(function (r) { return '<tr><th>' + esc(r.label) + '</th><td>' + esc(r.value) + '</td></tr>'; }).join(''); w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(lot.lotNumber) + '</title><style>body{font-family:Segoe UI;padding:30px;color:#222}h1{font-size:22px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:9px;text-align:left}th{width:32%;background:#f2f2f2}</style></head><body><h1>Kartela e Lotit ' + esc(lot.lotNumber) + '</h1><p>' + esc((this.company && this.company.name) || 'Sistemi Genit') + '</p><table>' + rows + '</table></body></html>'); w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 200); };

  App.openLotOdoo = async function (id) {
    try {
      var tr = await T.traceLot(id), lot = tr.lot;
      var salesQty = (tr.sales || []).reduce(function (s, m) { return s + Math.abs(num(m.quantity)); }, 0);
      var movements = (tr.movements || []).map(function (m) { return '<tr><td>' + App.fmtDate(m.timestamp) + '</td><td>' + esc(m.movementType) + '</td><td>' + esc(m.sourceDocNumber || '—') + '</td><td class="text-right">' + App.fmtKg(m.quantity) + '</td><td class="text-right">' + App.fmtKg(m.balanceAfter) + '</td></tr>'; }).join('');
      var saleRows = (tr.sales || []).map(function (m) { return '<tr><td>' + esc(m.sourceDocNumber || '—') + '</td><td>' + esc(m.customerName || '—') + '</td><td class="text-right">' + App.fmtKg(Math.abs(num(m.quantity))) + ' kg</td><td>' + App.fmtDate(m.timestamp) + '</td></tr>'; }).join('');
      var body = '<div class="sg-odoo-record-header"><div><span class="sg-record-kicker">LOT / SERIAL NUMBER</span><h2>' + esc(lot.lotNumber) + '</h2><p>' + esc(lot.productName || '') + '</p></div><div class="sg-odoo-badges"><span class="status-badge status-' + esc(lot.status) + '">' + esc(statusLabel(lot.status)) + '</span></div></div><div class="sg-odoo-kpis"><div><span>Hyrje</span><strong>' + App.fmtKg(lot.quantityCreated || lot.plannedQuantity) + ' kg</strong></div><div><span>Shitur/Konsumuar</span><strong>' + App.fmtKg(salesQty || lot.quantityConsumed) + ' kg</strong></div><div><span>Gjendje</span><strong>' + App.fmtKg(lot.quantityAvailable) + ' kg</strong></div><div><span>Cilësi</span><strong>' + esc(statusLabel(lot.qualityStatus)) + '</strong></div></div><div class="sg-odoo-section"><h4>Origjina dhe identifikimi</h4><div class="sg-detail-grid">' + lotRows(lot).slice(0, 7).map(function (r) { return '<div><span>' + esc(r.label) + '</span><strong>' + esc(r.value) + '</strong></div>'; }).join('') + '</div></div><div class="sg-odoo-section"><h4>Shitjet nga ky lot</h4><div class="report-table-wrap"><table><thead><tr><th>Dokumenti</th><th>Klienti</th><th>Sasia</th><th>Data</th></tr></thead><tbody>' + (saleRows || '<tr><td colspan="4">Nuk ka shitje.</td></tr>') + '</tbody></table></div></div><div class="sg-odoo-section"><h4>Historiku i lëvizjeve</h4><div class="report-table-wrap"><table><thead><tr><th>Data</th><th>Veprimi</th><th>Dokumenti</th><th>Sasia</th><th>Gjendja</th></tr></thead><tbody>' + (movements || '<tr><td colspan="5">Nuk ka lëvizje.</td></tr>') + '</tbody></table></div></div>';
      var footer = '<button class="btn btn-outline" onclick="App.printLotOdoo(\'' + id + '\')">🖨 Print</button><button class="btn btn-red" onclick="App.exportLotOdooPDF(\'' + id + '\')">PDF</button><button class="btn btn-green" onclick="App.exportLotOdooExcel(\'' + id + '\')">Excel</button>' + (lot.status === 'DRAFT' ? '<button class="btn btn-blue" onclick="App.closeModal();App.editManualLot(\'' + id + '\')">✏ Edito</button><button class="btn btn-primary" onclick="App.closeModal();App.confirmManualLot(\'' + id + '\')">✓ Konfirmo</button>' : '<button class="btn btn-primary" onclick="App.closeModal();App.createWorkOrderFromLot(\'' + id + '\')">⚙️ Urdhër Pune</button>') + '<button class="btn btn-outline" onclick="App.closeModal()">Mbyll</button>';
      this.modal('👁 Kartela e Lotit', body, footer);
    } catch (e) { this.toast(e.message || String(e), 'error'); }
  };

  var originalEditProcessBatch = App.editProcessBatch;
  App.editProcessBatch = function (id) { var result = originalEditProcessBatch.apply(this, arguments); setTimeout(function () { var title = document.querySelector('#modal-box .modal-header h3'); if (title) title.textContent = id ? '✏️ Edito Urdhrin e Punës' : '⚙️ Urdhër Pune i Ri'; }, 0); return result; };
  App.createWorkOrderFromLot = function (lotId) {
    var lot = byId(this.data.lots, lotId); if (!lot || !T.isSaleableLot(lot)) { this.toast('Loti nuk është i disponueshëm për proces.', 'error'); return; }
    this.editProcessBatch();
    setTimeout(function () {
      var productInput = document.getElementById('batch-product'), whInput = document.getElementById('batch-warehouse'), typeInput = document.getElementById('batch-type');
      if (productInput) { var p = byId(App.data.products, lot.productId); if (p && global.SAC) SAC.setSelected(productInput, p, { display: function (x) { return x.name; } }); }
      if (whInput) { var w = byId(App.data.warehouses, lot.warehouseId); if (w && global.SAC) SAC.setSelected(whInput, w, { display: function (x) { return x.name; } }); }
      if (typeInput && global.SAC) SAC.setSelected(typeInput, { id: 'CLEANING', name: 'Pastrim' }, { display: function (x) { return x.name; } });
      App._processInputs = [{ lotId: lot.id, lotNumber: lot.lotNumber, productId: lot.productId, productName: lot.productName, quantity: Math.min(100, num(lot.quantityAvailable)) }];
      var out = document.getElementById('batch-output'); if (out) out.value = Math.max(0.001, round3(App._processInputs[0].quantity * 0.92));
      var waste = document.getElementById('batch-waste'); if (waste) waste.value = round3(App._processInputs[0].quantity * 0.03);
      App.renderProcessInputs(); App.processCalc();
    }, 80);
  };

  App.deleteProcessDraft = async function (id) {
    if (!global.confirm('Fshi Urdhrin e Punës Draft?')) return;
    try { requirePermission('documents.cancel'); var batch = await DB.get('processBatches', id); if (!batch) return; if (batch.status !== 'DRAFT') throw new Error('Vetëm Urdhri i Punës Draft mund të fshihet.'); var inputs = await DB.getByIndex('processBatchInputs', 'batchId', id); await DB.atomicTx(['processBatches', 'processBatchInputs', 'auditLogs'], 'readwrite', function (stores) { inputs.forEach(function (x) { stores.processBatchInputs.delete(x.id); }); stores.processBatches.delete(id); stores.auditLogs.put(audit('processBatch', id, 'DELETE_DRAFT', batch, null, batch.batchNumber)); }); await refreshTo('traceProcesses'); App.toast('Urdhri i Punës Draft u fshi.'); } catch (e) { App.toast(e.message || String(e), 'error'); }
  };
  function processRows(batch) { var product = byId(App.data.products, batch.outputProductId) || {}; return [{ label: 'Urdhri i Punës', value: batch.batchNumber }, { label: 'Data', value: App.fmtDate(batch.date) }, { label: 'Procesi', value: batch.processType }, { label: 'Produkti final', value: product.name || batch.outputProductName || '—' }, { label: 'Hyrje', value: App.fmtKg(batch.inputQuantity) + ' kg' }, { label: 'Dalje', value: App.fmtKg(batch.outputQuantity) + ' kg' }, { label: 'Mbetje', value: App.fmtKg(batch.wasteQuantity) + ' kg' }, { label: 'Humbje', value: App.fmtKg(batch.processLossQuantity) + ' kg' }, { label: 'Rendiment', value: App.fmt(batch.yieldPct) + '%' }, { label: 'Status', value: statusLabel(batch.status) }]; }
  App.exportProcessOdooPDF = function (id) { var b = byId(this.data.processBatches, id); if (!b) return; PDFEngine.downloadReport({ company: this.company, title: 'URDHËR PUNE ' + b.batchNumber, columns: lotExportColumns(), rows: processRows(b), filename: 'Urdher_Pune_' + safeFilename(b.batchNumber) + '.pdf', footer: (this.company || {}).invoiceFooter || '' }); this.toast('PDF i Urdhrit të Punës u eksportua.'); };
  App.exportProcessOdooExcel = function (id) { var b = byId(this.data.processBatches, id); if (!b || !global.XLSX) return; var aoa = [['URDHËR PUNE', b.batchNumber], [], ['Fusha', 'Vlera']].concat(processRows(b).map(function (r) { return [r.label, r.value]; })); var ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = [{ wch: 28 }, { wch: 48 }]; var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Urdher Pune'); if (global.DesktopIO && DesktopIO.saveWorkbook) DesktopIO.saveWorkbook(wb, 'Urdher_Pune_' + safeFilename(b.batchNumber) + '.xlsx'); else XLSX.writeFile(wb, 'Urdher_Pune_' + safeFilename(b.batchNumber) + '.xlsx'); this.toast('Excel i Urdhrit të Punës u eksportua.'); };
  App.printProcessOdoo = function (id) { var b = byId(this.data.processBatches, id); if (!b) return; var w = global.open('', '_blank', 'width=950,height=800'); if (!w) return; var rows = processRows(b).map(function (r) { return '<tr><th>' + esc(r.label) + '</th><td>' + esc(r.value) + '</td></tr>'; }).join(''); w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(b.batchNumber) + '</title><style>body{font-family:Segoe UI;padding:30px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:9px;text-align:left}th{background:#f2f2f2;width:32%}</style></head><body><h1>Urdhër Pune ' + esc(b.batchNumber) + '</h1><table>' + rows + '</table></body></html>'); w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 200); };

  async function removeDemoData() {
    var stores = ['salesItems', 'salesInvoices', 'stockMovements', 'productCards', 'customerLedger', 'postingKeys', 'lotMovements', 'processBatchInputs', 'processBatches', 'lots', 'traceParcels', 'traceFarms', 'products', 'suppliers', 'customers', 'warehouses'], all = {};
    for (var i = 0; i < stores.length; i++) all[stores[i]] = await DB.getAll(stores[i]);
    await DB.atomicTx(stores, 'readwrite', function (tx) {
      (all.salesItems || []).filter(function (x) { return x.invoiceId === DEMO.saleId || x.id === DEMO.saleItemId; }).forEach(function (x) { tx.salesItems.delete(x.id); });
      (all.salesInvoices || []).filter(function (x) { return x.id === DEMO.saleId; }).forEach(function (x) { tx.salesInvoices.delete(x.id); });
      (all.stockMovements || []).filter(function (x) { return x.sourceDocId === DEMO.saleId || x.sourceDocId === DEMO.lotId || x.sourceDocId === DEMO.batchId || x.lotId === DEMO.lotId; }).forEach(function (x) { tx.stockMovements.delete(x.id); });
      (all.productCards || []).filter(function (x) { return x.sourceDocId === DEMO.saleId || x.sourceDocId === DEMO.lotId || x.sourceDocId === DEMO.batchId || x.lotId === DEMO.lotId; }).forEach(function (x) { tx.productCards.delete(x.id); });
      (all.customerLedger || []).filter(function (x) { return x.invoiceId === DEMO.saleId; }).forEach(function (x) { tx.customerLedger.delete(x.id); });
      (all.postingKeys || []).filter(function (x) { return x.documentId === DEMO.saleId || x.documentId === DEMO.batchId || x.id === 'SALE_POST:' + DEMO.saleId; }).forEach(function (x) { tx.postingKeys.delete(x.id); });
      (all.lotMovements || []).filter(function (x) { return x.lotId === DEMO.lotId || x.sourceDocId === DEMO.saleId || x.sourceDocId === DEMO.batchId; }).forEach(function (x) { tx.lotMovements.delete(x.id); });
      (all.processBatchInputs || []).filter(function (x) { return x.batchId === DEMO.batchId; }).forEach(function (x) { tx.processBatchInputs.delete(x.id); });
      (all.processBatches || []).filter(function (x) { return x.id === DEMO.batchId; }).forEach(function (x) { tx.processBatches.delete(x.id); });
      (all.lots || []).filter(function (x) { return x.id === DEMO.lotId || x.outputBatchId === DEMO.batchId; }).forEach(function (x) { tx.lots.delete(x.id); });
      tx.traceParcels.delete(DEMO.parcelId); tx.traceFarms.delete(DEMO.farmId); tx.products.delete(DEMO.productId); tx.products.delete(DEMO.outputProductId); tx.suppliers.delete(DEMO.supplierId); tx.customers.delete(DEMO.customerId); tx.warehouses.delete(DEMO.warehouseId);
    });
  }

  async function createDemoScenario() {
    requirePermission('documents.create'); await removeDemoData(); var now = nowIso();
    var supplier = { id: DEMO.supplierId, code: 'FERRE-F01', name: 'Fermeri Demo — Gjethe Ferre', nipt: 'K00000000D', address: 'Zona e Mbledhjes së Egër', city: 'Skrapar', active: true, balance: 0, totalPurchases: 0, createdAt: now, updatedAt: now };
    var customer = { id: DEMO.customerId, code: 'KLIENT-DEMO', name: 'Klienti Demo Herbal', nipt: 'L00000000D', address: 'Tiranë', city: 'Tiranë', active: true, balance: 0, totalSales: 0, createdAt: now, updatedAt: now };
    var warehouse = { id: DEMO.warehouseId, code: 'MAG-DEMO', name: 'Magazina Demo GACP', active: true, createdAt: now, updatedAt: now };
    var product = { id: DEMO.productId, code: 'GJ-FERRE', name: 'Gjethe Ferre', barcode: '', baseUnit: 'kg', purchasePrice: 100, salePrice: 180, avgPrice: 100, lastPrice: 100, stock: 0, traceabilityEnabled: true, traceLotPrefix: 'FERRE', botanicalName: 'Rubus fruticosus', plantPart: 'Gjethe', active: true, createdAt: now, updatedAt: now };
    var outputProduct = { id: DEMO.outputProductId, code: 'GJ-FERRE-P', name: 'Gjethe Ferre e Pastruar', baseUnit: 'kg', purchasePrice: 0, salePrice: 240, avgPrice: 0, lastPrice: 0, stock: 0, traceabilityEnabled: true, traceLotPrefix: 'FERRE-P', botanicalName: 'Rubus fruticosus', plantPart: 'Gjethe', active: true, createdAt: now, updatedAt: now };
    var farm = { id: DEMO.farmId, supplierId: supplier.id, code: 'ORIG-FERRE-01', name: 'Origjina Demo — Mali i Tomorrit', sourceTypeDefault: 'WILD_COLLECTION', country: 'Shqipëri', region: 'Berat', municipality: 'Skrapar', village: 'Gjerbës', locationName: 'Zona e Gjetheve të Ferrës', latitude: 40.52, longitude: 20.22, mapUrl: 'https://www.openstreetmap.org/?mlat=40.520000&mlon=20.220000#map=16/40.520000/20.220000', active: true, createdAt: now, updatedAt: now };
    var parcel = { id: DEMO.parcelId, supplierId: supplier.id, farmId: farm.id, code: 'ZONE-FERRE-01', name: 'Zona e Mbledhjes Ferre 01', sourceType: 'WILD_COLLECTION', country: 'Shqipëri', region: 'Berat', municipality: 'Skrapar', village: 'Gjerbës', locationName: 'Shpatet e Tomorrit', latitude: 40.52, longitude: 20.22, mapUrl: farm.mapUrl, active: true, createdAt: now, updatedAt: now };
    await DB.atomicTx(['suppliers', 'customers', 'warehouses', 'products', 'traceFarms', 'traceParcels'], 'readwrite', function (tx) { tx.suppliers.put(supplier); tx.customers.put(customer); tx.warehouses.put(warehouse); tx.products.put(product); tx.products.put(outputProduct); tx.traceFarms.put(farm); tx.traceParcels.put(parcel); });
    var lot = await saveManualLot({ id: DEMO.lotId, lotNumber: DEMO.lotNumber, productId: product.id, supplierId: supplier.id, farmId: farm.id, parcelId: parcel.id, warehouseId: warehouse.id, sourceType: 'WILD_COLLECTION', sourceDate: today(), harvestDate: today(), plannedQuantity: 200, qualityStatus: 'APPROVED', plantPart: 'Gjethe', botanicalName: 'Rubus fruticosus', notes: 'Test demonstrues: hyrje 200 kg Gjethe Ferre.' });
    await confirmManualLot(lot.id);
    var invoice = { id: DEMO.saleId, docNumber: DEMO.saleNumber, date: now, dueDate: now, customerId: customer.id, customerName: customer.name, warehouseId: warehouse.id, warehouseName: warehouse.name, paymentMethod: 'cash', paidAmount: 0, status: 'DRAFT', traceabilityEnabled: true, notes: 'Test demonstrues: shitje 50 kg nga loti ' + lot.lotNumber, lines: [{ id: DEMO.saleItemId, invoiceId: DEMO.saleId, productId: product.id, productName: product.name, productCode: product.code, unit: 'kg', quantity: 50, freeQty: 0, coefficient: 1, unitPrice: 180, discountPct: 0, applyVat: false, vatRate: 0, lotId: lot.id, lotNumber: lot.lotNumber }] };
    if (typeof S.saveSale === 'function' && typeof S.registerSale === 'function') { await S.saveSale(invoice); await S.registerSale(DEMO.saleId); } else throw new Error('Shërbimi i shitjes nuk është i disponueshëm në këtë version.');
    await S.saveProcessBatch({ id: DEMO.batchId, batchNumber: DEMO.batchNumber, date: now, processType: 'CLEANING', outputProductId: outputProduct.id, warehouseId: warehouse.id, outputQuantity: 92, wasteQuantity: 3, extraCost: 0, qualityStatus: 'APPROVED', notes: 'Urdhër Pune Draft: 100 kg hyrje, 92 kg dalje, 3 kg mbetje, 5 kg humbje.', inputs: [{ lotId: lot.id, lotNumber: lot.lotNumber, productId: product.id, productName: product.name, quantity: 100 }] });
    await App.refreshAll(); var resultLot = await DB.get('lots', lot.id); if (!resultLot || round3(resultLot.quantityCreated) !== 200 || round3(resultLot.quantityAvailable) !== 150) throw new Error('Kontrolli automatik dështoi: pritej 200 kg hyrje dhe 150 kg gjendje.');
    return { lot: resultLot, sale: await DB.get('salesInvoices', DEMO.saleId), batch: await DB.get('processBatches', DEMO.batchId) };
  }
  App.createFerreDemoScenario = async function () { if (!global.confirm('Krijo testin profesional: Gjethe Ferre 200 kg, shitje 50 kg dhe Urdhër Pune Draft? Të dhënat demo me të njëjtët kode do të rindërtohen.')) return; try { var result = await createDemoScenario(); App.navigate('traceLots'); App.toast('Testi u krijua: 200 kg hyrje − 50 kg shitje = 150 kg gjendje.'); setTimeout(function () { App.openLotOdoo(result.lot.id); }, 250); } catch (e) { App.toast(e.message || String(e), 'error'); } };

  function lotActionMenu(x) {
    var actions = [{ icon: '👁', label: 'Shiko', action: "App.openLotOdoo('" + x.id + "')" }];
    if (x.status === 'DRAFT') { actions.push({ icon: '✏️', label: 'Edito', action: "App.editManualLot('" + x.id + "')" }); actions.push({ icon: '✓', label: 'Konfirmo', action: "App.confirmManualLot('" + x.id + "')" }); actions.push({ icon: '🗑️', label: 'Fshi Draft', danger: true, action: "App.deleteManualLot('" + x.id + "')" }); }
    else { actions.push({ icon: '⚙️', label: 'Krijo Urdhër Pune', action: "App.createWorkOrderFromLot('" + x.id + "')" }); actions.push({ icon: '🧪', label: 'Kontroll Cilësie', action: "App.editTraceQuality(null,'" + x.id + "')" }); }
    actions.push({ icon: '🖨', label: 'Print', action: "App.printLotOdoo('" + x.id + "')" }); actions.push({ icon: '📄', label: 'PDF', action: "App.exportLotOdooPDF('" + x.id + "')" }); actions.push({ icon: '📊', label: 'Excel', action: "App.exportLotOdooExcel('" + x.id + "')" }); if (x.status !== 'DRAFT') actions.push({ icon: '🚨', label: 'Mock Recall', action: "App.createRecallFromLot('" + x.id + "')" }); return App.rowActionMenu(actions);
  }

  App.view_traceLots = function () {
    var q = (this._traceLotSearch || '').toLocaleLowerCase('sq-AL'), rows = (this.data.lots || []).filter(function (x) { return !q || [x.lotNumber, x.productName, x.supplierName, x.farmName, x.parcelCode, x.locationText].join(' ').toLocaleLowerCase('sq-AL').indexOf(q) >= 0; }).sort(function (a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); }), demoLot = byId(this.data.lots, DEMO.lotId);
    var htmlRows = rows.map(function (x) { return '<tr data-lot-id="' + attr(x.id) + '" ondblclick="App.openLotOdoo(\'' + x.id + '\')"><td><button class="sg-eye-btn" title="Shiko" onclick="App.openLotOdoo(\'' + x.id + '\')">👁</button></td><td><strong>' + esc(x.lotNumber) + '</strong></td><td>' + esc(x.lotType || 'RAW') + '</td><td>' + esc(x.productName || '—') + '</td><td>' + esc(x.supplierName || '—') + '</td><td>' + esc(x.parcelCode || '—') + '</td><td class="text-right">' + App.fmtKg(x.quantityCreated || x.plannedQuantity) + '</td><td class="text-right">' + App.fmtKg(x.quantityConsumed) + '</td><td class="text-right"><strong>' + App.fmtKg(x.quantityAvailable) + '</strong></td><td><span class="status-badge status-' + esc(x.status) + '">' + esc(statusLabel(x.status)) + '</span></td><td onclick="event.stopPropagation()">' + lotActionMenu(x) + '</td></tr>'; }).join('');
    var demoCard = demoLot ? '<div class="sg-demo-result"><div><span>Testi Gjethe Ferre</span><strong>200 kg hyrje</strong></div><div><span>Shitur klientit</span><strong>50 kg</strong></div><div><span>Gjendje loti</span><strong>' + App.fmtKg(demoLot.quantityAvailable) + ' kg</strong></div><div class="sg-demo-links"><button class="btn btn-outline btn-sm" onclick="App.openLotOdoo(\'' + demoLot.id + '\')">👁 Shiko Lotin</button><button class="btn btn-outline btn-sm" onclick="App.navigate(\'salesList\')">🧾 Shitja</button><button class="btn btn-outline btn-sm" onclick="App.navigate(\'traceProcesses\')">⚙️ Urdhri i Punës</button></div></div>' : '';
    document.getElementById('content').innerHTML = '<div class="sg-odoo-control-panel"><div><h3>Lotet / Numrat Serialë</h3><p>Origjinë → Lot → Proces → Shitje → Klient</p></div><div class="sg-odoo-actions"><button id="sg-new-lot-btn" class="btn btn-primary" onclick="App.editManualLot()">+ Lot i Ri</button><button id="sg-demo-trace-btn" class="btn btn-orange" onclick="App.createFerreDemoScenario()">🧪 Test: Gjethe Ferre 200 → 50 kg</button></div></div>' + demoCard + '<div class="card"><div class="card-title"><span>🏷️ Regjistri i loteve</span><div class="trace-inline-filter"><input id="trace-lot-search" placeholder="Kërko lot, artikull, fermer, parcelë…" value="' + attr(this._traceLotSearch || '') + '"><button class="btn btn-primary btn-sm" onclick="App._traceLotSearch=document.getElementById(\'trace-lot-search\').value;App.view_traceLots()">Kërko</button><button class="btn btn-outline btn-sm" onclick="App._traceLotSearch=\'\';App.view_traceLots()">Pastro</button></div></div><div class="report-table-wrap"><table><thead><tr><th></th><th>Loti</th><th>Tipi</th><th>Artikulli</th><th>Fermeri</th><th>Origjina</th><th>Krijuar kg</th><th>Konsumuar kg</th><th>Gjendje kg</th><th>Status</th><th>Veprime</th></tr></thead><tbody>' + htmlRows + '</tbody></table></div>' + (htmlRows ? '' : '<p class="empty-report">Nuk ka lote. Shtyp “+ Lot i Ri” ose krijo testin demonstrues.</p>') + '</div>';
  };

  App.view_traceProcesses = function () {
    var rows = (this.data.processBatches || []).slice().sort(function (a, b) { return new Date(b.date || 0) - new Date(a.date || 0); });
    var htmlRows = rows.map(function (x) { var p = byId(App.data.products, x.outputProductId) || {}, actions = [{ icon: '👁', label: 'Shiko', action: "App.openProcessBatch('" + x.id + "')" }]; if (x.status === 'DRAFT') { actions.push({ icon: '✏️', label: 'Edito Draft', action: "App.editProcessBatch('" + x.id + "')" }); actions.push({ icon: '✓', label: 'Posto Urdhrin', action: "App.postProcessBatch('" + x.id + "')" }); actions.push({ icon: '🗑️', label: 'Fshi Draft', danger: true, action: "App.deleteProcessDraft('" + x.id + "')" }); } else if (x.status === 'POSTED') actions.push({ icon: '✕', label: 'Anullo', danger: true, action: "App.cancelProcessBatch('" + x.id + "')" }); actions.push({ icon: '🖨', label: 'Print', action: "App.printProcessOdoo('" + x.id + "')" }); actions.push({ icon: '📄', label: 'PDF', action: "App.exportProcessOdooPDF('" + x.id + "')" }); actions.push({ icon: '📊', label: 'Excel', action: "App.exportProcessOdooExcel('" + x.id + "')" }); return '<tr data-batch-id="' + attr(x.id) + '" ondblclick="App.openProcessBatch(\'' + x.id + '\')"><td><button class="sg-eye-btn" onclick="App.openProcessBatch(\'' + x.id + '\')">👁</button></td><td><strong>' + esc(x.batchNumber) + '</strong></td><td>' + App.fmtDate(x.date) + '</td><td>' + esc(x.processType || '—') + '</td><td>' + esc(p.name || x.outputProductName || '—') + '</td><td class="text-right">' + App.fmtKg(x.inputQuantity) + '</td><td class="text-right">' + App.fmtKg(x.outputQuantity) + '</td><td class="text-right">' + App.fmt(x.yieldPct) + '%</td><td><span class="status-badge status-' + esc(x.status) + '">' + esc(statusLabel(x.status)) + '</span></td><td onclick="event.stopPropagation()">' + App.rowActionMenu(actions) + '</td></tr>'; }).join('');
    document.getElementById('content').innerHTML = '<div class="sg-odoo-control-panel"><div><h3>Urdhrat e Punës</h3><p>Pastrim, tharje, prerje, përzierje dhe paketim me konsum real të loteve.</p></div><div class="sg-odoo-actions"><button id="sg-new-work-order-btn" class="btn btn-primary" onclick="App.editProcessBatch()">+ Urdhër Pune</button></div></div><div class="card"><div class="card-title"><span>⚙️ Urdhra Pune / Procese</span></div><div class="report-table-wrap"><table><thead><tr><th></th><th>Urdhri</th><th>Data</th><th>Procesi</th><th>Produkti final</th><th>Hyrje kg</th><th>Dalje kg</th><th>Rendiment</th><th>Status</th><th>Veprime</th></tr></thead><tbody>' + htmlRows + '</tbody></table></div>' + (htmlRows ? '' : '<p class="empty-report">Nuk ka urdhra pune. Shtyp “+ Urdhër Pune”.</p>') + '</div>';
  };

  App.openProcessBatch = function (id) { var x = byId(this.data.processBatches, id); if (!x) return; var ins = this.data.processBatchInputs.filter(function (y) { return y.batchId === id; }), rows = ins.map(function (y) { return '<tr><td><button class="btn btn-outline btn-sm" onclick="App.closeModal();App.openLotOdoo(\'' + y.lotId + '\')">👁 ' + esc(y.lotNumber) + '</button></td><td>' + esc(y.productName || '') + '</td><td class="text-right">' + App.fmtKg(y.quantity) + ' kg</td></tr>'; }).join(''); var body = '<div class="sg-odoo-record-header"><div><span class="sg-record-kicker">MANUFACTURING ORDER</span><h2>' + esc(x.batchNumber) + '</h2><p>' + esc(x.processType || '') + '</p></div><span class="status-badge status-' + esc(x.status) + '">' + esc(statusLabel(x.status)) + '</span></div><div class="sg-odoo-kpis"><div><span>Hyrje</span><strong>' + App.fmtKg(x.inputQuantity) + ' kg</strong></div><div><span>Dalje</span><strong>' + App.fmtKg(x.outputQuantity) + ' kg</strong></div><div><span>Humbje</span><strong>' + App.fmtKg(x.processLossQuantity) + ' kg</strong></div><div><span>Rendiment</span><strong>' + App.fmt(x.yieldPct) + '%</strong></div></div><div class="sg-odoo-section"><h4>Lotet hyrëse</h4><table><thead><tr><th>Loti</th><th>Artikulli</th><th>Sasia</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="sg-odoo-section"><h4>Shënime</h4><p>' + esc(x.notes || '—') + '</p></div>'; var footer = '<button class="btn btn-outline" onclick="App.printProcessOdoo(\'' + id + '\')">🖨 Print</button><button class="btn btn-red" onclick="App.exportProcessOdooPDF(\'' + id + '\')">PDF</button><button class="btn btn-green" onclick="App.exportProcessOdooExcel(\'' + id + '\')">Excel</button>' + (x.status === 'DRAFT' ? '<button class="btn btn-blue" onclick="App.closeModal();App.editProcessBatch(\'' + id + '\')">✏ Edito</button><button class="btn btn-primary" onclick="App.closeModal();App.postProcessBatch(\'' + id + '\')">✓ Posto</button>' : '') + '<button class="btn btn-outline" onclick="App.closeModal()">Mbyll</button>'; this.modal('👁 Urdhër Pune', body, footer); };

  App.SGOdooTrace = { saveManualLot: saveManualLot, confirmManualLot: confirmManualLot, deleteManualLot: deleteManualLot, createDemoScenario: createDemoScenario, DEMO: DEMO };
})(window);
