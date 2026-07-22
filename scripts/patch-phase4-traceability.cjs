'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps/web/index.html');
const jsPath = path.join(root, 'apps/web/phase4-traceability-ui.js');
const cssPath = path.join(root, 'apps/web/phase4-traceability-ui.css');
const start = '<!-- SG_PHASE4_TRACEABILITY_UI_START -->';
const end = '<!-- SG_PHASE4_TRACEABILITY_UI_END -->';

let html = fs.readFileSync(htmlPath, 'utf8');
let js = fs.readFileSync(jsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

const recordOrderAnchor = "  App._viewWeightForm = function (existingId) {\n    baseViewWeightForm.call(this, existingId);\n    var wf = existingId ? byId(this.data.weightForms, existingId) : null;";
const recordOrderFix = "  App._viewWeightForm = function (existingId) {\n    var wf = existingId ? byId(this.data.weightForms, existingId) : null;\n    this._p4EditingWeight = wf || null;\n    baseViewWeightForm.call(this, existingId);";
if (js.includes(recordOrderAnchor)) js = js.replace(recordOrderAnchor, recordOrderFix);
else if (!js.includes(recordOrderFix)) throw new Error('Mungon pika e kapjes së rekordit të Peshimit para formularit bazë.');

const selectionAnchor = "      renderParcelOptions(wf && wf.parcelId || '');\n      var quality = document.getElementById('wf-p4-quality');";
const selectionFix = "      var farmSelect = document.getElementById('wf-p4-farm'); if (farmSelect && wf && wf.farmId) farmSelect.value = wf.farmId;\n      renderParcelOptions(wf && wf.parcelId || '');\n      var parcelSelect = document.getElementById('wf-p4-parcel'); if (parcelSelect && wf && wf.parcelId) parcelSelect.value = wf.parcelId;\n      var quality = document.getElementById('wf-p4-quality');";
if (js.includes(selectionAnchor)) js = js.replace(selectionAnchor, selectionFix);
else if (!js.includes(selectionFix)) throw new Error('Mungon pika e rikthimit të Fermës/Parcelës në UI Phase 4.');

const payloadStart = js.indexOf('  function readWeightPayload() {');
const payloadEnd = js.indexOf('\n\n  App.saveWeightForm', payloadStart);
if (payloadStart < 0 || payloadEnd < 0) throw new Error('Mungon funksioni readWeightPayload në UI Phase 4.');
const payloadFix = `  function readWeightPayload() {
    var editing = App._p4EditingWeight || {};
    var supplierId = global.SAC.getSelectedId(document.getElementById('wf-supplier')) || editing.supplierId || '';
    var productId = global.SAC.getSelectedId(document.getElementById('wf-product')) || editing.productId || '';
    var warehouseId = global.SAC.getSelectedId(document.getElementById('wf-warehouse')) || editing.warehouseId || '';
    var gross = 0, packaging = 0, bags = 0;
    (App._wfLines || []).forEach(function (line) {
      gross += num(line.grossKg); packaging += num(line.packagingKg); bags += num(line.bagCount != null ? line.bagCount : line.sacks);
    });
    if (editing.id && gross <= 0) {
      gross = num(editing.grossWeightTotal);
      packaging = num(editing.packagingWeightTotal);
      bags = num(editing.totalBagCount);
    }
    var percentValue = selectedValue('wf-percent');
    var priceValue = selectedValue('wf-price');
    var notesValue = selectedValue('wf-notes');
    var payload = {
      companyId:selectedCompanyId() || editing.companyId || '', warehouseId:warehouseId, supplierId:supplierId, productId:productId,
      documentDate:selectedValue('wf-date') || isoDate(editing.date), bagsCount:bags, grossWeight:gross, packagingWeight:packaging,
      discountPercent:percentValue !== '' ? num(percentValue) : num(editing.percentDeduction),
      unitPrice:priceValue !== '' ? num(priceValue) : num(editing.unitPriceExclVat),
      vehiclePlate:selectedValue('wf-p4-plate') || editing.vehiclePlate || '',
      farmId:selectedValue('wf-p4-farm') || editing.farmId || null,
      parcelId:selectedValue('wf-p4-parcel') || editing.parcelId || null,
      harvestDate:selectedValue('wf-p4-harvest') || isoDate(editing.harvestDate) || null,
      qualityStatus:selectedValue('wf-p4-quality') || editing.qualityStatus || 'QUARANTINE',
      notes:notesValue !== '' ? notesValue : (editing.notes || '')
    };
    if (!payload.companyId || !payload.warehouseId || !payload.supplierId || !payload.productId) throw new Error('Kompania, magazina, fermeri/furnitori dhe artikulli janë të detyrueshëm.');
    if (!payload.documentDate) throw new Error('Data e dokumentit është e detyrueshme.');
    if (payload.grossWeight <= 0) throw new Error('Pesha bruto duhet të jetë më e madhe se zero.');
    return payload;
  }`;
js = js.slice(0, payloadStart) + payloadFix + js.slice(payloadEnd);

const block = `${start}\n<style id="sg-phase4-traceability-style">\n${css}\n</style>\n<script id="sg-phase4-traceability-script">\n${js}\n</script>\n${end}\n`;

const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
html = html.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, 'g'), '');

const finalClose = /<\/body>\s*<\/html>\s*$/i;
if (!finalClose.test(html)) throw new Error('Mungon mbyllja strukturore finale </body></html>.');
html = html.replace(finalClose, `${block}</body>\n</html>`);
fs.writeFileSync(htmlPath, html);

const check = fs.readFileSync(htmlPath, 'utf8');
if ((check.match(/SG_PHASE4_TRACEABILITY_UI_START/g) || []).length !== 1) throw new Error('Patch-i Phase 4 nuk është idempotent.');
if (!check.includes('Posto Pranimin &amp; Krijo Lotin')) throw new Error('Veprimi i lotit automatik mungon.');
if (!check.includes('Loti nuk krijohet manualisht')) throw new Error('Rregulli i lotit automatik mungon.');
if (!check.includes('Gjurmueshmëri 360°')) throw new Error('Kartela 360° mungon.');
if (!check.includes('this._p4EditingWeight = wf || null') || !check.includes("supplierId') || editing.supplierId") || !check.includes("farmSelect.value = wf.farmId") || !check.includes("parcelSelect.value = wf.parcelId")) throw new Error('Fallback-u i Draftit ose vlerat e Fermës/Parcelës nuk u injektuan.');
const markerIndex = check.indexOf(start);
const finalCloseIndex = check.search(/<\/body>\s*<\/html>\s*$/i);
if (markerIndex < 0 || finalCloseIndex < 0 || markerIndex > finalCloseIndex) throw new Error('Patch-i Phase 4 nuk u vendos në fundin strukturor real.');
console.log(`Phase 4 UI patched ${htmlPath}: ${Buffer.byteLength(check)} bytes`);
