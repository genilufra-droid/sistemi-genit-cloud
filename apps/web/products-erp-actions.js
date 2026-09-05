/* SG_PRODUCTS_ERP_ACTIONS_START — edit, card, delete and real exports */
(function (global) {
  'use strict';
  function app(){ try{return global.App||global.eval('typeof App!=="undefined"?App:null');}catch(_){return null;} }
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(v){var n=Number(v);return Number.isFinite(n)?n:0;}
  function products(){var A=app();return A&&A.data&&Array.isArray(A.data.products)?A.data.products:[];}
  function activeTable(){
    var tables=document.querySelectorAll('table');
    for(var i=0;i<tables.length;i++){
      var h=String(tables[i].querySelector('thead')&&tables[i].querySelector('thead').textContent||'').toLocaleUpperCase('sq-AL');
      if(h.indexOf('KODI')>=0&&h.indexOf('EMRI')>=0&&h.indexOf('NJËSIA')>=0&&h.indexOf('STOKU')>=0)return tables[i];
    }
    return null;
  }
  function findProduct(row){
    var cells=row.querySelectorAll('td'); if(!cells.length)return null;
    var code=String(cells[0].textContent||'').trim(); var name=String(cells[1]&&cells[1].textContent||'').trim();
    return products().find(function(p){return String(p.code||'').trim()===code;})||products().find(function(p){return String(p.name||'').trim()===name;})||null;
  }
  function closeCard(){var x=document.getElementById('sg-product-card-overlay');if(x)x.remove();}
  function showCard(p){
    closeCard(); var A=app(); var moves=((A&&A.data&&A.data.stockMovements)||[]).filter(function(m){return m.productId===p.id;});
    var overlay=document.createElement('div'); overlay.id='sg-product-card-overlay'; overlay.className='sg-product-card-overlay';
    var rows=moves.slice(-20).reverse().map(function(m){return '<tr><td>'+esc(m.date||m.createdAt||'—')+'</td><td>'+esc(m.documentNo||m.docNumber||m.type||'Lëvizje')+'</td><td class="num">'+esc(num(m.quantityBase||m.quantity))+'</td><td class="num">'+esc(num(m.balance))+'</td></tr>';}).join('');
    overlay.innerHTML='<div class="sg-product-card"><div class="sg-product-card-head"><div><small>KARTELA E ARTIKULLIT</small><h2>'+esc(p.name||'Artikull')+'</h2><span>'+esc(p.code||'—')+'</span></div><button type="button" data-close>×</button></div><div class="sg-product-kpis"><div><b>'+esc(num(p.stock))+'</b><span>Stoku</span></div><div><b>'+esc(num(p.purchasePrice||p.lastPrice))+'</b><span>Çmimi blerjes</span></div><div><b>'+esc(num(p.salePrice||p.salesPrice))+'</b><span>Çmimi shitjes</span></div><div><b>'+esc(p.baseUnit||'—')+'</b><span>Njësia</span></div></div><div class="sg-product-card-grid"><div><label>Barcode</label><strong>'+esc(p.barcode||'—')+'</strong></div><div><label>Kategoria</label><strong>'+esc(p.category||'—')+'</strong></div><div><label>Stoku minimum</label><strong>'+esc(num(p.minStock))+'</strong></div><div><label>Statusi</label><strong>'+(p.active===false?'Joaktiv':'Aktiv')+'</strong></div></div><h3>Lëvizjet e fundit të stokut</h3><div class="sg-product-moves"><table><thead><tr><th>Data</th><th>Dokumenti</th><th>Sasia</th><th>Balanca</th></tr></thead><tbody>'+(rows||'<tr><td colspan="4">Nuk ka lëvizje të regjistruara.</td></tr>')+'</tbody></table></div><div class="sg-product-card-actions"><button type="button" data-edit>Edito</button><button type="button" data-close>Mbyll</button></div></div>';
    overlay.addEventListener('click',function(e){if(e.target===overlay||e.target.hasAttribute('data-close'))closeCard();if(e.target.hasAttribute('data-edit')){closeCard();if(A&&A.editProduct)A.editProduct(p);}});
    document.body.appendChild(overlay);
  }
  function edit(p){var A=app();if(A&&typeof A.editProduct==='function')A.editProduct(p);}
  function remove(p){var A=app();if(A&&typeof A.deleteMasterRecord==='function')A.deleteMasterRecord('product',p.id);}
  function download(blob,name){var u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u);},1000);}
  function exportExcel(){
    var ps=products(); var headers=['Kodi','Emri','Barcode','Njësia','Stoku','Stoku Minimum','Çmimi Blerjes','Çmimi Shitjes','Kategoria','Statusi'];
    var rows=ps.map(function(p){return [p.code,p.name,p.barcode,p.baseUnit,num(p.stock),num(p.minStock),num(p.purchasePrice||p.lastPrice),num(p.salePrice||p.salesPrice),p.category,p.active===false?'JOAKTIV':'AKTIV'];});
    var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><style>table{border-collapse:collapse;font-family:Arial}th,td{border:1px solid #bbb;padding:6px}th{font-weight:700;background:#eee}</style></head><body><table><thead><tr>'+headers.map(function(h){return '<th>'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(r){return '<tr>'+r.map(function(v){return '<td>'+esc(v)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></body></html>';
    download(new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'}),'Artikujt_'+new Date().toISOString().slice(0,10)+'.xls');
  }
  function pdfText(s){return String(s==null?'':s).replace(/[\\()]/g,'\\$&').replace(/[^\x20-\x7E]/g,'?');}
  function exportPDF(){
    var ps=products(),lines=['SISTEMI GENIT - LISTA E ARTIKUJVE','Data: '+new Date().toLocaleDateString('sq-AL'),''];
    ps.forEach(function(p,i){lines.push((i+1)+'. '+(p.code||'')+' | '+(p.name||'')+' | '+(p.baseUnit||'')+' | Stok: '+num(p.stock)+' | Blerje: '+num(p.purchasePrice||p.lastPrice)+' | Shitje: '+num(p.salePrice||p.salesPrice)+' | '+(p.active===false?'JOAKTIV':'AKTIV'));});
    var content='BT\n/F1 10 Tf\n40 800 Td\n14 TL\n'; lines.slice(0,52).forEach(function(l,i){content+='('+pdfText(l)+') Tj\n';if(i<51)content+='T*\n';}); content+='ET';
    var objs=[];function o(s){objs.push(s);return objs.length;}
    var font=o('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    var stream=o('<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream');
    var page=o('<< /Type /Page /Parent 4 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '+font+' 0 R >> >> /Contents '+stream+' 0 R >>');
    o('<< /Type /Pages /Kids ['+page+' 0 R] /Count 1 >>'); var catalog=o('<< /Type /Catalog /Pages 4 0 R >>');
    var out='%PDF-1.4\n',offs=[0];objs.forEach(function(s,i){offs.push(out.length);out+=(i+1)+' 0 obj\n'+s+'\nendobj\n';});var x=out.length;out+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';for(var i=1;i<=objs.length;i++)out+=String(offs[i]).padStart(10,'0')+' 00000 n \n';out+='trailer\n<< /Size '+(objs.length+1)+' /Root '+catalog+' 0 R >>\nstartxref\n'+x+'\n%%EOF';
    download(new Blob([out],{type:'application/pdf'}),'Artikujt_'+new Date().toISOString().slice(0,10)+'.pdf');
  }
  function decorate(){
    var t=activeTable(); if(!t)return;
    if(!t.dataset.sgActions){
      t.dataset.sgActions='1'; var hr=t.querySelector('thead tr'); if(hr){var th=document.createElement('th');th.textContent='VEPRIME';th.className='sg-actions-col';hr.appendChild(th);}
    }
    var rows=t.querySelectorAll('tbody tr');
    Array.prototype.forEach.call(rows,function(row){if(row.dataset.sgActions)return;var p=findProduct(row);if(!p)return;row.dataset.sgActions='1';row.classList.add('sg-product-row');var td=document.createElement('td');td.className='sg-actions-cell';td.innerHTML='<button type="button" data-a="card" title="Kartela">Kartela</button><button type="button" data-a="edit" title="Edito">Edito</button><button type="button" data-a="delete" title="Fshi">Fshi</button>';td.addEventListener('click',function(e){e.stopPropagation();var a=e.target&&e.target.dataset&&e.target.dataset.a;if(a==='card')showCard(p);if(a==='edit')edit(p);if(a==='delete')remove(p);});row.appendChild(td);row.addEventListener('dblclick',function(){edit(p);});
    });
    var card=t.closest('.card,.panel,.content-card')||t.parentElement;if(card&&!card.querySelector('.sg-products-exportbar')){var bar=document.createElement('div');bar.className='sg-products-exportbar';bar.innerHTML='<button type="button" data-x="pdf">PDF</button><button type="button" data-x="excel">Excel</button>';bar.addEventListener('click',function(e){if(e.target.dataset.x==='pdf')exportPDF();if(e.target.dataset.x==='excel')exportExcel();});card.insertBefore(bar,card.firstChild);}
  }
  var observer=new MutationObserver(function(){setTimeout(decorate,0);});observer.observe(document.documentElement,{childList:true,subtree:true});setInterval(decorate,700);decorate();
  global.SGProductsERP={decorate:decorate,exportPDF:exportPDF,exportExcel:exportExcel,showCard:showCard};
})(window);
/* SG_PRODUCTS_ERP_ACTIONS_END */