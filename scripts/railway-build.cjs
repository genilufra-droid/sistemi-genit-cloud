'use strict';

const { spawnSync } = require('node:child_process');

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

const serviceKind = resolveServiceKind();

function run(args) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

if (serviceKind === 'api') {
  console.log(`Railway build dispatcher: ${serviceName || 'genit-api'} -> apps/api`);
  run(['run', 'check', '--workspace', 'apps/api']);
}

console.log(`Railway build dispatcher: ${serviceName || 'genit-web'} -> apps/web`);
run(['run', 'build', '--workspace', 'apps/web']);
