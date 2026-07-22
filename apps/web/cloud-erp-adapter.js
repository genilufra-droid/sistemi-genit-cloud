/* Sistemi Genit — Cloud ERP Adapter (PostgreSQL source of truth) */
(function (global) {
  'use strict';

  var Auth = global.Auth;
  var App = global.App;
  var DB = global.DB;
  if (!Auth || !App || !DB) throw new Error('Cloud ERP Adapter kërkon Auth, App dhe DB.');
  if (global.__SG_CLOUD_ERP_ADAPTER__) return;
  global.__SG_CLOUD_ERP_ADAPTER__ = true;

  var cfg = global.__GENIT_CLOUD_CONFIG__ || {};
  var API_URL = String(cfg.apiUrl || '').replace(/\/+$/, '');
  var REQUIRED = cfg.required !== false;
  var TOKEN_KEY = 'sg_cloud_access_token_v1';
  var ACTIVE_COMPANY_KEY = 'sg_cloud_active_company_v1';
  var ACTIVE_WAREHOUSE_KEY = 'sg_cloud_active_warehouse_v1';
  var currentUser = null;
  var access = { companyIds: [], warehouseIds: [] };
  var bootstrapData = null;
  var original = {
    refreshAll: App.refreshAll,
    logout: Auth.logout,
    listUsers: Auth.listUsers,
    createUser: Auth.createUser,
    updateUser: Auth.updateUser,
    resetPassword: Auth.resetPassword,
    changeOwnPassword: Auth.changeOwnPassword
  };

  var ROLE_MAP = {
    SUPER_ADMIN: 'ADMIN', COMPANY_ADMIN: 'ADMIN', MANAGER: 'MANAGER',
    FINANCIER: 'ACCOUNTANT', MAGAZINIER: 'OPERATOR', OPERATOR_PESHORE: 'OPERATOR',
    SHITES: 'OPERATOR', ARKETAR: 'OPERATOR', AUDITOR: 'VIEWER', READ_ONLY: 'VIEWER'
  };
  var SERVER_ROLE_MAP = {
    ADMIN: 'COMPANY_ADMIN', MANAGER: 'MANAGER', ACCOUNTANT: 'FINANCIER',
    OPERATOR: 'MAGAZINIER', VIEWER: 'READ_ONLY'
  };

  function storageGet(key) { try { return global.localStorage ? global.localStorage.getItem(key) : null; } catch (_) { return null; } }
  function storageSet(key, value) { try { if (global.localStorage) global.localStorage.setItem(key, String(value)); } catch (_) {} }
  function storageRemove(key) { try { if (global.localStorage) global.localStorage.removeItem(key); } catch (_) {} }
  function esc(value) { return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function camel(row) {
    var out = {};
    Object.keys(row || {}).forEach(function (key) {
      var ck = key.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
      out[ck] = row[key];
    });
    return out;
  }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function token() { return storageGet(TOKEN_KEY) || ''; }
  function clearSession() { storageRemove(TOKEN_KEY); currentUser = null; access = { companyIds: [], warehouseIds: [] }; bootstrapData = null; }

  function setMessage(message, type) {
    var el = document.getElementById('auth-message');
    if (!el) return;
    el.className = 'auth-message ' + (type || 'error');
    el.textContent = message || '';
  }

  async function request(path, options) {
    options = options || {};
    if (!API_URL) throw new Error('VITE_API_URL nuk është konfiguruar në shërbimin genit-web.');
    var headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    if (options.body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    var t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, Number(options.timeout || 25000));
    try {
      var response = await fetch(API_URL + path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body == null ? undefined : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)),
        credentials: 'omit',
        signal: controller.signal
      });
      var text = await response.text();
      var payload = text ? JSON.parse(text) : null;
      if (!response.ok) {
        var error = new Error(payload && payload.message ? payload.message : ('Gabim serveri HTTP ' + response.status));
        error.status = response.status;
        error.code = payload && payload.error;
        error.details = payload && payload.details;
        if (response.status === 401) clearSession();
        throw error;
      }
      return payload;
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('Serveri online nuk u përgjigj brenda afatit.');
      if (error instanceof SyntaxError) throw new Error('Serveri ktheu përgjigje të pavlefshme.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  function localUser(serverUser) {
    var u = camel(serverUser || {});
    return {
      id: u.id,
      tenantId: u.tenantId,
      username: u.username,
      usernameNormalized: String(u.username || '').toLocaleLowerCase('sq-AL'),
      displayName: u.fullName || u.displayName || u.username,
      fullName: u.fullName || u.displayName || u.username,
      role: ROLE_MAP[u.role] || 'VIEWER',
      serverRole: u.role || 'READ_ONLY',
      active: u.active !== false,
      mustChangePassword: Boolean(u.mustChangePassword),
      lastLoginAt: u.lastLoginAt || null,
      createdAt: u.createdAt || null
    };
  }

  function serverRole(localRole) { return SERVER_ROLE_MAP[String(localRole || '').toUpperCase()] || String(localRole || 'READ_ONLY').toUpperCase(); }

  function permissionList(user) {
    if (!user || user.active === false) return [];
    return Auth.ROLE_PERMISSIONS[user.role] || [];
  }
  function hasPermission(permission, user) {
    var list = permissionList(user || currentUser);
    return list.indexOf('*') >= 0 || list.indexOf(permission) >= 0;
  }
  function canView(view) {
    var permission = Auth.VIEW_PERMISSIONS[view] || 'documents.view';
    return hasPermission(permission);
  }

  function selectedCompanyId() {
    var ids = access.companyIds || [];
    var saved = storageGet(ACTIVE_COMPANY_KEY);
    return ids.indexOf(saved) >= 0 ? saved : (ids[0] || '');
  }
  function selectedWarehouseId(companyId) {
    var list = (bootstrapData && bootstrapData.warehouses || []).map(camel).filter(function (w) { return !companyId || w.companyId === companyId; });
    var allowed = access.warehouseIds || [];
    if (allowed.length) list = list.filter(function (w) { return allowed.indexOf(w.id) >= 0; });
    var saved = storageGet(ACTIVE_WAREHOUSE_KEY);
    return list.some(function (w) { return w.id === saved; }) ? saved : (list[0] && list[0].id || '');
  }

  function mapCompany(row) {
    var x = camel(row);
    return {
      id: x.id, key: 'company', name: x.name || 'Sistemi Genit', nipt: x.nipt || '',
      address: x.address || '', city: x.city || '', phone: x.phone || '', email: x.email || '',
      bank: x.bank || '', iban: x.iban || '', currency: x.currency || 'ALL', invoiceFooter: x.invoiceFooter || '',
      active: x.active !== false, cloudVersion: x.version || 1
    };
  }
  function mapWarehouse(row) {
    var x = camel(row); return { id:x.id, companyId:x.companyId, code:x.code || '', name:x.name || '', address:x.address || '', active:x.active !== false, createdAt:x.createdAt, updatedAt:x.updatedAt, cloudVersion:x.version || 1 };
  }
  function mapCategory(row) {
    var x = camel(row); return { id:x.id, companyId:x.companyId, code:x.code || '', name:x.name || '', active:x.active !== false, cloudVersion:x.version || 1 };
  }
  function mapProduct(row) {
    var x = camel(row);
    return {
      id:x.id, companyId:x.companyId, categoryId:x.categoryId || '', category:x.categoryName || '', code:x.code || '', barcode:x.barcode || '', name:x.name || '',
      baseUnit:x.baseUnit || 'copë', packUnit:x.packUnit || 'koli', palletUnit:x.palletUnit || 'paletë',
      packCoefficient:num(x.packCoefficient || 1), palletCoefficient:num(x.palletCoefficient || 1),
      purchasePrice:num(x.purchasePrice), lastPrice:num(x.purchasePrice), avgPrice:num(x.purchasePrice),
      salePrice:num(x.salePrice), salesPrice:num(x.salePrice), vatRate:num(x.vatRate),
      stock:num(x.stock || x.quantityBase), minStock:num(x.minStock), active:x.active !== false,
      createdAt:x.createdAt, updatedAt:x.updatedAt, cloudVersion:x.version || 1
    };
  }
  function mapPartner(row) {
    var x = camel(row);
    return {
      id:x.id, companyId:x.companyId, partnerType:x.partnerType, code:x.code || '', name:x.name || '', nipt:x.nipt || '', address:x.address || '', city:x.city || '', phone:x.phone || '', email:x.email || '',
      paymentTerms:num(x.paymentTerms || 30), openingBalance:num(x.openingBalance), creditLimit:num(x.creditLimit), balance:num(x.balance),
      totalPurchases:num(x.totalPurchases), totalSales:num(x.totalSales), active:x.active !== false,
      createdAt:x.createdAt, updatedAt:x.updatedAt, cloudVersion:x.version || 1
    };
  }
  function mapWeight(row) {
    var x = camel(row);
    return {
      id:x.id, companyId:x.companyId, warehouseId:x.warehouseId, supplierId:x.supplierId, supplierName:x.supplierName || '', productId:x.productId, productName:x.productName || '',
      docNumber:x.documentNo, date:x.documentDate, bagsCount:num(x.bagsCount), grossKg:num(x.grossWeight), packagingKg:num(x.packagingWeight), netBeforePercent:num(x.netWeight),
      percentDeduction:num(x.discountPercent), netAfterPercent:num(x.acceptedWeight), unitPriceExclVat:num(x.unitPrice), totalAmount:num(x.totalValue),
      vehiclePlate:x.vehiclePlate || '', notes:x.notes || '', status:x.status || 'DRAFT', createdAt:x.createdAt, updatedAt:x.updatedAt, cloudVersion:x.version || 1
    };
  }
  function docStore(docType) {
    return {
      PURCHASE_RFQ:'purchaseRFQs', PURCHASE_ORDER:'purchaseOrders', PURCHASE_RECEIPT:'purchaseReceipts', PURCHASE_INVOICE:'purchaseInvoices',
      SALES_QUOTE:'salesQuotations', SALES_ORDER:'salesOrders', DELIVERY_NOTE:'deliveryNotes', SALES_INVOICE:'salesInvoices'
    }[docType];
  }
  function mapDocument(row) {
    var x = camel(row);
    var lines = (x.items || []).map(function (item) {
      var i = camel(item); return { id:i.id, productId:i.productId, productName:i.description || i.productName || '', unit:i.unit, coefficient:num(i.coefficient || 1), quantity:num(i.quantity), freeQty:num(i.freeQuantity), unitPrice:num(i.unitPrice), vatRate:num(i.vatRate), applyVat:num(i.vatRate) > 0, baseAmount:num(i.lineNet), vatAmount:num(i.lineVat), totalAmount:num(i.lineTotal) };
    });
    return {
      id:x.id, companyId:x.companyId, warehouseId:x.warehouseId, partnerId:x.partnerId, docType:x.docType,
      docNumber:x.documentNo, date:x.documentDate, status:x.status === 'CONFIRMED' ? 'POSTED' : x.status,
      notes:x.notes || '', totalNet:num(x.totalNet), vatAmount:num(x.totalVat), totalAmount:num(x.totalAmount), lines:lines,
      supplierId:/^PURCHASE_/.test(x.docType) ? x.partnerId : null, supplierName:/^PURCHASE_/.test(x.docType) ? (x.partnerName || '') : '',
      customerId:/^(SALES_|DELIVERY_)/.test(x.docType) ? x.partnerId : null, customerName:/^(SALES_|DELIVERY_)/.test(x.docType) ? (x.partnerName || '') : '',
      createdAt:x.createdAt, updatedAt:x.updatedAt, cloudVersion:x.version || 1
    };
  }

  function applyBootstrapToApp() {
    if (!bootstrapData || !App || !App.data) return;
    var companyId = selectedCompanyId();
    var warehouseId = selectedWarehouseId(companyId);
    if (companyId) { storageSet(ACTIVE_COMPANY_KEY, companyId); DB.setCompanyContext(companyId); }
    if (warehouseId) storageSet(ACTIVE_WAREHOUSE_KEY, warehouseId);

    var companies = (bootstrapData.companies || []).map(mapCompany);
    var company = companies.find(function (x) { return x.id === companyId; }) || companies[0] || { name:'Sistemi Genit', nipt:'', currency:'ALL' };
    App.company = company;
    App.data.settings = [Object.assign({ key:'company', companyId:company.id }, company)];
    App.data.warehouses = (bootstrapData.warehouses || []).map(mapWarehouse).filter(function (x) { return !companyId || x.companyId === companyId; });
    App.data.categories = (bootstrapData.categories || []).map(mapCategory).filter(function (x) { return !companyId || x.companyId === companyId; });
    var stockByProduct = {};
    (bootstrapData.stock || []).map(camel).filter(function (x) { return !companyId || x.companyId === companyId; }).forEach(function (x) {
      stockByProduct[x.productId] = num(stockByProduct[x.productId]) + num(x.quantityBase);
    });
    App.data.products = (bootstrapData.products || []).map(mapProduct).filter(function (x) { return !companyId || x.companyId === companyId; }).map(function (x) {
      x.stock = num(stockByProduct[x.id]); return x;
    });
    var partners = (bootstrapData.partners || []).map(mapPartner).filter(function (x) { return !companyId || x.companyId === companyId; });
    App.data.suppliers = partners.filter(function (x) { return x.partnerType === 'SUPPLIER' || x.partnerType === 'BOTH'; });
    App.data.customers = partners.filter(function (x) { return x.partnerType === 'CUSTOMER' || x.partnerType === 'BOTH'; });
    App.data.weightForms = (bootstrapData.weights || []).map(mapWeight).filter(function (x) { return !companyId || x.companyId === companyId; });
    App.data.stockMovements = (bootstrapData.stock || []).map(function (row) { var x=camel(row); return { id:x.id || [x.companyId,x.warehouseId,x.productId].join(':'), companyId:x.companyId, warehouseId:x.warehouseId, productId:x.productId, productName:x.name || '', quantityBase:num(x.quantityBase), quantity:num(x.quantityBase), balance:num(x.quantityBase), unit:x.baseUnit || 'copë' }; });

    var documentStores = ['purchaseRFQs','purchaseOrders','purchaseReceipts','purchaseInvoices','salesQuotations','salesOrders','deliveryNotes','salesInvoices'];
    documentStores.forEach(function (key) { App.data[key] = []; });
    (bootstrapData.documents || []).forEach(function (row) { var x=camel(row), store=docStore(x.docType); if(store) App.data[store].push(mapDocument(row)); });

    var ci=document.querySelector('.company-info');
    if(ci) ci.innerHTML='<strong>'+esc(company.name||'Sistemi Genit')+'</strong><br>NIPT: '+esc(company.nipt||'—');
    renderCloudStatus();
  }

  function renderCloudStatus() {
    var existing = document.getElementById('sg-cloud-status');
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'sg-cloud-status';
      existing.className = 'sg-cloud-status no-print';
      var topbar = document.querySelector('.topbar');
      if (topbar) topbar.appendChild(existing);
    }
    if (existing) existing.innerHTML = '<span class="sg-cloud-dot"></span><strong>Cloud PostgreSQL</strong><small>'+esc(currentUser ? currentUser.displayName : '')+'</small>';
  }

  async function loadBootstrap() {
    bootstrapData = await request('/api/cloud/bootstrap');
    access.companyIds = (bootstrapData.access && bootstrapData.access.companyIds) || bootstrapData.companyIds || [];
    access.warehouseIds = (bootstrapData.access && bootstrapData.access.warehouseIds) || bootstrapData.warehouseIds || [];
    return bootstrapData;
  }

  async function startApplication() {
    await loadBootstrap();
    var root = document.getElementById('auth-root');
    var shell = document.getElementById('app-shell');
    if (root) root.style.display = 'none';
    if (shell) shell.style.display = 'flex';
    await App.init();
    applyBootstrapToApp();
    App.navigate('dashboard');
    if (App.applyAuthUI) App.applyAuthUI();
  }

  function renderLogin() {
    var root = document.getElementById('auth-root');
    root.style.display = 'flex';
    root.innerHTML = '<div class="auth-card"><div class="auth-brand"><div class="auth-logo">🌿</div><h1>Sistemi Genit Cloud</h1><p>Hyrje në ERP online</p></div><div class="sg-cloud-auth-badge">PostgreSQL qendror · Multi-user</div><div id="auth-message" class="auth-message"></div><form id="login-form"><div class="form-group"><label>Username ose email</label><input id="login-username" autocomplete="username" required></div><div class="form-group"><label>Fjalëkalimi</label><input id="login-password" type="password" autocomplete="current-password" required></div><button class="btn btn-primary auth-submit" type="submit">🔐 Hyr online</button></form><div class="sg-cloud-endpoint">Server: '+esc(API_URL)+'</div></div>';
    document.getElementById('login-form').addEventListener('submit', async function (event) {
      event.preventDefault(); var button=event.currentTarget.querySelector('button'); button.disabled=true; setMessage('Duke u lidhur me serverin...', 'info');
      try { await login(document.getElementById('login-username').value,document.getElementById('login-password').value); await startApplication(); }
      catch(e){ setMessage(e.message||String(e),'error'); } finally { button.disabled=false; }
    });
  }

  function renderSetup() {
    var root=document.getElementById('auth-root'); root.style.display='flex';
    root.innerHTML='<div class="auth-card auth-card-wide"><div class="auth-brand"><div class="auth-logo">🌿</div><h1>Konfigurimi i parë Cloud</h1><p>Kjo kryhet vetëm një herë në PostgreSQL dhe vlen për çdo pajisje.</p></div><div class="sg-cloud-auth-badge">Administrator qendror · Jo lokal në browser</div><div id="auth-message" class="auth-message"></div><form id="cloud-first-admin-form"><div class="form-grid"><div class="form-group"><label>Organizata *</label><input id="setup-organization" required></div><div class="form-group"><label>Kompania *</label><input id="setup-company" required></div><div class="form-group"><label>NIPT</label><input id="setup-nipt"></div><div class="form-group"><label>Magazina e parë *</label><input id="setup-warehouse" value="Magazina Qendrore" required></div><div class="form-group"><label>Emri i administratorit *</label><input id="setup-display-name" required></div><div class="form-group"><label>Username *</label><input id="setup-username" autocomplete="username" required></div><div class="form-group"><label>Email</label><input id="setup-email" type="email"></div><div class="form-group"><label>Fjalëkalimi *</label><input id="setup-password" type="password" autocomplete="new-password" required></div><div class="form-group"><label>Përsërit fjalëkalimin *</label><input id="setup-password-confirm" type="password" autocomplete="new-password" required></div></div><button class="btn btn-green auth-submit" type="submit">✓ Krijo ERP-në Cloud</button></form></div>';
    document.getElementById('cloud-first-admin-form').addEventListener('submit',async function(event){event.preventDefault();var p=document.getElementById('setup-password').value,pc=document.getElementById('setup-password-confirm').value;if(p!==pc){setMessage('Fjalëkalimet nuk përputhen.','error');return;}var button=event.currentTarget.querySelector('button');button.disabled=true;try{var result=await request('/api/setup/admin',{method:'POST',body:{organizationName:document.getElementById('setup-organization').value,companyName:document.getElementById('setup-company').value,companyNipt:document.getElementById('setup-nipt').value,warehouseName:document.getElementById('setup-warehouse').value,adminName:document.getElementById('setup-display-name').value,username:document.getElementById('setup-username').value,email:document.getElementById('setup-email').value,password:p}});storageSet(TOKEN_KEY,result.token);currentUser=localUser(result.user);access.companyIds=[result.companyId];access.warehouseIds=[result.warehouseId];await startApplication();}catch(e){setMessage(e.message||String(e),'error');}finally{button.disabled=false;}});
  }

  function renderConnectionError(error) {
    var root=document.getElementById('auth-root');root.style.display='flex';
    root.innerHTML='<div class="auth-card"><div class="auth-brand"><div class="auth-logo">☁️</div><h1>Lidhja Cloud mungon</h1><p>ERP-ja nuk hapet me të dhëna lokale të pasigurta.</p></div><div class="auth-message error">'+esc(error && error.message || error)+'</div><button class="btn btn-primary auth-submit" onclick="CloudERP.retry()">↻ Provo përsëri</button><div class="sg-cloud-endpoint">Server: '+esc(API_URL||'i pakonfiguruar')+'</div></div>';
  }

  async function login(username,password) {
    var result=await request('/api/auth/login',{method:'POST',body:{username:username,password:password}});
    storageSet(TOKEN_KEY,result.token); currentUser=localUser(result.user); return currentUser;
  }
  async function restore() {
    if(!token())return null;
    try { var result=await request('/api/auth/me'); currentUser=localUser(result.user); access.companyIds=result.companyIds||[]; access.warehouseIds=result.warehouseIds||[]; return currentUser; }
    catch(e){ clearSession(); return null; }
  }
  async function bootstrap() {
    await DB.open();
    try {
      if(!API_URL) throw new Error('Mungon VITE_API_URL në konfigurimin e genit-web.');
      var status=await request('/api/setup/status');
      if(status.needsSetup){clearSession();renderSetup();return;}
      var restored=await restore();
      if(restored){await startApplication();return;}
      renderLogin();
    } catch(e) { if(REQUIRED) renderConnectionError(e); else return original.logout(); }
  }
  async function logout() {
    clearSession(); var shell=document.getElementById('app-shell'),root=document.getElementById('auth-root'),overlay=document.getElementById('modal-overlay');
    if(overlay)overlay.classList.remove('show'); if(shell)shell.style.display='none'; if(root){root.style.display='flex';renderLogin();}
  }

  async function listUsers(){return (await request('/api/users')).map(function(row){var x=camel(row);return localUser(x);});}
  async function createUser(input){var companyIds=input.companyIds||access.companyIds||[];var warehouseIds=input.warehouseIds||access.warehouseIds||[];var row=await request('/api/users',{method:'POST',body:{fullName:input.displayName||input.fullName,username:input.username,email:input.email||'',password:input.password,role:serverRole(input.role),companyIds:companyIds,warehouseIds:warehouseIds}});return localUser(row);}
  async function updateUser(id,changes){var row=await request('/api/cloud/users/'+encodeURIComponent(id),{method:'PATCH',body:{fullName:changes.displayName||changes.fullName,username:changes.username,email:changes.email||'',role:serverRole(changes.role),active:changes.active,companyIds:changes.companyIds||access.companyIds,warehouseIds:changes.warehouseIds||access.warehouseIds}});return localUser(row);}
  async function resetPassword(id,password,mustChangePassword){await request('/api/cloud/users/'+encodeURIComponent(id)+'/reset-password',{method:'POST',body:{password:password,mustChangePassword:mustChangePassword!==false}});return true;}
  async function changeOwnPassword(oldPassword,newPassword){await request('/api/cloud/auth/change-password',{method:'POST',body:{oldPassword:oldPassword,newPassword:newPassword}});return true;}

  App.refreshAll = async function () { var result=await original.refreshAll.call(this); if(currentUser && bootstrapData) applyBootstrapToApp(); return result; };

  var originalEditProduct = App.editProduct;
  App.editProduct = function (existing) {
    var result = originalEditProduct.apply(this, arguments);
    var stockInput = document.getElementById('pr-stock');
    if (stockInput) { stockInput.readOnly = true; stockInput.title = 'Stoku ndryshon vetëm nga dokumentet e magazinës në PostgreSQL.'; }
    return result;
  };
  App.savePartner = async function (type, existingId) {
    try {
      Auth.requirePermission('masters.manage');
      var companyId = selectedCompanyId();
      if (!companyId) throw new Error('Nuk ka kompani aktive.');
      var existing = existingId ? (type === 'supplier' ? this.data.suppliers : this.data.customers).find(function (x) { return x.id === existingId; }) : null;
      var payload = {
        companyId: companyId,
        partnerType: type === 'supplier' ? 'SUPPLIER' : 'CUSTOMER',
        code: document.getElementById('p-code').value.trim(),
        name: document.getElementById('p-name').value.trim(),
        nipt: document.getElementById('p-nipt').value.trim(),
        phone: document.getElementById('p-phone').value.trim(),
        address: document.getElementById('p-address').value.trim(),
        city: existing && existing.city || '', email: existing && existing.email || '',
        creditLimit: existing && existing.creditLimit || 0,
        active: existing ? existing.active !== false : true
      };
      if (!payload.code || !payload.name) throw new Error('Kodi dhe Emri janë të detyrueshëm.');
      await request(existingId ? '/api/partners/' + encodeURIComponent(existingId) : '/api/partners', { method: existingId ? 'PATCH' : 'POST', body: payload });
      this.closeModal(); this.toast(existingId ? 'Partneri u përditësua në Cloud.' : 'Partneri u krijua në Cloud.');
      await global.CloudERP.refresh(); this.navigate('partners');
    } catch (error) { this.toast(error.message || String(error), 'error'); }
  };
  App.saveProduct = async function (existingId) {
    try {
      Auth.requirePermission('masters.manage');
      var companyId = selectedCompanyId();
      if (!companyId) throw new Error('Nuk ka kompani aktive.');
      var existing = existingId ? this.data.products.find(function (x) { return x.id === existingId; }) : null;
      var payload = {
        companyId: companyId,
        categoryId: SAC.getSelectedId(document.getElementById('pr-cat')) || null,
        code: document.getElementById('pr-code').value.trim(), barcode: document.getElementById('pr-barcode').value.trim(),
        name: document.getElementById('pr-name').value.trim(),
        baseUnit: document.getElementById('pr-unit').dataset.selectedCode || document.getElementById('pr-unit').value.trim() || 'copë',
        packUnit: existing && existing.packUnit || 'koli', palletUnit: existing && existing.palletUnit || 'paletë',
        packCoefficient: existing && existing.packCoefficient || 1, palletCoefficient: existing && existing.palletCoefficient || 1,
        purchasePrice: existing && (existing.purchasePrice || existing.lastPrice) || 0,
        salePrice: num(document.getElementById('pr-salesprice').value), vatRate: existing && existing.vatRate || 0,
        active: existing ? existing.active !== false : true
      };
      if (!payload.code || !payload.name) throw new Error('Kodi dhe Emri janë të detyrueshëm.');
      await request(existingId ? '/api/products/' + encodeURIComponent(existingId) : '/api/products', { method: existingId ? 'PATCH' : 'POST', body: payload });
      this.closeModal(); this.toast(existingId ? 'Artikulli u përditësua në Cloud.' : 'Artikulli u krijua në Cloud.');
      await global.CloudERP.refresh(); this.navigate('products');
    } catch (error) { this.toast(error.message || String(error), 'error'); }
  };

  Auth.bootstrap=bootstrap; Auth.login=login; Auth.logout=logout; Auth.getCurrentUser=function(){return currentUser;};
  Auth.hasPermission=hasPermission; Auth.requirePermission=function(permission){if(!hasPermission(permission))throw new Error('Nuk keni leje për këtë veprim.');return true;}; Auth.canView=canView;
  Auth.listUsers=listUsers; Auth.createUser=createUser; Auth.updateUser=updateUser; Auth.resetPassword=resetPassword; Auth.changeOwnPassword=changeOwnPassword;

  global.CloudERP={
    apiUrl:API_URL, required:REQUIRED, request:request, bootstrap:bootstrap, retry:function(){bootstrap();},
    getUser:function(){return currentUser;}, getAccess:function(){return access;}, getBootstrap:function(){return bootstrapData;},
    refresh:async function(){await loadBootstrap();applyBootstrapToApp();if(App.currentView)App.navigate(App.currentView);},
    selectCompany:async function(id){if((access.companyIds||[]).indexOf(id)<0)throw new Error('Kompania nuk është në aksesin tuaj.');storageSet(ACTIVE_COMPANY_KEY,id);await this.refresh();}
  };
})(window);
