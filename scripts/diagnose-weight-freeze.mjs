import fs from 'node:fs';
import { chromium } from 'playwright';

const targetUrl = process.env.TARGET_URL || 'https://genit-web-production.up.railway.app/?diagnostic=weight-freeze';
const outputPath = process.env.DIAGNOSTIC_OUTPUT || '/tmp/weight-freeze-result.json';
const screenshotPath = process.env.DIAGNOSTIC_SCREENSHOT || '/tmp/weight-freeze-diagnostic.png';
const report = {
  targetUrl,
  startedAt: new Date().toISOString(),
  success: false,
  heartbeats: [],
  actions: [],
  messages: [],
};

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.setDefaultTimeout(15000);

page.on('console', (message) => {
  report.messages.push(`[console:${message.type()}] ${message.text()}`);
});
page.on('pageerror', (error) => {
  report.messages.push(`[pageerror] ${error && error.stack ? error.stack : String(error)}`);
});
page.on('requestfailed', (request) => {
  const failure = request.failure();
  report.messages.push(`[requestfailed] ${request.method()} ${request.url()} ${failure ? failure.errorText : ''}`);
});

async function heartbeat(label) {
  const started = Date.now();
  const state = await page.evaluate(() => new Promise((resolve) => {
    setTimeout(() => resolve({
      currentView: window.App && window.App.currentView,
      readyState: document.readyState,
      contentLength: document.body ? document.body.innerText.length : 0,
      weightDocumentCount: document.querySelectorAll('.sg62-weight-document').length,
      weightListActionCount: document.querySelectorAll('#sg64-weight-list-actions').length,
      weightFormActionCount: document.querySelectorAll('#sg64-weight-form-actions').length,
    }), 100);
  }));
  const elapsedMs = Date.now() - started;
  report.heartbeats.push({ label, elapsedMs, state });
  console.log(`[heartbeat:${label}] ${elapsedMs}ms ${JSON.stringify(state)}`);
}

async function clickVisibleText(text) {
  const locator = page.getByText(text, { exact: true }).filter({ visible: true }).first();
  const count = await locator.count();
  if (!count) {
    report.actions.push({ action: 'click', text, result: 'not-found' });
    console.log(`[skip] Text not found: ${text}`);
    return false;
  }
  await locator.click();
  report.actions.push({ action: 'click', text, result: 'clicked' });
  return true;
}

try {
  console.log(`[open] ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  await heartbeat('after-load');

  report.diagnostic = await page.evaluate(() => ({
    title: document.title,
    href: location.href,
    appAvailable: Boolean(window.App),
    currentView: window.App && window.App.currentView,
    phase64Loaded: Boolean(window.__SG_PHASE64_WEIGHT_VISIBLE_ACTIONS__),
    mutationObserverSourcePresent: document.documentElement.innerHTML.includes('MutationObserver'),
    phase64MarkerCount: (document.documentElement.innerHTML.match(/SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_START/g) || []).length,
  }));
  console.log(`[diagnostic] ${JSON.stringify(report.diagnostic)}`);

  const openedList = await clickVisibleText('Formulari i Peshave');
  if (openedList) {
    await page.waitForTimeout(1500);
    await heartbeat('after-weight-list');
  }

  const openedForm = await clickVisibleText('＋ Shto Formular Peshimi') || await clickVisibleText('Shto Formular Peshimi');
  if (openedForm) {
    await page.waitForTimeout(1500);
    await heartbeat('after-new-weight-form');
  }

  report.finalState = await page.evaluate(() => ({
    currentView: window.App && window.App.currentView,
    bodyClass: document.body ? document.body.className : '',
    contentHtmlLength: document.getElementById('content') ? document.getElementById('content').innerHTML.length : 0,
    saveButtons: document.querySelectorAll('[data-sg64-save-weight]').length,
  }));
  report.success = true;
  console.log(`[final] ${JSON.stringify(report.finalState)}`);
} catch (error) {
  report.error = error && error.stack ? error.stack : String(error);
  console.error(`[diagnostic-failed] ${report.error}`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  for (const line of report.messages.slice(-100)) console.log(line);
  await browser.close();
}
