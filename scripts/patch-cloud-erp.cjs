'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps/web/index.html');
const jsPath = path.join(root, 'apps/web/cloud-erp-adapter.js');
const cssPath = path.join(root, 'apps/web/cloud-erp-adapter.css');
const start = '<!-- SG_CLOUD_ERP_ADAPTER_START -->';
const end = '<!-- SG_CLOUD_ERP_ADAPTER_END -->';

let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const apiUrl = String(process.env.VITE_API_URL || process.env.GENIT_API_URL || '').replace(/\/+$/, '');
const requiredEnv = process.env.GENIT_CLOUD_REQUIRED;
const required = requiredEnv == null || requiredEnv === '' ? Boolean(apiUrl) : String(requiredEnv).toLowerCase() !== 'false';
const config = JSON.stringify({ apiUrl, required, build: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local' }).replace(/</g, '\\u003c');
const block = `${start}\n<style id="sg-cloud-erp-adapter-style">\n${css}\n</style>\n<script id="sg-cloud-erp-config">window.__GENIT_CLOUD_CONFIG__=${config};</script>\n<script id="sg-cloud-erp-adapter-script">\n${js}\n</script>\n${end}`;

const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
html = html.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, 'g'), '');
const bodyIndex = html.toLowerCase().lastIndexOf('</body>');
if (bodyIndex < 0) throw new Error('Mungon </body> në apps/web/index.html');
html = html.slice(0, bodyIndex) + block + '\n' + html.slice(bodyIndex);
fs.writeFileSync(htmlPath, html);

const check = fs.readFileSync(htmlPath, 'utf8');
if ((check.match(/SG_CLOUD_ERP_ADAPTER_START/g) || []).length !== 1) throw new Error('Cloud patch nuk është idempotent.');
if (!check.includes('cloud-first-admin-form')) throw new Error('Formulari qendror i administratorit mungon.');
if (!check.includes('CLOUD_POSTGRESQL') && !check.includes('CloudERP')) throw new Error('Adapteri Cloud mungon.');
if (!check.includes(`"apiUrl":"${apiUrl.replace(/"/g, '\\"')}"`)) throw new Error('API URL nuk u injektua në HTML.');
const markerIndex = check.indexOf(start);
const finalBodyIndex = check.toLowerCase().lastIndexOf('</body>');
if (markerIndex < 0 || markerIndex > finalBodyIndex) throw new Error('Cloud patch nuk u vendos para </body> të fundit.');
console.log(`Cloud patched ${htmlPath}: API=${apiUrl || '(missing)'}; required=${required}; ${Buffer.byteLength(check)} bytes`);
