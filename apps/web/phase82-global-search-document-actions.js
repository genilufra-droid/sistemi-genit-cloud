(()=>{
'use strict';
const MARK='SG_PHASE82_GLOBAL_SEARCH_DOCUMENT_ACTIONS_START';
if(window.__sgPhase82Installed)return;
window.__sgPhase82Installed=true;
console.info(MARK);

const esc=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=(v)=>String(v??'').toLocaleLowerCase('sq-AL').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const interactiveSelector='a,button,input,select,textarea,[role="button"],[contenteditable="true"]';

function addStyles(){
 if(document.getElementById('sg-phase82-style'))return;
 const style=document.createElement('style');
 style.id='sg-phase82-style';
 style.textContent=`
 .sg82-combo{position:relative;display:flex;gap:6px;align-items:stretch;width:100%}.sg82-combo-input{width:100%;min-height:38px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 34px 8px 10px;background:#fff;color:#0f172a;font:inherit}.sg82-combo-input:focus{outline:2px solid rgba(37,99,235,.25);border-color:#2563eb}.sg82-combo-clear{position:absolute;right:7px;top:50%;transform:translateY(-50%);border:0;background:transparent;font-size:18px;cursor:pointer;color:#64748b}.sg82-results{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:10050;background:#fff;border:1px solid #cbd5e1;border-radius:9px;box-shadow:0 12px 30px rgba(15,23,42,.18);max-height:280px;overflow:auto;padding:4px}.sg82-option{display:block;width:100%;text-align:left;border:0;background:#fff;border-radius:7px;padding:9px 10px;cursor:pointer;color:#0f172a}.sg82-option:hover,.sg82-option[aria-selected="true"]{background:#eff6ff}.sg82-empty{padding:10px;color:#64748b}.sg82-hidden-select{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;overflow:hidden!important}.sg82-doc-link{border:0;background:transparent;padding:0;color:#075985;text-decoration:underline;text-underline-offset:2px;font:inherit;font-weight:600;cursor:pointer}.sg82-actions{white-space:nowrap;display:flex;gap:5px;align-items:center}.sg82-action{border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:5px 8px;cursor:pointer;font:inherit;font-size:12px}.sg82-action:hover{background:#f8fafc}.sg82-action-danger{color:#b91c1c;border-color:#fecaca}.sg82-view-overlay{position:fixed;inset:0;z-index:20000;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:18px;overflow:auto}.sg82-view{width:min(980px,100%);margin:auto;background:#fff;border-radius:14px;box-shadow:0 25px 70px rgba(0,0,0,.28);overflow:hidden}.sg82-view-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 18px;border-bottom:1px solid #e2e8f0}.sg82-view-tools{display:flex;gap:7px;flex-wrap:wrap}.sg82-view-body{padding:18px}.sg82-doc-sheet{border:1px solid #cbd5e1;padding:20px;background:#fff}.sg82-doc-sheet h2{margin:0 0 16px}.sg82-kv{display:grid;grid-template-columns:minmax(150px,240px) 1fr;border-top:1px solid #e2e8f0}.sg82-kv>div{padding:9px;border-bottom:1px solid #e2e8f0}.sg82-kv>div:first-child{font-weight:700;background:#f8fafc}.sg82-toast{position:fixed;right:18px;bottom:18px;z-index:22000;background:#0f172a;color:#fff;padding:10px 14px;border-radius:9px;box-shadow:0 12px 30px rgba(0,0,0,.2)}
 @media(max-width:720px){.sg82-action{padding:6px}.sg82-actions{min-width:180px}.sg82-view-overlay{padding:0}.sg82-view{border-radius:0;min-height:100vh}.sg82-kv{grid-template-columns:1fr}.sg82-kv>div:first-child{border-bottom:0}}
 @media print{body.sg82-printing>*:not(.sg82-view-overlay){display:none!important}.sg82-view-overlay{position:static!important;background:#fff!important;padding:0!important}.sg82-view{box-shadow:none!important;width:100%!important}.sg82-view-head{display:none!important}.sg82-doc-sheet{border:0!important}}
 `;
 document.head.appendChild(style);
}

function dispatchChange(select){
 select.dispatchEvent(new Event('input',{bubbles:true}));
 select.dispatchEvent(new Event('change',{bubbles:true}));
}

function enhanceSelect(select){
 if(!select||select.dataset.sg82==='1'||select.multiple||select.size>1||select.closest('.sg82-combo'))return;
 if(select.disabled||select.hidden||select.type==='hidden')return;
 const options=()=>Array.from(select.options||[]).map((o,i)=>({i,value:o.value,label:(o.textContent||'').trim(),disabled:o.disabled}));
 const wrapper=document.createElement('div');wrapper.className='sg82-combo';
 const input=document.createElement('input');input.type='search';input.autocomplete='off';input.className='sg82-combo-input';
 input.placeholder=select.getAttribute('data-placeholder')||select.getAttribute('aria-label')||select.options?.[0]?.textContent?.trim()||'Kërko duke shkruar…';
 input.value=select.selectedOptions?.[0]?.value?select.selectedOptions[0].textContent.trim():'';
 const clear=document.createElement('button');clear.type='button';clear.className='sg82-combo-clear';clear.textContent='×';clear.setAttribute('aria-label','Pastro');
 const menu=document.createElement('div');menu.className='sg82-results';menu.hidden=true;
 select.parentNode.insertBefore(wrapper,select);wrapper.append(input,clear,menu,select);select.classList.add('sg82-hidden-select');select.dataset.sg82='1';
 let active=-1;
 const close=()=>{menu.hidden=true;active=-1;};
 const render=()=>{
   const q=norm(input.value);const rows=options().filter(o=>!o.disabled&&(!q||norm(o.label).includes(q))).slice(0,80);
   menu.innerHTML=rows.length?rows.map((o,j)=>`<button type="button" class="sg82-option" data-index="${o.i}" data-pos="${j}">${esc(o.label||'—')}</button>`).join(''):'<div class="sg82-empty">Nuk u gjet asnjë rezultat.</div>';
   menu.hidden=false;active=-1;
 };
 const choose=(idx)=>{const o=select.options[Number(idx)];if(!o)return;select.value=o.value;input.value=(o.textContent||'').trim();close();dispatchChange(select);};
 input.addEventListener('focus',render);input.addEventListener('input',render);
 input.addEventListener('keydown',(e)=>{const buttons=[...menu.querySelectorAll('.sg82-option')];if(e.key==='ArrowDown'){e.preventDefault();active=Math.min(active+1,buttons.length-1);}else if(e.key==='ArrowUp'){e.preventDefault();active=Math.max(active-1,0);}else if(e.key==='Enter'&&active>=0){e.preventDefault();buttons[active]?.click();return;}else if(e.key==='Escape'){close();return;}buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===active)));buttons[active]?.scrollIntoView({block:'nearest'});});
 menu.addEventListener('mousedown',(e)=>{const b=e.target.closest('.sg82-option');if(b){e.preventDefault();choose(b.dataset.index);}});
 clear.addEventListener('click',()=>{select.selectedIndex=0;input.value='';dispatchChange(select);input.focus();render();});
 select.addEventListener('change',()=>{input.value=select.selectedOptions?.[0]?.value?(select.selectedOptions[0].textContent||'').trim():'';});
 document.addEventListener('pointerdown',(e)=>{if(!wrapper.contains(e.target))close();},{passive:true});
}

function tableHeaders(table){return [...(table.tHead?.rows?.[0]?.cells||[])].map(c=>(c.textContent||'').trim());}
function rowData(row,headers){const data={};[...row.cells].forEach((c,i)=>{const key=headers[i]||`Kolona ${i+1}`;data[key]=(c.innerText||c.textContent||'').trim();});return data;}
function likelyLinkHeader(text){return /(nr\.?|numri|dokumenti|fatur|flet[eë]|artikull|produkt|lot|klient|furnitor|shofer|itinerar|automjet|lokacion|kod)/i.test(text||'');}
function likelyDocumentTable(headers){return headers.some(likelyLinkHeader)&&headers.length>1;}

function showToast(msg){const el=document.createElement('div');el.className='sg82-toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2600);}

function openDocumentView(title,data,sourceRow){
 const overlay=document.createElement('div');overlay.className='sg82-view-overlay';
 const pairs=Object.entries(data).filter(([k,v])=>k&&!/^veprime$/i.test(k)&&v);
 overlay.innerHTML=`<section class="sg82-view" role="dialog" aria-modal="true"><header class="sg82-view-head"><strong>${esc(title||'Pamja e dokumentit')}</strong><div class="sg82-view-tools"><button class="sg82-action" data-act="print">Print</button><button class="sg82-action" data-act="pdf">PDF</button><button class="sg82-action" data-act="excel">Excel</button><button class="sg82-action" data-act="close">Mbyll</button></div></header><div class="sg82-view-body"><article class="sg82-doc-sheet"><h2>${esc(title||'Dokument')}</h2><div class="sg82-kv">${pairs.map(([k,v])=>`<div>${esc(k)}</div><div>${esc(v)}</div>`).join('')}</div></article></div></section>`;
 document.body.appendChild(overlay);
 const close=()=>overlay.remove();
 overlay.addEventListener('click',(e)=>{if(e.target===overlay)close();const a=e.target.closest('[data-act]')?.dataset.act;if(!a)return;if(a==='close')close();if(a==='print'){document.body.classList.add('sg82-printing');window.print();setTimeout(()=>document.body.classList.remove('sg82-printing'),500);}if(a==='pdf'){document.body.classList.add('sg82-printing');showToast('Zgjidh “Save as PDF” në dritaren e printimit.');window.print();setTimeout(()=>document.body.classList.remove('sg82-printing'),500);}if(a==='excel'){const csv=[Object.keys(data),Object.values(data)].map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=(title||'dokument')+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}});
}

function enhanceTable(table){
 if(!table||table.dataset.sg82==='1'||table.closest('.sg82-view'))return;
 const headers=tableHeaders(table);if(!likelyDocumentTable(headers))return;
 table.dataset.sg82='1';
 let actionIndex=headers.findIndex(h=>/^veprime$/i.test(h));
 if(actionIndex<0&&table.tHead?.rows?.[0]){const th=document.createElement('th');th.textContent='Veprime';table.tHead.rows[0].appendChild(th);actionIndex=headers.length;headers.push('Veprime');}
 [...(table.tBodies||[])].forEach(tb=>[...tb.rows].forEach(row=>{
   if(row.dataset.sg82==='1')return;row.dataset.sg82='1';const data=rowData(row,headers);const title=Object.entries(data).find(([k,v])=>likelyLinkHeader(k)&&v)?.[1]||'Dokument';
   [...row.cells].forEach((cell,i)=>{if(!likelyLinkHeader(headers[i])||cell.querySelector(interactiveSelector)||!cell.textContent.trim())return;const text=cell.textContent.trim();const b=document.createElement('button');b.type='button';b.className='sg82-doc-link';b.textContent=text;b.title='Hap pamjen e dokumentit';b.addEventListener('click',(e)=>{e.stopPropagation();openDocumentView(text,data,row);});cell.textContent='';cell.appendChild(b);});
   let cell=row.cells[actionIndex];if(!cell){cell=row.insertCell(-1);}if(!cell.querySelector('.sg82-actions')){const box=document.createElement('div');box.className='sg82-actions';box.innerHTML='<button type="button" class="sg82-action" data-sg82-row="view">Shiko</button><button type="button" class="sg82-action" data-sg82-row="edit">Edito</button><button type="button" class="sg82-action sg82-action-danger" data-sg82-row="delete">Fshi</button>';cell.appendChild(box);box.addEventListener('click',(e)=>{e.stopPropagation();const act=e.target.closest('[data-sg82-row]')?.dataset.sg82Row;if(act==='view')openDocumentView(title,data,row);if(act==='edit'){const existing=row.querySelector('[data-action*="edit" i],button[title*="edit" i],a[href*="edit" i]');if(existing)existing.click();else{row.dispatchEvent(new CustomEvent('sg:edit',{bubbles:true,detail:{data,row}}));showToast('U kërkua hapja për editim.');}}if(act==='delete'){const existing=row.querySelector('[data-action*="delete" i],button[title*="fshi" i],button[title*="delete" i]');if(existing)existing.click();else if(confirm('Ta anulosh/fshish këtë rekord?')){row.dispatchEvent(new CustomEvent('sg:delete',{bubbles:true,detail:{data,row}}));showToast('Kërkesa për fshirje u dërgua.');}}});}
 }));
}

function scan(root=document){
 root.querySelectorAll?.('select').forEach(enhanceSelect);
 root.querySelectorAll?.('table').forEach(enhanceTable);
}

addStyles();scan();
let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan();});});observer.observe(document.documentElement,{subtree:true,childList:true});
window.SGPhase82={scan,enhanceSelect,enhanceTable,openDocumentView};
})();