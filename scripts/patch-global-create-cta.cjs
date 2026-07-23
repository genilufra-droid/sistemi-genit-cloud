'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps/web/index.html');
const jsPath = path.join(root, 'apps/web/global-create-cta.js');
const cssPath = path.join(root, 'apps/web/global-create-cta.css');
const start = '<!-- SG_GLOBAL_CREATE_CTA_START -->';
const end = '<!-- SG_GLOBAL_CREATE_CTA_END -->';

let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
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
if (!check.includes('Nuk u gjet asnjë rezultat') || !check.includes('registerCreateOnNoResult')) throw new Error('Logjika e kërkimit pa rezultat mungon.');
if (!check.includes("traceLots:[buttonAction('+ Shto Peshim / Pranim'")) throw new Error('Loti nuk u përjashtua nga krijimi manual.');
console.log(`Global create CTA patched ${htmlPath}: ${Buffer.byteLength(check)} bytes`);
