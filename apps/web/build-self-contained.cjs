'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
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
  'patch-phase85-professional-document-templates.cjs',
  'patch-phase86-exact-document-layouts.cjs',
  'patch-phase87-direct-real-document-tab.cjs',
  'patch-phase88-direct-document-renderer.cjs',
  'patch-phase89-clean-document-tab.cjs',
  'patch-phase91-professional-documents.cjs',
  'patch-phase92-universal-actions.cjs',
  'patch-phase94-partner-id-resolution.cjs',
  'patch-phase95-combo-selection-commit.cjs',
  'patch-phase96-document-fidelity.cjs',
  // Must run last: it binds the live supplier-return screen after legacy views.
  'patch-phase97-cloud-returns.cjs',
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
  'SG_PHASE85_PROFESSIONAL_DOCUMENT_TEMPLATES_START',
  'SG_PHASE86_EXACT_DOCUMENT_LAYOUTS_START',
  'SG_PHASE87_DIRECT_REAL_DOCUMENT_TAB_START',
  'SG_PHASE88_DIRECT_DOCUMENT_RENDERER_START',
  'SG_PHASE89_CLEAN_DOCUMENT_TAB_START',
  'SG_PHASE91_PROFESSIONAL_DOCUMENTS_START',
  'SG_PHASE92_UNIVERSAL_ACTIONS_START',
  'SG_PHASE94_PARTNER_ID_RESOLUTION_START',
  'SG_PHASE95_COMBO_SELECTION_COMMIT_START',
  'SG_PHASE96_DOCUMENT_FIDELITY_START',
  'SG_PHASE97_CLOUD_RETURNS_START',
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

function restorePackedHtmlIfPresent(webRoot) {
  const partsDir = path.join(webRoot, 'html-source-parts');
  if (!fs.existsSync(partsDir)) return false;
  const parts = fs.readdirSync(partsDir)
    .filter((name) => /^br-\d+\.b64$/.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (!parts.length) return false;

  const base64 = parts.map((name) => fs.readFileSync(path.join(partsDir, name), 'utf8')).join('').replace(/\s+/g, '');
  let html;
  try {
    html = zlib.brotliDecompressSync(Buffer.from(base64, 'base64'));
  } catch (error) {
    throw new Error(`Nuk u hap burimi i paketuar: ${error.message}`);
  }
  if (!html || html.length < 1_000_000) throw new Error('Burimi i paketuar HTML është i pavlefshëm.');
  fs.writeFileSync(path.join(webRoot, 'index.html'), html);
  console.log(`Burimi web u rikthye nga ${parts.length} pjesë të paketimit.`);
  return true;
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
  restorePackedHtmlIfPresent(temporaryWeb);
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

  let html = fs.readFileSync(builtIndex, 'utf8');
  // Legacy patchers may append scripts after the closing tags. Normalize the
  // generated document so consecutive Railway builds are valid and repeatable.
  html = html
    .replace(/^\s*<\/body>\s*$/gim, '')
    .replace(/^\s*<\/html>\s*$/gim, '')
    .trimEnd() + '\n</body>\n</html>\n';
  fs.writeFileSync(builtIndex, html);

  for (const marker of REQUIRED_MARKERS) {
    if (!html.includes(marker)) throw new Error(`Build-i final nuk përmban ${marker}.`);
  }
  const finalPhases = [
    'SG_PHASE82_GLOBAL_SEARCH_DOCUMENT_ACTIONS_START',
    'SG_PHASE83_REAL_DOCUMENT_LINKS_START',
    'SG_PHASE85_PROFESSIONAL_DOCUMENT_TEMPLATES_START',
    'SG_PHASE86_EXACT_DOCUMENT_LAYOUTS_START',
    'SG_PHASE87_DIRECT_REAL_DOCUMENT_TAB_START',
    'SG_PHASE88_DIRECT_DOCUMENT_RENDERER_START',
    'SG_PHASE89_CLEAN_DOCUMENT_TAB_START',
    'SG_PHASE91_PROFESSIONAL_DOCUMENTS_START',
    'SG_PHASE92_UNIVERSAL_ACTIONS_START',
    'SG_PHASE94_PARTNER_ID_RESOLUTION_START',
    'SG_PHASE95_COMBO_SELECTION_COMMIT_START',
    'SG_PHASE96_DOCUMENT_FIDELITY_START',
    'SG_PHASE97_CLOUD_RETURNS_START',
  ];
  for (let i = 1; i < finalPhases.length; i += 1) {
    if (html.lastIndexOf(finalPhases[i]) < html.lastIndexOf(finalPhases[i - 1])) {
      throw new Error(`${finalPhases[i]} duhet të jetë pas ${finalPhases[i - 1]}.`);
    }
  }

  fs.copyFileSync(builtIndex, SOURCE_INDEX);
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.copyFileSync(SOURCE_INDEX, path.join(DIST_DIR, 'index.html'));
  console.log(`Sistemi Genit web build completed: ${path.join(DIST_DIR, 'index.html')}`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
