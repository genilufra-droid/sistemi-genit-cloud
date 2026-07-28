import assert from 'node:assert/strict';

const base = process.env.TEST_API_URL || 'http://127.0.0.1:3000';

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
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

const stamp = Date.now();
const setup = await api('/api/setup/admin', {
  method: 'POST',
  body: {
    organizationName: `Genit Critical Test ${stamp}`,
    companyName: 'Kompania Test',
    companyNipt: 'L12345678A',
    warehouseName: 'Magazina Qendrore',
    adminName: 'Administrator Test',
    username: `admin_${stamp}`,
    email: `admin_${stamp}@example.com`,
    password: 'AdminCritical123!',
  },
});
const token = setup.token;
const companyId = setup.companyId;
const warehouseId = setup.warehouseId;
assert.ok(token && companyId && warehouseId, 'Konfigurimi fillestar duhet të kthejë token, kompani dhe magazinë.');

const product = await api('/api/products', {
  method: 'POST',
  token,
  body: {
    companyId,
    categoryId: null,
    code: `TEST-${stamp}`,
    barcode: '',
    name: 'Artikull Test Kritik',
    baseUnit: 'kg',
    packUnit: 'thes',
    palletUnit: 'paletë',
    packCoefficient: 1,
    palletCoefficient: 1,
    purchasePrice: 100,
    salePrice: 160,
    vatRate: 20,
    active: true,
  },
});
const supplier = await api('/api/partners', {
  method: 'POST',
  token,
  body: {
    companyId,
    partnerType: 'SUPPLIER',
    code: `F-${stamp}`,
    name: 'Furnitori Test Kritik',
    nipt: 'K12345678A',
    address: 'Tiranë',
    city: 'Tiranë',
    phone: '',
    email: '',
    creditLimit: 0,
    active: true,
  },
});

const purchaseOrder = await api('/api/documents', {
  method: 'POST',
  token,
  body: {
    companyId,
    warehouseId,
    partnerId: supplier.id,
    docType: 'PURCHASE_ORDER',
    documentDate: '2026-07-28',
    notes: 'Test automatik i rrjedhës kritike',
    items: [{
      productId: product.id,
      unit: 'kg',
      coefficient: 1,
      quantity: 10,
      freeQuantity: 0,
      unitPrice: 100,
      vatRate: 20,
    }],
  },
});
assert.equal(purchaseOrder.status, 'DRAFT');

const receipt = await api(`/api/documents/${purchaseOrder.id}/convert`, {
  method: 'POST',
  token,
  body: { targetType: 'PURCHASE_RECEIPT' },
});
assert.equal(receipt.status, 'CONFIRMED', 'Pranimi duhet të konfirmohet dhe të shtojë stokun.');

let stock = await api('/api/stock', { token });
let stockLine = stock.find((row) => row.product_id === product.id && row.warehouse_id === warehouseId);
assert.equal(Number(stockLine?.quantity_base), 10, 'Pranimi duhet të shtojë saktësisht 10 kg në stok.');

const invoice = await api(`/api/documents/${receipt.id}/convert`, {
  method: 'POST',
  token,
  body: { targetType: 'PURCHASE_INVOICE' },
});
assert.equal(invoice.status, 'CONFIRMED', 'Fatura e blerjes duhet të konfirmohet.');

let invoiceDetail = await api(`/api/documents/${invoice.id}`, { token });
assert.equal(Number(invoiceDetail.total_amount), 1200);
assert.equal(Number(invoiceDetail.paid_amount), 0);
assert.equal(Number(invoiceDetail.remaining_amount), 1200);
assert.equal(invoiceDetail.payment_status, 'UNPAID', 'Fatura e re duhet të krijojë detyrim të papaguar.');

const cash = await api('/api/finance/accounts', {
  method: 'POST',
  token,
  body: {
    companyId,
    warehouseId,
    accountKind: 'CASH',
    code: 'ARKA-TEST',
    name: 'Arka Test',
    currency: 'ALL',
    openingBalance: 2000,
    openingDate: '2026-07-28',
    active: true,
    notes: 'Llogari e izoluar e testit kritik',
  },
});

const partialPayment = await api('/api/finance/documents', {
  method: 'POST',
  token,
  body: {
    companyId,
    accountId: cash.id,
    partnerId: supplier.id,
    documentType: 'CASH_PAYMENT',
    documentDate: '2026-07-28',
    currency: 'ALL',
    amount: 500,
    exchangeRate: 1,
    description: 'Pagesë e pjesshme prove',
    referenceNo: 'TEST-PARTIAL',
    allocations: [{ businessDocumentId: invoice.id, amount: 500 }],
  },
});
await api(`/api/finance/documents/${partialPayment.id}/post`, { method: 'POST', token, body: {} });

invoiceDetail = await api(`/api/documents/${invoice.id}`, { token });
assert.equal(Number(invoiceDetail.paid_amount), 500);
assert.equal(Number(invoiceDetail.remaining_amount), 700);
assert.equal(invoiceDetail.payment_status, 'PARTIAL');

const finalPayment = await api('/api/finance/documents', {
  method: 'POST',
  token,
  body: {
    companyId,
    accountId: cash.id,
    partnerId: supplier.id,
    documentType: 'CASH_PAYMENT',
    documentDate: '2026-07-28',
    currency: 'ALL',
    amount: 700,
    exchangeRate: 1,
    description: 'Shlyerje prove',
    referenceNo: 'TEST-FINAL',
    allocations: [{ businessDocumentId: invoice.id, amount: 700 }],
  },
});
await api(`/api/finance/documents/${finalPayment.id}/post`, { method: 'POST', token, body: {} });

invoiceDetail = await api(`/api/documents/${invoice.id}`, { token });
assert.equal(Number(invoiceDetail.paid_amount), 1200);
assert.equal(Number(invoiceDetail.remaining_amount), 0);
assert.equal(invoiceDetail.payment_status, 'PAID', 'Shlyerja e plotë duhet ta kalojë faturën në PAID.');

const openInvoices = await api(`/api/finance/open-invoices?partnerId=${supplier.id}`, { token });
assert.ok(!openInvoices.some((row) => row.id === invoice.id), 'Fatura e shlyer nuk duhet të mbetet te detyrimet e hapura.');

const customer = await api('/api/partners', {
  method: 'POST',
  token,
  body: {
    companyId,
    partnerType: 'CUSTOMER',
    code: `K-${stamp}`,
    name: 'Klienti Test Kritik',
    nipt: 'J12345678A',
    address: 'Durrës',
    city: 'Durrës',
    phone: '',
    email: '',
    creditLimit: 5000,
    active: true,
  },
});
const salesQuote = await api('/api/documents', {
  method: 'POST',
  token,
  body: {
    companyId,
    warehouseId,
    partnerId: customer.id,
    docType: 'SALES_QUOTE',
    documentDate: '2026-07-28',
    notes: 'Test automatik i shitjes',
    items: [{
      productId: product.id,
      unit: 'kg',
      coefficient: 1,
      quantity: 4,
      freeQuantity: 0,
      unitPrice: 160,
      vatRate: 20,
    }],
  },
});
const salesOrder = await api(`/api/documents/${salesQuote.id}/convert`, {
  method: 'POST',
  token,
  body: { targetType: 'SALES_ORDER' },
});
const delivery = await api(`/api/documents/${salesOrder.id}/convert`, {
  method: 'POST',
  token,
  body: { targetType: 'DELIVERY_NOTE' },
});
assert.equal(delivery.status, 'CONFIRMED');
stock = await api('/api/stock', { token });
stockLine = stock.find((row) => row.product_id === product.id && row.warehouse_id === warehouseId);
assert.equal(Number(stockLine?.quantity_base), 6, 'Fletë-dalja duhet të zbresë 4 kg nga stoku.');

const salesInvoice = await api(`/api/documents/${delivery.id}/convert`, {
  method: 'POST',
  token,
  body: { targetType: 'SALES_INVOICE' },
});
let salesInvoiceDetail = await api(`/api/documents/${salesInvoice.id}`, { token });
assert.equal(Number(salesInvoiceDetail.total_amount), 768);
assert.equal(Number(salesInvoiceDetail.remaining_amount), 768);
assert.equal(salesInvoiceDetail.payment_status, 'UNPAID');

const customerReceipt = await api('/api/finance/documents', {
  method: 'POST',
  token,
  body: {
    companyId,
    accountId: cash.id,
    partnerId: customer.id,
    documentType: 'CASH_RECEIPT',
    documentDate: '2026-07-28',
    currency: 'ALL',
    amount: 768,
    exchangeRate: 1,
    description: 'Arkëtim i plotë prove',
    referenceNo: 'TEST-SALE',
    allocations: [{ businessDocumentId: salesInvoice.id, amount: 768 }],
  },
});
await api(`/api/finance/documents/${customerReceipt.id}/post`, { method: 'POST', token, body: {} });
salesInvoiceDetail = await api(`/api/documents/${salesInvoice.id}`, { token });
assert.equal(Number(salesInvoiceDetail.remaining_amount), 0);
assert.equal(salesInvoiceDetail.payment_status, 'PAID', 'Arkëtimi duhet ta shlyejë faturën e shitjes.');

let duplicate = null;
try {
  duplicate = await api(`/api/documents/${purchaseOrder.id}/convert`, {
    method: 'POST',
    token,
    body: { targetType: 'PURCHASE_RECEIPT' },
  });
} catch (error) {
  assert.fail(`Konvertimi idempotent nuk duhet të dështojë: ${error.message}`);
}
assert.equal(duplicate.id, receipt.id, 'Klikimi i përsëritur nuk duhet të krijojë pranim të dytë.');
stock = await api('/api/stock', { token });
stockLine = stock.find((row) => row.product_id === product.id && row.warehouse_id === warehouseId);
assert.equal(Number(stockLine?.quantity_base), 6, 'Klikimi i përsëritur nuk duhet të dyfishojë pranimin ose të ndryshojë stokun.');

let protectedInvoice = false;
try {
  await api(`/api/documents/${invoice.id}/cancel`, { method: 'POST', token, body: {} });
} catch (error) {
  protectedInvoice = error.status === 409;
}
assert.equal(protectedInvoice, true, 'Fatura me pagesa të postuara nuk duhet të anulohet.');

await api(`/api/finance/documents/${customerReceipt.id}/cancel`, { method: 'POST', token, body: {} });
await api(`/api/documents/${salesInvoice.id}/cancel`, { method: 'POST', token, body: {} });
await api(`/api/documents/${delivery.id}/cancel`, { method: 'POST', token, body: {} });
stock = await api('/api/stock', { token });
stockLine = stock.find((row) => row.product_id === product.id && row.warehouse_id === warehouseId);
assert.equal(Number(stockLine?.quantity_base), 10, 'Anulimi i fletë-daljes duhet t’i rikthejë 4 kg në stok.');

await api(`/api/finance/documents/${finalPayment.id}/cancel`, { method: 'POST', token, body: {} });
await api(`/api/finance/documents/${partialPayment.id}/cancel`, { method: 'POST', token, body: {} });
invoiceDetail = await api(`/api/documents/${invoice.id}`, { token });
assert.equal(Number(invoiceDetail.paid_amount), 0);
assert.equal(Number(invoiceDetail.remaining_amount), 1200);
assert.equal(invoiceDetail.payment_status, 'UNPAID', 'Anulimi i pagesave duhet ta rikthejë detyrimin e faturës.');

await api(`/api/documents/${invoice.id}/cancel`, { method: 'POST', token, body: {} });
await api(`/api/documents/${receipt.id}/cancel`, { method: 'POST', token, body: {} });
stock = await api('/api/stock', { token });
stockLine = stock.find((row) => row.product_id === product.id && row.warehouse_id === warehouseId);
assert.equal(Number(stockLine?.quantity_base), 0, 'Anulimi i pranimit duhet ta kthejë stokun në zero.');

console.log(JSON.stringify({
  ok: true,
  workflow: 'PURCHASE_ORDER -> PURCHASE_RECEIPT -> PURCHASE_INVOICE -> CASH_PAYMENT',
  stockAfterReceipt: 10,
  invoiceTotal: 1200,
  fullPaymentVerified: true,
  paymentCancellationVerified: true,
  salesDeliveryAndInvoiceVerified: true,
  customerReceiptVerified: true,
  stockAfterCancellation: 0,
  protectedPostedPayment: true,
  idempotentConversion: true,
}, null, 2));
