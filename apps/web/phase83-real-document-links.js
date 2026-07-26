(()=>{
'use strict';
const MARK='SG_PHASE83_REAL_DOCUMENT_LINKS_START';
if(window.__sgPhase83Installed)return;window.__sgPhase83Installed=true;console.info(MARK);
const normal=v=>String(v??'').trim();
function parseOpen(el){
 const row=el?.closest?.('tr');
 const nodes=[el,...(row?[...row.querySelectorAll('[onclick],[data-document-id],[data-doc-id],[data-record-id],[data-entity-id],[data-id]')]:[])];
 for(const node of nodes){
  const d=node?.dataset||{};
  const direct=d.documentId||d.docId||d.recordId||d.entityId||d.id;
  if(direct)return{kind:d.documentKind||d.docKind||d.entityKind||'business_document',id:normal(direct)};
  const click=node?.getAttribute?.('onclick')||'';
  let m=click.match(/(?:sg72OpenDocument|OpenDocument)\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/i);
  if(m)return{kind:m[1]||'business_document',id:m[2]};
  m=click.match(/sg72OpenBusinessDocument\s*\(\s*['"]([^'"]+)['"]/i);
  if(m)return{kind:'business_document',id:m[1]};
 }
 return null;
}
function realUrl(kind,id){const u=new URL(location.href);u.searchParams.set('sgdocKind',kind||'business_document');u.searchParams.set('sgdocId',id);u.searchParams.set('sgdocMode','real');u.hash='document';return u.toString();}
function isProtected(el){const t=normal([el?.title,el?.getAttribute?.('aria-label'),el?.textContent].filter(Boolean).join(' '));return /(edito|edit|fshi|delete|anulo|cancel|menu|më shumë|me shume|more|opsione)/i.test(t)||!!el?.closest?.('[data-edit],[data-delete],[data-menu],[data-more],[aria-haspopup="menu"],.dropdown,.kebab,.more-actions');}
function capture(e){
 if(e.defaultPrevented||e.button>0)return;
 const target=e.target?.closest?.('a,button,[role="button"],td');if(!target||isProtected(target)||target.closest('.sg82-view'))return;
 const row=target.closest('tr');if(!row)return;
 const info=parseOpen(target);if(!info?.id)return;
 const header=normal(row.closest('table')?.tHead?.rows?.[0]?.cells?.[target.closest('td')?.cellIndex||0]?.textContent);
 const explicit=/sg72OpenDocument|OpenDocument|sg72OpenBusinessDocument/i.test(target.getAttribute?.('onclick')||'')||/shiko|hap dokument|view/i.test(normal(target.textContent));
 if(!explicit&&!/(nr\.?|numri|dokument|fatur|flet[eë]|mandat)/i.test(header))return;
 e.preventDefault();e.stopImmediatePropagation();window.open(realUrl(info.kind,info.id),'_blank','noopener');
}
function openRequested(){const q=new URLSearchParams(location.search);if(q.get('sgdocMode')==='real'&&q.get('sgdocId'))document.documentElement.classList.add('sg83-document-tab');}
document.addEventListener('click',capture,true);openRequested();window.SGPhase83={realUrl,parseOpen};
})();