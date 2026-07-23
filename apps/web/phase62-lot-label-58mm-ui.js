/* SG_PHASE62_LOT_LABEL_58MM_UI_START — Sistemi Genit */
(function (global) {
  'use strict';
  var App = global.App;
  var Cloud = global.CloudERP;
  if (!App || !Cloud || !Cloud.apiUrl || Cloud.offlineTestMode || global.__SG_PHASE62_LOT_LABEL_58MM_UI__) return;
  global.__SG_PHASE62_LOT_LABEL_58MM_UI__ = true;

  var currentLabel = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function camel(row) {
    var out = {};
    Object.keys(row || {}).forEach(function (key) {
      out[key.replace(/_([a-z])/g, function (_m, c) { return c.toUpperCase(); })] = row[key];
    });
    return out;
  }
  function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function qty(value) {
    var n = num(value);
    return Number.isInteger(n) ? String(n) : n.toLocaleString('sq-AL', { maximumFractionDigits: 3 });
  }
  function dateSq(value) {
    if (!value) return '';
    var source = String(value).slice(0, 10).split('-');
    return source.length === 3 ? source[2] + '-' + source[1] + '-' + source[0] : String(value);
  }
  function company() {
    return App.company || { name: 'Sistemi Genit', nipt: '' };
  }
  function normalizeUnit(value) {
    var unit = String(value || 'thasë').trim();
    return unit || 'thasë';
  }

  async function loadLabel(lotId) {
    var response = await Cloud.request('/api/trace/lots/' + encodeURIComponent(lotId) + '/360');
    var lot = camel(response.lot || {});
    var supplierCode = lot.supplierCode || lot.farmCode || 'FURN';
    var productName = lot.productName || 'Artikull';
    var packageCount = num(lot.packagingCount || lot.bagsCount);
    var packageUnit = normalizeUnit(lot.packagingUnit);
    var netWeight = num(lot.quantityCreated || lot.acceptedWeight || lot.quantityAvailable);
    return {
      id: lot.id || lotId,
      companyId: lot.companyId || (company().id || null),
      supplierCode: supplierCode,
      supplierName: lot.supplierName || '',
      productName: productName,
      packageCount: packageCount,
      packageUnit: packageUnit,
      netWeight: netWeight,
      lotNumber: lot.lotNumber || '',
      salesLotNumber: lot.salesLotNumber || '',
      productionDate: lot.productionDate || lot.receiptDocumentDate || lot.weightDocumentDate || '',
      documentNo: lot.receiptDocumentNo || lot.weightDocumentNo || '',
      labelText: lot.displayLabel || (supplierCode + '-' + productName + '-' + qty(packageCount) + ' ' + packageUnit + '-' + qty(netWeight) + ' peshë neto')
    };
  }

  function labelHtml(data) {
    var c = company();
    return '<section class="sg62-label58" data-entity-id="' + esc(data.id) + '" data-document-no="' + esc(data.lotNumber) + '">' +
      '<header class="sg62-label58-company"><strong>' + esc(c.name || 'Sistemi Genit') + '</strong>' +
      (c.nipt ? '<small>NIPT: ' + esc(c.nipt) + '</small>' : '') + '</header>' +
      '<div class="sg62-label58-title">ETIKETË LOTI</div>' +
      '<div class="sg62-label58-product"><span>' + esc(data.supplierCode) + '</span><strong>' + esc(data.productName) + '</strong></div>' +
      '<div class="sg62-label58-metrics">' +
        '<div><small>AMB</small><strong>' + esc(qty(data.packageCount)) + '</strong><span>' + esc(data.packageUnit) + '</span></div>' +
        '<div><small>PESHË NETO</small><strong>' + esc(qty(data.netWeight)) + '</strong><span>kg</span></div>' +
      '</div>' +
      '<div class="sg62-label58-lot"><small>LOTI</small><strong>' + esc(data.salesLotNumber || data.lotNumber) + '</strong></div>' +
      (data.productionDate ? '<div class="sg62-label58-date">Data: ' + esc(dateSq(data.productionDate)) + '</div>' : '') +
      '<div class="sg62-label58-readable">' + esc(data.labelText) + '</div>' +
      '<footer>Gjurmueshmëri · Sistemi Genit</footer>' +
    '</section>';
  }

  function labelCss() {
    return '@page{size:58mm auto;margin:2mm}' +
      '*{box-sizing:border-box}' +
      'html,body{width:58mm;margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}' +
      '.sg62-label58{width:54mm;min-height:62mm;margin:0 auto;padding:1.8mm;border:0.45mm solid #000;background:#fff;overflow:hidden}' +
      '.sg62-label58-company{text-align:center;border-bottom:0.35mm solid #000;padding-bottom:1.2mm;display:block}' +
      '.sg62-label58-company strong{display:block;font-size:10pt;line-height:1.15}' +
      '.sg62-label58-company small{display:block;font-size:6.5pt;margin-top:.5mm}' +
      '.sg62-label58-title{text-align:center;font-weight:900;font-size:12pt;letter-spacing:.5mm;padding:1.4mm 0;border-bottom:0.35mm solid #000}' +
      '.sg62-label58-product{display:flex;align-items:center;justify-content:center;gap:1.5mm;padding:1.7mm 0;border-bottom:0.35mm solid #000;text-transform:uppercase}' +
      '.sg62-label58-product span{font-size:14pt;font-weight:900;border:0.35mm solid #000;padding:.7mm 1.2mm}' +
      '.sg62-label58-product strong{font-size:14pt;line-height:1.05;text-align:center;overflow-wrap:anywhere}' +
      '.sg62-label58-metrics{display:grid;grid-template-columns:1fr 1fr;border-bottom:0.35mm solid #000}' +
      '.sg62-label58-metrics>div{padding:1.6mm .8mm;text-align:center;min-height:17mm}' +
      '.sg62-label58-metrics>div+div{border-left:0.35mm solid #000}' +
      '.sg62-label58-metrics small{display:block;font-size:8pt;font-weight:900;letter-spacing:.25mm}' +
      '.sg62-label58-metrics strong{display:inline-block;font-size:22pt;line-height:1;margin-top:1mm}' +
      '.sg62-label58-metrics span{display:block;font-size:8pt;font-weight:700;margin-top:.5mm;text-transform:uppercase}' +
      '.sg62-label58-lot{padding:1.4mm 0;text-align:center;border-bottom:0.35mm solid #000}' +
      '.sg62-label58-lot small{display:block;font-size:7pt;font-weight:900}' +
      '.sg62-label58-lot strong{display:block;font-size:8pt;line-height:1.2;overflow-wrap:anywhere}' +
      '.sg62-label58-date{text-align:center;font-size:7pt;font-weight:700;padding:1mm 0 0}' +
      '.sg62-label58-readable{text-align:center;font-size:6.5pt;line-height:1.2;padding:1mm 0;overflow-wrap:anywhere}' +
      '.sg62-label58 footer{text-align:center;font-size:6pt;border-top:0.25mm solid #000;padding-top:.8mm}' +
      '@media print{button{display:none!important}.sg62-label58{break-inside:avoid}}';
  }

  function previewCss() {
    return '<style id="sg62-label58-style">' +
      '.sg62-label58-preview{display:flex;justify-content:center;align-items:flex-start;padding:18px;background:#eef1f4;overflow:auto}' +
      '.sg62-label58-preview .sg62-label58{width:58mm;min-height:62mm;padding:2mm;border:2px solid #111;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.18)}' +
      '.sg62-label58-preview .sg62-label58-company{text-align:center;border-bottom:2px solid #000;padding-bottom:5px;display:block}' +
      '.sg62-label58-preview .sg62-label58-company strong{display:block;font-size:15px}.sg62-label58-preview .sg62-label58-company small{display:block;font-size:10px}' +
      '.sg62-label58-preview .sg62-label58-title{text-align:center;font-weight:900;font-size:17px;letter-spacing:1px;padding:6px 0;border-bottom:2px solid #000}' +
      '.sg62-label58-preview .sg62-label58-product{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 0;border-bottom:2px solid #000;text-transform:uppercase}' +
      '.sg62-label58-preview .sg62-label58-product span{font-size:20px;font-weight:900;border:2px solid #000;padding:3px 5px}.sg62-label58-preview .sg62-label58-product strong{font-size:20px;text-align:center;overflow-wrap:anywhere}' +
      '.sg62-label58-preview .sg62-label58-metrics{display:grid;grid-template-columns:1fr 1fr;border-bottom:2px solid #000}' +
      '.sg62-label58-preview .sg62-label58-metrics>div{padding:8px 4px;text-align:center;min-height:67px}.sg62-label58-preview .sg62-label58-metrics>div+div{border-left:2px solid #000}' +
      '.sg62-label58-preview .sg62-label58-metrics small{display:block;font-size:12px;font-weight:900}.sg62-label58-preview .sg62-label58-metrics strong{display:inline-block;font-size:30px;line-height:1;margin-top:5px}.sg62-label58-preview .sg62-label58-metrics span{display:block;font-size:11px;font-weight:700;text-transform:uppercase}' +
      '.sg62-label58-preview .sg62-label58-lot{text-align:center;padding:6px 0;border-bottom:2px solid #000}.sg62-label58-preview .sg62-label58-lot small{display:block;font-size:10px;font-weight:900}.sg62-label58-preview .sg62-label58-lot strong{display:block;font-size:11px;overflow-wrap:anywhere}' +
      '.sg62-label58-preview .sg62-label58-date,.sg62-label58-preview .sg62-label58-readable{text-align:center;font-size:10px;padding-top:4px;overflow-wrap:anywhere}.sg62-label58-preview .sg62-label58 footer{text-align:center;font-size:9px;border-top:1px solid #000;margin-top:4px;padding-top:3px}' +
      '.sg62-label58-button{margin-left:4px;min-width:34px}' +
      '</style>';
  }

  function ensurePreviewStyle() {
    if (!document.getElementById('sg62-label58-style')) document.head.insertAdjacentHTML('beforeend', previewCss());
  }

  App.openLotLabel58 = async function (lotId) {
    try {
      currentLabel = await loadLabel(lotId);
      ensurePreviewStyle();
      var footer = '<button class="btn btn-outline" data-entity-id="' + esc(currentLabel.id) + '" data-document-no="' + esc(currentLabel.lotNumber) + '" onclick="App.printLotLabel58()">🖨 Print 58 mm</button>' +
        '<button class="btn btn-outline" data-entity-id="' + esc(currentLabel.id) + '" data-document-no="' + esc(currentLabel.lotNumber) + '" onclick="App.pdfLotLabel58()">📄 PDF 58 mm</button>' +
        '<button class="btn btn-primary" onclick="App.closeModal()">Mbyll</button>';
      this.modal('Etiketa e Lotit · 58 mm', '<div class="sg62-label58-preview">' + labelHtml(currentLabel) + '</div>', footer);
      if (Cloud.auditEvent) void Cloud.auditEvent('PREVIEW', { companyId:currentLabel.companyId,entityType:'trace_lot',entityId:currentLabel.id,documentNo:currentLabel.lotNumber,sourceView:'lotLabel58',metadata:{paperWidthMm:58} }).catch(function(){});
    } catch (error) { this.toast(error.message || String(error), 'error'); }
  };

  App.printLotLabel58 = function () {
    if (!currentLabel) return this.toast('Etiketa nuk është hapur.', 'error');
    var win = global.open('', '_blank', 'width=420,height=720');
    if (!win) return this.toast('Shfletuesi bllokoi dritaren e printimit.', 'error');
    win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(currentLabel.lotNumber) + '</title><style>' + labelCss() + '</style></head><body>' + labelHtml(currentLabel) + '<script>window.onload=function(){window.print();};<\/script></body></html>');
    win.document.close();
    if (Cloud.auditEvent) void Cloud.auditEvent('PRINT', { companyId:currentLabel.companyId,entityType:'trace_lot',entityId:currentLabel.id,documentNo:currentLabel.lotNumber,sourceView:'lotLabel58',metadata:{paperWidthMm:58,packageCount:currentLabel.packageCount,packageUnit:currentLabel.packageUnit,netWeight:currentLabel.netWeight} }).catch(function(){});
  };

  App.pdfLotLabel58 = function () {
    if (!currentLabel) return this.toast('Etiketa nuk është hapur.', 'error');
    if (!global.jspdf || !global.jspdf.jsPDF) return this.toast('PDF nuk është i disponueshëm. Përdorni Print → Ruaj si PDF.', 'error');
    var doc = new global.jspdf.jsPDF({ orientation:'portrait', unit:'mm', format:[58,72] });
    var center = 29;
    doc.setLineWidth(.35);
    doc.rect(2,2,54,68);
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text(String(company().name || 'Sistemi Genit'),center,6,{align:'center'});
    if (company().nipt) { doc.setFont('helvetica','normal'); doc.setFontSize(6); doc.text('NIPT: ' + String(company().nipt),center,9,{align:'center'}); }
    doc.line(2,11,56,11); doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text('ETIKETE LOTI',center,16,{align:'center'});
    doc.line(2,18,56,18); doc.setFontSize(14); doc.text(String(currentLabel.supplierCode),10,24,{align:'center'}); doc.text(String(currentLabel.productName).slice(0,24),34,24,{align:'center'});
    doc.line(2,27,56,27); doc.line(29,27,29,46);
    doc.setFontSize(8); doc.text('AMB',15.5,31,{align:'center'}); doc.text('PESHE NETO',42.5,31,{align:'center'});
    doc.setFontSize(21); doc.text(qty(currentLabel.packageCount),15.5,40,{align:'center'}); doc.text(qty(currentLabel.netWeight),42.5,40,{align:'center'});
    doc.setFontSize(7); doc.text(String(currentLabel.packageUnit).toUpperCase(),15.5,44,{align:'center'}); doc.text('KG',42.5,44,{align:'center'});
    doc.line(2,46,56,46); doc.setFontSize(7); doc.text('LOTI',center,50,{align:'center'});
    doc.setFontSize(6.5); var lotLines = doc.splitTextToSize(String(currentLabel.salesLotNumber || currentLabel.lotNumber),50); doc.text(lotLines,center,54,{align:'center'});
    var y = 54 + lotLines.length * 3;
    if (currentLabel.productionDate) { doc.setFontSize(6); doc.text('Data: ' + dateSq(currentLabel.productionDate),center,y,{align:'center'}); y += 3; }
    doc.setFontSize(5.5); var readable = doc.splitTextToSize(String(currentLabel.labelText),50); doc.text(readable,center,Math.min(y,66),{align:'center'});
    doc.save('Etiketa_' + String(currentLabel.lotNumber || currentLabel.id).replace(/[^a-z0-9_-]+/gi,'_') + '_58mm.pdf');
    if (Cloud.auditEvent) void Cloud.auditEvent('PDF', { companyId:currentLabel.companyId,entityType:'trace_lot',entityId:currentLabel.id,documentNo:currentLabel.lotNumber,sourceView:'lotLabel58',metadata:{paperWidthMm:58} }).catch(function(){});
  };

  function addLabelButtons() {
    var rows = document.querySelectorAll('#content table tbody tr');
    var lots = (App.data && App.data.lots || []).slice().sort(function (a,b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
    rows.forEach(function (row, index) {
      if (row.querySelector('.sg62-label58-button')) return;
      var lot = lots[index];
      if (!lot || !lot.id) return;
      var firstCell = row.querySelector('td');
      if (!firstCell) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'sg-eye-btn sg62-label58-button';
      button.title = 'Etiketa e lotit 58 mm';
      button.setAttribute('aria-label','Etiketa e lotit 58 mm');
      button.dataset.entityId = lot.id;
      button.dataset.documentNo = lot.lotNumber || '';
      button.innerHTML = '🏷️';
      button.onclick = function (event) { event.stopPropagation(); App.openLotLabel58(lot.id); };
      firstCell.appendChild(button);
    });
  }

  var baseViewTraceLots = App.view_traceLots;
  if (typeof baseViewTraceLots === 'function') {
    App.view_traceLots = async function () {
      var result = await baseViewTraceLots.apply(this, arguments);
      ensurePreviewStyle();
      setTimeout(addLabelButtons, 0);
      return result;
    };
  }

  var observer = new MutationObserver(function () {
    if (App.currentView === 'traceLots') addLabelButtons();
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
})(window);
/* SG_PHASE62_LOT_LABEL_58MM_UI_END */
