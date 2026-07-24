'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps', 'web', 'index.html');
const jsPath = path.join(root, 'apps', 'web', 'phase64-weight-visible-actions.js');
const start = '<!-- SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_PATCH_START -->';
const end = '<!-- SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_PATCH_END -->';

function bodyIndex(source) {
  const match = source.match(/<\/body>\s*<\/html>\s*$/i);
  if (!match || match.index == null) throw new Error('Mungon mbyllja finale </body></html>.');
  return match.index;
}
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
html = html.replace(new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}\\s*`, 'g'), '');
const block = `${start}\n<script id="sg-phase64-weight-visible-actions">\n${js}\n</script>\n${end}\n`;
const index = bodyIndex(html);
html = html.slice(0, index) + block + html.slice(index);
fs.writeFileSync(htmlPath, html);

const check = fs.readFileSync(htmlPath, 'utf8');
if ((check.match(/SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_PATCH_START/g) || []).length !== 1) throw new Error('Patch-i i butonave të peshës nuk është idempotent.');
if (!check.includes('SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_START')) throw new Error('Runtime-i i butonave të peshës mungon.');
if (!check.includes('Shto Formular Peshimi') || !check.includes('Ruaj Formularin')) throw new Error('Komandat kryesore të Formularit të Peshës mungojnë.');
if (!check.includes('SG_PHASE62_WEIGHT_DOCUMENT_UI_START')) throw new Error('Moduli ekzistues i Pamjes 58 mm mungon.');
if (js.includes('sg64-weight-mobile-save') || js.includes('position:fixed') || js.includes('MutationObserver') || js.includes(':has(')) throw new Error('Patch-i i peshës përmban mekanizëm mobile të paqëndrueshëm.');
console.log('Phase 6.4 stable native weight actions injected.');