'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const webRoot=fs.existsSync(path.join(root,'apps','web','index.html'))
  ? path.join(root,'apps','web')
  : root;
const htmlPath=path.join(webRoot,'index.html');
const jsPath=path.join(webRoot,'phase83-real-document-links.js');
const start='<!-- SG_PHASE83_REAL_DOCUMENT_LINKS_PATCH_START -->';
const end='<!-- SG_PHASE83_REAL_DOCUMENT_LINKS_PATCH_END -->';
const esc=(value)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
if(!fs.existsSync(htmlPath))throw new Error('Mungon index.html për Phase 8.3: '+htmlPath);
if(!fs.existsSync(jsPath))throw new Error('Mungon phase83-real-document-links.js: '+jsPath);
let html=fs.readFileSync(htmlPath,'utf8');
const js=fs.readFileSync(jsPath,'utf8');
new Function(js);
html=html.replace(new RegExp(esc(start)+'[\\s\\S]*?'+esc(end)+'\\s*','g'),'');
const close=/<\/body>\s*<\/html>\s*$/i;
if(!close.test(html))throw new Error('Mungon mbyllja finale e HTML.');
html=html.replace(close,start+'\n<script id="sg-phase83-real-document-links">\n'+js+'\n</script>\n'+end+'\n</body>\n</html>');
fs.writeFileSync(htmlPath,html);
const check=fs.readFileSync(htmlPath,'utf8');
if((check.match(/SG_PHASE83_REAL_DOCUMENT_LINKS_PATCH_START/g)||[]).length!==1)throw new Error('Patch-i Phase 8.3 nuk është idempotent.');
['SG_PHASE83_REAL_DOCUMENT_LINKS_START','sgdocKind','sgdocId','Hap dokumentin real në skedë të re'].forEach((marker)=>{if(!check.includes(marker))throw new Error('Mungon '+marker);});
console.log('Phase 8.3 real document links injected.');
