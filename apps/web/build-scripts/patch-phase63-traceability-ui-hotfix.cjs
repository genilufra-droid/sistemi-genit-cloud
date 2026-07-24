'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps', 'web', 'index.html');
const jsPath = path.join(root, 'apps', 'web', 'phase63-traceability-ui-hotfix.js');
const start = '<!-- SG_PHASE63_TRACEABILITY_UI_HOTFIX_PATCH_START -->';
const end = '<!-- SG_PHASE63_TRACEABILITY_UI_HOTFIX_PATCH_END -->';

function bodyIndex(source) {
  const match = source.match(/<\/body>\s*<\/html>\s*$/i);
  if (!match || match.index == null) throw new Error('Mungon mbyllja finale </body></html>.');
  return match.index;
}
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
html = html.replace(new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}\\s*`, 'g'), '');
const block = `${start}\n<script id="sg-phase63-traceability-ui-hotfix">\n${js}\n</script>\n${end}\n`;
const index = bodyIndex(html);
html = html.slice(0, index) + block + html.slice(index);
fs.writeFileSync(htmlPath, html);

const check = fs.readFileSync(htmlPath, 'utf8');
if ((check.match(/SG_PHASE63_TRACEABILITY_UI_HOTFIX_PATCH_START/g) || []).length !== 1) throw new Error('Patch-i Phase 6.3 nuk është idempotent.');
if (!check.includes('SG_PHASE63_TRACEABILITY_UI_HOTFIX_START')) throw new Error('Runtime-i Phase 6.3 mungon.');
if (!check.includes('Ferma, Bima dhe Parcela plotësohen vetëm')) throw new Error('Rregulli i origjinës opsionale mungon.');
if (!check.includes('KOPJE FORMULARI') || !check.includes('PESHË NETO')) throw new Error('Preview 58 mm i Formularit të Peshës mungon.');
console.log('Phase 6.3 traceability UI hotfix injected.');
