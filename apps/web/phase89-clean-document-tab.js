/* SG_PHASE89_CLEAN_DOCUMENT_TAB_START — Sistemi Genit */
(function(global){
  'use strict';
  if(global.__SG_PHASE89_CLEAN_DOCUMENT_TAB__)return;
  global.__SG_PHASE89_CLEAN_DOCUMENT_TAB__=true;

  var query=new URLSearchParams(global.location.search);
  var docId=query.get('sgdocId');
  var isDocumentTab=query.get('sgdocMode')==='clean'&&!!docId;

  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(value){var n=Number(value||0);return Number.isFinite(n)?n.toLocaleString('sq-AL',{minimumFractionDigits:2,maximumFractionDigits:2}):'0,00';}
  function camel(row){var out={};Object.keys(row||{}).forEach(function(k){out[k.replace(/_([a-z])/g,function(_m,c){return c.toUpperCase();})]=row[k];});return out;}
  function cleanUrl(id){var u=new URL(global.location.href);u.searchParams.set('sgdocId',id);u.searchParams.set('sgdocMode','clean');u.hash='document';return u.toString();}

  function installOpenHandler(){
    var App=global.App;
    if(!App||typeof App.sg72OpenDocument!=='function')return false;
    if(App.sg89OriginalOpenDocument)return true;
    App.sg89OriginalOpenDocument=App.sg72OpenDocument;
    App.sg72OpenDocument=function(kind,id){
      if(kind==='business_document'&&id){
        global.open(cleanUrl(id),'_blank','noopener');
        return;
      }
      return App.sg89OriginalOpenDocument.apply(this,arguments);
    };
    return true;
  }

  function documentHtml(d){
    var items=Array.isArray(d.items)?d.items:[];
    var type=String(d.docType||d.documentType||'').toUpperCase();
    var isPurchase=/PURCHASE|BLERJE/.test(type);
    var isWarehouse=/RECEIPT|DELIVERY|FLET|WAREHOUSE/.test(type);
    var title=isWarehouse?(/DELIVERY|DALJE/.test(type)?'FLETË DALJE':'FLETË HYRJE'):(isPurchase?'FATURË BLERJE':'FATURË SHITJE');
    var rows=items.map(function(i,index){return '<tr><td>'+(index+1)+'</td><td>'+esc(i.description||i.productName||'')+'</td><td>'+esc(i.unit||i.unitName||'')+'</td><td>'+esc(i.quantity||0)+'</td><td>'+num(i.unitPrice)+'</td><td>'+num(i.lineTotal!=null?i.lineTotal:i.totalAmount)+'</td></tr>';}).join('');
    if(!rows)rows='<tr><td colspan="6" class="empty">Nuk ka rreshta në dokument.</td></tr>';
    return '<main><div class="tools"><button type="button" onclick="history.back()">Kthehu</button><button type="button" onclick="print()">Print / PDF</button></div><section class="paper"><h1>'+title+'</h1><div class="meta"><div><b>Nr. dokumentit</b><span>'+esc(d.documentNo||d.number||'')+'</span></div><div><b>Data</b><span>'+esc(String(d.documentDate||d.date||'').slice(0,10))+'</span></div><div><b>Partneri</b><span>'+esc(d.partnerName||d.supplierName||d.clientName||'')+'</span></div><div><b>NIPT</b><span>'+esc(d.partnerNipt||d.nipt||'')+'</span></div></div><table><thead><tr><th>Nr.</th><th>Emërtimi</th><th>Njësia</th><th>Sasia</th><th>Çmimi</th><th>Vlera</th></tr></thead><tbody>'+rows+'</tbody></table><div class="totals"><div><span>Vlera pa TVSH</span><b>'+num(d.totalNet)+'</b></div><div><span>TVSH</span><b>'+num(d.totalVat)+'</b></div><div class="grand"><span>Totali</span><b>'+num(d.totalAmount)+'</b></div></div></section></main>';
  }

  function addStyles(){var s=document.createElement('style');s.textContent='html,body{margin:0;background:#e5e7eb;font-family:Arial,sans-serif;color:#111}main{padding:12px}.tools{max-width:210mm;margin:0 auto 8px;display:flex;gap:8px;justify-content:flex-end}.tools button{padding:9px 14px;border:1px solid #bbb;background:#fff;border-radius:6px}.paper{width:210mm;min-height:297mm;margin:auto;background:#fff;padding:12mm;box-sizing:border-box}h1{text-align:center;font-size:24px;margin:0 0 18px}.meta{display:grid;grid-template-columns:1fr 1fr;border:1px solid #222;margin-bottom:12px}.meta div{display:grid;grid-template-columns:42% 58%;min-height:34px;border-bottom:1px solid #ccc}.meta div:nth-last-child(-n+2){border-bottom:0}.meta b,.meta span{padding:8px}.meta b{border-right:1px solid #ccc}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #222;padding:6px;font-size:11px;text-align:center}th:nth-child(1){width:6%}th:nth-child(2){width:38%}.empty{padding:30px}.totals{width:45%;margin-left:auto;margin-top:12px}.totals div{display:flex;justify-content:space-between;border:1px solid #222;border-bottom:0;padding:7px}.totals div:last-child{border-bottom:1px solid #222}.totals .grand{font-size:15px}@media(max-width:800px){main{padding:0;overflow:auto}.tools{position:sticky;top:0;background:#fff;padding:7px;z-index:4}.paper{min-width:210mm;margin:0}}@media print{.tools{display:none}main{padding:0}.paper{margin:0}@page{size:A4;margin:0}}';document.head.appendChild(s);}

  async function renderDocument(){
    var Cloud=global.CloudERP;
    if(!Cloud||typeof Cloud.request!=='function')throw new Error('Lidhja me serverin nuk është gati.');
    var data=camel(await Cloud.request('/api/documents/'+encodeURIComponent(docId)));
    addStyles();
    document.body.innerHTML=documentHtml(data);
    document.documentElement.classList.add('sg89-document-ready');
  }

  if(isDocumentTab){
    var attempts=0;
    (function waitForCloud(){
      if(global.CloudERP&&typeof global.CloudERP.request==='function'){
        renderDocument().catch(function(error){document.body.innerHTML='<div style="padding:24px;font-family:Arial">Dokumenti nuk u ngarkua: '+esc(error&&error.message?error.message:error)+'</div>';});
        return;
      }
      if(++attempts<60){setTimeout(waitForCloud,100);return;}
      document.body.innerHTML='<div style="padding:24px;font-family:Arial">Lidhja me serverin nuk u inicializua.</div>';
    })();
  }else if(!installOpenHandler()){
    global.addEventListener('load',installOpenHandler,{once:true});
  }
})(window);
