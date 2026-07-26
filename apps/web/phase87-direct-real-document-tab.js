(()=>{
'use strict';
const MARK='SG_PHASE87_DIRECT_REAL_DOCUMENT_TAB_START';
if(window.__sgPhase87Installed)return;window.__sgPhase87Installed=true;console.info(MARK);
const q=new URLSearchParams(location.search);
const kind=q.get('sgdocKind'),id=q.get('sgdocId');
if(q.get('sgdocMode')!=='real'||!id)return;
let requested=false;
function requestDocument(){
 const App=window.App;
 if(requested||!App||typeof App.sg72OpenDocument!=='function')return false;
 requested=true;
 try{App.closeModal?.();Promise.resolve(App.sg72OpenDocument(kind||'business_document',id)).catch(e=>{requested=false;App.toast?.(e?.message||String(e),'error');});return true;}catch(e){requested=false;return false;}
}
function install(){
 const App=window.App;if(!App||typeof App.modal!=='function')return false;
 if(!App.__sg87ModalPatched){
  App.__sg87ModalPatched=true;
  App.__sg87OriginalModal=App.modal.bind(App);
  App.modal=function(title,body,footer){
   const old=document.getElementById('sg87-direct-root');if(old)old.remove();
   const root=document.createElement('main');root.id='sg87-direct-root';root.className='sg82-view sg87-direct-root';
   root.innerHTML=`<header class="sg82-view-head sg87-head"><strong>${String(title||'DOKUMENT')}</strong><div class="sg87-actions">${footer||''}</div></header><section class="sg82-view-body">${body||''}</section>`;
   document.body.appendChild(root);
   root.querySelectorAll('[onclick*="closeModal"]').forEach(b=>b.remove());
   document.documentElement.classList.add('sg87-direct-document');
   document.body.classList.add('sg87-document-ready');
   setTimeout(()=>{window.SGPhase86?.mount?.(root);window.SGPhase86?.scan?.();},0);
   return root;
  };
 }
 requestAnimationFrame(requestDocument);
 return true;
}
install();
let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>320)clearInterval(timer);},25);
setTimeout(()=>{if(!document.getElementById('sg87-direct-root')){document.documentElement.classList.remove('sg87-direct-document');document.body?.classList.remove('sg87-document-ready');}},10000);
const s=document.createElement('style');s.id='sg87-style';s.textContent=`html.sg87-direct-document body>*:not(#sg87-direct-root):not(script):not(style){display:none!important}html.sg87-direct-document,html.sg87-direct-document body{margin:0!important;min-height:100%!important;background:#d9dde3!important}.sg87-direct-root{display:block!important;min-height:100vh;background:#d9dde3}.sg87-head{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:#fff;border-bottom:1px solid #d1d5db}.sg87-actions{display:flex;gap:6px;flex-wrap:wrap}.sg87-actions button{display:inline-flex!important}.sg87-direct-root .sg82-view-body{padding:0}.sg87-direct-root .sg72-document{display:block}@media(max-width:700px){.sg87-head{align-items:flex-start;flex-direction:column}.sg87-actions{width:100%}}@media print{.sg87-head{display:none!important}}`;
document.head.appendChild(s);
})();