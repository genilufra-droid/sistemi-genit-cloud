(()=>{
'use strict';
const MARK='SG_PHASE82_GLOBAL_SEARCH_DOCUMENT_ACTIONS_START';
if(window.__sgPhase82Installed)return;
window.__sgPhase82Installed=true;
console.info(MARK);

const esc=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=(v)=>String(v??'').toLocaleLowerCase('sq-AL').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

function addStyles(){
 if(document.getElementById('sg-phase82-style'))return;
 const style=document.createElement('style');
 style.id='sg-phase82-style';
 style.textContent=`
 .sg82-combo{position:relative;display:flex;gap:6px;align-items:stretch;width:100%}.sg82-combo-input{width:100%;min-height:38px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 34px 8px 10px;background:#fff;color:#0f172a;font:inherit}.sg82-combo-input:focus{outline:2px solid rgba(37,99,235,.25);border-color:#2563eb}.sg82-combo-clear{position:absolute;right:7px;top:50%;transform:translateY(-50%);border:0;background:transparent;font-size:18px;cursor:pointer;color:#64748b}.sg82-results{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:10050;background:#fff;border:1px solid #cbd5e1;border-radius:9px;box-shadow:0 12px 30px rgba(15,23,42,.18);max-height:280px;overflow:auto;padding:4px}.sg82-option{display:block;width:100%;text-align:left;border:0;background:#fff;border-radius:7px;padding:9px 10px;cursor:pointer;color:#0f172a}.sg82-option:hover,.sg82-option[aria-selected="true"]{background:#eff6ff}.sg82-empty{padding:10px;color:#64748b}.sg82-hidden-select{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;overflow:hidden!important}.sg82-actions{white-space:nowrap;display:flex;gap:5px;align-items:center}.sg82-action{border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:5px 8px;cursor:pointer;font:inherit;font-size:12px}.sg82-action:hover{background:#f8fafc}.sg82-action-danger{color:#b91c1c;border-color:#fecaca}.sg82-toast{position:fixed;right:18px;bottom:18px;z-index:22000;background:#0f172a;color:#fff;padding:10px 14px;border-radius:9px;box-shadow:0 12px 30px rgba(0,0,0,.2)}
 @media(max-width:720px){.sg82-action{padding:6px}.sg82-actions{min-width:0;flex-wrap:wrap}}
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
function likelyLinkHeader(text){return /(nr\.?|numri|dokumenti|fatur|flet[eë]|artikull|produkt|lot|klient|furnitor|shofer|itinerar|automjet|lokacion|kod)/i.test(text||'');}
function likelyDocumentTable(headers){return headers.some(likelyLinkHeader)&&headers.length>1;}
function showToast(msg){const el=document.createElement('div');el.className='sg82-toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2600);}

function actionText(el){return norm([el.textContent,el.getAttribute('title'),el.getAttribute('aria-label'),el.getAttribute('onclick'),el.getAttribute('href'),el.dataset?.action].filter(Boolean).join(' '));}
function originalControls(row){return [...row.querySelectorAll('a,button,[role="button"]')].filter(el=>!el.closest('.sg82-actions'));}
function findControl(controls,pattern){return controls.find(el=>pattern.test(actionText(el)));}
function invoke(el,row){
 if(el){el.click();return true;}
 const handler=row.getAttribute('onclick');
 if(handler){row.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));return true;}
 return false;
}

function enhanceTable(table){
 if(!table||table.dataset.sg82==='1'||table.closest('.sg82-combo'))return;
 const headers=tableHeaders(table);if(!likelyDocumentTable(headers))return;
 table.dataset.sg82='1';
 [...(table.tBodies||[])].forEach(tb=>[...tb.rows].forEach(row=>{
   if(row.dataset.sg82==='1')return;
   row.dataset.sg82='1';
   const controls=originalControls(row);
   const edit=findControl(controls,/(^|\s)(edit|edito|ndrysho|modify|update)(\s|$)/);
   const del=findControl(controls,/(^|\s)(delete|fshi|anulo|cancel)(\s|$)/);
   const view=findControl(controls,/(^|\s)(view|shiko|hap|open|document|fatur|flet[eë]|lot)(\s|$)/)||controls.find(el=>el.tagName==='A'||el.hasAttribute('onclick'));
   const canView=!!view||row.hasAttribute('onclick');
   if(!canView&&!edit&&!del)return;
   let actionIndex=headers.findIndex(h=>/^veprime$/i.test(h));
   if(actionIndex<0&&table.tHead?.rows?.[0]){const th=document.createElement('th');th.textContent='Veprime';table.tHead.rows[0].appendChild(th);actionIndex=table.tHead.rows[0].cells.length-1;headers.push('Veprime');}
   let cell=row.cells[actionIndex];if(!cell)cell=row.insertCell(-1);
   if(cell.querySelector('.sg82-actions'))return;
   const box=document.createElement('div');box.className='sg82-actions';
   if(canView){const b=document.createElement('button');b.type='button';b.className='sg82-action';b.textContent='Shiko';b.addEventListener('click',(e)=>{e.stopPropagation();if(!invoke(view,row))showToast('Dokumenti real nuk ka ende handler hapjeje.');});box.appendChild(b);}
   if(edit){const b=document.createElement('button');b.type='button';b.className='sg82-action';b.textContent='Edito';b.addEventListener('click',(e)=>{e.stopPropagation();edit.click();});box.appendChild(b);}
   if(del){const b=document.createElement('button');b.type='button';b.className='sg82-action sg82-action-danger';b.textContent=/anulo|cancel/.test(actionText(del))?'Anulo':'Fshi';b.addEventListener('click',(e)=>{e.stopPropagation();del.click();});box.appendChild(b);}
   if(box.children.length)cell.appendChild(box);
 }));
}

function scan(root=document){
 root.querySelectorAll?.('select').forEach(enhanceSelect);
 root.querySelectorAll?.('table').forEach(enhanceTable);
}

addStyles();scan();
let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan();});});observer.observe(document.documentElement,{subtree:true,childList:true});
window.SGPhase82={scan,enhanceSelect,enhanceTable};
})();