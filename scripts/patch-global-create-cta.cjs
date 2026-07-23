'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps/web/index.html');
const jsPath = path.join(root, 'apps/web/global-create-cta.js');
const cssPath = path.join(root, 'apps/web/global-create-cta.css');
const start = '<!-- SG_GLOBAL_CREATE_CTA_START -->';
const end = '<!-- SG_GLOBAL_CREATE_CTA_END -->';

let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
new vm.Script(js, { filename: 'global-create-cta.js' });
const block = `${start}\n<style id="sg-global-create-cta-style">\n${css}\n</style>\n<script id="sg-global-create-cta-script">\n${js}\n</script>\n${end}\n`;

const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
html = html.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, 'g'), '');
const finalClose = /<\/body>\s*<\/html>\s*$/i;
if (!finalClose.test(html)) throw new Error('Mungon mbyllja strukturore finale </body></html>.');
html = html.replace(finalClose, `${block}</body>\n</html>`);
fs.writeFileSync(htmlPath, html);

const check = fs.readFileSync(htmlPath, 'utf8');
if ((check.match(/SG_GLOBAL_CREATE_CTA_START/g) || []).length !== 1) throw new Error('Patch-i global Shto nuk është idempotent.');
const required = [
  'Nuk u gjet asnjë rezultat', '+ Shto të ri', 'registerCreateOnNoResult',
  'takeChildren', 'restoreChildren', 'sg:quick-create-selected',
  '/api/master-data/capabilities', '/api/master-data/',
  "serverType:'FARMER'", "serverType:'DRIVER'", "serverType:'ROUTE'", "serverType:'AGENT'",
  "serverType:'ASSET'", "serverType:'EXPENSE_CATEGORY'", "serverType:'CASH_ACCOUNT'", "serverType:'BANK_ACCOUNT'",
  "traceLots:[buttonAction('+ Shto Peshim / Pranim'"
];
for (const marker of required) {
  if (!check.includes(marker)) throw new Error(`Kontrata globale Kërko ose Shto mungon: ${marker}`);
}
if (check.includes('modalHtml:') || check.includes('contentHtml:')) throw new Error('Ruajtja e dokumentit nuk duhet të përdorë kopje HTML që humbin eventet.');
console.log(`Global create CTA patched ${htmlPath}: ${Buffer.byteLength(check)} bytes`);
