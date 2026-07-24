import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const launcherPath=path.join(dir,'phase5-launcher.js');
let source=fs.readFileSync(launcherPath,'utf8');
const importLine="import { installPhase71OdooManufacturingRoutes, migratePhase71OdooManufacturing } from './phase71-odoo-manufacturing.js';";
if(!source.includes(importLine)){
  const anchor="import { migrateBiobesLotStageCompatibility } from './biobes-lot-stage-compat.js';";
  if(!source.includes(anchor))throw new Error('Phase 7.1 import anchor mungon.');
  source=source.replace(anchor,anchor+'\n'+importLine);
}
if(!source.includes('await migratePhase71OdooManufacturing(pool);')){
  const anchor='await migrateBiobesLotCode(pool);';
  if(!source.includes(anchor))throw new Error('Phase 7.1 migration anchor mungon.');
  source=source.replace(anchor,anchor+'\nawait migratePhase71OdooManufacturing(pool);');
}
if(!source.includes('installPhase71OdooManufacturingRoutes({')){
  const anchor='installBiobesLotCodeRoutes({ app:capturedApp, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds });';
  if(!source.includes(anchor))throw new Error('Phase 7.1 route anchor mungon.');
  source=source.replace(anchor,anchor+'\ninstallPhase71OdooManufacturingRoutes({ app:capturedApp, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });');
}
source=source.replace(
  "{ group:'Gjurmueshmëri 360°',phase:6.9,active:true,items:['Ferma & Origjina','Katalogu me 165 kode BioBes','Periudha I/II/III','Bimët','Formulari i Peshës me Origjinë Opsionale','Kontroll Cilësie','Faturë Blerje','Fletë-Hyrje & Etiketë 58 mm','Lote B0/B1','Proces & Gjendje B6','Loti Final i Shitjes B2/B3','Dosja e Dokumenteve'] },",
  "{ group:'Gjurmueshmëri 360°',phase:6.9,active:true,items:['Ferma & Origjina','Katalogu me 165 kode BioBes','Periudha I/II/III','Bimët','Formulari i Peshës me Origjinë Opsionale','Kontroll Cilësie','Faturë Blerje','Fletë-Hyrje & Etiketë 58 mm','Lote B0/B1','Proces & Gjendje B6','Loti Final i Shitjes B2/B3','Dosja e Dokumenteve'] },\n    { group:'Prodhimi Odoo',phase:7.1,active:true,items:['Proceset','Makineritë / Qendrat e Punës','Mostrat e Klientit','Fushatat e Prodhimit','Urdhrat e Punës','Kontrolli i Cilësisë','Transferimet Proces–Proces','Paketimi','Përbërja e Lotit Final'] },"
);
fs.writeFileSync(launcherPath,source);
await import('./phase5-launcher.js');
