/* SG_PHASE96_DOCUMENT_FIDELITY_START — one real source for view, print, PDF, XLSX and links */
(function (global) {
  'use strict';
  if (global.__SG_PHASE96_DOCUMENT_FIDELITY__) return;
  global.__SG_PHASE96_DOCUMENT_FIDELITY__ = true;

  var App = global.App;
  var Cloud = global.CloudERP;
  var query = new URLSearchParams(global.location.search);
  var documentId = query.get('sgdocId');
  var documentKind = query.get('sgdocKind') || 'business_document';
  var fidelityMode = query.get('sgdocMode') === 'fidelity' && documentId;
  var current = null;

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function num(value) { var n=Number(value||0); return Number.isFinite(n)?n:0; }
  function money(value) { return num(value).toLocaleString('sq-AL',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function qty(value) { return num(value).toLocaleString('sq-AL',{minimumFractionDigits:0,maximumFractionDigits:3}); }
  function date(value) { var p=String(value||'').slice(0,10).split('-'); return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(value||''); }
  function typeLabel(type) { return ({PURCHASE_RFQ:'KËRKESË PËR OFERTË',PURCHASE_ORDER:'POROSI BLERJEJE',PURCHASE_RECEIPT:'FLETË HYRJE',PURCHASE_INVOICE:'FATURË BLERJEJE',SALES_QUOTE:'OFERTË SHITJEJE',SALES_ORDER:'POROSI SHITJEJE',DELIVERY_NOTE:'FLETË DALJE',SALES_INVOICE:'FATURË SHITJEJE',WEIGHT_TICKET:'FORMULARI I PESHËS',CASH_RECEIPT:'MANDAT ARKËTIMI',CASH_PAYMENT:'MANDAT PAGESE',BANK_RECEIPT:'ARKËTIM BANKAR',BANK_PAYMENT:'PAGESË BANKARE'})[String(type||'').toUpperCase()]||String(type||'DOKUMENT').replace(/_/g,' '); }
  function safe(value) { return String(value||'Dokument').replace(/[^a-z0-9ëç_-]+/gi,'_').replace(/^_+|_+$/g,''); }
  function camel(row) { var out={}; Object.keys(row||{}).forEach(function(k){out[k.replace(/_([a-z])/g,function(_m,c){return c.toUpperCase();})]=row[k];}); return out; }
  function fidelityUrl(id,kind) { var url=new URL(global.location.href); url.searchParams.set('sgdocId',id);url.searchParams.set('sgdocKind',kind||'business_document'); url.searchParams.set('sgdocMode','fidelity'); url.hash='document'; return url.toString(); }
  function openDocument(id,kind) { if (!id) return; global.location.href=fidelityUrl(id,kind); }

  function linkedHtml(doc) {
    if(doc.traceNodes&&doc.traceNodes.length)return '<section class="sg96-trace"><h3>Gjurmueshmëria e dokumentit — nga formulari i peshës te pagesa</h3><div>'+doc.traceNodes.map(function(row){return '<button data-open-doc="'+esc(row.id)+'" data-open-kind="'+esc(row.kind)+'" class="'+(row.current?'current':'')+'"><small>'+esc(row.kind==='weight_ticket'?'Origjina':row.kind==='finance_document'?(row.accountKind==='BANK'?'Banka':'Arka'):'Dokument')+'</small><strong>'+esc(row.documentNo||typeLabel(row.label))+'</strong><span>'+esc(typeLabel(row.label))+' · '+esc(row.status||'')+'</span></button>';}).join('')+'</div></section>';
    var source=doc.sourceDocumentId?'<button data-open-doc="'+esc(doc.sourceDocumentId)+'"><small>Dokumenti burim</small><strong>'+esc(doc.sourceDocumentNo||doc.sourceDocumentResolvedType||'Hap burimin')+'</strong></button>':'';
    var linked=(doc.linkedDocuments||[]).map(function(row){return '<button data-open-doc="'+esc(row.id)+'"><small>Dokument pasues</small><strong>'+esc(row.documentNo||typeLabel(row.docType))+'</strong><span>'+esc(typeLabel(row.docType))+' · '+esc(row.status||'')+'</span></button>';}).join('');
    if(!source&&!linked)return '';
    return '<section class="sg96-trace"><h3>Gjurmueshmëria e dokumentit</h3><div>'+source+linked+'</div></section>';
  }
  function itemRows(doc,minimum) {
    var rows=(doc.items||[]).map(function(line,index){return '<tr><td>'+(index+1)+'</td><td>'+esc(line.description||line.productName||'')+'</td><td>'+esc(line.unit||'')+'</td><td class="r">'+qty(line.quantity)+'</td><td class="r">'+money(line.unitPrice)+'</td><td class="r">'+money(line.lineTotal)+'</td></tr>';}).join('');
    for(var i=(doc.items||[]).length;i<minimum;i+=1)rows+='<tr><td>'+(i+1)+'</td><td></td><td></td><td></td><td></td><td></td></tr>';
    return rows;
  }
  function warehouse(doc,isOut) {
    return '<section class="sg96-paper"><header class="sg96-wh-head"><div><b>'+esc(doc.companyName||'SISTEMI GENIT')+'</b><small>NIPT: '+esc(doc.companyNipt||'—')+'</small><small>'+esc(doc.companyAddress||'')+'</small></div><div><h1>'+(isOut?'FLETË DALJE':'FLETË HYRJE')+'</h1><p>Nr. <b>'+esc(doc.documentNo||'')+'</b> &nbsp; Dt. <b>'+date(doc.documentDate)+'</b></p></div><div><b>'+(isOut?'Adresa ku shkon malli':'Adresa nga vjen malli')+'</b><p>'+esc(doc.partnerAddress||'—')+'</p></div></header><div class="sg96-meta"><div><b>Emri, mbiemri i personit të autorizuar</b><span>'+esc(doc.partnerName||'—')+'</span></div><div><b>Lloji / targa e mjetit transportues</b><span>'+esc(doc.vehiclePlate||'—')+'</span></div></div><table><thead><tr><th>Nr.</th><th>Emërtimi i mallit</th><th>Njësia</th><th>Sasia</th><th>Çmimi</th><th>Vlefta</th></tr></thead><tbody>'+itemRows(doc,18)+'</tbody></table><footer class="sg96-sign"><div>Magazinieri</div><div>Marrësi në dorëzim</div><div>Transportuesi</div><div>Llogaritari</div></footer>'+linkedHtml(doc)+'</section>';
  }
  function business(doc) {
    var purchase=/^PURCHASE/.test(doc.docType||''),seller=purchase?doc.partnerName:doc.companyName,buyer=purchase?doc.companyName:doc.partnerName;
    return '<section class="sg96-paper"><header class="sg96-title"><div><b>'+esc(doc.companyName||'SISTEMI GENIT')+'</b><small>NIPT: '+esc(doc.companyNipt||'—')+'</small></div><div><h1>'+esc(typeLabel(doc.docType))+'</h1><p>Nr. <b>'+esc(doc.documentNo||'')+'</b> · Data <b>'+date(doc.documentDate)+'</b> · Statusi <b>'+esc(doc.status||'')+'</b></p></div></header><div class="sg96-parties"><div><h3>SHITËSI</h3><b>'+esc(seller||'—')+'</b><p>NIPT: '+esc(purchase?doc.partnerNipt:doc.companyNipt)+'</p><p>Adresa: '+esc(purchase?doc.partnerAddress:doc.companyAddress)+'</p></div><div><h3>BLERËSI</h3><b>'+esc(buyer||'—')+'</b><p>NIPT: '+esc(purchase?doc.companyNipt:doc.partnerNipt)+'</p><p>Adresa: '+esc(purchase?doc.companyAddress:doc.partnerAddress)+'</p></div></div><table><thead><tr><th>Nr.</th><th>Përshkrimi</th><th>Njësia</th><th>Sasia</th><th>Çmimi</th><th>Vlera totale</th></tr></thead><tbody>'+itemRows(doc,8)+'</tbody></table><div class="sg96-totals"><p><span>Vlera pa TVSH</span><b>'+money(doc.totalNet)+'</b></p><p><span>TVSH</span><b>'+money(doc.totalVat)+'</b></p><p><span>TOTALI ALL</span><b>'+money(doc.totalAmount)+'</b></p></div><footer class="sg96-sign"><div>Përgatiti</div><div>Magazinieri</div><div>Pranoi</div><div>Firma / Vula</div></footer>'+linkedHtml(doc)+'</section>';
  }
  function documentHtml(doc) { if(doc.docType==='PURCHASE_RECEIPT')return warehouse(doc,false); if(doc.docType==='DELIVERY_NOTE')return warehouse(doc,true); return business(doc); }
  function weight(doc) {
    return '<section class="sg96-paper"><header class="sg96-title"><div><b>'+esc(doc.companyName||'SISTEMI GENIT')+'</b></div><div><h1>FORMULARI I PESHËS</h1><p>Nr. <b>'+esc(doc.documentNo||'')+'</b> · Data <b>'+date(doc.documentDate)+'</b> · Statusi <b>'+esc(doc.status||'')+'</b></p></div></header><div class="sg96-parties"><div><h3>FURNITORI / FERMERI</h3><b>'+esc(doc.partnerName||'—')+'</b><p>Artikulli: '+esc(doc.productName||'—')+'</p></div><div><h3>TRANSPORTI</h3><p>Targa: '+esc(doc.vehiclePlate||'—')+'</p><p>Magazina: '+esc(doc.warehouseName||'—')+'</p></div></div><table><thead><tr><th>Thasë / Amb.</th><th>Pesha bruto</th><th>Ambalazhi</th><th>Pesha neto</th><th>Zbritje %</th><th>Pesha pranuar</th></tr></thead><tbody><tr><td>'+qty(doc.bagsCount)+'</td><td>'+qty(doc.grossWeight)+'</td><td>'+qty(doc.packagingWeight)+'</td><td>'+qty(doc.netWeight)+'</td><td>'+qty(doc.discountPercent)+'</td><td>'+qty(doc.acceptedWeight)+'</td></tr></tbody></table><div class="sg96-totals"><p><span>Çmimi</span><b>'+money(doc.unitPrice)+'</b></p><p><span>TOTALI ALL</span><b>'+money(doc.totalAmount)+'</b></p></div><footer class="sg96-sign"><div>Operatori</div><div>Furnitori</div><div>Magazinieri</div><div>Kontrolli</div></footer>'+linkedHtml(doc)+'</section>';
  }
  function finance(doc) {
    return '<section class="sg96-paper"><header class="sg96-title"><div><b>'+esc(doc.companyName||'SISTEMI GENIT')+'</b></div><div><h1>'+esc(typeLabel(doc.docType))+'</h1><p>Nr. <b>'+esc(doc.documentNo||'')+'</b> · Data <b>'+date(doc.documentDate)+'</b> · Statusi <b>'+esc(doc.status||'')+'</b></p></div></header><div class="sg96-parties"><div><h3>PARTNERI</h3><b>'+esc(doc.partnerName||'—')+'</b><p>NIPT: '+esc(doc.partnerNipt||'—')+'</p></div><div><h3>ARKA / BANKA</h3><b>'+esc(doc.accountName||'—')+'</b><p>Lloji: '+esc(doc.accountKind||'—')+'</p><p>Referenca: '+esc(doc.referenceNo||'—')+'</p></div></div><div class="sg96-totals" style="width:100%"><p><span>Përshkrimi</span><b>'+esc(doc.description||'—')+'</b></p><p><span>SHUMA '+esc(doc.currency||'ALL')+'</span><b>'+money(doc.totalAmount)+'</b></p></div><table><thead><tr><th>Dokumenti i likuiduar</th><th>Lloji</th><th>Totali</th><th>Paguar</th><th>Mbetur</th><th>Alokimi</th></tr></thead><tbody>'+(doc.allocations||[]).map(function(x){return '<tr><td>'+esc(x.documentNo||'')+'</td><td>'+esc(typeLabel(x.docType))+'</td><td>'+money(x.totalAmount)+'</td><td>'+money(x.paidAmount)+'</td><td>'+money(x.remainingAmount)+'</td><td>'+money(x.amount)+'</td></tr>';}).join('')+'</tbody></table><footer class="sg96-sign"><div>Përgatiti</div><div>Financieri</div><div>Arkëtari</div><div>Marrësi / Paguesi</div></footer>'+linkedHtml(doc)+'</section>';
  }

  function excel() {
    if(!current||!global.XLSX)return alert('Motori Excel nuk është i disponueshëm.');
    var title=typeLabel(current.docType)+' '+current.documentNo;
    var aoa=[[title],[current.companyName||'Sistemi Genit','NIPT: '+(current.companyNipt||'—')],['Data',date(current.documentDate)],['Statusi',current.status],['Partneri',current.partnerName||'—'],['Dokumenti burim',current.sourceDocumentNo||'—'],[],['Nr.','Përshkrimi','Njësia','Sasia','Çmimi','TVSH %','Pa TVSH','TVSH','Totali']];
    (current.items||[]).forEach(function(x,i){aoa.push([i+1,x.description||'',x.unit||'',num(x.quantity),num(x.unitPrice),num(x.vatRate),num(x.lineNet),num(x.lineVat),num(x.lineTotal)]);});
    aoa.push([],['','','','','','','Vlera pa TVSH',num(current.totalNet)],['','','','','','','TVSH',num(current.totalVat)],['','','','','','','TOTALI',num(current.totalAmount)]);
    if((current.linkedDocuments||[]).length){aoa.push([],['DOKUMENTET E LIDHURA']);(current.linkedDocuments||[]).forEach(function(x){aoa.push([typeLabel(x.docType),x.documentNo,x.status]);});}
    var ws=global.XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:8},{wch:34},{wch:12},{wch:12},{wch:14},{wch:10},{wch:16},{wch:14},{wch:16}];ws['!freeze']={xSplit:0,ySplit:8};ws['!autofilter']={ref:'A8:I8'};
    var wb=global.XLSX.utils.book_new();global.XLSX.utils.book_append_sheet(wb,ws,'Dokumenti');
    var filename=safe(title)+'.xlsx';
    if(global.DesktopIO&&global.DesktopIO.saveBinary){
      var bytes=global.XLSX.write(wb,{bookType:'xlsx',type:'array',cellDates:true,compression:true});
      global.DesktopIO.saveBinary(bytes,filename,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }else global.XLSX.writeFile(wb,filename);
  }
  function pdf() {
    if(!current)return;
    var JS=global.jspdf&&global.jspdf.jsPDF;if(!JS)return global.print();
    var doc=new JS({orientation:'portrait',unit:'mm',format:'a4'}),title=typeLabel(current.docType),rows=(current.items||[]).map(function(x,i){return[i+1,x.description||'',x.unit||'',qty(x.quantity),money(x.unitPrice),money(x.lineTotal)];});
    doc.setFontSize(16);doc.text(title,105,15,{align:'center'});doc.setFontSize(9);doc.text('Nr. '+(current.documentNo||'')+'   Data '+date(current.documentDate)+'   Statusi '+(current.status||''),14,23);doc.text((current.companyName||'Sistemi Genit')+' / '+(current.partnerName||'—'),14,29);
    if(typeof doc.autoTable==='function')doc.autoTable({startY:35,head:[['Nr.','Përshkrimi','Njësia','Sasia','Çmimi','Vlera']],body:rows,styles:{fontSize:8},headStyles:{fillColor:[113,75,103]}});
    else {var y=38;rows.forEach(function(r){doc.text(r.join(' | ').slice(0,115),14,y);y+=6;});}
    var end=doc.lastAutoTable?doc.lastAutoTable.finalY+9:150;doc.text('Vlera pa TVSH: '+money(current.totalNet)+' ALL',130,end);doc.text('TVSH: '+money(current.totalVat)+' ALL',130,end+6);doc.setFontSize(11);doc.text('TOTALI: '+money(current.totalAmount)+' ALL',130,end+13);
    var filename=safe(title+'_'+current.documentNo)+'.pdf';
    if(global.DesktopIO&&global.DesktopIO.saveBinary)global.DesktopIO.saveBinary(doc.output('arraybuffer'),filename,'application/pdf');else doc.save(filename);
  }
  function styles() { var s=document.createElement('style');s.textContent='html,body{margin:0;background:#e5e7eb;font-family:Arial;color:#111}.sg96-tools{position:sticky;top:0;z-index:4;display:flex;justify-content:center;gap:8px;padding:9px;background:#fff;border-bottom:1px solid #ccc}.sg96-tools button{padding:9px 14px;border:1px solid #bbb;border-radius:6px;background:#fff;font-weight:700}.sg96-paper{width:210mm;min-height:297mm;margin:12px auto;background:#fff;padding:10mm;box-sizing:border-box}.sg96-title,.sg96-wh-head{display:grid;grid-template-columns:1fr 2fr;border:2px solid #111}.sg96-wh-head{grid-template-columns:1fr 1.5fr 1fr}.sg96-title>div,.sg96-wh-head>div{padding:8px;border-right:1px solid #111}.sg96-title h1,.sg96-wh-head h1{text-align:center;margin:3px;font-size:25px}.sg96-title small,.sg96-wh-head small{display:block;margin-top:5px}.sg96-parties{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:9px 0}.sg96-parties>div,.sg96-meta>div{border:1px solid #111;padding:8px}.sg96-parties p{margin:4px 0;font-size:11px}.sg96-meta{display:grid;grid-template-columns:1fr 1fr}.sg96-meta>div{display:grid;grid-template-columns:1fr 1fr}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #111;padding:5px;font-size:10px;height:24px}th:nth-child(2){width:38%}.r{text-align:right}.sg96-totals{width:42%;margin-left:auto}.sg96-totals p{display:flex;justify-content:space-between;border:1px solid #111;margin:0;padding:7px}.sg96-sign{display:grid;grid-template-columns:repeat(4,1fr);margin-top:32px}.sg96-sign div{text-align:center;border-top:1px solid #111;padding:6px}.sg96-trace{margin-top:18px;border:1px solid #94a3b8;padding:9px}.sg96-trace h3{margin:0 0 8px;font-size:12px}.sg96-trace>div{display:flex;gap:6px;flex-wrap:wrap}.sg96-trace button{display:grid;text-align:left;border:1px solid #714b67;background:#f8f2f6;border-radius:6px;padding:7px;cursor:pointer}.sg96-trace span,.sg96-trace small{font-size:9px}@media(max-width:800px){.sg96-paper{margin:0;min-width:210mm}.sg96-doc{overflow:auto}}@media print{.sg96-tools{display:none}.sg96-paper{margin:0;padding:8mm}@page{size:A4;margin:0}}';document.head.appendChild(s); }
  async function boot() {
    var attempts=0;while((!global.CloudERP||typeof global.CloudERP.request!=='function')&&attempts++<100)await new Promise(function(ok){setTimeout(ok,50);});
    if(!global.CloudERP||typeof global.CloudERP.request!=='function')throw new Error('Lidhja cloud nuk u inicializua.');
    var bodyHtml='';
    if(documentKind==='weight_ticket'){
      current=camel(await global.CloudERP.request('/api/trace/workflow/weights/'+encodeURIComponent(documentId)+'/details'));
      current.docType='WEIGHT_TICKET';current.documentNo=current.documentNo||current.document_no;current.documentDate=current.documentDate||current.document_date;current.partnerName=current.supplierName;current.totalAmount=current.totalValue;
      current.items=[{description:current.productName||'Peshë',unit:'kg',quantity:current.acceptedWeight,unitPrice:current.unitPrice,lineTotal:current.totalValue}];
      if(current.receiptDocumentId){
        var weightTrace=await global.CloudERP.request('/api/documents/'+encodeURIComponent(current.receiptDocumentId)+'/trace');
        current.traceNodes=(weightTrace.nodes||[]).map(camel);
      }
      bodyHtml=weight(current);
    }else if(documentKind==='finance_document'){
      current=camel(await global.CloudERP.request('/api/finance/documents/'+encodeURIComponent(documentId)));
      current.docType=current.documentType;current.totalAmount=current.amount;current.allocations=(current.allocations||[]).map(camel);
      current.items=current.allocations.map(function(x){return{description:x.documentNo,unit:'',quantity:1,unitPrice:x.amount,lineTotal:x.amount};});
      var allocatedDocument=current.allocations.find(function(x){return x.businessDocumentId;});
      if(allocatedDocument){
        var financeTrace=await global.CloudERP.request('/api/documents/'+encodeURIComponent(allocatedDocument.businessDocumentId)+'/trace');
        current.traceNodes=(financeTrace.nodes||[]).map(camel);
      }
      bodyHtml=finance(current);
    }else{
      current=camel(await global.CloudERP.request('/api/documents/'+encodeURIComponent(documentId)));
      current.linkedDocuments=(current.linkedDocuments||[]).map(camel);
      var trace=await global.CloudERP.request('/api/documents/'+encodeURIComponent(documentId)+'/trace');
      current.traceNodes=(trace.nodes||[]).map(camel);bodyHtml=documentHtml(current);
    }
    styles();document.body.innerHTML='<div class="sg96-tools"><button data-back>Kthehu</button><button data-print>Print</button><button data-pdf>PDF</button><button data-excel>Excel</button></div><main class="sg96-doc">'+bodyHtml+'</main>';
    document.querySelector('[data-back]').onclick=function(){if(global.history.length>1)global.history.back();else global.location.href=global.location.origin+'/';};document.querySelector('[data-print]').onclick=function(){global.print();};document.querySelector('[data-pdf]').onclick=pdf;document.querySelector('[data-excel]').onclick=excel;
    document.body.onclick=function(e){var b=e.target.closest('[data-open-doc]');if(b)openDocument(b.dataset.openDoc,b.dataset.openKind||'business_document');};
  }

  function install() {
    if(!App)return;
    App.sg96OpenDocument=openDocument;
    var original=App.sg72OpenDocument;
    App.sg72OpenDocument=function(kind,id){if(kind==='business_document'&&id){openDocument(id);return;}return typeof original==='function'?original.apply(this,arguments):null;};
    [
      'openPurchaseInvoice','openSalesInvoice','openPurchaseReceipt','openDeliveryNote',
      'openPurchaseOrder','openSalesOrder','openPurchaseRFQ','openSalesQuotation'
    ].forEach(function(method){
      if(typeof App[method]!=='function')return;
      App[method]=function(id){if(id){openDocument(id,'business_document');return;}};
    });
    global.addEventListener('click',function(event){
      if(fidelityMode)return;
      var row=event.target&&event.target.closest&&event.target.closest('tr[onclick]');
      if(!row)return;
      var source=row.getAttribute('onclick')||'';
      var match=source.match(/App\.(?:openPurchaseInvoice|openSalesInvoice|openPurchaseReceipt|openDeliveryNote|openPurchaseOrder|openSalesOrder|openPurchaseRFQ|openSalesQuotation)\(['"]([^'"]+)['"]\)/);
      if(!match)return;
      event.preventDefault();event.stopImmediatePropagation();openDocument(match[1],'business_document');
    },true);
  }
  install();
  if(fidelityMode)boot().catch(function(error){document.body.innerHTML='<div style="padding:25px;font-family:Arial">Dokumenti nuk u ngarkua: '+esc(error.message||error)+'</div>';});
  global.SGPhase96={openDocument:openDocument,url:fidelityUrl,excel:excel,pdf:pdf};
})(window);
/* SG_PHASE96_DOCUMENT_FIDELITY_END */
