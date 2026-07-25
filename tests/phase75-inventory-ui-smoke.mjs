import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui=fs.readFileSync(new URL('../apps/web/phase75-odoo-inventory-ui.js',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../apps/web/build-self-contained.cjs',import.meta.url),'utf8');

assert.equal(ui.includes('<select'),false,'Phase 7.5 nuk duhet të krijojë dropdown klasik.');
assert.ok(ui.includes('type="search"'),'Duhet search-as-you-type.');
assert.ok(ui.includes('＋ Shto'),'Duhet butoni + Shto.');
assert.ok(ui.includes('Ruaj dhe Zgjidh'),'Quick-create duhet të ruajë dhe zgjedhë rekordin.');
assert.ok(ui.includes('captureForm')&&ui.includes('restoreForm'),'Forma duhet të ruhet gjatë quick-create.');
assert.ok(ui.includes('setSearchValue(q.fieldId,created)'),'Rekordi i ri duhet të zgjidhet automatikisht.');
assert.ok(ui.includes("view_inventoryDashboard"));
assert.ok(ui.includes("view_inventoryReceipts"));
assert.ok(ui.includes("view_inventoryInternal"));
assert.ok(ui.includes("view_inventoryAdjustments"));
assert.ok(ui.includes("view_inventoryReports"));
for(const marker of ['/api/inventory/reports/stock','/api/inventory/reports/locations','/api/inventory/reports/lots','/api/inventory/reports/moves','/api/inventory/reports/valuation','/api/inventory/reports/at-date','/api/inventory/reports/slow-stock','/api/inventory/reports/discrepancies'])assert.ok(ui.includes(marker),`Mungon ${marker}`);
assert.ok(build.indexOf('patch-phase75-odoo-inventory-ui.cjs')>build.indexOf('patch-phase74-simple-work-order-ui.cjs'),'Inventory duhet injektuar pas Urdhrit të Punës.');
assert.ok(build.includes('SG_PHASE75_ODOO_INVENTORY_UI_START'));
console.log('PHASE75_INVENTORY_UI_SUCCESS search-as-you-type quick-create reports=8');
