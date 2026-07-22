'use strict';
const http = require('node:http');
const { chromium } = require('playwright');

const ids = {
  tenant: '11111111-1111-4111-8111-111111111111',
  company: '22222222-2222-4222-8222-222222222222',
  warehouse: '33333333-3333-4333-8333-333333333333',
  user: '44444444-4444-4444-8444-444444444444',
  product: '55555555-5555-4555-8555-555555555555',
  category: '66666666-6666-4666-8666-666666666666',
  supplier: '77777777-7777-4777-8777-777777777777'
};

const state = {
  needsSetup: true,
  token: 'cloud-test-token',
  setupCalls: 0,
  bootstrapCalls: 0,
  productWrites: [],
  partnerWrites: [],
  products: [],
  partners: []
};

const user = {
  id: ids.user,
  tenantId: ids.tenant,
  fullName: 'Administrator Cloud',
  username: 'admin_cloud',
  email: 'admin@genit.test',
  role: 'SUPER_ADMIN',
  active: true,
  mustChangePassword: false,
  version: 1
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function authorized(req) {
  return req.headers.authorization === `Bearer ${state.token}`;
}

function bootstrapPayload() {
  return {
    user,
    access: { companyIds: [ids.company], warehouseIds: [ids.warehouse] },
    companies: [{ id: ids.company, name: 'Kompania Cloud Test', nipt: 'L12345678A', currency: 'ALL', active: true, version: 1 }],
    warehouses: [{ id: ids.warehouse, company_id: ids.company, code: 'MQ', name: 'Magazina Qendrore', active: true, version: 1 }],
    categories: [{ id: ids.category, company_id: ids.company, code: 'BIME', name: 'Bimë', active: true, version: 1 }],
    products: state.products,
    partners: state.partners,
    weights: [],
    stock: state.products.map(product => ({ company_id: ids.company, warehouse_id: ids.warehouse, product_id: product.id, code: product.code, name: product.name, base_unit: product.base_unit, quantity_base: '0' })),
    documents: [],
    users: [{ ...user, tenant_id: ids.tenant, full_name: user.fullName, company_ids: [ids.company], warehouse_ids: [ids.warehouse] }],
    audit: [],
    revision: state.setupCalls + state.productWrites.length + state.partnerWrites.length,
    serverTime: new Date().toISOString()
  };
}

const api = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, 'http://127.0.0.1:3100');
  try {
    if (req.method === 'GET' && url.pathname === '/api/setup/status') {
      return json(res, 200, { needsSetup: state.needsSetup });
    }
    if (req.method === 'POST' && url.pathname === '/api/setup/admin') {
      const body = await readBody(req);
      if (!state.needsSetup) return json(res, 409, { error: 'SETUP_LOCKED', message: 'Administratori i parë është krijuar tashmë.' });
      if (!body.organizationName || !body.companyName || !body.warehouseName || !body.username || !body.password) {
        return json(res, 400, { error: 'VALIDATION_ERROR', message: 'Të dhënat e konfigurimit mungojnë.' });
      }
      state.needsSetup = false;
      state.setupCalls += 1;
      return json(res, 201, { token: state.token, user, companyId: ids.company, warehouseId: ids.warehouse });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      return json(res, 200, { token: state.token, user });
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      if (!authorized(req)) return json(res, 401, { error: 'AUTH_REQUIRED', message: 'Duhet të identifikoheni.' });
      return json(res, 200, { user, companyIds: [ids.company], warehouseIds: [ids.warehouse] });
    }
    if (req.method === 'GET' && url.pathname === '/api/cloud/bootstrap') {
      if (!authorized(req)) return json(res, 401, { error: 'AUTH_REQUIRED', message: 'Duhet të identifikoheni.' });
      state.bootstrapCalls += 1;
      return json(res, 200, bootstrapPayload());
    }
    if (req.method === 'GET' && ['/api/trace/farms', '/api/trace/parcels', '/api/trace/lots', '/api/weights'].includes(url.pathname)) {
      if (!authorized(req)) return json(res, 401, { error: 'AUTH_REQUIRED', message: 'Duhet të identifikoheni.' });
      return json(res, 200, []);
    }
    if (req.method === 'GET' && url.pathname === '/api/users') {
      if (!authorized(req)) return json(res, 401, { error: 'AUTH_REQUIRED', message: 'Duhet të identifikoheni.' });
      return json(res, 200, [user]);
    }
    if (req.method === 'POST' && url.pathname === '/api/products') {
      if (!authorized(req)) return json(res, 401, { error: 'AUTH_REQUIRED', message: 'Duhet të identifikoheni.' });
      const body = await readBody(req);
      state.productWrites.push(body);
      const row = {
        id: ids.product,
        tenant_id: ids.tenant,
        company_id: ids.company,
        category_id: body.categoryId || null,
        category_name: body.categoryId ? 'Bimë' : null,
        code: body.code,
        barcode: body.barcode || null,
        name: body.name,
        base_unit: body.baseUnit,
        pack_unit: body.packUnit,
        pallet_unit: body.palletUnit,
        pack_coefficient: body.packCoefficient,
        pallet_coefficient: body.palletCoefficient,
        purchase_price: body.purchasePrice,
        sale_price: body.salePrice,
        vat_rate: body.vatRate,
        active: true,
        version: 1
      };
      state.products = [row];
      return json(res, 201, row);
    }
    if (req.method === 'POST' && url.pathname === '/api/partners') {
      if (!authorized(req)) return json(res, 401, { error: 'AUTH_REQUIRED', message: 'Duhet të identifikoheni.' });
      const body = await readBody(req);
      state.partnerWrites.push(body);
      const row = {
        id: ids.supplier,
        tenant_id: ids.tenant,
        company_id: ids.company,
        partner_type: body.partnerType,
        code: body.code,
        name: body.name,
        nipt: body.nipt || null,
        address: body.address || null,
        city: body.city || null,
        phone: body.phone || null,
        email: body.email || null,
        credit_limit: body.creditLimit || 0,
        active: true,
        version: 1
      };
      state.partners = [row];
      return json(res, 201, row);
    }
    return json(res, 404, { error: 'NOT_FOUND', message: `${req.method} ${url.pathname}` });
  } catch (error) {
    return json(res, 500, { error: 'TEST_SERVER_ERROR', message: error.message });
  }
});

(async () => {
  await new Promise((resolve, reject) => api.listen(3100, '127.0.0.1', error => error ? reject(error) : resolve()));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('dialog', dialog => dialog.accept());

  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4173', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#cloud-first-admin-form', { state: 'visible', timeout: 30000 });
  const setupText = await page.locator('#auth-root').innerText();
  if (!setupText.includes('vetëm një herë në PostgreSQL')) throw new Error('Konfigurimi i parë nuk shpjegon ruajtjen qendrore.');

  await page.fill('#setup-organization', 'Genit Test');
  await page.fill('#setup-company', 'Kompania Cloud Test');
  await page.fill('#setup-nipt', 'L12345678A');
  await page.fill('#setup-warehouse', 'Magazina Qendrore');
  await page.fill('#setup-display-name', 'Administrator Cloud');
  await page.fill('#setup-username', 'admin_cloud');
  await page.fill('#setup-email', 'admin@genit.test');
  await page.fill('#setup-password', 'AdminCloud123');
  await page.fill('#setup-password-confirm', 'AdminCloud123');
  await page.click('#cloud-first-admin-form button[type="submit"]');

  await page.waitForSelector('#app-shell', { state: 'visible', timeout: 30000 });
  await page.waitForSelector('#sg-cloud-status', { state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.App && App.company && App.company.name === 'Kompania Cloud Test'), null, { timeout: 30000 });
  const cloudStatus = await page.locator('#sg-cloud-status').innerText();
  if (!cloudStatus.includes('Cloud PostgreSQL')) throw new Error('Statusi Cloud PostgreSQL mungon.');
  if (state.setupCalls !== 1) throw new Error(`Setup u thirr ${state.setupCalls} herë.`);
  if (state.bootstrapCalls < 1) throw new Error('Bootstrap-i qendror nuk u thirr.');

  const initialState = await page.evaluate(() => ({
    user: Auth.getCurrentUser(),
    company: App.company,
    apiUrl: CloudERP.apiUrl,
    token: localStorage.getItem('sg_cloud_access_token_v1')
  }));
  if (!initialState.user || initialState.user.username !== 'admin_cloud') throw new Error('Përdoruesi Cloud nuk u aktivizua.');
  if (!initialState.company || initialState.company.name !== 'Kompania Cloud Test') throw new Error('Kompania Cloud nuk u ngarkua.');
  if (initialState.apiUrl !== 'http://127.0.0.1:3100' || initialState.token !== state.token) throw new Error('API URL ose token-i Cloud është i pasaktë.');

  await page.evaluate(async () => {
    const holder = document.createElement('div');
    holder.id = 'sg-cloud-product-test-fields';
    holder.innerHTML = '<input id="pr-cat"><input id="pr-code" value="GJ-FERRE"><input id="pr-barcode" value=""><input id="pr-name" value="Gjethe Ferre"><input id="pr-unit" value="kg"><input id="pr-salesprice" value="180">';
    document.body.appendChild(holder);
    document.getElementById('pr-unit').dataset.selectedCode = 'kg';
    const oldGetSelectedId = SAC.getSelectedId;
    SAC.getSelectedId = () => null;
    await App.saveProduct(null);
    SAC.getSelectedId = oldGetSelectedId;
    holder.remove();
  });
  await page.waitForTimeout(500);
  if (state.productWrites.length !== 1 || state.productWrites[0].code !== 'GJ-FERRE') throw new Error('Artikulli nuk u dërgua në API.');

  await page.evaluate(async () => {
    const holder = document.createElement('div');
    holder.id = 'sg-cloud-partner-test-fields';
    holder.innerHTML = '<input id="p-code" value="F-001"><input id="p-name" value="Fermeri Cloud"><input id="p-nipt" value="K12345678A"><input id="p-phone" value=""><input id="p-address" value="Skrapar">';
    document.body.appendChild(holder);
    await App.savePartner('supplier', null);
    holder.remove();
  });
  await page.waitForTimeout(500);
  if (state.partnerWrites.length !== 1 || state.partnerWrites[0].partnerType !== 'SUPPLIER') throw new Error('Partneri nuk u dërgua në API.');

  const appData = await page.evaluate(() => ({
    products: App.data.products.map(x => ({ code: x.code, name: x.name })),
    suppliers: App.data.suppliers.map(x => ({ code: x.code, name: x.name }))
  }));
  if (!appData.products.some(x => x.code === 'GJ-FERRE')) throw new Error('Artikulli Cloud nuk u rifreskua në HTML.');
  if (!appData.suppliers.some(x => x.code === 'F-001')) throw new Error('Furnitori Cloud nuk u rifreskua në HTML.');

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#app-shell', { state: 'visible', timeout: 30000 });
  if (await page.locator('#cloud-first-admin-form').count()) throw new Error('Pas rifreskimit u shfaq përsëri krijimi i administratorit.');
  if (state.setupCalls !== 1) throw new Error('Administratori u krijua më shumë se një herë.');
  if (state.bootstrapCalls < 2) throw new Error('Sesioni Cloud nuk u rikthye pas rifreskimit.');

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({
    result: 'TEST_SUCCESS',
    setupCalls: state.setupCalls,
    bootstrapCalls: state.bootstrapCalls,
    productWrites: state.productWrites.length,
    partnerWrites: state.partnerWrites.length,
    persistedAcrossReload: true,
    sourceOfTruth: 'POSTGRESQL'
  }, null, 2));

  await browser.close();
  await new Promise(resolve => api.close(resolve));
})().catch(async error => {
  console.error(error.stack || error.message || error);
  try { await new Promise(resolve => api.close(resolve)); } catch (_) {}
  process.exit(1);
});
