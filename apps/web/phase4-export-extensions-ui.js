/* Sistemi Genit Cloud — Faza 4.3 extension: dokumente, timeline dhe 15 raporte */
(function(global){
  'use strict';
  var App=global.App,Cloud=global.CloudERP,Auth=global.Auth;
  if(!App||!Cloud||!Cloud.apiUrl||Cloud.offlineTestMode||global.__SG_PHASE43_EXPORT_EXT_UI__)return;
  global.__SG_PHASE43_EXPORT_EXT_UI__=true;

  function esc(v){return App.esc(v==null?'':String(v));}
  function attr(v){return esc(v).replace(/"/g,'&quot;');}
  function val(id){var e=document.getElementById(id);return e?e.value:'';}
  function num(v){var n=Number(v);return Number.isFinite(n)?n:0;}
  function camel(row){var out={};Object.keys(row||{}).forEach(function(k){out[k.replace(/_([a-z])/g,function(_,c){return c.toUpperCase();})]=row[k];});return out;}
  function safe(v){return String(v||'Raport').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_');}
  function fmt(v){return App.fmt?App.fmt(v):num(v).toLocaleString('sq-AL',{maximumFractionDigits:2});}
  function labelKey(key){
    var labels={shipment_no:'Ngarkesa',shipment_date:'Data',status:'Status',customer:'Klienti',customer_name:'Klienti',label:'Përshkrimi',plate_no:'Targa',driver_name:'Shoferi',destination:'Destinacioni',destination_country:'Shteti',net_weight:'Neto kg',gross_weight:'Bruto kg',pallet_count:'Paleta',package_count:'Pako',shipments:'Ngarkesa',quantity:'Sasia',value:'Vlera',total_value:'Vlera',distance_km:'Km',capacity_kg:'Kapacitet kg',utilization_percent:'Shfrytëzim %',avg_capacity_percent:'Mesatare %',overloaded:'Mbingarkuar',product_name:'Artikulli',delivery_note:'Fletë-Dalja',cmr_no:'CMR',packing_list_no:'Packing List',commercial_invoice_no:'Commercial Invoice',customs_declaration_no:'Dogana',seal_no:'Vula',complete:'Komplet',missing:'Mungojnë',delivery_hours:'Orë dorëzimi',revenue:'Të ardhura',goods_cost:'Kosto malli',logistics_cost:'Kosto logjistike',profit:'Fitimi'};
    return labels[key]||key.replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});
  }
  function statusLabel(v){return{DRAFT:'Draft',PLANNED:'Planifikuar',LOADING:'Në ngarkim',SEALED:'Vulosur',DISPATCHED:'Nisur',AT_BORDER:'Në kufi',DELIVERED:'Dorëzuar',CLOSED:'Mbyllur',CANCELLED:'Anulluar'}[v]||v||'—';}

  App.sealExportShipment=function(id){
    this.modal('Vulos Ngarkesën',
      '<div class="alert-info"><strong>Kontroll para nisjes:</strong> pa Vulë, CMR, Packing List dhe Commercial Invoice ngarkesa nuk mund të niset.</div>'+ 
      '<div class="sg43-grid">'+
      '<div class="form-group"><label>Nr. i vulës *</label><input id="sg43-action-seal"></div>'+ 
      '<div class="form-group"><label>Kontejneri</label><input id="sg43-action-container"></div>'+ 
      '<div class="form-group"><label>CMR *</label><input id="sg43-action-cmr"></div>'+ 
      '<div class="form-group"><label>Packing List *</label><input id="sg43-action-packing"></div>'+ 
      '<div class="form-group"><label>Commercial Invoice *</label><input id="sg43-action-commercial"></div>'+ 
      '<div class="form-group"><label>Deklarata doganore</label><input id="sg43-action-customs"></div>'+ 
      '</div>',
      '<button class="btn btn-outline" onclick="App.closeModal()">Anulo</button><button class="btn btn-primary" onclick="App.confirmSealExportShipment(\''+id+'\')">Vulos</button>');
  };
  App.confirmSealExportShipment=async function(id){
    try{
      var body={sealNo:val('sg43-action-seal'),containerNo:val('sg43-action-container'),cmrNo:val('sg43-action-cmr'),packingListNo:val('sg43-action-packing'),commercialInvoiceNo:val('sg43-action-commercial'),customsDeclarationNo:val('sg43-action-customs')};
      if(!body.sealNo||!body.cmrNo||!body.packingListNo||!body.commercialInvoiceNo)throw new Error('Vula, CMR, Packing List dhe Commercial Invoice janë të detyrueshme.');
      await Cloud.request('/api/export/shipments/'+encodeURIComponent(id)+'/seal',{method:'POST',body:body});
      this.closeModal();if(Cloud.loadPhase43)await Cloud.loadPhase43(false);this.navigate('exportShipments');this.toast('Ngarkesa u vulos me dokumentet e detyrueshme.');
    }catch(e){this.toast(e.message||String(e),'error');}
  };

  App.openExportTimeline=async function(id){
    try{
      var data=await Cloud.request('/api/export/shipments/'+encodeURIComponent(id)+'/timeline');
      var body='<div class="sg43-timeline">'+(data.events||[]).map(function(row){var x=camel(row);return '<div class="sg43-timeline-event"><strong>'+esc(x.action)+'</strong><span>'+esc(App.fmtDate?App.fmtDate(x.createdAt):String(x.createdAt||''))+'</span><p>'+esc(x.userName||'Sistem')+'</p><small>'+esc(JSON.stringify(x.metadata||{}))+'</small></div>';}).join('')+'</div>';
      if(!(data.events||[]).length)body='<p class="empty-report">Nuk ka veprime në timeline.</p>';
      this.modal('Timeline — '+data.shipmentNo,body,'<button class="btn btn-outline" onclick="App.closeModal()">Mbyll</button>');
    }catch(e){this.toast(e.message||String(e),'error');}
  };

  App.openExportDocuments=async function(id){
    try{
      var shipment=camel(await Cloud.request('/api/export/shipments/'+encodeURIComponent(id)));
      var rows=(await Cloud.request('/api/export/shipments/'+encodeURIComponent(id)+'/documents')).map(camel);
      var table=rows.map(function(x){return '<tr><td>'+esc(x.documentType)+'</td><td>'+esc(x.documentNo||'—')+'</td><td>'+esc(String(x.documentDate||'').slice(0,10)||'—')+'</td><td>'+esc(x.filename||'—')+'</td><td>'+esc(x.templateKey||'—')+'</td><td>'+(shipment.status==='DISPATCHED'||shipment.status==='AT_BORDER'||shipment.status==='DELIVERED'||shipment.status==='CLOSED'?'🔒':'<button class="btn btn-red btn-sm" onclick="App.deleteExportDocument(\''+id+'\',\''+x.id+'\')">Fshi</button>')+'</td></tr>';}).join('');
      var body='<div class="card"><div class="card-title"><span>Dokumentet e lidhura</span><button class="btn btn-primary btn-sm" onclick="App.addExportDocument(\''+id+'\')">+ Shto Dokument</button></div><div class="report-table-wrap"><table><thead><tr><th>Tipi</th><th>Numri</th><th>Data</th><th>Skedari</th><th>Modeli</th><th></th></tr></thead><tbody>'+table+'</tbody></table></div>'+(table?'':'<p class="empty-report">Nuk ka dokumente shtesë.</p>')+'</div>';
      this.modal('Dokumentet — '+shipment.shipmentNo,body,'<button class="btn btn-outline" onclick="App.closeModal()">Mbyll</button>');
    }catch(e){this.toast(e.message||String(e),'error');}
  };
  App.addExportDocument=function(id){
    this.modal('Shto Dokument Eksporti','<div class="sg43-grid"><div class="form-group"><label>Tipi *</label><select id="sg43-doc-type"><option value="CERTIFICATE_OF_ORIGIN">Certifikatë Origjine</option><option value="PHYTOSANITARY">Fitosanitare</option><option value="QUALITY_CERTIFICATE">Certifikatë Cilësie</option><option value="CUSTOMS_DECLARATION">Deklaratë Doganore</option><option value="CMR">CMR</option><option value="PACKING_LIST">Packing List</option><option value="COMMERCIAL_INVOICE">Commercial Invoice</option><option value="DELIVERY_PROOF">Proof of Delivery</option><option value="OTHER">Tjetër</option></select></div><div class="form-group"><label>Numri</label><input id="sg43-doc-no"></div><div class="form-group"><label>Data</label><input id="sg43-doc-date" type="date"></div><div class="form-group"><label>Modeli/Template</label><input id="sg43-doc-template" placeholder="p.sh. export-certificate-v1"></div><div class="form-group"><label>Emri i skedarit</label><input id="sg43-doc-file"></div><div class="form-group"><label>URL ruajtjeje</label><input id="sg43-doc-url"></div></div><div class="form-group"><label>Shënime</label><textarea id="sg43-doc-notes"></textarea></div>','<button class="btn btn-outline" onclick="App.openExportDocuments(\''+id+'\')">Anulo</button><button class="btn btn-primary" onclick="App.saveExportDocument(\''+id+'\')">Ruaj</button>');
  };
  App.saveExportDocument=async function(id){
    try{
      Auth.requirePermission('documents.create');var body={documentType:val('sg43-doc-type'),documentNo:val('sg43-doc-no'),documentDate:val('sg43-doc-date')||null,templateKey:val('sg43-doc-template'),filename:val('sg43-doc-file'),storageUrl:val('sg43-doc-url'),snapshot:{shipmentId:id,capturedAt:new Date().toISOString()},notes:val('sg43-doc-notes')};
      await Cloud.request('/api/export/shipments/'+encodeURIComponent(id)+'/documents',{method:'POST',body:body});this.toast('Dokumenti u lidh me ngarkesën.');await this.openExportDocuments(id);
    }catch(e){this.toast(e.message||String(e),'error');}
  };
  App.deleteExportDocument=async function(shipmentId,documentId){
    try{if(!global.confirm('Fshi dokumentin?'))return;await Cloud.request('/api/export/shipments/'+encodeURIComponent(shipmentId)+'/documents/'+encodeURIComponent(documentId),{method:'DELETE'});this.toast('Dokumenti u fshi.');await this.openExportDocuments(shipmentId);}catch(e){this.toast(e.message||String(e),'error');}
  };

  var baseOpen=App.openExportShipment;
  App.openExportShipment=async function(id){
    try{
      await baseOpen.call(this,id);
      setTimeout(function(){
        var footer=document.querySelector('.modal-footer');if(!footer||footer.querySelector('.sg43-ext-timeline'))return;
        var timeline=document.createElement('button');timeline.type='button';timeline.className='btn btn-outline sg43-ext-timeline';timeline.textContent='🕒 Timeline';timeline.onclick=function(){App.openExportTimeline(id);};
        var documents=document.createElement('button');documents.type='button';documents.className='btn btn-outline';documents.textContent='📁 Dokumentet';documents.onclick=function(){App.openExportDocuments(id);};
        footer.insertBefore(documents,footer.firstChild);footer.insertBefore(timeline,footer.firstChild);
      },0);
    }catch(e){this.toast(e.message||String(e),'error');}
  };

  var reportCatalog=[];
  var reportRows=[];
  var currentCode='shipment-register';
  var reportTitles={};
  function reportColumns(rows){
    if(!rows.length)return[];
    var priority=['shipment_no','shipment_date','label','customer','product_name','status','shipments','quantity','net_weight','gross_weight','value','total_value','distance_km','utilization_percent','delivery_hours','revenue','goods_cost','logistics_cost','profit','cmr_no','packing_list_no','commercial_invoice_no','complete','missing'];
    var keys=Object.keys(rows[0]);keys.sort(function(a,b){var ai=priority.indexOf(a),bi=priority.indexOf(b);return(ai<0?999:ai)-(bi<0?999:bi);});return keys.slice(0,14);
  }
  function reportTable(rows){
    var cols=reportColumns(rows);if(!rows.length)return '<p class="empty-report">Nuk ka të dhëna për filtrat.</p>';
    return '<div class="report-table-wrap"><table id="sg43-report-table"><thead><tr>'+cols.map(function(k){return'<th>'+esc(labelKey(k))+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return'<tr>'+cols.map(function(k){var v=row[k];if(Array.isArray(v))v=v.join(', ');if(typeof v==='boolean')v=v?'Po':'Jo';return'<td'+(/weight|quantity|value|cost|profit|shipments|distance|percent|hours|packages|pallet/.test(k)?' class="text-right"':'')+'>'+esc(v==null?'—':v)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
  }
  App.sg43SelectReport=async function(code){currentCode=code;this._sg43ReportKey=code;await this.view_exportReports();};
  App.view_exportReports=async function(){
    try{
      reportCatalog=await Cloud.request('/api/export/reports/catalog');reportCatalog.forEach(function(x){reportTitles[x.code]=x.name;});currentCode=this._sg43ReportKey||currentCode||reportCatalog[0].code;
      var from=this._sg43ReportFrom||'',to=this._sg43ReportTo||'';reportRows=await Cloud.request('/api/export/reports/'+encodeURIComponent(currentCode)+'?from='+encodeURIComponent(from||'1900-01-01')+'&to='+encodeURIComponent(to||'2999-12-31'));
      this.data.exportReportRows=reportRows;
      var tabs=reportCatalog.map(function(x){return'<button class="'+(x.code===currentCode?'active':'')+'" onclick="App.sg43SelectReport(\''+x.code+'\')">'+esc(x.name)+'</button>';}).join('');
      document.getElementById('content').innerHTML='<div class="card"><div class="card-title"><span>📊 '+esc(reportTitles[currentCode]||currentCode)+'</span><div class="card-title-actions"><button class="btn btn-red btn-sm" onclick="App.exportCurrentExportReportPDF()">PDF</button><button class="btn btn-green btn-sm" onclick="App.exportCurrentExportReportExcel()">Excel</button><button class="btn btn-outline btn-sm" onclick="App.printCurrentExportReport()">Print</button></div></div><div class="filter-bar"><div class="form-group"><label>Nga data</label><input id="sg43-report-from" type="date" value="'+attr(from)+'"></div><div class="form-group"><label>Deri më</label><input id="sg43-report-to" type="date" value="'+attr(to)+'"></div><button class="btn btn-primary" onclick="App.applyExportReportDates()">Apliko</button><div class="sg43-report-count"><strong>15 raporte operative</strong></div></div><div class="sg43-tabs sg43-tabs-full">'+tabs+'</div>'+reportTable(reportRows)+'</div>';
    }catch(e){this.toast(e.message||String(e),'error');}
  };
  App.applyExportReportDates=function(){this._sg43ReportFrom=val('sg43-report-from');this._sg43ReportTo=val('sg43-report-to');this.view_exportReports();};
  function currentReport(){return{title:reportTitles[currentCode]||currentCode,rows:reportRows||[],columns:reportColumns(reportRows||[])};}
  App.printCurrentExportReport=function(){var r=currentReport();this.openPrintWindow('<div class="inv-header"><div>'+(this.companyHeader?this.companyHeader():'')+'</div><div style="text-align:right"><strong>'+esc(r.title)+'</strong><br>'+esc(this._sg43ReportFrom||'Të gjitha')+' — '+esc(this._sg43ReportTo||'Të gjitha')+'</div></div>'+reportTable(r.rows),r.title);};
  App.exportCurrentExportReportPDF=function(){try{var r=currentReport();global.PDFEngine.downloadReport({company:this.company,title:r.title,filtersText:'Periudha: '+(this._sg43ReportFrom||'Të gjitha')+' — '+(this._sg43ReportTo||'Të gjitha'),columns:r.columns.map(function(k){return{key:k,label:labelKey(k),width:110};}),rows:r.rows,orientation:'landscape',filename:safe(r.title)+'.pdf',footer:(this.company||{}).invoiceFooter||''});this.toast('PDF u eksportua.');}catch(e){this.toast(e.message||String(e),'error');}};
  App.exportCurrentExportReportExcel=function(){try{var r=currentReport(),aoa=[[r.title],[(this.company||{}).name||'Sistemi Genit'],['Periudha',(this._sg43ReportFrom||'Të gjitha')+' — '+(this._sg43ReportTo||'Të gjitha')],[],r.columns.map(labelKey)];r.rows.forEach(function(row){aoa.push(r.columns.map(function(k){var v=row[k];return Array.isArray(v)?v.join(', '):v;}));});var ws=global.XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=r.columns.map(function(){return{wch:22};});ws['!freeze']={xSplit:0,ySplit:5};if(r.columns.length)ws['!autofilter']={ref:'A5:'+global.XLSX.utils.encode_col(r.columns.length-1)+'5'};ws['!printArea']='A1:'+global.XLSX.utils.encode_col(Math.max(0,r.columns.length-1))+aoa.length;var wb=global.XLSX.utils.book_new();global.XLSX.utils.book_append_sheet(wb,ws,'Raporti');global.DesktopIO.saveWorkbook(wb,safe(r.title)+'.xlsx');this.toast('Excel .xlsx u eksportua.');}catch(e){this.toast(e.message||String(e),'error');}};

  App.SGPhase43ExportExtensions={catalog:function(){return reportCatalog.slice();},currentReport:function(){return currentReport();}};
})(window);
