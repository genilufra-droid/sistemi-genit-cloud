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

// Remove only existing script blocks that contain Phase 9.2.
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,function(block){
  return block.includes(marker)?'':block;
});

// Phase 9.1 is appended after the closing HTML tag by its patch.
// Therefore Phase 9.2 must also be appended to the absolute end, not before </body>.
const tag=`\n<script>\n${js}\n</script>\n`;
html+=tag;

if(!html.includes(marker))throw new Error('Phase 9.2 nuk u injektua');
fs.writeFileSync(indexPath,html);
console.log('Phase 9.2 universal actions appended after Phase 9.1.');