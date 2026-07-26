(()=>{
'use strict';
const MARK='SG_PHASE83_REAL_DOCUMENT_LINKS_START';
if(window.__sgPhase83Installed)return;
window.__sgPhase83Installed=true;
console.info(MARK);
const normal=v=>String(v??'').trim();
function parseOpen(el){
 const d=el?.dataset||{};
 const direct=d.documentId||d.docId||d.recordId||d.entityId||d.id;
 if(direct)return{kind:d.documentKind||d.docKind||d.entityKind||'business_document',id:normal(direct)};
 const click=el?.getAttribute?.('onclick')||'';
 let m=click.match(/(?:sg72OpenDocument|OpenDocument)\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/i);
 if(m)return{kind:m[1]||'business_document',id:m[2]};
 m=click.match(/sg72OpenBusinessDocument\s*\(\s*['"]([^'"]+)['"]/i);
 if(m)return{kind:'business_document',id:m[1]};
 return null;
}
function realUrl(kind,id){
 const u=new URL(location.href);
 u.searchParams.set('sgdocKind',kind||'business_document');
 u.searchParams.set('sgdocId',id);
 u.searchParams.set('sgdocMode','real');
 u.hash='document';
 return u.toString();
}
function enhance(){return 0;}
window.SGPhase83={realUrl,parseOpen,enhance,disabled:true};
})();