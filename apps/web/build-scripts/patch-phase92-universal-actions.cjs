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

// Remove only script blocks that actually contain the Phase 9.2 marker.
// Do not use a cross-script regex because it can also remove Phase 9.1.
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,function(block){
  return block.includes(marker)?'':block;
});

// Inject Phase 9.2 once at the final closing BODY tag.
const tag=`\n<script>\n${js}\n</script>\n`;
const bodyClose=html.toLowerCase().lastIndexOf('</body>');
html=bodyClose>=0?html.slice(0,bodyClose)+tag+html.slice(bodyClose):html+tag;

const p91=html.lastIndexOf('SG_PHASE91_PROFESSIONAL_DOCUMENTS_START');
const p92=html.lastIndexOf(marker);
if(p91<0)throw new Error('Mungon Phase 9.1 para Phase 9.2');
if(p92<0)throw new Error('Phase 9.2 nuk u injektua');
if(p92<=p91)throw new Error('Phase 9.2 nuk u vendos pas Phase 9.1');
fs.writeFileSync(indexPath,html);
console.log('Phase 9.2 universal actions injected safely after Phase 9.1.');