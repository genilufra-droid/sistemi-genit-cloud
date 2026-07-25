import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync('apps/web/phase76-inventory-documents-reports-ui.js','utf8');
const api=fs.readFileSync('apps/api/src/phase76-inventory-reports.js','utf8');
const patch=fs.readFileSync('apps/web/build-scripts/patch-phase76-inventory-documents-reports-ui.cjs','utf8');

for(const marker of ['SG_PHASE76_INVENTORY_DOCUMENTS_REPORTS_UI_START','20 Raportet e Magazinës','FLETË HYRJE','FLETË DALJE','Adresa ku shkon malli','Emërtimi i mallit','Marrësi në dorëzim','Transportuesi','Llogaritari','Print / PDF','Excel .xlsx','sg76PrintDocument','sg76ExcelDocument'])assert.ok(ui.includes(marker),`Mungon marker-i UI: ${marker}`);
const reports=['stock-current','stock-by-warehouse','stock-by-location','stock-by-product','stock-by-lot','free-reserved','product-ledger','lot-ledger','receipts-register','deliveries-register','moves-history','internal-transfers','stock-at-date','valuation','discrepancies','slow-stock','below-minimum','turnover','in-out-period','supplier-lot-customer'];
for(const report of reports)assert.ok(api.includes(`id:'${report}'`),`Mungon raporti API: ${report}`);
assert.equal(reports.length,20);
assert.ok(ui.includes("request('/api/inventory/reports-v2')"),'UI duhet ta marrë katalogun dinamik nga API.');
assert.ok(patch.includes('SG_PHASE76_INVENTORY_DOCUMENTS_REPORTS_UI_PATCH_START'));
assert.ok(!/MutationObserver/.test(ui),'Phase 7.6 nuk duhet të përdorë MutationObserver.');
assert.ok(!/<select/i.test(ui),'Phase 7.6 nuk duhet të shtojë dropdown klasik.');
console.log('PHASE76_UI_SUCCESS document-template=photo-style reports=20 dynamic-catalog no-dropdown no-observer');
