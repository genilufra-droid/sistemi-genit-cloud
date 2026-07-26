(()=>{
'use strict';
const MARK='SG_PHASE87_DIRECT_REAL_DOCUMENT_TAB_START';
if(window.__sgPhase87Installed)return;window.__sgPhase87Installed=true;console.info(MARK);
const q=new URLSearchParams(location.search);
if(q.get('sgdocMode')!=='real'||!q.get('sgdocId'))return;
document.documentElement.classList.add('sg87-direct-document');
function install(){
 const App=window.App;if(!App||typeof App.modal!=='function')return false;
 if(App.__sg87ModalPatched)return true;
 App.__sg87ModalPatched=true;
 const original=App.modal.bind(App);
 App.modal=function(title,body,footer){
  const old=document.getElementById('sg87-direct-root');if(old)old.remove();
  const root=document.createElement('main');root.id='sg87-direct-root';root.className='sg82-view sg87-direct-root';
  root.innerHTML=`<header class="sg82-view-head sg87-head"><strong>${String(title||'DOKUMENT')}</strong><div class="sg87-actions">${footer||''}</div></header><section class="sg82-view-body">${body||''}</section>`;
  document.body.appendChild(root);
  root.querySelectorAll('[onclick*="closeModal"]').forEach(b=>b.remove());
  document.body.classList.add('sg87-document-ready');
  setTimeout(()=>{window.SGPhase86?.mount?.(root);window.SGPhase86?.scan?.();},0);
  return root;
 };
 App.__sg87OriginalModal=original;
 return true;
}
let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>200)clearInterval(timer);},25);
const s=document.createElement('style');s.id='sg87-style';s.textContent=`html.sg87-direct-document body>*:not(#sg87-direct-root):not(script):not(style){display:none!important}html.sg87-direct-document,html.sg87-direct-document body{margin:0!important;min-height:100%!important;background:#d9dde3!important}.sg87-direct-root{display:block!important;min-height:100vh;background:#d9dde3}.sg87-head{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:#fff;border-bottom:1px solid #d1d5db}.sg87-actions{display:flex;gap:6px;flex-wrap:wrap}.sg87-actions button{display:inline-flex!important}.sg87-direct-root .sg82-view-body{padding:0}.sg87-direct-root .sg72-document{display:block}@media(max-width:700px){.sg87-head{align-items:flex-start;flex-direction:column}.sg87-actions{width:100%}}@media print{.sg87-head{display:none!important}}`;
document.head.appendChild(s);
})();
