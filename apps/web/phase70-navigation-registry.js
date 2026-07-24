/* SG_PHASE70_NAVIGATION_REGISTRY_START — Sistemi Genit */
(function (global) {
  'use strict';

  var App = global.App;
  if (!App || global.__SG_PHASE70_NAVIGATION_REGISTRY__) return;
  global.__SG_PHASE70_NAVIGATION_REGISTRY__ = true;

  var aliases = {
    finance: 'financeDashboard',
    cashBank: 'financeDashboard',
    cashAndBank: 'financeDashboard',
    cashAccounts: 'financeAccounts',
    bankAccounts: 'financeAccounts',
    operationalDashboard: 'operationsDashboard',
    operations: 'operationsDashboard',
    weightForms: 'weightList',
    weightTickets: 'weightList',
    traceWeights: 'weightList',
    traceFarms: 'traceRegistry',
    farms: 'traceRegistry',
    lots: 'traceLots',
    traceability: 'traceDossiers'
  };

  var sections = [
    {
      id: 'sg62-trace-nav',
      title: 'GJURMUESHMËRI 360°',
      dataKey: 'sg62View',
      items: [
        { view: 'traceRegistry', icon: '🌱', label: 'Ferma & Bimët', title: 'Ferma, Origjina dhe Bimët', handler: 'view_traceRegistry' },
        { view: 'weightList', icon: '⚖️', label: 'Formularët e Peshës', title: 'Formularët e Peshës', handler: 'view_weightList' },
        { view: 'traceDossiers', icon: '📁', label: 'Dosjet e Gjurmueshmërisë', title: 'Dosjet e Gjurmueshmërisë', handler: 'view_traceDossiers' },
        { view: 'traceLots', icon: '🏷️', label: 'Lotet & Etiketat', title: 'Lotet dhe Etiketat', handler: 'view_traceLots' }
      ]
    },
    {
      id: 'sg5-nav-section',
      title: 'FINANCA / ARKA & BANKA',
      dataKey: 'sg5View',
      items: [
        { view: 'financeDashboard', icon: '💰', label: 'Paneli Financiar', title: 'Paneli Financiar', handler: 'view_financeDashboard' },
        { view: 'financeAccounts', icon: '🏦', label: 'Llogaritë', title: 'Llogaritë Financiare', handler: 'view_financeAccounts' },
        { view: 'expenses', icon: '💸', label: 'Shpenzime', title: 'Shpenzime', handler: 'view_expenses' },
        { view: 'expenseCategories', icon: '🗂️', label: 'Kategori Shpenzimesh', title: 'Kategori Shpenzimesh', handler: 'view_expenseCategories' },
        { view: 'cashReceipts', icon: '📥', label: 'Mandat Arkëtimi', title: 'Mandat Arkëtimi', handler: 'view_financeDocuments', args: ['CASH_RECEIPT'] },
        { view: 'cashPayments', icon: '📤', label: 'Mandat Pagese', title: 'Mandat Pagese', handler: 'view_financeDocuments', args: ['CASH_PAYMENT'] },
        { view: 'bankPosts', icon: '🏛️', label: 'Posta e Bankës', title: 'Posta e Bankës', handler: 'view_financeDocuments', args: ['BANK'] },
        { view: 'financeJournal', icon: '📒', label: 'Ditari Financiar', title: 'Ditari Financiar', handler: 'view_financeJournal' },
        { view: 'cashClosings', icon: '🔐', label: 'Mbyllja Ditore', title: 'Mbyllja Ditore e Arkës', handler: 'view_cashClosings' },
        { view: 'financeReports', icon: '📊', label: 'Raportet Arka/Bankë', title: 'Raportet e Arkës dhe Bankës', handler: 'view_financeReports' }
      ]
    },
    {
      id: 'sg6-nav-section',
      title: 'OPERACIONE & LOGJISTIKË',
      dataKey: 'sg6View',
      items: [
        { view: 'operationsDashboard', icon: '🧭', label: 'Paneli Operacional', title: 'Paneli Operacional', handler: 'view_operationsDashboard' },
        { view: 'drivers', icon: '🧑‍✈️', label: 'Shoferë', title: 'Shoferë', handler: 'view_drivers' },
        { view: 'routes', icon: '🗺️', label: 'Itinerare', title: 'Itinerare', handler: 'view_routes' },
        { view: 'trips', icon: '🚚', label: 'Udhëtime', title: 'Udhëtime', handler: 'view_trips' },
        { view: 'fuel', icon: '⛽', label: 'Karburant', title: 'Karburant', handler: 'view_fuel' },
        { view: 'maintenance', icon: '🔧', label: 'Mirëmbajtje & Riparime', title: 'Mirëmbajtje dhe Riparime', handler: 'view_maintenance' },
        { view: 'assets', icon: '🏭', label: 'Asete & Investime', title: 'Asete dhe Investime', handler: 'view_assets' },
        { view: 'logisticsReports', icon: '📊', label: 'Raporte Logjistike', title: 'Raporte Logjistike', handler: 'view_logisticsReports' },
        { view: 'assetReports', icon: '📈', label: 'Raporte Asetesh', title: 'Raporte Asetesh', handler: 'view_assetReports' }
      ]
    }
  ];

  var routeByView = {};
  sections.forEach(function (section) {
    section.items.forEach(function (item) { routeByView[item.view] = item; });
  });

  function canonicalView(view) {
    var key = String(view || '').trim();
    return aliases[key] || key;
  }

  function normalizeLabel(value) {
    var label = String(value || '').toLocaleLowerCase('sq-AL');
    if (label.normalize) label = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return label.replace(/ë/g, 'e').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function handlerExists(item) {
    return item && typeof App[item.handler] === 'function';
  }

  function extractView(item) {
    if (!item) return '';
    var data = item.dataset || {};
    var direct = data.sgNavView || data.sg5View || data.sg6View || data.sg62View || data.view || '';
    if (direct) return canonicalView(direct);
    var inline = item.getAttribute && item.getAttribute('onclick');
    var match = String(inline || '').match(/App\.navigate\(\s*['\"]([^'\"]+)['\"]/);
    return canonicalView(match ? match[1] : '');
  }

  var canonicalLabels = {};
  sections.forEach(function (section) {
    section.items.forEach(function (item) { canonicalLabels[normalizeLabel(item.label)] = item.view; });
  });
  [
    ['Formulari i Peshave', 'weightList'],
    ['Formulari i Peshës', 'weightList'],
    ['Ferma & Origjina', 'traceRegistry'],
    ['Lotet', 'traceLots'],
    ['Arka & Banka', 'financeDashboard'],
    ['Llogari Arke/Banke', 'financeAccounts'],
    ['Llogari bankare', 'financeAccounts'],
    ['Arkë në dorë', 'financeAccounts'],
    ['Raporte Arke/Banke', 'financeReports'],
    ['Operacionet', 'operationsDashboard']
  ].forEach(function (entry) { canonicalLabels[normalizeLabel(entry[0])] = entry[1]; });

  function removeExistingInjectedSections(sidebar) {
    ['sg62-trace-nav', 'sg5-nav-section', 'sg6-nav-section'].forEach(function (id) {
      Array.prototype.slice.call(document.querySelectorAll('#' + id)).forEach(function (node) {
        if (node && node.parentNode) node.parentNode.removeChild(node);
      });
    });
    Array.prototype.slice.call(sidebar.querySelectorAll('[data-sg70-owned="true"]')).forEach(function (node) {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function removeLegacyDuplicates(sidebar) {
    Array.prototype.slice.call(sidebar.querySelectorAll('.nav-item')).forEach(function (item) {
      var view = extractView(item);
      var label = normalizeLabel(item.textContent || '');
      var canonical = view && routeByView[view] ? view : canonicalLabels[label];
      if (!canonical) return;
      if (item.parentNode) item.parentNode.removeChild(item);
    });
    Array.prototype.slice.call(sidebar.querySelectorAll('.nav-section')).forEach(function (section) {
      if (!section.querySelector('.nav-item') && section.parentNode) section.parentNode.removeChild(section);
    });
  }

  function createSection(definition) {
    var section = document.createElement('div');
    section.id = definition.id;
    section.className = 'nav-section';
    section.dataset.sg70Owned = 'true';

    var title = document.createElement('div');
    title.className = 'nav-section-title';
    title.textContent = definition.title;
    section.appendChild(title);

    definition.items.forEach(function (item) {
      if (!handlerExists(item)) return;
      var node = document.createElement('div');
      node.className = 'nav-item';
      node.dataset.sgNavView = item.view;
      node.dataset[definition.dataKey] = item.view;
      node.innerHTML = '<span class="icon">' + item.icon + '</span><span>' + item.label + '</span>';
      node.addEventListener('click', function () { App.navigate(item.view); });
      section.appendChild(node);
    });
    return section.querySelector('.nav-item') ? section : null;
  }

  function ensureMenus() {
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    removeExistingInjectedSections(sidebar);
    removeLegacyDuplicates(sidebar);
    sections.forEach(function (definition) {
      var section = createSection(definition);
      if (section) sidebar.appendChild(section);
    });
  }

  function activate(view, title) {
    App.currentView = view;
    Array.prototype.slice.call(document.querySelectorAll('.nav-item')).forEach(function (item) {
      item.classList.toggle('active', extractView(item) === view);
    });
    var heading = document.querySelector('.topbar h2');
    if (heading) heading.textContent = title;
  }

  function runRoute(item) {
    var fn = App[item.handler];
    if (typeof fn !== 'function') throw new Error('Handler-i i modulit mungon: ' + item.handler);
    return fn.apply(App, item.args || []);
  }

  function reportNavigationError(error, view) {
    var message = 'Moduli “' + view + '” nuk u hap: ' + (error && error.message ? error.message : String(error));
    if (typeof App.toast === 'function') App.toast(message, 'error');
    else if (global.console && console.error) console.error(message, error);
  }

  var baseNavigate = App.navigate;
  App.navigate = function (requestedView) {
    ensureMenus();
    var view = canonicalView(requestedView);
    var route = routeByView[view];
    if (route && handlerExists(route)) {
      activate(view, route.title);
      try {
        var result = runRoute(route);
        if (result && typeof result.then === 'function') {
          return result.catch(function (error) { reportNavigationError(error, view); throw error; });
        }
        return result;
      } catch (error) {
        reportNavigationError(error, view);
        return undefined;
      }
    }
    return baseNavigate.apply(this, arguments);
  };

  App.sgNavigationRegistry = {
    aliases: aliases,
    sections: sections,
    canonicalView: canonicalView,
    ensureMenus: ensureMenus,
    hasRoute: function (view) {
      var route = routeByView[canonicalView(view)];
      return Boolean(route && handlerExists(route));
    }
  };

  ensureMenus();
})(window);
/* SG_PHASE70_NAVIGATION_REGISTRY_END */
