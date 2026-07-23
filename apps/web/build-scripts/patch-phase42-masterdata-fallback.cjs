'use strict';
const fs=require('fs');
const path=require('path');
const target=path.resolve(__dirname,'../apps/web/phase4-processing-packaging-ui.js');
let source=fs.readFileSync(target,'utf8');

const anchor=`  function companyHeader() { return App.companyHeader ? App.companyHeader() : '<strong>'+esc((App.company||{}).name||'Sistemi Genit')+'</strong>'; }`;
const replacement=`  function companyHeader() { return App.companyHeader ? App.companyHeader() : '<strong>'+esc((App.company||{}).name||'Sistemi Genit')+'</strong>'; }
  function bootstrapRows(key) {
    var snapshot=Cloud.getBootstrap ? Cloud.getBootstrap() : null;
    return ((snapshot && snapshot[key]) || []).map(camel);
  }
  function masterWarehouses() {
    var rows=(App.data.warehouses||[]).slice();
    if(!rows.length){
      rows=bootstrapRows('warehouses').map(function(x){return {id:x.id,companyId:x.companyId,code:x.code||'',name:x.name||'',address:x.address||'',active:x.active!==false};});
      if(rows.length)App.data.warehouses=rows;
    }
    return rows;
  }
  function masterProducts() {
    var rows=(App.data.products||[]).slice();
    if(!rows.length){
      rows=bootstrapRows('products').map(function(x){return {id:x.id,companyId:x.companyId,categoryId:x.categoryId||'',code:x.code||'',name:x.name||'',baseUnit:x.baseUnit||'kg',active:x.active!==false,salePrice:num(x.salePrice),purchasePrice:num(x.purchasePrice)};});
      if(rows.length)App.data.products=rows;
    }
    return rows;
  }`;
if(source.includes(anchor) && !source.includes('function masterWarehouses()'))source=source.replace(anchor,replacement);
else if(!source.includes('function masterWarehouses()'))throw new Error('Mungon pika e fallback-ut master-data Phase 4.2.');

source=source.replace("function productName(id) { var x=byId(App.data.products,id); return x ? x.name : '—'; }","function productName(id) { var x=byId(masterProducts(),id); return x ? x.name : '—'; }");
source=source.replace("function warehouseName(id) { var x=byId(App.data.warehouses,id); return x ? x.name : '—'; }","function warehouseName(id) { var x=byId(masterWarehouses(),id); return x ? x.name : '—'; }");
source=source.replace("var warehouses=(this.data.warehouses||[]).filter(function(w){return !companyId||w.companyId===companyId;});","var warehouses=masterWarehouses().filter(function(w){return !companyId||w.companyId===companyId;});");
source=source.replace("var products=(this.data.products||[]).filter(function(p){return p.active!==false&&(!companyId||p.companyId===companyId);});","var products=masterProducts().filter(function(p){return p.active!==false&&(!companyId||p.companyId===companyId);});");
source=source.replace("var companyId=selectedCompanyId(),warehouses=(this.data.warehouses||[]).filter(function(w){return !companyId||w.companyId===companyId;}),products=(this.data.products||[]).filter(function(p){return p.active!==false&&(!companyId||p.companyId===companyId);}),lots=availableLots(x.warehouseId||'','PROCESSED');","var companyId=selectedCompanyId(),warehouses=masterWarehouses().filter(function(w){return !companyId||w.companyId===companyId;}),products=masterProducts().filter(function(p){return p.active!==false&&(!companyId||p.companyId===companyId);}),lots=availableLots(x.warehouseId||'','PROCESSED');");

fs.writeFileSync(target,source);
const check=fs.readFileSync(target,'utf8');
['function masterWarehouses()','function masterProducts()','bootstrapRows(\'warehouses\')','masterWarehouses().filter','masterProducts().filter'].forEach(function(marker){if(!check.includes(marker))throw new Error('Mungon '+marker);});
console.log('Phase 4.2 master-data fallback to PostgreSQL bootstrap applied.');
