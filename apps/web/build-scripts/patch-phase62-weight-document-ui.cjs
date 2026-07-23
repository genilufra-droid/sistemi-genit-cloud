'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps', 'web', 'index.html');
const jsPath = path.join(root, 'apps', 'web', 'phase62-weight-document-ui.js');
const start = '<!-- SG_PHASE62_WEIGHT_DOCUMENT_UI_PATCH_START -->';
const end = '<!-- SG_PHASE62_WEIGHT_DOCUMENT_UI_PATCH_END -->';

function bodyIndex(source) {
  const match = source.match(/<\/body>\s*<\/html>\s*$/i);
  if (!match || match.index == null) throw new Error('Mungon mbyllja finale </body></html>.');
  return match.index;
}
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
html = html.replace(new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}\\s*`, 'g'), '');
const block = `${start}\n<script id="sg-phase62-weight-document-ui">\n${js}\n</script>\n${end}\n`;
const index = bodyIndex(html);
html = html.slice(0, index) + block + html.slice(index);
fs.writeFileSync(htmlPath, html);

const check = fs.readFileSync(htmlPath, 'utf8');
if ((check.match(/SG_PHASE62_WEIGHT_DOCUMENT_UI_PATCH_START/g) || []).length !== 1) throw new Error('Patch-i i formularit të peshës nuk është idempotent.');
if (!check.includes('SG_PHASE62_WEIGHT_DOCUMENT_UI_START')) throw new Error('Runtime-i i preview-t të formularit mungon.');
if (!check.includes('Nr. Ambalazheve') || !check.includes('Peshorja / Ambalazhi') || !check.includes('Shuma / Pesha Neto')) throw new Error('Kolonat e screenshot-it mungojnë në preview.');
console.log('Phase 6.2 weight document preview injected.');
