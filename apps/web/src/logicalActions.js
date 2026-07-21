const DEFAULT_API_URL = window.location.hostname === 'genit-web-production.up.railway.app'
  ? 'https://genit-api-production.up.railway.app'
  : 'http://localhost:3000';
const API_URL = String(window.__SG_API_URL__ || import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
const TOKEN_KEY = 'sg_cloud_token';
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Veprimi dështoi.');
  return data;
}

function button(label, className, handler) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `${className} tiny`;
  node.textContent = label;
  node.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler();
  });
  return node;
}

function refreshCard(card) {
  const refresh = [...card.querySelectorAll('button')].find((item) => clean(item.textContent).includes('Rifresko'));
  if (refresh) refresh.click();
}

function openEditModal({ title, fields, onSave }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sg-quick-backdrop';
  const panel = document.createElement('section');
  panel.className = 'sg-quick-modal';
  const header = document.createElement('header');
  const heading = document.createElement('h3');
  heading.textContent = title;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'sg-quick-close';
  close.textContent = '×';
  header.append(heading, close);
  const form = document.createElement('form');
  form.className = 'sg-quick-form';
  const controls = new Map();
  fields.forEach((field) => {
    const label = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = field.label;
    const input = document.createElement('input');
    input.type = field.type || 'text';
    input.value = field.value ?? '';
    if (field.required) input.required = true;
    label.append(span, input);
    form.appendChild(label);
    controls.set(field.name, input);
  });
  const error = document.createElement('div');
  error.className = 'sg-quick-error';
  const actions = document.createElement('div');
  actions.className = 'sg-quick-actions';
  const cancel = button('Anulo', 'secondary', () => backdrop.remove());
  const save = document.createElement('button');
  save.className = 'primary';
  save.textContent = 'Ruaj ndryshimet';
  actions.append(cancel, save);
  form.append(error, actions);
  panel.append(header, form);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  close.addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop) backdrop.remove(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {};
    controls.forEach((control, name) => { values[name] = control.value; });
    save.disabled = true;
    save.textContent = 'Duke ruajtur…';
    error.textContent = '';
    try {
      await onSave(values);
      backdrop.remove();
    } catch (saveError) {
      error.textContent = saveError.message;
      save.disabled = false;
      save.textContent = 'Ruaj ndryshimet';
    }
  });
}

function addActionColumn(table, rows, resolver) {
  if (table.dataset.sgLogicalActions === '1') return;
  table.dataset.sgLogicalActions = '1';
  const head = table.querySelector('thead tr');
  if (!head) return;
  const th = document.createElement('th');
  th.textContent = 'Veprime';
  head.appendChild(th);
  table.querySelectorAll('tbody tr').forEach((tr) => {
    const td = document.createElement('td');
    td.className = 'record-actions';
    const row = resolver(tr, rows);
    if (row) td.append(...row.actions);
    tr.appendChild(td);
  });
}

async function enhanceCompanies(card, table) {
  const rows = await api('/api/companies');
  addActionColumn(table, rows, (tr, list) => {
    const name = clean(tr.cells[0]?.textContent);
    const row = list.find((item) => clean(item.name) === name);
    if (!row) return null;
    return {
      actions: [button('Hap/Edito', 'secondary', () => openEditModal({
        title: 'Edito kompaninë',
        fields: [
          { name: 'name', label: 'Emri', value: row.name, required: true },
          { name: 'nipt', label: 'NIPT', value: row.nipt },
          { name: 'address', label: 'Adresa', value: row.address },
          { name: 'phone', label: 'Telefon', value: row.phone },
          { name: 'email', label: 'Email', type: 'email', value: row.email },
          { name: 'currency', label: 'Monedha', value: row.currency || 'ALL', required: true },
        ],
        onSave: async (values) => {
          await api(`/api/companies/${row.id}`, { method: 'PATCH', body: JSON.stringify(values) });
          refreshCard(card);
        },
      }))],
    };
  });
}

async function enhanceWarehouses(card, table) {
  const rows = await api('/api/warehouses');
  addActionColumn(table, rows, (tr, list) => {
    const companyName = clean(tr.cells[0]?.textContent);
    const name = clean(tr.cells[1]?.textContent);
    const code = clean(tr.cells[2]?.textContent);
    const row = list.find((item) => clean(item.company_name) === companyName && clean(item.name) === name && clean(item.code) === code);
    if (!row) return null;
    const edit = button('Hap/Edito', 'secondary', () => openEditModal({
      title: 'Edito magazinën',
      fields: [
        { name: 'name', label: 'Emri', value: row.name, required: true },
        { name: 'code', label: 'Kodi', value: row.code, required: true },
        { name: 'address', label: 'Adresa', value: row.address },
      ],
      onSave: async (values) => {
        await api(`/api/warehouses/${row.id}`, { method: 'PATCH', body: JSON.stringify(values) });
        refreshCard(card);
      },
    }));
    const toggle = button(row.active ? 'Çaktivizo' : 'Aktivizo', 'secondary', async () => {
      try {
        await api(`/api/warehouses/${row.id}`, { method: 'PATCH', body: JSON.stringify({ active: !row.active }) });
        refreshCard(card);
      } catch (error) {
        window.alert(error.message);
      }
    });
    return { actions: [edit, toggle] };
  });
}

async function enhanceUsers(card, table) {
  const rows = await api('/api/users');
  addActionColumn(table, rows, (tr, list) => {
    const username = clean(tr.cells[1]?.textContent);
    const row = list.find((item) => clean(item.username) === username);
    if (!row) return null;
    return {
      actions: [button(row.active ? 'Çaktivizo' : 'Aktivizo', 'secondary', async () => {
        try {
          await api(`/api/users/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: !row.active }) });
          refreshCard(card);
        } catch (error) {
          window.alert(error.message);
        }
      })],
    };
  });
}

let running = false;
async function scan() {
  if (running) return;
  running = true;
  try {
    for (const card of document.querySelectorAll('.card')) {
      const title = clean(card.querySelector('.section-heading h3')?.textContent);
      const table = card.querySelector('table');
      if (!table || table.dataset.sgLogicalActions === '1') continue;
      try {
        if (title === 'Kompanitë') await enhanceCompanies(card, table);
        else if (title === 'Magazinat') await enhanceWarehouses(card, table);
        else if (title === 'Përdoruesit dhe rolet') await enhanceUsers(card, table);
      } catch (error) {
        console.warn('Logical actions:', error);
      }
    }
  } finally {
    running = false;
  }
}

export function installLogicalActions() {
  scan();
  document.addEventListener('click', () => window.setTimeout(scan, 80), true);
  window.setInterval(scan, 2200);
}
