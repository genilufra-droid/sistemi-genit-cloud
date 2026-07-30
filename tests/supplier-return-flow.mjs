import assert from 'node:assert/strict';

const base = process.env.TEST_API_URL || 'http://127.0.0.1:3000';

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(`${method} ${path} -> ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function expectStatus(expectedStatus, path, options, message) {
  try {
    await api(path, options);
    assert.fail(`${message}: kërkesa kaloi pa u bllokuar.`);
  } catch (error) {
    if (error.code === 'ERR_ASSERTION') throw error;
    assert.equal(error.status, expectedStatus, `${message}: pritej ${expectedStatus}, u mor ${error.status}.`);
  }
}

async function stockFor(token, productId, warehouseId) {
  const stock = await api('/api/stock', { token });
  return Number((stock.find((row) => row.product_id === productId && row.warehouse_id === warehouseId) || {}).quantity_base || 0);
}

const stamp = Date.now();
const setup = await api('/api/setup/admin', {
  method: 'POST',
  body: {
    organizationName: `Genit Supplier Return ${stamp}`,
    companyName: 'Kompania e Kthimeve',
    companyNipt: 'L12345678R',
    warehouseName: 'Magazina e Kthimeve',
    adminName: 'Administrator Kthimesh',
    username: `returns_${stamp}`,
    email: `returns_${stamp}@example.com`,
    password: 'ReturnsTest123!',
  },
});
const { token, companyId, warehouseId } = setup;
const product = await api('/api/products', {
  method: 'POST', token,
  body: {
    companyId, categoryId: null, code: `RET-${stamp}`, barcode: '', name: 'Artikull për Kthim',
    baseUnit: 'kg', packUnit: 'thes', palletUnit: 'paletë', packCoefficient: 1, palletCoefficient: 1,
    purchasePrice: 100, salePrice: 150, vatRate: 20, active: true,
  },
});
const supplier = await api('/api/partners', {
  method: 'POST', token,
  body: {
    companyId, partnerType: 'SUPPLIER', code: `RET-F-${stamp}`, name: 'Furnitori i Kthimit',
    nipt: 'K12345678R', address: 'Tiranë', city: 'Tiranë', phone: '', email: '', creditLimit: 0, active: true,
  },
});
const order = await api('/api/documents', {
  method: 'POST', token,
  body: {
    companyId, warehouseId, partnerId: supplier.id, docType: 'PURCHASE_ORDER', documentDate: '2026-07-30',
    notes: 'Provë automatike e kthimit të furnitorit',
    items: [{ productId: product.id, unit: 'kg', coefficient: 1, quantity: 10, freeQuantity: 0, unitPrice: 100, vatRate: 20 }],
  },
});
const receipt = await api(`/api/documents/${order.id}/convert`, { method: 'POST', token, body: { targetType: 'PURCHASE_RECEIPT' } });
assert.equal(receipt.status, 'CONFIRMED');
assert.equal(await stockFor(token, product.id, warehouseId), 10, 'Pranimi duhet të shtojë 10 kg në stok.');
const receiptDetail = await api(`/api/documents/${receipt.id}`, { token });
const sourceItemId = receiptDetail.items[0].id;

const firstReturn = await api(`/api/documents/${receipt.id}/convert`, {
  method: 'POST', token,
  body: { targetType: 'PURCHASE_RETURN', returnItems: [{ sourceItemId, quantity: 3, freeQuantity: 0 }] },
});
assert.equal(firstReturn.doc_type, 'PURCHASE_RETURN');
assert.equal(firstReturn.status, 'CONFIRMED', 'Kthimi duhet të postohet automatikisht.');
assert.equal(await stockFor(token, product.id, warehouseId), 7, 'Kthimi i parë duhet të zbresë 3 kg nga stoku.');

const secondReturn = await api(`/api/documents/${receipt.id}/convert`, {
  method: 'POST', token,
  body: { targetType: 'PURCHASE_RETURN', returnItems: [{ sourceItemId, quantity: 2, freeQuantity: 0 }] },
});
assert.notEqual(secondReturn.id, firstReturn.id, 'Kthimet e pjesshme duhet të jenë dokumente të veçanta.');
assert.equal(await stockFor(token, product.id, warehouseId), 5, 'Kthimi i dytë duhet të zbresë edhe 2 kg.');

await expectStatus(409, `/api/documents/${receipt.id}/convert`, {
  method: 'POST', token,
  body: { targetType: 'PURCHASE_RETURN', returnItems: [{ sourceItemId, quantity: 6, freeQuantity: 0 }] },
}, 'Kthimi nuk duhet të kalojë sasinë e mbetur');

const returns = await api('/api/documents?type=PURCHASE_RETURN', { token });
assert.equal(returns.length, 2, 'Duhet të ruhen dy kthime të pjesshme.');
const trace = await api(`/api/documents/${receipt.id}/trace`, { token });
assert.equal(trace.nodes.filter((node) => node.label === 'PURCHASE_RETURN').length, 2, 'Gjurmueshmëria duhet të përmbajë të dy kthimet.');

await api(`/api/documents/${secondReturn.id}/cancel`, { method: 'POST', token, body: {} });
assert.equal(await stockFor(token, product.id, warehouseId), 7, 'Anulimi duhet të rikthejë sasinë e kthimit të dytë.');
await api(`/api/documents/${firstReturn.id}/cancel`, { method: 'POST', token, body: {} });
assert.equal(await stockFor(token, product.id, warehouseId), 10, 'Anulimi duhet të rikthejë plotësisht stokun.');

console.log(JSON.stringify({
  ok: true,
  workflow: 'PURCHASE_RECEIPT -> PURCHASE_RETURN (partial x2) -> cancel',
  stockAfterReceipt: 10,
  stockAfterPartialReturns: 5,
  stockAfterCancellation: 10,
  overReturnBlocked: true,
  traceabilityVerified: true,
}, null, 2));
