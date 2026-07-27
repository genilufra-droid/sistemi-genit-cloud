/* SG_PHASE80_DOCUMENT_WORKSPACE_HELP_START — Sistemi Genit */
(function (global) {
  'use strict';

  var App = global.App;
  var Cloud = global.CloudERP;
  if (!App || !Cloud || global.__SG_PHASE80_DOCUMENT_WORKSPACE_HELP__) return;
  global.__SG_PHASE80_DOCUMENT_WORKSPACE_HELP__ = true;

  var original = {
    navigate: App.navigate,
    openTraceDossier: App.openTraceDossier,
    openTimelineDocument: App.sg62OpenTimelineDocument,
    openWeightForm: App.openWeightForm,
    openPurchaseInvoice: App.openPurchaseInvoice,
    openSaleInvoice: App.openSaleInvoice,
    openOdooDocument: App.openOdooDocument,
    openTransfer: App.sg75OpenTransfer
  };

  var W = {
    tabs: [],
    activeKey: 'module',
    dossierId: '',
    maxTabs: 12,
    moduleTitle: 'Paneli',
    moduleView: App.currentView || 'dashboard'
  };

  var DOC_LABELS = {
    PURCHASE_RFQ: 'KËRKESË PËR OFERTË',
    PURCHASE_ORDER: 'POROSI BLERJEJE',
    PURCHASE_RECEIPT: 'FLETË HYRJE',
    PURCHASE_INVOICE: 'FATURË BLERJEJE',
    SALES_QUOTE: 'OFERTË SHITJEJE',
    SALES_ORDER: 'POROSI SHITJEJE',
    DELIVERY_NOTE: 'FLETË DALJE',
    SALES_INVOICE: 'FATURË SHITJEJE',
    WEIGHT_FORM: 'FORMULARI I PESHËS',
    WEIGHT_TICKET: 'FORMULARI I PESHËS'
  };

  var HELP = {
    dashboard: {
      title: 'Paneli',
      intro: 'Paneli tregon gjendjen kryesore të biznesit dhe hyrjet e shpejta në module.',
      steps: ['Kontrollo kompaninë aktive.', 'Zgjidh modulin nga butoni i aplikacioneve.', 'Përdor kërkimin universal për dokument, artikull, fermer ose lot.'],
      fields: ['Kompania aktive', 'Kërkimi universal', 'Shkurtoret e moduleve'],
      warning: 'Mos krijo të dhëna nga paneli pa konfiguruar kompaninë dhe magazinën.'
    },
    purchase: {
      title: 'Blerje',
      intro: 'Blerja nis nga peshimi ose porosia dhe përfundon me Fletë-Hyrje, faturë dhe detyrim furnitori.',
      steps: ['Zgjidh furnitorin dhe artikullin.', 'Plotëso peshën ose porosinë.', 'Kontrollo sasinë, çmimin dhe TVSH-në.', 'Konfirmo dokumentin vetëm pasi të jenë kontrolluar të dhënat.', 'Printo ose eksporto dokumentin nga pamja A4.'],
      fields: ['Furnitori', 'Magazina', 'Artikulli', 'Sasia/Pesha', 'Çmimi', 'TVSH', 'Afati i pagesës'],
      warning: 'Konfirmimi i Fletë-Hyrjes rrit stokun. Mos e konfirmo dy herë.'
    },
    sales: {
      title: 'Shitje',
      intro: 'Shitja ndjek rrjedhën ofertë → porosi → Fletë-Dalje → faturë → pagesë.',
      steps: ['Zgjidh klientin dhe magazinën.', 'Shto artikujt dhe njësitë.', 'Kontrollo gjendjen dhe dhuratat.', 'Konfirmo Fletë-Daljen.', 'Hap faturën në format dokumenti dhe printo/eksporto.'],
      fields: ['Klienti', 'Magazina', 'Artikulli', 'Njësia', 'Sasia', 'Dhurata', 'Çmimi', 'Pagesa'],
      warning: 'Sistemi nuk duhet të lejojë dalje mbi gjendjen e lirë.'
    },
    inventory: {
      title: 'Inventory / Magazina',
      intro: 'Çdo lëvizje magazine është dokument nga një lokacion në një lokacion tjetër.',
      steps: ['Zgjidh llojin e operacionit.', 'Vendos lokacionin burim dhe destinacion.', 'Shto artikujt, sasitë dhe lotet.', 'Rezervo kur kërkohet.', 'Valido dokumentin.', 'Kliko Shiko për Fletë-Hyrjen/Fletë-Daljen A4.'],
      fields: ['Operacioni', 'Nga lokacioni', 'Në lokacionin', 'Artikulli', 'Loti', 'Sasia', 'Personi i autorizuar', 'Targa'],
      warning: 'Validimi prek stokun. Anulimi duhet të bëjë lëvizje kthimi, jo fshirje.'
    },
    traceability: {
      title: 'Gjurmueshmëri 360°',
      intro: 'Dosja lidh fermerin, formularin e peshës, kontrollin e cilësisë, faturën, Fletë-Hyrjen, lotin dhe proceset.',
      steps: ['Hap dosjen e fermerit/lotit.', 'Kontrollo timeline-in.', 'Kliko Shiko te dokumenti i kërkuar.', 'Dokumenti hapet si tab i ri pa humbur dosjen.', 'Përdor Print/PDF/Excel nga dokumenti.'],
      fields: ['Fermeri', 'Ferma', 'Bima', 'Formulari i peshës', 'Loti', 'Statusi', 'Dokumentet e lidhura'],
      warning: 'Mos ndrysho manualisht kodin e lotit pas krijimit të lëvizjeve.'
    },
    manufacturing: {
      title: 'Prodhimi',
      intro: 'Prodhimi lidh mostrat, fushatat, urdhrat e punës, konsumin, prodhimin dhe lotin final.',
      steps: ['Krijo mostrën/fushatën.', 'Zgjidh procesin dhe makinerinë.', 'Vendos burimet dhe sasitë.', 'Regjistro konsumin dhe prodhimin real.', 'Mbyll urdhrin vetëm pasi të jenë plotësuar peshat.'],
      fields: ['Fushata', 'Procesi', 'Makineria', 'Loti burimor', 'Sasia hyrëse', 'Sasia dalëse', 'Mbetjet'],
      warning: 'Diferenca e peshës duhet të jetë e shpjeguar dhe e auditueshme.'
    },
    finance: {
      title: 'Financa / Arka & Banka',
      intro: 'Financa regjistron mandatet, bankën, pagesat, shpenzimet dhe rakordimet.',
      steps: ['Zgjidh llogarinë e arkës/bankës.', 'Zgjidh partnerin dhe dokumentin burim.', 'Vendos shumën dhe përshkrimin.', 'Posto veprimin.', 'Kontrollo ditarin dhe saldo-n.'],
      fields: ['Llogaria', 'Data', 'Partneri', 'Dokumenti burim', 'Shuma', 'Mënyra e pagesës', 'Përshkrimi'],
      warning: 'Pagesa duhet të lidhet me faturën e saktë për të mbyllur detyrimin.'
    },
    operations: {
      title: 'Operacione & Logjistikë',
      intro: 'Moduli menaxhon shoferët, mjetet, itineraret, udhëtimet, karburantin dhe mirëmbajtjen.',
      steps: ['Zgjidh mjetin dhe shoferin.', 'Krijo itinerarin/udhëtimin.', 'Lidh dokumentet e ngarkesës.', 'Regjistro nisjen, mbërritjen dhe shpenzimet.', 'Mbyll udhëtimin.'],
      fields: ['Mjeti', 'Shoferi', 'Itinerari', 'Ngarkesa', 'Kilometrazhi', 'Karburanti', 'Shpenzimet'],
      warning: 'Mos mbyll udhëtimin pa kontrolluar dokumentet e dorëzimit.'
    },
    reports: {
      title: 'Raportet',
      intro: 'Raportet lexojnë të dhënat e postuara dhe nuk ndryshojnë dokumentet.',
      steps: ['Zgjidh raportin.', 'Vendos periudhën.', 'Përdor filtrat e entiteteve.', 'Kliko dokumentin për ta hapur si tab.', 'Eksporto PDF/Excel vetëm pas kontrollit të filtrave.'],
      fields: ['Nga data', 'Deri data', 'Kërkimi', 'Partneri', 'Artikulli', 'Magazina', 'Statusi'],
      warning: 'Totali i raportit varet nga filtrat aktivë.'
    },
    administration: {
      title: 'Administrimi',
      intro: 'Administrimi përmban kompaninë, magazinat, kategoritë, njësitë, përdoruesit, rolet dhe backup-in.',
      steps: ['Plotëso kompaninë.', 'Krijo magazinën dhe lokacionet.', 'Krijo njësitë/kategoritë.', 'Krijo përdoruesit dhe rolet.', 'Bëj backup periodik.'],
      fields: ['Kompania', 'NIPT', 'Adresa', 'Magazina', 'Njësitë', 'Përdoruesit', 'Rolet', 'Backup'],
      warning: 'Ndryshimet e strukturës dhe backup-it lejohen vetëm për administratorin.'
    }
  };

  function request(path, options) { return Cloud.request(path, options || {}); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function attr(value) { return esc(value).replace(/"/g, '&quot;'); }
  function num(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function fmt(value, digits) { return num(value).toLocaleString('sq-AL', { minimumFractionDigits: 0, maximumFractionDigits: digits == null ? 2 : digits }); }
  function money(value) { return num(value).toLocaleString('sq-AL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function dateSq(value) { if (!value) return '—'; var p = String(value).slice(0,10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(value); }
  function docLabel(type) { return DOC_LABELS[String(type || '').toUpperCase()] || String(type || 'DOKUMENT').replace(/_/g,' '); }
  function safeName(value) { return String(value || 'Dokument').replace(/[^a-z0-9ëç_-]+/gi, '_').replace(/^_+|_+$/g,''); }

  function currentModule() {
    var phase = App.SGPhase73 && App.SGPhase73.state;
    if (phase && phase.activeModule) return phase.activeModule;
    var view = String(App.currentView || '').toLowerCase();
    if (/inventory|stock|warehouse|transfer/.test(view)) return 'inventory';
    if (/purchase|supplier|weight/.test(view)) return 'purchase';
    if (/sales|customer|delivery/.test(view)) return 'sales';
    if (/trace|lot|farm|dossier/.test(view)) return 'traceability';
    if (/mrp|manufact|production/.test(view)) return 'manufacturing';
    if (/finance|cash|bank|expense/.test(view)) return 'finance';
    if (/operation|route|trip|driver|asset/.test(view)) return 'operations';
    if (/report|analysis|card/.test(view)) return 'reports';
    if (/setting|company|user|admin|audit|category/.test(view)) return 'administration';
    return 'dashboard';
  }

  function installStyle() {
    if (document.getElementById('sg80-style')) return;
    var style = document.createElement('style');
    style.id = 'sg80-style';
    style.textContent = [
      '#workspace-tabs,.workspace-tabs{display:none!important}',
      '.sg80-tabs{display:flex;align-items:center;gap:4px;overflow-x:auto;background:#fff;border-bottom:1px solid #dfe3e8;padding:6px 10px;position:sticky;top:0;z-index:90}',
      '.sg80-tab{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;border:1px solid #d8dde4;background:#f7f8fa;color:#4b5563;border-radius:7px;padding:7px 10px;cursor:pointer;font-size:12px;font-weight:750}',
      '.sg80-tab.active{background:#714b67;color:#fff;border-color:#714b67}.sg80-tab .close{border:0;background:transparent;color:inherit;padding:0;font-size:15px;line-height:1;cursor:pointer}',
      '.sg80-stage{display:none;padding:14px;min-height:calc(100vh - 150px);background:#f6f7f9}',
      '.sg80-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid #d9dde3;border-radius:9px;padding:10px 12px;margin-bottom:12px}',
      '.sg80-toolbar h2{font-size:17px;margin:0}.sg80-toolbar small{display:block;color:#737d8b;margin-top:2px}',
      '.sg80-actions{display:flex;gap:6px;flex-wrap:wrap}.sg80-btn{border:1px solid #cbd1d9;background:#fff;border-radius:7px;padding:8px 11px;font-weight:750;cursor:pointer}.sg80-btn.primary{background:#714b67;color:#fff;border-color:#714b67}.sg80-btn.danger{color:#a22;border-color:#daa}',
      '.sg80-paper{width:min(100%,210mm);min-height:270mm;margin:0 auto;background:#fff;border:1px solid #cfd4db;box-shadow:0 8px 24px rgba(31,41,55,.08);padding:10mm;color:#111}',
      '.sg80-doc-head{display:grid;grid-template-columns:1fr 1.35fr 1fr;border:2px solid #111}.sg80-doc-head>div{padding:8px;border-right:2px solid #111;min-height:90px}.sg80-doc-head>div:last-child{border-right:0}.sg80-doc-head h1{font-size:27px;text-align:center;margin:4px 0 14px}.sg80-doc-head small{display:block;margin:3px 0}.sg80-doc-head .center{text-align:center}.sg80-doc-head .right{text-align:right}',
      '.sg80-meta{display:grid;grid-template-columns:1fr 1fr;border:2px solid #111;border-top:0}.sg80-meta>div{padding:8px;border-right:2px solid #111;min-height:55px}.sg80-meta>div:last-child{border-right:0}.sg80-meta span{display:block;font-size:11px;font-weight:800}.sg80-meta strong{display:block;margin-top:8px}',
      '.sg80-table{width:100%;border-collapse:collapse}.sg80-table th,.sg80-table td{border:1.4px solid #111;padding:5px;height:29px}.sg80-table th{background:#eee;font-size:11px}.sg80-table .right{text-align:right}.sg80-table .center{text-align:center}.sg80-table .total td{background:#eee;font-weight:800}',
      '.sg80-signatures{display:grid;grid-template-columns:repeat(4,1fr);border:2px solid #111;border-top:0}.sg80-signatures>div{text-align:center;min-height:64px;padding:6px;border-right:1px solid #111}.sg80-signatures>div:last-child{border-right:0}.sg80-signatures strong{display:block;margin-top:27px}',
      '.sg80-invoice-parties{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}.sg80-party{border:1.5px solid #111;padding:8px;min-height:88px}.sg80-party h3{margin:0 0 7px;font-size:12px}.sg80-party p{margin:3px 0;font-size:11px}',
      '.sg80-invoice-summary{display:grid;grid-template-columns:1fr minmax(260px,42%);gap:14px;margin-top:10px}.sg80-totals{border-collapse:collapse;width:100%}.sg80-totals td{border:1px solid #111;padding:6px}.sg80-totals td:last-child{text-align:right;font-weight:800}',
      '.sg80-weight-title{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:8px}.sg80-weight-title h1{margin:0}.sg80-weight-info{display:grid;grid-template-columns:repeat(2,1fr);border:1.5px solid #111;margin:10px 0}.sg80-weight-info>div{padding:7px;border-right:1px solid #111;border-bottom:1px solid #111}.sg80-weight-info>div:nth-child(even){border-right:0}',
      '.sg80-help{display:grid;gap:14px}.sg80-help-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:14px}.sg80-help-card{background:#fff;border:1px solid #d9dde3;border-radius:9px;padding:14px}.sg80-help-card h3{margin-top:0}.sg80-help ol{padding-left:20px}.sg80-help li{margin:7px 0}.sg80-help-fields{display:flex;gap:7px;flex-wrap:wrap}.sg80-help-fields span{background:#f0e9ee;color:#56394f;border-radius:15px;padding:5px 9px;font-size:11px;font-weight:750}.sg80-warning{background:#fff8e7;border:1px solid #efd59b;border-radius:8px;padding:10px}',
      '.sg80-shot{border:1px solid #ccd2da;border-radius:10px;overflow:hidden;background:#f6f7f9}.sg80-shot-top{height:34px;background:#fff;border-bottom:1px solid #dfe3e8;display:flex;align-items:center;padding:0 10px;gap:6px}.sg80-shot-top i{width:8px;height:8px;border-radius:50%;background:#c8cdd4}.sg80-shot-body{display:grid;grid-template-columns:90px 1fr;min-height:230px}.sg80-shot-side{background:#fff;border-right:1px solid #dfe3e8;padding:9px}.sg80-shot-side b,.sg80-shot-side span{display:block;border-radius:4px;margin-bottom:7px}.sg80-shot-side b{height:24px;background:#714b67}.sg80-shot-side span{height:15px;background:#e7e9ed}.sg80-shot-main{padding:12px}.sg80-shot-main h4{margin:0 0 10px}.sg80-shot-box{background:#fff;border:1px solid #d9dde3;border-radius:7px;padding:10px;margin-bottom:9px}.sg80-shot-row{height:12px;background:#eceef1;border-radius:3px;margin:6px 0}.sg80-help-button{border:1px solid #cbd1d9;background:#fff;border-radius:7px;padding:7px 10px;cursor:pointer;font-weight:800;white-space:nowrap}',
      '@media(max-width:850px){.sg80-stage{padding:8px}.sg80-paper{padding:5mm;min-height:auto;overflow:auto}.sg80-doc-head{grid-template-columns:1fr}.sg80-doc-head>div{border-right:0;border-bottom:2px solid #111}.sg80-doc-head>div:last-child{border-bottom:0}.sg80-invoice-parties,.sg80-invoice-summary,.sg80-help-grid{grid-template-columns:1fr}.sg80-paper table{min-width:680px}.sg80-paper{overflow-x:auto}.sg80-signatures{grid-template-columns:repeat(2,1fr)}.sg80-shot-body{grid-template-columns:70px 1fr}.sg80-help-button{font-size:0}.sg80-help-button:before{content:"?";font-size:16px}}',
      '@media print{.sg80-toolbar,.sg80-tabs,.topbar,.sidebar{display:none!important}.sg80-stage{display:block!important;padding:0}.sg80-paper{border:0;box-shadow:none;width:100%;min-height:0;padding:0}}'
    ].join('');
    document.head.appendChild(style);
  }

  function removeCloudBadges() {
    var roots = document.querySelectorAll('.topbar,header');
    Array.prototype.forEach.call(roots, function (root) {
      Array.prototype.forEach.call(root.querySelectorAll('*'), function (node) {
        var text = String(node.textContent || '').replace(/\s+/g,' ').trim();
        if (!text || text.length > 80) return;
        if (/cloud/i.test(text) && /postgres/i.test(text)) {
          var target = node.closest('[class*="cloud"],[class*="status"],[class*="badge"],button,div,span') || node;
          if (target && target !== root) target.style.display = 'none';
        }
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('footer,small'), function (node) {
      if (String(node.textContent || '').trim() === 'Sistemi Genit Cloud') node.textContent = 'Sistemi Genit';
    });
  }

  function ensureWorkspace() {
    installStyle();
    var content = document.getElementById('content');
    if (!content || !content.parentNode) return null;
    var tabs = document.getElementById('sg80-tabs');
    var stage = document.getElementById('sg80-stage');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.id = 'sg80-tabs';
      tabs.className = 'sg80-tabs no-print';
      content.parentNode.insertBefore(tabs, content);
    }
    if (!stage) {
      stage = document.createElement('div');
      stage.id = 'sg80-stage';
      stage.className = 'sg80-stage';
      content.parentNode.insertBefore(stage, content);
    }
    return { content: content, tabs: tabs, stage: stage };
  }

  function moduleTitle() {
    var heading = document.querySelector('.topbar h2');
    var value = heading && heading.textContent ? heading.textContent.trim() : '';
    return value || W.moduleTitle || 'Paneli';
  }

  function renderTabs() {
    var ui = ensureWorkspace();
    if (!ui) return;
    var moduleTab = '<button class="sg80-tab '+(W.activeKey === 'module' ? 'active' : '')+'" onclick="App.sg80ShowModule()"><span>▦</span><span>'+esc(W.moduleTitle || 'Moduli')+'</span></button>';
    var documentTabs = W.tabs.map(function (tab) {
      return '<button class="sg80-tab '+(W.activeKey === tab.key ? 'active' : '')+'" onclick="App.sg80ActivateTab(\''+attr(tab.key)+'\')"><span>'+esc(tab.icon || '📄')+'</span><span>'+esc(tab.title)+'</span><span class="close" onclick="App.sg80CloseTab(\''+attr(tab.key)+'\',event)">×</span></button>';
    }).join('');
    ui.tabs.innerHTML = moduleTab + documentTabs;
  }

  function setHeading(value) {
    var heading = document.querySelector('.topbar h2');
    if (heading && value) heading.textContent = value;
  }

  function renderActiveTab() {
    var ui = ensureWorkspace();
    if (!ui) return;
    if (W.activeKey === 'module') {
      ui.content.style.display = '';
      ui.stage.style.display = 'none';
      setHeading(W.moduleTitle);
      renderTabs();
      return;
    }
    var tab = W.tabs.find(function (row) { return row.key === W.activeKey; });
    if (!tab) return App.sg80ShowModule();
    ui.content.style.display = 'none';
    ui.stage.style.display = 'block';
    ui.stage.innerHTML = '<div class="sg80-toolbar"><div><h2>'+esc(tab.title)+'</h2><small>'+esc(tab.subtitle || 'Dokument i hapur në hapësirën e punës')+'</small></div><div class="sg80-actions">'+
      (tab.editAction ? '<button class="sg80-btn" onclick="App.sg80RunActive(\'edit\')">✏️ Edito</button>' : '')+
      (tab.flowAction ? '<button class="sg80-btn primary" onclick="App.sg80RunActive(\'flow\')">'+esc(tab.flowLabel || 'Vazhdo')+'</button>' : '')+
      (tab.deleteAction ? '<button class="sg80-btn danger" onclick="App.sg80RunActive(\'delete\')">🗑 Fshi Draft</button>' : '')+
      '<button class="sg80-btn" onclick="App.sg80RunActive(\'print\')">🖨 Print</button>'+
      (tab.pdfAction ? '<button class="sg80-btn" onclick="App.sg80RunActive(\'pdf\')">📄 PDF</button>' : '')+
      (tab.excelAction || tab.excelRows ? '<button class="sg80-btn" onclick="App.sg80RunActive(\'excel\')">📊 Excel</button>' : '')+
      '<button class="sg80-btn" onclick="App.sg80OpenHelp()">? Ndihmë</button>'+
      '<button class="sg80-btn danger" onclick="App.sg80CloseTab(\''+attr(tab.key)+'\')">Mbyll</button></div></div>'+tab.html;
    setHeading(tab.title);
    renderTabs();
  }

  function openTab(tab) {
    ensureWorkspace();
    var current = W.tabs.find(function (row) { return row.key === tab.key; });
    if (current) Object.assign(current, tab);
    else {
      W.tabs.push(tab);
      if (W.tabs.length > W.maxTabs) W.tabs.splice(0, W.tabs.length - W.maxTabs);
    }
    W.activeKey = tab.key;
    renderActiveTab();
  }

  App.sg80ActivateTab = function (key) { W.activeKey = key; renderActiveTab(); };
  App.sg80ShowModule = function () { W.activeKey = 'module'; renderActiveTab(); };
  App.sg80CloseTab = function (key, event) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    var index = W.tabs.findIndex(function (row) { return row.key === key; });
    if (index < 0) return;
    var wasActive = W.activeKey === key;
    W.tabs.splice(index, 1);
    if (wasActive) W.activeKey = W.tabs[index - 1] ? W.tabs[index - 1].key : (W.tabs[index] ? W.tabs[index].key : 'module');
    renderActiveTab();
  };
  App.sg80RunActive = function (action) {
    var tab = W.tabs.find(function (row) { return row.key === W.activeKey; });
    if (!tab) return;
    if (action === 'edit' && typeof tab.editAction === 'function') return tab.editAction();
    if (action === 'flow' && typeof tab.flowAction === 'function') return tab.flowAction();
    if (action === 'delete' && typeof tab.deleteAction === 'function') return tab.deleteAction();
    if (action === 'pdf' && typeof tab.pdfAction === 'function') return tab.pdfAction();
    if (action === 'print') {
      if (typeof tab.printAction === 'function') return tab.printAction();
      return printHtml(tab.title, tab.printHtml || tab.html);
    }
    if (action === 'excel') {
      if (typeof tab.excelAction === 'function') return tab.excelAction();
      if (tab.excelRows) return exportRows(tab.title, tab.excelRows, tab.excelSheet || 'Dokumenti');
    }
  };

  function printCss() {
    return '@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}.sg80-paper{width:100%;padding:0}.sg80-doc-head{display:grid;grid-template-columns:1fr 1.35fr 1fr;border:2px solid #111}.sg80-doc-head>div{padding:8px;border-right:2px solid #111;min-height:90px}.sg80-doc-head>div:last-child{border-right:0}.sg80-doc-head h1{font-size:27px;text-align:center;margin:4px 0 14px}.sg80-doc-head small{display:block;margin:3px 0}.sg80-doc-head .center{text-align:center}.sg80-doc-head .right{text-align:right}.sg80-meta{display:grid;grid-template-columns:1fr 1fr;border:2px solid #111;border-top:0}.sg80-meta>div{padding:8px;border-right:2px solid #111;min-height:55px}.sg80-meta>div:last-child{border-right:0}.sg80-meta span{display:block;font-size:11px;font-weight:800}.sg80-meta strong{display:block;margin-top:8px}.sg80-table{width:100%;border-collapse:collapse}.sg80-table th,.sg80-table td{border:1.4px solid #111;padding:5px;height:29px}.sg80-table th{background:#eee;font-size:11px}.right{text-align:right}.center{text-align:center}.sg80-table .total td{background:#eee;font-weight:800}.sg80-signatures{display:grid;grid-template-columns:repeat(4,1fr);border:2px solid #111;border-top:0}.sg80-signatures>div{text-align:center;min-height:64px;padding:6px;border-right:1px solid #111}.sg80-signatures>div:last-child{border-right:0}.sg80-signatures strong{display:block;margin-top:27px}.sg80-invoice-parties{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}.sg80-party{border:1.5px solid #111;padding:8px;min-height:88px}.sg80-party h3{margin:0 0 7px;font-size:12px}.sg80-party p{margin:3px 0;font-size:11px}.sg80-invoice-summary{display:grid;grid-template-columns:1fr minmax(260px,42%);gap:14px;margin-top:10px}.sg80-totals{border-collapse:collapse;width:100%}.sg80-totals td{border:1px solid #111;padding:6px}.sg80-totals td:last-child{text-align:right;font-weight:800}.sg80-weight-title{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:8px}.sg80-weight-title h1{margin:0}.sg80-weight-info{display:grid;grid-template-columns:repeat(2,1fr);border:1.5px solid #111;margin:10px 0}.sg80-weight-info>div{padding:7px;border-right:1px solid #111;border-bottom:1px solid #111}.sg80-weight-info>div:nth-child(even){border-right:0}';
  }

  function printHtml(title, body) {
    var frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0';
    document.body.appendChild(frame);
    var doc = frame.contentDocument;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+printCss()+'</style></head><body>'+body+'</body></html>');
    doc.close();
    setTimeout(function () {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      catch (error) { App.toast('Printimi nuk u hap: '+(error.message || error), 'error'); }
      setTimeout(function () { frame.remove(); }, 2000);
    }, 400);
  }

  function exportRows(title, rows, sheetName) {
    if (!global.XLSX) return App.toast('Biblioteka Excel nuk është ngarkuar.', 'error');
    var ws = global.XLSX.utils.json_to_sheet(rows || []);
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, String(sheetName || 'Dokumenti').slice(0,31));
    global.XLSX.writeFile(wb, safeName(title) + '.xlsx');
  }

  function renderTransfer(doc) {
    var type = doc.operationKind === 'RECEIPT' ? 'FLETË HYRJE' : doc.operationKind === 'DELIVERY' ? 'FLETË DALJE' : 'FLETË TRANSFERIMI';
    var lines = doc.lines || [];
    var rows = lines.map(function (line, index) {
      var quantity = num(line.quantity != null ? line.quantity : (num(line.doneQuantity) > 0 ? line.doneQuantity : line.plannedQuantity));
      var value = line.lineValue != null ? num(line.lineValue) : quantity * num(line.unitCost);
      return '<tr><td class="center">'+(index+1)+'</td><td><strong>'+esc((line.productCode ? line.productCode+' — ' : '')+(line.productName || ''))+'</strong>'+(line.lotNumber ? '<br><small>Loti: '+esc(line.lotNumber)+'</small>' : '')+'</td><td class="center">'+esc(line.unit || 'kg')+'</td><td class="right">'+fmt(quantity,3)+'</td><td class="right">'+money(line.unitCost)+'</td><td class="right">'+money(value)+'</td></tr>';
    }).join('');
    var missing = Math.max(0, 15 - lines.length);
    for (var i=0;i<missing;i+=1) rows += '<tr><td class="center">'+(lines.length+i+1)+'</td><td></td><td></td><td></td><td></td><td></td></tr>';
    var address = doc.destinationAddress || doc.partnerAddress || doc.warehouseAddress || '—';
    return '<section class="sg80-paper"><div class="sg80-doc-head"><div><strong>'+esc(doc.companyName || 'SISTEMI GENIT')+'</strong><small>NIPT: '+esc(doc.companyNipt || '—')+'</small><small>'+esc(doc.companyAddress || '')+'</small></div><div class="center"><h1>'+esc(type)+'</h1><div>Nr. <strong>'+esc(doc.transferNo || doc.documentNo || '')+'</strong> &nbsp; Data <strong>'+esc(dateSq(doc.scheduledDate || doc.documentDate))+'</strong></div></div><div><small>'+(doc.operationKind === 'RECEIPT' ? 'Adresa nga vjen malli' : 'Adresa ku shkon malli')+'</small><strong>'+esc(address)+'</strong><small>Targa: '+esc(doc.vehiclePlate || '—')+'</small></div></div><div class="sg80-meta"><div><span>Emri, mbiemri i personit të autorizuar</span><strong>'+esc(doc.authorizedPerson || doc.receiverName || doc.partnerName || '—')+'</strong></div><div><span>Lloji / targa e mjetit transportues</span><strong>'+esc(doc.vehiclePlate || '—')+'</strong></div></div><table class="sg80-table"><thead><tr><th>Nr</th><th>Emërtimi i mallit</th><th>Njësia</th><th>Sasia</th><th>Çmimi</th><th>Vlefta</th></tr></thead><tbody>'+rows+'<tr class="total"><td colspan="3">TOTALI</td><td class="right">'+fmt(doc.totalQuantity,3)+'</td><td></td><td class="right">'+money(doc.totalValue)+' '+esc(doc.currency || 'ALL')+'</td></tr></tbody></table><div class="sg80-signatures"><div><span>Magazinieri</span><strong>'+esc(doc.warehouseKeeperName || doc.createdByName || '')+'</strong></div><div><span>Marrësi në dorëzim</span><strong>'+esc(doc.receiverName || doc.authorizedPerson || '')+'</strong></div><div><span>Transportuesi</span><strong>'+esc(doc.transporterName || '')+'</strong></div><div><span>Llogaritari</span><strong>'+esc(doc.accountantName || '')+'</strong></div></div><p style="font-size:9px"><b>Nga:</b> '+esc(doc.sourceLocationName || 'Jashtë magazine')+' &nbsp; <b>Në:</b> '+esc(doc.destinationLocationName || 'Jashtë magazine')+' &nbsp; <b>Statusi:</b> '+esc(doc.state || doc.status || '—')+'</p></section>';
  }

  function transferExcelRows(doc) {
    return (doc.lines || []).map(function (line, index) {
      var quantity = num(line.quantity != null ? line.quantity : (num(line.doneQuantity) > 0 ? line.doneQuantity : line.plannedQuantity));
      return { Nr:index+1, Artikulli:(line.productCode ? line.productCode+' — ' : '')+(line.productName || ''), Loti:line.lotNumber || '', Njesia:line.unit || 'kg', Sasia:quantity, Cmimi:num(line.unitCost), Vlefta:line.lineValue != null ? num(line.lineValue) : quantity*num(line.unitCost) };
    });
  }

  async function openTransfer(id) {
    var doc = await request('/api/inventory/transfers/'+encodeURIComponent(id)+'/print-data');
    var title = (doc.operationKind === 'RECEIPT' ? 'Fletë-Hyrje' : doc.operationKind === 'DELIVERY' ? 'Fletë-Dalje' : 'Transferim')+' '+(doc.transferNo || '');
    openTab({
      key:'transfer:'+id,
      title:title,
      subtitle:'Dokumenti real A4 — jo tabelë teknike',
      icon:doc.operationKind === 'RECEIPT' ? '📥' : doc.operationKind === 'DELIVERY' ? '📤' : '🔁',
      html:renderTransfer(doc),
      printAction:function(){ if(typeof App.sg76PrintDocument === 'function') App.sg76PrintDocument(id); else printHtml(title, renderTransfer(doc)); },
      excelAction:function(){ if(typeof App.sg76ExcelDocument === 'function') App.sg76ExcelDocument(id); else exportRows(title, transferExcelRows(doc), 'Dokumenti'); },
      editAction:function(){ if(typeof App.sg76EditDocumentDetails === 'function') App.sg76EditDocumentDetails(id); }
    });
    return doc;
  }

  function partnerDetails(rows, id) { return (rows || []).find(function (row) { return row.id === id; }) || {}; }
  function companyDetails(rows, id) { return (rows || []).find(function (row) { return row.id === id; }) || {}; }

  function renderBusiness(doc, company, partner) {
    var type = String(doc.doc_type || doc.docType || '').toUpperCase();
    var isPurchase = type.indexOf('PURCHASE') === 0;
    var isInvoice = /INVOICE/.test(type);
    var title = docLabel(type);
    var seller = isPurchase ? partner : company;
    var buyer = isPurchase ? company : partner;
    var items = doc.items || [];
    var rows = items.map(function (line, index) {
      return '<tr><td class="center">'+(index+1)+'</td><td>'+esc(line.description || line.productName || '')+'</td><td class="center">'+esc(line.unit || '')+'</td><td class="right">'+fmt(line.quantity,3)+'</td><td class="right">'+money(line.unitPrice)+'</td><td class="right">'+fmt(line.vatRate,2)+'%</td><td class="right">'+money(line.lineNet)+'</td><td class="right">'+money(line.lineVat)+'</td><td class="right">'+money(line.lineTotal)+'</td></tr>';
    }).join('');
    var docNo = doc.document_no || doc.documentNo || '';
    var docDate = doc.document_date || doc.documentDate || '';
    return '<section class="sg80-paper"><div class="sg80-weight-title"><div><small>'+esc(company.name || doc.company_name || 'SISTEMI GENIT')+'</small><h1>'+esc(title)+'</h1></div><div style="text-align:right"><b>Nr. '+esc(docNo)+'</b><br>Data: '+esc(dateSq(docDate))+'<br>Statusi: '+esc(doc.status || '—')+'</div></div><div class="sg80-invoice-parties"><div class="sg80-party"><h3>SHITËSI</h3><p><b>'+esc(seller.name || '—')+'</b></p><p>NIPT: '+esc(seller.nipt || seller.tax_id || '—')+'</p><p>Adresa: '+esc([seller.address,seller.city].filter(Boolean).join(', ') || '—')+'</p><p>Telefon: '+esc(seller.phone || '—')+'</p></div><div class="sg80-party"><h3>BLERËSI</h3><p><b>'+esc(buyer.name || '—')+'</b></p><p>NIPT: '+esc(buyer.nipt || buyer.tax_id || '—')+'</p><p>Adresa: '+esc([buyer.address,buyer.city].filter(Boolean).join(', ') || '—')+'</p><p>Telefon: '+esc(buyer.phone || '—')+'</p></div></div><table class="sg80-table"><thead><tr><th>Nr</th><th>Përshkrimi</th><th>Njësia</th><th>Sasia</th><th>Çmimi</th><th>TVSH %</th><th>Pa TVSH</th><th>TVSH</th><th>Vlera Totale</th></tr></thead><tbody>'+rows+'</tbody></table><div class="sg80-invoice-summary"><div><p><b>Magazina:</b> '+esc(doc.warehouse_name || '—')+'</p><p><b>Shënime:</b> '+esc(doc.notes || '—')+'</p>'+(isInvoice?'<p><b>Mënyra e pagesës:</b> '+esc(doc.payment_method || 'Sipas marrëveshjes')+'</p>':'')+'</div><table class="sg80-totals"><tr><td>Vlera pa TVSH</td><td>'+money(doc.total_net)+'</td></tr><tr><td>TVSH</td><td>'+money(doc.total_vat)+'</td></tr><tr><td>TOTALI '+esc(company.currency || 'ALL')+'</td><td>'+money(doc.total_amount)+'</td></tr></table></div><div class="sg80-signatures" style="margin-top:18px;border-top:2px solid #111"><div><span>Përgatiti</span><strong></strong></div><div><span>Magazinieri</span><strong></strong></div><div><span>Pranoi</span><strong></strong></div><div><span>Firma / Vula</span><strong></strong></div></div></section>';
  }

  function businessExcelRows(doc) {
    return (doc.items || []).map(function (line, index) { return { Nr:index+1, Pershkrimi:line.description || '', Njesia:line.unit || '', Sasia:num(line.quantity), Cmimi:num(line.unitPrice), TVSH_Perqind:num(line.vatRate), Vlera_Pa_TVSH:num(line.lineNet), TVSH:num(line.lineVat), Vlera_Totale:num(line.lineTotal) }; });
  }

  function businessColumns() {
    return [
      {key:'nr',label:'Nr.',width:35},
      {key:'description',label:'Përshkrimi',width:180},
      {key:'unit',label:'Njësia',width:55},
      {key:'quantity',label:'Sasia',type:'number',width:65},
      {key:'unitPrice',label:'Çmimi',type:'currency',width:75},
      {key:'vatRate',label:'TVSH %',type:'number',width:55},
      {key:'lineNet',label:'Pa TVSH',type:'currency',width:80},
      {key:'lineVat',label:'TVSH',type:'currency',width:70},
      {key:'lineTotal',label:'Totali',type:'currency',width:85}
    ];
  }

  function businessRows(doc) {
    return (doc.items || []).map(function (line, index) {
      return {nr:index+1,description:line.description || line.productName || '',unit:line.unit || '',quantity:num(line.quantity),unitPrice:num(line.unitPrice),vatRate:num(line.vatRate),lineNet:num(line.lineNet),lineVat:num(line.lineVat),lineTotal:num(line.lineTotal)};
    });
  }

  function exportBusinessPdf(doc, company, partner, title) {
    var rows = businessRows(doc);
    if (!rows.length) return App.toast('Dokumenti nuk ka artikuj për PDF.', 'error');
    if (!global.PDFEngine) return App.toast('Motori PDF nuk është ngarkuar.', 'error');
    global.PDFEngine.downloadReport({
      company:company,
      title:title,
      filtersText:'Data: '+dateSq(doc.document_date || doc.documentDate)+' | Partneri: '+(partner.name || doc.partner_name || '—')+' | Magazina: '+(doc.warehouse_name || '—')+' | Statusi: '+(doc.status || '—'),
      columns:businessColumns(),
      rows:rows,
      orientation:'landscape',
      filename:safeName(title)+'.pdf',
      footer:'Vlera pa TVSH: '+money(doc.total_net)+' | TVSH: '+money(doc.total_vat)+' | TOTALI: '+money(doc.total_amount)+' '+(company.currency || 'ALL')
    });
    App.toast('PDF real u eksportua.');
  }

  function exportBusinessExcel(doc, company, partner, title) {
    if (!global.XLSX) return App.toast('Biblioteka Excel nuk është ngarkuar.', 'error');
    var rows = businessRows(doc);
    if (!rows.length) return App.toast('Dokumenti nuk ka artikuj për Excel.', 'error');
    var columns = businessColumns();
    var aoa = [[title],[company.name || doc.company_name || 'Sistemi Genit','NIPT: '+(company.nipt || '—')],['Data',dateSq(doc.document_date || doc.documentDate)],['Partneri',partner.name || doc.partner_name || '—'],['NIPT partneri',partner.nipt || partner.tax_id || '—'],['Magazina',doc.warehouse_name || '—'],['Statusi',doc.status || '—'],[],columns.map(function (column) { return column.label; })];
    rows.forEach(function (row) { aoa.push(columns.map(function (column) { return row[column.key]; })); });
    aoa.push([]);
    aoa.push(['','','','','','','Vlera pa TVSH',num(doc.total_net)]);
    aoa.push(['','','','','','','TVSH',num(doc.total_vat)]);
    aoa.push(['','','','','','','TOTALI '+(company.currency || 'ALL'),num(doc.total_amount)]);
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = columns.map(function (column) { return {wch:Math.max(9,Math.round((column.width || 70)/7))}; });
    ws['!freeze'] = {xSplit:0,ySplit:9};
    ws['!autofilter'] = {ref:'A9:I9'};
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, String(docLabel(doc.doc_type || doc.docType)).slice(0,31));
    if (global.DesktopIO && global.DesktopIO.saveWorkbook) global.DesktopIO.saveWorkbook(wb, safeName(title)+'.xlsx');
    else global.XLSX.writeFile(wb, safeName(title)+'.xlsx');
    App.toast('Excel real u eksportua.');
  }

  async function openBusiness(id, expectedType) {
    var doc = await request('/api/documents/'+encodeURIComponent(id));
    var partnerType = String(doc.doc_type || '').indexOf('PURCHASE') === 0 ? 'SUPPLIER' : 'CUSTOMER';
    var info = await Promise.all([request('/api/companies'), request('/api/partners?type='+partnerType)]);
    var company = companyDetails(info[0], doc.company_id);
    var partner = partnerDetails(info[1], doc.partner_id);
    company.name = company.name || doc.company_name;
    partner.name = partner.name || doc.partner_name;
    var type = String(doc.doc_type || expectedType || '').toUpperCase();
    var title = docLabel(type)+' '+(doc.document_no || '');
    var editFn = null;
    if (doc.status === 'DRAFT') {
      if (type === 'PURCHASE_INVOICE' && typeof original.openPurchaseInvoice === 'function') editFn = function(){ App.sg80ShowModule(); return original.openPurchaseInvoice.call(App,id); };
      else if (type === 'SALES_INVOICE' && typeof original.openSaleInvoice === 'function') editFn = function(){ App.sg80ShowModule(); return original.openSaleInvoice.call(App,id); };
      else if (typeof original.openOdooDocument === 'function') editFn = function(){ App.sg80ShowModule(); return original.openOdooDocument.call(App,type,id); };
    }
    var html = renderBusiness(doc, company, partner);
    var deleteFn = doc.status === 'DRAFT' && typeof App.deleteCloudDocument === 'function' ? async function () {
      var deleted = await App.deleteCloudDocument(id);
      if (deleted) App.sg80CloseTab('business:'+id);
      return deleted;
    } : null;
    var flowTarget = type === 'PURCHASE_ORDER' ? 'PURCHASE_RECEIPT' : type === 'PURCHASE_RECEIPT' ? 'PURCHASE_INVOICE' : null;
    var flowLabel = type === 'PURCHASE_ORDER' ? '📥 Krijo Pranim' : type === 'PURCHASE_RECEIPT' ? '🧾 Krijo Faturë' : '';
    var flowFn = flowTarget ? async function () {
      if (typeof App.sg95ConvertCloudTarget !== 'function') return App.toast('Veprimi i dokumentit nuk është ngarkuar.', 'error');
      var created = await App.sg95ConvertCloudTarget(id,type,flowTarget,true);
      if (created) App.sg80CloseTab('business:'+id);
      return created;
    } : null;
    openTab({ key:'business:'+id, title:title, subtitle:'Dokumenti real i biznesit në format A4', icon:/INVOICE/.test(type)?'🧾':/RECEIPT|DELIVERY/.test(type)?'📦':'📄', html:html, printAction:function(){printHtml(title,html);}, pdfAction:function(){exportBusinessPdf(doc,company,partner,title);}, excelAction:function(){exportBusinessExcel(doc,company,partner,title);}, editAction:editFn, flowAction:flowFn, flowLabel:flowLabel, deleteAction:deleteFn });
    return doc;
  }

  function renderWeight(details) {
    var w = details.weight || {};
    var lines = details.lines || w.lines || [];
    var gross=0,pack=0,net=0,bags=0;
    var rows = lines.map(function (line, index) {
      var g=num(line.gross_kg != null?line.gross_kg:line.grossKg),p=num(line.packaging_kg != null?line.packaging_kg:line.packagingKg),b=num(line.packaging_count != null?line.packaging_count:(line.bag_count != null?line.bag_count:line.packagingCount)),n=Math.max(0,g-p);
      gross+=g;pack+=p;net+=n;bags+=b;
      return '<tr><td class="center">'+(index+1)+'</td><td class="right">'+fmt(b,2)+'</td><td class="right">'+fmt(g,3)+'</td><td class="right">'+fmt(p,3)+'</td><td class="right"><strong>'+fmt(n,3)+'</strong></td></tr>';
    }).join('');
    for(var i=lines.length;i<Math.max(18,lines.length);i+=1)rows+='<tr><td class="center">'+(i+1)+'</td><td></td><td></td><td></td><td></td></tr>';
    var discount=num(w.discount_percent != null?w.discount_percent:w.discountPercent),accepted=net*(1-discount/100),docNo=w.document_no||w.documentNo||'';
    return { title:'Formulari i Peshës '+docNo, html:'<section class="sg80-paper"><div class="sg80-weight-title"><div><strong>'+esc(w.company_name||'BIOBES')+'</strong><h1>PESHAT</h1></div><div style="text-align:right"><b>Nr. '+esc(docNo)+'</b><br>Data: '+esc(dateSq(w.document_date||w.documentDate))+'</div></div><div class="sg80-weight-info"><div><b>Person përgjegjës</b><br>'+esc(w.responsible_person||w.created_by_name||'—')+'</div><div><b>Furnitori / Fermeri</b><br>'+esc(w.supplier_name||w.supplierName||'—')+'</div><div><b>Produkti</b><br>'+esc(w.product_name||w.productName||'—')+'</div><div><b>Magazina</b><br>'+esc(w.warehouse_name||w.warehouseName||'—')+'</div><div><b>Targa</b><br>'+esc(w.vehicle_plate||w.vehiclePlate||'—')+'</div><div><b>Statusi</b><br>'+esc(w.status||'DRAFT')+'</div></div><table class="sg80-table"><thead><tr><th>NR</th><th>NR THASËVE / AMB</th><th>KG</th><th>AMBALAZHI</th><th>SHUMA / NETO</th></tr></thead><tbody>'+rows+'<tr class="total"><td>TOTAL</td><td class="right">'+fmt(bags,2)+'</td><td class="right">'+fmt(gross,3)+'</td><td class="right">'+fmt(pack,3)+'</td><td class="right">'+fmt(net,3)+'</td></tr></tbody></table><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px"><div><b>Zbritje:</b> '+fmt(discount,2)+'%</div><div style="text-align:right"><b>Pesha neto pas zbritjes:</b> '+fmt(accepted,3)+' kg</div></div><div class="sg80-signatures" style="margin-top:25px;border-top:2px solid #111"><div><span>Operatori</span><strong></strong></div><div><span>Furnitori</span><strong></strong></div><div><span>Magazinieri</span><strong></strong></div><div><span>Kontrolli</span><strong></strong></div></div></section>', rows:lines.map(function(line,index){var g=num(line.gross_kg != null?line.gross_kg:line.grossKg),p=num(line.packaging_kg != null?line.packaging_kg:line.packagingKg);return{Nr:index+1,Ambalazhe:num(line.packaging_count != null?line.packaging_count:(line.bag_count != null?line.bag_count:line.packagingCount)),KG:g,Ambalazhi:p,Pesha_Neto:Math.max(0,g-p)};}) };
  }

  async function openWeight(id) {
    var details = await request('/api/trace/workflow/weights/'+encodeURIComponent(id)+'/details');
    var doc = renderWeight(details);
    openTab({ key:'weight:'+id, title:doc.title, subtitle:'Formulari i peshës në pamjen e dokumentit', icon:'⚖️', html:doc.html, printHtml:doc.html, excelRows:doc.rows, excelSheet:'Formulari Peshes', editAction:typeof original.openWeightForm === 'function' ? function(){ App.sg80ShowModule(); return original.openWeightForm.call(App,id); } : null });
    return details;
  }

  function genericSnapshot(item) {
    var snap = item.snapshot || {};
    var title = item.title || docLabel(item.documentType || item.entityType);
    var number = item.documentNo || snap.documentNo || snap.document_no || '';
    var date = item.documentDate || item.createdAt || snap.documentDate || snap.document_date;
    var preferred = ['supplierName','customerName','partnerName','productName','warehouseName','lotNumber','quantity','netWeight','totalAmount','status','notes'];
    var keys = Object.keys(snap).filter(function(key){return snap[key] == null || typeof snap[key] !== 'object';});
    keys.sort(function(a,b){var ai=preferred.indexOf(a),bi=preferred.indexOf(b);return(ai<0?999:ai)-(bi<0?999:bi);});
    var rows = keys.map(function(key){return '<tr><th style="text-align:left;width:35%">'+esc(key.replace(/([A-Z])/g,' $1').replace(/_/g,' '))+'</th><td>'+esc(snap[key])+'</td></tr>';}).join('');
    var html='<section class="sg80-paper"><div class="sg80-weight-title"><div><small>DOKUMENT I LIDHUR</small><h1>'+esc(title)+'</h1></div><div style="text-align:right"><b>'+esc(number)+'</b><br>'+esc(dateSq(date))+'</div></div><table class="sg80-table" style="margin-top:12px"><tbody>'+rows+'</tbody></table><div class="sg80-signatures" style="margin-top:22px;border-top:2px solid #111"><div><span>Përgatiti</span><strong></strong></div><div><span>Kontrolloi</span><strong></strong></div><div><span>Pranoi</span><strong></strong></div><div><span>Firma / Vula</span><strong></strong></div></div></section>';
    openTab({key:'timeline:'+(item.entityId||number||Date.now()),title:title+' '+number,subtitle:'Dokument i lidhur nga gjurmueshmëria',icon:'📄',html:html,printHtml:html,excelRows:keys.map(function(key){return{Fusha:key,Vlera:snap[key]};}),excelSheet:'Dokumenti'});
  }

  async function openTimeline(index) {
    if (!W.dossierId) return original.openTimelineDocument && original.openTimelineDocument.call(App,index);
    var data = await request('/api/trace/workflow/dossiers/'+encodeURIComponent(W.dossierId));
    var item = (data.timeline || [])[Number(index)];
    if (!item) throw new Error('Dokumenti i lidhur nuk u gjet.');
    var type = String(item.documentType || item.entityType || '').toUpperCase();
    if (type === 'LOT_LABEL') return App.openLotLabel58 && App.openLotLabel58(item.entityId);
    if (/WEIGHT/.test(type)) return openWeight(item.entityId);
    if (/INVENTORY_TRANSFER|TRANSFER|FLET[EË]_?HYRJE|FLET[EË]_?DALJE/.test(type)) {
      try { return await openTransfer(item.entityId); } catch (_e) { }
    }
    if (/PURCHASE|SALES|INVOICE|ORDER|QUOTE|DELIVERY|RECEIPT/.test(type)) {
      try { return await openBusiness(item.entityId); } catch (_e2) {
        try { return await openTransfer(item.entityId); } catch (_e3) { }
      }
    }
    return genericSnapshot(item);
  }

  function helpIllustration(help) {
    return '<div class="sg80-shot"><div class="sg80-shot-top"><i></i><i></i><i></i><strong style="margin-left:7px">'+esc(help.title)+'</strong></div><div class="sg80-shot-body"><div class="sg80-shot-side"><b></b><span></span><span></span><span></span><span></span><span></span></div><div class="sg80-shot-main"><h4>'+esc(help.title)+'</h4><div class="sg80-shot-box"><div class="sg80-shot-row" style="width:70%"></div><div class="sg80-shot-row" style="width:95%"></div><div class="sg80-shot-row" style="width:82%"></div></div><div class="sg80-shot-box"><div class="sg80-shot-row"></div><div class="sg80-shot-row"></div><div class="sg80-shot-row" style="width:62%"></div></div></div></div></div>';
  }

  function helpHtml(module) {
    var help = HELP[module] || HELP.dashboard;
    return '<div class="sg80-help"><div class="sg80-help-grid"><section class="sg80-help-card"><small>MANUALI I MODULIT</small><h2>'+esc(help.title)+'</h2><p>'+esc(help.intro)+'</p><h3>Si përdoret</h3><ol>'+help.steps.map(function(step){return'<li>'+esc(step)+'</li>';}).join('')+'</ol><h3>Fushat kryesore</h3><div class="sg80-help-fields">'+help.fields.map(function(field){return'<span>'+esc(field)+'</span>';}).join('')+'</div><p class="sg80-warning"><b>Kujdes:</b> '+esc(help.warning)+'</p></section><section class="sg80-help-card"><h3>Pamje orientuese</h3>'+helpIllustration(help)+'<p style="font-size:11px;color:#737d8b">Pamja orientuese tregon ku ndodhen menuja, fusha dhe dokumenti. Udhëzimet e modulit qëndrojnë hapur si tab pa humbur punën.</p></section></div><section class="sg80-help-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><h3 style="margin:0">Manuali i plotë i Sistemi Genit</h3><p style="margin:4px 0 0">Të gjitha modulet në një manual të vetëm, të printueshëm.</p></div><button class="sg80-btn primary" onclick="App.sg80OpenFullManual()">Hap manualin e plotë</button></div></section></div>';
  }

  App.sg80OpenHelp = function () {
    var module = currentModule();
    var help = HELP[module] || HELP.dashboard;
    openTab({key:'help:'+module,title:'Ndihmë — '+help.title,subtitle:'Udhëzime të modulit pa dalë nga puna',icon:'❓',html:helpHtml(module),printHtml:'<section class="sg80-paper">'+helpHtml(module)+'</section>'});
  };

  App.sg80OpenFullManual = function () {
    var body = '<div class="sg80-help">'+Object.keys(HELP).map(function(key){var h=HELP[key];return'<section class="sg80-help-card" style="break-inside:avoid"><h2>'+esc(h.title)+'</h2><p>'+esc(h.intro)+'</p><ol>'+h.steps.map(function(step){return'<li>'+esc(step)+'</li>';}).join('')+'</ol><p class="sg80-warning"><b>Kujdes:</b> '+esc(h.warning)+'</p></section>';}).join('')+'</div>';
    openTab({key:'help:full',title:'Manuali i plotë',subtitle:'Manual i integruar për të gjitha modulet',icon:'📘',html:body,printHtml:'<section class="sg80-paper">'+body+'</section>'});
  };

  function ensureHelpButton() {
    var top = document.querySelector('.topbar');
    if (!top || document.getElementById('sg80-help-button')) return;
    var button = document.createElement('button');
    button.id = 'sg80-help-button';
    button.className = 'sg80-help-button no-print';
    button.type = 'button';
    button.innerHTML = '? <span>Ndihmë</span>';
    button.addEventListener('click', function(){ App.sg80OpenHelp(); });
    top.appendChild(button);
  }

  function wrapFunctions() {
    App.navigate = function () {
      W.activeKey = 'module';
      W.moduleView = arguments[0] || App.currentView || W.moduleView;
      var result = original.navigate.apply(this, arguments);
      var finish = function () { W.moduleTitle = moduleTitle(); renderActiveTab(); removeCloudBadges(); ensureHelpButton(); };
      if (result && typeof result.then === 'function') return result.then(function(value){setTimeout(finish,0);return value;});
      setTimeout(finish,0);
      return result;
    };

    if (typeof original.openTraceDossier === 'function') {
      App.openTraceDossier = async function (id) { W.dossierId = id || ''; return original.openTraceDossier.apply(this, arguments); };
    }
    App.sg62OpenTimelineDocument = function (index) { return openTimeline(index).catch(function(error){App.toast(error.message||String(error),'error');}); };
    App.sg75OpenTransfer = function (id) { return openTransfer(id).catch(function(error){ if (typeof original.openTransfer === 'function') return original.openTransfer.call(App,id); App.toast(error.message||String(error),'error'); }); };
    App.openWeightForm = function (id) { if (!id && typeof original.openWeightForm === 'function') return original.openWeightForm.apply(this, arguments); return openWeight(id).catch(function(error){ if(typeof original.openWeightForm==='function')return original.openWeightForm.call(App,id);App.toast(error.message||String(error),'error');}); };
    App.openPurchaseInvoice = function (id) { return openBusiness(id,'PURCHASE_INVOICE').catch(function(error){ if(typeof original.openPurchaseInvoice==='function')return original.openPurchaseInvoice.call(App,id);App.toast(error.message||String(error),'error');}); };
    App.openSaleInvoice = function (id) { return openBusiness(id,'SALES_INVOICE').catch(function(error){ if(typeof original.openSaleInvoice==='function')return original.openSaleInvoice.call(App,id);App.toast(error.message||String(error),'error');}); };
    App.openOdooDocument = function (type,id) { if(!id&&typeof original.openOdooDocument==='function')return original.openOdooDocument.apply(this,arguments);return openBusiness(id,type).catch(function(error){if(typeof original.openOdooDocument==='function')return original.openOdooDocument.call(App,type,id);App.toast(error.message||String(error),'error');}); };
  }

  function start() {
    installStyle();
    ensureWorkspace();
    W.moduleTitle = moduleTitle();
    wrapFunctions();
    renderActiveTab();
    ensureHelpButton();
    removeCloudBadges();
    var observer = new MutationObserver(function(){ ensureWorkspace(); ensureHelpButton(); removeCloudBadges(); });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  App.SGPhase80 = { state:W, openTab:openTab, openTransfer:openTransfer, openBusiness:openBusiness, openWeight:openWeight, help:HELP };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window);
/* SG_PHASE80_DOCUMENT_WORKSPACE_HELP_END */
