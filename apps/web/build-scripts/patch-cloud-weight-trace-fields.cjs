'use strict';
const fs=require('fs');
const path=require('path');
const target=path.resolve(__dirname,'../apps/web/cloud-erp-adapter.js');
let source=fs.readFileSync(target,'utf8');
const oldText=`      vehiclePlate:x.vehiclePlate || '', notes:x.notes || '', status:x.status || 'DRAFT', createdAt:x.createdAt, updatedAt:x.updatedAt, cloudVersion:x.version || 1`;
const newText=`      vehiclePlate:x.vehiclePlate || '', notes:x.notes || '', status:x.status || 'DRAFT',
      farmId:x.farmId || '', parcelId:x.parcelId || '', harvestDate:x.harvestDate || '', qualityStatus:x.qualityStatus || 'QUARANTINE',
      lotId:x.lotId || '', receiptDocumentId:x.receiptDocumentId || '',
      totalBagCount:num(x.bagsCount), grossWeightTotal:num(x.grossWeight), packagingWeightTotal:num(x.packagingWeight),
      netWeightBeforePercent:num(x.netWeight), netWeightAfterPercent:num(x.acceptedWeight), percentDeduction:num(x.discountPercent),
      unitPriceExclVat:num(x.unitPrice), baseAmount:num(x.totalValue), purchaseTotal:num(x.totalValue), totalAmount:num(x.totalValue),
      lines:[{bagCount:num(x.bagsCount),grossKg:num(x.grossWeight),packagingKg:num(x.packagingWeight),note:x.notes || ''}],
      createdAt:x.createdAt, updatedAt:x.updatedAt, cloudVersion:x.version || 1`;
if(source.includes(oldText))source=source.replace(oldText,newText);
else if(!source.includes(newText))throw new Error('Mungon mapper-i Cloud i Formularit të Peshës.');
fs.writeFileSync(target,source);
const check=fs.readFileSync(target,'utf8');
['farmId:x.farmId','parcelId:x.parcelId','harvestDate:x.harvestDate','lotId:x.lotId','receiptDocumentId:x.receiptDocumentId','grossWeightTotal:num(x.grossWeight)','lines:[{bagCount:num(x.bagsCount)'].forEach(function(marker){if(!check.includes(marker))throw new Error('Mungon '+marker);});
console.log('Cloud weight traceability fields and editable lines preserved.');
