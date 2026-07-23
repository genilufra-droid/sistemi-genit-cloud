'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps', 'web', 'index.html');
const jsPath = path.join(root, 'apps', 'web', 'phase62-lot-label-58mm-ui.js');
const start = '<!-- SG_PHASE62_LOT_LABEL_58MM_UI_PATCH_START -->';
const end = '<!-- SG_PHASE62_LOT_LABEL_58MM_UI_PATCH_END -->';

function bodyIndex(source) {
  const match = source.match(/<\/body>\s*<\/html>\s*$/i);
  if (!match || match.index == null) throw new Error('Mungon mbyllja finale </body></html>.');
  return match.index;
}

let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
html = html.replace(new RegExp(`${escape(start)}[\\s\\S]*?${escape(end)}\\s*`, 'g'), '');
const block = `${start}\n<script id="sg-phase62-lot-label-58mm-ui">\n${js}\n</script>\n${end}\n`;
const index = bodyIndex(html);
html = html.slice(0, index) + block + html.slice(index);
fs.writeFileSync(htmlPath, html);

const check = fs.readFileSync(htmlPath, 'utf8');
if ((check.match(/SG_PHASE62_LOT_LABEL_58MM_UI_PATCH_START/g) || []).length !== 1) throw new Error('Patch-i 58 mm nuk është idempotent.');
if (!check.includes('SG_PHASE62_LOT_LABEL_58MM_UI_START')) throw new Error('Runtime-i i etiketës 58 mm mungon.');
if (!check.includes('PESHË NETO') || !check.includes('AMB')) throw new Error('Fushat AMB/PESHË NETO mungojnë në etiketë.');
if (!check.includes('format:[58,72]') && !check.includes('format: [58,72]')) throw new Error('PDF 58 mm nuk është konfiguruar.');
console.log('Phase 6.2 exact 58mm lot label UI injected.');
