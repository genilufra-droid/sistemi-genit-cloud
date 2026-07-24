'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const htmlPath=path.join(root,'apps','web','index.html');
const jsPath=path.join(root,'apps','web','phase71-odoo-manufacturing-ui.js');
const navPath=path.join(root,'apps','web','phase70-navigation-registry.js');
const start='<!-- SG_PHASE71_ODOO_MANUFACTURING_UI_PATCH_START -->';
const end='<!-- SG_PHASE71_ODOO_MANUFACTURING_UI_PATCH_END -->';
const esc=(v)=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
let html=fs.readFileSync(htmlPath,'utf8');
const js=fs.readFileSync(jsPath,'utf8');
new Function(js);
html=html.replace(new RegExp(esc(start)+'[\\s\\S]*?'+esc(end)+'\\s*','g'),'');
const close=/<\/body>\s*<\/html>\s*$/i;
if(!close.test(html))throw new Error('Mungon mbyllja finale HTML.');
html=html.replace(close,start+'\n<script id="sg-phase71-odoo-manufacturing-ui">\n'+js+'\n</script>\n'+end+'\n</body>\n</html>');
fs.writeFileSync(htmlPath,html);

let nav=fs.readFileSync(navPath,'utf8');
if(!nav.includes("id: 'sg71-mfg-nav'")){
  const finance="    {\n      id: 'sg5-nav-section',";
  const section="    {\n      id: 'sg71-mfg-nav',\n      title: 'PRODHIMI',\n      dataKey: 'sg71View',\n      items: [\n        { view: 'manufacturingDashboard', icon: '🏭', label: 'Paneli i Prodhimit', title: 'Prodhimi', handler: 'view_manufacturingDashboard' },\n        { view: 'manufacturingProcesses', icon: '⚙️', label: 'Proceset', title: 'Proceset', handler: 'view_manufacturingProcesses' },\n        { view: 'manufacturingWorkcenters', icon: '🏗️', label: 'Makineritë / Qendrat', title: 'Makineritë dhe Qendrat e Punës', handler: 'view_manufacturingWorkcenters' },\n        { view: 'manufacturingSamples', icon: '🧪', label: 'Mostrat e Klientit', title: 'Mostrat e Klientit', handler: 'view_manufacturingSamples' },\n        { view: 'manufacturingCampaigns', icon: '📋', label: 'Fushatat e Prodhimit', title: 'Fushatat e Prodhimit', handler: 'view_manufacturingCampaigns' },\n        { view: 'manufacturingWorkOrders', icon: '🛠️', label: 'Urdhrat e Punës', title: 'Urdhrat e Punës', handler: 'view_manufacturingWorkOrders' }\n      ]\n    },\n";
  if(!nav.includes(finance))throw new Error('Anchor-i i menusë Financa mungon.');
  nav=nav.replace(finance,section+finance);
}
nav=nav.replace("traceability: 'traceDossiers'","traceability: 'traceDossiers',\n    manufacturing: 'manufacturingDashboard',\n    production: 'manufacturingDashboard',\n    traceProcesses: 'manufacturingWorkOrders'");
nav=nav.replace("data.sgNavView || data.sg5View || data.sg6View || data.sg62View || data.view","data.sgNavView || data.sg71View || data.sg5View || data.sg6View || data.sg62View || data.view");
nav=nav.replace("['sg62-trace-nav', 'sg5-nav-section', 'sg6-nav-section']","['sg62-trace-nav', 'sg71-mfg-nav', 'sg5-nav-section', 'sg6-nav-section']");
fs.writeFileSync(navPath,nav);
const check=fs.readFileSync(htmlPath,'utf8');
if(!check.includes('SG_PHASE71_ODOO_MANUFACTURING_UI_START'))throw new Error('UI e Prodhimit mungon.');
const navCheck=fs.readFileSync(navPath,'utf8');
['sg71-mfg-nav','manufacturingDashboard','manufacturingWorkOrders'].forEach((m)=>{if(!navCheck.includes(m))throw new Error('Mungon '+m);});
console.log('Phase 7.1 Odoo manufacturing UI injected.');
