(()=>{
'use strict';
const MARK='SG_PHASE83_REAL_DOCUMENT_LINKS_START';
if(window.__sgPhase83Installed)return;
window.__sgPhase83Installed=true;
console.info(MARK);

const KIND_PATTERNS=[
 ['weight_ticket',/(formular|peshim|peshe|peshë)/i],
 ['work_order',/(urdh[eë]r pune|work order|prodhim)/i],
 ['final_lot',/(lot final|final)/i],
 ['quality_check',/(cil[eë]si|quality)/i],
 ['business_document',/(fatur|flet[eë] hyr|flet[eë] dal|mandat|ark[eë]|bank[eë]|karburant|dokument)/i],
 ['sample',/(most[eë]r|sample)/i],
 ['campaign',/(fushat[eë]|campaign)/i],
 ['lot',/(^|\s)lot(\s|$)|etiket[eë]/i],
 ['route',/(rrug[eë]|route)/i],
 ['process',/(proces)/i],
 ['work_center',/(makineri|qend[eë]r pune)/i],
 ['location',/(lokacion|vendndodhje)/i]
];

function normal(v){return String(v??'').trim();}
function rowIdentity(row){
 const ds=row?.dataset||{};
 const direct=ds.documentId||ds.docId||ds.recordId||ds.entityId||ds.id;
 if(direct)return normal(direct);
 const node=row?.querySelector?.('[data-document-id],[data-doc-id],[data-record-id],[data-entity-id],[data-id]');
 if(node){const d=node.dataset||{};const id=d.documentId||d.docId||d.recordId||d.entityId||d.id;if(id)return normal(id);}
 const click=row?.querySelector?.('[onclick*="sg72OpenDocument"], [onclick*="OpenDocument"]')?.getAttribute('onclick')||'';
 const m=click.match(/(?:sg72OpenDocument|OpenDocument)\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/i);
 return m?.[2]||'';
}
function explicitKind(row){
 const ds=row?.dataset||{};
 if(ds.documentKind||ds.docKind||ds.entityKind)return ds.documentKind||ds.docKind||ds.entityKind;
 const click=row?.querySelector?.('[onclick*="sg72OpenDocument"], [onclick*="OpenDocument"]')?.getAttribute('onclick')||'';
 const m=click.match(/(?:sg72OpenDocument|OpenDocument)\s*\(\s*['"]([^'"]+)['"]/i);
 return m?.[1]||'';
}
function inferKind(table,header,row){
 const explicit=explicitKind(row);if(explicit)return explicit;
 const text=[header,table?.getAttribute('aria-label'),table?.caption?.textContent,table?.closest('[data-view],[id],[class]')?.textContent?.slice(0,180)].filter(Boolean).join(' ');
 return KIND_PATTERNS.find(([,re])=>re.test(text))?.[0]||'business_document';
}
function realUrl(kind,id){
 const u=new URL(location.href);u.searchParams.set('sgdocKind',kind);u.searchParams.set('sgdocId',id);u.searchParams.set('sgdocMode','real');u.hash='document';return u.toString();
}
function headers(table){return [...(table.tHead?.rows?.[0]?.cells||[])].map(x=>normal(x.textContent));}
function isDocumentHeader(v){return /(nr\.?|numri|dokument|fatur|flet[eë]|mandat|lot|formular|urdh[eë]r|kod)/i.test(v);}
function enhanceTable(table){
 if(!table||table.dataset.sg83==='1'||table.closest('.sg82-view'))return;
 const hs=headers(table);if(!hs.some(isDocumentHeader))return;
 table.dataset.sg83='1';
 [...(table.tBodies||[])].forEach(tb=>[...tb.rows].forEach(row=>{
   const id=rowIdentity(row);if(!id)return;
   [...row.cells].forEach((cell,i)=>{
     const header=hs[i]||'';if(!isDocumentHeader(header)||cell.querySelector('a.sg83-real-doc'))return;
     const existing=cell.querySelector('button.sg72-doc-link,[onclick*="sg72OpenDocument"]');
     const label=normal(existing?.textContent||cell.textContent);if(!label)return;
     const kind=inferKind(table,header,row);
     const a=document.createElement('a');a.className='sg83-real-doc';a.href=realUrl(kind,id);a.target='_blank';a.rel='noopener';a.textContent=label;a.title='Hap dokumentin real në skedë të re';
     a.addEventListener('click',e=>{e.stopPropagation();});
     cell.replaceChildren(a);
   });
 }));
}
function addStyle(){if(document.getElementById('sg83-style'))return;const s=document.createElement('style');s.id='sg83-style';s.textContent='.sg83-real-doc{color:#075985;text-decoration:underline;text-underline-offset:3px;font-weight:700;cursor:pointer}.sg83-real-doc:hover{color:#0c4a6e}';document.head.appendChild(s);}
function scan(root=document){root.querySelectorAll?.('table').forEach(enhanceTable);}
function openRequestedRealDocument(){
 const q=new URLSearchParams(location.search),kind=q.get('sgdocKind'),id=q.get('sgdocId');if(!kind||!id)return;
 let tries=0;const timer=setInterval(()=>{tries++;const app=window.App;if(app?.sg72OpenDocument){clearInterval(timer);Promise.resolve(app.sg72OpenDocument(kind,id)).catch(e=>app.toast?.(e?.message||String(e),'error'));}else if(tries>80){clearInterval(timer);}},100);
}
addStyle();scan();openRequestedRealDocument();
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan();});}).observe(document.documentElement,{subtree:true,childList:true});
window.SGPhase83={scan,realUrl,openRequestedRealDocument};
})();
