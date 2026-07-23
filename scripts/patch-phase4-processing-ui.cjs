'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const htmlPath=path.join(root,'apps/web/index.html');
const jsPath=path.join(root,'apps/web/phase4-processing-packaging-ui.js');
const cssPath=path.join(root,'apps/web/phase4-processing-packaging-ui.css');
const start='<!-- SG_PHASE42_PROCESSING_UI_START -->';
const end='<!-- SG_PHASE42_PROCESSING_UI_END -->';
let html=fs.readFileSync(htmlPath,'utf8');
let js=fs.readFileSync(jsPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const readyOld='  App.SGPhase42={load:loadData};';
const navigationBridge=`  var phase42BaseNavigate=App.navigate;
  App.navigate=function(view){
    var result=phase42BaseNavigate.apply(this,arguments);
    if(view==='traceProcesses'){
      var self=this;
      Promise.resolve().then(function(){return self.view_traceProcesses();}).catch(function(error){self.toast(error.message||String(error),'error');});
    }
    return result;
  };
  App.SGPhase42={load:loadData}; global.SGPhase42=App.SGPhase42;`;
if(js.includes(readyOld))js=js.replace(readyOld,navigationBridge);
else if(!js.includes(navigationBridge))throw new Error('Mungon flamuri ose ura e navigimit Phase 4.2.');
const escStart=start.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const escEnd=end.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
html=html.replace(new RegExp(escStart+'[\\s\\S]*?'+escEnd+'\\s*','g'),'');
const finalClose=/<\/body>\s*<\/html>\s*$/i;
if(!finalClose.test(html))throw new Error('Mungon mbyllja finale </body></html>.');
const block=start+'\n<style id="sg-phase42-processing-style">\n'+css+'\n</style>\n<script id="sg-phase42-processing-script">\n'+js+'\n</script>\n'+end+'\n';
html=html.replace(finalClose,block+'</body>\n</html>');
fs.writeFileSync(htmlPath,html);
const check=fs.readFileSync(htmlPath,'utf8');
if((check.match(/SG_PHASE42_PROCESSING_UI_START/g)||[]).length!==1)throw new Error('Patch-i Phase 4.2 nuk është idempotent.');
['Proces & Paketim Cloud','editProcessOrderOnline','editPackagingOrderOnline','exportProcessOrderOnlinePDF','exportPackagingOrderOnlineExcel','global.SGPhase42=App.SGPhase42','phase42BaseNavigate'].forEach(function(marker){if(!check.includes(marker))throw new Error('Mungon '+marker+' në HTML.');});
console.log('Phase 4.2 processing UI patched.');
