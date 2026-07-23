'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps', 'web', 'index.html');
const jsPath = path.join(root, 'apps', 'web', 'phase62-audit-device-ui.js');
const start = '<!-- SG_PHASE62_AUDIT_DEVICE_UI_PATCH_START -->';
const end = '<!-- SG_PHASE62_AUDIT_DEVICE_UI_PATCH_END -->';

function finalBodyIndex(source) {
  const match = source.match(/<\/body>\s*<\/html>\s*$/i);
  if (!match || match.index == null) throw new Error('Mungon mbyllja finale </body></html>.');
  return match.index;
}

let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
html = html.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, 'g'), '');
const block = `${start}\n<script id="sg-phase62-audit-device-ui">\n${js}\n</script>\n${end}\n`;
const index = finalBodyIndex(html);
html = html.slice(0, index) + block + html.slice(index);
fs.writeFileSync(htmlPath, html);

const check = fs.readFileSync(htmlPath, 'utf8');
if ((check.match(/SG_PHASE62_AUDIT_DEVICE_UI_PATCH_START/g) || []).length !== 1) throw new Error('Patch-i i auditimit të pajisjes nuk është idempotent.');
if (!check.includes('SG_PHASE62_AUDIT_DEVICE_UI_START')) throw new Error('Mungon runtime-i i auditimit të pajisjes.');
if (!check.includes('X-SG-Device-ID')) throw new Error('Mungon header-i Device ID.');
console.log('Phase 6.2 audit device UI injected.');
