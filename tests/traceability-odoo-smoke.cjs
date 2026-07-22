'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('dialog', async d => { await d.accept(); });

  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4173', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => {
    const visible = el => el && getComputedStyle(el).display !== 'none' && el.getClientRects().length;
    return visible(document.querySelector('#first-admin-form')) || visible(document.querySelector('#login-form')) || visible(document.querySelector('#app-shell'));
  }, null, { timeout: 30000 });

  if (await page.locator('#first-admin-form:visible').count()) {
    await page.fill('#setup-display-name', 'Administrator Test');
    await page.fill('#setup-username', 'admin_test');
    await page.fill('#setup-password', 'AdminTest123');
    await page.fill('#setup-password-confirm', 'AdminTest123');
    await page.click('#first-admin-form button[type="submit"]');
  }
  if (await page.locator('#login-form:visible').count()) {
    await page.fill('#login-username', 'admin_test');
    await page.fill('#login-password', 'AdminTest123');
    await page.click('#login-form button[type="submit"]');
  }
  await page.waitForSelector('#app-shell', { state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.App && window.DB && window.App.SGOdooTrace), null, { timeout: 30000 });

  await page.locator('.nav-item[data-view="traceLots"]').evaluate(el => el.click());
  await page.waitForSelector('#sg-new-lot-btn', { state: 'visible' });
  await page.waitForSelector('#sg-demo-trace-btn', { state: 'visible' });
  await page.click('#sg-demo-trace-btn');

  const ids = await page.evaluate(() => {
    const d = App.SGOdooTrace.DEMO;
    return { lotId: d.lotId, saleId: d.saleId, batchId: d.batchId, lotNumber: d.lotNumber, batchNumber: d.batchNumber };
  });
  await page.waitForSelector(`tr[data-lot-id="${ids.lotId}"]`, { timeout: 30000 });
  await page.waitForSelector('.sg-odoo-record-header', { state: 'visible', timeout: 30000 });
  const modalText = await page.locator('#modal-box').innerText();
  if (!modalText.includes('200') || !modalText.includes('150') || !modalText.includes('Klienti Demo Herbal')) throw new Error('Kartela e lotit nuk tregon hyrjen 200 kg, gjendjen 150 kg dhe klientin demo.');
  await page.click('#modal-box .modal-close');

  const state = await page.evaluate(async ids => {
    const lot = await DB.get('lots', ids.lotId);
    const sale = await DB.get('salesInvoices', ids.saleId);
    const batch = await DB.get('processBatches', ids.batchId);
    const moves = (await DB.getAll('lotMovements')).filter(x => x.lotId === ids.lotId);
    const inputs = await DB.getByIndex('processBatchInputs', 'batchId', ids.batchId);
    const product = await DB.get('products', lot.productId);
    return {
      lot, sale, batch, moves, inputs, product,
      actions: {
        open: typeof App.openLotOdoo === 'function', edit: typeof App.editManualLot === 'function',
        remove: typeof App.deleteManualLot === 'function', print: typeof App.printLotOdoo === 'function',
        pdf: typeof App.exportLotOdooPDF === 'function', excel: typeof App.exportLotOdooExcel === 'function'
      }
    };
  }, ids);

  if (!state.lot || state.lot.quantityCreated !== 200 || state.lot.quantityAvailable !== 150 || state.lot.quantityConsumed !== 50) throw new Error('Bilanci i lotit nuk është 200 / 50 / 150 kg.');
  if (!state.sale || state.sale.status !== 'POSTED') throw new Error('Fatura demo nuk është POSTED.');
  if (!state.moves.some(m => m.movementType === 'SALE_OUT' && Number(m.quantity) === -50 && Number(m.balanceAfter) === 150)) throw new Error('Lëvizja SALE_OUT -50 / balance 150 mungon.');
  if (!state.product || Number(state.product.stock) !== 150) throw new Error('Stoku i artikullit nuk është 150 kg.');
  if (!state.batch || state.batch.status !== 'DRAFT' || Number(state.batch.inputQuantity) !== 100 || Number(state.batch.outputQuantity) !== 92) throw new Error('Urdhri i Punës Draft nuk është 100 → 92 kg.');
  if (!state.inputs.length || Number(state.inputs[0].quantity) !== 100) throw new Error('Loti hyrës 100 kg mungon në Urdhrin e Punës.');
  if (Object.values(state.actions).some(v => !v)) throw new Error('Një ose më shumë veprime të lotit mungojnë.');

  const pdfPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.evaluate(id => App.exportLotOdooPDF(id), ids.lotId);
  const pdfDownload = await pdfPromise;
  if (!pdfDownload.suggestedFilename().toLowerCase().endsWith('.pdf')) throw new Error('Eksporti PDF nuk prodhoi skedar PDF.');

  const actionChecks = await page.evaluate(id => {
    let excelCalled = false, printCalled = false;
    const originalSave = window.DesktopIO && DesktopIO.saveWorkbook;
    const originalOpen = window.open;
    if (window.DesktopIO) DesktopIO.saveWorkbook = function () { excelCalled = true; };
    window.open = function () { return { document: { write() { printCalled = true; }, close() {} }, focus() {}, print() { printCalled = true; }, close() {} }; };
    App.exportLotOdooExcel(id); App.printLotOdoo(id);
    if (window.DesktopIO) DesktopIO.saveWorkbook = originalSave;
    window.open = originalOpen;
    return { excelCalled, printCalled };
  }, ids.lotId);
  if (!actionChecks.excelCalled || !actionChecks.printCalled) throw new Error('Veprimi Excel ose Print nuk u ekzekutua.');

  await page.locator('.nav-item[data-view="traceProcesses"]').evaluate(el => el.click());
  await page.waitForSelector('#sg-new-work-order-btn', { state: 'visible' });
  await page.waitForSelector(`tr[data-batch-id="${ids.batchId}"]`, { timeout: 15000 });
  await page.locator(`tr[data-batch-id="${ids.batchId}"] .sg-eye-btn`).click();
  await page.waitForSelector('.sg-odoo-record-header', { state: 'visible' });
  const batchText = await page.locator('#modal-box').innerText();
  if (!batchText.includes(ids.batchNumber) || !batchText.includes('100') || !batchText.includes('92')) throw new Error('Kartela e Urdhrit të Punës nuk tregon 100 → 92 kg.');

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ result: 'TEST_SUCCESS', lot: '200 kg', sold: '50 kg', balance: '150 kg', workOrder: '100 -> 92 kg', ids }, null, 2));
  await browser.close();
})().catch(error => { console.error(error.stack || error.message || error); process.exit(1); });
