/* Sistemi Genit — Global “Shto” action for empty lists and no-result searches */
(function (global) {
  'use strict';

  var App = global.App;
  var SAC = global.SAC;
  if (!App || global.__SG_GLOBAL_CREATE_CTA__) return;
  global.__SG_GLOBAL_CREATE_CTA__ = true;

  function lower(value) {
    return String(value == null ? '' : value).toLocaleLowerCase('sq-AL');
  }

  function textOfInput(input) {
    if (!input) return '';
    var label = input.closest('.form-group');
    label = label && label.querySelector('label');
    return [input.id, input.name, input.placeholder, label && label.textContent].filter(Boolean).join(' ');
  }

  function setPrefill(ids, value) {
    if (!value) return;
    function apply() {
      for (var i = 0; i < ids.length; i += 1) {
        var element = document.getElementById(ids[i]);
        if (element && !element.value) {
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles:true }));
          element.focus();
          return true;
        }
      }
      return false;
    }
    if (apply()) return;
    setTimeout(apply, 60);
    setTimeout(apply, 220);
  }

  function invoke(candidates, args) {
    args = args || [];
    for (var i = 0; i < candidates.length; i += 1) {
      var fn = App[candidates[i]];
      if (typeof fn === 'function') {
        fn.apply(App, args);
        return true;
      }
    }
    return false;
  }

  var entityDefinitions = [
    {
      key:'supplier', match:/furnitor|supplier|fermer/,
      label:'Furnitor / Fermer', icon:'🌱',
      create:function (query) { if (invoke(['editPartner'],['supplier'])) setPrefill(['p-name','partner-name','supplier-name'],query); }
    },
    {
      key:'customer', match:/klient|customer|bler[eë]s/,
      label:'Klient', icon:'👤',
      create:function (query) { if (invoke(['editPartner'],['customer'])) setPrefill(['p-name','partner-name','customer-name'],query); }
    },
    {
      key:'product', match:/artikull|product|produkt|mall/,
      label:'Artikull', icon:'📦',
      create:function (query) { if (invoke(['editProduct'])) setPrefill(['pr-name','product-name','item-name'],query); }
    },
    {
      key:'farm', match:/ferm[aë]|origjin[aë]/,
      label:'Fermë / Zonë', icon:'🌿',
      create:function (query) { if (invoke(['editTraceFarm','editFarm'])) setPrefill(['farm-name','tf-name'],query); }
    },
    {
      key:'parcel', match:/parcel|zon[aë] mbledh/,
      label:'Parcelë / Zonë mbledhjeje', icon:'📍',
      create:function (query) { if (invoke(['editTraceParcel','editParcel'])) setPrefill(['parcel-name','tp-name'],query); }
    },
    {
      key:'warehouse', match:/magazin|warehouse/,
      label:'Magazinë', icon:'🏬',
      create:function (query) { if (!invoke(['editWarehouse'])) App.navigate('settings'); setPrefill(['warehouse-name','wh-name'],query); }
    },
    {
      key:'category', match:/kategori|category/,
      label:'Kategori', icon:'🗂️',
      create:function (query) { if (!invoke(['editCategory','editProductCategory'])) App.navigate('settings'); setPrefill(['category-name','cat-name'],query); }
    },
    {
      key:'agent', match:/agjent|shit[eë]s|salesman/,
      label:'Agjent', icon:'🧑‍💼',
      create:function (query) { if (!invoke(['editAgent','editSalesman'])) App.navigate('settings'); setPrefill(['agent-name','salesman-name'],query); }
    },
    {
      key:'vehicle', match:/automjet|mjet|targ[aë]|vehicle|kamion/,
      label:'Automjet', icon:'🚚',
      create:function (query) { if (invoke(['editLogisticsVehicle','editVehicle'])) setPrefill(['vehicle-plate','vehicle-name','lv-plate'],query); }
    },
    {
      key:'asset', match:/aset|makineri|pajisje|asset/,
      label:'Aset / Makineri', icon:'🏭',
      create:function (query) { if (invoke(['editFixedAsset','editAsset'])) setPrefill(['asset-name','fa-name'],query); }
    }
  ];

  function definitionForInput(input) {
    var context = lower(textOfInput(input));
    if (/lot|serial/.test(context)) return null; // loti krijohet vetëm nga dokumenti burim
    for (var i = 0; i < entityDefinitions.length; i += 1) {
      if (entityDefinitions[i].match.test(context)) return entityDefinitions[i];
    }
    return null;
  }

  App.registerCreateOnNoResult = function (definition) {
    if (!definition || !definition.key || typeof definition.create !== 'function') return;
    entityDefinitions.unshift(definition);
  };

  App.createFromNoResult = function (input, definition) {
    if (!definition || typeof definition.create !== 'function') return;
    definition.create(input ? input.value.trim() : '');
  };

  if (SAC && typeof SAC._render === 'function' && !SAC.__sgCreatePatched) {
    var baseRender = SAC._render.bind(SAC);
    SAC._render = function (resultsEl, items, opts, instId) {
      baseRender(resultsEl, items, opts, instId);
      if (items && items.length) return;
      var instance = SAC.instances && SAC.instances[instId];
      var input = instance && instance.input;
      var definition = (opts && opts.createDefinition) || definitionForInput(input);
      if (!definition) return;
      var empty = resultsEl.querySelector('.sac-empty');
      if (!empty || empty.querySelector('.sg-create-no-result')) return;
      var query = input ? input.value.trim() : '';
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'sg-create-no-result';
      button.innerHTML = '<span>'+String(definition.icon || '＋')+'</span><strong>+ Shto '+String(definition.label || 'të ri')+'</strong>'+(query ? '<small>“'+App.esc(query)+'”</small>' : '');
      button.addEventListener('mousedown',function(event){event.preventDefault();event.stopPropagation();});
      button.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();resultsEl.classList.remove('show');App.createFromNoResult(input,definition);});
      empty.appendChild(button);
    };
    SAC.__sgCreatePatched = true;
  }

  function buttonAction(label, action, icon) {
    return { label:label, action:action, icon:icon || '＋' };
  }

  function viewActions(view) {
    var map = {
      products:[buttonAction('+ Shto Artikull',function(){App.editProduct();},'📦')],
      partners:[
        buttonAction('+ Shto Furnitor / Fermer',function(){App.editPartner('supplier');},'🌱'),
        buttonAction('+ Shto Klient',function(){App.editPartner('customer');},'👤')
      ],
      weightList:[buttonAction('+ Shto Peshim / Pranim',function(){App.navigate('weightForm');},'⚖️')],
      traceLots:[buttonAction('+ Shto Peshim / Pranim',function(){App.navigate('weightForm');},'⚖️')],
      traceProcesses:[buttonAction('+ Shto Urdhër Pune',function(){invoke(['editProcessOrderOnline','editProcessBatch']);},'⚙️')],
      tracePackaging:[buttonAction('+ Shto Paketim',function(){invoke(['editPackagingOrder']);},'📦')],
      salesList:[buttonAction('+ Shto Shitje',function(){App.navigate('salesForm');},'🧾')],
      expenses:[buttonAction('+ Shto Shpenzim',function(){invoke(['editExpense']);},'💸')],
      logisticsVehicles:[buttonAction('+ Shto Automjet',function(){invoke(['editLogisticsVehicle','editVehicle']);},'🚚')],
      exportShipments:[buttonAction('+ Shto Ngarkesë',function(){invoke(['editExportShipment','editShipment']);},'🌍')],
      fixedAssets:[buttonAction('+ Shto Aset / Makineri',function(){invoke(['editFixedAsset','editAsset']);},'🏭')]
    };
    return map[view] || [];
  }

  function existingAddButtons(scope) {
    var candidates = Array.prototype.slice.call(scope.querySelectorAll('button,a.btn'));
    return candidates.filter(function (element) {
      if (element.closest('.sg-empty-create-actions')) return false;
      var label = lower(element.textContent);
      return /^\s*\+/.test(element.textContent || '') || /\bshto\b|\bi ri\b|\be re\b/.test(label);
    }).slice(0,3).map(function (source) {
      return buttonAction((source.textContent || '+ Shto').trim(),function(){source.click();},'＋');
    });
  }

  function enhanceEmptyStates() {
    var content = document.getElementById('content');
    if (!content) return;
    var emptyNodes = content.querySelectorAll('.empty-report');
    Array.prototype.forEach.call(emptyNodes,function(empty){
      if (empty.dataset.sgCreateEnhanced === '1') return;
      empty.dataset.sgCreateEnhanced = '1';
      var scope = empty.closest('.card') || content;
      var actions = existingAddButtons(scope);
      if (!actions.length) actions = viewActions(App.currentView);
      if (!actions.length) return;
      var holder = document.createElement('div');
      holder.className = 'sg-empty-create-actions no-print';
      actions.forEach(function(item){
        var button = document.createElement('button');
        button.type='button'; button.className='btn btn-primary';
        button.innerHTML='<span>'+item.icon+'</span> '+App.esc(item.label);
        button.addEventListener('click',item.action);
        holder.appendChild(button);
      });
      empty.appendChild(holder);
    });
  }

  var observer = new MutationObserver(function(){enhanceEmptyStates();});
  function start() {
    var content = document.getElementById('content');
    if (content) observer.observe(content,{childList:true,subtree:true});
    enhanceEmptyStates();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start);
  else start();

  App.enhanceEmptyCreateActions = enhanceEmptyStates;
})(window);
