'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('dialog', dialog => dialog.accept());

  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4173', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => {
    const visible = element => element && getComputedStyle(element).display !== 'none' && element.getClientRects().length;
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

  const ids = await page.evaluate(async () => {
    const result = await App.SGOdooTrace.createDemoScenario();
    if (!result || !result.lot || !result.sale || !result.batch) throw new Error('Skenari demonstrues nuk ktheu lotin, shitjen dhe Urdhrin e Punës.');
    return {
      lotId: result.lot.id,
      saleId: result.sale.id,
      batchId: result.batch.id,
      lotNumber: result.lot.lotNumber,
      batchNumber: result.batch.batchNumber
    };
  });

  const state = await page.evaluate(async ids => {
    const lot = await DB.get('lots', ids.lotId);
    const sale = await DB.get('salesInvoices', ids.saleId);
    const batch = await DB.get('processBatches', ids.batchId);
    const moves = (await DB.getAll('lotMovements')).filter(row => row.lotId === ids.lotId);
    const inputs = await DB.getByIndex('processBatchInputs', 'batchId', ids.batchId);
    const product = lot ? await DB.get('products', lot.productId) : null;
    App.data.lots = await DB.getAll('lots');
    App.data.lotMovements = await DB.getAll('lotMovements');
    App.data.processBatches = await DB.getAll('processBatches');
    App.data.processBatchInputs = await DB.getAll('processBatchInputs');
    App.data.salesInvoices = await DB.getAll('salesInvoices');
    App.data.products = await DB.getAll('products');
    return {
      lot, sale, batch, moves, inputs, product,
      actions: {
        open: typeof App.openLotOdoo === 'function',
        edit: typeof App.editManualLot === 'function',
        remove: typeof App.deleteManualLot === 'function',
        print: typeof App.printLotOdoo === 'function',
        pdf: typeof App.exportLotOdooPDF === 'function',
        excel: typeof App.exportLotOdooExcel === 'function'
      }
    };
  }, ids);

  if (!state.lot || Number(state.lot.quantityCreated) !== 200 || Number(state.lot.quantityConsumed) !== 50 || Number(state.lot.quantityAvailable) !== 150) throw new Error('Bilanci i lotit nuk është 200 / 50 / 150 kg.');
  if (!state.sale || state.sale.status !== 'POSTED') throw new Error('Fatura demo nuk është POSTED.');
  if (!state.moves.some(move => move.movementType === 'SALE_OUT' && Number(move.quantity) === -50 && Number(move.balanceAfter) === 150)) throw new Error('Lëvizja SALE_OUT -50 / 150 mungon.');
  if (!state.product || Number(state.product.stock) !== 150) throw new Error('Stoku i artikullit nuk është 150 kg.');
  if (!state.batch || state.batch.status !== 'DRAFT' || Number(state.batch.inputQuantity) !== 100 || Number(state.batch.outputQuantity) !== 92) throw new Error('Urdhri i Punës nuk është Draft 100 → 92 kg.');
  if (!state.inputs.length || Number(state.inputs[0].quantity) !== 100) throw new Error('Loti hyrës 100 kg mungon nga Urdhri i Punës.');
  if (Object.values(state.actions).some(value => !value)) throw new Error('Veprimet e lotit nuk janë të plota.');

  await page.evaluate(() => App.view_traceLots());
  await page.waitForSelector(`tr[data-lot-id="${ids.lotId}"]`, { timeout: 30000 });
  await page.evaluate(id => App.openLotOdoo(id), ids.lotId);
  await page.waitForSelector('.sg-odoo-record-header', { state: 'visible', timeout: 30000 });
  const lotText = await page.locator('#modal-box').innerText();
  if (!lotText.includes('200') || !lotText.includes('150') || !lotText.includes('Klienti Demo Herbal')) throw new Error('Kartela e lotit nuk tregon 200 kg, 150 kg dhe klientin.');
  await page.click('#modal-box .modal-close');

  const pdfPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.evaluate(id => App.exportLotOdooPDF(id), ids.lotId);
  const pdf = await pdfPromise;
  if (!pdf.suggestedFilename().toLowerCase().endsWith('.pdf')) throw new Error('Eksporti PDF i lotit dështoi.');

  const outputActions = await page.evaluate(id => {
    let excel = false, print = false;
    const oldSave = window.DesktopIO && DesktopIO.saveWorkbook;
    const oldOpen = window.open;
    if (window.DesktopIO) DesktopIO.saveWorkbook = () => { excel = true; };
    window.open = () => ({ document: { write() { print = true; }, close() {} }, focus() {}, print() { print = true; }, close() {} });
    App.exportLotOdooExcel(id);
    App.printLotOdoo(id);
    if (window.DesktopIO) DesktopIO.saveWorkbook = oldSave;
    window.open = oldOpen;
    return { excel, print };
  }, ids.lotId);
  if (!outputActions.excel || !outputActions.print) throw new Error('Excel ose Print i lotit nuk u ekzekutua.');

  await page.evaluate(() => App.view_traceProcesses());
  await page.waitForSelector(`tr[data-batch-id="${ids.batchId}"]`, { timeout: 30000 });
  await page.evaluate(id => App.openProcessBatch(id), ids.batchId);
  await page.waitForSelector('.sg-odoo-record-header', { state: 'visible', timeout: 30000 });
  const batchText = await page.locator('#modal-box').innerText();
  if (!batchText.includes(ids.batchNumber) || !batchText.includes('100') || !batchText.includes('92')) throw new Error('Kartela e Urdhrit të Punës nuk tregon 100 → 92 kg.');

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ result: 'TEST_SUCCESS', lot: '200 / 50 / 150 kg', sale: 'POSTED', workOrder: 'DRAFT 100 -> 92 kg', pdf: true, excel: true, print: true }, null, 2));
  await browser.close();
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
