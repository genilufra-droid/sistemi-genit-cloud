/* SG_PHASE73_ODOO_SHELL_START — Sistemi Genit */
(function (global) {
  'use strict';

  var App = global.App;
  if (!App || global.__SG_PHASE73_ODOO_SHELL__) return;
  global.__SG_PHASE73_ODOO_SHELL__ = true;

  var MODULES = [
    { id:'dashboard', label:'Paneli', icon:'▦', keywords:['dashboard','panel','kreu'] },
    { id:'purchase', label:'Blerje', icon:'🛒', keywords:['blerje','furnitor','porosi blerje','fature blerje','pranim','peshe'] },
    { id:'sales', label:'Shitje', icon:'🧾', keywords:['shitje','klient','oferte','fature shitje','porosi shitje','delivery'] },
    { id:'inventory', label:'Magazina', icon:'📦', keywords:['magazin','stok','inventar','flete hyrje','flete dalje','transfer'] },
    { id:'traceability', label:'Gjurmueshmëri', icon:'🌿', keywords:['gjurm','ferme','bime','peshe','lot','etikete','dosje'] },
    { id:'manufacturing', label:'Prodhimi', icon:'🏭', keywords:['prodhim','manufacturing','mrp','mostra','fushata','urdher pune','proces','makineri','paketim'] },
    { id:'finance', label:'Financa', icon:'💰', keywords:['finance','arke','banka','mandat','shpenzim','llogari','ditar'] },
    { id:'operations', label:'Operacione', icon:'🚚', keywords:['operacion','logjistik','shofer','itinerar','udhetim','karburant','mirembajtje','aset'] },
    { id:'reports', label:'Raporte', icon:'📊', keywords:['raport','analize','kartel','permbledhje'] },
    { id:'administration', label:'Administrim', icon:'⚙️', keywords:['kompani','perdorues','audit','konfigurim','kategori','rreth sistemit'] }
  ];

  var explicitRoutes = {
    mrpDashboard:{module:'manufacturing',label:'Paneli i Prodhimit',icon:'🏭',handler:'view_mrpDashboard'},
    mrpSamples:{module:'manufacturing',label:'Mostrat e Klientit',icon:'🧪',handler:'view_mrpSamples'},
    mrpCampaigns:{module:'manufacturing',label:'Fushatat e Prodhimit',icon:'📋',handler:'view_mrpCampaigns'},
    mrpWorkOrders:{module:'manufacturing',label:'Urdhrat e Punës',icon:'⚙️',handler:'view_mrpWorkOrders'},
    mrpProcesses:{module:'manufacturing',label:'Proceset',icon:'🔄',handler:'view_mrpProcesses'},
    mrpWorkCenters:{module:'manufacturing',label:'Makineritë / Qendrat e Punës',icon:'🏗️',handler:'view_mrpWorkCenters'},
    mrpRoutes:{module:'manufacturing',label:'Rrugët e Prodhimit',icon:'🧭',handler:'view_mrpRoutes'},
    mrpLocations:{module:'manufacturing',label:'Lokacionet e Prodhimit',icon:'📍',handler:'view_mrpLocations'},
    mrpFinalLots:{module:'manufacturing',label:'Lotet Finale të Klientit',icon:'🏷️',handler:'view_mrpFinalLots'}
  };

  var state = { routes:[], routeMap:{}, activeModule:'dashboard', searchIndex:[], baseNavigate:App.navigate, baseModal:App.modal, lastNumeric:null };

  function norm(value) {
    var text = String(value == null ? '' : value).toLocaleLowerCase('sq-AL');
    if (text.normalize) text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return text.replace(/ë/g,'e').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,' ').trim();
  }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function moduleById(id) { return MODULES.find(function (m) { return m.id === id; }) || MODULES[0]; }
  function dataView(item) {
    if (!item) return '';
    var data = item.dataset || {};
    var preferred = ['sgNavView','sg71View','sg62View','sg6View','sg5View','view','route'];
    for (var i=0;i<preferred.length;i+=1) if (data[preferred[i]]) return data[preferred[i]];
    var values = Object.keys(data).map(function(k){return data[k];}).filter(Boolean);
    if (values.length) return values[0];
    var inline = item.getAttribute && item.getAttribute('onclick');
    var match = String(inline || '').match(/App\.navigate\(\s*['\"]([^'\"]+)['\"]/);
    return match ? match[1] : '';
  }
  function cleanLabel(value) { return String(value || '').replace(/\s+/g,' ').trim(); }
  function sectionTitle(item) {
    var section = item && item.closest ? item.closest('.nav-section') : null;
    var title = section && section.querySelector('.nav-section-title');
    return cleanLabel(title ? title.textContent : '');
  }
  function classify(route) {
    if (route.module) return route.module;
    var text = norm([route.view,route.label,route.section].join(' '));
    if (/mrp|manufacturing|prodhim|mostr|fushat|urdhr pune|makineri|qender pune/.test(text)) return 'manufacturing';
    if (/gjurm|trace|ferm|bim|pesh|lot|etiket|dosje/.test(text)) return 'traceability';
    if (/financ|arke|bank|mandat|shpenzim|llogari|ditar/.test(text)) return 'finance';
    if (/operacion|logjistik|shofer|itinerar|udhetim|karburant|mirembajt|aset/.test(text)) return 'operations';
    if (/raport|analiz|kartel|permbledh/.test(text)) return 'reports';
    if (/blerj|furnitor|purchase|pranim/.test(text)) return 'purchase';
    if (/shitj|klient|sales|oferte/.test(text)) return 'sales';
    if (/magazin|stok|inventar|flete hyrje|flete dalje|transfer/.test(text)) return 'inventory';
    if (/kompani|perdorues|audit|rreth sistem|konfigur|kategori/.test(text)) return 'administration';
    if (/dashboard|panel|kreu/.test(text)) return 'dashboard';
    return 'administration';
  }
  function routeScore(route) {
    var score=0;
    if (route.handler && typeof App[route.handler] === 'function') score+=4;
    if (typeof App['view_'+route.view] === 'function') score+=3;
    if (route.view.indexOf('mrp')===0) score+=2;
    if (route.section) score+=1;
    return score;
  }

  function collectRoutes() {
    var found=[];
    Array.prototype.slice.call(document.querySelectorAll('.sidebar .nav-item')).forEach(function(item,index){
      var view=dataView(item),label=cleanLabel(item.textContent);
      if(!view||!label)return;
      found.push({view:view,label:label,icon:(item.querySelector('.icon')||{}).textContent||'•',section:sectionTitle(item),sourceIndex:index});
    });
    if(App.sgNavigationRegistry&&Array.isArray(App.sgNavigationRegistry.sections)){
      App.sgNavigationRegistry.sections.forEach(function(section){
        (section.items||[]).forEach(function(item){found.push({view:item.view,label:item.label,title:item.title,icon:item.icon||'•',handler:item.handler,args:item.args||[],section:section.title});});
      });
    }
    Object.keys(explicitRoutes).forEach(function(view){found.push(Object.assign({view:view,section:'PRODHIMI / MANUFACTURING'},explicitRoutes[view]));});

    var byView={};
    found.forEach(function(route){
      route.module=classify(route);
      route.label=cleanLabel(route.label||route.title||route.view);
      route.title=route.title||route.label;
      var current=byView[route.view];
      if(!current||routeScore(route)>routeScore(current))byView[route.view]=route;
    });
    var byFeature={};
    Object.keys(byView).forEach(function(view){
      var route=byView[view],key=route.module+'|'+norm(route.label)
        .replace(/^paneli /,'panel ')
        .replace(/formulari i peshave|formularet e peshes|formulari i peshes/g,'formular peshe');
      var current=byFeature[key];
      if(!current||routeScore(route)>routeScore(current))byFeature[key]=route;
    });
    state.routes=Object.keys(byFeature).map(function(key){return byFeature[key];}).sort(function(a,b){
      var ma=MODULES.findIndex(function(m){return m.id===a.module;}),mb=MODULES.findIndex(function(m){return m.id===b.module;});
      return ma-mb||a.sourceIndex-b.sourceIndex||a.label.localeCompare(b.label,'sq');
    });
    state.routeMap={};state.routes.forEach(function(route){state.routeMap[route.view]=route;});
    buildSearchIndex();
  }

  function buildSearchIndex() {
    var rows=[];
    MODULES.forEach(function(m){rows.push({kind:'module',id:m.id,label:m.label,sub:'Modul',search:norm([m.label].concat(m.keywords).join(' '))});});
    state.routes.forEach(function(r){rows.push({kind:'route',id:r.view,label:r.label,sub:moduleById(r.module).label,search:norm([r.label,r.title,r.section,r.view].join(' '))});});
    var data=App.data||{};
    function addRecords(key,kind,labelFn,subFn,openFn){(data[key]||[]).slice(0,2500).forEach(function(row){var label=labelFn(row);if(!label)return;rows.push({kind:kind,id:row.id,label:label,sub:subFn(row),search:norm(JSON.stringify(row)),open:function(){openFn(row);}});});}
    addRecords('products','record',function(x){return (x.code?x.code+' — ':'')+(x.name||'');},function(){return'Artikull';},function(){openBestRoute(['artikuj','produkte','products']);});
    addRecords('partners','record',function(x){return (x.code?x.code+' — ':'')+(x.name||'');},function(x){return /SUPPLIER/.test(String(x.partnerType||x.partner_type||''))?'Furnitor':'Klient';},function(x){openBestRoute(/SUPPLIER/.test(String(x.partnerType||x.partner_type||''))?['furnitore']:['kliente']);});
    addRecords('lots','record',function(x){return x.lotNumber||x.lot_number;},function(x){return'Lot · '+(x.productName||'');},function(x){if(App.sg72OpenLotDocument)App.sg72OpenLotDocument(x.id);else if(App.openLotLabel58)App.openLotLabel58(x.id);});
    addRecords('expenses','record',function(x){return x.expenseNo||x.expense_no;},function(x){return'Shpenzim · '+(x.description||'');},function(x){if(App.sg61OpenExpenseDocument)App.sg61OpenExpenseDocument(x.id);else App.navigate('expenses');});
    addRecords('financeDocuments','record',function(x){return x.documentNo||x.document_no;},function(){return'Dokument financiar';},function(x){if(App.sg72OpenBusinessDocument)App.sg72OpenBusinessDocument(x.id);else App.navigate('financeJournal');});
    state.searchIndex=rows;
  }

  function openBestRoute(words) {
    var wanted=(words||[]).map(norm),route=state.routes.find(function(r){var text=norm(r.label+' '+r.view+' '+r.section);return wanted.some(function(w){return text.indexOf(w)>=0;});});
    if(route)App.navigate(route.view);
  }

  function installStyle() {
    if(document.getElementById('sg73-odoo-shell-style'))return;
    var style=document.createElement('style');style.id='sg73-odoo-shell-style';style.textContent=[
      ':root{--sg73-purple:#714b67;--sg73-purple-dark:#4b3046;--sg73-bg:#f6f7f9;--sg73-border:#dfe3e8;--sg73-text:#252733}',
      'body{background:var(--sg73-bg)!important;color:var(--sg73-text)}',
      '.sidebar{background:#fff!important;color:#394150!important;border-right:1px solid var(--sg73-border);box-shadow:none!important;padding-top:0!important;overflow:auto}',
      '.sg73-sidebar-head{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid var(--sg73-border);padding:14px 14px 12px}',
      '.sg73-app-button{width:100%;display:flex;align-items:center;gap:11px;border:0;background:transparent;padding:7px 4px;text-align:left;color:var(--sg73-text);cursor:pointer}',
      '.sg73-app-button .grid{display:grid;grid-template-columns:repeat(3,5px);gap:3px}.sg73-app-button .grid i{width:5px;height:5px;border-radius:1px;background:var(--sg73-purple)}',
      '.sg73-app-button strong{font-size:15px}.sg73-app-button small{display:block;color:#7b8492;font-size:11px;margin-top:2px}',
      '.sg73-side-search{position:relative;margin-top:10px}.sg73-side-search input,.sg73-command input{width:100%;border:1px solid #cfd5dc;border-radius:8px;background:#fff;padding:10px 12px 10px 36px;font-size:14px;outline:none}.sg73-side-search:before,.sg73-command:before{content:"⌕";position:absolute;left:12px;top:8px;font-size:20px;color:#6b7280}.sg73-side-search input:focus,.sg73-command input:focus{border-color:var(--sg73-purple);box-shadow:0 0 0 3px rgba(113,75,103,.12)}',
      '.sg73-side-title{padding:15px 18px 7px;color:#9096a1;font-size:10px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}',
      '.sidebar .sg73-route{display:flex;align-items:center;gap:11px;margin:1px 8px;padding:10px 12px;border-radius:7px;color:#4b5563;cursor:pointer;font-size:14px}.sidebar .sg73-route:hover{background:#f3eef2;color:var(--sg73-purple-dark)}.sidebar .sg73-route.active{background:#ede5eb;color:var(--sg73-purple-dark);font-weight:700}.sidebar .sg73-route .icon{width:22px;text-align:center;font-size:17px}',
      '.sg73-command{position:relative;max-width:480px;min-width:280px;flex:1;margin:0 20px}.sg73-command input{background:#f8f9fb}',
      '.sg73-results{position:absolute;left:0;right:0;top:calc(100% + 7px);background:#fff;border:1px solid var(--sg73-border);border-radius:10px;box-shadow:0 16px 40px rgba(31,41,55,.18);max-height:420px;overflow:auto;display:none;z-index:10000}.sg73-results.open{display:block}.sg73-result{display:flex;align-items:center;gap:12px;width:100%;border:0;border-bottom:1px solid #f0f1f3;background:#fff;padding:11px 13px;text-align:left;cursor:pointer}.sg73-result:hover{background:#f7f2f6}.sg73-result .ico{width:30px;height:30px;border-radius:7px;background:#eee6ec;color:var(--sg73-purple);display:flex;align-items:center;justify-content:center}.sg73-result strong{display:block;color:#24262f}.sg73-result small{color:#7b8492}',
      '.sg73-launcher{position:fixed;inset:0;background:rgba(28,23,28,.45);backdrop-filter:blur(2px);z-index:20000;display:none;padding:70px 7vw}.sg73-launcher.open{display:block}.sg73-launcher-card{max-width:980px;margin:auto;background:#fff;border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.25);padding:24px}.sg73-launcher-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.sg73-launcher-head h2{margin:0}.sg73-close{border:0;background:#f1f2f4;border-radius:50%;width:36px;height:36px;font-size:20px;cursor:pointer}.sg73-app-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:13px}.sg73-app-tile{border:1px solid var(--sg73-border);border-radius:11px;background:#fff;padding:18px 14px;text-align:left;cursor:pointer;min-height:112px}.sg73-app-tile:hover{border-color:var(--sg73-purple);box-shadow:0 8px 24px rgba(113,75,103,.12);transform:translateY(-1px)}.sg73-app-tile .ico{font-size:30px;display:block;margin-bottom:10px}.sg73-app-tile strong{font-size:15px}.sg73-app-tile small{display:block;color:#7b8492;margin-top:5px}',
      '.sg73-native-select{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important}.sg73-combo{position:relative;width:100%}.sg73-combo-input{width:100%!important;border:1px solid #cfd5dc!important;border-radius:7px!important;background:#fff!important;padding:9px 34px 9px 11px!important;min-height:39px!important}.sg73-combo:after{content:"⌕";position:absolute;right:11px;top:7px;color:#7b8492;font-size:18px}.sg73-combo-menu{position:absolute;left:0;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--sg73-border);border-radius:8px;box-shadow:0 12px 30px rgba(0,0,0,.16);max-height:260px;overflow:auto;display:none;z-index:25000}.sg73-combo.open .sg73-combo-menu{display:block}.sg73-combo-option{display:block;width:100%;border:0;border-bottom:1px solid #f1f2f4;background:#fff;padding:10px;text-align:left;cursor:pointer}.sg73-combo-option:hover,.sg73-combo-option.active{background:#f5eff4;color:var(--sg73-purple-dark)}.sg73-combo-empty{padding:13px;color:#7b8492}',
      '.content,.main-content{background:var(--sg73-bg)!important}.card,.sg71-sheet,.sg62-toolbar{border:1px solid var(--sg73-border)!important;border-radius:9px!important;box-shadow:none!important}.btn-primary,.sg71-btn-primary{background:var(--sg73-purple)!important;border-color:var(--sg73-purple)!important}.topbar{background:#fff!important;border-bottom:1px solid var(--sg73-border)!important;box-shadow:none!important}',
      '@media(max-width:850px){.sg73-command{position:fixed;left:12px;right:12px;top:10px;max-width:none;min-width:0;z-index:19000}.sg73-launcher{padding:62px 12px 20px}.sg73-launcher-card{padding:16px}.sg73-app-grid{grid-template-columns:repeat(2,1fr)}.sidebar{width:270px!important}.sg73-command input{font-size:16px}}'
    ].join('');document.head.appendChild(style);
  }

  function removeOldNavigation(sidebar) {
    Array.prototype.slice.call(sidebar.querySelectorAll('.nav-section,.nav-item,.sg73-sidebar-head,.sg73-side-title,.sg73-route')).forEach(function(node){if(node.parentNode)node.parentNode.removeChild(node);});
  }
  function currentModuleRoutes() { return state.routes.filter(function(r){return r.module===state.activeModule;}); }
  function rebuildSidebar() {
    var sidebar=document.querySelector('.sidebar');if(!sidebar)return;
    removeOldNavigation(sidebar);
    var module=moduleById(state.activeModule),head=document.createElement('div');head.className='sg73-sidebar-head';
    head.innerHTML='<button type="button" class="sg73-app-button"><span class="grid">'+new Array(9).fill('<i></i>').join('')+'</span><span><strong>'+esc(module.label)+'</strong><small>Hap modulet</small></span></button><div class="sg73-side-search"><input type="search" placeholder="Filtro '+esc(module.label)+'..."></div>';
    sidebar.appendChild(head);
    head.querySelector('.sg73-app-button').addEventListener('click',openLauncher);
    head.querySelector('input').addEventListener('input',function(){filterSidebar(this.value);});
    var title=document.createElement('div');title.className='sg73-side-title';title.textContent=module.label;sidebar.appendChild(title);
    var rows=currentModuleRoutes();
    if(!rows.length){var empty=document.createElement('div');empty.className='sg73-side-title';empty.textContent='Nuk ka menu të regjistruara';sidebar.appendChild(empty);return;}
    rows.forEach(function(route){var node=document.createElement('div');node.className='sg73-route'+(App.currentView===route.view?' active':'');node.dataset.view=route.view;node.dataset.search=norm(route.label+' '+route.view);node.innerHTML='<span class="icon">'+esc(route.icon||'•')+'</span><span>'+esc(route.label)+'</span>';node.addEventListener('click',function(){App.navigate(route.view);});sidebar.appendChild(node);});
  }
  function filterSidebar(query){var q=norm(query);document.querySelectorAll('.sidebar .sg73-route').forEach(function(node){node.style.display=!q||node.dataset.search.indexOf(q)>=0?'flex':'none';});}

  function launcherHtml(){return'<div class="sg73-launcher-card"><div class="sg73-launcher-head"><div><h2>Modulet</h2><small>Zgjidh hapësirën e punës</small></div><button class="sg73-close" type="button">×</button></div><div class="sg73-app-grid">'+MODULES.map(function(m){var count=state.routes.filter(function(r){return r.module===m.id;}).length;return'<button type="button" class="sg73-app-tile" data-module="'+m.id+'"><span class="ico">'+m.icon+'</span><strong>'+esc(m.label)+'</strong><small>'+count+' funksione</small></button>';}).join('')+'</div></div>';}
  function ensureLauncher(){var layer=document.getElementById('sg73-launcher');if(layer)return layer;layer=document.createElement('div');layer.id='sg73-launcher';layer.className='sg73-launcher';layer.innerHTML=launcherHtml();document.body.appendChild(layer);layer.querySelector('.sg73-close').addEventListener('click',closeLauncher);layer.addEventListener('click',function(e){if(e.target===layer)closeLauncher();});layer.querySelectorAll('[data-module]').forEach(function(btn){btn.addEventListener('click',function(){openModule(btn.dataset.module);});});return layer;}
  function openLauncher(){ensureLauncher().classList.add('open');}
  function closeLauncher(){var layer=document.getElementById('sg73-launcher');if(layer)layer.classList.remove('open');}
  function openModule(id){state.activeModule=id;closeLauncher();rebuildSidebar();var first=currentModuleRoutes()[0];if(first)App.navigate(first.view);}

  function ensureCommandSearch(){var top=document.querySelector('.topbar');if(!top||document.getElementById('sg73-command'))return;var box=document.createElement('div');box.id='sg73-command';box.className='sg73-command';box.innerHTML='<input type="search" autocomplete="off" placeholder="Kërko module, dokumente, artikuj, fermerë, lote... (Ctrl+K)"><div class="sg73-results"></div>';top.insertBefore(box,top.lastChild||null);var input=box.querySelector('input');input.addEventListener('input',function(){renderSearch(this.value);});input.addEventListener('focus',function(){renderSearch(this.value);});input.addEventListener('keydown',function(e){if(e.key==='Escape'){closeSearch();input.blur();}if(e.key==='Enter'){var first=box.querySelector('.sg73-result');if(first){e.preventDefault();first.click();}}});}
  function renderSearch(query){var box=document.getElementById('sg73-command'),results=box&&box.querySelector('.sg73-results');if(!results)return;var q=norm(query),rows=(q?state.searchIndex.filter(function(x){return x.search.indexOf(q)>=0;}):state.searchIndex.filter(function(x){return x.kind==='module';})).slice(0,30);results.innerHTML=rows.length?rows.map(function(x,i){return'<button type="button" class="sg73-result" data-index="'+i+'"><span class="ico">'+(x.kind==='module'?moduleById(x.id).icon:x.kind==='route'?'↗':'⌕')+'</span><span><strong>'+esc(x.label)+'</strong><small>'+esc(x.sub)+'</small></span></button>';}).join(''):'<div class="sg73-combo-empty">Nuk u gjet asnjë rezultat</div>';results.classList.add('open');results.querySelectorAll('.sg73-result').forEach(function(btn){btn.addEventListener('click',function(){var row=rows[Number(btn.dataset.index)];closeSearch();if(row.kind==='module')openModule(row.id);else if(row.kind==='route')App.navigate(row.id);else if(row.open)row.open();});});}
  function closeSearch(){var results=document.querySelector('#sg73-command .sg73-results');if(results)results.classList.remove('open');}

  function selectedText(select){var option=select.options[select.selectedIndex];return option&&option.value?option.textContent.trim():'';}
  function removeOldCombo(select){var old=select.nextElementSibling;if(old&&(old.classList.contains('sg61-combo')||old.classList.contains('sg73-combo')))old.remove();select.classList.remove('sg61-native-select');}
  function enhanceSelect(select){
    if(!select||select.disabled||select.multiple||select.dataset.sg73Search==='done')return;
    if(select.options.length<2)return;
    removeOldCombo(select);select.dataset.sg73Search='done';select.classList.add('sg73-native-select');
    var combo=document.createElement('div');combo.className='sg73-combo';var input=document.createElement('input');input.type='search';input.className='sg73-combo-input';input.autocomplete='off';input.placeholder='Kërko...';input.value=selectedText(select);var menu=document.createElement('div');menu.className='sg73-combo-menu';combo.appendChild(input);combo.appendChild(menu);select.insertAdjacentElement('afterend',combo);
    function render(q){var query=norm(q),options=Array.prototype.slice.call(select.options).filter(function(o){return !query||norm(o.textContent).indexOf(query)>=0;}).slice(0,150);menu.innerHTML=options.length?options.map(function(o,i){return'<button type="button" class="sg73-combo-option'+(o.value===select.value?' active':'')+'" data-index="'+i+'">'+esc(o.textContent.trim())+'</button>';}).join(''):'<div class="sg73-combo-empty">Nuk u gjet asnjë rezultat</div>';menu.querySelectorAll('button').forEach(function(btn){btn.addEventListener('mousedown',function(e){e.preventDefault();var option=options[Number(btn.dataset.index)];select.value=option.value;input.value=option.value?option.textContent.trim():'';select.dispatchEvent(new Event('change',{bubbles:true}));combo.classList.remove('open');});});}
    input.addEventListener('focus',function(){document.querySelectorAll('.sg73-combo.open').forEach(function(x){if(x!==combo)x.classList.remove('open');});combo.classList.add('open');render(input.value);input.select();});
    input.addEventListener('input',function(){combo.classList.add('open');render(input.value);});
    input.addEventListener('keydown',function(e){if(e.key==='Escape'){combo.classList.remove('open');input.value=selectedText(select);}if(e.key==='Enter'){var first=menu.querySelector('button');if(first){e.preventDefault();first.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));}}});
    select.addEventListener('change',function(){input.value=selectedText(select);});
  }
  function enhanceSelects(root){Array.prototype.slice.call((root||document).querySelectorAll('select')).forEach(enhanceSelect);}

  function numericAddress(input){var root=input.closest('#modal-box,.modal-content,#content')||document.body;var tables=Array.prototype.slice.call(root.querySelectorAll('table')),table=input.closest('table'),tableIndex=table?tables.indexOf(table):-1,row=input.closest('tr'),cell=input.closest('td,th');return{rootId:root.id||'',rootClass:root.className||'',id:input.id||'',name:input.name||'',value:input.value,selection:input.value.length,tableIndex:tableIndex,rowIndex:row&&row.parentNode?Array.prototype.indexOf.call(row.parentNode.children,row):-1,cellIndex:cell&&row?Array.prototype.indexOf.call(row.children,cell):-1,inputIndex:cell?Array.prototype.indexOf.call(cell.querySelectorAll('input[type="number"]'),input):-1};}
  function restoreNumeric(address,oldInput){if(document.contains(oldInput))return;var root=address.rootId?document.getElementById(address.rootId):document.querySelector('.modal-content')||document.getElementById('content');if(!root)return;var target=address.id?document.getElementById(address.id):null;if(!target&&address.tableIndex>=0){var table=root.querySelectorAll('table')[address.tableIndex],rows=table&&table.querySelectorAll('tbody tr'),row=rows&&rows[address.rowIndex],cell=row&&row.children[address.cellIndex];target=cell&&cell.querySelectorAll('input[type="number"]')[address.inputIndex];}if(target){target.value=address.value;target.focus();try{target.setSelectionRange(address.selection,address.selection);}catch(_e){}}}
  function installNumericStabilizer(){document.addEventListener('input',function(e){var input=e.target;if(!input||input.tagName!=='INPUT'||input.type!=='number')return;var address=numericAddress(input);setTimeout(function(){restoreNumeric(address,input);},0);},true);
    if(App.SGPhase71&&App.SGPhase71.state){var S=App.SGPhase71.state;
      var sample=App.sg71SampleChange;App.sg71SampleChange=function(i,k,v){if(k==='quantity'){if(S.sampleRows[i])S.sampleRows[i][k]=Number(v||0);return;}return sample.apply(this,arguments);};
      var work=App.sg71WorkChange;App.sg71WorkChange=function(i,k,v){if(k==='plannedQuantity'||k==='bagCount'){if(S.workRows[i])S.workRows[i][k]=Number(v||0);return;}return work.apply(this,arguments);};
      var finalChange=App.sg71FinalChange;App.sg71FinalChange=function(i,k,v){if(k==='quantity'){if(S.finalRows[i])S.finalRows[i][k]=Number(v||0);return;}return finalChange.apply(this,arguments);};
    }}

  function routeHandler(route){if(route.handler&&typeof App[route.handler]==='function')return function(){return App[route.handler].apply(App,route.args||[]);};var direct=App['view_'+route.view];if(typeof direct==='function')return function(){return direct.call(App);};return null;}
  function setActive(route){if(route){state.activeModule=route.module;App.currentView=route.view;}rebuildSidebar();}
  function installNavigation(){var base=state.baseNavigate;App.navigate=function(view){var route=state.routeMap[view],handler=route&&routeHandler(route);if(route&&handler){setActive(route);try{var result=handler();if(result&&typeof result.then==='function')return result.then(function(x){setTimeout(function(){enhanceSelects(document);},0);return x;}).catch(function(e){App.toast('Moduli “'+route.label+'” nuk u hap: '+(e.message||e),'error');});setTimeout(function(){enhanceSelects(document);},0);return result;}catch(e){App.toast('Moduli “'+route.label+'” nuk u hap: '+(e.message||e),'error');return;}}var result=base.apply(this,arguments);setTimeout(function(){enhanceSelects(document);},0);return result;};}
  function installModal(){var base=state.baseModal;if(typeof base!=='function')return;App.modal=function(){var result=base.apply(this,arguments);setTimeout(function(){enhanceSelects(document);},0);return result;};}

  function start(){installStyle();collectRoutes();installNavigation();installModal();installNumericStabilizer();state.activeModule=(state.routeMap[App.currentView]||{}).module||'dashboard';rebuildSidebar();ensureLauncher();ensureCommandSearch();enhanceSelects(document);document.addEventListener('click',function(e){if(!e.target.closest('.sg73-command'))closeSearch();if(!e.target.closest('.sg73-combo'))document.querySelectorAll('.sg73-combo.open').forEach(function(x){x.classList.remove('open');});});document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'){e.preventDefault();var input=document.querySelector('#sg73-command input');if(input){input.focus();input.select();}}});}

  App.SGPhase73={state:state,start:start,collectRoutes:collectRoutes,openModule:openModule,search:function(q){var x=norm(q);return state.searchIndex.filter(function(r){return r.search.indexOf(x)>=0;});},enhanceSelects:enhanceSelects};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})(window);
/* SG_PHASE73_ODOO_SHELL_END */
