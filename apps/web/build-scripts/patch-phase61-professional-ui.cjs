'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps/web/index.html');
const jsPath = path.join(root, 'apps/web/phase61-professional-ui.js');
const cssPath = path.join(root, 'apps/web/phase61-professional-ui.css');
const start = '<!-- SG_PHASE61_PROFESSIONAL_UI_START -->';
const end = '<!-- SG_PHASE61_PROFESSIONAL_UI_END -->';

let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const escStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
html = html.replace(new RegExp(escStart + '[\\s\\S]*?' + escEnd + '\\s*', 'g'), '');
const finalClose = /<\/body>\s*<\/html>\s*$/i;
if (!finalClose.test(html)) throw new Error('Mungon mbyllja finale </body></html>.');
const block = start + '\n<style id="sg-phase61-professional-style">\n' + css + '\n</style>\n<script id="sg-phase61-professional-script">\n' + js + '\n</script>\n' + end + '\n';
html = html.replace(finalClose, block + '</body>\n</html>');
fs.writeFileSync(htmlPath, html);

const check = fs.readFileSync(htmlPath, 'utf8');
if ((check.match(/SG_PHASE61_PROFESSIONAL_UI_START/g) || []).length !== 1) throw new Error('Patch-i Faza 6.1 nuk është idempotent.');
[
  '__SG_PHASE61_PROFESSIONAL_UI__',
  'sg61-combo-input',
  'Pamje &amp; Eksport',
  'FORMULAR PESHE',
  'MANDAT PAGESE',
  'global.SGPhase61ProfessionalUI'
].forEach((marker) => {
  if (!check.includes(marker)) throw new Error('Mungon ' + marker + ' në HTML final.');
});
console.log('Phase 6.1 professional Odoo UI patched.');
