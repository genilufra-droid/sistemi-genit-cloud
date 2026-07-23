'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps', 'web', 'index.html');
const jsPath = path.join(root, 'apps', 'web', 'phase62-traceability-workflow-ui.js');
const cssPath = path.join(root, 'apps', 'web', 'phase62-traceability-workflow-ui.css');
const start = '<!-- SG_PHASE62_TRACEABILITY_WORKFLOW_UI_PATCH_START -->';
const end = '<!-- SG_PHASE62_TRACEABILITY_WORKFLOW_UI_PATCH_END -->';
function bodyIndex(source){const match=source.match(/<\/body>\s*<\/html>\s*$/i);if(!match||match.index==null)throw new Error('Mungon </body></html>.');return match.index;}
const escape=(value)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
let html=fs.readFileSync(htmlPath,'utf8');
const js=fs.readFileSync(jsPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
html=html.replace(new RegExp(`${escape(start)}[\\s\\S]*?${escape(end)}\\s*`,'g'),'');
const block=`${start}\n<style id="sg-phase62-traceability-workflow-style">\n${css}\n</style>\n<script id="sg-phase62-traceability-workflow-script">\n${js}\n</script>\n${end}\n`;
const index=bodyIndex(html);html=html.slice(0,index)+block+html.slice(index);fs.writeFileSync(htmlPath,html);
const check=fs.readFileSync(htmlPath,'utf8');
if((check.match(/SG_PHASE62_TRACEABILITY_WORKFLOW_UI_PATCH_START/g)||[]).length!==1)throw new Error('Patch-i nuk është idempotent.');
if(!check.includes('SG_PHASE62_TRACEABILITY_WORKFLOW_UI_START'))throw new Error('Runtime-i i workflow mungon.');
if(!check.includes('Dosja e Gjurmueshmërisë')||!check.includes('Kontroll Cilësie'))throw new Error('Ekranet e workflow mungojnë.');
console.log('Phase 6.2 traceability workflow UI injected.');
