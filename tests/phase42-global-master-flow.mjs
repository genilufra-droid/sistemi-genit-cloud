const base = process.env.TEST_API_URL || 'http://127.0.0.1:3000';

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { text: raw }; }
  if (!response.ok) {
    const error = new Error(`${response.status} ${path}: ${body.message || raw}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const setup = await request('/api/setup/admin', {
  method: 'POST',
  body: JSON.stringify({
    organizationName: 'Genit Global Search Test',
    companyName: 'Kompania Faza 4.2',
    companyNipt: 'L42000420A',
    warehouseName: 'Magazina Qendrore',
    adminName: 'Administrator Faza 4.2',
    username: 'admin_phase42_global',
    email: 'admin42global@example.com',
    password: 'AdminPhase42Global123',
  }),
});
const auth = { Authorization: `Bearer ${setup.token}` };
const bootstrap = await request('/api/cloud/bootstrap', { headers: auth });
const company = bootstrap.companies[0];
const warehouse = bootstrap.warehouses[0];
assert(company && warehouse, 'Kompania ose magazina nuk u krijua.');

const entityTypes = ['FARMER','DRIVER','ROUTE','AGENT','ASSET','EXPENSE_CATEGORY','CASH_ACCOUNT','BANK_ACCOUNT'];
const capabilities = await request('/api/master-data/capabilities', { headers: auth });
for (const type of entityTypes) {
  const capability = capabilities.find((row) => row.entityType === type);
  assert(capability && capability.canCreate === true, `Leja e administratorit mungon për ${type}.`);
  const created = await request(`/api/master-data/${type}`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      companyId: company.id,
      code: `${type.slice(0, 8)}-001`,
      name: `${type} Test Faza 4.2`,
      description: 'Krijuar nga testi PostgreSQL i Kërko ose Shto.',
      metadata: { test: true, phase: '4.2' },
      active: true,
    }),
  });
  assert(created.entityType === type && created.companyId === company.id, `Krijimi dështoi për ${type}.`);
  const search = await request(`/api/master-data/${type}?companyId=${company.id}&q=Faza%204.2`, { headers: auth });
  assert(search.some((row) => row.id === created.id), `Kërkimi nuk e ktheu rekordin ${type}.`);
}

let duplicateBlocked = false;
try {
  await request('/api/master-data/DRIVER', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ companyId: company.id, code: 'DRIVER-001', name: 'DRIVER Test Faza 4.2', active: true }),
  });
} catch (error) { duplicateBlocked = error.status === 409; }
assert(duplicateBlocked, 'Dublikimi i master-data nuk u bllokua.');

await request('/api/users', {
  method: 'POST', headers: auth,
  body: JSON.stringify({
    fullName: 'Lexues Pa Krijim', username: 'readonly_phase42', email: 'readonly42@example.com',
    password: 'ReadOnlyPhase42123', role: 'READ_ONLY',
    companyIds: [company.id], warehouseIds: [warehouse.id],
  }),
});
const readonlyLogin = await request('/api/auth/login', {
  method: 'POST', body: JSON.stringify({ username: 'readonly_phase42', password: 'ReadOnlyPhase42123' }),
});
const readonlyAuth = { Authorization: `Bearer ${readonlyLogin.token}` };
const readonlyCapabilities = await request('/api/master-data/capabilities', { headers: readonlyAuth });
assert(readonlyCapabilities.every((row) => row.canCreate === false), 'READ_ONLY mori leje krijimi master-data.');
let readonlyBlocked = false;
try {
  await request('/api/master-data/DRIVER', {
    method: 'POST', headers: readonlyAuth,
    body: JSON.stringify({ companyId: company.id, code: 'DRV-RO', name: 'Nuk Duhet Krijuar', active: true }),
  });
} catch (error) { readonlyBlocked = error.status === 403; }
assert(readonlyBlocked, 'Serveri nuk bllokoi krijimin nga READ_ONLY.');

const rawProduct = await request('/api/products', {
  method: 'POST', headers: auth,
  body: JSON.stringify({ companyId: company.id, code: 'RAW-420', name: 'Bimë RAW', baseUnit: 'kg', packUnit: 'thes', palletUnit: 'paletë', packCoefficient: 1, palletCoefficient: 1, purchasePrice: 100, salePrice: 180, vatRate: 0, active: true }),
});
const processedProduct = await request('/api/products', {
  method: 'POST', headers: auth,
  body: JSON.stringify({ companyId: company.id, code: 'PRC-420', name: 'Bimë PROCESSED', baseUnit: 'kg', packUnit: 'thes', palletUnit: 'paletë', packCoefficient: 1, palletCoefficient: 1, purchasePrice: 0, salePrice: 240, vatRate: 0, active: true }),
});
const packagedProduct = await request('/api/products', {
  method: 'POST', headers: auth,
  body: JSON.stringify({ companyId: company.id, code: 'PKG-420', name: 'Bimë PKG 500g', baseUnit: 'kg', packUnit: 'pako', palletUnit: 'paletë', packCoefficient: 0.5, palletCoefficient: 1, purchasePrice: 0, salePrice: 320, vatRate: 0, active: true }),
});
const supplier = await request('/api/partners', {
  method: 'POST', headers: auth,
  body: JSON.stringify({ companyId: company.id, partnerType: 'SUPPLIER', code: 'FER-420', name: 'Fermeri Test', nipt: '', address: 'Berat', city: 'Berat', phone: '', email: '', creditLimit: 0, active: true }),
});
const farm = await request('/api/trace/farms', {
  method: 'POST', headers: auth,
  body: JSON.stringify({ companyId: company.id, supplierId: supplier.id, code: 'FERMA-420', name: 'Ferma Test', sourceTypeDefault: 'WILD_COLLECTION', country: 'Shqipëri', region: 'Berat', municipality: 'Skrapar', village: 'Gjerbës', locationName: 'Zona Test', active: true }),
});
const parcel = await request('/api/trace/parcels', {
  method: 'POST', headers: auth,
  body: JSON.stringify({ companyId: company.id, farmId: farm.id, code: 'PAR-420', name: 'Parcela Test', sourceType: 'WILD_COLLECTION', country: 'Shqipëri', region: 'Berat', municipality: 'Skrapar', village: 'Gjerbës', locationName: 'Zona Test', active: true }),
});
const weight = await request('/api/trace/weights', {
  method: 'POST', headers: auth,
  body: JSON.stringify({ companyId: company.id, warehouseId: warehouse.id, supplierId: supplier.id, productId: rawProduct.id, documentDate: '2026-07-23', bagsCount: 20, grossWeight: 205, packagingWeight: 5, discountPercent: 0, unitPrice: 100, vehiclePlate: 'AA420AA', farmId: farm.id, parcelId: parcel.id, harvestDate: '2026-07-21', qualityStatus: 'QUARANTINE', notes: 'Pranim 200 kg' }),
});
const receipt = await request(`/api/weights/${weight.id}/post-receipt`, {
  method: 'POST', headers: auth,
  body: JSON.stringify({ farmId: farm.id, parcelId: parcel.id, harvestDate: '2026-07-21', qualityStatus: 'QUARANTINE', botanicalName: 'Test botanike', plantPart: 'Gjethe', notes: 'RAW automatik' }),
});
await request(`/api/trace/lots/${receipt.lot.id}/quality-check`, {
  method: 'POST', headers: auth,
  body: JSON.stringify({ result: 'APPROVED', moisturePercent: 9, impurityPercent: 1, laboratoryReference: 'LAB-420', notes: 'Aprovuar' }),
});
const processDraft = await request('/api/trace/process-orders', {
  method: 'POST', headers: auth,
  body: JSON.stringify({ companyId: company.id, warehouseId: warehouse.id, outputProductId: processedProduct.id, processType: 'Pastrim dhe tharje', orderDate: '2026-07-23', outputQuantity: 90, wasteQuantity: 3, lossQuantity: 7, directCost: 900, outputQualityStatus: 'APPROVED', notes: '100 kg RAW -> 90 kg PROCESSED', inputs: [{ lotId: receipt.lot.id, quantity: 100 }] }),
});
const processPosted = await request(`/api/trace/process-orders/${processDraft.id}/post`, { method: 'POST', headers: auth, body: '{}' });
assert(processPosted.outputLot.lotType === 'PROCESSED' && Number(processPosted.outputLot.quantityAvailable) === 90, 'Dalja PROCESSED është e pasaktë.');
const packagingDraft = await request('/api/trace/packaging-orders', {
  method: 'POST', headers: auth,
  body: JSON.stringify({ companyId: company.id, warehouseId: warehouse.id, inputLotId: processPosted.outputLot.id, outputProductId: packagedProduct.id, orderDate: '2026-07-23', inputQuantity: 80, outputQuantity: 78, wasteQuantity: 2, packageCount: 156, unitsPerPackage: 1, netWeightPerPackage: 0.5, directCost: 500, outputQualityStatus: 'APPROVED', expiryDate: '2028-07-23', notes: '156 pako x 0.5 kg' }),
});
const packagingPosted = await request(`/api/trace/packaging-orders/${packagingDraft.id}/post`, { method: 'POST', headers: auth, body: '{}' });
assert(packagingPosted.outputLot.lotType === 'PACKAGED' && Number(packagingPosted.outputLot.quantityAvailable) === 78, 'Dalja PKG është e pasaktë.');
const lots = await request('/api/trace/lots', { headers: auth });
const raw = lots.find((row) => row.id === receipt.lot.id);
const processed = lots.find((row) => row.id === processPosted.outputLot.id);
const packaged = lots.find((row) => row.id === packagingPosted.outputLot.id);
assert(Number(raw.quantity_available) === 100, `RAW duhet të mbetet 100 kg, jo ${raw.quantity_available}.`);
assert(Number(processed.quantity_available) === 10, `PROCESSED duhet të mbetet 10 kg, jo ${processed.quantity_available}.`);
assert(Number(packaged.quantity_available) === 78, `PKG duhet të jetë 78 kg, jo ${packaged.quantity_available}.`);

console.log(JSON.stringify({
  ok: true,
  globalMasterTypes: entityTypes.length,
  permissionGuard: true,
  duplicateGuard: true,
  flow: 'RAW → Urdhër Pune → PROCESSED → Paketim → PKG',
  balances: { raw: Number(raw.quantity_available), processed: Number(processed.quantity_available), packaged: Number(packaged.quantity_available) },
}, null, 2));
