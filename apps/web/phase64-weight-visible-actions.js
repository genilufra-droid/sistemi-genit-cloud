/* SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_START — Sistemi Genit */
(function (global) {
  'use strict';
  var App = global.App;
  if (!App || global.__SG_PHASE64_WEIGHT_VISIBLE_ACTIONS__) return;
  global.__SG_PHASE64_WEIGHT_VISIBLE_ACTIONS__ = true;

  function currentWeightId() {
    return App.__sg64CurrentWeightId || '';
  }

  function installStyles() {
    if (document.getElementById('sg64-weight-visible-actions-style')) return;
    var style = document.createElement('style');
    style.id = 'sg64-weight-visible-actions-style';
    style.textContent = [
      '.sg64-weight-list-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;padding:12px 14px;background:#fff;border:1px solid #ded7dc;border-radius:10px;box-shadow:0 2px 8px rgba(41,27,38,.06)}',
      '.sg64-weight-list-actions .btn-primary,.sg64-weight-form-actions .btn-primary{background:#714b67!important;border-color:#714b67!important;color:#fff!important;font-weight:800!important}',
      '.sg64-weight-list-actions .btn-primary{min-height:44px;padding:10px 18px;font-size:14px}',
      '.sg64-weight-form-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0 14px;padding:10px;background:#fff;border:1px solid #ded7dc;border-radius:9px;position:sticky;top:0;z-index:30;box-shadow:0 3px 12px rgba(41,27,38,.09)}',
      '.sg64-weight-form-actions button{min-height:42px}',
      '.sg64-weight-form-actions .sg64-save{min-width:170px}',
      '.sg64-weight-mobile-save{display:none}',
      '@media(max-width:760px){.sg64-weight-list-actions{position:sticky;top:0;z-index:35;margin-bottom:10px}.sg64-weight-list-actions .btn-primary{width:100%;font-size:15px}.sg64-weight-list-actions span{display:none}.sg64-weight-form-actions{top:0;display:grid;grid-template-columns:1fr 1.4fr 1fr;padding:7px;gap:6px}.sg64-weight-form-actions button{padding:8px 6px;font-size:12px}.sg64-weight-form-actions .sg64-save{min-width:0;font-size:13px}.sg64-weight-mobile-save{display:block;position:fixed;right:14px;bottom:18px;z-index:120;border:0;border-radius:28px;background:#714b67;color:#fff;padding:13px 18px;font-weight:900;box-shadow:0 6px 22px rgba(63,35,57,.35)}body:has(.sg62-weight-document){padding-bottom:78px}}'
    ].join('');
    document.head.appendChild(style);
  }

  App.sg64NewWeightForm = function () {
    App.__sg64CurrentWeightId = '';
    if (typeof App._viewWeightForm === 'function') return App._viewWeightForm();
    if (typeof App.navigate === 'function') return App.navigate('weightForm');
  };

  App.sg64SaveVisibleWeight = async function (button) {
    var buttons = document.querySelectorAll('[data-sg64-save-weight]');
    buttons.forEach(function (item) { item.disabled = true; item.dataset.originalText = item.textContent; item.textContent = 'Duke ruajtur…'; });
    try {
      if (typeof App.sg62SaveWeight !== 'function') throw new Error('Funksioni Ruaj Formularin nuk është i disponueshëm.');
      await App.sg62SaveWeight(currentWeightId());
    } catch (error) {
      if (App.toast) App.toast(error && error.message ? error.message : String(error), 'error');
    } finally {
      buttons.forEach(function (item) { item.disabled = false; item.textContent = item.dataset.originalText || '💾 Ruaj Formularin'; });
    }
  };

  function ensureListActions() {
    var content = document.getElementById('content');
    if (!content || document.querySelector('.sg62-weight-document')) return;
    if (App.currentView !== 'weightList') return;
    if (document.getElementById('sg64-weight-list-actions')) return;
    var bar = document.createElement('div');
    bar.id = 'sg64-weight-list-actions';
    bar.className = 'sg64-weight-list-actions';
    bar.innerHTML = '<button type="button" class="btn btn-primary" onclick="App.sg64NewWeightForm()">＋ Shto Formular Peshimi</button><span>Regjistri i formularëve të peshës</span>';
    content.insertBefore(bar, content.firstChild);
  }

  function ensureFormActions() {
    var form = document.querySelector('.sg62-weight-document');
    if (!form) return;
    if (!document.getElementById('sg64-weight-form-actions')) {
      var bar = document.createElement('div');
      bar.id = 'sg64-weight-form-actions';
      bar.className = 'sg64-weight-form-actions';
      bar.innerHTML = '<button type="button" class="btn btn-outline" onclick="App.navigate(\'weightList\')">← Regjistri</button>' +
        '<button type="button" class="btn btn-primary sg64-save" data-sg64-save-weight onclick="App.sg64SaveVisibleWeight(this)">💾 Ruaj Formularin</button>' +
        '<button type="button" class="btn btn-outline" onclick="App.sg62OpenWeightDocumentPreview()">👁 Pamje 58 mm</button>';
      var head = form.querySelector('.sg62-weight-head');
      if (head && head.nextSibling) form.insertBefore(bar, head.nextSibling); else form.insertBefore(bar, form.firstChild);
    }
    if (!document.getElementById('sg64-weight-mobile-save')) {
      var floating = document.createElement('button');
      floating.id = 'sg64-weight-mobile-save';
      floating.type = 'button';
      floating.className = 'sg64-weight-mobile-save';
      floating.setAttribute('data-sg64-save-weight', 'true');
      floating.textContent = '💾 Ruaj';
      floating.onclick = function () { App.sg64SaveVisibleWeight(floating); };
      document.body.appendChild(floating);
    }
    var oldSave = Array.prototype.find.call(form.querySelectorAll('.sg62-form-actions button'), function (button) {
      return /Ruaj Draft|Ruaj Formularin/i.test(button.textContent || '');
    });
    if (oldSave) oldSave.textContent = '💾 Ruaj Formularin';
  }

  function cleanupFloatingButton() {
    if (document.querySelector('.sg62-weight-document')) return;
    var floating = document.getElementById('sg64-weight-mobile-save');
    if (floating) floating.remove();
  }

  var originalWeightView = App._viewWeightForm;
  if (typeof originalWeightView === 'function') {
    App._viewWeightForm = async function (existingId) {
      App.__sg64CurrentWeightId = existingId || '';
      var result = await originalWeightView.call(this, existingId);
      ensureFormActions();
      return result;
    };
  }

  var originalWeightList = App.view_weightList;
  if (typeof originalWeightList === 'function') {
    App.view_weightList = async function () {
      App.__sg64CurrentWeightId = '';
      var result = await originalWeightList.apply(this, arguments);
      ensureListActions();
      cleanupFloatingButton();
      return result;
    };
  }

  installStyles();
  var observer = new MutationObserver(function () {
    ensureListActions();
    ensureFormActions();
    cleanupFloatingButton();
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
  ensureListActions();
  ensureFormActions();
})(window);
/* SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_END */