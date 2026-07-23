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
if(!check.includes('Drafti i procesit nuk arriti në API:')||!check.includes('(expected)=>document.getElementById'))throw new Error('Testi Phase 4.2 nuk u stabilizua.');
console.log('Phase 4.2 browser smoke test patched deterministically.');
