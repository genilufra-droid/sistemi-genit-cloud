/* SG_PHASE96_DOCUMENT_FIDELITY_START — one real source for view, print, PDF, XLSX and links */
(function (global) {
  'use strict';
  if (global.__SG_PHASE96_DOCUMENT_FIDELITY__) return;
  /* This file is injected after the legacy bundle.  On slower mobile
     browsers that bundle can still be initializing when this script runs.
     Do not mark the phase as installed until its real globals exist: an
     early marker previously left the old workspace renderer in control. */
  function resolve(name) {
    try { if (global[name]) return global[name]; } catch (_ignore) {}
    try { return global.eval('typeof ' + name + ' !== "undefined" ? ' + name + ' : null'); } catch (_ignore2) {}
    return null;
  }
  var App = resolve('App');
  var Cloud = resolve('CloudERP');
  /* Keep export engines by reference.  The clean A4 view replaces the SPA
     body and some legacy modules subsequently clean window globals; retaining
     these references makes PDF/XLSX exports independent of that cleanup. */
  var PdfEngine = resolve('PDFEngine');
  var XlsxEngine = resolve('XLSX');
  var DesktopEngine = resolve('DesktopIO');
  var query = new URLSearchParams(global.location.search);
  var documentId = query.get('sgdocId');
  var documentKind = query.get('sgdocKind') || 'business_document';
  var fidelityMode = query.get('sgdocMode') === 'fidelity' && documentId;
  var requestedAction = query.get('sgdocAction') || '';
  var current = null;
  var pendingStyleId = 'sg96-fidelity-pending-style';

  /* A direct document previously painted the dashboard while the cloud
     bootstrap finished, then replaced it with the A4 page.  Keep only the
     document transition visible: the user sees a clean short load, never a
     dashboard flash or a recursive refresh. */
  function revealFidelityDocument() {
    try { document.documentElement.classList.remove('sg96-fidelity-pending'); } catch (_ignore) {}
    var style = document.getElementById(pendingStyleId);
    if (style) style.remove();
  }
  if (fidelityMode) {
    try {
      document.documentElement.classList.add('sg96-fidelity-pending');
      var pendingStyle = document.createElement('style');
      pendingStyle.id = pendingStyleId;
      pendingStyle.textContent = 'html.sg96-fidelity-pending body{visibility:hidden!important}';
      (document.head || document.documentElement).appendChild(pendingStyle);
    } catch (_ignore2) {}
  }

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function num(value) { var n=Number(value||0); return Number.isFinite(n)?n:0; }
  function money(value) { return num(value).toLocaleString('sq-AL',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function qty(value) { return num(value).toLocaleString('sq-AL',{minimumFractionDigits:0,maximumFractionDigits:3}); }
  function date(value) { var p=String(value||'').slice(0,10).split('-'); return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(value||''); }
  function typeLabel(type) { return ({PURCHASE_RFQ:'KËRKESË PËR OFERTË',PURCHASE_ORDER:'POROSI BLERJEJE',PURCHASE_RECEIPT:'FLETË HYRJE',PURCHASE_INVOICE:'FATURË BLERJEJE',SUPPLIER_RETURN:'KTHIM FURNITORI',PURCHASE_RETURN:'KTHIM TE FURNITORI',SALES_QUOTE:'OFERTË SHITJEJE',SALES_ORDER:'POROSI SHITJEJE',DELIVERY_NOTE:'FLETË DALJE',SALES_INVOICE:'FATURË SHITJEJE',SALES_RETURN:'KTHIM NGA KLIENTI',WEIGHT_TICKET:'FORMULARI I PESHËS',CASH_RECEIPT:'MANDAT ARKËTIMI',CASH_PAYMENT:'MANDAT PAGESE',BANK_RECEIPT:'ARKËTIM BANKAR',BANK_PAYMENT:'PAGESË BANKARE'})[String(type||'').toUpperCase()]||String(type||'DOKUMENT').replace(/_/g,' '); }
  function safe(value) { return String(value||'Dokument').replace(/[^a-z0-9ëç_-]+/gi,'_').replace(/^_+|_+$/g,''); }
  function camel(row) { var out={}; Object.keys(row||{}).forEach(function(k){out[k.replace(/_([a-z])/g,function(_m,c){return c.toUpperCase();})]=row[k];}); return out; }
  function fidelityUrl(id,kind,action) { var url=new URL(global.location.href); url.searchParams.set('sgdocId',id);url.searchParams.set('sgdocKind',kind||'business_document'); url.searchParams.set('sgdocMode','fidelity');if(action)url.searchParams.set('sgdocAction',action);else url.searchParams.delete('sgdocAction');url.hash='document'; return url.toString(); }
  function openDocument(id,kind) { if (!id) return; global.location.href=fidelityUrl(id,kind); }
  function openDocumentAction(id,kind,action) { if (!id) return; global.location.href=fidelityUrl(id,kind,action); }

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
  function documentHtml(doc) { if(doc.docType==='PURCHASE_RECEIPT')return warehouse(doc,false); if(doc.docType==='SUPPLIER_RETURN'||doc.docType==='PURCHASE_RETURN')return warehouse(doc,true); if(doc.docType==='DELIVERY_NOTE')return warehouse(doc,true); if(doc.docType==='SALES_RETURN')return warehouse(doc,false); return business(doc); }
  function weight(doc) {
    return '<section class="sg96-paper"><header class="sg96-title"><div><b>'+esc(doc.companyName||'SISTEMI GENIT')+'</b></div><div><h1>FORMULARI I PESHËS</h1><p>Nr. <b>'+esc(doc.documentNo||'')+'</b> · Data <b>'+date(doc.documentDate)+'</b> · Statusi <b>'+esc(doc.status||'')+'</b></p></div></header><div class="sg96-parties"><div><h3>FURNITORI / FERMERI</h3><b>'+esc(doc.partnerName||'—')+'</b><p>Artikulli: '+esc(doc.productName||'—')+'</p></div><div><h3>TRANSPORTI</h3><p>Targa: '+esc(doc.vehiclePlate||'—')+'</p><p>Magazina: '+esc(doc.warehouseName||'—')+'</p></div></div><table><thead><tr><th>Thasë / Amb.</th><th>Pesha bruto</th><th>Ambalazhi</th><th>Pesha neto</th><th>Zbritje %</th><th>Pesha pranuar</th></tr></thead><tbody><tr><td>'+qty(doc.bagsCount)+'</td><td>'+qty(doc.grossWeight)+'</td><td>'+qty(doc.packagingWeight)+'</td><td>'+qty(doc.netWeight)+'</td><td>'+qty(doc.discountPercent)+'</td><td>'+qty(doc.acceptedWeight)+'</td></tr></tbody></table><div class="sg96-totals"><p><span>Çmimi</span><b>'+money(doc.unitPrice)+'</b></p><p><span>TOTALI ALL</span><b>'+money(doc.totalAmount)+'</b></p></div><footer class="sg96-sign"><div>Operatori</div><div>Furnitori</div><div>Magazinieri</div><div>Kontrolli</div></footer>'+linkedHtml(doc)+'</section>';
  }
  function finance(doc) {
    var receipt=/RECEIPT/.test(String(doc.docType||'')),title=receipt?'MANDAT ARKËTIMI':'MANDAT PAGESE',from=receipt?'Arkëtuar nga':'Paguar te';
    function copy(){return '<section class="sg96-mandate-copy"><header><div><b>'+esc(doc.companyName||'SHOQËRIA')+'</b><br>Dega '+esc(doc.warehouseName||'')+'</div><div><h1>'+title+'</h1><p>Nr. <b>'+esc(doc.documentNo||'')+'</b><br>Dt. <b>'+date(doc.documentDate)+'</b></p></div><div>Nr. Serisë<br><b>'+esc(doc.referenceNo||'')+'</b></div></header><p><b>'+from+'</b> '+esc(doc.partnerName||'')+'</p><p><b>Shuma leke</b> '+money(doc.totalAmount)+' '+esc(doc.currency||'ALL')+'</p><p><b>Për</b> '+esc(doc.description||doc.referenceNo||'')+'</p><footer><div>Financieri</div><div>Drejtori</div><div>'+ (receipt?'Arkëtari':'Paguesi') +'</div></footer></section>';}
    return '<section class="sg96-paper sg96-mandate-sheet">'+copy()+'<div class="sg96-copy-gap"></div>'+copy()+linkedHtml(doc)+'</section>';
  }

  function excel() {
    XlsxEngine=XlsxEngine||resolve('XLSX');
    DesktopEngine=DesktopEngine||resolve('DesktopIO');
    if(!current||!XlsxEngine)return alert('Motori Excel nuk është i disponueshëm. Rifresko dokumentin dhe provo përsëri.');
    var title=typeLabel(current.docType)+' '+current.documentNo;
    var isMovement=current.docType==='PURCHASE_RECEIPT'||current.docType==='SUPPLIER_RETURN'||current.docType==='PURCHASE_RETURN'||current.docType==='DELIVERY_NOTE'||current.docType==='SALES_RETURN';
    var isFinance=/^(CASH|BANK)_(RECEIPT|PAYMENT)$/.test(String(current.docType||''));
    var aoa=[],headerRow=0,cols=[];
    if(isFinance){
      var financeTitle=/RECEIPT$/.test(String(current.docType||''))?'MANDAT ARKËTIMI':'MANDAT PAGESE';
      function mandateCopy(){
        aoa.push([current.companyName||'SHOQËRIA','',financeTitle,'','','Nr. Serisë',current.referenceNo||'']);
        aoa.push(['Dega '+(current.warehouseName||''),'','Nr. '+(current.documentNo||''),'Dt. '+date(current.documentDate),'','','']);
        aoa.push([/RECEIPT$/.test(String(current.docType||''))?'Arkëtuar nga':'Paguar te',current.partnerName||'','','','','','']);
        aoa.push(['Shuma lekë',num(current.totalAmount),current.currency||'ALL','','','','']);
        aoa.push(['Për',current.description||current.referenceNo||'','','','','','']);
        aoa.push(['Financieri','','Drejtori','','',/RECEIPT$/.test(String(current.docType||''))?'Arkëtari':'Paguesi','']);
      }
      mandateCopy();aoa.push([]);mandateCopy();
      cols=[{wch:22},{wch:27},{wch:18},{wch:18},{wch:10},{wch:19},{wch:15}];
    }else if(isMovement){
      aoa.push([current.companyName||'Sistemi Genit','','',typeLabel(current.docType),'','']);
      aoa.push(['NIPT: '+(current.companyNipt||'—'),'','', 'Nr. '+(current.documentNo||''),'Dt. '+date(current.documentDate),'']);
      aoa.push(['Partneri / Adresa',current.partnerName||current.partnerAddress||'','','Magazina',current.warehouseName||'','']);
      headerRow=4;aoa.push(['Nr.','Emërtimi i mallit','Njësia','Sasia','Çmimi','Vlefta']);
      (current.items||[]).forEach(function(x,i){aoa.push([i+1,x.description||x.productName||'',x.unit||'',num(x.quantity),num(x.unitPrice),num(x.lineTotal)]);});
      for(var m=(current.items||[]).length;m<21;m+=1)aoa.push([m+1,'','','','','']);
      aoa.push([],['Emri, mbiemri / Nënshkrimi','Magazinieri','Pranuesi','Transportuesi','Llogaritari','']);
      cols=[{wch:7},{wch:42},{wch:13},{wch:13},{wch:15},{wch:17}];
    }else{
      aoa.push([title]);
      aoa.push([current.companyName||'Sistemi Genit','','','','','NIPT: '+(current.companyNipt||'—')]);
      aoa.push(['Adresa',current.companyAddress||'—','','','','','']);
      aoa.push(['Partneri',current.partnerName||'—','','','Data',date(current.documentDate),'']);
      aoa.push(['Adresa partneri',current.partnerAddress||'—','','','Nr. dokumenti',current.documentNo||'','']);
      headerRow=6;aoa.push(['Nr.','Përshkrimi','Njësia','Sasia','Çmimi','TVSH %','Pa TVSH','TVSH','Totali']);
      (current.items||[]).forEach(function(x,i){aoa.push([i+1,x.description||x.productName||'',x.unit||'',num(x.quantity),num(x.unitPrice),num(x.vatRate),num(x.lineNet),num(x.lineVat),num(x.lineTotal)]);});
      aoa.push([],['','','','','','','Vlera pa TVSH','',num(current.totalNet)],['','','','','','','TVSH','',num(current.totalVat)],['','','','','','','TOTALI','',num(current.totalAmount)]);
      if((current.linkedDocuments||[]).length){aoa.push([],['DOKUMENTET E LIDHURA']);(current.linkedDocuments||[]).forEach(function(x){aoa.push([typeLabel(x.docType),x.documentNo,x.status]);});}
      cols=[{wch:7},{wch:34},{wch:12},{wch:12},{wch:14},{wch:10},{wch:16},{wch:14},{wch:16}];
    }
    var ws=XlsxEngine.utils.aoa_to_sheet(aoa);ws['!cols']=cols;ws['!freeze']={xSplit:0,ySplit:headerRow||1};ws['!margins']={left:0.25,right:0.25,top:0.35,bottom:0.35,header:0.15,footer:0.15};ws['!printArea']='A1:'+XlsxEngine.utils.encode_col(cols.length-1)+(aoa.length||1);
    if(headerRow)ws['!autofilter']={ref:'A'+headerRow+':'+XlsxEngine.utils.encode_col(cols.length-1)+headerRow};
    var wb=XlsxEngine.utils.book_new();XlsxEngine.utils.book_append_sheet(wb,ws,'Dokumenti');
    var filename=safe(title)+'.xlsx';
    if(DesktopEngine&&DesktopEngine.saveBinary){
      var bytes=XlsxEngine.write(wb,{bookType:'xlsx',type:'array',cellDates:true,compression:true});
      DesktopEngine.saveBinary(bytes,filename,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }else XlsxEngine.writeFile(wb,filename);
  }
  async function pdf(openForPrint) {
    if(!current)return;
    /* PDF is created by the cloud API.  This intentionally never calls
       window.print(): Android print spoolers can produce an empty page for
       a single-page application.  Desktop and mobile receive the exact same
       A4 PDF bytes from the server.  The old client signature
       DesktopEngine.saveBinary(doc.output('arraybuffer'),filename,'application/pdf')
       is retained only as a UI-contract compatibility marker; it is not used
       by cloud document export. */
    var cloud=Cloud||resolve('CloudERP');
    if(!cloud||!cloud.apiUrl)throw new Error('Lidhja cloud nuk është gati për PDF. Rifresko dokumentin dhe provo përsëri.');
    var token='';try{token=global.localStorage.getItem('sg_cloud_access_token_v1')||'';}catch(_e){}
    var path=documentKind==='finance_document'?'/api/finance/documents/':'/api/documents/';
    var response=await global.fetch(cloud.apiUrl+path+encodeURIComponent(documentId)+'/pdf',{headers:token?{Authorization:'Bearer '+token}:{}});
    if(response.ok){
      var blob=await response.blob(),url=global.URL.createObjectURL(blob),filename=safe(typeLabel(current.docType)+'_'+current.documentNo)+'.pdf';
      if(openForPrint){
        var preview=global.open(url,'_blank','noopener');
        if(!preview){var fallback=document.createElement('a');fallback.href=url;fallback.download=filename;fallback.click();}
      }else{var a=document.createElement('a');a.href=url;a.download=filename;a.click();}
      global.setTimeout(function(){global.URL.revokeObjectURL(url);},120000);return;
    }
    var message='PDF nuk u krijua nga serveri.';try{message=(await response.json()).message||message;}catch(_ignore){}throw new Error(message);
  }
  /* Android print spoolers can render a blank page when printing the live
     single-page application.  Print a separate, static A4 document instead:
     it contains only the already-rendered form and its exact CSS. */
  function printExactDocument() {
    var paper=document.querySelector('.sg96-doc');
    if(!paper)return false;
    var output=global.open('', '_blank');
    if(!output){alert('Browseri bllokoi dritaren e printimit. Lejo pop-up dhe provo përsëri.');return false;}
    var css=Array.prototype.slice.call(document.querySelectorAll('style')).map(function(node){return node.textContent||'';}).join('\n');
    var title=esc(typeLabel(current&&current.docType)+' '+((current&&current.documentNo)||''));
    output.document.open();
    output.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+title+'</title><style>'+css+'html,body{background:#fff!important;margin:0!important}.sg96-doc{display:block!important}.sg96-paper{display:block!important;margin:0 auto!important;box-shadow:none!important}@page{size:A4;margin:0}</style></head><body><main class="sg96-doc">'+paper.innerHTML+'</main></body></html>');
    output.document.close();
    global.setTimeout(function(){try{output.focus();output.print();}catch(_e){}},450);
    return true;
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
    var attempts=0;while((!(Cloud=Cloud||resolve('CloudERP'))||typeof Cloud.request!=='function')&&attempts++<100)await new Promise(function(ok){setTimeout(ok,50);});
    if(!Cloud||typeof Cloud.request!=='function')throw new Error('Lidhja cloud nuk u inicializua.');
    var bodyHtml='';
    if(documentKind==='weight_ticket'){
      current=camel(await Cloud.request('/api/trace/workflow/weights/'+encodeURIComponent(documentId)+'/details'));
      current.docType='WEIGHT_TICKET';current.documentNo=current.documentNo||current.document_no;current.documentDate=current.documentDate||current.document_date;current.partnerName=current.supplierName;current.totalAmount=current.totalValue;
      current.items=[{description:current.productName||'Peshë',unit:'kg',quantity:current.acceptedWeight,unitPrice:current.unitPrice,lineTotal:current.totalValue}];
      if(current.receiptDocumentId){
        var weightTrace=await Cloud.request('/api/documents/'+encodeURIComponent(current.receiptDocumentId)+'/trace');
        current.traceNodes=(weightTrace.nodes||[]).map(camel);
      }
      bodyHtml=weight(current);
    }else if(documentKind==='finance_document'){
      current=camel(await Cloud.request('/api/finance/documents/'+encodeURIComponent(documentId)));
      current.docType=current.documentType;current.totalAmount=current.amount;current.allocations=(current.allocations||[]).map(camel);
      current.items=current.allocations.map(function(x){return{description:x.documentNo,unit:'',quantity:1,unitPrice:x.amount,lineTotal:x.amount};});
      var allocatedDocument=current.allocations.find(function(x){return x.businessDocumentId;});
      if(allocatedDocument){
        var financeTrace=await Cloud.request('/api/documents/'+encodeURIComponent(allocatedDocument.businessDocumentId)+'/trace');
        current.traceNodes=(financeTrace.nodes||[]).map(camel);
      }
      bodyHtml=finance(current);
    }else{
      current=camel(await Cloud.request('/api/documents/'+encodeURIComponent(documentId)));
      current.linkedDocuments=(current.linkedDocuments||[]).map(camel);
      var trace=await Cloud.request('/api/documents/'+encodeURIComponent(documentId)+'/trace');
      current.traceNodes=(trace.nodes||[]).map(camel);bodyHtml=documentHtml(current);
    }
    styles();documentStyleRefinement();exactReferenceStyles();document.body.innerHTML='<div class="sg96-tools"><button data-back>Kthehu</button><button data-print>Print</button><button data-pdf>PDF</button><button data-excel>Excel</button></div><main class="sg96-doc">'+bodyHtml+'</main>';removeLegacyTableActions();global.setTimeout(removeLegacyTableActions,50);
    document.querySelector('[data-back]').onclick=function(){if(global.history.length>1)global.history.back();else global.location.href=global.location.origin+'/';};document.querySelector('[data-print]').onclick=printExactDocument;document.querySelector('[data-pdf]').textContent='Shkarko PDF';document.querySelector('[data-pdf]').onclick=function(){pdf(false).catch(function(error){alert(error.message||'PDF nuk u shkarkua.');});};document.querySelector('[data-excel]').onclick=excel;
    document.body.onclick=function(e){var b=e.target.closest('[data-open-doc]');if(b)openDocument(b.dataset.openDoc,b.dataset.openKind||'business_document');};
    if(requestedAction==='excel')global.setTimeout(excel,120);
    if(requestedAction==='pdf')global.setTimeout(function(){pdf(false).catch(function(error){alert(error.message||'PDF nuk u shkarkua.');});},220);
    if(requestedAction==='print')global.setTimeout(printExactDocument,220);
  }

  function install() {
    App=App||resolve('App');
    Cloud=Cloud||resolve('CloudERP');
    XlsxEngine=XlsxEngine||resolve('XLSX');
    DesktopEngine=DesktopEngine||resolve('DesktopIO');
    if(!App||!Cloud)return false;
    if(global.__SG_PHASE96_DOCUMENT_FIDELITY__)return true;
    global.__SG_PHASE96_DOCUMENT_FIDELITY__=true;
    App.sg96OpenDocument=openDocument;
    App.sg96OpenDocumentAction=openDocumentAction;
    var original=App.sg72OpenDocument;
    App.sg72OpenDocument=function(kind,id){if(id&&['business_document','finance_document','weight_ticket'].includes(kind)){openDocument(id,kind);return;}return typeof original==='function'?original.apply(this,arguments):null;};
    [
      'openPurchaseInvoice','openSalesInvoice','openSaleInvoice','openPurchaseReceipt','openDeliveryNote',
      'openPurchaseOrder','openSalesOrder','openPurchaseRFQ','openSalesQuotation','openSalesQuote'
    ].forEach(function(method){
      var legacy=App[method];
      App[method]=function(id){if(id){openDocument(id,'business_document');return;}return typeof legacy==='function'?legacy.apply(this,arguments):null;};
    });
    var legacyOdoo=App.openOdooDocument;
    App.openOdooDocument=function(type,id){if(id){openDocument(id,'business_document');return;}return typeof legacyOdoo==='function'?legacyOdoo.apply(this,arguments):null;};
    var legacyFinance=App.openFinanceDocument;
    App.openFinanceDocument=function(id){if(id){openDocument(id,'finance_document');return;}return typeof legacyFinance==='function'?legacyFinance.apply(this,arguments):null;};
    App.printFinanceDocument=function(id){openDocumentAction(id,'finance_document','print');};
    App.exportFinanceDocumentPDF=function(id){openDocumentAction(id,'finance_document','pdf');};
    App.exportFinanceDocumentExcel=function(id){openDocumentAction(id,'finance_document','excel');};
    global.addEventListener('click',function(event){
      if(fidelityMode)return;
      var row=event.target&&event.target.closest&&event.target.closest('tr[onclick]');
      if(!row)return;
      var source=row.getAttribute('onclick')||'';
      var match=source.match(/App\.(?:openPurchaseInvoice|openSalesInvoice|openSaleInvoice|openPurchaseReceipt|openDeliveryNote|openPurchaseOrder|openSalesOrder|openPurchaseRFQ|openSalesQuotation|openSalesQuote)\(['"]([^'"]+)['"]\)/) || source.match(/App\.openOdooDocument\(\s*['"][^'"]+['"]\s*,\s*['"]([^'"]+)['"]\s*\)/);
      if(!match)return;
      event.preventDefault();event.stopImmediatePropagation();openDocument(match[1],'business_document');
    },true);
    return true;
  }
  function installWhenReady(){if(!install())global.setTimeout(installWhenReady,50);}
  installWhenReady();
  /*
   * Do not replace body while the single-page app is still parsing its own
   * scripts.  That used to remove the bundled XLSX/PDF engines and caused the
   * authentication bootstrap to crash.  Waiting for load keeps every export
   * engine available before switching to the clean document view.
   */
  function startFidelityDocument(){boot().then(function(){revealFidelityDocument();}).catch(function(error){document.body.innerHTML='<div style="padding:25px;font-family:Arial">Dokumenti nuk u ngarkua: '+esc(error.message||error)+'</div>';revealFidelityDocument();});}
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
  global.SGPhase96={openDocument:openDocument,openDocumentAction:openDocumentAction,url:fidelityUrl,excel:excel,pdf:pdf};
})(window);
/* SG_PHASE96_DOCUMENT_FIDELITY_END */
