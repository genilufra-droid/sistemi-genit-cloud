import fs from 'node:fs';

const path = 'apps/web/src/Phase2Pages.jsx';
let source = fs.readFileSync(path, 'utf8');
source = source.replace(
  "const confirm=async(r)=>{if(!confirm(`Konfirmo ${r.document_no} dhe rrit stokun?`))return;",
  "const confirmWeight=async(r)=>{if(!window.confirm(`Konfirmo ${r.document_no} dhe rrit stokun?`))return;",
);
source = source.replace('onClick={()=>confirm(r)}', 'onClick={()=>confirmWeight(r)}');
source = source.replace('if(!confirm(`Konfirmo dokumentin ${r.document_no}?`))return;', 'if(!window.confirm(`Konfirmo dokumentin ${r.document_no}?`))return;');
fs.writeFileSync(path, source);
console.log('Phase 2 frontend fixes applied.');
