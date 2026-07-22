import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const webUrl = String(process.env.WEB_URL || 'https://genit-web-production.up.railway.app/');
const expectedCommit = String(process.env.EXPECTED_COMMIT || '14165789188bf58ea479acba89ab37c2a63c61a5');
const outputDir = '/tmp/phase3-production';
const reportPath = `${outputDir}/report.json`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
}

await fs.mkdir(outputDir, { recursive: true });
const startedAt = new Date().toISOString();
let report;

try {
  let html = '';
  let attemptUsed = 0;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    attemptUsed = attempt;
    const cache = `phase3-${expectedCommit}-${attempt}-${Date.now()}`;
    try {
      const result = await fetchText(`${webUrl}?v=${encodeURIComponent(cache)}`, {
        headers: { 'Cache-Control': 'no-cache' },
        redirect: 'follow',
      });
      html = result.text;
      if (html.includes('SG_CLOUD_ERP_ADAPTER_START') && html.includes('cloud-first-admin-form')) break;
    } catch (error) {
      console.error(`Attempt ${attempt}: ${error.message}`);
    }
    html = '';
    await sleep(10000);
  }
  if (!html) throw new Error('Railway nuk publikoi HTML-në Cloud brenda afatit.');

  const configMatch = html.match(/window\.__GENIT_CLOUD_CONFIG__=(\{[^<]+\});<\/script>/);
  if (!configMatch) throw new Error('Konfigurimi Cloud mungon nga HTML-ja live.');
  const config = JSON.parse(configMatch[1]);
  if (!config.apiUrl) throw new Error('VITE_API_URL është bosh në deploy-in live.');
  if (config.required !== true) throw new Error('GENIT_CLOUD_REQUIRED nuk është true në deploy-in live.');
  const apiUrl = String(config.apiUrl).replace(/\/+$/, '');

  const healthResult = await fetchText(`${apiUrl}/api/health`);
  const health = JSON.parse(healthResult.text);
  if (health.status !== 'ok') throw new Error('API health nuk është ok.');

  const setupResult = await fetchText(`${apiUrl}/api/setup/status`);
  const setupStatus = JSON.parse(setupResult.text);
  if (typeof setupStatus.needsSetup !== 'boolean') throw new Error('API setup/status nuk ktheu needsSetup boolean.');

  const corsResult = await fetch(`${apiUrl}/api/setup/status`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://genit-web-production.up.railway.app',
      'Access-Control-Request-Method': 'GET',
    },
  });
  if (![200, 204].includes(corsResult.status)) throw new Error(`CORS preflight dështoi: HTTP ${corsResult.status}.`);

  const hash = crypto.createHash('sha256').update(html).digest('hex');
  await fs.writeFile(`${outputDir}/live.html`, html);
  await fs.writeFile(`${outputDir}/config.json`, JSON.stringify(config, null, 2));
  await fs.writeFile(`${outputDir}/health.json`, JSON.stringify(health, null, 2));
  await fs.writeFile(`${outputDir}/setup-status.json`, JSON.stringify(setupStatus, null, 2));

  report = {
    result: 'PRODUCTION_SUCCESS',
    startedAt,
    verifiedAt: new Date().toISOString(),
    webUrl,
    apiUrl,
    expectedCommit,
    deployedBuild: config.build || null,
    htmlBytes: Buffer.byteLength(html),
    htmlSha256: hash,
    cloudRequired: true,
    setupStatus,
    health,
    corsStatus: corsResult.status,
    attempts: attemptUsed,
  };
} catch (error) {
  report = {
    result: 'PRODUCTION_FAILED',
    startedAt,
    verifiedAt: new Date().toISOString(),
    webUrl,
    expectedCommit,
    error: error.stack || error.message || String(error),
  };
  process.exitCode = 1;
}

await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
