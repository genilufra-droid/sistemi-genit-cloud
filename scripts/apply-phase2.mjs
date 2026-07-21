import fs from 'node:fs';

function replaceOnce(source, find, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(find)) throw new Error(`Nuk u gjet pika e integrimit: ${label}`);
  return source.replace(find, replacement);
}

const serverPath = 'apps/api/src/server.js';
let server = fs.readFileSync(serverPath, 'utf8');
server = replaceOnce(
  server,
  "import { z } from 'zod';",
  "import { z } from 'zod';\nimport { installPhase2Routes, migratePhase2 } from './phase2.js';\nimport { installPhase2DocumentRoutes, migratePhase2Documents } from './phase2-documents.js';",
  'server imports',
);
server = replaceOnce(
  server,
  "    await client.query('COMMIT');\n  } catch (error) {",
  "    await migratePhase2(client);\n    await migratePhase2Documents(client);\n    await client.query('COMMIT');\n  } catch (error) {",
  'database migration',
);
server = server.replace("{ group: 'Blerje & Peshim', phase: 2, active: false", "{ group: 'Blerje & Peshim', phase: 2, active: true");
server = server.replace("{ group: 'Shitje & Magazinë', phase: 2, active: false", "{ group: 'Shitje & Magazinë', phase: 2, active: true");
server = replaceOnce(
  server,
  "app.use((req, res) => res.status(404)",
  "installPhase2Routes({ app, pool, authRequired, requireRoles, assertCompanyAccess, audit, emitTenant });\ninstallPhase2DocumentRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, audit, emitTenant });\n\napp.use((req, res) => res.status(404)",
  'route installation',
);
fs.writeFileSync(serverPath, server);

const migrationPath = 'apps/api/src/run-phase2-migration.js';
let migration = fs.readFileSync(migrationPath, 'utf8');
migration = replaceOnce(migration, "import { migratePhase2 } from './phase2.js';", "import { migratePhase2 } from './phase2.js';\nimport { migratePhase2Documents } from './phase2-documents.js';", 'migration import');
migration = replaceOnce(migration, "  await migratePhase2(pool);", "  await migratePhase2(pool);\n  await migratePhase2Documents(pool);", 'migration execution');
fs.writeFileSync(migrationPath, migration);

const appPath = 'apps/web/src/App.jsx';
let app = fs.readFileSync(appPath, 'utf8');
app = replaceOnce(app, "} from 'lucide-react';", "} from 'lucide-react';\nimport Phase2Page, { PHASE2_TITLES } from './Phase2Pages.jsx';", 'web import');
app = replaceOnce(
  app,
  "  { title: 'Blerje & Peshim — Faza 2', items: [",
  "  { title: 'Regjistra — Faza 2', items: [\n    { id: 'products', label: 'Artikujt', icon: Archive, active: true },\n    { id: 'suppliers', label: 'Furnitorët', icon: Users, active: true },\n    { id: 'customers', label: 'Klientët', icon: UserCog, active: true },\n  ]},\n  { title: 'Blerje & Peshim — Faza 2', items: [",
  'master data navigation',
);
app = app.replace(
  "    { label: 'Formulari i Peshave', icon: Scale }, { label: 'Kërkesa për Ofertë', icon: ClipboardList },\n    { label: 'Porosi Blerjeje', icon: FileSpreadsheet }, { label: 'Pranime', icon: PackageCheck },\n    { label: 'Fatura Blerjeje', icon: Archive },",
  "    { id: 'weights', label: 'Formulari i Peshave', icon: Scale, active: true }, { id: 'purchaseRfq', label: 'Kërkesa për Ofertë', icon: ClipboardList, active: true },\n    { id: 'purchaseOrders', label: 'Porosi Blerjeje', icon: FileSpreadsheet, active: true }, { id: 'purchaseReceipts', label: 'Pranime', icon: PackageCheck, active: true },\n    { id: 'purchaseInvoices', label: 'Fatura Blerjeje', icon: Archive, active: true },",
);
app = app.replace(
  "    { label: 'Oferta & Porosi', icon: Store }, { label: 'Fletë-Dalje', icon: Boxes },\n    { label: 'Fatura Shitjeje', icon: CircleDollarSign }, { label: 'Stoku', icon: Layers3 },",
  "    { id: 'salesQuotes', label: 'Oferta Shitjeje', icon: Store, active: true }, { id: 'salesOrders', label: 'Porosi Shitjeje', icon: ClipboardList, active: true },\n    { id: 'deliveryNotes', label: 'Fletë-Dalje', icon: Boxes, active: true }, { id: 'salesInvoices', label: 'Fatura Shitjeje', icon: CircleDollarSign, active: true }, { id: 'stock', label: 'Stoku', icon: Layers3, active: true },",
);
app = replaceOnce(app, "const titles = { dashboard:", "const titles = { ...PHASE2_TITLES, dashboard:", 'page titles');
app = replaceOnce(app, "    if (page === 'audit') return <AuditLog refreshKey={refreshKey} />;\n    return <Dashboard", "    if (page === 'audit') return <AuditLog refreshKey={refreshKey} />;\n    if (PHASE2_TITLES[page]) return <Phase2Page page={page} />;\n    return <Dashboard", 'phase2 page routing');
app = app.replace('Versioni Cloud Core 1.0', 'Versioni Cloud ERP 2.0');
app = app.replace('FAZA 1 • CLOUD CORE', 'FAZA 2 • OPERACIONET ERP');
app = app.replace('Ky version vendos identitetin, kompanitë, magazinat, rolet, izolimin e të dhënave dhe auditimin. Modulet e dokumenteve migrohen në fazat pasuese.', 'Platforma online tani përfshin regjistrat, peshimin, blerjet, shitjet dhe stokun me transaksione PostgreSQL.');
fs.writeFileSync(appPath, app);

console.log('Integrimi i Fazës 2 u aplikua me sukses.');
