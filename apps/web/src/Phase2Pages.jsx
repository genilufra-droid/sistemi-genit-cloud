import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive, Ban, CheckCircle2, Edit3, Eye, FileDown, FileSpreadsheet,
  Plus, Printer, RefreshCcw, Search, X,
} from 'lucide-react';
import './phase2.css';
import { ProductsRegistryPage, PartnersRegistryPage } from './RegistryPages.jsx';
import {
  DOCUMENT_LABELS, exportDocumentPdf, exportDocumentXlsx, normalizeDocument,
  previewDocument, printDocument,
} from './documentExport.js';

const DEFAULT_API_URL = window.location.hostname === 'genit-web-production.up.railway.app'
  ? 'https://genit-api-production.up.railway.app'
  : 'http://localhost:3000';
const API_URL = String(window.__SG_API_URL__ || import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
const TOKEN_KEY = 'sg_cloud_token';
const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => Number(value || 0).toLocaleString('sq-AL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = (value) => Number(value || 0).toLocaleString('sq-AL', { maximumFractionDigits: 3 });

async function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Kërkesa dështoi.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Serveri nuk u përgjigj brenda 20 sekondash.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function Alert({ children, close }) {
  return children ? <div className="alert error"><span>{children}</span>{close && <button onClick={close}><X size={16} /></button>}</div> : null;
}

function Modal({ title, children, close, wide = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className={`modal phase2-modal ${wide ? 'phase2-modal-wide' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
        <header><h3>{title}</h3><button onClick={close} aria-label="Mbyll"><X /></button></header>
        {children}
      </section>
    </div>
  );
}

function Empty({ text = 'Nuk ka të dhëna.' }) {
  return <div className="empty"><Archive size={30} /><p>{text}</p></div>;
}

function Table({ columns, rows, onOpen }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || index} className={onOpen ? 'clickable-row' : ''} onDoubleClick={() => onOpen?.(row)}>
              {columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageHeader({ title, subtitle, add, refresh }) {
  return (
    <div className="section-heading">
      <div><h3>{title}</h3><p>{subtitle}</p></div>
      <div className="phase2-actions">
        {refresh && <button className="secondary small" onClick={refresh}><RefreshCcw size={16} /> Rifresko</button>}
        {add && <button className="primary small" onClick={add}><Plus size={16} /> Shto</button>}
      </div>
    </div>
  );
}

function StatusChip({ status }) {
  const label = { DRAFT: 'Draft', CONFIRMED: 'Konfirmuar', CANCELLED: 'Anuluar' }[status] || status;
  return <span className={`status-chip status-${String(status).toLowerCase()}`}>{label}</span>;
}

function FieldWithAdd({ label, value, onChange, children, onAdd, required = false }) {
  return (
    <label>
      <span>{label}</span>
      <div className="select-with-add">
        <select value={value} onChange={(event) => onChange(event.target.value)} required={required}>{children}</select>
        <button type="button" className="secondary quick-add-button" onClick={onAdd} title={`Shto ${label.toLowerCase()}`}><Plus size={16} /></button>
      </div>
    </label>
  );
}

export const PHASE2_TITLES = {
  products: ['Artikujt', 'Kartela, njësitë, koeficientët dhe çmimet'],
  suppliers: ['Furnitorët', 'Regjistri i furnitorëve'],
  customers: ['Klientët', 'Regjistri i klientëve'],
  weights: ['Formulari i Peshave', 'Pesha bruto, ambalazhi, zbritja dhe pesha e pranuar'],
  purchaseRfq: ['Kërkesa për Ofertë', 'Dokumentet e kërkesës për ofertë'],
  purchaseOrders: ['Porosi Blerjeje', 'Porositë drejt furnitorëve'],
  purchaseReceipts: ['Fletë-Hyrje / Pranime', 'Pranimet që rrisin stokun'],
  purchaseInvoices: ['Fatura Blerjeje', 'Faturat e furnitorëve'],
  salesQuotes: ['Oferta Shitjeje', 'Ofertat për klientët'],
  salesOrders: ['Porosi Shitjeje', 'Porositë e klientëve'],
  deliveryNotes: ['Fletë-Dalje', 'Dorëzimet që ulin stokun'],
  salesInvoices: ['Fatura Shitjeje', 'Faturat e klientëve'],
  stock: ['Stoku', 'Gjendja reale sipas kompanisë, magazinës dhe artikullit'],
};

export default function Phase2Page({ page }) {
  if (page === 'products') return <ProductsRegistryPage />;
  if (page === 'suppliers') return <PartnersRegistryPage type="SUPPLIER" />;
  if (page === 'customers') return <PartnersRegistryPage type="CUSTOMER" />;
  if (page === 'weights') return <WeightsPage />;
  if (page === 'stock') return <StockPage />;
  const map = {
    purchaseRfq: ['PURCHASE_RFQ', 'Kërkesa për Ofertë', 'SUPPLIER'],
    purchaseOrders: ['PURCHASE_ORDER', 'Porosi Blerjeje', 'SUPPLIER'],
    purchaseReceipts: ['PURCHASE_RECEIPT', 'Fletë-Hyrje / Pranime', 'SUPPLIER'],
    purchaseInvoices: ['PURCHASE_INVOICE', 'Fatura Blerjeje', 'SUPPLIER'],
    salesQuotes: ['SALES_QUOTE', 'Oferta Shitjeje', 'CUSTOMER'],
    salesOrders: ['SALES_ORDER', 'Porosi Shitjeje', 'CUSTOMER'],
    deliveryNotes: ['DELIVERY_NOTE', 'Fletë-Dalje', 'CUSTOMER'],
    salesInvoices: ['SALES_INVOICE', 'Fatura Shitjeje', 'CUSTOMER'],
  };
  return map[page]
    ? <DocumentsPage type={map[page][0]} title={map[page][1]} partnerType={map[page][2]} />
    : <Empty />;
}

function WeightsPage() {
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    companyId: '', warehouseId: '', supplierId: '', productId: '', documentNo: '', documentDate: today(),
    bagsCount: 0, grossWeight: 0, packagingWeight: 0, discountPercent: 0, unitPrice: 0, vehiclePlate: '', notes: '',
  });

  const load = async () => {
    try {
      const [weightRows, companyRows, warehouseRows, productRows, supplierRows] = await Promise.all([
        api('/api/weights'), api('/api/companies'), api('/api/warehouses'), api('/api/products'), api('/api/partners?type=SUPPLIER'),
      ]);
      setRows(weightRows); setCompanies(companyRows); setWarehouses(warehouseRows); setProducts(productRows); setSuppliers(supplierRows);
      const companyId = companyRows[0]?.id || '';
      setForm((current) => ({
        ...current,
        companyId: current.companyId || companyId,
        warehouseId: current.warehouseId || warehouseRows.find((row) => row.company_id === companyId)?.id || '',
        productId: current.productId || productRows.find((row) => row.company_id === companyId)?.id || '',
      }));
      setError('');
    } catch (loadError) { setError(loadError.message); }
  };

  useEffect(() => { load(); }, []);
  const net = Math.max(0, Number(form.grossWeight) - Number(form.packagingWeight));
  const accepted = net * (1 - Number(form.discountPercent) / 100);
  const total = accepted * Number(form.unitPrice);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api('/api/weights', { method: 'POST', body: JSON.stringify({ ...form, supplierId: form.supplierId || null }) });
      setOpen(false);
      setForm((current) => ({ ...current, documentNo: '', bagsCount: 0, grossWeight: 0, packagingWeight: 0, discountPercent: 0, unitPrice: 0, vehiclePlate: '', notes: '' }));
      await load();
    } catch (submitError) { setError(submitError.message); }
  };

  const confirmWeight = async (row) => {
    if (!window.confirm(`Konfirmo ${row.document_no} dhe rrit stokun?`)) return;
    try { await api(`/api/weights/${row.id}/confirm`, { method: 'POST' }); setSelected(null); await load(); }
    catch (confirmError) { setError(confirmError.message); }
  };

  const weightAsDocument = (row) => ({
    ...row,
    doc_type: 'PURCHASE_RECEIPT',
    company_name: row.company_name,
    warehouse_name: row.warehouse_name,
    partner_name: row.supplier_name,
    total_net: row.total_value,
    total_vat: 0,
    total_amount: row.total_value,
    items: [{ description: row.product_name, unit: 'kg', coefficient: 1, quantity: row.accepted_weight, freeQuantity: 0, unitPrice: row.unit_price, vatRate: 0, lineTotal: row.total_value }],
  });

  return (
    <>
      <Alert close={() => setError('')}>{error}</Alert>
      <section className="card">
        <PageHeader title="Formulari i Peshave" subtitle="Konfirmimi krijon automatikisht hyrjen në stok." refresh={load} add={() => setOpen(true)} />
        <Table rows={rows} onOpen={setSelected} columns={[
          { key: 'document_date', label: 'Data' }, { key: 'document_no', label: 'Nr.' },
          { key: 'supplier_name', label: 'Furnitori' }, { key: 'product_name', label: 'Artikulli' },
          { key: 'gross_weight', label: 'Bruto', render: (row) => `${quantity(row.gross_weight)} kg` },
          { key: 'accepted_weight', label: 'Pranuar', render: (row) => `${quantity(row.accepted_weight)} kg` },
          { key: 'total_value', label: 'Vlera', render: (row) => money(row.total_value) },
          { key: 'status', label: 'Statusi', render: (row) => <StatusChip status={row.status} /> },
          { key: 'action', label: 'Veprime', render: (row) => <button className="secondary tiny" onClick={() => setSelected(row)}><Eye size={14} /> Hap</button> },
        ]} />
      </section>

      {open && (
        <Modal title="Formular i ri peshe" close={() => setOpen(false)} wide>
          <form className="form-grid modal-form-padding" onSubmit={submit}>
            <SelectCompany companies={companies} value={form.companyId} change={(companyId) => setForm({
              ...form, companyId,
              warehouseId: warehouses.find((row) => row.company_id === companyId)?.id || '',
              supplierId: '',
              productId: products.find((row) => row.company_id === companyId)?.id || '',
            })} />
            <label><span>Magazina</span><select value={form.warehouseId} onChange={(event) => setForm({ ...form, warehouseId: event.target.value })} required>{warehouses.filter((row) => row.company_id === form.companyId).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label><span>Furnitori</span><select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">Pa furnitor</option>{suppliers.filter((row) => row.company_id === form.companyId).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label><span>Artikulli</span><select value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })} required>{products.filter((row) => row.company_id === form.companyId).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            {[
              ['documentNo','Nr. dokumenti','text'],['documentDate','Data','date'],['bagsCount','Nr. thasë','number'],
              ['grossWeight','Pesha bruto','number'],['packagingWeight','Ambalazhi','number'],['discountPercent','Zbritje %','number'],
              ['unitPrice','Çmimi/kg','number'],['vehiclePlate','Targa','text'],['notes','Shënime','text'],
            ].map(([key, label, type]) => <label key={key} className={key === 'notes' ? 'wide' : ''}><span>{label}</span><input type={type} step="any" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={['documentNo','documentDate','grossWeight'].includes(key)} /></label>)}
            <div className="wide calc-strip"><span>Neto <strong>{money(net)} kg</strong></span><span>Pranuar <strong>{money(accepted)} kg</strong></span><span>Vlera <strong>{money(total)} ALL</strong></span></div>
            <Actions close={() => setOpen(false)} />
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={`Formular peshe ${selected.document_no}`} close={() => setSelected(null)} wide>
          <div className="document-detail">
            <div className="document-detail-actions">
              {selected.status === 'DRAFT' && <button className="primary" onClick={() => confirmWeight(selected)}><CheckCircle2 size={16} /> Konfirmo</button>}
              <button className="secondary" onClick={() => previewDocument(weightAsDocument(selected), 'Formulari i Peshave')}><Eye size={16} /> Preview</button>
              <button className="secondary" onClick={() => printDocument(weightAsDocument(selected), 'Formulari i Peshave')}><Printer size={16} /> Print</button>
              <button className="secondary" onClick={() => exportDocumentPdf(weightAsDocument(selected), 'Formulari i Peshave')}><FileDown size={16} /> PDF</button>
              <button className="secondary" onClick={() => exportDocumentXlsx(weightAsDocument(selected), 'Formulari i Peshave')}><FileSpreadsheet size={16} /> Excel</button>
            </div>
            <div className="detail-grid">
              <Detail label="Data" value={selected.document_date} /><Detail label="Statusi" value={selected.status} />
              <Detail label="Furnitori" value={selected.supplier_name} /><Detail label="Artikulli" value={selected.product_name} />
              <Detail label="Pesha bruto" value={`${quantity(selected.gross_weight)} kg`} /><Detail label="Ambalazhi" value={`${quantity(selected.packaging_weight)} kg`} />
              <Detail label="Pesha neto" value={`${quantity(selected.net_weight)} kg`} /><Detail label="Pesha e pranuar" value={`${quantity(selected.accepted_weight)} kg`} />
              <Detail label="Vlera" value={`${money(selected.total_value)} ALL`} />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function StockPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const load = async () => {
    try { setRows(await api('/api/stock')); setError(''); }
    catch (loadError) { setError(loadError.message); }
  };
  useEffect(() => { load(); }, []);
  const filtered = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <Alert close={() => setError('')}>{error}</Alert>
      <section className="card">
        <PageHeader title="Gjendja e Stokut" subtitle="Llogaritet vetëm nga lëvizjet e konfirmuara." refresh={load} />
        <div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kërko kompani, magazinë, artikull…" /></div>
        <Table rows={filtered} columns={[
          { key: 'company_name', label: 'Kompania' }, { key: 'warehouse_name', label: 'Magazina' },
          { key: 'code', label: 'Kodi' }, { key: 'name', label: 'Artikulli' },
          { key: 'quantity_base', label: 'Gjendje bazë', render: (row) => `${quantity(row.quantity_base)} ${row.base_unit}` },
          { key: 'quantity_pack', label: 'Koli', render: (row) => quantity(row.quantity_pack) },
        ]} />
      </section>
    </>
  );
}

function DocumentsPage({ type, title, partnerType }) {
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [partners, setPartners] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [quick, setQuick] = useState(null);
  const [busy, setBusy] = useState(false);

  const blank = (companyId = '') => ({
    companyId,
    warehouseId: '',
    partnerId: '',
    docType: type,
    documentNo: '',
    documentDate: today(),
    notes: '',
    items: [{ productId: '', unit: 'copë', coefficient: 1, quantity: 1, freeQuantity: 0, unitPrice: 0, vatRate: 0 }],
  });
  const [form, setForm] = useState(blank());

  const load = async () => {
    try {
      const [documentRows, companyRows, warehouseRows, partnerRows, productRows, categoryRows] = await Promise.all([
        api(`/api/documents?type=${type}`), api('/api/companies'), api('/api/warehouses'),
        api(`/api/partners?type=${partnerType}`), api('/api/products'), api('/api/categories'),
      ]);
      setRows(documentRows); setCompanies(companyRows); setWarehouses(warehouseRows); setPartners(partnerRows); setProducts(productRows); setCategories(categoryRows);
      const companyId = companyRows[0]?.id || '';
      setForm((current) => {
        if (current.companyId) return { ...current, docType: type };
        const firstProduct = productRows.find((row) => row.company_id === companyId && row.active !== false);
        return {
          ...blank(companyId),
          warehouseId: warehouseRows.find((row) => row.company_id === companyId && row.active !== false)?.id || '',
          items: [lineFromProduct(firstProduct, type)],
        };
      });
      if (selected) setSelected(documentRows.find((row) => row.id === selected.id) || null);
      setError('');
    } catch (loadError) { setError(loadError.message); }
  };

  useEffect(() => { load(); }, [type]);

  const filteredRows = useMemo(() => rows.filter((row) => (
    `${row.document_no} ${row.partner_name || ''} ${row.warehouse_name || ''} ${row.status}`.toLowerCase().includes(search.toLowerCase())
  )), [rows, search]);

  const companyProducts = products.filter((product) => product.company_id === form.companyId && product.active !== false);
  const totals = useMemo(() => calculateTotals(form.items), [form.items]);

  const openNew = () => {
    const companyId = companies[0]?.id || '';
    const firstProduct = products.find((row) => row.company_id === companyId && row.active !== false);
    setEditingId(null);
    setForm({
      ...blank(companyId),
      warehouseId: warehouses.find((row) => row.company_id === companyId && row.active !== false)?.id || '',
      items: [lineFromProduct(firstProduct, type)],
    });
    setOpen(true);
  };

  const openEdit = (row) => {
    if (row.status !== 'DRAFT') return;
    setEditingId(row.id);
    setForm({
      companyId: row.company_id,
      warehouseId: row.warehouse_id || '',
      partnerId: row.partner_id || '',
      docType: row.doc_type,
      documentNo: row.document_no || '',
      documentDate: row.document_date || today(),
      notes: row.notes || '',
      items: (row.items || []).map((item) => ({
        productId: item.productId,
        unit: item.unit || 'copë',
        coefficient: Number(item.coefficient || 1),
        quantity: Number(item.quantity || 0),
        freeQuantity: Number(item.freeQuantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        vatRate: Number(item.vatRate || 0),
      })),
    });
    setSelected(null);
    setOpen(true);
  };

  const setCompany = (companyId) => {
    const firstProduct = products.find((row) => row.company_id === companyId && row.active !== false);
    setForm({
      ...blank(companyId),
      warehouseId: warehouses.find((row) => row.company_id === companyId && row.active !== false)?.id || '',
      items: [lineFromProduct(firstProduct, type)],
    });
  };

  const setItem = (index, key, value) => setForm((current) => ({
    ...current,
    items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
  }));

  const selectProduct = (index, productId) => {
    const product = products.find((row) => row.id === productId);
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? lineFromProduct(product, type, item) : item),
    }));
  };

  const selectUnit = (index, unit) => {
    const item = form.items[index];
    const product = products.find((row) => row.id === item.productId);
    const coefficient = unit === product?.pack_unit
      ? Number(product.pack_coefficient || 1)
      : unit === product?.pallet_unit
        ? Number(product.pallet_coefficient || 1)
        : 1;
    setForm((current) => ({
      ...current,
      items: current.items.map((line, itemIndex) => itemIndex === index ? { ...line, unit, coefficient } : line),
    }));
  };

  const addItem = () => setForm((current) => ({
    ...current,
    items: [...current.items, lineFromProduct(companyProducts[0], type)],
  }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api(editingId ? `/api/documents/${editingId}` : '/api/documents', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...form, warehouseId: form.warehouseId || null, partnerId: form.partnerId || null }),
      });
      setOpen(false); setEditingId(null); await load();
    } catch (submitError) { setError(submitError.message); }
    finally { setBusy(false); }
  };

  const confirmDocument = async (row) => {
    if (!window.confirm(`Konfirmo dokumentin ${row.document_no}?`)) return;
    setBusy(true);
    try { await api(`/api/documents/${row.id}/confirm`, { method: 'POST' }); await load(); }
    catch (confirmError) { setError(confirmError.message); }
    finally { setBusy(false); }
  };

  const cancelDocument = async (row) => {
    if (!window.confirm(`Anulo dokumentin ${row.document_no}? Nëse ka prekur stokun, lëvizja do të kthehet mbrapsht.`)) return;
    setBusy(true);
    try { await api(`/api/documents/${row.id}/cancel`, { method: 'POST' }); await load(); }
    catch (cancelError) { setError(cancelError.message); }
    finally { setBusy(false); }
  };

  const quickCreated = async (kind, record, context = {}) => {
    if (kind === 'partner') {
      setPartners((current) => [...current, record]);
      setForm((current) => ({ ...current, partnerId: record.id }));
    }
    if (kind === 'warehouse') {
      setWarehouses((current) => [...current, record]);
      setForm((current) => ({ ...current, warehouseId: record.id }));
    }
    if (kind === 'product') {
      setProducts((current) => [...current, record]);
      selectProduct(context.index ?? 0, record.id);
    }
    setQuick(null);
  };

  return (
    <>
      <Alert close={() => setError('')}>{error}</Alert>
      <section className="card">
        <PageHeader title={title} subtitle="Kliko dy herë rreshtin ose përdor Hap për detajet dhe eksportet." refresh={load} add={openNew} />
        <div className="phase2-toolbar">
          <div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kërko numër, partner, magazinë, status…" /></div>
        </div>
        <Table rows={filteredRows} onOpen={setSelected} columns={[
          { key: 'document_date', label: 'Data' }, { key: 'document_no', label: 'Nr.' },
          { key: 'partner_name', label: partnerType === 'SUPPLIER' ? 'Furnitori' : 'Klienti' },
          { key: 'warehouse_name', label: 'Magazina' },
          { key: 'total_amount', label: 'Totali', render: (row) => `${money(row.total_amount)} ALL` },
          { key: 'status', label: 'Statusi', render: (row) => <StatusChip status={row.status} /> },
          { key: 'actions', label: 'Veprime', render: (row) => <button className="secondary tiny" onClick={() => setSelected(row)}><Eye size={14} /> Hap</button> },
        ]} />
      </section>

      {open && (
        <Modal title={`${editingId ? 'Edito' : 'Dokument i ri'} — ${title}`} close={() => { setOpen(false); setEditingId(null); }} wide>
          <form className="document-form" onSubmit={submit}>
            <div className="form-grid">
              <SelectCompany companies={companies} value={form.companyId} change={setCompany} disabled={Boolean(editingId)} />
              <FieldWithAdd label="Magazina" value={form.warehouseId} onChange={(warehouseId) => setForm({ ...form, warehouseId })} onAdd={() => setQuick({ kind: 'warehouse' })}>
                <option value="">Pa magazinë</option>
                {warehouses.filter((row) => row.company_id === form.companyId && row.active !== false).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </FieldWithAdd>
              <FieldWithAdd label={partnerType === 'SUPPLIER' ? 'Furnitori' : 'Klienti'} value={form.partnerId} onChange={(partnerId) => setForm({ ...form, partnerId })} onAdd={() => setQuick({ kind: 'partner' })}>
                <option value="">Pa partner</option>
                {partners.filter((row) => row.company_id === form.companyId && row.active !== false).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </FieldWithAdd>
              <label><span>Nr. dokumenti</span><input value={form.documentNo} onChange={(event) => setForm({ ...form, documentNo: event.target.value })} placeholder="Automatik nëse lihet bosh" /></label>
              <label><span>Data</span><input type="date" value={form.documentDate} onChange={(event) => setForm({ ...form, documentDate: event.target.value })} required /></label>
              <label><span>Shënime</span><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            </div>

            <div className="doc-lines">
              <div className="doc-line-head"><strong>Rreshtat e dokumentit</strong><button type="button" className="secondary small" onClick={addItem}><Plus size={15} /> Shto rresht</button></div>
              {form.items.map((item, index) => {
                const product = products.find((row) => row.id === item.productId);
                const unitOptions = [...new Set([product?.base_unit, product?.pack_unit, product?.pallet_unit].filter(Boolean))];
                const lineNet = Number(item.quantity || 0) * Number(item.unitPrice || 0);
                const lineTotal = lineNet * (1 + Number(item.vatRate || 0) / 100);
                return (
                  <div className="doc-line-card" key={index}>
                    <div className="doc-line-main">
                      <label className="product-field"><span>Artikulli</span><div className="select-with-add"><select value={item.productId} onChange={(event) => selectProduct(index, event.target.value)} required><option value="">Zgjidh artikullin</option>{companyProducts.map((row) => <option key={row.id} value={row.id}>{row.code} — {row.name}</option>)}</select><button type="button" className="secondary quick-add-button" onClick={() => setQuick({ kind: 'product', index })}><Plus size={16} /></button></div></label>
                      <label><span>Njësia</span><select value={item.unit} onChange={(event) => selectUnit(index, event.target.value)}>{unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
                      <label><span>Koeficienti</span><input type="number" step="any" min="0.000001" value={item.coefficient} onChange={(event) => setItem(index, 'coefficient', event.target.value)} required /></label>
                      <label><span>Sasia</span><input type="number" step="any" min="0.000001" value={item.quantity} onChange={(event) => setItem(index, 'quantity', event.target.value)} required /></label>
                      <label><span>Dhuratë</span><input type="number" step="any" min="0" value={item.freeQuantity} onChange={(event) => setItem(index, 'freeQuantity', event.target.value)} /></label>
                      <label><span>Çmimi</span><input type="number" step="any" min="0" value={item.unitPrice} onChange={(event) => setItem(index, 'unitPrice', event.target.value)} /></label>
                      <label><span>TVSH %</span><input type="number" step="any" min="0" max="100" value={item.vatRate} onChange={(event) => setItem(index, 'vatRate', event.target.value)} /></label>
                      <div className="line-total"><span>Vlera</span><strong>{money(lineTotal)} ALL</strong></div>
                      <button type="button" className="icon-button remove-line" onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} disabled={form.items.length === 1}><X size={16} /></button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="document-form-footer">
              <div className="document-totals"><span>Neto <strong>{money(totals.net)} ALL</strong></span><span>TVSH <strong>{money(totals.vat)} ALL</strong></span><span className="grand-total">Totali <strong>{money(totals.total)} ALL</strong></span></div>
              <div className="modal-actions"><button type="button" className="secondary" onClick={() => { setOpen(false); setEditingId(null); }}>Anulo</button><button className="primary" disabled={busy}>{busy ? 'Duke ruajtur…' : editingId ? 'Ruaj ndryshimet' : 'Ruaj dokumentin'}</button></div>
            </div>
          </form>
        </Modal>
      )}

      {selected && (
        <DocumentDetails
          row={selected}
          title={title}
          partnerType={partnerType}
          busy={busy}
          close={() => setSelected(null)}
          edit={() => openEdit(selected)}
          confirm={() => confirmDocument(selected)}
          cancel={() => cancelDocument(selected)}
        />
      )}

      {quick && (
        <QuickCreateModal
          kind={quick.kind}
          companyId={form.companyId}
          partnerType={partnerType}
          categories={categories.filter((row) => row.company_id === form.companyId && row.active !== false)}
          close={() => setQuick(null)}
          created={(kind, record) => quickCreated(kind, record, quick)}
          error={(message) => setError(message)}
        />
      )}
    </>
  );
}

function DocumentDetails({ row, title, partnerType, busy, close, edit, confirm, cancel }) {
  const document = normalizeDocument(row);
  return (
    <Modal title={`${title} ${document.documentNo}`} close={close} wide>
      <div className="document-detail">
        <div className="document-detail-actions">
          {row.status === 'DRAFT' && <button className="secondary" onClick={edit}><Edit3 size={16} /> Edito</button>}
          {row.status === 'DRAFT' && <button className="primary" onClick={confirm} disabled={busy}><CheckCircle2 size={16} /> Konfirmo</button>}
          {row.status !== 'CANCELLED' && <button className="danger" onClick={cancel} disabled={busy}><Ban size={16} /> Anulo</button>}
          <span className="action-separator" />
          <button className="secondary" onClick={() => previewDocument(row, title)}><Eye size={16} /> Preview</button>
          <button className="secondary" onClick={() => printDocument(row, title)}><Printer size={16} /> Print</button>
          <button className="secondary" onClick={() => exportDocumentPdf(row, title)}><FileDown size={16} /> PDF</button>
          <button className="secondary" onClick={() => exportDocumentXlsx(row, title)}><FileSpreadsheet size={16} /> Excel</button>
        </div>
        <div className="detail-grid">
          <Detail label="Lloji" value={DOCUMENT_LABELS[row.doc_type] || title} />
          <Detail label="Statusi" value={<StatusChip status={row.status} />} />
          <Detail label="Data" value={row.document_date} />
          <Detail label="Nr. dokumenti" value={row.document_no} />
          <Detail label={partnerType === 'SUPPLIER' ? 'Furnitori' : 'Klienti'} value={row.partner_name || '—'} />
          <Detail label="Magazina" value={row.warehouse_name || '—'} />
        </div>
        <Table rows={document.items} columns={[
          { key: 'description', label: 'Artikulli' }, { key: 'unit', label: 'Njësia' },
          { key: 'coefficient', label: 'Koef.' }, { key: 'quantity', label: 'Sasia' },
          { key: 'freeQuantity', label: 'Dhuratë' }, { key: 'unitPrice', label: 'Çmimi', render: (item) => money(item.unitPrice) },
          { key: 'vatRate', label: 'TVSH %' }, { key: 'lineTotal', label: 'Vlera', render: (item) => money(item.lineTotal || (item.lineNet + item.lineVat)) },
        ]} />
        <div className="document-detail-totals"><span>Neto <strong>{money(document.totalNet)} ALL</strong></span><span>TVSH <strong>{money(document.totalVat)} ALL</strong></span><span>Totali <strong>{money(document.totalAmount)} ALL</strong></span></div>
        {row.notes && <div className="document-notes"><strong>Shënime</strong><p>{row.notes}</p></div>}
      </div>
    </Modal>
  );
}

function QuickCreateModal({ kind, companyId, partnerType, categories, close, created, error }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(kind === 'partner'
    ? { code: '', name: '', nipt: '', phone: '' }
    : kind === 'warehouse'
      ? { code: '', name: '', address: '' }
      : { code: '', barcode: '', name: '', categoryId: '', newCategoryName: '', baseUnit: 'copë', packUnit: 'koli', palletUnit: 'paletë', packCoefficient: 1, palletCoefficient: 1, purchasePrice: 0, salePrice: 0, vatRate: 0 });

  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      if (kind === 'partner') {
        const record = await api('/api/partners', { method: 'POST', body: JSON.stringify({ companyId, partnerType, ...form, address: '', city: '', email: '', creditLimit: 0, active: true }) });
        created('partner', record);
      }
      if (kind === 'warehouse') {
        const record = await api('/api/warehouses', { method: 'POST', body: JSON.stringify({ companyId, name: form.name, code: form.code, address: form.address }) });
        created('warehouse', record);
      }
      if (kind === 'product') {
        let categoryId = form.categoryId || null;
        if (form.newCategoryName.trim()) {
          const category = await api('/api/categories', { method: 'POST', body: JSON.stringify({ companyId, name: form.newCategoryName.trim(), code: '', active: true }) });
          categoryId = category.id;
        }
        const record = await api('/api/products', { method: 'POST', body: JSON.stringify({
          companyId, categoryId, code: form.code, barcode: form.barcode, name: form.name,
          baseUnit: form.baseUnit, packUnit: form.packUnit, palletUnit: form.palletUnit,
          packCoefficient: form.packCoefficient, palletCoefficient: form.palletCoefficient,
          purchasePrice: form.purchasePrice, salePrice: form.salePrice, vatRate: form.vatRate, active: true,
        }) });
        created('product', record);
      }
    } catch (submitError) { error(submitError.message); }
    finally { setBusy(false); }
  };

  const title = kind === 'partner'
    ? `Shto shpejt ${partnerType === 'SUPPLIER' ? 'furnitor' : 'klient'}`
    : kind === 'warehouse' ? 'Shto shpejt magazinë' : 'Shto shpejt artikull';

  return (
    <Modal title={title} close={close} wide={kind === 'product'}>
      <form className="form-grid modal-form-padding" onSubmit={submit}>
        {kind === 'partner' && <>
          <label><span>Kodi</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>
          <label className="wide"><span>Emri</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus /></label>
          <label><span>NIPT</span><input value={form.nipt} onChange={(event) => setForm({ ...form, nipt: event.target.value })} /></label>
          <label><span>Telefon</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        </>}
        {kind === 'warehouse' && <>
          <label><span>Kodi</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required autoFocus /></label>
          <label><span>Emri</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label className="wide"><span>Adresa</span><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
        </>}
        {kind === 'product' && <>
          <label><span>Kodi</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required autoFocus /></label>
          <label><span>Barkodi</span><input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></label>
          <label className="wide"><span>Emri</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label><span>Kategoria ekzistuese</span><select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value, newCategoryName: '' })}><option value="">Pa kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label><span>Ose kategori e re</span><input value={form.newCategoryName} onChange={(event) => setForm({ ...form, newCategoryName: event.target.value, categoryId: '' })} /></label>
          {[
            ['baseUnit','Njësia bazë','text'],['packUnit','Njësia koli','text'],['palletUnit','Njësia paletë','text'],
            ['packCoefficient','Copë për koli','number'],['palletCoefficient','Copë për paletë','number'],
            ['purchasePrice','Çmimi blerje','number'],['salePrice','Çmimi shitje','number'],['vatRate','TVSH %','number'],
          ].map(([key, label, type]) => <label key={key}><span>{label}</span><input type={type} step="any" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}
        </>}
        <div className="modal-actions wide"><button type="button" className="secondary" onClick={close}>Anulo</button><button className="primary" disabled={busy}>{busy ? 'Duke ruajtur…' : 'Ruaj dhe zgjidh'}</button></div>
      </form>
    </Modal>
  );
}

function lineFromProduct(product, docType, previous = {}) {
  if (!product) return { productId: '', unit: 'copë', coefficient: 1, quantity: previous.quantity || 1, freeQuantity: previous.freeQuantity || 0, unitPrice: 0, vatRate: 0 };
  const purchase = String(docType).startsWith('PURCHASE');
  return {
    productId: product.id,
    unit: product.base_unit || 'copë',
    coefficient: 1,
    quantity: previous.quantity || 1,
    freeQuantity: previous.freeQuantity || 0,
    unitPrice: purchase ? Number(product.purchase_price || 0) : Number(product.sale_price || 0),
    vatRate: Number(product.vat_rate || 0),
  };
}

function calculateTotals(items) {
  return items.reduce((result, item) => {
    const net = Number(item.quantity || 0) * Number(item.unitPrice || 0);
    const vat = net * Number(item.vatRate || 0) / 100;
    return { net: result.net + net, vat: result.vat + vat, total: result.total + net + vat };
  }, { net: 0, vat: 0, total: 0 });
}

function Detail({ label, value }) {
  return <div className="detail-item"><span>{label}</span><strong>{value || '—'}</strong></div>;
}

function SelectCompany({ companies, value, change, disabled = false }) {
  return <label><span>Kompania</span><select value={value} onChange={(event) => change(event.target.value)} required disabled={disabled}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>;
}

function Actions({ close }) {
  return <div className="modal-actions wide"><button type="button" className="secondary" onClick={close}>Anulo</button><button className="primary">Ruaj</button></div>;
}
