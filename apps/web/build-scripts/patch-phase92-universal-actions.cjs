'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=process.cwd();
const indexPath=path.join(root,'index.html');
const scriptPath=path.join(root,'phase92-universal-actions.js');
if(!fs.existsSync(indexPath))throw new Error('Mungon index.html');
if(!fs.existsSync(scriptPath))throw new Error('Mungon phase92-universal-actions.js');
let html=fs.readFileSync(indexPath,'utf8');
const js=fs.readFileSync(scriptPath,'utf8');
const marker='SG_PHASE92_UNIVERSAL_ACTIONS_START';

// Remove every older embedded Phase 9.2 block, regardless of whitespace or formatting.
html=html.replace(/<script\b[^>]*>[\s\S]*?SG_PHASE92_UNIVERSAL_ACTIONS_START[\s\S]*?<\/script>/gi,'');

// Inject once at the absolute end of BODY, therefore after Phase 9.1 and all prior phases.
const tag=`\n<script>\n${js}\n</script>\n`;
const bodyClose=html.toLowerCase().lastIndexOf('</body>');
html=bodyClose>=0?html.slice(0,bodyClose)+tag+html.slice(bodyClose):html+tag;

const p91=html.lastIndexOf('SG_PHASE91_PROFESSIONAL_DOCUMENTS_START');
const p92=html.lastIndexOf(marker);
if(p92<0)throw new Error('Phase 9.2 nuk u injektua');
if(p91>=0&&p92<=p91)throw new Error('Phase 9.2 nuk u vendos pas Phase 9.1');
fs.writeFileSync(indexPath,html);
console.log('Phase 9.2 universal actions injected after Phase 9.1.');