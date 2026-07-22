'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps/web/index.html');
const jsPath = path.join(root, 'apps/web/phase4-traceability-ui.js');
const cssPath = path.join(root, 'apps/web/phase4-traceability-ui.css');
const start = '<!-- SG_PHASE4_TRACEABILITY_UI_START -->';
const end = '<!-- SG_PHASE4_TRACEABILITY_UI_END -->';

let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const block = `${start}\n<style id="sg-phase4-traceability-style">\n${css}\n</style>\n<script id="sg-phase4-traceability-script">\n${js}\n</script>\n${end}\n`;

const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
html = html.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, 'g'), '');

const finalClose = /<\/body>\s*<\/html>\s*$/i;
if (!finalClose.test(html)) throw new Error('Mungon mbyllja strukturore finale </body></html>.');
html = html.replace(finalClose, `${block}</body>\n</html>`);
fs.writeFileSync(htmlPath, html);

const check = fs.readFileSync(htmlPath, 'utf8');
if ((check.match(/SG_PHASE4_TRACEABILITY_UI_START/g) || []).length !== 1) throw new Error('Patch-i Phase 4 nuk është idempotent.');
if (!check.includes('Posto Pranimin &amp; Krijo Lotin')) throw new Error('Veprimi i lotit automatik mungon.');
if (!check.includes('Loti nuk krijohet manualisht')) throw new Error('Rregulli i lotit automatik mungon.');
if (!check.includes('Gjurmueshmëri 360°')) throw new Error('Kartela 360° mungon.');
const markerIndex = check.indexOf(start);
const finalCloseIndex = check.search(/<\/body>\s*<\/html>\s*$/i);
if (markerIndex < 0 || finalCloseIndex < 0 || markerIndex > finalCloseIndex) throw new Error('Patch-i Phase 4 nuk u vendos në fundin strukturor real.');
console.log(`Phase 4 UI patched ${htmlPath}: ${Buffer.byteLength(check)} bytes`);
