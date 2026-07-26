'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=process.cwd();
const indexPath=path.join(root,'index.html');
const scriptPath=path.join(root,'phase91-professional-documents.js');
if(!fs.existsSync(indexPath))throw new Error('Mungon index.html');
if(!fs.existsSync(scriptPath))throw new Error('Mungon phase91-professional-documents.js');
let html=fs.readFileSync(indexPath,'utf8');
const js=fs.readFileSync(scriptPath,'utf8');
if(!html.includes('SG_PHASE91_PROFESSIONAL_DOCUMENTS_START')){
 const tag=`\n<script>\n${js}\n</script>\n`;
 html=html.includes('</body>')?html.replace('</body>',`${tag}</body>`):html+tag;
 fs.writeFileSync(indexPath,html);
}
console.log('Phase 9.1 professional documents injected.');
