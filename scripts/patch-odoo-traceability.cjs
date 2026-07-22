'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps/web/index.html');
const jsPath = path.join(root, 'apps/web/odoo-traceability-actions.js');
const cssPath = path.join(root, 'apps/web/odoo-traceability-actions.css');
const start = '<!-- SG_ODOO_TRACEABILITY_ACTIONS_START -->';
const end = '<!-- SG_ODOO_TRACEABILITY_ACTIONS_END -->';

let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const block = `${start}\n<style id="sg-odoo-traceability-actions-style">\n${css}\n</style>\n<script id="sg-odoo-traceability-actions-script">\n${js}\n</script>\n${end}`;

const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
html = html.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, 'g'), '');
if (!/<\/body>/i.test(html)) throw new Error('Mungon </body> në apps/web/index.html');
html = html.replace(/<\/body>/i, `${block}\n</body>`);
fs.writeFileSync(htmlPath, html);

const check = fs.readFileSync(htmlPath, 'utf8');
if ((check.match(/SG_ODOO_TRACEABILITY_ACTIONS_START/g) || []).length !== 1) throw new Error('Patch-i nuk është idempotent.');
if (!check.includes('Test: Gjethe Ferre 200 → 50 kg')) throw new Error('Butoni demo mungon pas patch-it.');
if (!check.includes('+ Urdhër Pune')) throw new Error('Butoni Urdhër Pune mungon pas patch-it.');
if (!check.includes('+ Lot i Ri')) throw new Error('Butoni Lot i Ri mungon pas patch-it.');
console.log(`Patched ${htmlPath}: ${Buffer.byteLength(check)} bytes`);
