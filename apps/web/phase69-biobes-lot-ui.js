/* SG_PHASE69_BIOBES_LOT_UI_START — Sistemi Genit */
(function(global){
  'use strict';
  var App=global.App,Cloud=global.CloudERP;
  if(!App||!Cloud||!Cloud.apiUrl||Cloud.offlineTestMode||global.__SG_PHASE69_BIOBES_LOT_UI__)return;
  global.__SG_PHASE69_BIOBES_LOT_UI__=true;

  var currentWeightId='';
  var currentHarvestPeriod='I';

  function value(id){var el=document.getElementById(id);return el?el.value:'';}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function validOrigin(v){return /^(M(?:0[1-9]|1[0-2])|K(?:0[0-9]|1[0-7])|S(?:0[1-9]|1[0-2])|W\d{2}|A\d{2})$/i.test(String(v||'').trim());}
  function traceCode(product){var direct=String(product&&product.traceCode||product&&product.trace_code||product&&product.code||'').match(/(?:^|\D)(\d{3})(?:\D|$)/);return direct?direct[1]:'';}
  function normalizedPeriod(period){period=String(period||'I').toUpperCase();return ['I','II','III'].indexOf(period)>=0?period:'I';}

  var baseRequest=Cloud.request.bind(Cloud);
  Cloud.request=async function(path,options){
    var result=await baseRequest(path,options);
    var method=String(options&&options.method||'GET').toUpperCase();

    if(method==='GET'&&/^\/api\/trace\/workflow\/weights\/[^/]+\/details$/.test(path)){
      var loaded=result&&result.weight||{};
      currentHarvestPeriod=normalizedPeriod(loaded.harvest_period||loaded.harvestPeriod);
    }

    if((method==='POST'||method==='PATCH')&&/^\/api\/trace\/weights(?:\/[^/]+)?$/.test(path)){
      var weightId=result&&result.id||String(path).split('/').pop();
      var period=normalizedPeriod(value('wf-biobes-period')||currentHarvestPeriod);
      if(weightId){
        await baseRequest('/api/trace/weights/'+encodeURIComponent(weightId)+'/biobes-meta',{method:'PATCH',body:{harvestPeriod:period}});
        currentHarvestPeriod=period;
        if(result&&typeof result==='object'){
          result.harvest_period=period;
          result.harvestPeriod=period;
        }
      }
    }

    if(method==='POST'&&path==='/api/trace/farms'&&result&&result.id){
      var origin=(value('sg69-farm-origin')||value('sg62-farm-code')).trim().toUpperCase();
      var group=value('sg69-farm-group');
      if(validOrigin(origin)||group!==''){
        await baseRequest('/api/trace/farms/'+encodeURIComponent(result.id)+'/biobes-meta',{method:'PATCH',body:{originCode:validOrigin(origin)?origin:null,groupCode:group===''?null:Number(group)}});
      }
    }
    return result;
  };

  function installStyle(){
    if(document.getElementById('sg69-biobes-style'))return;
    var style=document.createElement('style');style.id='sg69-biobes-style';
    style.textContent='.sg69-lot-help{grid-column:1/-1;border:1px solid #d9cbd5;background:#fbf8fa;border-radius:8px;padding:10px 12px;font-size:12px;color:#4c3546}.sg69-lot-help strong{color:#714b67}.sg69-code-preview{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:800;word-break:break-all}';
    document.head.appendChild(style);
  }

  function updateProductHelp(){
    var help=document.getElementById('sg69-lot-help');if(!help)return;
    var productId=document.getElementById('wf-product')&&document.getElementById('wf-product').value;
    var product=(App.data.products||[]).find(function(row){return row.id===productId;});
    var code=traceCode(product);
    help.innerHTML='<strong>LOTI BIOBES:</strong> kodi ndërtohet automatikisht nga lëvizja + origjina + grupi/nënloti + periudha + kodi 3-shifror i artikullit + viti.'+(code?' Artikulli i zgjedhur: <span class="sg69-code-preview">'+esc(code)+' — '+esc(product.name)+'</span>.':' Vendosni te Artikulli kodin nga katalogu, p.sh. <span class="sg69-code-preview">105 — Ferra</span>.');
  }

  function injectWeightFields(){
    var form=document.querySelector('.sg62-weight-document');if(!form||document.getElementById('wf-biobes-period'))return;
    var harvest=document.getElementById('wf-p4-harvest');if(!harvest||!harvest.parentNode)return;
    var listRow=(App.data&&App.data.weightForms||[]).find(function(row){return row.id===currentWeightId;})||{};
    var period=normalizedPeriod(currentHarvestPeriod||listRow.harvestPeriod||listRow.harvest_period);
    var group=document.createElement('div');group.className='form-group';
    group.innerHTML='<label>Periudha e vjeljes *</label><select id="wf-biobes-period"><option value="I">I — Periudha e parë</option><option value="II">II — Periudha e dytë</option><option value="III">III — Periudha e tretë</option></select>';
    harvest.parentNode.parentNode.insertBefore(group,harvest.parentNode.nextSibling);
    group.querySelector('select').value=period;
    var meta=form.querySelector('.sg62-weight-meta');
    if(meta){
      var help=document.createElement('div');help.className='sg69-lot-help';help.id='sg69-lot-help';
      meta.appendChild(help);
      updateProductHelp();
      var productSelect=document.getElementById('wf-product');
      if(productSelect)productSelect.addEventListener('change',updateProductHelp);
    }
  }

  function injectFarmFields(){
    if(document.getElementById('sg69-farm-origin'))return;
    var code=document.getElementById('sg62-farm-code');if(!code)return;
    var grid=code.closest('.sg62-form-grid');if(!grid)return;
    var origin=document.createElement('div');origin.className='form-group';origin.innerHTML='<label>Kodi i origjinës BioBes</label><input id="sg69-farm-origin" placeholder="S01, M05, K03, W01, A01"><small>S/M konvencional · K/W organik · A blerje nga të tretë</small>';
    var group=document.createElement('div');group.className='form-group';group.innerHTML='<label>Grupi 0–9</label><select id="sg69-farm-group"><option value="">Automatik</option>'+Array.from({length:10},function(_x,i){return '<option value="'+i+'">'+i+'</option>';}).join('')+'</select>';
    code.parentNode.parentNode.insertBefore(origin,code.parentNode.nextSibling);origin.parentNode.insertBefore(group,origin.nextSibling);
    code.addEventListener('input',function(){if(!value('sg69-farm-origin')&&validOrigin(code.value))document.getElementById('sg69-farm-origin').value=String(code.value).toUpperCase();});
  }

  var baseWeightView=App._viewWeightForm;
  if(typeof baseWeightView==='function')App._viewWeightForm=async function(existingId){
    currentWeightId=existingId||'';
    currentHarvestPeriod='I';
    var result=await baseWeightView.apply(this,arguments);
    injectWeightFields();
    return result;
  };
  var baseFarm=App.sg62EditFarm;
  if(typeof baseFarm==='function')App.sg62EditFarm=function(){var result=baseFarm.apply(this,arguments);injectFarmFields();return result;};

  installStyle();
  injectWeightFields();
})(window);
/* SG_PHASE69_BIOBES_LOT_UI_END */
