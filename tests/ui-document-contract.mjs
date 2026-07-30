import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../apps/web/dist/index.html', import.meta.url), 'utf8');

const requiredMarkers = [
  'SG_PHASE83_REAL_DOCUMENT_LINKS_START',
  'SG_PHASE85_PROFESSIONAL_DOCUMENT_TEMPLATES_START',
  'SG_PHASE86_EXACT_DOCUMENT_LAYOUTS_START',
  'SG_PHASE87_DIRECT_REAL_DOCUMENT_TAB_START',
  'SG_PHASE88_DIRECT_DOCUMENT_RENDERER_START',
  'SG_PHASE89_CLEAN_DOCUMENT_TAB_START',
  'SG_PHASE92_UNIVERSAL_ACTIONS_START',
  'SG_PHASE96_DOCUMENT_FIDELITY_START',
  'SG_PHASE97_CLOUD_RETURNS_START',
];
for (const marker of requiredMarkers) {
  assert.ok(html.includes(marker), `Build-i final duhet të përmbajë ${marker}.`);
}

const expectedDocuments = [
  'FATURË BLERJE',
  'FATURË SHITJE',
  'FLETË HYRJE',
  'FLETË DALJE',
  'MANDAT ARKËTIMI',
  'MANDAT PAGESE',
];
for (const label of expectedDocuments) {
  assert.ok(html.includes(label), `Mungon modeli i dokumentit: ${label}.`);
}

const requiredExportMethods = [
  'exportInvoicePDF',
  'exportInvoiceExcel',
  'exportWeightFormPDF',
  'exportWeightFormExcel',
  'exportCashDocumentPDF',
  'exportCashDocumentExcel',
  'exportBankTransactionPDF',
  'exportBankTransactionExcel',
  'exportCurrentViewPDF',
  'exportCurrentViewExcel',
  'exportCurrentReportPDF',
  'exportCurrentReportExcel',
];
for (const method of requiredExportMethods) {
  assert.match(
    html,
    new RegExp(`App\\.${method}\\s*=\\s*(?:async\\s*)?function\\b`),
    `Mungon implementimi real App.${method}.`,
  );
}
assert.ok(html.includes('new jsPDF'), 'PDF duhet të gjenerohet me motorin real jsPDF.');
assert.ok(html.includes('XLSX.utils.book_new'), 'Excel duhet të gjenerohet si workbook real XLSX.');
assert.ok(html.includes('DesktopIO.saveWorkbook'), 'Workbook-i duhet të ruhet si skedar real.');
assert.ok(html.includes("sgdocMode','fidelity'"), 'Dokumenti duhet të hapet në pamjen reale të unifikuar.');
assert.ok(html.includes('linkedDocuments'), 'Pamja reale duhet të shfaqë dokumentet pasuese.');
assert.ok(html.includes('sourceDocumentNo'), 'Pamja reale duhet të shfaqë dokumentin burim.');
assert.ok(html.includes('Gjurmueshmëria e dokumentit — nga formulari i peshës te pagesa'), 'Gjurmueshmëria duhet të lidhë peshën, dokumentet dhe pagesën.');
const phase96Start = html.lastIndexOf('/* SG_PHASE96_DOCUMENT_FIDELITY_START');
const phase96End = html.indexOf('/* SG_PHASE96_DOCUMENT_FIDELITY_END */', phase96Start);
assert.ok(phase96Start >= 0 && phase96End > phase96Start, 'Moduli final i besnikërisë së dokumentit mungon.');
const phase96 = html.slice(phase96Start, phase96End);
assert.ok(phase96.includes('sgdocAction'), 'Veprimet e eksportit duhet të kalojnë në dokumentin e unifikuar.');
assert.ok(phase96.includes('printExactDocument'), 'Printimi duhet të përdorë pamjen e njëjtë A4 të dokumentit.');
assert.ok(phase96.includes("'/api/documents/'"), 'PDF i dokumentit duhet të merret nga endpoint-i real i cloud-it.');
for (const method of ['printFinanceDocument', 'exportFinanceDocumentPDF', 'exportFinanceDocumentExcel']) {
  assert.match(phase96, new RegExp(`App\\.${method}\\s*=\\s*function\\b`), `Eksporti financiar duhet të përdorë dokumentin e unifikuar: ${method}.`);
}

const phase97Start = html.lastIndexOf('/* SG_PHASE97_CLOUD_RETURNS_START');
const phase97End = html.indexOf('/* SG_PHASE97_CLOUD_RETURNS_END */', phase97Start);
assert.ok(phase97Start >= 0 && phase97End > phase97Start, 'Rrjedha cloud e kthimit te furnitori mungon.');
const phase97 = html.slice(phase97Start, phase97End);
for (const method of ['sg97CreateSupplierReturn', 'sg97SubmitSupplierReturn', 'sg97CancelSupplierReturn', 'view_purchaseReturns']) {
  assert.match(phase97, new RegExp(`App\\.${method}\\s*=`), `Mungon veprimi cloud ${method}.`);
}
assert.ok(phase97.includes("targetType: 'PURCHASE_RETURN'"), 'Kthimi duhet të krijohet nga pranimi burim.');
assert.ok(phase97.includes("'/cancel'"), 'Kthimi duhet të ketë anulim që rikthen stokun.');

const appDefinitions = new Set([
  ...[...html.matchAll(/App\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/g)].map((match) => match[1]),
  ...[...html.matchAll(/App\.([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$]*\s*;/g)].map((match) => match[1]),
]);
const appObject = html.match(/const App\s*=\s*\{([\s\S]*?)\n\s*\};/);
if (appObject) {
  for (const match of appObject[1].matchAll(/^\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
    appDefinitions.add(match[1]);
  }
}
const onclickCalls = [...html.matchAll(/onclick\s*=\s*["'][^"']*?App\.([A-Za-z_$][\w$]*)\s*\(/g)]
  .map((match) => match[1]);
const unresolved = [...new Set(onclickCalls.filter((name) => !appDefinitions.has(name)))].sort();
assert.deepEqual(unresolved, [], `Butona onclick pa funksion: ${unresolved.join(', ')}`);

assert.ok(
  !html.includes("actions.push(['Print / PDF / Excel',()=>invoke(out.view,scope)"),
  'Menuja universale nuk duhet ta paraqesë veprimin Shiko si eksport.',
);

const workflowContracts = [
  ['PURCHASE_ORDER', 'PURCHASE_RECEIPT'],
  ['PURCHASE_RECEIPT', 'PURCHASE_INVOICE'],
  ['SALES_QUOTE', 'SALES_ORDER'],
  ['SALES_ORDER', 'DELIVERY'],
  ['DELIVERY', 'SALES_INVOICE'],
];
for (const [source, target] of workflowContracts) {
  assert.ok(
    html.includes(source) && html.includes(target),
    `Mungon rrjedha Odoo ${source} → ${target}.`,
  );
}

console.log(`UI_DOCUMENT_CONTRACT_SUCCESS buttons=${onclickCalls.length} exports=${requiredExportMethods.length} documents=${expectedDocuments.length}`);
