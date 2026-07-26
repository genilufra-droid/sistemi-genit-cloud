/* SG_PHASE81_SAMPLE_SEARCH_CREATE_START — Sistemi Genit */
(function (global) {
  'use strict';

  var App = global.App;
  var Cloud = global.CloudERP;
  if (!App || !Cloud || global.__SG_PHASE81_SAMPLE_SEARCH_CREATE__) return;
  global.__SG_PHASE81_SAMPLE_SEARCH_CREATE__ = true;

  var originalNewSample = App.sg71NewSample;
  var activeQuickKind = '';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];
    });
  }

  function attr(value) { return esc(value).replace(/"/g, '&quot;'); }

  function norm(value) {
    var text = String(value == null ? '' : value).toLocaleLowerCase('sq-AL');
    if (text.normalize) text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return text.replace(/ë/g, 'e').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function companyId() {
    return (App.company && App.company.id) || ((Cloud.getAccess && Cloud.getAccess().companyIds || [])[0]) || '';
  }

  function codeFromName(value) {
    var code = String(value || '').trim().toUpperCase();
    if (code.normalize) code = code.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    code = code.replace(/Ë/g, 'E').replace(/Ç/g, 'C').replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return (code || ('ART-' + Date.now())).slice(0, 80);
  }

  function kindConfig(kind) {
    return kind === 'customer'
      ? {
          selectId: 'sg71-s-customer',
          label: 'Klient',
          addLabel: '+ Shto Klient',
          placeholder: 'Shkruaj emrin, kodin ose NIPT-in e klientit…',
          empty: 'Nuk u gjet klient.',
          icon: '👤'
        }
      : {
          selectId: 'sg71-s-product',
          label: 'Artikull',
          addLabel: '+ Shto Artikull',
          placeholder: 'Shkruaj kodin ose emrin e artikullit…',
          empty: 'Nuk u gjet artikull.',
          icon: '📦'
        };
  }

  function removePreviousEnhancement(select) {
    if (!select) return;
    var next = select.nextElementSibling;
    if (next && (next.classList.contains('sg73-combo') || next.classList.contains('sg61-combo'))) next.remove();
    select.classList.remove('sg73-native-select', 'sg61-native-select');
    select.dataset.sg73Search = '';
  }

  function optionRows(select) {
    return Array.prototype.slice.call(select.options || []).filter(function (option) {
      return Boolean(option.value);
    }).map(function (option) {
      return { id: option.value, label: option.textContent.trim(), search: norm(option.textContent) };
    });
  }

  function closeMenus(except) {
    Array.prototype.forEach.call(document.querySelectorAll('.sg81-picker.open'), function (picker) {
      if (picker !== except) picker.classList.remove('open');
    });
  }

  function setSelection(kind, id, label) {
    var config = kindConfig(kind);
    var select = document.getElementById(config.selectId);
    var picker = document.querySelector('.sg81-picker[data-kind="' + kind + '"]');
    if (!select || !picker) return;

    if (id && !Array.prototype.some.call(select.options, function (option) { return option.value === id; })) {
      select.add(new Option(label, id));
    }
    select.value = id || '';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    var input = picker.querySelector('.sg81-picker-input');
    input.value = label || '';
    input.dataset.selectedId = id || '';
    input.dataset.selectedLabel = label || '';
    picker.classList.remove('open');
  }

  function renderMenu(picker) {
    var kind = picker.dataset.kind;
    var config = kindConfig(kind);
    var select = document.getElementById(config.selectId);
    var input = picker.querySelector('.sg81-picker-input');
    var menu = picker.querySelector('.sg81-picker-menu');
    if (!select || !input || !menu) return;

    var query = norm(input.value);
    var rows = optionRows(select).filter(function (row) {
      return !query || row.search.indexOf(query) >= 0;
    }).slice(0, 100);

    var html = rows.map(function (row, index) {
      return '<button type="button" class="sg81-picker-option' + (row.id === select.value ? ' selected' : '') + '" data-index="' + index + '"><span>' + esc(row.label) + '</span><small>Zgjidh</small></button>';
    }).join('');

    if (!rows.length) {
      html = '<div class="sg81-picker-empty"><strong>' + esc(config.empty) + '</strong><small>Mund ta krijosh pa dalë nga formulari.</small></div>';
    }
    html += '<button type="button" class="sg81-picker-create">' + esc(config.addLabel) + (input.value.trim() ? ' “' + esc(input.value.trim()) + '”' : '') + '</button>';
    menu.innerHTML = html;

    Array.prototype.forEach.call(menu.querySelectorAll('.sg81-picker-option'), function (button) {
      button.addEventListener('mousedown', function (event) {
        event.preventDefault();
        var row = rows[Number(button.dataset.index)];
        if (row) setSelection(kind, row.id, row.label);
      });
    });
    var createButton = menu.querySelector('.sg81-picker-create');
    if (createButton) createButton.addEventListener('mousedown', function (event) {
      event.preventDefault();
      openQuickCreate(kind, input.value.trim());
    });
  }

  function buildPicker(kind) {
    var config = kindConfig(kind);
    var select = document.getElementById(config.selectId);
    if (!select || select.dataset.sg81Enhanced === '1') return;

    removePreviousEnhancement(select);
    select.dataset.sg81Enhanced = '1';
    select.classList.add('sg81-native-select');

    var picker = document.createElement('div');
    picker.className = 'sg81-picker';
    picker.dataset.kind = kind;
    picker.innerHTML = '<div class="sg81-picker-line"><div class="sg81-picker-search"><span>⌕</span><input type="search" class="sg81-picker-input" autocomplete="off" placeholder="' + attr(config.placeholder) + '" aria-label="Kërko ' + attr(config.label) + '"><button type="button" class="sg81-picker-clear" aria-label="Pastro">×</button></div><button type="button" class="sg81-add-button">' + esc(config.addLabel) + '</button></div><div class="sg81-picker-menu"></div>';
    select.insertAdjacentElement('afterend', picker);

    var input = picker.querySelector('.sg81-picker-input');
    var selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.value) {
      input.value = selectedOption.textContent.trim();
      input.dataset.selectedId = selectedOption.value;
      input.dataset.selectedLabel = input.value;
    }

    input.addEventListener('focus', function () {
      closeMenus(picker);
      picker.classList.add('open');
      renderMenu(picker);
      input.select();
    });
    input.addEventListener('input', function () {
      if (input.value !== (input.dataset.selectedLabel || '')) {
        input.dataset.selectedId = '';
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      picker.classList.add('open');
      renderMenu(picker);
    });
    input.addEventListener('keydown', function (event) {
      var options = Array.prototype.slice.call(picker.querySelectorAll('.sg81-picker-option'));
      var active = picker.querySelector('.sg81-picker-option.active');
      var index = options.indexOf(active);
      if (event.key === 'ArrowDown' && options.length) {
        event.preventDefault();
        index = Math.min(options.length - 1, index + 1);
        options.forEach(function (row) { row.classList.remove('active'); });
        options[index].classList.add('active');
        options[index].scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'ArrowUp' && options.length) {
        event.preventDefault();
        index = index < 0 ? 0 : Math.max(0, index - 1);
        options.forEach(function (row) { row.classList.remove('active'); });
        options[index].classList.add('active');
        options[index].scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (active) active.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        else if (options[0]) options[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        else openQuickCreate(kind, input.value.trim());
      } else if (event.key === 'Escape') {
        picker.classList.remove('open');
      }
    });

    picker.querySelector('.sg81-picker-clear').addEventListener('click', function () {
      setSelection(kind, '', '');
      input.focus();
      renderMenu(picker);
    });
    picker.querySelector('.sg81-add-button').addEventListener('click', function () {
      openQuickCreate(kind, input.value.trim());
    });
  }

  function quickForm(kind, query) {
    if (kind === 'customer') {
      return '<div class="sg81-quick-grid"><label><span>Emri i klientit *</span><input id="sg81-q-name" value="' + attr(query) + '" autocomplete="off"></label><label><span>Kodi</span><input id="sg81-q-code"></label><label><span>NIPT</span><input id="sg81-q-nipt"></label><label><span>Telefon</span><input id="sg81-q-phone" inputmode="tel"></label><label class="wide"><span>Adresa</span><input id="sg81-q-address"></label><label><span>Qyteti</span><input id="sg81-q-city"></label></div>';
    }
    return '<div class="sg81-quick-grid"><label><span>Emri i artikullit *</span><input id="sg81-q-name" value="' + attr(query) + '" autocomplete="off"></label><label><span>Kodi *</span><input id="sg81-q-code" value="' + attr(codeFromName(query)) + '"></label><label><span>Njësia bazë</span><input id="sg81-q-unit" value="kg"></label><label><span>TVSH %</span><input id="sg81-q-vat" type="number" min="0" max="100" step="0.01" value="0"></label><label><span>Çmimi blerjes</span><input id="sg81-q-buy" type="number" min="0" step="0.01" value="0"></label><label><span>Çmimi shitjes</span><input id="sg81-q-sell" type="number" min="0" step="0.01" value="0"></label></div>';
  }

  function openQuickCreate(kind, query) {
    closeQuickCreate();
    activeQuickKind = kind;
    var config = kindConfig(kind);
    var overlay = document.createElement('div');
    overlay.id = 'sg81-quick-overlay';
    overlay.className = 'sg81-quick-overlay';
    overlay.innerHTML = '<section class="sg81-quick-card" role="dialog" aria-modal="true" aria-label="' + attr(config.addLabel) + '"><header><div><small>KRIJIM I SHPEJTË</small><h3>' + esc(config.addLabel) + '</h3></div><button type="button" class="sg81-quick-close" aria-label="Mbyll">×</button></header><div class="sg81-quick-body">' + quickForm(kind, query) + '<p class="sg81-quick-note">Rekordi ruhet dhe zgjidhet automatikisht te mostra.</p></div><footer><button type="button" class="sg81-cancel">Anulo</button><button type="button" class="sg81-save">Ruaj dhe zgjidh</button></footer></section>';
    document.body.appendChild(overlay);

    overlay.addEventListener('mousedown', function (event) {
      if (event.target === overlay) closeQuickCreate();
    });
    overlay.querySelector('.sg81-quick-close').addEventListener('click', closeQuickCreate);
    overlay.querySelector('.sg81-cancel').addEventListener('click', closeQuickCreate);
    overlay.querySelector('.sg81-save').addEventListener('click', saveQuickCreate);
    setTimeout(function () {
      var name = document.getElementById('sg81-q-name');
      if (name) { name.focus(); name.select(); }
    }, 0);
  }

  function closeQuickCreate() {
    var overlay = document.getElementById('sg81-quick-overlay');
    if (overlay) overlay.remove();
    activeQuickKind = '';
  }

  function fieldValue(id) {
    var element = document.getElementById(id);
    return element ? element.value.trim() : '';
  }

  function normalizeCreated(row) {
    var normalized = {};
    Object.keys(row || {}).forEach(function (key) {
      normalized[key.replace(/_([a-z])/g, function (_match, letter) { return letter.toUpperCase(); })] = row[key];
    });
    return normalized;
  }

  async function saveQuickCreate() {
    var kind = activeQuickKind;
    if (!kind) return;
    var name = fieldValue('sg81-q-name');
    if (name.length < 2) return App.toast('Emri duhet të ketë të paktën 2 karaktere.', 'error');
    var saveButton = document.querySelector('#sg81-quick-overlay .sg81-save');
    if (saveButton) saveButton.disabled = true;

    try {
      var row;
      if (kind === 'customer') {
        row = await Cloud.request('/api/partners', {
          method: 'POST',
          body: {
            companyId: companyId(),
            partnerType: 'CUSTOMER',
            code: fieldValue('sg81-q-code'),
            name: name,
            nipt: fieldValue('sg81-q-nipt'),
            address: fieldValue('sg81-q-address'),
            city: fieldValue('sg81-q-city'),
            phone: fieldValue('sg81-q-phone'),
            email: '',
            creditLimit: 0,
            active: true
          }
        });
      } else {
        var code = fieldValue('sg81-q-code') || codeFromName(name);
        row = await Cloud.request('/api/products', {
          method: 'POST',
          body: {
            companyId: companyId(),
            categoryId: null,
            code: code,
            barcode: '',
            name: name,
            baseUnit: fieldValue('sg81-q-unit') || 'kg',
            packUnit: 'thes',
            palletUnit: 'paletë',
            packCoefficient: 1,
            palletCoefficient: 1,
            purchasePrice: Number(fieldValue('sg81-q-buy') || 0),
            salePrice: Number(fieldValue('sg81-q-sell') || 0),
            vatRate: Number(fieldValue('sg81-q-vat') || 0),
            active: true
          }
        });
      }

      var created = normalizeCreated(row);
      if (kind === 'customer') {
        App.data = App.data || {};
        App.data.partners = App.data.partners || [];
        if (!App.data.partners.some(function (item) { return item.id === created.id; })) App.data.partners.push(created);
      } else {
        App.data = App.data || {};
        App.data.products = App.data.products || [];
        if (!App.data.products.some(function (item) { return item.id === created.id; })) App.data.products.push(created);
      }

      var label = (created.code ? created.code + ' — ' : '') + created.name;
      closeQuickCreate();
      setSelection(kind, created.id, label);
      App.toast((kind === 'customer' ? 'Klienti' : 'Artikulli') + ' u krijua dhe u zgjodh.');
    } catch (error) {
      App.toast(error && error.message ? error.message : String(error), 'error');
      if (saveButton) saveButton.disabled = false;
    }
  }

  function enhanceSampleFields() {
    if (!document.getElementById('sg71-s-customer') || !document.getElementById('sg71-s-product')) return;
    buildPicker('customer');
    buildPicker('product');
  }

  function installStyle() {
    if (document.getElementById('sg81-style')) return;
    var style = document.createElement('style');
    style.id = 'sg81-style';
    style.textContent = [
      '.sg81-native-select{display:none!important}',
      '.sg81-picker{position:relative;width:100%}',
      '.sg81-picker-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:stretch}',
      '.sg81-picker-search{position:relative;display:flex;align-items:center}',
      '.sg81-picker-search>span{position:absolute;left:11px;color:#687180;font-size:17px;pointer-events:none}',
      '.sg81-picker-input{width:100%!important;min-height:40px!important;padding:9px 34px 9px 34px!important;border:1px solid #cbd1d9!important;border-radius:7px!important;background:#fff!important;font-size:14px!important}',
      '.sg81-picker-clear{position:absolute;right:7px;border:0;background:transparent;color:#7a8390;font-size:19px;cursor:pointer}',
      '.sg81-add-button{border:1px solid #714b67;background:#714b67;color:#fff;border-radius:7px;padding:8px 11px;font-weight:800;cursor:pointer;white-space:nowrap}',
      '.sg81-picker-menu{display:none;position:absolute;left:0;right:0;top:calc(100% + 5px);z-index:31000;background:#fff;border:1px solid #d5dae1;border-radius:9px;box-shadow:0 14px 36px rgba(31,41,55,.2);max-height:300px;overflow:auto}',
      '.sg81-picker.open .sg81-picker-menu{display:block}',
      '.sg81-picker-option{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:0;border-bottom:1px solid #eef0f3;background:#fff;padding:10px 12px;text-align:left;cursor:pointer}',
      '.sg81-picker-option:hover,.sg81-picker-option.active,.sg81-picker-option.selected{background:#f3edf2;color:#54384d}',
      '.sg81-picker-option small{color:#7b8492}',
      '.sg81-picker-empty{padding:14px 12px;color:#687180}.sg81-picker-empty strong,.sg81-picker-empty small{display:block}.sg81-picker-empty small{margin-top:4px}',
      '.sg81-picker-create{width:calc(100% - 16px);margin:8px;border:1px solid #714b67;background:#714b67;color:#fff;border-radius:7px;padding:10px;font-weight:850;cursor:pointer;text-align:left}',
      '.sg81-quick-overlay{position:fixed;inset:0;z-index:50000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(18,20,25,.62);backdrop-filter:blur(2px)}',
      '.sg81-quick-card{width:min(680px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.3)}',
      '.sg81-quick-card>header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #e2e5e9}.sg81-quick-card h3{margin:2px 0 0}.sg81-quick-card header small{color:#714b67;font-weight:900;letter-spacing:.08em}',
      '.sg81-quick-close{border:0;background:#f0f1f3;border-radius:50%;width:36px;height:36px;font-size:22px;cursor:pointer}',
      '.sg81-quick-body{padding:18px}.sg81-quick-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.sg81-quick-grid label{display:grid;gap:5px}.sg81-quick-grid label span{font-size:12px;font-weight:800;color:#5e6773}.sg81-quick-grid .wide{grid-column:1/-1}',
      '.sg81-quick-note{margin:14px 0 0;background:#f6f0f4;border:1px solid #e2d4de;border-radius:7px;padding:9px;color:#5d4255;font-size:12px}',
      '.sg81-quick-card>footer{display:flex;justify-content:flex-end;gap:8px;padding:13px 18px;border-top:1px solid #e2e5e9}.sg81-cancel,.sg81-save{border-radius:7px;padding:9px 14px;font-weight:800;cursor:pointer}.sg81-cancel{border:1px solid #cbd1d9;background:#fff}.sg81-save{border:1px solid #714b67;background:#714b67;color:#fff}.sg81-save:disabled{opacity:.55;cursor:wait}',
      '@media(max-width:700px){.sg81-picker-line{grid-template-columns:1fr}.sg81-add-button{width:100%}.sg81-quick-grid{grid-template-columns:1fr}.sg81-quick-grid .wide{grid-column:auto}.sg81-quick-overlay{align-items:flex-end;padding:0}.sg81-quick-card{width:100%;max-height:88vh;border-radius:18px 18px 0 0}}'
    ].join('');
    document.head.appendChild(style);
  }

  function start() {
    installStyle();
    if (typeof originalNewSample === 'function') {
      App.sg71NewSample = function () {
        var result = originalNewSample.apply(this, arguments);
        setTimeout(enhanceSampleFields, 0);
        setTimeout(enhanceSampleFields, 120);
        return result;
      };
    }
    document.addEventListener('mousedown', function (event) {
      if (!event.target.closest('.sg81-picker')) closeMenus();
    });
    var observer = new MutationObserver(function () { enhanceSampleFields(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    enhanceSampleFields();
  }

  App.SGPhase81 = { enhanceSampleFields: enhanceSampleFields, openQuickCreate: openQuickCreate };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window);
/* SG_PHASE81_SAMPLE_SEARCH_CREATE_END */
