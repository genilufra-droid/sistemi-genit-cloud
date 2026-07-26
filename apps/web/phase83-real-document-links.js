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
 ['business_document',/(fatur|flet[eë] hyr|flet[eë] dal|pranim|d[eë]rges|transfer|mandat|ark[eë]|bank[eë]|karburant|dokument)/i],
 ['sample',/(most[eë]r|sample)/i],
 ['campaign',/(fushat[eë]|campaign)/i],
 ['lot',/(^|\s)lot(\s|$)|etiket[eë]/i],
 ['route',/(rrug[eë]|route)/i],
 ['process',/(proces)/i],
 ['work_center',/(makineri|qend[eë]r pune)/i],
 ['location',/(lokacion|vendndodhje)/i]
];
const DOC_CODE_RE=/(?:FH|FD|FT|FB|FS|FAT|INV|BL|SH|UP|WO|LOT|MOSTER|FUSHATE|MANDAT|MA|MP|TR|DOC)[-_\s]?\d{2,4}[-_/]\d+/i;

function normal(v){return String(v??'').trim();}
function codeFromText(text){return normal(text).match(DOC_CODE_RE)?.[0]?.replace(/\s+/g,'')||'';}
function rowIdentity(row){
 const ds=row?.dataset||{};
 const direct=ds.documentId||ds.docId||ds.recordId||ds.entityId||ds.id;
 if(direct)return normal(direct);
 const node=row?.querySelector?.('[data-document-id],[data-doc-id],[data-record-id],[data-entity-id],[data-id]');
 if(node){const d=node.dataset||{};const id=d.documentId||d.docId||d.recordId||d.entityId||d.id;if(id)return normal(id);}
 const href=row?.querySelector?.('a[href*="sgdocId="]')?.href;
 if(href){try{return new URL(href,location.href).searchParams.get('sgdocId')||'';}catch{}}
 const click=row?.querySelector?.('[onclick*="sg72OpenDocument"], [onclick*="OpenDocument"]')?.getAttribute('onclick')||'';
 const m=click.match(/(?:sg72OpenDocument|OpenDocument)\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/i);
 if(m?.[2])return m[2];
 return codeFromText(row?.textContent||'');
}
function explicitKind(row){
 const ds=row?.dataset||{};
 if(ds.documentKind||ds.docKind||ds.entityKind)return ds.documentKind||ds.docKind||ds.entityKind;
 const href=row?.querySelector?.('a[href*="sgdocKind="]')?.href;
 if(href){try{return new URL(href,location.href).searchParams.get('sgdocKind')||'';}catch{}}
 const click=row?.querySelector?.('[onclick*="sg72OpenDocument"], [onclick*="OpenDocument"]')?.getAttribute('onclick')||'';
 const m=click.match(/(?:sg72OpenDocument|OpenDocument)\s*\(\s*['"]([^'"]+)['"]/i);
 return m?.[1]||'';
}
function inferKind(table,header,row){
 const explicit=explicitKind(row);if(explicit)return explicit;
 const text=[header,table?.getAttribute('aria-label'),table?.caption?.textContent,table?.closest('[data-view],[id],[class]')?.textContent?.slice(0,220)].filter(Boolean).join(' ');
 return KIND_PATTERNS.find(([,re])=>re.test(text))?.[0]||'business_document';
}
function realUrl(kind,id){
 const u=new URL(location.href);u.searchParams.set('sgdocKind',kind);u.searchParams.set('sgdocId',id);u.searchParams.set('sgdocMode','real');u.hash='document';return u.toString();
}
function headers(table){return [...(table.tHead?.rows?.[0]?.cells||[])].map(x=>normal(x.textContent));}
function isDocumentHeader(v){return /(nr\.?|numri|dokument|fatur|flet[eë]|pranim|d[eë]rges|transfer|mandat|lot|formular|urdh[eë]r|kod)/i.test(v);}
function isViewControl(el){
 if(!el)return false;
 const text=normal([el.getAttribute?.('title'),el.getAttribute?.('aria-label'),el.textContent].filter(Boolean).join(' '));
 return /(^|\s)(shiko|hap|view|open)(\s|$)/i.test(text)||el.matches?.('[data-view],[data-open],[data-action="view"],.view,.btn-view,.action-view')||!!el.querySelector?.('svg, i');
}
function openRowDocument(row,source){
 const table=row?.closest?.('table');if(!table)return false;
 const hs=headers(table),id=rowIdentity(row);if(!id)return false;
 const cell=source?.closest?.('td,th');const index=cell?.cellIndex??0;const kind=inferKind(table,hs[index]||'',row);
 window.open(realUrl(kind,id),'_blank','noopener');
 return true;
}
function enhanceTable(table){
 if(!table||table.dataset.sg83==='1'||table.closest('.sg82-view'))return;
 const hs=headers(table);if(!hs.some(isDocumentHeader))return;
 table.dataset.sg83='1';
 [...(table.tBodies||[])].forEach(tb=>[...tb.rows].forEach(row=>{
   const id=rowIdentity(row);if(!id)return;
   row.dataset.sg83DocumentId=id;
   [...row.cells].forEach((cell,i)=>{
     const header=hs[i]||'';if(!isDocumentHeader(header)||cell.querySelector('a.sg83-real-doc'))return;
     const existing=cell.querySelector('button.sg72-doc-link,[onclick*="sg72OpenDocument"],a');
     const label=normal(existing?.textContent||cell.textContent);if(!label)return;
     const kind=inferKind(table,header,row);
     const a=document.createElement('a');a.className='sg83-real-doc';a.href=realUrl(kind,id);a.target='_blank';a.rel='noopener';a.textContent=label;a.title='Hap dokumentin në skedë të re';
     a.addEventListener('click',e=>{e.stopPropagation();});
     cell.replaceChildren(a);
   });
 }));
}
function captureUniversalOpen(e){
 if(e.defaultPrevented||e.button>0)return;
 const target=e.target?.closest?.('a,button,[role="button"],td');if(!target)return;
 if(target.closest('.sg82-view'))return;
 const row=target.closest('tr');if(!row||!row.closest('table'))return;
 const directLink=target.closest('a.sg83-real-doc');
 if(directLink){e.stopPropagation();return;}
 const cell=target.closest('td,th'),table=row.closest('table'),hs=headers(table),header=hs[cell?.cellIndex??0]||'';
 const shouldOpen=isViewControl(target)||isDocumentHeader(header)||!!target.closest('[onclick*="sg72OpenDocument"],[onclick*="OpenDocument"]');
 if(!shouldOpen)return;
 if(openRowDocument(row,target)){
   e.preventDefault();e.stopImmediatePropagation();
 }
}
function addStyle(){if(document.getElementById('sg83-style'))return;const s=document.createElement('style');s.id='sg83-style';s.textContent='.sg83-real-doc{color:#075985;text-decoration:underline;text-underline-offset:3px;font-weight:700;cursor:pointer}.sg83-real-doc:hover{color:#0c4a6e}';document.head.appendChild(s);}
function scan(root=document){root.querySelectorAll?.('table').forEach(enhanceTable);}
function openRequestedRealDocument(){
 const q=new URLSearchParams(location.search),kind=q.get('sgdocKind'),id=q.get('sgdocId');if(!kind||!id)return;
 document.documentElement.classList.add('sg83-document-tab');
 let tries=0;const timer=setInterval(()=>{tries++;const app=window.App;if(app?.sg72OpenDocument){clearInterval(timer);Promise.resolve(app.sg72OpenDocument(kind,id)).catch(e=>app.toast?.(e?.message||String(e),'error'));}else if(tries>120){clearInterval(timer);}},100);
}
addStyle();scan();openRequestedRealDocument();
document.addEventListener('click',captureUniversalOpen,true);
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan();});}).observe(document.documentElement,{subtree:true,childList:true});
window.SGPhase83={scan,realUrl,openRequestedRealDocument,openRowDocument};
})();