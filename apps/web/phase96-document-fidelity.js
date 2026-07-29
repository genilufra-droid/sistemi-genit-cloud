/* SG_PHASE96_DOCUMENT_FIDELITY_START — one real source for view, print, PDF, XLSX and links */
(function (global) {
  'use strict';
  if (global.__SG_PHASE96_DOCUMENT_FIDELITY__) return;
  global.__SG_PHASE96_DOCUMENT_FIDELITY__ = true;

  var App = global.App;
  var Cloud = global.CloudERP;
  /* Keep export engines by reference.  The clean A4 view replaces the SPA
     body and some legacy modules subsequently clean window globals; retaining
     these references makes PDF/XLSX exports independent of that cleanup. */
  var PdfEngine = global.PDFEngine;
  var XlsxEngine = global.XLSX;
  var DesktopEngine = global.DesktopIO;
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
  function invoiceRows(doc,minimum) {
    var rows=(doc.items||[]).map(function(line,index){
      return '<tr><td>'+ (index+1) +'</td><td>'+esc(line.description||line.productName||'')+'</td><td>'+esc(line.unit||'')+'</td><td class="r">'+qty(line.quantity)+'</td><td class="r">'+money(line.unitPrice)+'</td><td class="r">'+qty(line.discountPct||line.discountPercent||0)+'%</td><td class="r">'+qty(line.vatRate||0)+'%</td><td class="r">'+money(line.lineTotal)+'</td></tr>';
    }).join('');
    for(var i=(doc.items||[]).length;i<minimum;i+=1)rows+='<tr><td>'+(i+1)+'</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
    return rows;
  }
  function warehouse(doc,isOut) {
    var movementRows=(doc.items||[]).map(function(line,index){return '<tr><td>'+(index+1)+'</td><td>'+esc(line.description||line.productName||'')+'</td><td>'+esc(line.unit||'')+'</td><td class="r">'+qty(line.quantity)+'</td><td class="r">'+money(line.unitPrice)+'</td><td class="r">'+money(line.lineTotal)+'</td></tr>';}).join('');
    for(var i=(doc.items||[]).length;i<21;i+=1)movementRows+='<tr><td>'+(i+1)+'</td><td></td><td></td><td></td><td></td><td></td></tr>';
    var title=isOut?'FLETË DALJE':'FLETË HYRJE';
    var destination=isOut?(doc.partnerAddress||doc.partnerName||''):(doc.warehouseName||doc.companyAddress||'');
    return '<section class="sg96-paper sg96-movement sg96-physical"><header class="sg96-physical-head"><div><p>'+esc(doc.companyName||'')+'</p><p>NIPT: '+esc(doc.companyNipt||'')+'</p></div><div><h1>'+title+'</h1><p>Nr. <b>'+esc(doc.documentNo||'')+'</b> &nbsp;&nbsp; Dt. <b>'+date(doc.documentDate)+'</b></p></div><div><b>Adresa ku shkon malli</b><p>'+esc(destination)+'</p></div></header><div class="sg96-physical-meta"><div>Emri, mbiemri<br>pers. Autorizuar<br><b>'+esc(isOut?(doc.companyName||''):(doc.partnerName||''))+'</b></div><div>Lloji e targa e<br>Mjetit transp.<br><b>'+esc(doc.vehiclePlate||'')+'</b></div><div><b>Magazina: '+esc(doc.warehouseName||'')+'</b></div></div><table class="sg96-physical-table"><thead><tr><th>Nr</th><th>Emërtimi i mallit</th><th>Njësia</th><th>Sasia</th><th>Çmimi</th><th>Vlefta</th></tr></thead><tbody>'+movementRows+'</tbody></table><footer class="sg96-physical-sign"><div>Emri, mbiemri<br>Nënshkrimi</div><div>Magazinieri</div><div>'+ (isOut?'Marrësi përdorim':'Pranuesi') +'</div><div>Transportuesi</div><div>Llogaritari</div></footer>'+linkedHtml(doc)+'</section>';
  }
  function business(doc) {
    var purchase=/^PURCHASE/.test(doc.docType||''),seller=purchase?doc.partnerName:doc.companyName,buyer=purchase?doc.companyName:doc.partnerName;
    var sellerNipt=purchase?doc.partnerNipt:doc.companyNipt,sellerAddress=purchase?doc.partnerAddress:doc.companyAddress,buyerNipt=purchase?doc.companyNipt:doc.partnerNipt,buyerAddress=purchase?doc.companyAddress:doc.partnerAddress;
    var lines=(doc.items||[]).map(function(x,i){var rate=num(x.vatRate),total=num(x.lineTotal),net=x.lineNet!=null?num(x.lineNet):(rate?total/(1+rate/100):total),vat=x.lineVat!=null?num(x.lineVat):total-net,price=num(x.unitPrice),priceNet=rate?price/(1+rate/100):price;return '<tr><td>'+ (i+1) +'</td><td>'+esc(x.description||x.productName||'')+'</td><td>'+esc(x.unit||'')+'</td><td class="r">'+qty(x.quantity)+'</td><td class="r">'+money(priceNet)+'</td><td class="r">'+qty(x.discountPct||x.discountPercent||0)+'%</td><td class="r">'+qty(rate)+'%</td><td class="r">'+money(net)+'</td><td class="r">'+money(vat)+'</td><td class="r">'+money(total)+'</td></tr>';}).join('');
    var net=num(doc.totalNet),vat=num(doc.totalVat),total=num(doc.totalAmount);if(!net&&total)net=total-vat;
    return '<section class="sg96-paper sg96-easy-invoice"><h1>FATURË</h1><section class="sg96-easy-box"><p>Shitësi: <b>'+esc(seller||'—')+'</b></p><p>Adresa: '+esc(sellerAddress||'—')+'</p><p>Numri Unik i Identifikimit: '+esc(sellerNipt||'—')+'</p></section><section class="sg96-easy-box sg96-issue"><p>Data dhe ora e lëshimit të faturës: <b>'+date(doc.documentDate)+'</b></p><p>Numri i Faturës: <b>'+esc(doc.documentNo||'—')+'</b></p><p>Operatori: '+esc(doc.createdByName||'—')+'</p><p>Kodi i vendit të ushtrimit të veprimtarisë: '+esc(doc.warehouseName||'—')+'</p><p>Lloji i Faturës: '+esc(typeLabel(doc.docType))+'</p></section><section class="sg96-easy-box"><p>Blerësi: <b>'+esc(buyer||'—')+'</b></p><p>Adresa: '+esc(buyerAddress||'—')+'</p><p>Numri Unik i Identifikimit: '+esc(buyerNipt||'—')+'</p></section><table class="sg96-easy-table"><thead><tr><th>Nr.</th><th>Përshkrimi i Mallit ose Shërbimit</th><th>Njësia e matjes</th><th>Sasia</th><th>Çmimi për njësi pa TVSH</th><th>Zbritje %</th><th>Norma e TVSH</th><th>Vlera pa TVSH</th><th>TVSH</th><th>Vlera Totale</th></tr></thead><tbody>'+lines+'<tr class="sum"><td colspan="8"></td><td>Vlera pa TVSH</td><td>'+money(net)+'</td></tr><tr class="sum"><td colspan="8"></td><td>Vlera totale e TVSH-së</td><td>'+money(vat)+'</td></tr><tr class="sum"><td colspan="8"></td><td>Totali për tu paguar (LEK)</td><td>'+money(total)+'</td></tr></tbody></table><p class="sg96-easy-vat-title">Shpërndarja e TVSH-së</p><table class="sg96-easy-vat"><thead><tr><th>Norma e TVSH-së</th><th>Baza e tatueshme (LEK)</th><th>Vlera e TVSH-së (LEK)</th></tr></thead><tbody><tr><td>'+qty((doc.items&&doc.items[0]&&doc.items[0].vatRate)||0)+'%</td><td>'+money(net)+'</td><td>'+money(vat)+'</td></tr></tbody></table><section class="sg96-easy-footer"><p>Data dhe ora e kryerjes së pagesës: '+date(doc.paidAt||doc.documentDate)+'</p><p>Numri i identifikues i veçantë i faturës (NIVF): '+esc(doc.invoiceUuid||doc.id||'—')+'</p><p>Mënyra e pagesës: '+esc(doc.paymentMethod||'—')+'</p><table><thead><tr><th>Lloji</th><th>Sasi (LEK)</th></tr></thead><tbody><tr><td>'+esc(doc.paymentMethod||'—')+'</td><td>'+money(total)+'</td></tr></tbody></table></section>'+linkedHtml(doc)+'</section>';
  }
  function documentHtml(doc) { if(doc.docType==='PURCHASE_RECEIPT')return warehouse(doc,false); if(doc.docType==='DELIVERY_NOTE')return warehouse(doc,true); return business(doc); }
  function weight(doc) {
    return '<section class="sg96-paper"><header class="sg96-title"><div><b>'+esc(doc.companyName||'SISTEMI GENIT')+'</b></div><div><h1>FORMULARI I PESHËS</h1><p>Nr. <b>'+esc(doc.documentNo||'')+'</b> · Data <b>'+date(doc.documentDate)+'</b> · Statusi <b>'+esc(doc.status||'')+'</b></p></div></header><div class="sg96-parties"><div><h3>FURNITORI / FERMERI</h3><b>'+esc(doc.partnerName||'—')+'</b><p>Artikulli: '+esc(doc.productName||'—')+'</p></div><div><h3>TRANSPORTI</h3><p>Targa: '+esc(doc.vehiclePlate||'—')+'</p><p>Magazina: '+esc(doc.warehouseName||'—')+'</p></div></div><table><thead><tr><th>Thasë / Amb.</th><th>Pesha bruto</th><th>Ambalazhi</th><th>Pesha neto</th><th>Zbritje %</th><th>Pesha pranuar</th></tr></thead><tbody><tr><td>'+qty(doc.bagsCount)+'</td><td>'+qty(doc.grossWeight)+'</td><td>'+qty(doc.packagingWeight)+'</td><td>'+qty(doc.netWeight)+'</td><td>'+qty(doc.discountPercent)+'</td><td>'+qty(doc.acceptedWeight)+'</td></tr></tbody></table><div class="sg96-totals"><p><span>Çmimi</span><b>'+money(doc.unitPrice)+'</b></p><p><span>TOTALI ALL</span><b>'+money(doc.totalAmount)+'</b></p></div><footer class="sg96-sign"><div>Operatori</div><div>Furnitori</div><div>Magazinieri</div><div>Kontrolli</div></footer>'+linkedHtml(doc)+'</section>';
  }
  function finance(doc) {
    var receipt=/RECEIPT/.test(String(doc.docType||'')),title=receipt?'MANDAT ARKËTIMI':'MANDAT PAGESE',from=receipt?'Arkëtuar nga':'Paguar te';
    function copy(){return '<section class="sg96-mandate-copy"><header><div><b>'+esc(doc.companyName||'SHOQËRIA')+'</b><br>Dega '+esc(doc.warehouseName||'')+'</div><div><h1>'+title+'</h1><p>Nr. <b>'+esc(doc.documentNo||'')+'</b><br>Dt. <b>'+date(doc.documentDate)+'</b></p></div><div>Nr. Serisë<br><b>'+esc(doc.referenceNo||'')+'</b></div></header><p><b>'+from+'</b> '+esc(doc.partnerName||'')+'</p><p><b>Shuma leke</b> '+money(doc.totalAmount)+' '+esc(doc.currency||'ALL')+'</p><p><b>Për</b> '+esc(doc.description||doc.referenceNo||'')+'</p><footer><div>Financieri</div><div>Drejtori</div><div>'+ (receipt?'Arkëtari':'Paguesi') +'</div></footer></section>';}
    return '<section class="sg96-paper sg96-mandate-sheet">'+copy()+'<div class="sg96-copy-gap"></div>'+copy()+linkedHtml(doc)+'</section>';
  }

  function excel() {
    if(!current||!XlsxEngine)return alert('Motori Excel nuk është i disponueshëm.');
    var title=typeLabel(current.docType)+' '+current.documentNo;
    var aoa=[[title],[current.companyName||'Sistemi Genit','NIPT: '+(current.companyNipt||'—')],['Data',date(current.documentDate)],['Statusi',current.status],['Partneri',current.partnerName||'—'],['Dokumenti burim',current.sourceDocumentNo||'—'],[],['Nr.','Përshkrimi','Njësia','Sasia','Çmimi','TVSH %','Pa TVSH','TVSH','Totali']];
    (current.items||[]).forEach(function(x,i){aoa.push([i+1,x.description||'',x.unit||'',num(x.quantity),num(x.unitPrice),num(x.vatRate),num(x.lineNet),num(x.lineVat),num(x.lineTotal)]);});
    aoa.push([],['','','','','','','Vlera pa TVSH',num(current.totalNet)],['','','','','','','TVSH',num(current.totalVat)],['','','','','','','TOTALI',num(current.totalAmount)]);
    if((current.linkedDocuments||[]).length){aoa.push([],['DOKUMENTET E LIDHURA']);(current.linkedDocuments||[]).forEach(function(x){aoa.push([typeLabel(x.docType),x.documentNo,x.status]);});}
    var ws=XlsxEngine.utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:8},{wch:34},{wch:12},{wch:12},{wch:14},{wch:10},{wch:16},{wch:14},{wch:16}];ws['!freeze']={xSplit:0,ySplit:8};ws['!autofilter']={ref:'A8:I8'};
    var wb=XlsxEngine.utils.book_new();XlsxEngine.utils.book_append_sheet(wb,ws,'Dokumenti');
    var filename=safe(title)+'.xlsx';
    if(DesktopEngine&&DesktopEngine.saveBinary){
      var bytes=XlsxEngine.write(wb,{bookType:'xlsx',type:'array',cellDates:true,compression:true});
      DesktopEngine.saveBinary(bytes,filename,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }else XlsxEngine.writeFile(wb,filename);
  }
  function pdf() {
    if(!current)return;
    /*
     * The cloud page is deliberately rendered after all application scripts
     * have loaded.  PDFEngine is bundled with the app and does not depend on
     * a CDN, unlike jsPDF.  It therefore always produces a real downloadable
     * PDF on Railway and uses the same persisted document values as this A4
     * view.  Keep jsPDF only as a legacy fallback for desktop installs.
     */
    if(PdfEngine&&typeof PdfEngine.downloadReport==='function'){
      var reportRows=(current.items||[]).map(function(x,i){return {
        nr:i+1,
        pershkrimi:x.description||x.productName||'',
        njesia:x.unit||'',
        sasia:num(x.quantity),
        cmimi:num(x.unitPrice),
        vlera:num(x.lineTotal)
      };});
      reportRows.push({nr:'',pershkrimi:'Vlera pa TVSH',njesia:'',sasia:'',cmimi:'',vlera:num(current.totalNet)});
      reportRows.push({nr:'',pershkrimi:'TVSH',njesia:'',sasia:'',cmimi:'',vlera:num(current.totalVat)});
      reportRows.push({nr:'',pershkrimi:'TOTALI ALL',njesia:'',sasia:'',cmimi:'',vlera:num(current.totalAmount)});
      PdfEngine.downloadReport({
        company:{name:current.companyName||'Sistemi Genit',nipt:current.companyNipt||'',address:current.companyAddress||''},
        title:typeLabel(current.docType)+' '+(current.documentNo||''),
        filtersText:'Data: '+date(current.documentDate)+' | Partneri: '+(current.partnerName||'—')+' | Statusi: '+(current.status||'—'),
        columns:[
          {key:'nr',label:'Nr.',width:35,align:'center'},
          {key:'pershkrimi',label:'Përshkrimi',width:220},
          {key:'njesia',label:'Njësia',width:65},
          {key:'sasia',label:'Sasia',width:70,type:'number'},
          {key:'cmimi',label:'Çmimi',width:85,type:'currency'},
          {key:'vlera',label:'Vlera totale',width:105,type:'currency'}
        ],
        rows:reportRows,
        filename:safe(typeLabel(current.docType)+'_'+current.documentNo)+'.pdf',
        footer:'Dokument i gjeneruar nga Sistemi Genit Cloud'
      });
      return;
    }
    var JS=global.jspdf&&global.jspdf.jsPDF;if(!JS){global.print();return;}
    var doc=new JS({orientation:'portrait',unit:'mm',format:'a4'}),title=typeLabel(current.docType),rows=(current.items||[]).map(function(x,i){return[i+1,x.description||'',x.unit||'',qty(x.quantity),money(x.unitPrice),money(x.lineTotal)];});
    doc.setFontSize(16);doc.text(title,105,15,{align:'center'});doc.setFontSize(9);doc.text('Nr. '+(current.documentNo||'')+'   Data '+date(current.documentDate)+'   Statusi '+(current.status||''),14,23);doc.text((current.companyName||'Sistemi Genit')+' / '+(current.partnerName||'—'),14,29);
    if(typeof doc.autoTable==='function')doc.autoTable({startY:35,head:[['Nr.','Përshkrimi','Njësia','Sasia','Çmimi','Vlera']],body:rows,styles:{fontSize:8},headStyles:{fillColor:[113,75,103]}});
    else {var y=38;rows.forEach(function(r){doc.text(r.join(' | ').slice(0,115),14,y);y+=6;});}
    var end=doc.lastAutoTable?doc.lastAutoTable.finalY+9:150;doc.text('Vlera pa TVSH: '+money(current.totalNet)+' ALL',130,end);doc.text('TVSH: '+money(current.totalVat)+' ALL',130,end+6);doc.setFontSize(11);doc.text('TOTALI: '+money(current.totalAmount)+' ALL',130,end+13);
    var filename=safe(title+'_'+current.documentNo)+'.pdf';
    if(DesktopEngine&&DesktopEngine.saveBinary)DesktopEngine.saveBinary(doc.output('arraybuffer'),filename,'application/pdf');else doc.save(filename);
  }
  function styles() { var s=document.createElement('style');s.textContent='html,body{margin:0;background:#e5e7eb;font-family:Arial;color:#111}.sg96-tools{position:sticky;top:0;z-index:4;display:flex;justify-content:center;gap:8px;padding:9px;background:#fff;border-bottom:1px solid #ccc}.sg96-tools button{padding:9px 14px;border:1px solid #bbb;border-radius:6px;background:#fff;font-weight:700}.sg96-paper{width:210mm;min-height:297mm;margin:12px auto;background:#fff;padding:10mm;box-sizing:border-box}.sg96-title,.sg96-wh-head{display:grid;grid-template-columns:1fr 2fr;border:2px solid #111}.sg96-wh-head{grid-template-columns:1fr 1.5fr 1fr}.sg96-title>div,.sg96-wh-head>div{padding:8px;border-right:1px solid #111}.sg96-title h1,.sg96-wh-head h1{text-align:center;margin:3px;font-size:25px}.sg96-title small,.sg96-wh-head small{display:block;margin-top:5px}.sg96-parties{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:9px 0}.sg96-parties>div,.sg96-meta>div{border:1px solid #111;padding:8px}.sg96-parties p{margin:4px 0;font-size:11px}.sg96-meta{display:grid;grid-template-columns:1fr 1fr}.sg96-meta>div{display:grid;grid-template-columns:1fr 1fr}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #111;padding:5px;font-size:10px;height:24px}th:nth-child(2){width:38%}.r{text-align:right}.sg96-totals{width:42%;margin-left:auto}.sg96-totals p{display:flex;justify-content:space-between;border:1px solid #111;margin:0;padding:7px}.sg96-sign{display:grid;grid-template-columns:repeat(4,1fr);margin-top:32px}.sg96-sign div{text-align:center;border-top:1px solid #111;padding:6px}.sg96-trace{margin-top:18px;border:1px solid #94a3b8;padding:9px}.sg96-trace h3{margin:0 0 8px;font-size:12px}.sg96-trace>div{display:flex;gap:6px;flex-wrap:wrap}.sg96-trace button{display:grid;text-align:left;border:1px solid #714b67;background:#f8f2f6;border-radius:6px;padding:7px;cursor:pointer}.sg96-trace span,.sg96-trace small{font-size:9px}@media(max-width:800px){.sg96-paper{margin:0;min-width:210mm}.sg96-doc{overflow:auto}}@media print{.sg96-tools{display:none}.sg96-paper{margin:0;padding:8mm}@page{size:A4;margin:0}}';document.head.appendChild(s); }
  /* Exact A4 hierarchy used by the invoice, goods and finance print models. */
  function documentStyleRefinement() {
    var style=document.createElement('style');
    style.textContent='.sg96-paper{box-shadow:0 1px 7px rgba(15,23,42,.2)}.sg96-invoice-head{display:grid;grid-template-columns:1fr 1.35fr;border:2px solid #111;margin-bottom:8px}.sg96-invoice-head>div{min-height:76px;padding:9px}.sg96-company{border-right:1px solid #111;display:flex;flex-direction:column;gap:4px}.sg96-company>b{font-size:16px}.sg96-doc-title{text-align:center}.sg96-doc-title h1{font-size:20px;margin:1px 0 7px}.sg96-doc-title p{font-size:10px;margin:3px 0}.sg96-invoice-table th{font-size:9px;text-transform:uppercase;background:#f0e8ef}.sg96-invoice-table th:nth-child(1){width:5%}.sg96-invoice-table th:nth-child(2){width:32%}.sg96-invoice-table th:nth-child(3){width:8%}.sg96-invoice-table th:nth-child(n+4){width:11%}.sg96-invoice-table td{height:25px}.sg96-bottom{display:grid;grid-template-columns:1fr 42%;gap:9px;margin-top:10px}.sg96-notes{border:1px solid #111;padding:8px;min-height:58px;font-size:11px}.sg96-notes p{margin:8px 0}.sg96-totals p.total{font-size:13px;border-top:2px solid #111;background:#f7f2f7}.sg96-sign{margin-top:42px}.sg96-sign div{min-height:32px}.sg96-trace{page-break-inside:avoid}.sg96-move-title{display:grid;grid-template-columns:1fr 1.4fr .8fr;border:2px solid #111}.sg96-move-title>div{padding:8px;border-right:1px solid #111;min-height:60px}.sg96-move-title>div:last-child{border:0;display:flex;flex-direction:column;gap:3px;font-size:10px}.sg96-move-title h1{text-align:center;font-size:21px;margin:10px 0}.sg96-move-brand{display:flex;flex-direction:column;gap:4px}.sg96-move-parties{display:grid;grid-template-columns:1fr 1fr;margin-top:8px}.sg96-move-parties>div{border:1px solid #111;padding:7px;display:flex;flex-direction:column;gap:3px;min-height:69px}.sg96-move-parties h3{margin:0 0 2px;font-size:10px}.sg96-move-parties b{font-size:11px}.sg96-move-parties small{font-size:9px}.sg96-move-table th{font-size:8px;background:#eee}.sg96-move-table th:nth-child(1){width:4%}.sg96-move-table th:nth-child(2){width:23%}.sg96-move-table th:nth-child(3){width:7%}.sg96-move-table th:nth-child(n+4){width:9%}.sg96-move-table td{height:25px;font-size:9px}.sg96-move-bottom{display:grid;grid-template-columns:1fr 42%;gap:9px;margin-top:8px;font-size:10px}.sg96-move-bottom p{margin:4px 0}@media print{.sg96-paper{box-shadow:none}.sg96-invoice-table th,.sg96-move-table th{background:#f0e8ef!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}';
    document.head.appendChild(style);
  }
  /* Physical forms share their exact geometry across every module. */
  function exactReferenceStyles() {
    var style=document.createElement('style');
    style.textContent='.sg96-easy-invoice{font-family:Arial,sans-serif;padding:10mm 10mm 8mm}.sg96-easy-invoice>h1{text-align:center;font-size:19px;font-weight:500;margin:0 0 6px}.sg96-easy-box{border:1px solid #111;padding:5px 7px;margin:5px 0;font-size:10px;line-height:1.22;min-height:51px}.sg96-easy-box p{margin:3px 0}.sg96-issue{min-height:75px}.sg96-easy-table th,.sg96-easy-table td{font-size:8px;padding:3px 2px;height:21px;vertical-align:middle}.sg96-easy-table th{font-weight:600;text-align:center}.sg96-easy-table th:nth-child(1){width:3%}.sg96-easy-table th:nth-child(2){width:20%}.sg96-easy-table th:nth-child(3){width:7%}.sg96-easy-table th:nth-child(4){width:6%}.sg96-easy-table th:nth-child(5){width:10%}.sg96-easy-table th:nth-child(6){width:6%}.sg96-easy-table th:nth-child(7){width:8%}.sg96-easy-table th:nth-child(8),.sg96-easy-table th:nth-child(9),.sg96-easy-table th:nth-child(10){width:10%}.sg96-easy-table .sum td{height:17px}.sg96-easy-vat-title{margin:15px 0 3px;font-size:10px}.sg96-easy-vat{width:72%}.sg96-easy-vat th,.sg96-easy-vat td,.sg96-easy-footer table th,.sg96-easy-footer table td{font-size:9px;padding:4px}.sg96-easy-footer{font-size:10px;line-height:1.25;margin-top:12px}.sg96-easy-footer p{margin:5px 0}.sg96-easy-footer table{width:58%;margin-top:12px}.sg96-physical{padding:6mm 7mm;min-height:297mm}.sg96-physical-head{display:grid;grid-template-columns:1fr 1.48fr 1.12fr;border:2px solid #111}.sg96-physical-head>div{border-right:1px solid #111;min-height:66px;padding:6px;font-size:11px}.sg96-physical-head>div:last-child{border:0}.sg96-physical-head p{margin:4px 0}.sg96-physical-head h1{text-align:center;font-size:25px;margin:5px 0 13px}.sg96-physical-meta{display:grid;grid-template-columns:1fr 1.32fr 1fr;border-left:2px solid #111;border-right:2px solid #111;font-size:10px}.sg96-physical-meta>div{min-height:42px;border-right:1px solid #111;border-bottom:1px solid #111;padding:5px}.sg96-physical-meta>div:last-child{border:0;border-bottom:1px solid #111}.sg96-physical-table th,.sg96-physical-table td{font-size:10px;padding:3px;height:21px}.sg96-physical-table th{font-size:14px;text-align:center}.sg96-physical-table th:nth-child(1){width:4%}.sg96-physical-table th:nth-child(2){width:45%}.sg96-physical-table th:nth-child(3){width:10%}.sg96-physical-table th:nth-child(4){width:11%}.sg96-physical-table th:nth-child(5){width:13%}.sg96-physical-table th:nth-child(6){width:17%}.sg96-physical-sign{display:grid;grid-template-columns:1.35fr 1fr 1.25fr 1.15fr 1fr;border:2px solid #111;border-top:0}.sg96-physical-sign div{min-height:43px;text-align:center;border-right:1px solid #111;padding:5px;font-size:10px;font-weight:bold}.sg96-physical-sign div:last-child{border:0}.sg96-mandate-sheet{padding:13mm 13mm 8mm;min-height:297mm}.sg96-mandate-copy{height:112mm;border:2px solid #111;font-family:Arial,sans-serif}.sg96-mandate-copy header{display:grid;grid-template-columns:1fr 1.85fr 1.3fr;border-bottom:1px solid #111}.sg96-mandate-copy header>div{min-height:42px;border-right:1px solid #111;padding:7px;font-size:14px}.sg96-mandate-copy header>div:last-child{border:0}.sg96-mandate-copy header h1{text-align:center;font-size:22px;margin:0}.sg96-mandate-copy header p{text-align:center;margin:4px 0}.sg96-mandate-copy>p{margin:0;padding:7px 8px;min-height:17px;border-bottom:1px solid #111;font-size:16px}.sg96-mandate-copy footer{display:grid;grid-template-columns:1fr 1fr 1fr;margin-top:23px;border-top:1px solid #111}.sg96-mandate-copy footer div{text-align:center;min-height:28px;padding:7px;border-right:1px solid #111;font-size:15px}.sg96-mandate-copy footer div:last-child{border:0}.sg96-copy-gap{height:16mm}.sg96-doc table button,.sg96-doc table .action-column{display:none!important}@media print{.sg96-easy-invoice,.sg96-physical,.sg96-mandate-sheet{box-shadow:none}.sg96-trace{display:none}}';
    document.head.appendChild(style);
  }
  function removeLegacyTableActions() {
    document.querySelectorAll('.sg96-doc table tr').forEach(function(row){Array.prototype.slice.call(row.children).forEach(function(cell){if(/^veprime$/i.test(cell.textContent.trim())||cell.querySelector('button'))cell.remove();});});
  }
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
    styles();documentStyleRefinement();exactReferenceStyles();document.body.innerHTML='<div class="sg96-tools"><button data-back>Kthehu</button><button data-print>Print</button><button data-pdf>PDF</button><button data-excel>Excel</button></div><main class="sg96-doc">'+bodyHtml+'</main>';removeLegacyTableActions();global.setTimeout(removeLegacyTableActions,50);
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
  /*
   * Do not replace body while the single-page app is still parsing its own
   * scripts.  That used to remove the bundled XLSX/PDF engines and caused the
   * authentication bootstrap to crash.  Waiting for load keeps every export
   * engine available before switching to the clean document view.
   */
  function startFidelityDocument(){boot().catch(function(error){document.body.innerHTML='<div style="padding:25px;font-family:Arial">Dokumenti nuk u ngarkua: '+esc(error.message||error)+'</div>';});}
  function startAfterBootstrap(){
    /* Auth/bootstrap also uses the load event.  Let it finish its async DOM
       setup before rendering the standalone document, otherwise it attempts
       to write into an A4 body that has already replaced the application. */
    global.setTimeout(startFidelityDocument,1200);
  }
  if(fidelityMode){
    if(document.readyState==='complete')startAfterBootstrap();
    else global.addEventListener('load',startAfterBootstrap,{once:true});
  }
  global.SGPhase96={openDocument:openDocument,url:fidelityUrl,excel:excel,pdf:pdf};
})(window);
/* SG_PHASE96_DOCUMENT_FIDELITY_END */
