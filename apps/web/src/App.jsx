import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Activity, Archive, Banknote, Boxes, Building2, CheckCircle2, ChevronDown,
  CircleDollarSign, ClipboardList, Factory, FileSpreadsheet, Gauge, Landmark,
  Layers3, LogOut, Menu, PackageCheck, Plus, RefreshCcw, Scale, Search,
  Settings, ShieldCheck, Store, Tractor, UserCog, Users, Warehouse, X,
} from 'lucide-react';
import Phase2Page, { PHASE2_TITLES } from './Phase2Pages.jsx';

const DEFAULT_API_URL = window.location.hostname === 'genit-web-production.up.railway.app'
  ? 'https://genit-api-production.up.railway.app'
  : 'http://localhost:3000';
const API_URL = String(window.__SG_API_URL__ || import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
const TOKEN_KEY = 'sg_cloud_token';
const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Administrator', COMPANY_ADMIN: 'Administrator Kompanie', MANAGER: 'Menaxher',
  FINANCIER: 'Financier', MAGAZINIER: 'Magazinier', OPERATOR_PESHORE: 'Operator Peshoreje',
  SHITES: 'Shitës', ARKETAR: 'Arkëtar', AUDITOR: 'Auditues', READ_ONLY: 'Vetëm Lexim',
};

const navGroups = [
  { title: 'Cloud Core', items: [
    { id: 'dashboard', label: 'Dashboard', icon: Gauge, active: true },
    { id: 'companies', label: 'Kompanitë', icon: Building2, active: true },
    { id: 'warehouses', label: 'Magazinat', icon: Warehouse, active: true },
    { id: 'users', label: 'Përdoruesit', icon: Users, active: true, roles: ['SUPER_ADMIN', 'COMPANY_ADMIN'] },
    { id: 'audit', label: 'Audit Log', icon: ShieldCheck, active: true, roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'AUDITOR'] },
  ]},
  { title: 'Regjistra — Faza 2', items: [
    { id: 'products', label: 'Artikujt', icon: Archive, active: true },
    { id: 'suppliers', label: 'Furnitorët', icon: Users, active: true },
    { id: 'customers', label: 'Klientët', icon: UserCog, active: true },
  ]},
  { title: 'Blerje & Peshim — Faza 2', items: [
    { id: 'weights', label: 'Formulari i Peshave', icon: Scale, active: true }, { id: 'purchaseRfq', label: 'Kërkesa për Ofertë', icon: ClipboardList, active: true },
    { id: 'purchaseOrders', label: 'Porosi Blerjeje', icon: FileSpreadsheet, active: true }, { id: 'purchaseReceipts', label: 'Pranime', icon: PackageCheck, active: true },
    { id: 'purchaseInvoices', label: 'Fatura Blerjeje', icon: Archive, active: true },
  ]},
  { title: 'Shitje & Magazinë — Faza 2', items: [
    { id: 'salesQuotes', label: 'Oferta Shitjeje', icon: Store, active: true }, { id: 'salesOrders', label: 'Porosi Shitjeje', icon: ClipboardList, active: true },
    { id: 'deliveryNotes', label: 'Fletë-Dalje', icon: Boxes, active: true }, { id: 'salesInvoices', label: 'Fatura Shitjeje', icon: CircleDollarSign, active: true }, { id: 'stock', label: 'Stoku', icon: Layers3, active: true },
  ]},
  { title: 'Gjurmueshmëri — Faza 3', items: [
    { label: 'Ferma & Origjina', icon: Tractor }, { label: 'Lote', icon: PackageCheck },
    { label: 'Proces & Paketim', icon: Factory },
  ]},
  { title: 'Arka & Banka — Faza 3', items: [
    { label: 'Arka', icon: Banknote }, { label: 'Banka', icon: Landmark },
    { label: 'Raportet Financiare', icon: FileSpreadsheet },
  ]},
];

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
  if (!response.ok) {
    const error = new Error(data.message || 'Kërkesa dështoi.');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function Alert({ type = 'error', children, onClose }) {
  if (!children) return null;
  return <div className={`alert ${type}`}><span>{children}</span>{onClose && <button onClick={onClose}><X size={16} /></button>}</div>;
}

function Spinner() { return <div className="spinner" aria-label="Duke ngarkuar" />; }

function AuthShell({ title, subtitle, children }) {
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="brand-mark"><Layers3 size={36} /></div>
        <p className="eyebrow">ERP ONLINE • MULTI-USER</p>
        <h1>Sistemi Genit Cloud</h1>
        <p>Platformë qendrore për kompani, magazina, përdorues dhe dokumente të lidhura në kohë reale.</p>
        <div className="auth-feature"><CheckCircle2 size={18} /> PostgreSQL qendror</div>
        <div className="auth-feature"><CheckCircle2 size={18} /> Role dhe izolim kompanish</div>
        <div className="auth-feature"><CheckCircle2 size={18} /> Audit i çdo veprimi</div>
      </section>
      <section className="auth-card">
        <p className="eyebrow">SISTEMI GENIT</p>
        <h2>{title}</h2>
        <p className="muted">{subtitle}</p>
        {children}
      </section>
    </main>
  );
}

function SetupPage({ onComplete }) {
  const [form, setForm] = useState({ organizationName: 'Sistemi Genit', companyName: '', companyNipt: '', warehouseName: 'Magazina Qendrore', adminName: '', username: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api('/api/setup/admin', { method: 'POST', body: JSON.stringify(form) });
      localStorage.setItem(TOKEN_KEY, result.token);
      onComplete(result.user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Konfigurimi i parë" subtitle="Krijo organizatën, kompaninë, magazinën dhe Super Administratorin. Ky ekran bllokohet pas ruajtjes së parë.">
      <Alert>{error}</Alert>
      <form onSubmit={submit} className="form-grid">
        <label><span>Organizata</span><input name="organizationName" value={form.organizationName} onChange={change} required /></label>
        <label><span>Kompania</span><input name="companyName" value={form.companyName} onChange={change} placeholder="p.sh. BIOBES SHPK" required /></label>
        <label><span>NIPT</span><input name="companyNipt" value={form.companyNipt} onChange={change} /></label>
        <label><span>Magazina e parë</span><input name="warehouseName" value={form.warehouseName} onChange={change} required /></label>
        <label className="wide"><span>Emri i administratorit</span><input name="adminName" value={form.adminName} onChange={change} required /></label>
        <label><span>Username</span><input name="username" value={form.username} onChange={change} autoCapitalize="none" required /></label>
        <label><span>Email</span><input type="email" name="email" value={form.email} onChange={change} /></label>
        <label className="wide"><span>Fjalëkalimi (minimumi 8 karaktere)</span><input type="password" name="password" value={form.password} onChange={change} minLength={8} required /></label>
        <button className="primary wide" disabled={busy}>{busy ? <><Spinner /> Duke krijuar…</> : 'Krijo Sistemin Cloud'}</button>
      </form>
    </AuthShell>
  );
}

function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(form) });
      localStorage.setItem(TOKEN_KEY, result.token); onLogin(result.user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Hyr në sistem" subtitle="Përdor llogarinë individuale. Të gjitha veprimet regjistrohen në Audit Log.">
      <Alert>{error}</Alert>
      <form onSubmit={submit} className="login-form">
        <label><span>Username ose email</span><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoCapitalize="none" required /></label>
        <label><span>Fjalëkalimi</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <button className="primary" disabled={busy}>{busy ? <><Spinner /> Duke hyrë…</> : 'Hyr'}</button>
      </form>
    </AuthShell>
  );
}

function Modal({ title, children, onClose }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><header><h3>{title}</h3><button onClick={onClose}><X /></button></header>{children}</section></div>;
}

function DataTable({ columns, rows, empty = 'Nuk ka të dhëna.' }) {
  if (!rows.length) return <div className="empty"><Archive size={32} /><p>{empty}</p></div>;
  return <div className="table-wrap"><table><thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : row[c.key] ?? '—'}</td>)}</tr>)}</tbody></table></div>;
}

function Header({ title, subtitle, user, onMenu, onLogout, live }) {
  return <header className="topbar"><div className="topbar-title"><button className="mobile-menu" onClick={onMenu}><Menu /></button><div><h1>{title}</h1><p>{subtitle}</p></div></div><div className="topbar-actions"><span className={`live-pill ${live ? 'on' : ''}`}><span />{live ? 'Live' : 'Offline'}</span><div className="user-chip"><UserCog size={18} /><span><strong>{user.fullName}</strong><small>{ROLE_LABELS[user.role]}</small></span></div><button className="icon-button" onClick={onLogout} title="Dil"><LogOut size={19} /></button></div></header>;
}

function Dashboard({ refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { setData(await api('/api/dashboard')); setError(''); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  const cards = data ? [
    ['Kompani', data.companies, Building2], ['Magazina', data.warehouses, Warehouse],
    ['Përdorues aktivë', data.activeUsers, Users], ['Veprime sot', data.actionsToday, Activity],
  ] : [];
  return <><Alert>{error}</Alert><div className="hero-card"><div><p className="eyebrow">FAZA 2 • OPERACIONET ERP</p><h2>Platforma qendrore është aktive</h2><p>Platforma online tani përfshin regjistrat, peshimin, blerjet, shitjet dhe stokun me transaksione PostgreSQL.</p></div><div className="hero-symbol"><Layers3 /></div></div><div className="kpi-grid">{!data ? <Spinner /> : cards.map(([label, value, Icon]) => <article className="kpi" key={label}><div className="kpi-icon"><Icon /></div><span>{label}</span><strong>{value}</strong></article>)}</div><section className="card"><div className="section-heading"><div><h3>Statusi i migrimit</h3><p>Versioni HTML 6.4 ruhet në dosjen <code>legacy/</code> si referencë funksionale.</p></div><span className="status-chip">{data?.phase || 'Cloud Core'}</span></div><div className="phase-list"><div className="phase done"><CheckCircle2 /><span><strong>Faza 1</strong> Login, multi-company, magazina, përdorues, audit, real-time</span></div><div className="phase"><span className="phase-no">2</span><span><strong>Faza 2</strong> Peshim, blerje, shitje dhe stok me transaksione PostgreSQL</span></div><div className="phase"><span className="phase-no">3</span><span><strong>Faza 3</strong> Gjurmueshmëri, Arka, Banka dhe raportet e formatuara</span></div></div></section></>;
}

function Companies({ user, refreshKey, notify }) {
  const [rows, setRows] = useState([]); const [modal, setModal] = useState(false); const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', nipt: '', address: '', phone: '', email: '', currency: 'ALL' });
  const load = useCallback(async () => { try { setRows(await api('/api/companies')); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  const submit = async (e) => { e.preventDefault(); try { await api('/api/companies', { method: 'POST', body: JSON.stringify(form) }); setModal(false); setForm({ name: '', nipt: '', address: '', phone: '', email: '', currency: 'ALL' }); notify('Kompania u krijua.'); load(); } catch (e2) { setError(e2.message); } };
  return <><Alert>{error}</Alert><section className="card"><div className="section-heading"><div><h3>Kompanitë</h3><p>Çdo dokument i ardhshëm izolohet sipas organizatës dhe kompanisë.</p></div>{user.role === 'SUPER_ADMIN' && <button className="primary small" onClick={() => setModal(true)}><Plus size={17} /> Shto kompani</button>}</div><DataTable rows={rows} columns={[{ key: 'name', label: 'Kompania' }, { key: 'nipt', label: 'NIPT' }, { key: 'currency', label: 'Monedha' }, { key: 'active', label: 'Statusi', render: (r) => <span className={`status-chip ${r.active ? '' : 'off'}`}>{r.active ? 'Aktive' : 'Joaktive'}</span> }]} /></section>{modal && <Modal title="Kompani e re" onClose={() => setModal(false)}><form className="form-grid" onSubmit={submit}>{Object.entries({ name: 'Emri', nipt: 'NIPT', address: 'Adresa', phone: 'Telefon', email: 'Email', currency: 'Monedha' }).map(([name, label]) => <label key={name} className={name === 'address' ? 'wide' : ''}><span>{label}</span><input name={name} type={name === 'email' ? 'email' : 'text'} value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} required={name === 'name' || name === 'currency'} /></label>)}<div className="modal-actions wide"><button type="button" className="secondary" onClick={() => setModal(false)}>Anulo</button><button className="primary">Ruaj</button></div></form></Modal>}</>;
}

function Warehouses({ user, refreshKey, notify }) {
  const [rows, setRows] = useState([]); const [companies, setCompanies] = useState([]); const [modal, setModal] = useState(false); const [error, setError] = useState('');
  const [form, setForm] = useState({ companyId: '', name: '', code: '', address: '' });
  const load = useCallback(async () => { try { const [w, c] = await Promise.all([api('/api/warehouses'), api('/api/companies')]); setRows(w); setCompanies(c); setForm((f) => ({ ...f, companyId: f.companyId || c[0]?.id || '' })); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  const submit = async (e) => { e.preventDefault(); try { await api('/api/warehouses', { method: 'POST', body: JSON.stringify(form) }); setModal(false); setForm({ companyId: companies[0]?.id || '', name: '', code: '', address: '' }); notify('Magazina u krijua.'); load(); } catch (e2) { setError(e2.message); } };
  return <><Alert>{error}</Alert><section className="card"><div className="section-heading"><div><h3>Magazinat</h3><p>Aksesi dhe stoku do të kontrollohen sipas magazinës.</p></div>{['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(user.role) && <button className="primary small" onClick={() => setModal(true)}><Plus size={17} /> Shto magazinë</button>}</div><DataTable rows={rows} columns={[{ key: 'company_name', label: 'Kompania' }, { key: 'name', label: 'Magazina' }, { key: 'code', label: 'Kodi' }, { key: 'address', label: 'Adresa' }, { key: 'active', label: 'Statusi', render: (r) => <span className="status-chip">{r.active ? 'Aktive' : 'Joaktive'}</span> }]} /></section>{modal && <Modal title="Magazinë e re" onClose={() => setModal(false)}><form className="form-grid" onSubmit={submit}><label className="wide"><span>Kompania</span><select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} required>{companies.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label><span>Emri</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label><span>Kodi</span><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required /></label><label className="wide"><span>Adresa</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label><div className="modal-actions wide"><button type="button" className="secondary" onClick={() => setModal(false)}>Anulo</button><button className="primary">Ruaj</button></div></form></Modal>}</>;
}

function UsersPage({ currentUser, refreshKey, notify }) {
  const [rows, setRows] = useState([]); const [companies, setCompanies] = useState([]); const [warehouses, setWarehouses] = useState([]); const [roles, setRoles] = useState([]); const [modal, setModal] = useState(false); const [error, setError] = useState('');
  const [form, setForm] = useState({ fullName: '', username: '', email: '', password: '', role: 'READ_ONLY', companyIds: [], warehouseIds: [] });
  const load = useCallback(async () => { try { const [u, c, w, r] = await Promise.all([api('/api/users'), api('/api/companies'), api('/api/warehouses'), api('/api/meta/roles')]); setRows(u); setCompanies(c); setWarehouses(w); setRoles(r.roles); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  const toggle = (key, id) => setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));
  const submit = async (e) => { e.preventDefault(); try { await api('/api/users', { method: 'POST', body: JSON.stringify(form) }); setModal(false); setForm({ fullName: '', username: '', email: '', password: '', role: 'READ_ONLY', companyIds: [], warehouseIds: [] }); notify('Përdoruesi u krijua.'); load(); } catch (e2) { setError(e2.message); } };
  const changeStatus = async (row) => { if (!window.confirm(`${row.active ? 'Çaktivizo' : 'Aktivizo'} përdoruesin ${row.full_name}?`)) return; try { await api(`/api/users/${row.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: !row.active }) }); load(); } catch (e) { setError(e.message); } };
  const availableRoles = currentUser.role === 'SUPER_ADMIN' ? roles : roles.filter((r) => !['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(r));
  return <><Alert>{error}</Alert><section className="card"><div className="section-heading"><div><h3>Përdoruesit dhe rolet</h3><p>Llogari individuale; pa password demo. Lejet operative zgjerohen sipas moduleve.</p></div><button className="primary small" onClick={() => setModal(true)}><Plus size={17} /> Shto përdorues</button></div><DataTable rows={rows} columns={[{ key: 'full_name', label: 'Emri' }, { key: 'username', label: 'Username' }, { key: 'role', label: 'Roli', render: (r) => ROLE_LABELS[r.role] || r.role }, { key: 'active', label: 'Statusi', render: (r) => <button className={`status-chip clickable ${r.active ? '' : 'off'}`} onClick={() => changeStatus(r)}>{r.active ? 'Aktiv' : 'Joaktiv'}</button> }]} /></section>{modal && <Modal title="Përdorues i ri" onClose={() => setModal(false)}><form className="form-grid" onSubmit={submit}><label><span>Emri i plotë</span><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label><label><span>Username</span><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></label><label><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label><span>Fjalëkalimi</span><input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label><label className="wide"><span>Roli</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{availableRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}</select></label><fieldset className="wide"><legend>Kompanitë</legend><div className="check-grid">{companies.map((c) => <label className="check" key={c.id}><input type="checkbox" checked={form.companyIds.includes(c.id)} onChange={() => toggle('companyIds', c.id)} /> {c.name}</label>)}</div></fieldset><fieldset className="wide"><legend>Magazinat</legend><div className="check-grid">{warehouses.filter((w) => form.companyIds.includes(w.company_id)).map((w) => <label className="check" key={w.id}><input type="checkbox" checked={form.warehouseIds.includes(w.id)} onChange={() => toggle('warehouseIds', w.id)} /> {w.company_name} — {w.name}</label>)}</div></fieldset><div className="modal-actions wide"><button type="button" className="secondary" onClick={() => setModal(false)}>Anulo</button><button className="primary">Ruaj</button></div></form></Modal>}</>;
}

function AuditLog({ refreshKey }) {
  const [rows, setRows] = useState([]); const [error, setError] = useState(''); const [search, setSearch] = useState('');
  const load = useCallback(async () => { try { setRows(await api('/api/audit?limit=300')); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  const filtered = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
  return <><Alert>{error}</Alert><section className="card"><div className="section-heading"><div><h3>Audit Log</h3><p>Veprimet ruhen në server dhe nuk varen nga browser-i i operatorit.</p></div><button className="secondary small" onClick={load}><RefreshCcw size={16} /> Rifresko</button></div><div className="search-box"><Search size={17} /><input placeholder="Kërko veprim, përdorues, kompani…" value={search} onChange={(e) => setSearch(e.target.value)} /></div><DataTable rows={filtered} columns={[{ key: 'created_at', label: 'Data/Ora', render: (r) => new Date(r.created_at).toLocaleString('sq-AL') }, { key: 'user_name', label: 'Përdoruesi', render: (r) => r.user_name || 'Sistem' }, { key: 'action', label: 'Veprimi' }, { key: 'entity_type', label: 'Objekti' }, { key: 'company_name', label: 'Kompania' }]} /></section></>;
}

function Sidebar({ page, setPage, open, close, user }) {
  return <aside className={`sidebar ${open ? 'open' : ''}`}><div className="sidebar-brand"><div className="brand-mark small"><Layers3 /></div><div><strong>Sistemi Genit</strong><span>Cloud ERP</span></div><button className="sidebar-close" onClick={close}><X /></button></div><nav>{navGroups.map((group) => <section className="nav-group" key={group.title}><h4>{group.title}</h4>{group.items.map((item) => { const Icon = item.icon; const enabled = item.active === true && (!item.roles || item.roles.includes(user.role)); return <button key={item.id || item.label} className={`nav-item ${page === item.id ? 'active' : ''} ${!enabled ? 'disabled' : ''}`} onClick={() => { if (enabled) { setPage(item.id); close(); } }} disabled={!enabled}><Icon size={18} /><span>{item.label}</span>{!enabled && <small>më pas</small>}</button>; })}</section>)}</nav><div className="sidebar-footer"><Settings size={16} /><span>Versioni Cloud ERP 2.0</span></div></aside>;
}

function AppShell({ user, onLogout }) {
  const [page, setPage] = useState('dashboard'); const [menuOpen, setMenuOpen] = useState(false); const [refreshKey, setRefreshKey] = useState(0); const [live, setLive] = useState(false); const [toast, setToast] = useState('');
  const titles = { ...PHASE2_TITLES, dashboard: ['Dashboard', 'Pamja e përgjithshme e platformës Cloud'], companies: ['Kompanitë', 'Multi-company me izolim të të dhënave'], warehouses: ['Magazinat', 'Akses dhe strukturë sipas kompanive'], users: ['Përdoruesit', 'Role dhe leje individuale'], audit: ['Audit Log', 'Historik i pandryshueshëm i veprimeve'] };
  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY); if (!token) return undefined;
    const socket = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => setLive(true)); socket.on('disconnect', () => setLive(false));
    socket.on('entity:update', () => setRefreshKey((v) => v + 1));
    return () => socket.disconnect();
  }, []);
  const content = useMemo(() => {
    if (page === 'companies') return <Companies user={user} refreshKey={refreshKey} notify={notify} />;
    if (page === 'warehouses') return <Warehouses user={user} refreshKey={refreshKey} notify={notify} />;
    if (page === 'users') return <UsersPage currentUser={user} refreshKey={refreshKey} notify={notify} />;
    if (page === 'audit') return <AuditLog refreshKey={refreshKey} />;
    if (PHASE2_TITLES[page]) return <Phase2Page page={page} />;
    return <Dashboard refreshKey={refreshKey} />;
  }, [page, refreshKey, user]);
  return <div className="app-shell"><Sidebar page={page} setPage={setPage} open={menuOpen} close={() => setMenuOpen(false)} user={user} />{menuOpen && <button className="sidebar-overlay" onClick={() => setMenuOpen(false)} aria-label="Mbyll menunë" />}<main className="main"><Header title={titles[page][0]} subtitle={titles[page][1]} user={user} onMenu={() => setMenuOpen(true)} onLogout={onLogout} live={live} /><div className="content">{content}</div></main>{toast && <div className="toast"><CheckCircle2 /> {toast}</div>}</div>;
}

export default function App() {
  const [state, setState] = useState({ loading: true, needsSetup: false, user: null, error: '' });
  const bootstrap = useCallback(async () => {
    try {
      const status = await api('/api/setup/status');
      if (status.needsSetup) return setState({ loading: false, needsSetup: true, user: null, error: '' });
      if (localStorage.getItem(TOKEN_KEY)) {
        try { const me = await api('/api/auth/me'); return setState({ loading: false, needsSetup: false, user: me.user, error: '' }); }
        catch { localStorage.removeItem(TOKEN_KEY); }
      }
      setState({ loading: false, needsSetup: false, user: null, error: '' });
    } catch (error) { setState({ loading: false, needsSetup: false, user: null, error: `Nuk u lidhëm me API-në: ${error.message}` }); }
  }, []);
  useEffect(() => { bootstrap(); }, [bootstrap]);
  if (state.loading) return <div className="loading-page"><Spinner /><p>Duke lidhur Sistemi Genit Cloud…</p></div>;
  if (state.error) return <div className="fatal"><Alert>{state.error}</Alert><p>Kontrollo variablin <code>VITE_API_URL</code> te Railway dhe statusin e <code>genit-api</code>.</p><button className="primary" onClick={bootstrap}>Provo përsëri</button></div>;
  if (state.needsSetup) return <SetupPage onComplete={(user) => setState({ loading: false, needsSetup: false, user, error: '' })} />;
  if (!state.user) return <LoginPage onLogin={(user) => setState({ loading: false, needsSetup: false, user, error: '' })} />;
  return <AppShell user={state.user} onLogout={() => { localStorage.removeItem(TOKEN_KEY); setState({ loading: false, needsSetup: false, user: null, error: '' }); }} />;
}
