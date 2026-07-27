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
  if(button.closest('.sg80-toolbar,.sg95-flow-actions')||button.hasAttribute('data-document-flow'))return;
  var scope=button.closest('.modal-content,form,#modal-box')||document;
  if(!resolveAll(scope)){
    e.preventDefault();e.stopImmediatePropagation();
    var App=global.App;
    if(App&&typeof App.toast==='function')App.toast('Zgjidhni partnerin nga lista, jo vetëm duke shkruar emrin.','error');
  }
},true);
document.addEventListener('blur',function(e){if(e.target&&e.target.classList&&e.target.classList.contains('sg61-combo-input'))resolveCombo(e.target.closest('.sg61-combo'));},true);
global.SGPhase95={resolveCombo:resolveCombo,resolveAll:resolveAll};

var App=global.App;
var Cloud=global.CloudERP;
if(App&&Cloud&&typeof Cloud.request==='function'){
  var localSaveOdooCurrent=App.saveOdooCurrent;
  var DOC_TYPES={
    purchaseRFQ:'PURCHASE_RFQ',
    purchaseOrder:'PURCHASE_ORDER',
    purchaseReceipt:'PURCHASE_RECEIPT',
    salesQuotation:'SALES_QUOTE',
    salesOrder:'SALES_ORDER',
    deliveryNote:'DELIVERY_NOTE'
  };
  function byName(rows,name){
    var wanted=norm(name);
    if(!wanted)return null;
    return (rows||[]).find(function(row){return norm(row&&row.name)===wanted;})||null;
  }
  function selectedId(input,rows){
    if(!input)return'';
    return input.dataset.selectedId||
      (global.SGPhase94&&global.SGPhase94.findByName&&((global.SGPhase94.findByName(input.value)||{}).id))||
      ((byName(rows,input.value)||{}).id)||'';
  }
  function camel(row){
    var out={};
    Object.keys(row||{}).forEach(function(key){
      out[key.replace(/_([a-z])/g,function(_,c){return c.toUpperCase();})]=row[key];
    });
    return out;
  }
  App.saveOdooCurrent=async function(){
    var type=this._odooType;
    if(!DOC_TYPES[type])return localSaveOdooCurrent.apply(this,arguments);
    try{
      var partnerInput=document.querySelector('#od-partner input');
      var warehouseInput=document.querySelector('#od-warehouse input');
      var partnerRows=/^purchase/.test(type)?this.data.suppliers:this.data.customers;
      var partnerId=selectedId(partnerInput,partnerRows);
      var warehouseId=selectedId(warehouseInput,this.data.warehouses);
      if(!partnerId)throw new Error(/^purchase/.test(type)?'Zgjidhni furnitorin nga lista.':'Zgjidhni klientin nga lista.');
      if(!warehouseId)throw new Error('Zgjidhni magazinën nga lista.');
      var lines=(this._odooLines||[]).filter(function(line){return line.productId&&Number(line.quantity)>0;});
      if(!lines.length)throw new Error('Duhet së paku një rresht artikulli me sasi më të madhe se zero.');
      var current=this._odooDoc||{};
      var payload={
        companyId:(this.company&&this.company.id)||'',
        warehouseId:warehouseId,
        partnerId:partnerId,
        docType:DOC_TYPES[type],
        documentNo:current.docNumber||'',
        documentDate:document.getElementById('od-date').value,
        notes:document.getElementById('od-notes').value,
        items:lines.map(function(line){
          return{
            productId:line.productId,
            unit:line.unit||'copë',
            coefficient:Number(line.coefficient)||1,
            quantity:Number(line.quantity),
            freeQuantity:Number(line.freeQty)||0,
            unitPrice:Number(line.unitPrice)||0,
            vatRate:line.applyVat===false?0:(Number(line.vatRate)||0)
          };
        })
      };
      if(!payload.companyId)throw new Error('Nuk ka kompani aktive.');
      var saved=camel(await Cloud.request(current.id?'/api/documents/'+encodeURIComponent(current.id):'/api/documents',{
        method:current.id?'PATCH':'POST',
        body:payload
      }));
      this.toast('Dokumenti u ruajt: '+(saved.documentNo||''));
      await Cloud.refresh();
      this.navigate(this._odooListView(type));
    }catch(error){
      this.toast(error.message||String(error),'error');
    }
  };
  App.sg95ConfirmCloudDocument=async function(id,type){
    try{
      await Cloud.request('/api/documents/'+encodeURIComponent(id)+'/confirm',{method:'POST'});
      this.toast('Dokumenti u konfirmua.');
      await Cloud.refresh();
      this.navigate(this._odooListView(type));
    }catch(error){
      this.toast(error.message||String(error),'error');
    }
  };
  var CONVERSIONS={
    purchaseRFQ:[
      {target:'PURCHASE_ORDER',type:'purchaseOrder',label:'Krijo Porosi'}
    ],
    purchaseOrder:[
      {target:'PURCHASE_RECEIPT',type:'purchaseReceipt',label:'Krijo Pranim'}
    ],
    purchaseReceipt:[
      {target:'PURCHASE_INVOICE',type:'purchaseInvoice',label:'Krijo Faturë'}
    ],
    salesQuotation:[
      {target:'SALES_ORDER',type:'salesOrder',label:'Krijo Porosi'},
      {target:'SALES_INVOICE',type:'salesInvoice',label:'Krijo Faturë'}
    ],
    salesOrder:[
      {target:'DELIVERY_NOTE',type:'deliveryNote',label:'Krijo Fletë-Dalje'},
      {target:'SALES_INVOICE',type:'salesInvoice',label:'Krijo Faturë'}
    ],
    deliveryNote:[
      {target:'SALES_INVOICE',type:'salesInvoice',label:'Krijo Faturë'}
    ]
  };
  var CONVERSION_STORES={
    PURCHASE_ORDER:'purchaseOrders',PURCHASE_RECEIPT:'purchaseReceipts',PURCHASE_INVOICE:'purchaseInvoices',
    SALES_ORDER:'salesOrders',DELIVERY_NOTE:'deliveryNotes',SALES_INVOICE:'salesInvoices'
  };
  App.sg95ConvertCloudDocument=async function(id,sourceType,conversion,openCreated){
    try{
      var created=camel(await Cloud.request('/api/documents/'+encodeURIComponent(id)+'/convert',{
        method:'POST',
        body:{targetType:conversion.target}
      }));
      this.toast(conversion.label+': '+(created.documentNo||'u krijua'));
      await Cloud.refresh();
      if(openCreated&&created.id&&typeof this.openOdooDocument==='function'){
        await this.openOdooDocument(conversion.target,created.id);
      }else if(conversion.type==='purchaseInvoice')this.navigate('purchaseList');
      else if(conversion.type==='salesInvoice')this.navigate('salesList');
      else this.navigate(this._odooListView(conversion.type));
      return created;
    }catch(error){
      this.toast(error.message||String(error),'error');
      return null;
    }
  };
  App.sg95ConvertCloudTarget=function(id,sourceDocType,targetType,openCreated){
    var sourceKey={
      PURCHASE_RFQ:'purchaseRFQ',PURCHASE_ORDER:'purchaseOrder',PURCHASE_RECEIPT:'purchaseReceipt',
      SALES_QUOTE:'salesQuotation',SALES_ORDER:'salesOrder',DELIVERY_NOTE:'deliveryNote'
    }[String(sourceDocType||'').toUpperCase()];
    var conversion=(CONVERSIONS[sourceKey]||[]).find(function(item){return item.target===targetType;});
    if(!conversion){
      this.toast('Ky hap i dokumentit nuk lejohet.','error');
      return Promise.resolve(null);
    }
    return this.sg95ConvertCloudDocument(id,sourceKey,conversion,openCreated);
  };
  var localViewOdooList=App._viewOdooList;
  App._viewOdooList=async function(type){
    await localViewOdooList.call(this,type);
    if(!DOC_TYPES[type])return;
    var cfg={
      purchaseRFQ:'purchaseRFQs',
      purchaseOrder:'purchaseOrders',
      purchaseReceipt:'purchaseReceipts',
      salesQuotation:'salesQuotations',
      salesOrder:'salesOrders',
      deliveryNote:'deliveryNotes'
    };
    var rows=(this.data[cfg[type]]||[]).slice().sort(function(a,b){
      return String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||''));
    });
    document.querySelectorAll('#odoo-list-table tbody tr').forEach(function(tr,index){
      var rowText=String(tr.textContent||'');
      var doc=rows.find(function(item){return item.docNumber&&rowText.indexOf(item.docNumber)>=0;})||rows[index];
      if(!doc)return;
      var cell=tr.lastElementChild;
      if(!cell)return;
      if(doc.status==='DRAFT'){
        var button=document.createElement('button');
        button.type='button';
        button.className='btn btn-green btn-sm';
        button.textContent='✓ Konfirmo';
        button.addEventListener('click',function(event){
          event.preventDefault();
          event.stopPropagation();
          App.sg95ConfirmCloudDocument(doc.id,type);
        });
        cell.appendChild(button);
      }
      if(doc.status!=='CANCELLED')(CONVERSIONS[type]||[]).forEach(function(conversion){
        var created=((App.data[CONVERSION_STORES[conversion.target]]||[]).find(function(row){
          return row.sourceDocumentId===doc.id;
        }));
        var completed=created&&created.status!=='DRAFT';
        var convertButton=document.createElement('button');
        convertButton.type='button';
        convertButton.className='btn '+(completed?'btn-green':'btn-blue')+' btn-sm';
        convertButton.textContent=completed?'✓ '+(conversion.target.indexOf('INVOICE')>=0?'Fatura u krijua':'Dokumenti u krijua'):(created&&conversion.target.indexOf('INVOICE')>=0?'✓ Konfirmo Faturën':conversion.label);
        if(completed)convertButton.disabled=true;
        convertButton.addEventListener('click',function(event){
          event.preventDefault();
          event.stopPropagation();
          if(completed)return;
          App.sg95ConvertCloudDocument(doc.id,type,conversion);
        });
        var visibleCell=tr.cells&&tr.cells.length?tr.cells[0]:cell;
        var flowWrap=visibleCell.querySelector('.sg95-flow-actions');
        if(!flowWrap){
          flowWrap=document.createElement('div');
          flowWrap.className='sg95-flow-actions';
          flowWrap.style.cssText='display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;min-width:135px';
          visibleCell.appendChild(flowWrap);
        }
        flowWrap.appendChild(convertButton);
      });
    });
  };
}
})(window);
/* SG_PHASE95_COMBO_SELECTION_COMMIT_END */
