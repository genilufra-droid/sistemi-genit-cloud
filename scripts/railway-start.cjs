'use strict';

const { spawn } = require('node:child_process');

const serviceName = String(process.env.RAILWAY_SERVICE_NAME || '').toLowerCase();
const workspace = serviceName.includes('api') ? 'apps/api' : 'apps/web';

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
