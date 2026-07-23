/* Sistemi Genit Cloud — Faza 6.1 UI profesionale Odoo */
(function (global) {
  'use strict';
  var App = global.App;
  if (!App || global.__SG_PHASE61_PROFESSIONAL_UI__) return;
  global.__SG_PHASE61_PROFESSIONAL_UI__ = true;

  var previewState = { tableId: '', title: '', html: '', kind: 'report', recordId: '' };
  var searchableWords = ['furnitor', 'klient', 'artikull', 'produkt', 'magazin', 'llogari', 'mjet', 'shofer', 'itinerar', 'udhëtim', 'kategori'];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function norm(value) {
    return String(value == null ? '' : value).toLocaleLowerCase('sq-AL')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }
  function number(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function fmt(value) { return number(value).toLocaleString('sq-AL', { maximumFractionDigits: 2 }); }
  function money(value, currency) { return fmt(value) + ' ' + (currency || 'ALL'); }
  function todayLabel() { return new Date().toLocaleDateString('sq-AL'); }
  function company() { return App.company || { name: 'Sistemi Genit', nipt: '', address: '', city: '', phone: '', email: '' }; }
  function byId(rows, id) { return (rows || []).find(function (row) { return row.id === id; }); }

  function shouldSearch(select) {
    if (!select || select.dataset.sg61Search === 'done' || select.disabled) return false;
    var id = norm(select.id);
    var group = select.closest('.form-group');
    var label = group && group.querySelector('label');
    var text = norm((label && label.textContent) || '') + ' ' + id;
    var dynamic = searchableWords.some(function (word) { return text.indexOf(word) >= 0; });
    return dynamic && select.options.length > 1;
  }

  function closeCombos(except) {
    document.querySelectorAll('.sg61-combo.open').forEach(function (combo) {
      if (combo !== except) combo.classList.remove('open');
    });
  }

  function enhanceSelect(select) {
    if (!shouldSearch(select)) return;
    select.dataset.sg61Search = 'done';
    select.classList.add('sg61-native-select');

    var combo = document.createElement('div');
    combo.className = 'sg61-combo';
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'sg61-combo-input';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = select.options[0] ? select.options[0].textContent.replace(/^—|—$/g, '').trim() : 'Kërko...';
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sg61-combo-toggle';
    toggle.setAttribute('aria-label', 'Hap kërkimin');
    toggle.innerHTML = '&#9662;';
    var menu = document.createElement('div');
    menu.className = 'sg61-combo-menu';
    combo.appendChild(input); combo.appendChild(toggle); combo.appendChild(menu);
    select.insertAdjacentElement('afterend', combo);

    function selectedText() {
      var option = select.options[select.selectedIndex];
      return option && option.value ? option.textContent.trim() : '';
    }
    function apply(value, text) {
      select.value = value;
      input.value = value ? text : '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      combo.classList.remove('open');
    }
    function render(query) {
      var q = norm(query);
      var rows = Array.prototype.slice.call(select.options).filter(function (option) {
        return !q || norm(option.textContent).indexOf(q) >= 0;
      }).slice(0, 100);
      menu.innerHTML = rows.length ? rows.map(function (option) {
        var active = option.value === select.value ? ' active' : '';
        return '<button type="button" class="sg61-combo-option' + active + '" data-value="' + esc(option.value) + '">' +
          '<span>' + esc(option.textContent.trim()) + '</span>' + (active ? '<b>✓</b>' : '') + '</button>';
      }).join('') : '<div class="sg61-combo-empty">Nuk u gjet asnjë rezultat</div>';
      menu.querySelectorAll('.sg61-combo-option').forEach(function (button) {
        button.addEventListener('mousedown', function (event) {
          event.preventDefault();
          var value = button.dataset.value;
          var option = Array.prototype.slice.call(select.options).find(function (item) { return item.value === value; });
          apply(value, option ? option.textContent.trim() : '');
        });
      });
    }
    input.value = selectedText();
    input.addEventListener('focus', function () { closeCombos(combo); combo.classList.add('open'); render(input.value); input.select(); });
    input.addEventListener('input', function () { combo.classList.add('open'); render(input.value); });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { combo.classList.remove('open'); input.value = selectedText(); }
      if (event.key === 'Enter') {
        var first = menu.querySelector('.sg61-combo-option');
        if (first) { event.preventDefault(); first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }
      }
    });
    toggle.addEventListener('click', function () { closeCombos(combo); combo.classList.toggle('open'); render(combo.classList.contains('open') ? '' : input.value); if (combo.classList.contains('open')) input.focus(); });
    select.addEventListener('change', function () { input.value = selectedText(); });
  }

  function enhanceSelects(root) {
    (root || document).querySelectorAll('select').forEach(enhanceSelect);
  }

  function getExportMeta(toolbar) {
    var button = Array.prototype.slice.call(toolbar.querySelectorAll('button')).find(function (item) {
      return /App\.sg6Export\(/.test(item.getAttribute('onclick') || '');
    });
    if (!button) return null;
    var source = button.getAttribute('onclick') || '';
    var match = source.match(/App\.sg6Export\('([^']+)'\s*,\s*'([^']+)'/);
    return match ? { id: match[1], title: match[2] } : null;
  }

  function professionalizeToolbar(toolbar) {
    if (!toolbar || toolbar.dataset.sg61Toolbar === 'done') return;
    toolbar.dataset.sg61Toolbar = 'done';
    toolbar.classList.add('sg61-toolbar');
    var meta = getExportMeta(toolbar);
    if (!meta) return;
    toolbar.querySelectorAll('button').forEach(function (button) {
      if (/App\.sg6Export\(/.test(button.getAttribute('onclick') || '')) button.remove();
    });
    var preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'btn btn-outline sg61-preview-button';
    preview.innerHTML = '<span class="sg61-eye" aria-hidden="true">&#128065;</span><span>Pamje &amp; Eksport</span>';
    preview.addEventListener('click', function () { App.sg61OpenReportPreview(meta.id, meta.title); });
    toolbar.appendChild(preview);
  }

  function professionalizeTables(root) {
    (root || document).querySelectorAll('.sg6-toolbar').forEach(professionalizeToolbar);
    (root || document).querySelectorAll('.report-table-wrap table, .card table').forEach(function (table) { table.classList.add('sg61-data-table'); });
    (root || document).querySelectorAll('button').forEach(function (button) {
      if (norm(button.textContent) === 'shiko' && !button.dataset.sg61Eye) {
        button.dataset.sg61Eye = 'done';
        button.classList.add('sg61-icon-button');
        button.title = 'Shiko dokumentin';
        button.setAttribute('aria-label', 'Shiko dokumentin');
        button.innerHTML = '&#128065;';
      }
    });
  }

  function reportHtml(tableId, title) {
    var table = document.getElementById(tableId);
    if (!table) return '';
    var c = company();
    return '<section class="sg61-document sg61-report-document">' +
      '<header class="sg61-document-header"><div><h1>' + esc(c.name || 'Sistemi Genit') + '</h1><p>' + esc(c.nipt ? 'NIPT: ' + c.nipt : '') + '</p><p>' + esc([c.address, c.city].filter(Boolean).join(', ')) + '</p></div>' +
      '<div class="sg61-document-title"><small>RAPORT</small><h2>' + esc(title) + '</h2><p>Gjeneruar: ' + esc(todayLabel()) + '</p></div></header>' +
      '<div class="sg61-document-body">' + table.outerHTML + '</div>' +
      '<footer class="sg61-document-footer"><span>Sistemi Genit Cloud</span><span>' + esc(todayLabel()) + '</span></footer></section>';
  }

  function openDocumentModal(title, html, kind, recordId) {
    previewState = { title: title, html: html, kind: kind || 'report', recordId: recordId || '', tableId: previewState.tableId || '' };
    var footer = '<button class="btn btn-outline" onclick="App.sg61PrintCurrent()">Print</button>' +
      '<button class="btn btn-outline" onclick="App.sg61PdfCurrent()">PDF</button>' +
      (previewState.tableId ? '<button class="btn btn-outline" onclick="App.sg61ExcelCurrent()">Excel</button>' : '') +
      '<button class="btn btn-primary" onclick="App.closeModal()">Mbyll</button>';
    App.modal(title, '<div class="sg61-preview-shell">' + html + '</div>', footer);
    setTimeout(function () {
      var modal = document.querySelector('.modal-content');
      if (modal) modal.classList.add('sg61-preview-modal');
    }, 0);
  }

  App.sg61OpenReportPreview = function (tableId, title) {
    var html = reportHtml(tableId, title);
    if (!html) return this.toast('Raporti nuk u gjet.', 'error');
    previewState.tableId = tableId;
    openDocumentModal(title, html, 'report', '');
  };

  function printCss() {
    return '@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#1f2937;font-family:Arial,sans-serif}.sg61-document{max-width:277mm;margin:auto}.sg61-document-header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #714b67;padding:0 0 12px;margin-bottom:16px}.sg61-document-header h1,.sg61-document-header h2{margin:0}.sg61-document-title{text-align:right}.sg61-document-title small{color:#714b67;font-weight:700}.sg61-document p{margin:3px 0;font-size:11px}.sg61-document table{width:100%;border-collapse:collapse;font-size:9px}.sg61-document th{background:#f3eef2;color:#2d1f2a;border:1px solid #cfc4cc;padding:6px;text-align:left}.sg61-document td{border:1px solid #ddd;padding:5px}.sg61-document tbody tr:nth-child(even){background:#fafafa}.sg61-document-footer{display:flex;justify-content:space-between;border-top:1px solid #bbb;margin-top:15px;padding-top:8px;font-size:9px}.sg61-payment-grid{display:grid;grid-template-columns:1fr 280px;border:1px solid #222}.sg61-payment-grid>div{padding:9px;border-right:1px solid #222;border-bottom:1px solid #222}.sg61-signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:40px;text-align:center;margin-top:30px}.sg61-signatures div:after{content:"";display:block;border-bottom:1px solid #222;margin:35px 10px 0}.sg61-weight-table td,.sg61-weight-table th{text-align:right}.sg61-weight-table td:first-child,.sg61-weight-table th:first-child{text-align:center}' ;
  }

  App.sg61PrintCurrent = function () {
    var win = window.open('', '_blank');
    if (!win) return this.toast('Shfletuesi bllokoi dritaren e printimit.', 'error');
    win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(previewState.title) + '</title><style>' + printCss() + '</style></head><body>' + previewState.html + '<script>window.onload=function(){window.print();};<\/script></body></html>');
    win.document.close();
  };

  App.sg61PdfCurrent = function () {
    if (!global.jspdf || !global.jspdf.jsPDF) {
      this.toast('PDF nuk është i disponueshëm. Përdorni Print → Ruaj si PDF.', 'error'); return;
    }
    var doc = new global.jspdf.jsPDF({ orientation: previewState.kind === 'report' ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    var c = company();
    doc.setFontSize(15); doc.text(c.name || 'Sistemi Genit', 14, 14);
    doc.setFontSize(9); doc.text((c.nipt ? 'NIPT: ' + c.nipt : '') + (c.address ? '  |  ' + c.address : ''), 14, 20);
    doc.setFontSize(13); doc.text(previewState.title, 14, 29);
    if (previewState.tableId && doc.autoTable) {
      var table = document.getElementById(previewState.tableId);
      doc.autoTable({ html: table, startY: 35, theme: 'grid', styles: { fontSize: 7, cellPadding: 1.6 }, headStyles: { fillColor: [113, 75, 103] } });
    } else {
      var text = document.createElement('div'); text.innerHTML = previewState.html;
      var lines = doc.splitTextToSize(text.innerText.replace(/\n{3,}/g, '\n\n'), 180);
      doc.setFontSize(9); doc.text(lines, 14, 38);
    }
    doc.save(previewState.title.replace(/[^a-z0-9_-]+/gi, '_') + '.pdf');
  };

  App.sg61ExcelCurrent = function () {
    if (!previewState.tableId || !global.XLSX) return this.toast('Eksporti Excel nuk është i disponueshëm.', 'error');
    var table = document.getElementById(previewState.tableId);
    var wb = global.XLSX.utils.book_new();
    var ws = global.XLSX.utils.aoa_to_sheet([[company().name || 'Sistemi Genit'], [previewState.title], ['Gjeneruar', todayLabel()], []]);
    global.XLSX.utils.sheet_add_dom(ws, table, { origin: 'A5' });
    global.XLSX.utils.book_append_sheet(wb, ws, 'Raporti');
    global.XLSX.writeFile(wb, previewState.title.replace(/[^a-z0-9_-]+/gi, '_') + '.xlsx');
  };

  App.sg6Export = function (tableId, title, type) {
    previewState.tableId = tableId;
    previewState.title = title;
    previewState.html = reportHtml(tableId, title);
    previewState.kind = 'report';
    if (type === 'excel') return App.sg61ExcelCurrent();
    if (type === 'pdf') return App.sg61PdfCurrent();
    return App.sg61PrintCurrent();
  };

  function findField(container, words) {
    var result = '';
    (container || document).querySelectorAll('.form-group').forEach(function (group) {
      if (result) return;
      var label = group.querySelector('label');
      var labelText = norm(label && label.textContent);
      if (!words.some(function (word) { return labelText.indexOf(norm(word)) >= 0; })) return;
      var field = group.querySelector('input,select,textarea');
      if (!field) return;
      if (field.tagName === 'SELECT') {
        var option = field.options[field.selectedIndex]; result = option ? option.textContent.trim() : '';
      } else result = field.value || '';
    });
    return result;
  }

  function isWeightContainer(container) {
    var text = norm(container.textContent);
    var score = ['thase', 'kg bruto', 'ambalazh', 'pesha neto', 'zbritje'].filter(function (word) { return text.indexOf(word) >= 0; }).length;
    return score >= 3;
  }

  function weightRows(container) {
    var rows = [];
    var table = container.querySelector('table');
    if (table) {
      table.querySelectorAll('tbody tr').forEach(function (tr) {
        var cells = Array.prototype.slice.call(tr.querySelectorAll('td')).map(function (td) { return td.textContent.trim(); });
        if (cells.some(Boolean)) rows.push(cells.slice(0, 4));
      });
    }
    if (!rows.length) {
      var bags = findField(container, ['nr. thas', 'thase']);
      var gross = findField(container, ['kg bruto', 'pesha bruto', 'kg']);
      var tare = findField(container, ['ambalazh', 'peshorja', 'tare']);
      var net = findField(container, ['neto pas', 'pesha neto', 'neto']);
      rows.push([bags || '—', gross || '0', tare || '0', net || fmt(number(gross) - number(tare))]);
    }
    return rows;
  }

  function weightDocument(container) {
    var c = company();
    var rows = weightRows(container);
    var total = [0, 0, 0, 0];
    rows.forEach(function (row) { row.forEach(function (value, i) { total[i] += number(String(value).replace(/\./g, '').replace(',', '.')); }); });
    return '<section class="sg61-document sg61-weight-document">' +
      '<header class="sg61-document-header"><div><h1>' + esc(c.name || 'Sistemi Genit') + '</h1><p>' + esc(c.nipt ? 'NIPT: ' + c.nipt : '') + '</p><p>' + esc([c.address, c.city].filter(Boolean).join(', ')) + '</p></div><div class="sg61-document-title"><small>DOKUMENT MAGAZINE</small><h2>FORMULAR PESHE</h2><p>Data: ' + esc(findField(container, ['data']) || todayLabel()) + '</p></div></header>' +
      '<div class="sg61-weight-meta"><div><b>Furnitori:</b> ' + esc(findField(container, ['furnitor', 'shitësi']) || '—') + '</div><div><b>Artikulli:</b> ' + esc(findField(container, ['artikull', 'produkt']) || '—') + '</div><div><b>Mjeti/Targa:</b> ' + esc(findField(container, ['targa', 'mjeti']) || '—') + '</div><div><b>Adresa:</b> ' + esc(findField(container, ['adresa']) || '—') + '</div></div>' +
      '<table class="sg61-weight-table"><thead><tr><th>Nr. Thasëve</th><th>KG</th><th>Peshorja / Ambalazhi</th><th>Shuma / Neto</th></tr></thead><tbody>' +
      rows.map(function (row) { return '<tr>' + [0,1,2,3].map(function (i) { return '<td>' + esc(row[i] == null ? '' : row[i]) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody><tfoot><tr><th>' + fmt(total[0]) + '</th><th>' + fmt(total[1]) + '</th><th>' + fmt(total[2]) + '</th><th>' + fmt(total[3]) + '</th></tr></tfoot></table>' +
      '<div class="sg61-signatures"><div>Operatori i peshës</div><div>Furnitori</div><div>Magazinieri</div></div>' +
      '<footer class="sg61-document-footer"><span>Sistemi Genit Cloud</span><span>' + esc(todayLabel()) + '</span></footer></section>';
  }

  App.sg61OpenWeightPreview = function (containerId) {
    var container = document.getElementById(containerId);
    if (!container) return this.toast('Formulari i peshës nuk u gjet.', 'error');
    previewState.tableId = '';
    openDocumentModal('Formular Peshe', weightDocument(container), 'weight', '');
  };

  function professionalizeWeightForms(root) {
    (root || document).querySelectorAll('#content .card, .modal-body, form').forEach(function (container) {
      if (container.dataset.sg61Weight === 'done' || !isWeightContainer(container)) return;
      container.dataset.sg61Weight = 'done';
      container.classList.add('sg61-weight-form');
      if (!container.id) container.id = 'sg61-weight-' + Math.random().toString(36).slice(2);
      var header = document.createElement('div');
      header.className = 'sg61-weight-form-header';
      header.innerHTML = '<div><small>DOKUMENT MAGAZINE</small><h3>Formular Peshe</h3></div><button type="button" class="btn btn-outline sg61-preview-button"><span class="sg61-eye">&#128065;</span> Pamje dokumenti</button>';
      header.querySelector('button').addEventListener('click', function () { App.sg61OpenWeightPreview(container.id); });
      container.insertBefore(header, container.firstChild);
    });
  }

  function expenseDocument(expense) {
    var c = company();
    var paid = expense.paymentStatus === 'PAID';
    var title = paid ? 'MANDAT PAGESE' : 'DOKUMENT SHPENZIMI';
    return '<section class="sg61-document sg61-payment-document">' +
      '<header class="sg61-document-header"><div><h1>' + esc(c.name || 'Sistemi Genit') + '</h1><p>' + esc(c.nipt ? 'NIPT: ' + c.nipt : '') + '</p><p>' + esc([c.address, c.city].filter(Boolean).join(', ')) + '</p></div><div class="sg61-document-title"><small>ARKA / BANKA</small><h2>' + title + '</h2><p>Nr. ' + esc(expense.expenseNo || '') + '</p></div></header>' +
      '<div class="sg61-payment-grid"><div><b>U pagua për</b><br>' + esc(expense.description || '—') + '</div><div><b>Data</b><br>' + esc(String(expense.expenseDate || '').slice(0,10)) + '</div>' +
      '<div><b>Nga / Përfituesi</b><br>' + esc(expense.supplierName || '—') + '</div><div><b>Monedha</b><br>' + esc(expense.currency || 'ALL') + '</div>' +
      '<div><b>Kategoria</b><br>' + esc(expense.categoryName || expense.category || '—') + '</div><div><b>Shuma totale</b><br><strong>' + money(expense.totalAmount, expense.currency) + '</strong></div>' +
      '<div><b>Referenca / Fatura</b><br>' + esc(expense.referenceNo || expense.invoiceNo || '—') + '</div><div><b>Statusi</b><br>' + esc(expense.status || '') + ' / ' + esc(expense.paymentStatus || '') + '</div></div>' +
      '<table><thead><tr><th>Përshkrimi</th><th>Neto</th><th>TVSH</th><th>Totali</th></tr></thead><tbody><tr><td>' + esc(expense.description || '') + '</td><td>' + money(expense.amountNet, expense.currency) + '</td><td>' + money(expense.vatAmount, expense.currency) + '</td><td><strong>' + money(expense.totalAmount, expense.currency) + '</strong></td></tr></tbody></table>' +
      '<div class="sg61-signatures"><div>Financieri</div><div>Marrësi</div><div>Arkëtari</div></div>' +
      '<footer class="sg61-document-footer"><span>' + esc(expense.financeDocumentNo || 'Sistemi Genit Cloud') + '</span><span>' + esc(todayLabel()) + '</span></footer></section>';
  }

  App.sg61OpenExpenseDocument = function (id) {
    var expense = byId(this.data.expenses, id);
    if (!expense) return this.toast('Shpenzimi nuk u gjet.', 'error');
    previewState.tableId = '';
    openDocumentModal((expense.paymentStatus === 'PAID' ? 'Mandat Pagese ' : 'Shpenzim ') + (expense.expenseNo || ''), expenseDocument(expense), 'expense', id);
  };

  var installExpenseOverride = function () {
    if (!App.openExpense || App.openExpense.__sg61) return;
    var fn = function (id) { return App.sg61OpenExpenseDocument(id); };
    fn.__sg61 = true;
    App.openExpense = fn;
  };

  function refresh(root) {
    enhanceSelects(root || document);
    professionalizeTables(root || document);
    professionalizeWeightForms(root || document);
    installExpenseOverride();
  }

  document.addEventListener('click', function (event) {
    if (!event.target.closest('.sg61-combo')) closeCombos(null);
  });
  var observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) { if (node.nodeType === 1) refresh(node); });
    });
  });
  function start() {
    refresh(document);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  global.SGPhase61ProfessionalUI = { refresh: refresh, openReportPreview: App.sg61OpenReportPreview, openWeightPreview: App.sg61OpenWeightPreview };
})(window);
