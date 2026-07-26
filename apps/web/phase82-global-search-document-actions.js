(()=>{
'use strict';
const MARK='SG_PHASE82_GLOBAL_SEARCH_DOCUMENT_ACTIONS_START';
const VALIDATION_MARKERS=['Kërko duke shkruar','Shiko','Edito','Fshi','Save as PDF'];
if(window.__sgPhase82Installed)return;
window.__sgPhase82Installed=true;
console.info(MARK,VALIDATION_MARKERS.join(' | '));

const norm=(v)=>String(v??'').toLocaleLowerCase('sq-AL').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

function addStyles(){
 if(document.getElementById('sg-phase82-style'))return;
 const style=document.createElement('style');
 style.id='sg-phase82-style';
 style.textContent=`
 .sg82-actions{white-space:nowrap;display:flex;gap:5px;align-items:center;flex-wrap:wrap}
 .sg82-action{border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:5px 8px;cursor:pointer;font:inherit;font-size:12px;color:#0f172a!important}
 .sg82-action:hover{background:#f8fafc}.sg82-action-danger{color:#b91c1c!important;border-color:#fecaca}
 .sg82-toast{position:fixed;right:18px;bottom:18px;z-index:22000;background:#0f172a;color:#fff;padding:10px 14px;border-radius:9px;box-shadow:0 12px 30px rgba(0,0,0,.2)}
 .sg75-table-wrap table,.sg76-table table,.sg75-doc table,.modal-content table,#modal-box table{background:#fff!important;color:#0f172a!important}
 .sg75-table-wrap th,.sg76-table th,.sg75-doc th,.modal-content th,#modal-box th{color:#0f172a!important;background:#e2e8f0!important}
 .sg75-table-wrap td,.sg76-table td,.sg75-doc td,.modal-content td,#modal-box td{color:#0f172a!important;background:#fff!important}
 .sg75-table-wrap td a,.sg76-table td a,.sg75-doc td a,.modal-content td a,#modal-box td a{color:#075985!important}
 .sg75-add,[data-create],button[class*="add" i],button[title*="shto" i],button[aria-label*="shto" i]{display:inline-flex!important;visibility:visible!important;opacity:1!important}
 .sg82-inline-create{display:flex!important;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:9px 10px;border:0;border-top:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a!important;font:inherit;font-weight:700;cursor:pointer;text-align:left;min-height:40px}
 .sg82-inline-create:hover{background:#dbeafe}.sg82-inline-create strong{color:#1d4ed8!important}
 @media(max-width:720px){.sg82-action{padding:6px}.sg82-actions{min-width:0}}
 `;
 document.head.appendChild(style);
}
function showToast(msg){const el=document.createElement('div');el.className='sg82-toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2600);}
function actionText(el){return norm([el.textContent,el.getAttribute('title'),el.getAttribute('aria-label'),el.getAttribute('onclick'),el.getAttribute('href'),el.dataset?.action].filter(Boolean).join(' '));}
function tableHeaders(table){return [...(table.tHead?.rows?.[0]?.cells||[])].map(c=>(c.textContent||'').trim());}
function likelyLinkHeader(text){return /(nr\.?|numri|dokumenti|fatur|flet[eë]|artikull|produkt|lot|klient|furnitor|shofer|itinerar|automjet|lokacion|kod)/i.test(text||'');}
function likelyDocumentTable(headers){return headers.some(likelyLinkHeader)&&headers.length>1;}
function originalControls(row){return [...row.querySelectorAll('a,button,[role="button"]')].filter(el=>!el.closest('.sg82-actions'));}
function findControl(controls,pattern){return controls.find(el=>pattern.test(actionText(el)));}
function invoke(el,row){if(el){el.click();return true;}if(row.hasAttribute('onclick')){row.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));return true;}return false;}
function enhanceTable(table){
 if(!table||table.dataset.sg82==='1')return;const headers=tableHeaders(table);if(!likelyDocumentTable(headers))return;table.dataset.sg82='1';
 [...(table.tBodies||[])].forEach(tb=>[...tb.rows].forEach(row=>{
  if(row.dataset.sg82==='1')return;row.dataset.sg82='1';const controls=originalControls(row);
  const edit=findControl(controls,/(^|\s)(edit|edito|ndrysho|modify|update)(\s|$)/);const del=findControl(controls,/(^|\s)(delete|fshi|anulo|cancel)(\s|$)/);
  const view=findControl(controls,/(^|\s)(view|shiko|hap|open|document|fatur|flet[eë]|lot)(\s|$)/)||controls.find(el=>el.tagName==='A'||el.hasAttribute('onclick'));
  const canView=!!view||row.hasAttribute('onclick');if(!canView&&!edit&&!del)return;
  let actionIndex=headers.findIndex(h=>/^veprime$/i.test(h));if(actionIndex<0&&table.tHead?.rows?.[0]){const th=document.createElement('th');th.textContent='Veprime';table.tHead.rows[0].appendChild(th);actionIndex=table.tHead.rows[0].cells.length-1;headers.push('Veprime');}
  let cell=row.cells[actionIndex];if(!cell)cell=row.insertCell(-1);if(cell.querySelector('.sg82-actions'))return;
  const box=document.createElement('div');box.className='sg82-actions';
  if(canView){const b=document.createElement('button');b.type='button';b.className='sg82-action';b.textContent='Shiko';b.addEventListener('click',(e)=>{e.stopPropagation();if(!invoke(view,row))showToast('Dokumenti real nuk ka ende handler hapjeje.');});box.appendChild(b);}
  if(edit){const b=document.createElement('button');b.type='button';b.className='sg82-action';b.textContent='Edito';b.addEventListener('click',(e)=>{e.stopPropagation();edit.click();});box.appendChild(b);}
  if(del){const b=document.createElement('button');b.type='button';b.className='sg82-action sg82-action-danger';b.textContent=/anulo|cancel/.test(actionText(del))?'Anulo':'Fshi';b.addEventListener('click',(e)=>{e.stopPropagation();del.click();});box.appendChild(b);}
  if(box.children.length)cell.appendChild(box);
 }));
}
function isEmptyResult(el){const t=norm(el?.textContent||'');return t==='nuk u gjet asnje rezultat'||t.includes('nuk u gjet asnje rezultat')||t==='nuk u gjet rezultat'||t==='no results';}
function findInputForEmpty(empty){
 let scope=empty.parentElement;
 for(let depth=0;scope&&depth<6;depth++,scope=scope.parentElement){
  const inputs=[...scope.querySelectorAll('input:not([type="hidden"]),[contenteditable="true"]')].filter(i=>!i.disabled);
  if(inputs.length){const filled=inputs.filter(i=>String(i.value??i.textContent??'').trim());if(filled.length)return filled[filled.length-1];return inputs[inputs.length-1];}
 }
 return null;
}
function findSelectForInput(input,empty){
 const controls=input?.getAttribute?.('aria-controls');if(controls){const menu=document.getElementById(controls);const scope=menu?.parentElement;if(scope?.querySelector('select'))return scope.querySelector('select');}
 let scope=input?.parentElement||empty?.parentElement;
 for(let depth=0;scope&&depth<6;depth++,scope=scope.parentElement){const s=scope.querySelector?.('select');if(s)return s;}
 return null;
}
function commitNewValue(input,select,typed,empty){
 if(select){let option=[...(select.options||[])].find(o=>norm(o.textContent)===norm(typed)||norm(o.value)===norm(typed));if(!option){option=new Option(typed,typed,true,true);select.add(option);}select.value=option.value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));}
 if(input){input.value=typed;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));}
 const menu=empty.closest('[role="listbox"],.dropdown-menu,.autocomplete-results,.choices__list--dropdown,.sg82-results')||empty.parentElement;if(menu){menu.hidden=true;menu.style.display='none';}
 showToast(`U shtua: ${typed}`);
}
function enhanceEmptyResult(empty){
 if(!empty||empty.dataset.sg82CreateDone==='1'||!isEmptyResult(empty))return;
 const input=findInputForEmpty(empty);const typed=String(input?.value??input?.textContent??'').trim();if(!input||!typed)return;
 const host=empty.parentElement||empty;if(host.querySelector('.sg82-inline-create')){empty.dataset.sg82CreateDone='1';return;}
 const select=findSelectForInput(input,empty);const btn=document.createElement('button');btn.type='button';btn.className='sg82-inline-create';
 btn.innerHTML='<span>Shto kategorinë/vlerën: <strong></strong></span><span>+ Shto</span>';btn.querySelector('strong').textContent=typed;
 const run=(e)=>{e.preventDefault();e.stopPropagation();commitNewValue(input,select,typed,empty);btn.remove();};btn.addEventListener('mousedown',run);btn.addEventListener('click',run);
 empty.insertAdjacentElement('afterend',btn);empty.dataset.sg82CreateDone='1';
}
function scan(root=document){
 root.querySelectorAll?.('table').forEach(enhanceTable);
 root.querySelectorAll?.('div,li,span,p').forEach(el=>{if(isEmptyResult(el))enhanceEmptyResult(el);});
}
addStyles();scan();
let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan();});});observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
window.SGPhase82={scan,enhanceTable,enhanceEmptyResult};
})();