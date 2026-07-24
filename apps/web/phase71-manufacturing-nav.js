/* SG_PHASE71_MANUFACTURING_NAV_START */
(function(global){
  'use strict';
  var App=global.App;
  if(!App||typeof App.view_manufacturingDashboard!=='function'||global.__SG_PHASE71_MANUFACTURING_NAV__)return;
  global.__SG_PHASE71_MANUFACTURING_NAV__=true;

  function activate(){
    App.currentView='manufacturingDashboard';
    Array.prototype.slice.call(document.querySelectorAll('.nav-item')).forEach(function(item){item.classList.toggle('active',item.dataset.sg71View==='manufacturingDashboard');});
    var title=document.querySelector('.topbar h2');if(title)title.textContent='Prodhimi / Manufacturing';
    return App.view_manufacturingDashboard();
  }
  App.openManufacturing=activate;

  function install(){
    var sidebar=document.querySelector('.sidebar');if(!sidebar)return;
    Array.prototype.slice.call(document.querySelectorAll('#sg71-manufacturing-nav')).forEach(function(node){if(node.parentNode)node.parentNode.removeChild(node);});
    var section=document.createElement('div');section.id='sg71-manufacturing-nav';section.className='nav-section';section.dataset.sg71Owned='true';
    var heading=document.createElement('div');heading.className='nav-section-title';heading.textContent='PRODHIMI / MANUFACTURING';section.appendChild(heading);
    var item=document.createElement('div');item.className='nav-item';item.dataset.sg71View='manufacturingDashboard';item.innerHTML='<span class="icon">🏭</span><span>Paneli i Prodhimit</span>';item.addEventListener('click',activate);section.appendChild(item);
    sidebar.appendChild(section);
  }
  install();
})(window);
/* SG_PHASE71_MANUFACTURING_NAV_END */
