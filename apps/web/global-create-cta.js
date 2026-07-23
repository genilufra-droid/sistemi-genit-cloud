/* Sistemi Genit — Global “Kërko ose Shto” me rikthim të sigurt në dokument/rresht */
(function (global) {
  'use strict';

  var App = global.App;
  var SAC = global.SAC;
  var Auth = global.Auth;
  var Cloud = global.CloudERP;
  if (!App || global.__SG_GLOBAL_CREATE_CTA__) return;
  global.__SG_GLOBAL_CREATE_CTA__ = true;

  var quickCreateContext = null;
  var quickCounter = 0;
  var serverCapabilities = Object.create(null);

  function lower(value) { return String(value == null ? '' : value).toLocaleLowerCase('sq-AL'); }
  function esc(value) { return App.esc ? App.esc(value == null ? '' : String(value)) : String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function attr(value) { return esc(value).replace(/"/g, '&quot;'); }
  function companyId() { return (App.company && App.company.id) || (Cloud && Cloud.getAccess && (Cloud.getAccess().companyIds || [])[0]) || ''; }
  function textOfInput(input) {
    if (!input) return '';
    var group = input.closest && input.closest('.form-group,label,.sg43-master,.field-row,.input-group');
    var label = group && group.querySelector && group.querySelector('label,span.field-label');
    return [input.id, input.name, input.placeholder, input.getAttribute && input.getAttribute('aria-label'), label && label.textContent].filter(Boolean).join(' ');
  }
  function normalizeCode(value) {
    var result = String(value || '').trim().toUpperCase();
    if (result.normalize) result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return result.replace(/Ë/g, 'E').replace(/Ç/g, 'C').replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  }
  function invoke(candidates, args) {
    args = args || [];
    for (var i = 0; i < candidates.length; i += 1) {
      var fn = App[candidates[i]];
      if (typeof fn === 'function') { fn.apply(App, args); return true; }
    }
    return false;
  }
  function inputByIds(ids) {
    for (var i = 0; i < ids.length; i += 1) {
      var element = document.getElementById(ids[i]);
      if (element) return element;
    }
    return null;
  }
  function prefillNative(nameIds, codeIds, query) {
    if (!query) return;
    function apply() {
      var name = inputByIds(nameIds || []);
      var code = inputByIds(codeIds || []);
      if (name && !name.value) {
        name.value = query;
        name.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (code && !code.value) {
        code.value = normalizeCode(query);
        code.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (name) name.focus(); else if (code) code.focus();
      return Boolean(name || code);
    }
    if (apply()) return;
    setTimeout(apply, 60); setTimeout(apply, 220);
  }
  function canCreate(definition) {
    if (!definition) return false;
    if (definition.serverType && Object.prototype.hasOwnProperty.call(serverCapabilities, definition.serverType)) {
      return serverCapabilities[definition.serverType] === true;
    }
    var permission = definition.permission || 'masters.manage';
    if (!Auth || typeof Auth.hasPermission !== 'function') return true;
    return Auth.hasPermission(permission);
  }
  function ensureInputId(input) {
    if (!input) return '';
    if (!input.id) { quickCounter += 1; input.id = 'sg-quick-source-' + quickCounter; }
    return input.id;
  }
  function takeChildren(element) {
    if (!element) return null;
    var fragment = document.createDocumentFragment();
    while (element.firstChild) fragment.appendChild(element.firstChild);
    return fragment;
  }
  function restoreChildren(element, fragment) {
    if (!element || !fragment) return;
    while (element.firstChild) element.removeChild(element.firstChild);
    element.appendChild(fragment);
  }
  function snapshotSource(input, definition) {
    var overlay = document.getElementById('modal-overlay');
    var modalBox = document.getElementById('modal-box');
    var content = document.getElementById('content');
    var active = document.activeElement;
    var sourceModalVisible = Boolean(overlay && (overlay.classList.contains('show') || getComputedStyle(overlay).display !== 'none'));
    return {
      definitionKey: definition.key,
      sourceView: App.currentView || '',
      sourceInput: input || null,
      sourceInputId: ensureInputId(input),
      sourceQuery: input ? input.value.trim() : '',
      sourceSelectedId: input && input.dataset ? (input.dataset.selectedId || '') : '',
      sourceModalVisible: sourceModalVisible,
      overlayClassName: overlay ? overlay.className : '',
      overlayStyle: overlay ? overlay.getAttribute('style') : null,
      modalFragment: sourceModalVisible ? takeChildren(modalBox) : null,
      contentFragment: takeChildren(content),
      contentScrollTop: content ? content.scrollTop : 0,
      pageScrollX: global.scrollX || 0,
      pageScrollY: global.scrollY || 0,
      selectionStart: input && typeof input.selectionStart === 'number' ? input.selectionStart : null,
      selectionEnd: input && typeof input.selectionEnd === 'number' ? input.selectionEnd : null,
      activeElementId: active && active.id || '',
      createdAt: Date.now()
    };
  }
  function restoreSource(context) {
    if (!context) return null;
    var overlay = document.getElementById('modal-overlay');
    var modalBox = document.getElementById('modal-box');
    var content = document.getElementById('content');
    restoreChildren(content, context.contentFragment);
    if (content) content.scrollTop = context.contentScrollTop || 0;
    if (context.sourceModalVisible && overlay && modalBox) {
      restoreChildren(modalBox, context.modalFragment);
      overlay.className = context.overlayClassName || 'show';
      if (context.overlayStyle == null) overlay.removeAttribute('style'); else overlay.setAttribute('style', context.overlayStyle);
      overlay.classList.add('show');
    } else if (overlay) {
      overlay.classList.remove('show');
    }
    global.scrollTo(context.pageScrollX || 0, context.pageScrollY || 0);
    return context.sourceInput && context.sourceInput.isConnected ? context.sourceInput : document.getElementById(context.sourceInputId);
  }
  function normalizedRow(row) {
    row = row || {};
    var out = {};
    Object.keys(row).forEach(function (key) { out[key.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); })] = row[key]; });
    return out;
  }
  function applySelection(input, row, context) {
    if (!input || !row) return false;
    var x = normalizedRow(row);
    var display = x.displayName || x.name || x.fullName || x.plateNo || x.code || x.id || '';
    if (x.plateNo && x.code) display = x.plateNo + ' — ' + x.code;
    input.dataset.selectedId = x.id || '';
    input.dataset.selectedCode = x.code || x.plateNo || x.id || '';
    input.value = display;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new CustomEvent('sg:quick-create-selected', { bubbles: true, detail: { row: x, context: context || null } }));
    input.focus();
    if (context && context.selectionStart != null && typeof input.setSelectionRange === 'function') {
      var end = input.value.length;
      input.setSelectionRange(end, end);
    }
    return true;
  }

  App.beginQuickCreate = function (input, definition) {
    if (!definition || !canCreate(definition)) return false;
    if (quickCreateContext) this.cancelQuickCreate();
    quickCreateContext = snapshotSource(input, definition);
    this._quickCreateContext = quickCreateContext;
    return true;
  };
  App.hasQuickCreateContext = function (key) { return Boolean(quickCreateContext && (!key || quickCreateContext.definitionKey === key)); };
  App.completeQuickCreate = function (key, row) {
    if (!quickCreateContext || (key && quickCreateContext.definitionKey !== key)) return false;
    var context = quickCreateContext;
    quickCreateContext = null; this._quickCreateContext = null;
    var input = restoreSource(context);
    applySelection(input, row, context);
    if (this.enhanceEmptyCreateActions) this.enhanceEmptyCreateActions();
    this.toast('U krijua në PostgreSQL dhe u zgjodh automatikisht: ' + (normalizedRow(row).name || normalizedRow(row).plateNo || normalizedRow(row).code || 'rekordi i ri'));
    return true;
  };
  App.cancelQuickCreate = function () {
    if (!quickCreateContext) return false;
    var context = quickCreateContext;
    quickCreateContext = null; this._quickCreateContext = null;
    restoreSource(context);
    return true;
  };

  var baseCloseModal = typeof App.closeModal === 'function' ? App.closeModal.bind(App) : null;
  if (baseCloseModal) {
    App.closeModal = function () {
      if (quickCreateContext) return this.cancelQuickCreate();
      return baseCloseModal();
    };
  }

  var entityDefinitions = [];
  function register(definition) {
    entityDefinitions = entityDefinitions.filter(function (item) { return item.key !== definition.key; });
    entityDefinitions.unshift(definition);
    return definition;
  }
  function nativeDefinition(input) {
    return {
      key: input.key, match: input.match, label: input.label, icon: input.icon,
      permission: input.permission || 'masters.manage',
      create: function (query) {
        if (!invoke(input.open, input.args || [])) throw new Error('Formulari përkatës nuk është i disponueshëm në këtë modul.');
        prefillNative(input.nameIds || [], input.codeIds || [], query);
      }
    };
  }
  function genericDefinition(input) {
    return {
      key: input.key, match: input.match, label: input.label, icon: input.icon,
      permission: input.permission || 'masters.manage', serverType: input.serverType,
      create: function (query) { App.openGenericMasterQuickCreate(input.key, input.serverType, input.label, query); }
    };
  }

  register(nativeDefinition({ key:'supplier', match:/furnitor|supplier/, label:'Furnitor', icon:'🌱', open:['editPartner'], args:['supplier'], nameIds:['p-name','partner-name','supplier-name'], codeIds:['p-code','partner-code','supplier-code'] }));
  register(nativeDefinition({ key:'customer', match:/klient|customer|bler[eë]s/, label:'Klient', icon:'👤', open:['editPartner'], args:['customer'], nameIds:['p-name','partner-name','customer-name'], codeIds:['p-code','partner-code','customer-code'] }));
  register(nativeDefinition({ key:'product', match:/artikull|product|produkt|mall/, label:'Artikull', icon:'📦', open:['editProduct'], nameIds:['pr-name','product-name','item-name'], codeIds:['pr-code','product-code','item-code'] }));
  register(nativeDefinition({ key:'farm', match:/ferm[aë](?!r)|origjin[aë]/, label:'Fermë / Zonë', icon:'🌿', open:['editTraceFarm','editFarm'], nameIds:['farm-name','tf-name'], codeIds:['farm-code','tf-code'] }));
  register(nativeDefinition({ key:'parcel', match:/parcel|zon[aë] mbledh/, label:'Parcelë / Zonë mbledhjeje', icon:'📍', open:['editTraceParcel','editParcel'], nameIds:['parcel-name','tp-name'], codeIds:['parcel-code','tp-code'] }));
  register(nativeDefinition({ key:'vehicle', match:/automjet|mjet|targ[aë]|vehicle|kamion/, label:'Automjet', icon:'🚚', open:['editLogisticsVehicle','editVehicle'], nameIds:['vehicle-name','lv-name'], codeIds:['vehicle-plate','lv-plate','sg43-v-plate'] }));
  register(nativeDefinition({ key:'warehouse', match:/magazin|warehouse/, label:'Magazinë', icon:'🏬', open:['editWarehouse'], nameIds:['warehouse-name','wh-name'], codeIds:['warehouse-code','wh-code'] }));
  register(nativeDefinition({ key:'category', match:/kategori artikull|product category|category/, label:'Kategori Artikulli', icon:'🗂️', open:['editCategory','editProductCategory'], nameIds:['category-name','cat-name'], codeIds:['category-code','cat-code'] }));
  register(genericDefinition({ key:'farmer', match:/fermer|mbledh[eë]s/, label:'Fermer / Mbledhës', icon:'🧑‍🌾', serverType:'FARMER' }));
  register(genericDefinition({ key:'driver', match:/shofer|driver/, label:'Shofer', icon:'🧑‍✈️', serverType:'DRIVER' }));
  register(genericDefinition({ key:'route', match:/itinerar|rrug[eë]|route/, label:'Itinerar', icon:'🗺️', serverType:'ROUTE' }));
  register(genericDefinition({ key:'agent', match:/agjent|salesman/, label:'Agjent', icon:'🧑‍💼', serverType:'AGENT' }));
  register(genericDefinition({ key:'asset', match:/aset|makineri|pajisje|asset/, label:'Aset / Makineri', icon:'🏭', serverType:'ASSET' }));
  register(genericDefinition({ key:'expenseCategory', match:/kategori shpenzim|expense category/, label:'Kategori Shpenzimi', icon:'💸', serverType:'EXPENSE_CATEGORY', permission:'expenses.manage' }));
  register(genericDefinition({ key:'cashAccount', match:/ark[eë]|cash account|llogari arke/, label:'Arkë', icon:'💵', serverType:'CASH_ACCOUNT', permission:'cash.manage' }));
  register(genericDefinition({ key:'bankAccount', match:/bank[eë]|iban|bank account|llogari banke/, label:'Llogari Bankare', icon:'🏦', serverType:'BANK_ACCOUNT', permission:'bank.manage' }));

  function definitionForInput(input) {
    var context = lower(textOfInput(input));
    if (/lot|serial/.test(context)) return null;
    for (var i = 0; i < entityDefinitions.length; i += 1) if (entityDefinitions[i].match.test(context)) return entityDefinitions[i];
    return null;
  }
  function definitionByKey(key) {
    for (var i = 0; i < entityDefinitions.length; i += 1) if (entityDefinitions[i].key === key) return entityDefinitions[i];
    return null;
  }
  App.registerCreateOnNoResult = function (definition) { if (definition && definition.key && typeof definition.create === 'function') register(definition); };
  App.createFromNoResult = function (input, definition) {
    if (!definition || typeof definition.create !== 'function' || !canCreate(definition)) return;
    if (!this.beginQuickCreate(input, definition)) return;
    try { definition.create(input ? input.value.trim() : ''); }
    catch (error) { this.cancelQuickCreate(); this.toast(error.message || String(error), 'error'); }
  };

  App.openGenericMasterQuickCreate = function (key, serverType, label, query) {
    if (!Cloud || !Cloud.request) throw new Error('Lidhja Cloud PostgreSQL nuk është aktive.');
    var code = normalizeCode(query);
    var body = '<div class="sg-global-master-form">' +
      '<div class="form-group"><label>Kodi</label><input id="sg-gm-code" value="' + attr(code) + '" maxlength="100"></div>' +
      '<div class="form-group"><label>Emri *</label><input id="sg-gm-name" value="' + attr(query || '') + '" maxlength="220" required autofocus></div>' +
      '<div class="form-group sg-gm-wide"><label>Përshkrimi</label><textarea id="sg-gm-description" maxlength="3000"></textarea></div>' +
      '<div class="sg-gm-note sg-gm-wide">Rekordi ruhet në PostgreSQL dhe zgjidhet automatikisht në dokumentin aktual.</div>' +
      '</div>';
    var footer = '<button class="btn btn-outline" onclick="App.cancelQuickCreate()">Anulo</button>' +
      '<button id="sg-gm-save" class="btn btn-primary" onclick="App.saveGenericMasterQuickCreate(\'' + attr(key) + '\',\'' + attr(serverType) + '\')">Ruaj dhe zgjidh</button>';
    this.modal('Shto të ri — ' + label, body, footer);
    setTimeout(function () { var name = document.getElementById('sg-gm-name'); if (name) { name.focus(); name.select(); } }, 0);
  };
  App.saveGenericMasterQuickCreate = async function (key, serverType) {
    var definition = definitionByKey(key);
    if (!definition || !canCreate(definition)) { this.toast('Nuk keni leje krijimi për këtë regjistër.', 'error'); return; }
    var name = (document.getElementById('sg-gm-name') || {}).value || '';
    var code = (document.getElementById('sg-gm-code') || {}).value || '';
    var description = (document.getElementById('sg-gm-description') || {}).value || '';
    if (name.trim().length < 2) { this.toast('Emri duhet të ketë të paktën 2 karaktere.', 'error'); return; }
    var button = document.getElementById('sg-gm-save'); if (button) button.disabled = true;
    try {
      var row = await Cloud.request('/api/master-data/' + encodeURIComponent(serverType), { method:'POST', body:{ companyId:companyId(), code:code.trim(), name:name.trim(), description:description.trim(), metadata:{ source:'GLOBAL_SEARCH_CREATE', sourceView:quickCreateContext && quickCreateContext.sourceView || '' }, active:true } });
      this.completeQuickCreate(key, row);
    } catch (error) {
      this.toast(error.message || String(error), 'error');
      if (button) button.disabled = false;
    }
  };

  if (SAC && typeof SAC._render === 'function' && !SAC.__sgCreatePatched) {
    var baseRender = SAC._render.bind(SAC);
    SAC._render = function (resultsEl, items, opts, instId) {
      baseRender(resultsEl, items, opts, instId);
      if (items && items.length) return;
      var instance = SAC.instances && SAC.instances[instId];
      var input = instance && instance.input;
      var definition = (opts && opts.createDefinition) || definitionForInput(input);
      if (!definition || !canCreate(definition)) return;
      var empty = resultsEl.querySelector('.sac-empty');
      if (!empty) {
        empty = document.createElement('div'); empty.className = 'sac-empty'; empty.textContent = 'Nuk u gjet asnjë rezultat'; resultsEl.appendChild(empty);
      } else {
        var firstText = lower(empty.textContent);
        if (firstText.indexOf('nuk u gjet') < 0) empty.insertAdjacentHTML('afterbegin', '<div>Nuk u gjet asnjë rezultat</div>');
      }
      if (empty.querySelector('.sg-create-no-result')) return;
      var query = input ? input.value.trim() : '';
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'sg-create-no-result';
      button.innerHTML = '<span>' + String(definition.icon || '＋') + '</span><strong>+ Shto të ri</strong><em>' + esc(definition.label || '') + '</em>' + (query ? '<small>“' + esc(query) + '”</small>' : '');
      button.addEventListener('mousedown', function (event) { event.preventDefault(); event.stopPropagation(); });
      button.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); resultsEl.classList.remove('show'); App.createFromNoResult(input, definition); });
      empty.appendChild(button);
    };
    SAC.__sgCreatePatched = true;
  }

  function buttonAction(label, action, icon, permission) { return { label:label, action:action, icon:icon || '＋', permission:permission || 'documents.create' }; }
  function viewActions(view) {
    var map = {
      products:[buttonAction('+ Shto Artikull',function(){App.editProduct();},'📦','masters.manage')],
      partners:[buttonAction('+ Shto Furnitor / Fermer',function(){App.editPartner('supplier');},'🌱','masters.manage'),buttonAction('+ Shto Klient',function(){App.editPartner('customer');},'👤','masters.manage')],
      weightList:[buttonAction('+ Shto Peshim / Pranim',function(){App.navigate('weightForm');},'⚖️')],
      traceLots:[buttonAction('+ Shto Peshim / Pranim',function(){App.navigate('weightForm');},'⚖️')],
      traceProcesses:[buttonAction('+ Shto Urdhër Pune',function(){invoke(['editProcessOrderOnline','editProcessBatch']);},'⚙️'),buttonAction('+ Shto Paketim',function(){invoke(['editPackagingOrderOnline']);},'📦')],
      salesList:[buttonAction('+ Shto Shitje',function(){App.navigate('salesForm');},'🧾')],
      expenses:[buttonAction('+ Shto Shpenzim',function(){invoke(['editExpense']);},'💸')],
      logisticsVehicles:[buttonAction('+ Shto Automjet',function(){invoke(['editLogisticsVehicle','editVehicle']);},'🚚','masters.manage')],
      exportShipments:[buttonAction('+ Shto Ngarkesë',function(){invoke(['editExportShipment','editShipment']);},'🌍')],
      fixedAssets:[buttonAction('+ Shto Aset / Makineri',function(){invoke(['editFixedAsset','editAsset']);},'🏭','masters.manage')]
    };
    return (map[view] || []).filter(function (item) { return !Auth || !Auth.hasPermission || Auth.hasPermission(item.permission); });
  }
  function existingAddButtons(scope) {
    return Array.prototype.slice.call(scope.querySelectorAll('button,a.btn')).filter(function (element) {
      if (element.closest('.sg-empty-create-actions')) return false;
      var label = lower(element.textContent);
      return /^\s*\+/.test(element.textContent || '') || /\bshto\b|\bi ri\b|\be re\b/.test(label);
    }).slice(0, 3).map(function (source) { return buttonAction((source.textContent || '+ Shto').trim(), function () { source.click(); }, '＋'); });
  }
  function enhanceEmptyStates() {
    var content = document.getElementById('content'); if (!content) return;
    Array.prototype.forEach.call(content.querySelectorAll('.empty-report'), function (empty) {
      if (empty.dataset.sgCreateEnhanced === '1') return;
      empty.dataset.sgCreateEnhanced = '1';
      if (lower(empty.textContent).indexOf('nuk u gjet') < 0 && lower(empty.textContent).indexOf('nuk ka') < 0) {
        empty.insertAdjacentHTML('afterbegin', '<strong>Nuk u gjet asnjë rezultat</strong>');
      }
      var scope = empty.closest('.card') || content;
      var actions = existingAddButtons(scope); if (!actions.length) actions = viewActions(App.currentView); if (!actions.length) return;
      var holder = document.createElement('div'); holder.className = 'sg-empty-create-actions no-print';
      actions.forEach(function (item) { var button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-primary'; button.innerHTML = '<span>' + item.icon + '</span> ' + esc(item.label); button.addEventListener('click', item.action); holder.appendChild(button); });
      empty.appendChild(holder);
    });
  }

  async function loadCapabilities() {
    if (!Cloud || !Cloud.request) return;
    try {
      var rows = await Cloud.request('/api/master-data/capabilities');
      (rows || []).forEach(function (row) { serverCapabilities[row.entityType] = Boolean(row.canCreate); });
    } catch (_) {}
  }
  var observer = new MutationObserver(function () { enhanceEmptyStates(); });
  function start() {
    var content = document.getElementById('content');
    if (content) observer.observe(content, { childList:true, subtree:true });
    enhanceEmptyStates(); loadCapabilities();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  App.enhanceEmptyCreateActions = enhanceEmptyStates;
})(window);
