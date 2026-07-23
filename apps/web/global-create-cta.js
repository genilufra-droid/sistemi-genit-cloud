/* Sistemi Genit — Global “Kërko ose Shto” me rikthim në formularin burim */
(function (global) {
  'use strict';

  var App = global.App;
  var SAC = global.SAC;
  var Auth = global.Auth;
  if (!App || global.__SG_GLOBAL_CREATE_CTA__) return;
  global.__SG_GLOBAL_CREATE_CTA__ = true;

  var quickCreateContext = null;
  var quickCounter = 0;

  function lower(value) { return String(value == null ? '' : value).toLocaleLowerCase('sq-AL'); }
  function textOfInput(input) {
    if (!input) return '';
    var group = input.closest('.form-group');
    var label = group && group.querySelector('label');
    return [input.id,input.name,input.placeholder,label && label.textContent].filter(Boolean).join(' ');
  }
  function setPrefill(ids,value) {
    if (!value) return;
    function apply() {
      for (var i=0;i<ids.length;i+=1) {
        var element=document.getElementById(ids[i]);
        if (element && !element.value) {
          element.value=value;
          element.dispatchEvent(new Event('input',{bubbles:true}));
          element.focus();
          return true;
        }
      }
      return false;
    }
    if (apply()) return;
    setTimeout(apply,60); setTimeout(apply,220);
  }
  function invoke(candidates,args) {
    args=args||[];
    for(var i=0;i<candidates.length;i+=1){
      var fn=App[candidates[i]];
      if(typeof fn==='function'){fn.apply(App,args);return true;}
    }
    return false;
  }
  function canCreate(definition) {
    var permission=definition && definition.permission || 'masters.manage';
    if(!Auth || typeof Auth.hasPermission!=='function') return true;
    return Auth.hasPermission(permission);
  }
  function ensureInputId(input) {
    if (!input) return '';
    if (!input.id) { quickCounter+=1; input.id='sg-quick-source-'+quickCounter; }
    return input.id;
  }
  function snapshotSource(input,definition) {
    var overlay=document.getElementById('modal-overlay');
    var modalBox=document.getElementById('modal-box');
    var content=document.getElementById('content');
    return {
      definitionKey:definition.key,
      sourceView:App.currentView || '',
      sourceInputId:ensureInputId(input),
      sourceQuery:input ? input.value.trim() : '',
      sourceModalVisible:Boolean(overlay && overlay.classList.contains('show')),
      modalHtml:modalBox ? modalBox.innerHTML : '',
      contentHtml:content ? content.innerHTML : '',
      createdAt:Date.now()
    };
  }
  function restoreSource(context) {
    if(!context) return null;
    var overlay=document.getElementById('modal-overlay');
    var modalBox=document.getElementById('modal-box');
    var content=document.getElementById('content');
    if(content && context.contentHtml) content.innerHTML=context.contentHtml;
    if(context.sourceModalVisible && overlay && modalBox){
      modalBox.innerHTML=context.modalHtml;
      overlay.classList.add('show');
    } else if(overlay) {
      overlay.classList.remove('show');
    }
    return document.getElementById(context.sourceInputId);
  }
  function normalizedRow(row) {
    row=row||{};
    var out={};
    Object.keys(row).forEach(function(key){out[key.replace(/_([a-z])/g,function(_,c){return c.toUpperCase();})]=row[key];});
    return out;
  }
  function applySelection(input,row) {
    if(!input || !row) return false;
    var x=normalizedRow(row);
    input.dataset.selectedId=x.id || '';
    input.dataset.selectedCode=x.code || x.id || '';
    input.value=x.name || x.fullName || x.code || '';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    input.focus();
    return true;
  }

  App.beginQuickCreate=function(input,definition){
    if(!definition || !canCreate(definition)) return false;
    quickCreateContext=snapshotSource(input,definition);
    this._quickCreateContext=quickCreateContext;
    return true;
  };
  App.hasQuickCreateContext=function(key){return Boolean(quickCreateContext && (!key || quickCreateContext.definitionKey===key));};
  App.completeQuickCreate=function(key,row){
    if(!quickCreateContext || (key && quickCreateContext.definitionKey!==key)) return false;
    var context=quickCreateContext;
    quickCreateContext=null; this._quickCreateContext=null;
    var input=restoreSource(context);
    applySelection(input,row);
    if(this.enhanceEmptyCreateActions)this.enhanceEmptyCreateActions();
    this.toast('U krijua dhe u zgjodh automatikisht: '+((normalizedRow(row).name)||normalizedRow(row).code||'rekordi i ri'));
    return true;
  };
  App.cancelQuickCreate=function(){
    if(!quickCreateContext)return false;
    var context=quickCreateContext;
    quickCreateContext=null;this._quickCreateContext=null;
    restoreSource(context);
    return true;
  };

  var baseCloseModal=typeof App.closeModal==='function'?App.closeModal.bind(App):null;
  if(baseCloseModal){
    App.closeModal=function(){
      if(quickCreateContext) return this.cancelQuickCreate();
      return baseCloseModal();
    };
  }

  var entityDefinitions=[
    {key:'supplier',match:/furnitor|supplier|fermer/,label:'Furnitor / Fermer',icon:'🌱',permission:'masters.manage',create:function(q){if(invoke(['editPartner'],['supplier']))setPrefill(['p-name','partner-name','supplier-name'],q);}},
    {key:'customer',match:/klient|customer|bler[eë]s/,label:'Klient',icon:'👤',permission:'masters.manage',create:function(q){if(invoke(['editPartner'],['customer']))setPrefill(['p-name','partner-name','customer-name'],q);}},
    {key:'product',match:/artikull|product|produkt|mall/,label:'Artikull',icon:'📦',permission:'masters.manage',create:function(q){if(invoke(['editProduct']))setPrefill(['pr-name','product-name','item-name'],q);}},
    {key:'farm',match:/ferm[aë]|origjin[aë]/,label:'Fermë / Zonë',icon:'🌿',permission:'masters.manage',create:function(q){if(invoke(['editTraceFarm','editFarm']))setPrefill(['farm-name','tf-name'],q);}},
    {key:'parcel',match:/parcel|zon[aë] mbledh/,label:'Parcelë / Zonë mbledhjeje',icon:'📍',permission:'masters.manage',create:function(q){if(invoke(['editTraceParcel','editParcel']))setPrefill(['parcel-name','tp-name'],q);}},
    {key:'warehouse',match:/magazin|warehouse/,label:'Magazinë',icon:'🏬',permission:'masters.manage',create:function(q){if(!invoke(['editWarehouse']))App.navigate('settings');setPrefill(['warehouse-name','wh-name'],q);}},
    {key:'category',match:/kategori|category/,label:'Kategori',icon:'🗂️',permission:'masters.manage',create:function(q){if(!invoke(['editCategory','editProductCategory']))App.navigate('settings');setPrefill(['category-name','cat-name'],q);}},
    {key:'agent',match:/agjent|shit[eë]s|salesman/,label:'Agjent',icon:'🧑‍💼',permission:'masters.manage',create:function(q){if(!invoke(['editAgent','editSalesman']))App.navigate('settings');setPrefill(['agent-name','salesman-name'],q);}},
    {key:'vehicle',match:/automjet|mjet|targ[aë]|vehicle|kamion/,label:'Automjet',icon:'🚚',permission:'masters.manage',create:function(q){if(invoke(['editLogisticsVehicle','editVehicle']))setPrefill(['vehicle-plate','vehicle-name','lv-plate'],q);}},
    {key:'asset',match:/aset|makineri|pajisje|asset/,label:'Aset / Makineri',icon:'🏭',permission:'masters.manage',create:function(q){if(invoke(['editFixedAsset','editAsset']))setPrefill(['asset-name','fa-name'],q);}}
  ];
  function definitionForInput(input){
    var context=lower(textOfInput(input));
    if(/lot|serial/.test(context))return null;
    for(var i=0;i<entityDefinitions.length;i+=1)if(entityDefinitions[i].match.test(context))return entityDefinitions[i];
    return null;
  }
  App.registerCreateOnNoResult=function(definition){if(definition&&definition.key&&typeof definition.create==='function')entityDefinitions.unshift(definition);};
  App.createFromNoResult=function(input,definition){
    if(!definition||typeof definition.create!=='function'||!canCreate(definition))return;
    if(!this.beginQuickCreate(input,definition))return;
    definition.create(input?input.value.trim():'');
  };

  if(SAC&&typeof SAC._render==='function'&&!SAC.__sgCreatePatched){
    var baseRender=SAC._render.bind(SAC);
    SAC._render=function(resultsEl,items,opts,instId){
      baseRender(resultsEl,items,opts,instId);
      if(items&&items.length)return;
      var instance=SAC.instances&&SAC.instances[instId];
      var input=instance&&instance.input;
      var definition=(opts&&opts.createDefinition)||definitionForInput(input);
      if(!definition||!canCreate(definition))return;
      var empty=resultsEl.querySelector('.sac-empty');
      if(!empty||empty.querySelector('.sg-create-no-result'))return;
      var query=input?input.value.trim():'';
      var button=document.createElement('button');
      button.type='button';button.className='sg-create-no-result';
      button.innerHTML='<span>'+String(definition.icon||'＋')+'</span><strong>+ Shto '+String(definition.label||'të ri')+'</strong>'+(query?'<small>“'+App.esc(query)+'”</small>':'');
      button.addEventListener('mousedown',function(event){event.preventDefault();event.stopPropagation();});
      button.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();resultsEl.classList.remove('show');App.createFromNoResult(input,definition);});
      empty.appendChild(button);
    };
    SAC.__sgCreatePatched=true;
  }

  function buttonAction(label,action,icon,permission){return{label:label,action:action,icon:icon||'＋',permission:permission||'documents.create'};}
  function viewActions(view){
    var map={
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
    return (map[view]||[]).filter(function(item){return !Auth||!Auth.hasPermission||Auth.hasPermission(item.permission);});
  }
  function existingAddButtons(scope){
    return Array.prototype.slice.call(scope.querySelectorAll('button,a.btn')).filter(function(element){
      if(element.closest('.sg-empty-create-actions'))return false;
      var label=lower(element.textContent);
      return /^\s*\+/.test(element.textContent||'')||/\bshto\b|\bi ri\b|\be re\b/.test(label);
    }).slice(0,3).map(function(source){return buttonAction((source.textContent||'+ Shto').trim(),function(){source.click();},'＋');});
  }
  function enhanceEmptyStates(){
    var content=document.getElementById('content');if(!content)return;
    Array.prototype.forEach.call(content.querySelectorAll('.empty-report'),function(empty){
      if(empty.dataset.sgCreateEnhanced==='1')return;
      empty.dataset.sgCreateEnhanced='1';
      var scope=empty.closest('.card')||content;
      var actions=existingAddButtons(scope);if(!actions.length)actions=viewActions(App.currentView);if(!actions.length)return;
      var holder=document.createElement('div');holder.className='sg-empty-create-actions no-print';
      actions.forEach(function(item){var button=document.createElement('button');button.type='button';button.className='btn btn-primary';button.innerHTML='<span>'+item.icon+'</span> '+App.esc(item.label);button.addEventListener('click',item.action);holder.appendChild(button);});
      empty.appendChild(holder);
    });
  }
  var observer=new MutationObserver(function(){enhanceEmptyStates();});
  function start(){var content=document.getElementById('content');if(content)observer.observe(content,{childList:true,subtree:true});enhanceEmptyStates();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  App.enhanceEmptyCreateActions=enhanceEmptyStates;
})(window);
