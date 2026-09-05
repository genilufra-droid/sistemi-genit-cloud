/* SG_PRODUCT_ODOO_EDITOR_START — live product modal upgrade */
(function (global) {
  'use strict';

  function resolveApp() {
    try { if (global.App) return global.App; } catch (_ignore) {}
    try { return global.eval('typeof App !== "undefined" ? App : null'); } catch (_ignore2) {}
    return null;
  }

  function closestGroup(element) {
    if (!element) return null;
    return (element.closest && (element.closest('.form-group') || element.closest('.field-group'))) || element.parentElement;
  }

  function findGroupByLabel(root, text) {
    var groups = root ? root.querySelectorAll('.form-group, .field-group') : [];
    var needle = String(text || '').toLocaleLowerCase('sq-AL');
    for (var i = 0; i < groups.length; i += 1) {
      var label = groups[i].querySelector('label');
      var value = String(label && label.textContent || groups[i].textContent || '').toLocaleLowerCase('sq-AL');
      if (value.indexOf(needle) >= 0) return groups[i];
    }
    return null;
  }

  function smallestTextContainer(root, phrase) {
    if (!root) return null;
    var nodes = root.querySelectorAll('fieldset, section, div');
    var needle = String(phrase || '').toLocaleLowerCase('sq-AL');
    var best = null;
    for (var i = 0; i < nodes.length; i += 1) {
      var text = String(nodes[i].textContent || '').toLocaleLowerCase('sq-AL');
      if (text.indexOf(needle) < 0 || !nodes[i].querySelector('input,select,textarea')) continue;
      if (!best || nodes[i].querySelectorAll('*').length < best.querySelectorAll('*').length) best = nodes[i];
    }
    return best;
  }

  function uniquePush(list, node) {
    if (node && list.indexOf(node) < 0) list.push(node);
  }

  function makePanel(key, title) {
    var panel = document.createElement('section');
    panel.className = 'sg-product-tab-panel';
    panel.dataset.sgProductPanel = key;
    if (key !== 'general') panel.hidden = true;
    var head = document.createElement('div');
    head.className = 'sg-product-section-title';
    head.textContent = title;
    var grid = document.createElement('div');
    grid.className = 'sg-product-tab-grid';
    panel.appendChild(head);
    panel.appendChild(grid);
    return { panel: panel, grid: grid };
  }

  function showTab(workspace, key) {
    var buttons = workspace.querySelectorAll('[data-sg-product-tab]');
    var panels = workspace.querySelectorAll('[data-sg-product-panel]');
    for (var i = 0; i < buttons.length; i += 1) {
      var active = buttons[i].dataset.sgProductTab === key;
      buttons[i].classList.toggle('active', active);
      buttons[i].setAttribute('aria-selected', active ? 'true' : 'false');
    }
    for (var j = 0; j < panels.length; j += 1) panels[j].hidden = panels[j].dataset.sgProductPanel !== key;
  }

  function enhanceProductModal(existing) {
    var nameInput = document.getElementById('pr-name');
    if (!nameInput) return false;
    var modal = (nameInput.closest && (nameInput.closest('.modal') || nameInput.closest('.modal-content'))) || document.getElementById('modal-overlay');
    if (!modal || modal.dataset.sgProductOdoo === '1') return true;
    modal.dataset.sgProductOdoo = '1';
    modal.classList.add('sg-product-odoo-modal');

    var body = (nameInput.closest && nameInput.closest('.modal-body')) || nameInput.closest('.modal-content') || modal;
    var sourceGrid = nameInput.closest && nameInput.closest('.form-grid');
    if (!sourceGrid || !body) return true;

    var titleNode = modal.querySelector('.modal-header h2, .modal-header h3, .modal-title, h2, h3');
    if (titleNode) titleNode.textContent = existing ? 'Artikulli / Edito' : 'Artikujt / I Ri';

    var workspace = document.createElement('div');
    workspace.className = 'sg-product-odoo-workspace';
    workspace.innerHTML = '<div class="sg-product-odoo-head"><div><span class="sg-product-eyebrow">ARTIKULL</span><div class="sg-product-name-preview"></div></div><div class="sg-product-live-stats"><div><strong data-sg-stat="stock">0</strong><span>Në stok</span></div><div><strong data-sg-stat="price">0</strong><span>Çmimi shitjes</span></div><div><strong data-sg-stat="unit">—</strong><span>Njësia</span></div></div></div><div class="sg-product-tabs" role="tablist"><button type="button" class="active" data-sg-product-tab="general">Informacion i Përgjithshëm</button><button type="button" data-sg-product-tab="inventory">Stoku</button><button type="button" data-sg-product-tab="sales">Shitje</button><button type="button" data-sg-product-tab="traceability">Gjurmueshmëri</button></div>';

    var general = makePanel('general', 'Të dhënat bazë');
    var inventory = makePanel('inventory', 'Inventari');
    var sales = makePanel('sales', 'Shitje');
    var traceability = makePanel('traceability', 'Gjurmueshmëria e Bimës Medicinale');
    workspace.appendChild(general.panel);
    workspace.appendChild(inventory.panel);
    workspace.appendChild(sales.panel);
    workspace.appendChild(traceability.panel);

    var generalIds = ['pr-code', 'pr-barcode', 'pr-name', 'pr-unit', 'pr-cat'];
    var inventoryIds = ['pr-stock', 'pr-minstock', 'pr-min-stock', 'pr-minimum-stock'];
    var salesIds = ['pr-salesprice', 'pr-saleprice'];
    var moved = [];

    generalIds.forEach(function (id) { var node = closestGroup(document.getElementById(id)); if (node) { uniquePush(moved, node); general.grid.appendChild(node); } });
    inventoryIds.forEach(function (id) { var node = closestGroup(document.getElementById(id)); if (node) { uniquePush(moved, node); inventory.grid.appendChild(node); } });
    salesIds.forEach(function (id) { var node = closestGroup(document.getElementById(id)); if (node) { uniquePush(moved, node); sales.grid.appendChild(node); } });

    var minStockByLabel = findGroupByLabel(sourceGrid, 'Stoku Minimum');
    if (minStockByLabel && moved.indexOf(minStockByLabel) < 0) { moved.push(minStockByLabel); inventory.grid.appendChild(minStockByLabel); }
    var traceBox = smallestTextContainer(body, 'Gjurmueshmëria e Bimës Medicinale');
    if (traceBox && traceBox !== workspace && !workspace.contains(traceBox)) {
      traceBox.classList.add('sg-product-traceability-box');
      traceability.grid.appendChild(traceBox);
    }

    var leftovers = Array.prototype.slice.call(sourceGrid.children || []);
    leftovers.forEach(function (node) {
      if (node && moved.indexOf(node) < 0 && node !== traceBox) general.grid.appendChild(node);
    });

    if (sourceGrid.parentNode) sourceGrid.parentNode.insertBefore(workspace, sourceGrid);
    if (!sourceGrid.children.length) sourceGrid.remove();

    var preview = workspace.querySelector('.sg-product-name-preview');
    var stockStat = workspace.querySelector('[data-sg-stat="stock"]');
    var priceStat = workspace.querySelector('[data-sg-stat="price"]');
    var unitStat = workspace.querySelector('[data-sg-stat="unit"]');
    function syncStats() {
      var stock = document.getElementById('pr-stock');
      var price = document.getElementById('pr-salesprice');
      var unit = document.getElementById('pr-unit');
      preview.textContent = nameInput.value || 'Artikull i ri';
      stockStat.textContent = stock && stock.value !== '' ? stock.value : '0';
      priceStat.textContent = price && price.value !== '' ? price.value : '0';
      unitStat.textContent = unit ? (unit.dataset.selectedCode || unit.value || '—') : '—';
    }
    [nameInput, document.getElementById('pr-stock'), document.getElementById('pr-salesprice'), document.getElementById('pr-unit')].forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', syncStats);
      el.addEventListener('change', syncStats);
    });
    syncStats();

    var tabs = workspace.querySelectorAll('[data-sg-product-tab]');
    for (var i = 0; i < tabs.length; i += 1) {
      tabs[i].addEventListener('click', function () { showTab(workspace, this.dataset.sgProductTab); });
    }
    if (!traceability.grid.children.length) {
      var traceTab = workspace.querySelector('[data-sg-product-tab="traceability"]');
      if (traceTab) traceTab.hidden = true;
    }
    return true;
  }

  function install() {
    if (global.__SG_PRODUCT_ODOO_EDITOR__) return true;
    var App = resolveApp();
    if (!App || typeof App.editProduct !== 'function') return false;
    global.__SG_PRODUCT_ODOO_EDITOR__ = true;
    var originalEditProduct = App.editProduct;
    App.editProduct = function (existing) {
      var result = originalEditProduct.apply(this, arguments);
      var apply = function (value) {
        global.setTimeout(function () { enhanceProductModal(existing); }, 0);
        return value;
      };
      if (result && typeof result.then === 'function') return result.then(apply, function (error) { throw error; });
      return apply(result);
    };
    global.SGProductOdooEditor = { enhance: enhanceProductModal };
    return true;
  }

  function boot() { if (!install()) global.setTimeout(boot, 100); }
  boot();
})(window);
/* SG_PRODUCT_ODOO_EDITOR_END */
