'use strict';
const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '../apps/web/cloud-erp-adapter.js');
let source = fs.readFileSync(target, 'utf8');

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

const newBlock = `  function stabilizeCloudContext() {
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

if (source.includes(oldBlock)) source = source.replace(oldBlock, newBlock);
else if (!source.includes(newBlock)) throw new Error('Mungon blloku startApplication i Cloud adapter-it.');

fs.writeFileSync(target, source);
const check = fs.readFileSync(target, 'utf8');
if (!check.includes('function stabilizeCloudContext()') || !check.includes('setTimeout(stabilizeCloudContext, 600)')) {
  throw new Error('Stabilizimi i kontekstit Cloud nuk u aplikua.');
}
console.log('Cloud company context stabilization applied.');
