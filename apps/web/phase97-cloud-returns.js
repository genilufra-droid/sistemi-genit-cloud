/* SG_PHASE97_CLOUD_RETURNS_START — real, partial supplier-return workflow */
(function (global) {
  'use strict';
  function install() {
    if (global.__SG_PHASE97_CLOUD_RETURNS__) return true;

    var App = global.App;
    var Cloud = global.CloudERP;
    // The cloud adapter may load after this self-contained script. Mark the
    // workflow installed only after its real API bridge is available.
    if (Cloud && Cloud.offlineTestMode) return true;
    if (!App || !Cloud || !Cloud.apiUrl || typeof Cloud.request !== 'function') return false;
    global.__SG_PHASE97_CLOUD_RETURNS__ = true;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function num(value) { var n = Number(value || 0); return Number.isFinite(n) ? n : 0; }
  function qty(value) { return num(value).toLocaleString('sq-AL', { maximumFractionDigits: 3 }); }
  function money(value) { return num(value).toLocaleString('sq-AL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function date(value) { var parts = String(value || '').slice(0,10).split('-'); return parts.length === 3 ? parts[2]+'/'+parts[1]+'/'+parts[0] : String(value || ''); }
  function camel(row) {
    var out = {};
    Object.keys(row || {}).forEach(function (key) {
      out[key.replace(/_([a-z])/g, function (_match, letter) { return letter.toUpperCase(); })] = row[key];
    });
    return out;
  }
  function documentNo(doc) { return doc && (doc.documentNo || doc.docNumber || doc.document_no || ''); }
  function status(doc) { return String(doc && doc.status || '').toUpperCase(); }
  function returnedFor(sourceId, productId, field) {
    return (App.data.purchaseReturns || []).filter(function (doc) {
      return doc && doc.docType === 'PURCHASE_RETURN' && doc.sourceDocumentId === sourceId && status(doc) !== 'CANCELLED';
    }).reduce(function (total, doc) {
      return total + (doc.lines || doc.items || []).filter(function (line) {
        return line && line.productId === productId;
      }).reduce(function (lineTotal, line) {
        return lineTotal + num(line[field]);
      }, 0);
    }, 0);
  }
  function remainingFor(source, item) {
    var usedQty = returnedFor(source.id, item.productId, 'quantity');
    var usedFree = returnedFor(source.id, item.productId, 'freeQuantity');
    if (!usedFree) usedFree = returnedFor(source.id, item.productId, 'freeQty');
    return {
      quantity: Math.max(0, num(item.quantity) - usedQty),
      freeQuantity: Math.max(0, num(item.freeQuantity != null ? item.freeQuantity : item.freeQty) - usedFree)
    };
  }
  function closeReturnModal() {
    var node = document.getElementById('sg97-return-modal');
    if (node) node.remove();
    App._sg97ReturnSource = null;
  }
  async function refreshDataWithoutNavigation() {
    var activeView = App.currentView;
    App.currentView = '';
    try { await Cloud.refresh(); } finally { App.currentView = activeView; }
  }
  function showReturnModal(source) {
    var existing = document.getElementById('sg97-return-modal');
    if (existing) existing.remove();
    var sourceItems = source.items || source.lines || [];
    var rows = sourceItems.map(function (item, index) {
      var available = remainingFor(source, item);
      return '<tr data-source-item="'+esc(item.id)+'">'
        +'<td>'+esc(item.description || item.productName || '')+'</td>'
        +'<td>'+esc(item.unit || 'copë')+'</td>'
        +'<td class="text-right">'+qty(available.quantity)+'</td>'
        +'<td class="text-right">'+qty(available.freeQuantity)+'</td>'
        +'<td><input id="sg97-ret-q-'+index+'" type="number" min="0" max="'+esc(available.quantity)+'" step="0.001" value="0" aria-label="Sasia për kthim"></td>'
        +'<td><input id="sg97-ret-f-'+index+'" type="number" min="0" max="'+esc(available.freeQuantity)+'" step="0.001" value="0" aria-label="Sasia dhuratë për kthim"></td>'
        +'</tr>';
    }).join('');
    var modal = document.createElement('div');
    modal.id = 'sg97-return-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="sg97-return-title" style="max-width:950px">'
      +'<div class="modal-header"><h3 id="sg97-return-title">Kthim te Furnitori · '+esc(documentNo(source))+'</h3><button type="button" class="modal-close" aria-label="Mbyll" onclick="App.sg97CloseSupplierReturn()">×</button></div>'
      +'<div class="modal-content"><p>Zgjidhni vetëm sasinë që kthehet. Serveri kontrollon sasinë e mbetur dhe poston automatikisht lëvizjen e kundërt të stokut.</p>'
      +'<div class="table-wrap"><table><thead><tr><th>Artikulli</th><th>Njësia</th><th>Në dispozicion</th><th>Dhuratë në dispozicion</th><th>Kthehet</th><th>Dhuratë</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
      +'<p class="muted">Pranimi: '+esc(documentNo(source))+' · Data: '+esc(date(source.documentDate || source.date))+'</p></div>'
      +'<div class="modal-footer"><button type="button" class="btn btn-outline" onclick="App.sg97CloseSupplierReturn()">Anullo</button><button type="button" class="btn btn-red" onclick="App.sg97SubmitSupplierReturn()">↩ Posto kthimin</button></div></div>';
    document.body.appendChild(modal);
  }

  App.sg97CloseSupplierReturn = closeReturnModal;
  App.sg97CreateSupplierReturn = async function (sourceId) {
    try {
      var source = camel(await Cloud.request('/api/documents/'+encodeURIComponent(sourceId)));
      source.items = (source.items || []).map(camel);
      if (source.docType !== 'PURCHASE_RECEIPT') throw new Error('Kthimi krijohet vetëm nga një pranim blerjeje.');
      if (status(source) !== 'CONFIRMED' && status(source) !== 'POSTED') throw new Error('Pranimi duhet të jetë i postuar para kthimit.');
      if (!(source.items || []).some(function (item) {
        var available = remainingFor(source, item);
        return available.quantity > 0 || available.freeQuantity > 0;
      })) throw new Error('Nuk ka sasi të mbetur për kthim në këtë pranim.');
      this._sg97ReturnSource = source;
      showReturnModal(source);
    } catch (error) {
      this.toast(error.message || String(error), 'error');
    }
  };
  App.sg97SubmitSupplierReturn = async function () {
    var source = this._sg97ReturnSource;
    if (!source) return;
    try {
      var returnItems = (source.items || []).map(function (item, index) {
        return {
          sourceItemId: item.id,
          quantity: num((document.getElementById('sg97-ret-q-'+index) || {}).value),
          freeQuantity: num((document.getElementById('sg97-ret-f-'+index) || {}).value)
        };
      }).filter(function (line) { return line.quantity > 0 || line.freeQuantity > 0; });
      if (!returnItems.length) throw new Error('Vendosni të paktën një sasi për kthim.');
      var created = camel(await Cloud.request('/api/documents/'+encodeURIComponent(source.id)+'/convert', {
        method: 'POST', body: { targetType: 'PURCHASE_RETURN', returnItems: returnItems }
      }));
      closeReturnModal();
      await refreshDataWithoutNavigation();
      this.toast('Kthimi u postua: '+documentNo(created));
      if (created.id && typeof this.sg96OpenDocument === 'function') this.sg96OpenDocument(created.id, 'business_document');
      else this.navigate('purchaseReturns');
    } catch (error) {
      this.toast(error.message || String(error), 'error');
    }
  };
  function findReturn(id) {
    return (App.data.supplierReturns || []).concat(App.data.purchaseReturns || []).find(function (doc) {
      return doc && String(doc.id) === String(id);
    }) || null;
  }
  App.sg97NewFinancialSupplierReturn = function () {
    if (typeof this.sg98NewSupplierReturn === 'function') return this.sg98NewSupplierReturn();
    this.toast('Kthimi financiar nuk është ngarkuar ende. Rifreskoni faqen dhe provoni përsëri.', 'error');
  };
  App.sg97OpenSupplierReturn = function (id) {
    var doc = findReturn(id);
    if (doc && doc.docType === 'SUPPLIER_RETURN' && typeof this.sg98OpenSupplierReturn === 'function') {
      return this.sg98OpenSupplierReturn(id);
    }
    if (id && typeof this.sg96OpenDocument === 'function') return this.sg96OpenDocument(id, 'business_document');
  };
  App.sg97ReturnAction = function (id, action) {
    if (id && typeof this.sg96OpenDocumentAction === 'function') return this.sg96OpenDocumentAction(id, 'business_document', action);
  };
  App.sg97CancelSupplierReturn = async function (id, docType) {
    try {
      if (docType === 'SUPPLIER_RETURN' && typeof this.sg98CancelSupplierReturn === 'function') {
        return this.sg98CancelSupplierReturn(id);
      }
      if (!global.confirm('Anulimi do ta rikthejë sasinë në magazinë. Vazhdoni?')) return;
      var route = docType === 'SUPPLIER_RETURN'
        ? '/api/supplier-returns/'+encodeURIComponent(id)+'/cancel'
        : '/api/documents/'+encodeURIComponent(id)+'/cancel';
      await Cloud.request(route, { method: 'POST' });
      await refreshDataWithoutNavigation();
      this.toast('Kthimi u anulua dhe stoku u rikthye.');
      this.navigate('purchaseReturns');
    } catch (error) {
      this.toast(error.message || String(error), 'error');
    }
  };
  App.view_purchaseReturns = async function () {
    await refreshDataWithoutNavigation();
    var rows = (this.data.purchaseReturns || []).concat(this.data.supplierReturns || []).slice().sort(function (a, b) {
      return String(b.documentDate || b.date || b.createdAt || '').localeCompare(String(a.documentDate || a.date || a.createdAt || ''));
    });
    var body = rows.map(function (doc) {
      var docStatus = status(doc);
      var financial = doc.docType === 'SUPPLIER_RETURN';
      var returnKind = financial
        ? '<span class="status confirmed">FINANCIAR · STOK + DETYRIM</span>'
        : '<span class="status draft">NGA PRANIMI · VETËM STOK</span>';
      var actions = '<button type="button" class="btn btn-outline btn-sm" onclick="App.sg97OpenSupplierReturn(\''+esc(doc.id)+'\')">Hap</button>'
        +'<button type="button" class="btn btn-outline btn-sm" onclick="App.sg97ReturnAction(\''+esc(doc.id)+'\',\'print\')">Print</button>'
        +'<button type="button" class="btn btn-outline btn-sm" onclick="App.sg97ReturnAction(\''+esc(doc.id)+'\',\'pdf\')">PDF</button>'
        +'<button type="button" class="btn btn-outline btn-sm" onclick="App.sg97ReturnAction(\''+esc(doc.id)+'\',\'excel\')">Excel</button>';
      if (docStatus !== 'CANCELLED') actions += '<button type="button" class="btn btn-red btn-sm" onclick="App.sg97CancelSupplierReturn(\''+esc(doc.id)+'\',\''+esc(doc.docType)+'\')">Anullo</button>';
      return '<tr><td>'+esc(documentNo(doc))+'</td><td>'+returnKind+'</td><td>'+esc(date(doc.documentDate || doc.date))+'</td><td>'+esc(doc.partnerName || doc.supplierName || '—')+'</td><td>'+money(doc.totalAmount || doc.total || 0)+' ALL</td><td><span class="status '+esc(docStatus.toLowerCase())+'">'+esc(docStatus === 'CONFIRMED' ? 'POSTUAR' : docStatus)+'</span></td><td>'+actions+'</td></tr>';
    }).join('');
    var content = document.getElementById('content');
    if (!content) return;
    var title = document.getElementById('page-title');
    if (title) title.textContent = 'Kthime te Furnitori';
    content.innerHTML = '<div class="card"><div class="card-title"><div><h3>Kthime te Furnitori</h3><p class="muted">Kthim nga faturë ul stokun dhe detyrimin. Kthimi nga pranimi prek vetëm stokun.</p></div><div class="card-title-actions"><button type="button" class="btn btn-primary btn-sm" onclick="App.sg97NewFinancialSupplierReturn()">+ Kthim nga Fatura</button></div></div><div class="table-wrap"><table><thead><tr><th>Nr. dokumenti</th><th>Lloji</th><th>Data</th><th>Furnitori</th><th>Totali</th><th>Statusi</th><th>Veprime</th></tr></thead><tbody>'+ (body || '<tr><td colspan="7" class="muted">Nuk ka kthime të regjistruara.</td></tr>') +'</tbody></table></div></div>';
  };

  var previousList = typeof App._viewOdooList === 'function' ? App._viewOdooList : null;
  App._viewOdooList = async function (type) {
    var result = previousList ? await previousList.apply(this, arguments) : null;
    if (type !== 'purchaseReceipt') return result;
    var receipts = this.data.purchaseReceipts || [];
    document.querySelectorAll('#odoo-list-table tbody tr').forEach(function (row, index) {
      if (row.querySelector('[data-sg97-return]')) return;
      var text = String(row.textContent || '');
      var receipt = receipts.find(function (doc) { return documentNo(doc) && text.indexOf(documentNo(doc)) >= 0; }) || receipts[index];
      if (!receipt || status(receipt) === 'CANCELLED') return;
      var hasRemaining = (receipt.lines || receipt.items || []).some(function (item) {
        var available = remainingFor(receipt, item);
        return available.quantity > 0 || available.freeQuantity > 0;
      });
      if (!hasRemaining) return;
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'btn btn-red btn-sm'; button.dataset.sg97Return = '1';
      button.textContent = '↩ Kthim stoku';
      button.addEventListener('click', function (event) {
        event.preventDefault(); event.stopPropagation(); App.sg97CreateSupplierReturn(receipt.id);
      });
      var cell = row.lastElementChild || row;
      cell.appendChild(button);
    });
    return result;
  };
  global.SGPhase97 = { createSupplierReturn: App.sg97CreateSupplierReturn, submitSupplierReturn: App.sg97SubmitSupplierReturn };
    return true;
  }

  function boot() {
    if (!install()) global.setTimeout(boot, 250);
  }
  boot();
})(window);
/* SG_PHASE97_CLOUD_RETURNS_END */
