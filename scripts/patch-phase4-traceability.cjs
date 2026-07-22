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
const recordOrderFix = "  App._viewWeightForm = function (existingId) {\n    var wf = existingId ? byId(this.data.weightForms, existingId) : null;\n    baseViewWeightForm.call(this, existingId);";
if (js.includes(recordOrderAnchor)) js = js.replace(recordOrderAnchor, recordOrderFix);
else if (!js.includes(recordOrderFix)) throw new Error('Mungon pika e kapjes së rekordit të Peshimit para formularit bazë.');

const selectionAnchor = "      renderParcelOptions(wf && wf.parcelId || '');\n      var quality = document.getElementById('wf-p4-quality');";
const selectionFix = "      var farmSelect = document.getElementById('wf-p4-farm'); if (farmSelect && wf && wf.farmId) farmSelect.value = wf.farmId;\n      renderParcelOptions(wf && wf.parcelId || '');\n      var parcelSelect = document.getElementById('wf-p4-parcel'); if (parcelSelect && wf && wf.parcelId) parcelSelect.value = wf.parcelId;\n      var quality = document.getElementById('wf-p4-quality');";
if (js.includes(selectionAnchor)) js = js.replace(selectionAnchor, selectionFix);
else if (!js.includes(selectionFix)) throw new Error('Mungon pika e rikthimit të Fermës/Parcelës në UI Phase 4.');

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
if (!check.includes(recordOrderFix) || !check.includes("farmSelect.value = wf.farmId") || !check.includes("parcelSelect.value = wf.parcelId")) throw new Error('Rekordi ose vlerat e Fermës/Parcelës nuk u injektuan.');
const markerIndex = check.indexOf(start);
const finalCloseIndex = check.search(/<\/body>\s*<\/html>\s*$/i);
if (markerIndex < 0 || finalCloseIndex < 0 || markerIndex > finalCloseIndex) throw new Error('Patch-i Phase 4 nuk u vendos në fundin strukturor real.');
console.log(`Phase 4 UI patched ${htmlPath}: ${Buffer.byteLength(check)} bytes`);
