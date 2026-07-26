'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=process.cwd();
const indexPath=path.join(root,'index.html');
const scriptPath=path.join(root,'phase91-professional-documents.js');
const marker='SG_PHASE91_PROFESSIONAL_DOCUMENTS_START';
if(!fs.existsSync(indexPath))throw new Error('Mungon index.html');
if(!fs.existsSync(scriptPath))throw new Error('Mungon phase91-professional-documents.js');
let html=fs.readFileSync(indexPath,'utf8');
const js=fs.readFileSync(scriptPath,'utf8');

// Relocate any previously embedded Phase 9.1 block. The source index may already
// contain it before later phase scripts, because earlier builds are copied back
// into apps/web/index.html. Phase 9.1 must be the final runtime patch.
let markerIndex=html.indexOf(marker);
while(markerIndex>=0){
  const scriptStart=html.lastIndexOf('<script',markerIndex);
  const openEnd=scriptStart>=0?html.indexOf('>',scriptStart):-1;
  const scriptEnd=openEnd>=0?html.indexOf('</script>',markerIndex):-1;
  if(scriptStart<0||openEnd<0||scriptEnd<0)throw new Error('Blloku ekzistues Phase 9.1 nuk mund të zhvendoset.');
  html=html.slice(0,scriptStart)+html.slice(scriptEnd+'</script>'.length);
  markerIndex=html.indexOf(marker);
}

const tag=`\n<script>\n${js}\n</script>\n`;
// Append after every existing phase block. HTML permits trailing script content
// and this guarantees Phase 9.1 executes after Phase 8.2 in the generated app.
html+=tag;
fs.writeFileSync(indexPath,html);
console.log('Phase 9.1 professional documents injected after all previous phases.');
