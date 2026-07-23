'use strict';
const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '../apps/web/cloud-erp-adapter.js');
let source = fs.readFileSync(target, 'utf8');

const warehouseAnchor = `  function selectedWarehouseId(companyId) {
    var list = (bootstrapData && bootstrapData.warehouses || []).map(camel).filter(function (w) { return !companyId || w.companyId === companyId; });
    var allowed = access.warehouseIds || [];
    if (allowed.length) list = list.filter(function (w) { return allowed.indexOf(w.id) >= 0; });
    var saved = storageGet(ACTIVE_WAREHOUSE_KEY);
    return list.some(function (w) { return w.id === saved; }) ? saved : (list[0] && list[0].id || '');
  }`;

const companyGuard = `${warehouseAnchor}

  var cloudCompanyGuardInstalled = false;
  var cloudCompanyValue = App.company || null;
  function installCloudCompanyGuard() {
    if (cloudCompanyGuardInstalled) return;
    cloudCompanyGuardInstalled = true;
    cloudCompanyValue = App.company || null;
    Object.defineProperty(App, 'company', {
      configurable: true,
      enumerable: true,
      get: function () { return cloudCompanyValue; },
      set: function (value) {
        if (bootstrapData && currentUser) {
          var expectedCompanyId = selectedCompanyId();
          if (!value || !expectedCompanyId || value.id === expectedCompanyId) cloudCompanyValue = value;
          return;
        }
        cloudCompanyValue = value;
      }
    });
  }`;

if (source.includes(warehouseAnchor) && !source.includes('function installCloudCompanyGuard()')) {
  source = source.replace(warehouseAnchor, companyGuard);
} else if (!source.includes('function installCloudCompanyGuard()')) {
  throw new Error('Mungon pika e instalimit të guard-it të kompanisë Cloud.');
}

const oldBlock = `  async function startApplication() {
    await loadBootstrap();
    var root = document.getElementById('auth-root');
    var shell = document.getElementById('app-shell');
    if (root) root.style.display = 'none';
    if (shell) shell.style.display = 'flex';
    await App.init();
    applyBootstrapToApp();
    App.navigate('dashboard');
    if (App.applyAuthUI) App.applyAuthUI();
  }`;

const previousBlock = `  function stabilizeCloudContext() {
    if (!bootstrapData) return;
    applyBootstrapToApp();
    if (App.applyAuthUI) App.applyAuthUI();
  }

  async function startApplication() {
    await loadBootstrap();
    var root = document.getElementById('auth-root');
    var shell = document.getElementById('app-shell');
    if (root) root.style.display = 'none';
    if (shell) shell.style.display = 'flex';
    await App.init();
    stabilizeCloudContext();
    App.navigate('dashboard');
    stabilizeCloudContext();
    setTimeout(stabilizeCloudContext, 0);
    setTimeout(stabilizeCloudContext, 150);
    setTimeout(stabilizeCloudContext, 600);
  }`;

const newBlock = `  function stabilizeCloudContext(updateAuthUi) {
    if (!bootstrapData) return;
    applyBootstrapToApp();
    if (updateAuthUi && App.applyAuthUI) App.applyAuthUI();
  }

  async function startApplication() {
    await loadBootstrap();
    installCloudCompanyGuard();
    var root = document.getElementById('auth-root');
    var shell = document.getElementById('app-shell');
    if (root) root.style.display = 'none';
    if (shell) shell.style.display = 'flex';
    await App.init();
    stabilizeCloudContext(true);
    App.navigate('dashboard');
    stabilizeCloudContext(false);
    setTimeout(function () { stabilizeCloudContext(false); }, 0);
    setTimeout(function () { stabilizeCloudContext(false); }, 150);
    setTimeout(function () { stabilizeCloudContext(false); }, 600);
  }`;

if (source.includes(oldBlock)) source = source.replace(oldBlock, newBlock);
else if (source.includes(previousBlock)) source = source.replace(previousBlock, newBlock);
else if (!source.includes(newBlock)) throw new Error('Mungon blloku startApplication i Cloud adapter-it.');

fs.writeFileSync(target, source);
const check = fs.readFileSync(target, 'utf8');
if (!check.includes('function installCloudCompanyGuard()') || !check.includes('stabilizeCloudContext(false)') || !check.includes("Object.defineProperty(App, 'company'")) {
  throw new Error('Guard-i autoritativ i kompanisë Cloud nuk u aplikua.');
}
if (/setTimeout\(stabilizeCloudContext/.test(check)) throw new Error('Stabilizimi i vjetër që rifreskon UI-në mbeti aktiv.');
console.log('Cloud company guard applied without rerendering active forms.');
