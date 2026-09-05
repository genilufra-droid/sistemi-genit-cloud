import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Edit3, Plus, Power, RefreshCcw, Search, Trash2, X } from 'lucide-react';
import './registry.css';

const DEFAULT_API_URL = window.location.hostname === 'genit-web-production.up.railway.app'
  ? 'https://genit-api-production.up.railway.app'
  : 'http://localhost:3000';
const API_URL = String(window.__SG_API_URL__ || import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
const TOKEN_KEY = 'sg_cloud_token';

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
  if (!response.ok) throw new Error(data.message || 'Kërkesa dështoi.');
  return data;
}

function Alert({ children }) {
  return children ? <div className="alert error">{children}</div> : null;
}

function Modal({ title, children, close }) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className="modal registry-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h3>{title}</h3>
          <button onClick={close} aria-label="Mbyll"><X /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

function PageHeader({ title, subtitle, onAdd, onRefresh }) {
  return (
    <div className="section-heading">
      <div><h3>{title}</h3><p>{subtitle}</p></div>
      <div className="registry-header-actions">
        <button className="secondary small" onClick={onRefresh}><RefreshCcw size={16} /> Rifresko</button>
        <button className="primary small" onClick={onAdd}><Plus size={16} /> Shto</button>
      </div>
    </div>
  );
}

function Empty() {
  return <div className="empty"><Archive size={30} /><p>Nuk ka të dhëna.</p></div>;
}

function StatusChip({ active }) {
  return <span className={`status-chip ${active ? '' : 'off'}`}>{active ? 'Aktiv' : 'Joaktiv'}</span>;
}

function RecordActions({ row, onEdit, onToggle, onDelete }) {
  return (
    <div className="record-actions">
      <button className="secondary tiny" onClick={(event) => { event.stopPropagation(); onEdit(row); }}><Edit3 size={14} /> Hap/Edito</button>
      <button className="secondary tiny" onClick={(event) => { event.stopPropagation(); onToggle(row); }}><Power size={14} /> {row.active ? 'Çaktivizo' : 'Aktivizo'}</button>
      <button className="danger tiny" onClick={(event) => { event.stopPropagation(); onDelete(row); }}><Trash2 size={14} /> Fshi</button>
    </div>
  );
}

function DataTable({ rows, columns, onOpen }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="clickable-row" onDoubleClick={() => onOpen(row)}>
              {columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SelectCompany({ companies, value, onChange, disabled = false }) {
  return (
    <label>
      <span>Kompania</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required disabled={disabled}>
        {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
    </label>
  );
}

function FormActions({ close }) {
  return (
    <div className="modal-actions wide">
      <button type="button" className="secondary" onClick={close}>Anulo</button>
      <button className="primary">Ruaj ndryshimet</button>
    </div>
  );
}

const blankProduct = (companyId = '') => ({
  companyId,
  categoryId: '',
  code: '',
  barcode: '',
  name: '',
  baseUnit: 'copë',
  packUnit: 'koli',
  palletUnit: 'paletë',
  packCoefficient: 1,
  palletCoefficient: 1,
  purchasePrice: 0,
  salePrice: 0,
  vatRate: 0,
  active: true,
});

function productToForm(row) {
  return {
    companyId: row.company_id,
    categoryId: row.category_id || '',
    code: row.code || '',
    barcode: row.barcode || '',
    name: row.name || '',
    baseUnit: row.base_unit || 'copë',
    packUnit: row.pack_unit || 'koli',
    palletUnit: row.pallet_unit || 'paletë',
    packCoefficient: Number(row.pack_coefficient || 1),
    palletCoefficient: Number(row.pallet_coefficient || 1),
    purchasePrice: Number(row.purchase_price || 0),
    salePrice: Number(row.sale_price || 0),
    vatRate: Number(row.vat_rate || 0),
    active: row.active !== false,
  };
}

const PRODUCT_TABS = [
  ['general', 'Informacion i Përgjithshëm'],
  ['inventory', 'Stoku'],
  ['purchase', 'Blerje'],
  ['sales', 'Shitje'],
  ['accounting', 'Kontabilitet'],
  ['traceability', 'Gjurmueshmëri'],
];

export function ProductsRegistryPage() {
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankProduct());
  const [productTab, setProductTab] = useState('general');

  const load = async () => {
    try {
      const [products, companyRows, categoryRows] = await Promise.all([
        api('/api/products'),
        api('/api/companies'),
        api('/api/categories'),
      ]);
      setRows(products);
      setCompanies(companyRows);
      setCategories(categoryRows);
      setForm((current) => ({ ...current, companyId: current.companyId || companyRows[0]?.id || '' }));
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => { load(); }, []);

  const filteredRows = useMemo(() => rows.filter((row) => (
    `${row.code} ${row.barcode || ''} ${row.name} ${row.category_name || ''} ${row.active ? 'aktiv' : 'joaktiv'}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )), [rows, search]);

  const startNew = () => {
    setEditingId(null);
    setForm(blankProduct(companies[0]?.id || ''));
    setProductTab('general');
    setOpen(true);
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm(productToForm(row));
    setProductTab('general');
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditingId(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      const payload = { ...form, categoryId: form.categoryId || null };
      await api(editingId ? `/api/products/${editingId}` : '/api/products', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      close();
      await load();
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const toggle = async (row) => {
    try {
      await api(`/api/products/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: !row.active }) });
      await load();
    } catch (toggleError) {
      setError(toggleError.message);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Fshi artikullin “${row.name}”? Historiku i dokumenteve do të ruhet.`)) return;
    try {
      await api(`/api/products/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const columns = [
    { key: 'code', label: 'Kodi' },
    { key: 'name', label: 'Artikulli' },
    { key: 'category_name', label: 'Kategoria' },
    { key: 'pack_coefficient', label: 'Copë/Koli' },
    { key: 'pallet_coefficient', label: 'Copë/Paletë' },
    { key: 'purchase_price', label: 'Blerje', render: (row) => Number(row.purchase_price || 0).toLocaleString('sq-AL') },
    { key: 'sale_price', label: 'Shitje', render: (row) => Number(row.sale_price || 0).toLocaleString('sq-AL') },
    { key: 'active', label: 'Statusi', render: (row) => <StatusChip active={row.active} /> },
    { key: 'actions', label: 'Veprime', render: (row) => <RecordActions row={row} onEdit={startEdit} onToggle={toggle} onDelete={remove} /> },
  ];

  return (
    <>
      <Alert>{error}</Alert>
      <section className="card">
        <PageHeader title="Artikujt" subtitle="Kliko dy herë rreshtin ose përdor Hap/Edito." onAdd={startNew} onRefresh={load} />
        <div className="search-box registry-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kërko kod, barkod, emër…" /></div>
        <DataTable rows={filteredRows} columns={columns} onOpen={startEdit} />
      </section>

      {open && (
        <div className="product-editor-backdrop" onMouseDown={close}>
          <form className="product-editor" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
            <div className="product-editor-toolbar">
              <div className="product-editor-title">
                <strong>Artikujt / {editingId ? 'Edito' : 'I Ri'}</strong>
                <span>{editingId ? 'Kartela e artikullit' : 'Krijo artikull të ri'}</span>
              </div>
              <div className="product-editor-actions">
                <button className="primary" type="submit">Ruaj</button>
                <button className="secondary" type="button" onClick={close}>Anulo</button>
                <button className="icon-close" type="button" onClick={close} aria-label="Mbyll"><X size={20} /></button>
              </div>
            </div>

            <div className="product-smartbar">
              <label className="product-active-toggle">
                <span>Aktiv</span>
                <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              </label>
              <div className="product-smartbuttons" aria-label="Përmbledhje artikulli">
                <div><strong>—</strong><span>Në Stok</span></div>
                <div><strong>—</strong><span>Lëvizje</span></div>
                <div><strong>—</strong><span>Blerje</span></div>
                <div><strong>—</strong><span>Shitje</span></div>
              </div>
            </div>

            <div className="product-sheet">
              <div className="product-name-row">
                <label className="product-name-field">
                  <span>Emri i Artikullit *</span>
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="p.sh. Rugove 0.5L" required />
                </label>
                <div className="product-photo-placeholder" aria-label="Foto produkti">
                  <span>📷</span>
                  <small>Foto e Produktit</small>
                </div>
              </div>

              <div className="product-flags">
                <label><input type="checkbox" checked readOnly /> Mund të Blihet</label>
                <label><input type="checkbox" checked readOnly /> Mund të Shitet</label>
                <label><input type="checkbox" checked readOnly /> Produkt Stoku</label>
              </div>

              <div className="product-tabs" role="tablist">
                {PRODUCT_TABS.map(([key, label]) => (
                  <button key={key} type="button" className={productTab === key ? 'active' : ''} onClick={() => setProductTab(key)}>{label}</button>
                ))}
              </div>

              {productTab === 'general' && (
                <div className="product-tab-panel two-columns">
                  <section>
                    <h4>Informacioni bazë</h4>
                    <SelectCompany companies={companies} value={form.companyId} onChange={(companyId) => setForm({ ...form, companyId, categoryId: '' })} disabled={Boolean(editingId)} />
                    <label><span>Kodi *</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="p.sh. RG-05" required /></label>
                    <label><span>Barkodi</span><input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} placeholder="p.sh. 123456789012" /></label>
                    <label><span>Kategoria</span><select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">Pa kategori</option>{categories.filter((category) => category.company_id === form.companyId && category.active !== false).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                    <label><span>Njësia Bazë</span><input value={form.baseUnit} onChange={(event) => setForm({ ...form, baseUnit: event.target.value })} /></label>
                  </section>
                  <section>
                    <h4>Çmime dhe taksa</h4>
                    <label><span>Çmimi i Blerjes</span><input type="number" step="any" value={form.purchasePrice} onChange={(event) => setForm({ ...form, purchasePrice: event.target.value })} /></label>
                    <label><span>Çmimi i Shitjes</span><input type="number" step="any" value={form.salePrice} onChange={(event) => setForm({ ...form, salePrice: event.target.value })} /></label>
                    <label><span>TVSH %</span><input type="number" step="any" value={form.vatRate} onChange={(event) => setForm({ ...form, vatRate: event.target.value })} /></label>
                    <div className="product-readonly-line"><span>Kosto Mesatare</span><strong>—</strong></div>
                  </section>
                </div>
              )}

              {productTab === 'inventory' && (
                <div className="product-tab-panel two-columns">
                  <section>
                    <h4>Njësitë dhe paketimi</h4>
                    <label><span>Njësia Bazë</span><input value={form.baseUnit} onChange={(event) => setForm({ ...form, baseUnit: event.target.value })} /></label>
                    <label><span>Njësia Koli</span><input value={form.packUnit} onChange={(event) => setForm({ ...form, packUnit: event.target.value })} /></label>
                    <label><span>Copë për Koli</span><input type="number" step="any" value={form.packCoefficient} onChange={(event) => setForm({ ...form, packCoefficient: event.target.value })} /></label>
                  </section>
                  <section>
                    <h4>Paleta</h4>
                    <label><span>Njësia Paletë</span><input value={form.palletUnit} onChange={(event) => setForm({ ...form, palletUnit: event.target.value })} /></label>
                    <label><span>Copë për Paletë</span><input type="number" step="any" value={form.palletCoefficient} onChange={(event) => setForm({ ...form, palletCoefficient: event.target.value })} /></label>
                    <div className="product-readonly-line"><span>Stoku Aktual</span><strong>—</strong></div>
                  </section>
                </div>
              )}

              {productTab === 'purchase' && (
                <div className="product-tab-panel two-columns">
                  <section>
                    <h4>Blerje</h4>
                    <label><span>Çmimi i Blerjes</span><input type="number" step="any" value={form.purchasePrice} onChange={(event) => setForm({ ...form, purchasePrice: event.target.value })} /></label>
                    <label><span>Njësia e Blerjes</span><input value={form.packUnit} onChange={(event) => setForm({ ...form, packUnit: event.target.value })} /></label>
                  </section>
                  <section>
                    <h4>Konvertimi</h4>
                    <label><span>Koeficienti Koli</span><input type="number" step="any" value={form.packCoefficient} onChange={(event) => setForm({ ...form, packCoefficient: event.target.value })} /></label>
                  </section>
                </div>
              )}

              {productTab === 'sales' && (
                <div className="product-tab-panel two-columns">
                  <section>
                    <h4>Shitje</h4>
                    <label><span>Çmimi i Shitjes</span><input type="number" step="any" value={form.salePrice} onChange={(event) => setForm({ ...form, salePrice: event.target.value })} /></label>
                    <label><span>Njësia e Shitjes</span><input value={form.baseUnit} onChange={(event) => setForm({ ...form, baseUnit: event.target.value })} /></label>
                  </section>
                  <section>
                    <h4>Tatimi</h4>
                    <label><span>TVSH %</span><input type="number" step="any" value={form.vatRate} onChange={(event) => setForm({ ...form, vatRate: event.target.value })} /></label>
                  </section>
                </div>
              )}

              {productTab === 'accounting' && (
                <div className="product-tab-panel two-columns">
                  <section>
                    <h4>Kontabilitet</h4>
                    <label><span>TVSH %</span><input type="number" step="any" value={form.vatRate} onChange={(event) => setForm({ ...form, vatRate: event.target.value })} /></label>
                  </section>
                  <section>
                    <h4>Statusi</h4>
                    <label className="inline-check"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Artikulli aktiv</label>
                  </section>
                </div>
              )}

              {productTab === 'traceability' && (
                <div className="product-tab-panel two-columns">
                  <section>
                    <h4>Identifikimi</h4>
                    <label><span>Kodi i Artikullit</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>
                    <label><span>Barkodi</span><input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></label>
                  </section>
                  <section>
                    <h4>Njësitë e gjurmimit</h4>
                    <label><span>Njësia bazë</span><input value={form.baseUnit} onChange={(event) => setForm({ ...form, baseUnit: event.target.value })} /></label>
                    <label><span>Njësia paletë</span><input value={form.palletUnit} onChange={(event) => setForm({ ...form, palletUnit: event.target.value })} /></label>
                  </section>
                </div>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}

const blankPartner = (type, companyId = '') => ({
  companyId,
  partnerType: type,
  code: '',
  name: '',
  nipt: '',
  address: '',
  city: '',
  phone: '',
  email: '',
  creditLimit: 0,
  active: true,
});

function partnerToForm(row, type) {
  return {
    companyId: row.company_id,
    partnerType: row.partner_type || type,
    code: row.code || '',
    name: row.name || '',
    nipt: row.nipt || '',
    address: row.address || '',
    city: row.city || '',
    phone: row.phone || '',
    email: row.email || '',
    creditLimit: Number(row.credit_limit || 0),
    active: row.active !== false,
  };
}

export function PartnersRegistryPage({ type }) {
  const title = type === 'SUPPLIER' ? 'Furnitorët' : 'Klientët';
  const singular = type === 'SUPPLIER' ? 'furnitorin' : 'klientin';
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankPartner(type));

  const load = async () => {
    try {
      const [partnerRows, companyRows] = await Promise.all([api(`/api/partners?type=${type}`), api('/api/companies')]);
      setRows(partnerRows);
      setCompanies(companyRows);
      setForm((current) => ({ ...current, companyId: current.companyId || companyRows[0]?.id || '', partnerType: type }));
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => { load(); }, [type]);

  const filteredRows = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [rows, search]);

  const startNew = () => {
    setEditingId(null);
    setForm(blankPartner(type, companies[0]?.id || ''));
    setOpen(true);
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm(partnerToForm(row, type));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditingId(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api(editingId ? `/api/partners/${editingId}` : '/api/partners', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(form),
      });
      close();
      await load();
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const toggle = async (row) => {
    try {
      await api(`/api/partners/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: !row.active }) });
      await load();
    } catch (toggleError) {
      setError(toggleError.message);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Fshi ${singular} “${row.name}”? Historiku i dokumenteve do të ruhet.`)) return;
    try {
      await api(`/api/partners/${row.id}`, { method: 'DELETE' });
      await load();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const columns = [
    { key: 'company_name', label: 'Kompania' },
    { key: 'code', label: 'Kodi' },
    { key: 'name', label: 'Emri' },
    { key: 'nipt', label: 'NIPT' },
    { key: 'phone', label: 'Telefon' },
    { key: 'city', label: 'Qyteti' },
    { key: 'active', label: 'Statusi', render: (row) => <StatusChip active={row.active} /> },
    { key: 'actions', label: 'Veprime', render: (row) => <RecordActions row={row} onEdit={startEdit} onToggle={toggle} onDelete={remove} /> },
  ];

  return (
    <>
      <Alert>{error}</Alert>
      <section className="card">
        <PageHeader title={title} subtitle="Kliko dy herë rreshtin ose përdor Hap/Edito." onAdd={startNew} onRefresh={load} />
        <div className="search-box registry-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kërko emër, NIPT, telefon…" /></div>
        <DataTable rows={filteredRows} columns={columns} onOpen={startEdit} />
      </section>
      {open && (
        <Modal title={editingId ? `Edito ${singular}` : `${type === 'SUPPLIER' ? 'Furnitor' : 'Klient'} i ri`} close={close}>
          <form className="form-grid" onSubmit={submit}>
            <SelectCompany companies={companies} value={form.companyId} onChange={(companyId) => setForm({ ...form, companyId })} disabled={Boolean(editingId)} />
            {[
              ['code','Kodi'],['name','Emri'],['nipt','NIPT'],['phone','Telefon'],['email','Email'],['city','Qyteti'],['address','Adresa'],['creditLimit','Limit kredie'],
            ].map(([key, label]) => (
              <label key={key} className={key === 'address' ? 'wide' : ''}>
                <span>{label}</span>
                <input type={key === 'email' ? 'email' : key === 'creditLimit' ? 'number' : 'text'} step="any" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={key === 'name'} />
              </label>
            ))}
            <label className="check wide"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Kartela aktive</label>
            <FormActions close={close} />
          </form>
        </Modal>
      )}
    </>
  );
}
