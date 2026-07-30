import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = (relativePath) => JSON.parse(read(relativePath));

for (const legacyConfig of ['apps/api/railway.toml', 'apps/web/railway.toml']) {
  assert.ok(!fs.existsSync(path.join(root, legacyConfig)), `${legacyConfig} nuk duhet të konfliktojë me railway.json.`);
}

const apiRailway = json('apps/api/railway.json');
assert.equal(apiRailway.deploy.healthcheckPath, '/api/health');
assert.match(apiRailway.deploy.startCommand, /npm start/);
const webRailway = json('apps/web/railway.json');
assert.equal(webRailway.build.builder, 'DOCKERFILE');
assert.equal(webRailway.deploy.healthcheckPath, '/healthz');

const dockerfile = read('apps/web/Dockerfile');
for (const required of ['ARG VITE_API_URL', 'ARG GENIT_CLOUD_REQUIRED=true', 'SG_PHASE96_DOCUMENT_FIDELITY_START', 'SG_PHASE97_CLOUD_RETURNS_START']) {
  assert.ok(dockerfile.includes(required), `Docker build-i duhet të përfshijë ${required}.`);
}
assert.ok(read('apps/web/.env.example').includes('GENIT_CLOUD_REQUIRED=true'), 'Web-i duhet të refuzojë fallback-un demo në prodhim.');

const buildDispatcher = read('scripts/railway-build.cjs');
const startDispatcher = read('scripts/railway-start.cjs');
for (const source of [buildDispatcher, startDispatcher]) {
  assert.ok(source.includes('GENIT_SERVICE_KIND'), 'Dispatcher-i duhet të lejojë zgjedhje të qartë të shërbimit.');
  assert.ok(source.includes('RAILWAY_SERVICE_NAME'), 'Dispatcher-i duhet të verifikojë emrin e shërbimit.');
  assert.ok(source.includes('nuk identifikohet'), 'Dispatcher-i duhet të dështojë qartë për shërbim të paqartë.');
}

const launcher = read('apps/api/src/phase76-launcher.js');
assert.ok(launcher.indexOf('await migratePhase76InventoryReports(pool);') < launcher.indexOf('deferredListen.originalListen.apply'), 'Migrimet e raporteve duhet të kryhen para listen.');
assert.ok(launcher.indexOf('await migrateElectronicArchive(pool);') < launcher.indexOf('deferredListen.originalListen.apply'), 'Migrimet e arkivës duhet të kryhen para listen.');

const documents = read('apps/api/src/phase2-documents.js');
for (const required of ['PURCHASE_RETURN', 'SALES_RETURN', 'returnableItems', 'Sasia e kthimit']) {
  assert.ok(documents.includes(required), `Rrjedha e kthimeve mungon: ${required}.`);
}

console.log('DEPLOYMENT_CONTRACT_SUCCESS apiHealth=/api/health webHealth=/healthz cloudRequired=true');
