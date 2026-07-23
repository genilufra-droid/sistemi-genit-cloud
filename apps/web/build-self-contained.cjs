'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const WEB_ROOT = __dirname;
const BUILD_SCRIPTS = path.join(WEB_ROOT, 'build-scripts');
const DIST_DIR = path.join(WEB_ROOT, 'dist');
const SOURCE_INDEX = path.join(WEB_ROOT, 'index.html');
const PATCHES = [
  'patch-odoo-traceability.cjs',
  'patch-cloud-context-stability.cjs',
  'patch-cloud-weight-trace-fields.cjs',
  'patch-quick-create-cloud.cjs',
  'patch-cloud-erp.cjs',
  'patch-phase4-traceability.cjs',
  'patch-phase42-masterdata-fallback.cjs',
  'patch-phase4-processing-ui.cjs',
  'patch-phase4-export-logistics-ui.cjs',
  'patch-phase4-export-extensions-ui.cjs',
  'patch-phase5-finance-ui.cjs',
  'patch-phase6-operations-ui.cjs',
  'patch-global-create-cta.cjs',
];
const REQUIRED_MARKERS = [
  'SG_PHASE5_FINANCE_UI_START',
  'SG_PHASE6_OPERATIONS_UI_START',
  'SG_PHASE43_EXPORT_EXTENSIONS_UI_START',
  'SG_GLOBAL_CREATE_CTA_START',
];

function copyWebSource(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    filter(currentPath) {
      const relative = path.relative(source, currentPath);
      if (!relative) return true;
      const firstPart = relative.split(path.sep)[0];
      return !['node_modules', 'dist', 'build-scripts'].includes(firstPart);
    },
  });
}

if (!fs.existsSync(BUILD_SCRIPTS)) {
  throw new Error('Mungon apps/web/build-scripts. Build-i nuk mund të vazhdojë.');
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sistemi-genit-web-'));
const temporaryWeb = path.join(temporaryRoot, 'apps', 'web');
const temporaryScripts = path.join(temporaryRoot, 'scripts');

try {
  fs.mkdirSync(path.dirname(temporaryWeb), { recursive: true });
  copyWebSource(WEB_ROOT, temporaryWeb);
  fs.cpSync(BUILD_SCRIPTS, temporaryScripts, { recursive: true });

  for (const patch of PATCHES) {
    const patchPath = path.join(temporaryScripts, patch);
    if (!fs.existsSync(patchPath)) throw new Error(`Mungon build script: ${patch}`);
    execFileSync(process.execPath, [patchPath], {
      cwd: temporaryWeb,
      env: process.env,
      stdio: 'inherit',
    });
  }

  const builtIndex = path.join(temporaryWeb, 'index.html');
  if (!fs.existsSync(builtIndex) || fs.statSync(builtIndex).size === 0) {
    throw new Error('Build-i nuk prodhoi index.html.');
  }

  const html = fs.readFileSync(builtIndex, 'utf8');
  for (const marker of REQUIRED_MARKERS) {
    if (!html.includes(marker)) throw new Error(`Build-i final nuk përmban ${marker}.`);
  }

  fs.copyFileSync(builtIndex, SOURCE_INDEX);
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.copyFileSync(SOURCE_INDEX, path.join(DIST_DIR, 'index.html'));
  console.log(`Sistemi Genit web build completed: ${path.join(DIST_DIR, 'index.html')}`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
