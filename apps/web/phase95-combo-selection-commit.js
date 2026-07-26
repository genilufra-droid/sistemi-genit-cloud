/* SG_PHASE95_COMBO_SELECTION_COMMIT_START */
(function(global){
'use strict';
if(global.__SG_PHASE95_COMBO_SELECTION_COMMIT__)return;
global.__SG_PHASE95_COMBO_SELECTION_COMMIT__=true;
function norm(v){var s=String(v==null?'':v).toLocaleLowerCase('sq-AL');if(s.normalize)s=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');return s.replace(/ë/g,'e').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,' ').trim();}
function resolveCombo(combo){
  if(!combo)return true;
  var input=combo.querySelector('.sg61-combo-input');
  var select=combo.previousElementSibling;
  if(!input||!select||select.tagName!=='SELECT')return true;
  var typed=norm(input.value);
  if(!typed){select.value='';return true;}
  var options=[].slice.call(select.options).filter(function(o){return !!o.value;});
  var exact=options.filter(function(o){return norm(o.textContent)===typed;});
  var matches=exact.length?exact:options.filter(function(o){return norm(o.textContent).indexOf(typed)===0;});
  if(matches.length!==1)matches=options.filter(function(o){return norm(o.textContent).indexOf(typed)>=0;});
  if(matches.length===1){
    select.value=matches[0].value;
    input.value=matches[0].textContent.trim();
    select.dataset.selectedId=matches[0].value;
    input.dataset.selectedId=matches[0].value;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }
  return select.value!=='';
}
function resolveAll(root){
  var ok=true;
  (root||document).querySelectorAll('.sg61-combo').forEach(function(combo){if(!resolveCombo(combo))ok=false;});
  return ok;
}
function isSaveButton(button){return /^(ruaj|regjistro|konfirmo|save|krijo)/.test(norm([button.textContent,button.title,button.getAttribute('aria-label')].join(' ')));}
document.addEventListener('click',function(e){
  var button=e.target.closest('button,[role="button"],input[type="submit"]');
  if(!button||!isSaveButton(button))return;
  var scope=button.closest('.modal-content,form,#modal-box')||document;
  if(!resolveAll(scope)){
    e.preventDefault();e.stopImmediatePropagation();
    var App=global.App;
    if(App&&typeof App.toast==='function')App.toast('Zgjidhni partnerin nga lista, jo vetëm duke shkruar emrin.','error');
  }
},true);
document.addEventListener('blur',function(e){if(e.target&&e.target.classList&&e.target.classList.contains('sg61-combo-input'))resolveCombo(e.target.closest('.sg61-combo'));},true);
global.SGPhase95={resolveCombo:resolveCombo,resolveAll:resolveAll};
})(window);
/* SG_PHASE95_COMBO_SELECTION_COMMIT_END */
