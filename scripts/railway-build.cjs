'use strict';

const { spawnSync } = require('node:child_process');

const serviceName = String(process.env.RAILWAY_SERVICE_NAME || '').toLowerCase();
const isApi = serviceName.includes('api');
const isWeb = serviceName.includes('web');

function run(args) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

if (isApi) {
  console.log(`Railway build dispatcher: ${serviceName || 'genit-api'} -> apps/api`);
  run(['run', 'check', '--workspace', 'apps/api']);
}

console.log(`Railway build dispatcher: ${serviceName || 'genit-web'} -> apps/web`);
run(['run', 'build', '--workspace', 'apps/web']);
