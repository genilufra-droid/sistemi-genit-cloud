import { installGlobalExportButtons } from './exportTools.js';

const DEFAULT_API_URL = window.location.hostname === 'genit-web-production.up.railway.app'
  ? 'https://genit-api-production.up.railway.app'
  : 'http://localhost:3000';
const API_URL = String(window.__SG_API_URL__ || import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
const TOKEN_KEY = 'sg_cloud_token';
const UNIT_KEY = 'sg_cloud_units';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = (value) => clean(value).toLocaleLowerCase('sq-AL');

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Ruajtja dështoi.');
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Serveri nuk u përgjigj. Provo përsëri.');
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function setNativeValue(field, value) {
  const prototype = field.tagName === 'SELECT'
    ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  if (field.tagName !== 'SELECT') field.dispatchEvent(new Event('change', { bubbles: true }));
}

function selectCreated(field, row, label) {
  if (field.tagName === 'SELECT') {
    let option = [...field.options].find((item) => item.value === row.id);
    if (!option) {
      option = document.createElement('option');
      option.value = row.id;
      option.textContent = label || row.name || row.code || 'I ri';
      field.appendChild(option);
    }
    setNativeValue(field, row.id);
  } else {
    setNativeValue(field, label || row.name || row.code || '');
  }
  field.focus();
}

function currentCompanyId(label) {
  const scope = label.closest('form') || label.closest('.modal') || document;
  const companyLabel = [...scope.querySelectorAll('label')].find((item) => lower(item.querySelector(':scope > span')?.textContent) === 'kompania');
  return companyLabel?.querySelector('select')?.value || '';
}

function openQuickForm({ title, fields, submitLabel = 'Shto dhe zgjidh' }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'sg-quick-backdrop';
    const panel = document.createElement('section');
    panel.className = 'sg-quick-modal';
    const header = document.createElement('header');
    const heading = document.createElement('h3');
    heading.textContent = title;
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'sg-quick-close';
    closeButton.textContent = '×';
    header.append(heading, closeButton);

    const form = document.createElement('form');
    form.className = 'sg-quick-form';
    const controls = new Map();
    fields.forEach((config) => {
      const label = document.createElement('label');
      const caption = document.createElement('span');
      caption.textContent = config.label;
      const control = config.type === 'select' ? document.createElement('select') : document.createElement('input');
      control.name = config.name;
      if (config.type && config.type !== 'select') control.type = config.type;
      if (config.placeholder) control.placeholder = config.placeholder;
      if (config.value !== undefined) control.value = config.value;
      if (config.required) control.required = true;
      if (config.step) control.step = config.step;
      (config.options || []).forEach((item) => {
        const option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        control.appendChild(option);
      });
      label.append(caption, control);
      form.appendChild(label);
      controls.set(config.name, control);
    });

    const actions = document.createElement('div');
    actions.className = 'sg-quick-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = 'Anulo';
    const submit = document.createElement('button');
    submit.className = 'primary';
    submit.textContent = submitLabel;
    actions.append(cancel, submit);
    form.appendChild(actions);
    panel.append(header, form);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    const finish = (value) => {
      backdrop.remove();
      resolve(value);
    };
    closeButton.addEventListener('click', () => finish(null));
    cancel.addEventListener('click', () => finish(null));
    backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop) finish(null); });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = {};
      controls.forEach((control, name) => { values[name] = control.value; });
      finish(values);
    });
    window.setTimeout(() => controls.values().next().value?.focus(), 0);
  });
}

function loadUnits() {
  try {
    const values = JSON.parse(localStorage.getItem(UNIT_KEY) || '[]');
    return Array.isArray(values) ? values : [];
  } catch {
    return [];
  }
}

function saveUnit(value) {
  const units = [...new Set([...loadUnits(), clean(value)])].filter(Boolean);
  localStorage.setItem(UNIT_KEY, JSON.stringify(units));
  return units;
}

function attachUnitList(input) {
  let list = document.getElementById('sg-cloud-unit-options');
  if (!list) {
    list = document.createElement('datalist');
    list.id = 'sg-cloud-unit-options';
    document.body.appendChild(list);
  }
  const defaults = ['copë', 'koli', 'paletë', 'kg', 'gram', 'litër', 'ml', 'thes', 'arkë', 'kuti'];
  const units = [...new Set([...defaults, ...loadUnits()])];
  list.replaceChildren(...units.map((unit) => {
    const option = document.createElement('option');
    option.value = unit;
    return option;
  }));
  input.setAttribute('list', list.id);
}

function entityFor(labelText, field) {
  const text = lower(labelText);
  if (text.includes('kategori')) return 'category';
  if (text.includes('furnitor')) return 'supplier';
  if (text.includes('klient')) return 'customer';
  if (text.includes('artikull') || text.includes('produkt')) return 'product';
  if (text.includes('magazin')) return 'warehouse';
  if (text === 'kompania') return 'company';
  if ((text.includes('njësia') || text.includes('njesia')) && field.tagName === 'INPUT') return 'unit';
  return null;
}

async function createEntity(entity, label, field) {
  const companyId = currentCompanyId(label);
  if (!companyId && !['company', 'unit'].includes(entity)) throw new Error('Zgjidh fillimisht kompaninë.');

  if (entity === 'unit') {
    const values = await openQuickForm({ title: 'Shto njësi', fields: [{ name: 'name', label: 'Njësia', required: true, placeholder: 'p.sh. kuti' }] });
    if (!values) return;
    saveUnit(values.name);
    attachUnitList(field);
    setNativeValue(field, clean(values.name));
    field.focus();
    return;
  }

  if (entity === 'category') {
    const values = await openQuickForm({ title: 'Shto kategori', fields: [{ name: 'name', label: 'Emri', required: true }, { name: 'code', label: 'Kodi' }] });
    if (!values) return;
    const row = await api('/api/categories', { method: 'POST', body: JSON.stringify({ companyId, name: values.name, code: values.code }) });
    selectCreated(field, row, row.name);
    return;
  }

  if (entity === 'supplier' || entity === 'customer') {
    const type = entity === 'supplier' ? 'SUPPLIER' : 'CUSTOMER';
    const values = await openQuickForm({
      title: entity === 'supplier' ? 'Shto furnitor' : 'Shto klient',
      fields: [
        { name: 'name', label: 'Emri', required: true },
        { name: 'code', label: 'Kodi' },
        { name: 'nipt', label: 'NIPT' },
        { name: 'phone', label: 'Telefon' },
        { name: 'city', label: 'Qyteti' },
      ],
    });
    if (!values) return;
    const row = await api('/api/partners', {
      method: 'POST',
      body: JSON.stringify({ companyId, partnerType: type, ...values, address: '', email: '', creditLimit: 0 }),
    });
    selectCreated(field, row, row.name);
    return;
  }

  if (entity === 'product') {
    const values = await openQuickForm({
      title: 'Shto artikull',
      fields: [
        { name: 'code', label: 'Kodi', required: true },
        { name: 'name', label: 'Emri', required: true },
        { name: 'barcode', label: 'Barkodi' },
        { name: 'baseUnit', label: 'Njësia bazë', value: 'copë', required: true },
        { name: 'packCoefficient', label: 'Copë për koli', type: 'number', step: 'any', value: 1, required: true },
        { name: 'purchasePrice', label: 'Çmimi blerje', type: 'number', step: 'any', value: 0 },
        { name: 'salePrice', label: 'Çmimi shitje', type: 'number', step: 'any', value: 0 },
      ],
    });
    if (!values) return;
    const row = await api('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        categoryId: null,
        code: values.code,
        barcode: values.barcode,
        name: values.name,
        baseUnit: values.baseUnit || 'copë',
        packUnit: 'koli',
        palletUnit: 'paletë',
        packCoefficient: Number(values.packCoefficient || 1),
        palletCoefficient: Number(values.packCoefficient || 1),
        purchasePrice: Number(values.purchasePrice || 0),
        salePrice: Number(values.salePrice || 0),
        vatRate: 0,
      }),
    });
    selectCreated(field, row, `${row.code} — ${row.name}`);
    return;
  }

  if (entity === 'warehouse') {
    const values = await openQuickForm({
      title: 'Shto magazinë',
      fields: [{ name: 'name', label: 'Emri', required: true }, { name: 'code', label: 'Kodi', required: true }, { name: 'address', label: 'Adresa' }],
    });
    if (!values) return;
    const row = await api('/api/warehouses', { method: 'POST', body: JSON.stringify({ companyId, ...values }) });
    selectCreated(field, row, row.name);
    return;
  }

  if (entity === 'company') {
    const values = await openQuickForm({
      title: 'Shto kompani',
      fields: [{ name: 'name', label: 'Emri', required: true }, { name: 'nipt', label: 'NIPT' }, { name: 'currency', label: 'Monedha', value: 'ALL', required: true }],
    });
    if (!values) return;
    const row = await api('/api/companies', { method: 'POST', body: JSON.stringify({ ...values, address: '', phone: '', email: '' }) });
    selectCreated(field, row, row.name);
  }
}

function addQuickButton(label) {
  if (label.dataset.sgQuickReady === '1') return;
  const field = label.querySelector('select,input');
  const caption = label.querySelector(':scope > span');
  if (!field || !caption || field.disabled) return;
  const entity = entityFor(caption.textContent, field);
  if (!entity) return;
  label.dataset.sgQuickReady = '1';
  if (entity === 'unit') attachUnitList(field);

  const heading = document.createElement('div');
  heading.className = 'sg-field-heading';
  caption.replaceWith(heading);
  heading.appendChild(caption);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sg-quick-add';
  button.textContent = '+ Shto';
  button.title = 'Shto pa mbyllur formularin';
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled) return;
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'Duke ruajtur…';
    try {
      await createEntity(entity, label, field);
    } catch (error) {
      window.alert(error.message || 'Shtimi dështoi.');
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  });
  heading.appendChild(button);
}

function staticClone(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll('.sg-export-actions,.sg-row-export,.sg-quick-add,.record-actions,.modal-actions,button').forEach((node) => node.remove());
  clone.querySelectorAll('input,select,textarea').forEach((field) => {
    const span = document.createElement('span');
    span.textContent = field.tagName === 'SELECT' ? field.selectedOptions?.[0]?.textContent || '' : field.value || '';
    span.className = 'sg-preview-value';
    field.replaceWith(span);
  });
  return clone;
}

function openPreview(element, title) {
  const popup = window.open('', '_blank', 'width=1200,height=850');
  if (!popup) throw new Error('Lejo pop-up për të hapur Preview.');
  const clone = staticClone(element);
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${clean(title)}</title><style>body{font-family:Arial,sans-serif;margin:0;background:#f4f5f8;color:#111}.toolbar{position:sticky;top:0;display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;background:#fff;border-bottom:1px solid #ddd}.toolbar button{padding:9px 16px;border-radius:7px;border:1px solid #999;background:#fff;cursor:pointer}.toolbar .print{background:#4b2377;color:#fff;border-color:#4b2377}.sheet{background:#fff;max-width:1100px;margin:18px auto;padding:24px;box-shadow:0 2px 14px #0002}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #aaa;padding:6px;text-align:left}th{background:#eee}h1,h2,h3{margin-top:0}.sg-preview-value{display:block;border:1px solid #ddd;padding:7px;min-height:16px}@media print{body{background:#fff}.toolbar{display:none}.sheet{box-shadow:none;margin:0;max-width:none;padding:0}@page{size:A4;margin:12mm}}</style></head><body><div class="toolbar"><button onclick="window.close()">Mbyll</button><button class="print" onclick="window.print()">Print</button></div><main class="sheet"><h2>${clean(title)}</h2>${clone.outerHTML}</main></body></html>`);
  popup.document.close();
}

function addPreviewButtons() {
  document.querySelectorAll('.sg-export-actions').forEach((actions) => {
    if (actions.querySelector('.sg-preview-button')) return;
    const scope = actions.closest('.card,.modal') || actions.parentElement;
    const title = clean(scope?.querySelector('h1,h2,h3')?.textContent || 'Sistemi Genit');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary small sg-preview-button';
    button.textContent = 'Preview';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      try { openPreview(scope, title); } catch (error) { window.alert(error.message); }
    });
    actions.prepend(button);
  });

  document.querySelectorAll('.sg-row-export').forEach((cell) => {
    const actions = cell.firstElementChild || cell;
    if (actions.querySelector?.('.sg-preview-button')) return;
    const row = cell.closest('tr');
    const table = cell.closest('table');
    if (!row || !table) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary small tiny sg-preview-button';
    button.textContent = 'Preview';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const temp = document.createElement('div');
      const tableClone = table.cloneNode(true);
      tableClone.querySelectorAll('tbody tr').forEach((item, index) => { if (index !== [...table.querySelectorAll('tbody tr')].indexOf(row)) item.remove(); });
      temp.appendChild(tableClone);
      try { openPreview(temp, clean(row.cells[1]?.textContent || 'Dokumenti')); } catch (error) { window.alert(error.message); }
    });
    actions.prepend(button);
  });
}

let scanScheduled = false;
function scan() {
  scanScheduled = false;
  document.querySelectorAll('form label,.modal label').forEach(addQuickButton);
  installGlobalExportButtons(document);
  addPreviewButtons();
}

function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  window.requestAnimationFrame(scan);
}

export function installSafeEnhancements() {
  scheduleScan();
  document.addEventListener('click', () => window.setTimeout(scheduleScan, 40), true);
  document.addEventListener('focusin', scheduleScan, true);
  window.setInterval(scheduleScan, 1800);
}
