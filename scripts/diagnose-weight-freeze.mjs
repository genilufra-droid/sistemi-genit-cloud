import { chromium } from 'playwright';

const targetUrl = process.env.TARGET_URL || 'https://genit-web-production.up.railway.app/?diagnostic=weight-freeze';
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.setDefaultTimeout(15000);

const messages = [];
page.on('console', (message) => {
  messages.push(`[console:${message.type()}] ${message.text()}`);
});
page.on('pageerror', (error) => {
  messages.push(`[pageerror] ${error && error.stack ? error.stack : String(error)}`);
});
page.on('requestfailed', (request) => {
  const failure = request.failure();
  messages.push(`[requestfailed] ${request.method()} ${request.url()} ${failure ? failure.errorText : ''}`);
});

async function heartbeat(label) {
  const started = Date.now();
  const result = await page.evaluate(() => new Promise((resolve) => {
    setTimeout(() => resolve({
      currentView: window.App && window.App.currentView,
      readyState: document.readyState,
      contentLength: document.body ? document.body.innerText.length : 0,
      weightDocumentCount: document.querySelectorAll('.sg62-weight-document').length,
      weightListActionCount: document.querySelectorAll('#sg64-weight-list-actions').length,
      weightFormActionCount: document.querySelectorAll('#sg64-weight-form-actions').length,
    }), 100);
  }));
  console.log(`[heartbeat:${label}] ${Date.now() - started}ms ${JSON.stringify(result)}`);
}

async function clickVisibleText(text) {
  const locator = page.getByText(text, { exact: true }).filter({ visible: true }).first();
  const count = await locator.count();
  if (!count) {
    console.log(`[skip] Text not found: ${text}`);
    return false;
  }
  await locator.click();
  return true;
}

try {
  console.log(`[open] ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  await heartbeat('after-load');

  const diagnostic = await page.evaluate(() => ({
    title: document.title,
    href: location.href,
    appAvailable: Boolean(window.App),
    currentView: window.App && window.App.currentView,
    phase64Loaded: Boolean(window.__SG_PHASE64_WEIGHT_VISIBLE_ACTIONS__),
    mutationObserverSourcePresent: document.documentElement.innerHTML.includes('MutationObserver'),
    phase64MarkerCount: (document.documentElement.innerHTML.match(/SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_START/g) || []).length,
  }));
  console.log(`[diagnostic] ${JSON.stringify(diagnostic)}`);

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

  const finalState = await page.evaluate(() => ({
    currentView: window.App && window.App.currentView,
    bodyClass: document.body ? document.body.className : '',
    contentHtmlLength: document.getElementById('content') ? document.getElementById('content').innerHTML.length : 0,
    saveButtons: document.querySelectorAll('[data-sg64-save-weight]').length,
  }));
  console.log(`[final] ${JSON.stringify(finalState)}`);
} catch (error) {
  console.error(`[diagnostic-failed] ${error && error.stack ? error.stack : String(error)}`);
  for (const line of messages.slice(-100)) console.error(line);
  await page.screenshot({ path: '/tmp/weight-freeze-diagnostic.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  for (const line of messages.slice(-100)) console.log(line);
  await browser.close();
}
