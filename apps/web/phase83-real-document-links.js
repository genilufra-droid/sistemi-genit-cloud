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
function parseOpenCall(value){
 const text=normal(value);
 const m=text.match(/(?:sg72OpenDocument|OpenDocument)\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/i);
 return m?{kind:m[1],id:m[2]}:null;
}
function rowIdentity(row){
 const ds=row?.dataset||{};
 const direct=ds.documentId||ds.docId||ds.recordId||ds.entityId||ds.id;
 if(direct)return normal(direct);
 const node=row?.querySelector?.('[data-document-id],[data-doc-id],[data-record-id],[data-entity-id],[data-id]');
 if(node){const d=node.dataset||{};const id=d.documentId||d.docId||d.recordId||d.entityId||d.id;if(id)return normal(id);}
 return parseOpenCall(row?.querySelector?.('[onclick*="sg72OpenDocument"], [onclick*="OpenDocument"]')?.getAttribute('onclick'))?.id||'';
}
function explicitKind(row){
 const ds=row?.dataset||{};
 if(ds.documentKind||ds.docKind||ds.entityKind)return ds.documentKind||ds.docKind||ds.entityKind;
 return parseOpenCall(row?.querySelector?.('[onclick*="sg72OpenDocument"], [onclick*="OpenDocument"]')?.getAttribute('onclick'))?.kind||'';
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
     const existing=cell.querySelector('button.sg72-doc-link,[onclick*="sg72OpenDocument"],[onclick*="OpenDocument"]');
     const parsed=parseOpenCall(existing?.getAttribute?.('onclick'));
     const label=normal(existing?.textContent||cell.textContent);if(!label)return;
     const kind=parsed?.kind||inferKind(table,header,row),docId=parsed?.id||id;
     const a=document.createElement('a');a.className='sg83-real-doc';a.href=realUrl(kind,docId);a.target='_blank';a.rel='noopener';a.textContent=label;a.title='Hap dokumentin real në skedë të re';
     a.addEventListener('click',e=>e.stopPropagation());
     cell.replaceChildren(a);
   });
 }));
}
function makeDocumentPage(){
 document.documentElement.classList.add('sg83-document-mode');
 document.body?.classList.add('sg83-document-page');
 let tries=0;const timer=setInterval(()=>{
   tries++;
   const view=document.querySelector('.sg82-view');
   if(view){
     clearInterval(timer);
     document.querySelectorAll('.sg82-modal,.modal-backdrop,[role="dialog"]').forEach(x=>{if(x!==view&&!x.contains(view))x.style.display='none';});
     view.classList.add('sg83-dedicated-document');
     const close=view.querySelector('[data-close],.sg82-close,.modal-close,[aria-label="Close"],[aria-label="Mbyll"]');if(close)close.style.display='none';
     document.title=(view.querySelector('.sg82-view-head strong')?.textContent||view.querySelector('h1,h2')?.textContent||'Dokument')+' — Sistemi Genit';
   }else if(tries>120){clearInterval(timer);}
 },100);
}
function addStyle(){
 if(document.getElementById('sg83-style'))return;
 const s=document.createElement('style');s.id='sg83-style';s.textContent=`
 .sg83-real-doc{color:#075985;text-decoration:underline;text-underline-offset:3px;font-weight:700;cursor:pointer}.sg83-real-doc:hover{color:#0c4a6e}
 .sg83-document-page{overflow:auto!important;background:#f8fafc!important}
 .sg83-document-page> :not(.sg82-view):not(script):not(style){display:none!important}
 .sg83-document-page .sg82-view.sg83-dedicated-document{display:block!important;position:relative!important;inset:auto!important;width:min(1120px,calc(100% - 24px))!important;max-width:none!important;max-height:none!important;margin:18px auto!important;border-radius:12px!important;box-shadow:0 18px 50px rgba(15,23,42,.14)!important;transform:none!important;overflow:visible!important;background:#fff!important}
 .sg83-document-page .sg82-view-body{max-height:none!important;overflow:visible!important}
 @media(max-width:700px){.sg83-document-page .sg82-view.sg83-dedicated-document{width:100%!important;margin:0!important;border-radius:0!important;box-shadow:none!important;min-height:100vh!important}}
 `;document.head.appendChild(s);
}
function scan(root=document){root.querySelectorAll?.('table').forEach(enhanceTable);}
function openRequestedRealDocument(){
 const q=new URLSearchParams(location.search),kind=q.get('sgdocKind'),id=q.get('sgdocId');if(!kind||!id)return;
 makeDocumentPage();
 let tries=0;const timer=setInterval(()=>{tries++;const app=window.App;if(app?.sg72OpenDocument){clearInterval(timer);Promise.resolve(app.sg72OpenDocument(kind,id)).catch(e=>app.toast?.(e?.message||String(e),'error'));}else if(tries>80){clearInterval(timer);}},100);
}
function universalNewTabHandler(e){
 if(new URLSearchParams(location.search).get('sgdocMode')==='real')return;
 const el=e.target?.closest?.('a,button,[onclick],[data-document-id],[data-doc-id],[data-record-id],[data-entity-id]');if(!el)return;
 if(el.matches('a.sg83-real-doc'))return;
 const parsed=parseOpenCall(el.getAttribute?.('onclick'));
 const ds=el.dataset||{};
 const id=parsed?.id||ds.documentId||ds.docId||ds.recordId||ds.entityId;
 const kind=parsed?.kind||ds.documentKind||ds.docKind||ds.entityKind;
 if(!id||!kind)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 window.open(realUrl(kind,id),'_blank','noopener');
}
addStyle();scan();openRequestedRealDocument();
document.addEventListener('click',universalNewTabHandler,true);
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan();});}).observe(document.documentElement,{subtree:true,childList:true});
window.SGPhase83={scan,realUrl,openRequestedRealDocument,makeDocumentPage};
})();