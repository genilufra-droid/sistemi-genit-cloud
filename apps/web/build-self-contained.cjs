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
  'patch-phase61-professional-ui.cjs',
  'patch-phase62-traceability-workflow-ui.cjs',
  'patch-phase62-weight-document-ui.cjs',
  'patch-phase62-lot-label-58mm-ui.cjs',
  'patch-phase62-audit-device-ui.cjs',
  'patch-phase63-traceability-ui-hotfix.cjs',
  'patch-phase64-weight-visible-actions.cjs',
  'patch-phase69-biobes-lot-ui.cjs',
  'patch-phase70-navigation-registry.cjs',
  'patch-phase71-odoo-manufacturing-ui.cjs',
  'patch-phase72-odoo-document-links-ui.cjs',
  'patch-phase73-odoo-shell.cjs',
  'patch-phase74-simple-work-order-ui.cjs',
  'patch-phase75-odoo-inventory-ui.cjs',
  'patch-phase76-inventory-documents-reports-ui.cjs',
  'patch-phase80-document-workspace-help.cjs',
  'patch-phase81-sample-search-create.cjs',
  'patch-phase82-global-search-document-actions.cjs',
  'patch-phase83-real-document-links.cjs',
  'patch-phase84-electronic-archive.cjs',
];
const REQUIRED_MARKERS = [
  'SG_PHASE5_FINANCE_UI_START',
  'SG_PHASE6_OPERATIONS_UI_START',
  'SG_PHASE61_PROFESSIONAL_UI_START',
  'SG_PHASE62_TRACEABILITY_WORKFLOW_UI_START',
  'SG_PHASE62_WEIGHT_DOCUMENT_UI_START',
  'SG_PHASE62_LOT_LABEL_58MM_UI_START',
  'SG_PHASE62_AUDIT_DEVICE_UI_START',
  'SG_PHASE63_TRACEABILITY_UI_HOTFIX_START',
  'SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_START',
  'SG_PHASE69_BIOBES_LOT_UI_START',
  'SG_PHASE70_NAVIGATION_REGISTRY_START',
  'SG_PHASE71_ODOO_MANUFACTURING_UI_START',
  'SG_PHASE72_ODOO_DOCUMENT_LINKS_UI_START',
  'SG_PHASE73_ODOO_SHELL_START',
  'SG_PHASE74_SIMPLE_WORK_ORDER_UI_START',
  'SG_PHASE75_ODOO_INVENTORY_UI_START',
  'SG_PHASE76_INVENTORY_DOCUMENTS_REPORTS_UI_START',
  'SG_PHASE80_DOCUMENT_WORKSPACE_HELP_START',
  'SG_PHASE81_SAMPLE_SEARCH_CREATE_START',
  'SG_PHASE82_GLOBAL_SEARCH_DOCUMENT_ACTIONS_START',
  'SG_PHASE83_REAL_DOCUMENT_LINKS_START',
  'SG_PHASE84_ELECTRONIC_ARCHIVE_START',
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
  if (html.lastIndexOf('SG_PHASE76_INVENTORY_DOCUMENTS_REPORTS_UI_START') < html.lastIndexOf('SG_PHASE75_ODOO_INVENTORY_UI_START')) {
    throw new Error('Phase 7.6 duhet të jetë pas Inventory 7.5.');
  }
  if (html.lastIndexOf('SG_PHASE80_DOCUMENT_WORKSPACE_HELP_START') < html.lastIndexOf('SG_PHASE76_INVENTORY_DOCUMENTS_REPORTS_UI_START')) {
    throw new Error('Phase 8.0 duhet të jetë pas dokumenteve Inventory 7.6.');
  }
  if (html.lastIndexOf('SG_PHASE81_SAMPLE_SEARCH_CREATE_START') < html.lastIndexOf('SG_PHASE80_DOCUMENT_WORKSPACE_HELP_START')) {
    throw new Error('Phase 8.1 duhet të jetë pas dokumenteve dhe Help-it 8.0.');
  }
  if (html.lastIndexOf('SG_PHASE82_GLOBAL_SEARCH_DOCUMENT_ACTIONS_START') < html.lastIndexOf('SG_PHASE81_SAMPLE_SEARCH_CREATE_START')) {
    throw new Error('Phase 8.2 duhet të jetë pas Phase 8.1.');
  }
  if (html.lastIndexOf('SG_PHASE83_REAL_DOCUMENT_LINKS_START') < html.lastIndexOf('SG_PHASE82_GLOBAL_SEARCH_DOCUMENT_ACTIONS_START')) {
    throw new Error('Phase 8.3 duhet të jetë pas Phase 8.2.');
  }
  if (html.lastIndexOf('SG_PHASE84_ELECTRONIC_ARCHIVE_START') < html.lastIndexOf('SG_PHASE83_REAL_DOCUMENT_LINKS_START')) {
    throw new Error('Phase 8.4 duhet të jetë patch-i final pas Phase 8.3.');
  }

  fs.copyFileSync(builtIndex, SOURCE_INDEX);
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.copyFileSync(SOURCE_INDEX, path.join(DIST_DIR, 'index.html'));
  console.log(`Sistemi Genit web build completed: ${path.join(DIST_DIR, 'index.html')}`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
