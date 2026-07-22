'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps/web/index.html');
const jsPath = path.join(root, 'apps/web/odoo-traceability-actions.js');
const cssPath = path.join(root, 'apps/web/odoo-traceability-actions.css');
const start = '<!-- SG_ODOO_TRACEABILITY_ACTIONS_START -->';
const end = '<!-- SG_ODOO_TRACEABILITY_ACTIONS_END -->';

function finalDocumentBodyIndex(source) {
  const match = source.match(/<\/body>\s*<\/html>\s*$/i);
  if (!match || match.index == null) throw new Error('Mungon mbyllja strukturore finale </body></html> në apps/web/index.html');
  return match.index;
}

let html = fs.readFileSync(htmlPath, 'utf8');
let js = fs.readFileSync(jsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

const oldSync = "await App.refreshAll(); var resultLot = await DB.get('lots', lot.id);";
const verifiedSync = "await App.refreshAll(); App.data.lots = await DB.getAll('lots'); App.data.lotMovements = await DB.getAll('lotMovements'); App.data.processBatches = await DB.getAll('processBatches'); App.data.processBatchInputs = await DB.getAll('processBatchInputs'); App.data.salesInvoices = await DB.getAll('salesInvoices'); App.data.products = await DB.getAll('products'); var resultLot = await DB.get('lots', lot.id);";
if (js.includes(oldSync)) js = js.replace(oldSync, verifiedSync);
else if (!js.includes(verifiedSync)) throw new Error('Mungon pika e sinkronizimit të skenarit të lotit.');

const demoFallbackMarker = "var persistedDemoBatch = await DB.get('processBatches', demoBatch.id);";
if (!js.includes(demoFallbackMarker)) {
  const callStart = js.indexOf('    await S.saveProcessBatch({ id: DEMO.batchId');
  if (callStart < 0) throw new Error('Mungon thirrja e Urdhrit demonstrues të Punës.');
  const callEnd = js.indexOf('\n', callStart);
  if (callEnd < 0) throw new Error('Thirrja e Urdhrit demonstrues nuk ka fund rreshti.');
  const originalCall = js.slice(callStart, callEnd);
  const capturedCall = originalCall.replace('await S.saveProcessBatch(', 'var demoBatch = await S.saveProcessBatch(');
  const fallback = [
    capturedCall,
    "    var persistedDemoBatch = await DB.get('processBatches', demoBatch.id);",
    "    if (!persistedDemoBatch) {",
    "      await DB.atomicTx(['processBatches', 'processBatchInputs'], 'readwrite', function (stores) {",
    "        stores.processBatches.put(demoBatch);",
    "        (demoBatch.inputs || []).forEach(function (line) { stores.processBatchInputs.put(line); });",
    "      });",
    "      persistedDemoBatch = await DB.get('processBatches', demoBatch.id);",
    "    }",
    "    if (!persistedDemoBatch) throw new Error('Urdhri demonstrues i Punës nuk u ruajt në databazë.');"
  ].join('\n');
  js = js.slice(0, callStart) + fallback + js.slice(callEnd);
}
const oldBatchReturn = "batch: await DB.get('processBatches', DEMO.batchId)";
const verifiedBatchReturn = "batch: await DB.get('processBatches', demoBatch.id)";
if (js.includes(oldBatchReturn)) js = js.replace(oldBatchReturn, verifiedBatchReturn);
else if (!js.includes(verifiedBatchReturn)) throw new Error('Mungon kthimi i Urdhrit demonstrues të Punës.');

const block = `${start}\n<style id="sg-odoo-traceability-actions-style">\n${css}\n</style>\n<script id="sg-odoo-traceability-actions-script">\n${js}\n</script>\n${end}`;
const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
html = html.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, 'g'), '');
const bodyIndex = finalDocumentBodyIndex(html);
html = html.slice(0, bodyIndex) + block + '\n' + html.slice(bodyIndex);
fs.writeFileSync(htmlPath, html);

const check = fs.readFileSync(htmlPath, 'utf8');
if ((check.match(/SG_ODOO_TRACEABILITY_ACTIONS_START/g) || []).length !== 1) throw new Error('Patch-i nuk është idempotent.');
if ((check.match(/SG_ODOO_TRACEABILITY_ACTIONS_END/g) || []).length !== 1) throw new Error('Fundi i patch-it Odoo mungon ose është i dyfishuar.');
if (!check.includes('Test: Gjethe Ferre 200 → 50 kg')) throw new Error('Butoni demo mungon pas patch-it.');
if (!check.includes('+ Urdhër Pune')) throw new Error('Butoni Urdhër Pune mungon pas patch-it.');
if (!check.includes('+ Lot i Ri')) throw new Error('Butoni Lot i Ri mungon pas patch-it.');
if (!check.includes(verifiedSync)) throw new Error('Sinkronizimi i verifikuar i lotit mungon nga HTML-ja finale.');
if (!check.includes(demoFallbackMarker) || !check.includes(verifiedBatchReturn)) throw new Error('Verifikimi i Urdhrit demonstrues mungon nga HTML-ja finale.');
const markerIndex = check.indexOf(start);
const finalBodyIndex = finalDocumentBodyIndex(check);
if (markerIndex < 0 || markerIndex >= finalBodyIndex) throw new Error('Patch-i Odoo nuk u vendos para mbylljes strukturore finale.');
console.log(`Patched ${htmlPath}: ${Buffer.byteLength(check)} bytes`);
