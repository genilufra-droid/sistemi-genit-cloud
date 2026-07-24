import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const dom=new JSDOM(`<!doctype html><html><head></head><body>
  <aside class="sidebar">
    <div class="nav-section"><div class="nav-section-title">BLERJE</div><div class="nav-item" data-view="purchases"><span class="icon">🛒</span><span>Blerje</span></div></div>
    <div class="nav-section" id="sg71-mrp-nav"><div class="nav-section-title">PRODHIMI / MANUFACTURING</div>
      <div class="nav-item" data-sg71-view="mrpDashboard"><span class="icon">🏭</span><span>Paneli i Prodhimit</span></div>
      <div class="nav-item" data-sg71-view="mrpWorkOrders"><span class="icon">⚙️</span><span>Urdhrat e Punës</span></div>
    </div>
  </aside>
  <header class="topbar"><h2>Dashboard</h2><div class="user">User</div></header>
  <main id="content"></main>
  <div id="modal-box"></div>
</body></html>`,{runScripts:'outside-only',url:'https://example.test'});
const {window}=dom;
const calls=[];
const state={sampleRows:[{lotId:'lot-1',quantity:0}],workRows:[{plannedQuantity:0,bagCount:0}],finalRows:[{quantity:0}]};
window.App={
  data:{products:[{id:'p1',code:'105',name:'Ferra'}],partners:[{id:'s1',code:'264',name:'Sokol Kola',partnerType:'SUPPLIER'}],lots:[{id:'l1',lotNumber:'B0S010/1-I-105-26',productName:'Ferra'}]},
  currentView:'dashboard',
  navigate(view){calls.push(['base',view]);},
  modal(){calls.push(['modal']);},
  toast(message,type){calls.push(['toast',type,message]);},
  view_mrpDashboard(){calls.push(['mrpDashboard']);window.document.getElementById('content').textContent='MRP';},
  view_mrpWorkOrders(){calls.push(['mrpWorkOrders']);},
  SGPhase71:{state},
  sg71SampleChange(){calls.push(['oldSampleChange']);},
  sg71WorkChange(){calls.push(['oldWorkChange']);},
  sg71FinalChange(){calls.push(['oldFinalChange']);}
};
window.console=console;
const source=fs.readFileSync(path.resolve('apps/web/phase73-odoo-shell.js'),'utf8');
assert.equal(source.includes('MutationObserver'),false,'Shell-i final nuk duhet të përdorë MutationObserver.');
window.eval(source);
await new Promise((resolve)=>setTimeout(resolve,0));

assert.ok(window.App.SGPhase73,'Phase 7.3 duhet të instalohet.');
assert.ok(window.App.SGPhase73.state.routeMap.mrpDashboard,'Manufacturing duhet të regjistrohet në hartën finale.');
window.App.navigate('mrpDashboard');
assert.ok(calls.some((row)=>row[0]==='mrpDashboard'),'Paneli i Prodhimit duhet të hapet me handler real.');
assert.equal(calls.some((row)=>row[0]==='base'&&row[1]==='mrpDashboard'),false,'Manufacturing nuk duhet të bjerë te navigimi i vjetër.');
assert.equal(window.document.querySelectorAll('.sidebar .nav-section').length,0,'Menutë e vjetra duhet të hiqen.');
assert.ok(window.document.querySelector('.sidebar .sg73-route'),'Sidebar-i Odoo duhet të ketë rrugë të vetme.');

const search=window.App.SGPhase73.search('blerje');
assert.ok(search.some((row)=>row.kind==='module'&&row.id==='purchase'),'Kërkimi universal duhet të gjejë modulin Blerje.');
assert.ok(search.some((row)=>row.kind==='route'&&row.id==='purchases'),'Kërkimi universal duhet të gjejë funksionin Blerje.');

const select=window.document.createElement('select');
select.id='supplier';select.innerHTML='<option value="">Zgjidh</option><option value="1">264 — Sokol Kola</option><option value="2">265 — Agim Flamuri</option>';
window.document.getElementById('modal-box').appendChild(select);
window.App.SGPhase73.enhanceSelects(window.document.getElementById('modal-box'));
assert.ok(select.classList.contains('sg73-native-select'),'Select-i duhet të kthehet në kërkim as-you-type.');
assert.ok(select.nextElementSibling?.querySelector('input[type="search"]'),'Duhet të shfaqet input kërkimi, jo dropdown klasik.');

window.App.sg71SampleChange(0,'quantity','35');
window.App.sg71WorkChange(0,'plannedQuantity','58');
window.App.sg71FinalChange(0,'quantity','125.5');
assert.equal(state.sampleRows[0].quantity,35);
assert.equal(state.workRows[0].plannedQuantity,58);
assert.equal(state.finalRows[0].quantity,125.5);
assert.equal(calls.some((row)=>row[0]==='oldSampleChange'),false,'Inputi numerik nuk duhet të rishfaqë rreshtin pas çdo shifre.');

console.log('PHASE73_ODOO_SHELL_SUCCESS routes='+window.App.SGPhase73.state.routes.length);
