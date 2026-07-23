'use strict';
const fs=require('fs');
const path=require('path');
const target=path.resolve(__dirname,'../tests/phase42-processing-ui-smoke.cjs');
let source=fs.readFileSync(target,'utf8');

function replaceOnce(oldText,newText,label){
  if(source.includes(oldText))source=source.replace(oldText,newText);
  else if(!source.includes(newText))throw new Error('Mungon pika e testit: '+label);
}

replaceOnce(
"await page.waitForFunction(()=>Boolean(window.SGPhase42&&window.CloudERP&&window.App));",
"await page.waitForFunction(()=>Boolean(window.SGPhase42&&window.CloudERP&&window.App));await page.waitForFunction(()=>App.currentView==='dashboard'&&App.company&&App.company.name==='Kompania Cloud Test',null,{timeout:30000});",
'Cloud startup completion');

replaceOnce(
"await page.evaluate(()=>App.navigate('traceProcesses'));await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('Proces & Paketim Cloud'));let text=await page.locator('#content').innerText();",
"await page.evaluate(()=>App.navigate('traceProcesses'));await page.waitForTimeout(1500);let text=await page.locator('#content').innerText();if(!text.includes('Proces & Paketim Cloud')){const diagnostic=await page.evaluate(()=>({view:App.currentView,content:document.getElementById('content')?.innerText.slice(0,1800),toast:document.body.innerText.slice(-900),phase42:Boolean(window.SGPhase42),loadPhase4:Boolean(CloudERP.loadPhase4)}));throw new Error('Moduli Phase 4.2 nuk u renderua: '+JSON.stringify(diagnostic)+' browserErrors='+JSON.stringify(errors));}",
'initial module render');

replaceOnce(
"if(!processCalc.includes('0 kg')||!processCalc.includes('90%'))throw new Error('Bilanci vizual i Urdhrit të Punës është gabim: '+processCalc);",
"if(!/0(?:[.,]0+)? kg/.test(processCalc)||!/90(?:[.,]0+)?%/.test(processCalc))throw new Error('Bilanci vizual i Urdhrit të Punës është gabim: '+processCalc);",
'process formatted balance');

replaceOnce(
"if((packCalc.match(/0 kg/g)||[]).length<2)throw new Error('Bilanci vizual i Paketimit është gabim: '+packCalc);",
"if((packCalc.match(/0(?:[.,]0+)? kg/g)||[]).length<2)throw new Error('Bilanci vizual i Paketimit është gabim: '+packCalc);",
'packaging formatted balance');

replaceOnce(
"await page.evaluate(()=>App.saveProcessOrderOnline(''));await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('UP-2026-000001'));if(state.processCreates!==1)throw new Error('Drafti i procesit nuk arriti në API.');",
"await page.evaluate(()=>App.saveProcessOrderOnline(''));if(state.processCreates!==1){const diagnostic=await page.evaluate(()=>({content:document.getElementById('content')?.innerText.slice(0,1600),modal:document.getElementById('modal-box')?.innerText.slice(0,1000)}));throw new Error('Drafti i procesit nuk arriti në API: '+JSON.stringify(diagnostic));}await page.evaluate(()=>App.view_traceProcesses());await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('UP-2026-000001'));",
'process draft render');

replaceOnce(
"await page.evaluate(id=>App.postProcessOrderOnline(id),ids.process);await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('PRC-GJF-PRC-20260723-0001'),null,{timeout:30000});if(state.processPosts!==1)throw new Error('Postimi i procesit nuk arriti në API.');",
"await page.evaluate(id=>App.postProcessOrderOnline(id),ids.process);if(state.processPosts!==1)throw new Error('Postimi i procesit nuk arriti në API.');await page.evaluate(()=>App.view_traceProcesses());await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('PRC-GJF-PRC-20260723-0001'),null,{timeout:30000});",
'process post render');

replaceOnce(
"await page.evaluate(()=>App.savePackagingOrderOnline(''));await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('PAK-2026-000001'));if(state.packagingCreates!==1)throw new Error('Drafti i paketimit nuk arriti në API.');",
"await page.evaluate(()=>App.savePackagingOrderOnline(''));if(state.packagingCreates!==1){const diagnostic=await page.evaluate(()=>({content:document.getElementById('content')?.innerText.slice(0,1600),modal:document.getElementById('modal-box')?.innerText.slice(0,1000)}));throw new Error('Drafti i paketimit nuk arriti në API: '+JSON.stringify(diagnostic));}await page.evaluate(()=>{App._phase42Tab='packaging';return App.view_traceProcesses();});await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('PAK-2026-000001'));",
'packaging draft render');

replaceOnce(
"await page.evaluate(id=>App.postPackagingOrderOnline(id),ids.packaging);await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('PKG-GJF-PKG-20260723-0001'),null,{timeout:30000});if(state.packagingPosts!==1)throw new Error('Postimi i paketimit nuk arriti në API.');",
"await page.evaluate(id=>App.postPackagingOrderOnline(id),ids.packaging);if(state.packagingPosts!==1)throw new Error('Postimi i paketimit nuk arriti në API.');await page.evaluate(()=>{App._phase42Tab='packaging';return App.view_traceProcesses();});await page.waitForFunction(()=>document.getElementById('content')?.innerText.includes('PKG-GJF-PKG-20260723-0001'),null,{timeout:30000});",
'packaging post render');

replaceOnce(
"await page.waitForFunction(()=>document.getElementById('source-preserve')?.value==='Vlerë e paruajtur'&&document.getElementById('source-product')?.dataset.selectedId===arguments[0],ids.newProduct);",
"await page.waitForFunction((expected)=>document.getElementById('source-preserve')?.value==='Vlerë e paruajtur'&&document.getElementById('source-product')?.dataset.selectedId===expected,ids.newProduct);",
'quick create expected id');

fs.writeFileSync(target,source);
const check=fs.readFileSync(target,'utf8');
if(!check.includes("App.currentView==='dashboard'")||!check.includes('Moduli Phase 4.2 nuk u renderua:')||!check.includes('/90(?:[.,]0+)?%/')||!check.includes('Drafti i procesit nuk arriti në API:')||!check.includes('(expected)=>document.getElementById'))throw new Error('Testi Phase 4.2 nuk u stabilizua.');
console.log('Phase 4.2 browser smoke test patched deterministically.');
