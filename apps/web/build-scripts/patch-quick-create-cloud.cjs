'use strict';
const fs=require('fs');
const path=require('path');
const target=path.resolve(__dirname,'../apps/web/cloud-erp-adapter.js');
let source=fs.readFileSync(target,'utf8');

const oldPartner=`      await request(existingId ? '/api/partners/' + encodeURIComponent(existingId) : '/api/partners', { method: existingId ? 'PATCH' : 'POST', body: payload });
      this.closeModal(); this.toast(existingId ? 'Partneri u përditësua në Cloud.' : 'Partneri u krijua në Cloud.');
      await global.CloudERP.refresh(); this.navigate('partners');`;
const newPartner=`      var savedPartner = await request(existingId ? '/api/partners/' + encodeURIComponent(existingId) : '/api/partners', { method: existingId ? 'PATCH' : 'POST', body: payload });
      await global.CloudERP.refresh();
      var quickPartnerKey = type === 'supplier' ? 'supplier' : 'customer';
      if (!existingId && this.completeQuickCreate && this.completeQuickCreate(quickPartnerKey, savedPartner)) {
        this.toast('Partneri u krijua në Cloud dhe u zgjodh në dokument.');
        return savedPartner;
      }
      this.closeModal(); this.toast(existingId ? 'Partneri u përditësua në Cloud.' : 'Partneri u krijua në Cloud.');
      this.navigate('partners');
      return savedPartner;`;
if(source.includes(oldPartner))source=source.replace(oldPartner,newPartner);
else if(!source.includes(newPartner))throw new Error('Mungon blloku Cloud savePartner.');

const oldProduct=`      await request(existingId ? '/api/products/' + encodeURIComponent(existingId) : '/api/products', { method: existingId ? 'PATCH' : 'POST', body: payload });
      this.closeModal(); this.toast(existingId ? 'Artikulli u përditësua në Cloud.' : 'Artikulli u krijua në Cloud.');
      await global.CloudERP.refresh(); this.navigate('products');`;
const newProduct=`      var savedProduct = await request(existingId ? '/api/products/' + encodeURIComponent(existingId) : '/api/products', { method: existingId ? 'PATCH' : 'POST', body: payload });
      await global.CloudERP.refresh();
      if (!existingId && this.completeQuickCreate && this.completeQuickCreate('product', savedProduct)) {
        this.toast('Artikulli u krijua në Cloud dhe u zgjodh në dokument.');
        return savedProduct;
      }
      this.closeModal(); this.toast(existingId ? 'Artikulli u përditësua në Cloud.' : 'Artikulli u krijua në Cloud.');
      this.navigate('products');
      return savedProduct;`;
if(source.includes(oldProduct))source=source.replace(oldProduct,newProduct);
else if(!source.includes(newProduct))throw new Error('Mungon blloku Cloud saveProduct.');

fs.writeFileSync(target,source);
const check=fs.readFileSync(target,'utf8');
if(!check.includes("completeQuickCreate('product', savedProduct)")||!check.includes('completeQuickCreate(quickPartnerKey, savedPartner)'))throw new Error('Quick-create Cloud nuk u lidh.');
console.log('Cloud product/partner quick-create return flow patched.');
