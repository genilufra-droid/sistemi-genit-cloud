(()=>{
'use strict';
const MARK='SG_PHASE84_ELECTRONIC_ARCHIVE_START';
if(window.__sgPhase84Installed)return;window.__sgPhase84Installed=true;console.info(MARK);
const MAX_FILE_SIZE=25*1024*1024;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stable=v=>String(v||'').trim().replace(/\s+/g,' ').slice(0,800);
const companyId=()=>window.App?.company?.id||'';
const api=()=>window.CloudERP;
const titleFor=view=>stable(view.querySelector('.sg82-view-head strong')?.textContent||view.querySelector('h2')?.textContent||'Dokument');
const numberFor=view=>{
  const explicit=view.getAttribute('data-document-no')||view.querySelector('[data-document-no]')?.getAttribute('data-document-no');
  if(explicit)return stable(explicit);
  const text=stable(view.textContent);
  return text.match(/\b(?:FH|FD|FB|FS|PB|PS|MA|MP|OF)[-_][A-Z0-9-]+\b/i)?.[0]||'';
};
const keyFor=view=>{
  const explicit=view.dataset.documentKey||view.getAttribute('data-document-id')||view.querySelector('[data-document-id]')?.getAttribute('data-document-id');
  if(explicit)return 'document:'+stable(explicit);
  const number=numberFor(view);
  return number?'document-no:'+number:'view:'+titleFor(view)+'|'+[...view.querySelectorAll('.sg82-kv>div')].map(x=>stable(x.textContent)).filter(Boolean).join('|');
};
function requireCloud(){if(!api()?.request)throw new Error('Arkiva kërkon lidhjen cloud. Rifresko faqen dhe hyr përsëri.');if(!companyId())throw new Error('Zgjidh kompaninë aktive.');}
async function list(documentKey,query=''){requireCloud();return api().request('/api/archive/files?companyId='+encodeURIComponent(companyId())+(documentKey?'&documentKey='+encodeURIComponent(documentKey):'')+(query?'&query='+encodeURIComponent(query):''));}
function dataUrl(file){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result||'').split(',')[1]||'');r.onerror=()=>no(r.error||new Error('Skedari nuk u lexua.'));r.readAsDataURL(file);});}
async function put(view,file){
  requireCloud();
  if(!file.size)throw new Error('Skedari është bosh.');
  if(file.size>MAX_FILE_SIZE)throw new Error('Skedari kalon kufirin 25 MB.');
  const allowed=/^(image\/|application\/pdf$|application\/zip$|application\/x-zip-compressed$)/i;
  if(!allowed.test(file.type)&&!file.name.toLowerCase().endsWith('.zip'))throw new Error('Lejohen vetëm foto, PDF dhe ZIP.');
  return api().request('/api/archive/files',{method:'POST',timeout:120000,body:{
    companyId:companyId(),documentKey:keyFor(view),documentTitle:titleFor(view),documentNo:numberFor(view),
    filename:file.name,mimeType:file.type||'application/octet-stream',contentBase64:await dataUrl(file),notes:''
  }});
}
async function remove(id){requireCloud();return api().request('/api/archive/files/'+encodeURIComponent(id),{method:'DELETE'});}
function token(){try{return localStorage.getItem('sg_cloud_access_token_v1')||'';}catch{return'';}}
async function openFile(row){
  requireCloud();
  const response=await fetch(api().apiUrl+'/api/archive/files/'+encodeURIComponent(row.id)+'/content',{headers:{Authorization:'Bearer '+token()}});
  if(!response.ok){let message='Skedari nuk u hap.';try{message=(await response.json()).message||message;}catch{}throw new Error(message);}
  const blob=await response.blob(),url=URL.createObjectURL(blob);
  if(/^image\//i.test(row.mimeType)||row.mimeType==='application/pdf'){const win=window.open(url,'_blank','noopener');if(win){setTimeout(()=>URL.revokeObjectURL(url),120000);return;}}
  const a=document.createElement('a');a.href=url;a.download=row.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function human(n){if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';return(n/1048576).toFixed(1)+' MB';}
function styles(){
  if(document.getElementById('sg84-style'))return;
  const s=document.createElement('style');s.id='sg84-style';
  s.textContent='.sg84-archive{border-top:1px solid #e2e8f0;margin-top:18px;padding-top:14px}.sg84-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.sg84-head-actions,.sg84-file-actions{display:flex;gap:6px;flex-wrap:wrap}.sg84-list{display:grid;gap:8px;margin-top:10px}.sg84-file{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid #e2e8f0;border-radius:9px;padding:9px}.sg84-file strong{overflow-wrap:anywhere}.sg84-file small{display:block;color:#64748b}.sg84-empty,.sg84-error{padding:12px;border:1px dashed #cbd5e1;border-radius:9px;color:#64748b}.sg84-error{border-color:#fecaca;color:#b91c1c}.sg84-badge{display:inline-flex;min-width:20px;height:20px;align-items:center;justify-content:center;border-radius:999px;background:#0f172a;color:#fff;font-size:11px;padding:0 6px}.sg84-busy{opacity:.55;pointer-events:none}.sg84-modal{position:fixed;inset:0;z-index:100100;background:#0008;display:grid;place-items:center;padding:14px}.sg84-modal-card{background:#fff;border-radius:12px;width:min(900px,100%);max-height:90vh;overflow:auto;padding:16px}.sg84-modal-tools{display:flex;gap:8px;margin:12px 0}.sg84-modal-tools input{flex:1;min-width:0;padding:10px;border:1px solid #cbd5e1;border-radius:8px}@media(max-width:640px){.sg84-head,.sg84-file{grid-template-columns:1fr;display:grid}.sg84-head-actions>*{flex:1}.sg84-modal{padding:6px}.sg84-modal-card{max-height:96vh}}';
  document.head.appendChild(s);
}
function rowHtml(row,globalView=false){
  const context=globalView?'<small><b>'+esc(row.documentNo||row.documentTitle||row.documentKey)+'</b></small>':'';
  return '<div class="sg84-file" data-id="'+esc(row.id)+'"><div>'+context+'<strong>'+esc(row.filename)+'</strong><small>'+esc(human(row.fileSize))+' · '+esc(new Date(row.createdAt).toLocaleString('sq-AL'))+(row.createdByName?' · '+esc(row.createdByName):'')+'</small></div><div class="sg84-file-actions"><button type="button" class="sg82-action" data-open>Hap</button><button type="button" class="sg82-action" data-download>Shkarko</button><button type="button" class="sg82-action sg82-action-danger" data-delete>Fshi</button></div></div>';
}
async function openCompanyArchive(){
  requireCloud();
  const modal=document.createElement('div');modal.className='sg84-modal';
  modal.innerHTML='<section class="sg84-modal-card"><div class="sg84-head"><div><strong>Arkiva Elektronike e Kompanisë</strong><small style="display:block;color:#64748b">Kërko sipas dokumentit, emrit të skedarit ose shënimit.</small></div><button type="button" class="sg82-action" data-close>Mbyll</button></div><div class="sg84-modal-tools"><input type="search" placeholder="Kërko në arkivë..." autocomplete="off"><button type="button" class="sg82-action" data-search>Kërko</button></div><div class="sg84-list"><div class="sg84-empty">Duke ngarkuar…</div></div></section>';
  document.body.appendChild(modal);
  const out=modal.querySelector('.sg84-list'),input=modal.querySelector('input');
  const render=async()=>{try{const rows=await list('',input.value.trim());out.innerHTML=rows.length?rows.map(r=>rowHtml(r,true)).join(''):'<div class="sg84-empty">Nuk u gjet asnjë skedar.</div>';}catch(e){out.innerHTML='<div class="sg84-error">'+esc(e.message||e)+'</div>';}};
  modal.onclick=async e=>{
    if(e.target===modal||e.target.closest('[data-close]')){modal.remove();return;}
    if(e.target.closest('[data-search]')){await render();return;}
    const el=e.target.closest('.sg84-file');if(!el)return;const rows=await list('',input.value.trim()),row=rows.find(x=>x.id===el.dataset.id);if(!row)return;
    try{if(e.target.closest('[data-open],[data-download]'))await openFile(row);if(e.target.closest('[data-delete]')&&confirm('Ta fshij këtë bashkëngjitje?')){await remove(row.id);await render();}}catch(err){alert(err.message||err);}
  };
  input.onkeydown=e=>{if(e.key==='Enter')render();};
  await render();input.focus();
}
async function mount(view){
  if(!view||view.dataset.sg84==='1')return;
  const body=view.querySelector('.sg82-view-body');if(!body)return;
  view.dataset.sg84='1';const documentKey=keyFor(view),box=document.createElement('section');box.className='sg84-archive';
  box.innerHTML='<div class="sg84-head"><div><strong>Arkiva Elektronike</strong> <span class="sg84-badge">0</span><small style="display:block;color:#64748b">Foto, skanime, PDF dhe ZIP ruhen në cloud dhe hapen nga çdo pajisje. Maksimumi 25 MB.</small></div><div class="sg84-head-actions"><button type="button" class="sg82-action" data-sg84-global>Kërko në Arkivë</button><button type="button" class="sg82-action" data-sg84-add>Bashkëngjit Skedar</button></div></div><input type="file" hidden multiple accept="image/*,.pdf,.zip,application/pdf,application/zip"><div class="sg84-list"></div>';
  body.appendChild(box);const input=box.querySelector('input'),badge=box.querySelector('.sg84-badge'),out=box.querySelector('.sg84-list');
  const render=async()=>{try{const rows=await list(documentKey);badge.textContent=rows.length;out.innerHTML=rows.length?rows.map(r=>rowHtml(r)).join(''):'<div class="sg84-empty">Nuk ka skedarë të bashkëngjitur.</div>';}catch(e){out.innerHTML='<div class="sg84-error">'+esc(e.message||e)+'</div>';}};
  box.querySelector('[data-sg84-add]').onclick=()=>input.click();box.querySelector('[data-sg84-global]').onclick=()=>openCompanyArchive().catch(e=>alert(e.message||e));
  input.onchange=async()=>{box.classList.add('sg84-busy');try{for(const f of [...input.files])await put(view,f);}catch(e){alert(e.message||e);}finally{input.value='';box.classList.remove('sg84-busy');await render();}};
  box.onclick=async e=>{const el=e.target.closest('.sg84-file');if(!el)return;try{const rows=await list(documentKey),row=rows.find(x=>x.id===el.dataset.id);if(!row)return;if(e.target.closest('[data-open],[data-download]'))await openFile(row);if(e.target.closest('[data-delete]')&&confirm('Ta fshij këtë bashkëngjitje?')){await remove(row.id);await render();}}catch(err){alert(err.message||err);}};
  await render();
}
styles();const scan=()=>document.querySelectorAll('.sg82-view').forEach(view=>mount(view).catch(console.error));scan();new MutationObserver(scan).observe(document.documentElement,{subtree:true,childList:true});
window.SGPhase84={list,put,remove,mount,keyFor,openCompanyArchive,MAX_FILE_SIZE,cloud:true};
})();
