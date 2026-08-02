/* SG_PHASE100_PURCHASE_AUDIT_FIXES_START — explicit invoice settlement */
(function (global) {
  'use strict';

  function resolveApp() {
    try { if (global.App) return global.App; } catch (_ignore) {}
    try { return global.eval('typeof App !== "undefined" ? App : null'); } catch (_ignore2) {}
    return null;
  }
  function num(value) { var parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }
  function text(value) { return String(value == null ? '' : value); }
  function fmt(value) { return num(value).toLocaleString('sq-AL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function openCharges(App, partnerId, isCustomer) {
    var ledger = (App.data && App.data[isCustomer ? 'customerLedger' : 'supplierLedger']) || [];
    var key = isCustomer ? 'customerId' : 'supplierId';
    return ledger.filter(function (entry) {
      return entry[key] === partnerId && entry.entryType === 'CHARGE' && entry.status !== 'PAID' &&
        entry.status !== 'REVERSED' && entry.cloud === true && num(entry.balance) > 0.005;
    }).sort(function (left, right) {
      return String(left.date || '').localeCompare(String(right.date || '')) || text(left.docNumber).localeCompare(text(right.docNumber));
    });
  }

  function injectInvoiceSelector(App, partnerId, isCustomer) {
    var amount = document.getElementById('pay-amount');
    if (!amount || document.getElementById('pay-invoice-wrap')) return false;
    var charges = openCharges(App, partnerId, isCustomer);
    var host = amount.closest && amount.closest('.form-group');
    if (!host) host = amount.parentElement && amount.parentElement.parentElement;
    if (!host || !host.insertBefore) return false;

    var wrap = document.createElement('div');
    wrap.id = 'pay-invoice-wrap';
    wrap.style.cssText = 'margin:0 0 8px;width:100%;';
    var label = document.createElement('label');
    label.htmlFor = 'pay-invoice';
    label.textContent = 'Fatura për pagesë';
    label.style.cssText = 'display:block;margin:0 0 4px;font-weight:600;font-size:12px;';
    var select = document.createElement('select');
    select.id = 'pay-invoice';
    select.style.cssText = 'width:100%;min-height:34px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;';

    if (charges.length !== 1) {
      var placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = charges.length ? 'Zgjidh faturën…' : 'Nuk ka faturë të hapur';
      select.appendChild(placeholder);
    }
    charges.forEach(function (charge) {
      var option = document.createElement('option');
      option.value = charge.invoiceId;
      option.textContent = (charge.docNumber || 'Faturë') + ' — ' + (charge.date || '') + ' — Mbetur ' + fmt(charge.balance) + ' ALL';
      select.appendChild(option);
    });
    if (!charges.length) select.disabled = true;
    wrap.appendChild(label);
    wrap.appendChild(select);
    host.insertBefore(wrap, amount.parentElement || null);
    return true;
  }

  function install() {
    if (global.__SG_PHASE100_PURCHASE_AUDIT_FIXES__) return true;
    var App = resolveApp();
    if (!App || typeof App._renderSupplierCard !== 'function') return false;
    global.__SG_PHASE100_PURCHASE_AUDIT_FIXES__ = true;
    var originalRender = App._renderSupplierCard;
    App._renderSupplierCard = function (partnerId, isCustomer) {
      var result = originalRender.apply(this, arguments);
      var inject = function (value) {
        global.setTimeout(function () { injectInvoiceSelector(App, partnerId, isCustomer); }, 0);
        return value;
      };
      if (result && typeof result.then === 'function') return result.then(inject, function (error) { throw error; });
      inject(result);
      return result;
    };
    global.SGPhase100 = { injectInvoiceSelector: injectInvoiceSelector, openCharges: function (partnerId, isCustomer) { return openCharges(App, partnerId, isCustomer); } };
    return true;
  }

  function boot() { if (!install()) global.setTimeout(boot, 100); }
  boot();
})(window);
/* SG_PHASE100_PURCHASE_AUDIT_FIXES_END */
