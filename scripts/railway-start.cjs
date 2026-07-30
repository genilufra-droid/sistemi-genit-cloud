'use strict';

const { spawn } = require('node:child_process');

const serviceName = String(process.env.RAILWAY_SERVICE_NAME || '').toLowerCase();
const configuredKind = String(process.env.GENIT_SERVICE_KIND || '').trim().toLowerCase();

function resolveServiceKind() {
  if (configuredKind) {
    if (configuredKind === 'api' || configuredKind === 'web') return configuredKind;
    throw new Error('GENIT_SERVICE_KIND duhet të jetë vetëm "api" ose "web".');
  }
  const isApi = serviceName.includes('api');
  const isWeb = serviceName.includes('web');
  if (isApi !== isWeb) return isApi ? 'api' : 'web';
  if (!serviceName && !process.env.RAILWAY_ENVIRONMENT_ID) return 'web';
  throw new Error('Railway service nuk identifikohet. Emërtoje genit-api/genit-web ose vendos GENIT_SERVICE_KIND.');
}

const workspace = resolveServiceKind() === 'api' ? 'apps/api' : 'apps/web';

console.log(`Railway start dispatcher: ${serviceName || 'genit-web'} -> ${workspace}`);

const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start', '--workspace', workspace], {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
