/* SG_PHASE68_FINANCE_OPERATIONS_SEPARATION_START — Sistemi Genit */
(function (global) {
  'use strict';

  var App = global.App;
  if (!App || global.__SG_PHASE68_FINANCE_OPERATIONS_SEPARATION__) return;
  global.__SG_PHASE68_FINANCE_OPERATIONS_SEPARATION__ = true;

  function setActiveFinanceView(view, title) {
    App.currentView = view;
    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.classList.toggle('active', item.dataset.sg5View === view);
    });
    var heading = document.querySelector('.topbar h2');
    if (heading) heading.textContent = title;
  }

  function createFinanceNavItem(view, icon, label) {
    var item = document.createElement('div');
    item.className = 'nav-item';
    item.dataset.sg5View = view;
    item.innerHTML = '<span class="icon">' + icon + '</span><span>' + label + '</span>';
    item.addEventListener('click', function () { App.navigate(view); });
    return item;
  }

  function separateMenus() {
    var operations = document.getElementById('sg6-nav-section');
    if (operations) {
      var operationsTitle = operations.querySelector('.nav-section-title');
      if (operationsTitle) operationsTitle.textContent = 'OPERACIONE & LOGJISTIKË';
      operations.querySelectorAll('.nav-item').forEach(function (item) {
        if (item.dataset.sg6View === 'expenses' || item.dataset.sg6View === 'expenseCategories') item.remove();
      });
    }

    var finance = document.getElementById('sg5-nav-section');
    if (!finance) return;
    var financeTitle = finance.querySelector('.nav-section-title');
    if (financeTitle) financeTitle.textContent = 'FINANCA / ARKA & BANKA';

    if (!finance.querySelector('[data-sg5-view="expenses"]')) {
      var expenses = createFinanceNavItem('expenses', '💸', 'Shpenzime');
      var categories = createFinanceNavItem('expenseCategories', '🗂️', 'Kategori Shpenzimesh');
      var accounts = finance.querySelector('[data-sg5-view="financeAccounts"]');
      if (accounts && accounts.nextSibling) {
        finance.insertBefore(categories, accounts.nextSibling);
        finance.insertBefore(expenses, categories);
      } else {
        finance.appendChild(expenses);
        finance.appendChild(categories);
      }
    }
  }

  function removeExpenseFromOperationsDashboard() {
    var content = document.getElementById('content');
    if (!content) return;

    var firstKpi = content.querySelector('.sg6-kpis > div');
    if (firstKpi) {
      var vehicles = App.data.logisticsVehicles || App.data.vehicles || [];
      firstKpi.innerHTML = '<span>Mjete Aktive</span><strong>' + vehicles.filter(function (vehicle) { return vehicle.active !== false; }).length + '</strong>';
    }

    content.querySelectorAll('.sg6-actions button').forEach(function (button) {
      if (/Shpenzim/i.test(button.textContent || '')) button.remove();
    });
  }

  function addExpenseActionsToFinanceDashboard() {
    var content = document.getElementById('content');
    if (!content) return;
    var toolbar = content.querySelector('.sg5-toolbar');
    if (!toolbar || toolbar.querySelector('[data-sg68-action="expense"]')) return;

    var expenseButton = document.createElement('button');
    expenseButton.type = 'button';
    expenseButton.className = 'btn btn-primary';
    expenseButton.dataset.sg68Action = 'expense';
    expenseButton.textContent = '+ Shpenzim';
    expenseButton.addEventListener('click', function () { App.editExpense(); });

    var categoryButton = document.createElement('button');
    categoryButton.type = 'button';
    categoryButton.className = 'btn btn-outline';
    categoryButton.dataset.sg68Action = 'expense-categories';
    categoryButton.textContent = 'Kategori Shpenzimesh';
    categoryButton.addEventListener('click', function () { App.navigate('expenseCategories'); });

    toolbar.appendChild(expenseButton);
    toolbar.appendChild(categoryButton);
  }

  var baseNavigate = App.navigate;
  App.navigate = function (view) {
    separateMenus();
    if (view === 'expenses') {
      setActiveFinanceView(view, 'Shpenzime');
      return this.view_expenses();
    }
    if (view === 'expenseCategories') {
      setActiveFinanceView(view, 'Kategori Shpenzimesh');
      return this.view_expenseCategories();
    }
    return baseNavigate.apply(this, arguments);
  };

  var baseOperationsDashboard = App.view_operationsDashboard;
  if (typeof baseOperationsDashboard === 'function') {
    App.view_operationsDashboard = async function () {
      var result = await baseOperationsDashboard.apply(this, arguments);
      separateMenus();
      removeExpenseFromOperationsDashboard();
      return result;
    };
  }

  var baseFinanceDashboard = App.view_financeDashboard;
  if (typeof baseFinanceDashboard === 'function') {
    App.view_financeDashboard = async function () {
      var result = await baseFinanceDashboard.apply(this, arguments);
      separateMenus();
      addExpenseActionsToFinanceDashboard();
      return result;
    };
  }

  separateMenus();
})(window);
/* SG_PHASE68_FINANCE_OPERATIONS_SEPARATION_END */