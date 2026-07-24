/* SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_START — Sistemi Genit */
(function (global) {
  'use strict';
  var App = global.App;
  if (!App || global.__SG_PHASE64_WEIGHT_VISIBLE_ACTIONS__) return;
  global.__SG_PHASE64_WEIGHT_VISIBLE_ACTIONS__ = true;

  var saving = false;

  function currentWeightId() {
    return App.__sg64CurrentWeightId || '';
  }

  function showError(error) {
    var message = error && error.message ? error.message : String(error || 'Veprimi dështoi.');
    if (App.toast) App.toast(message, 'error');
  }

  function installStyles() {
    if (document.getElementById('sg64-weight-visible-actions-style')) return;
    var style = document.createElement('style');
    style.id = 'sg64-weight-visible-actions-style';
    style.textContent = [
      '.sg64-weight-list-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;padding:12px 14px;background:#fff;border:1px solid #ded7dc;border-radius:10px;box-shadow:0 2px 8px rgba(41,27,38,.06)}',
      '.sg64-weight-list-actions .btn-primary,.sg64-weight-form-actions .btn-primary{background:#714b67!important;border-color:#714b67!important;color:#fff!important;font-weight:800!important}',
      '.sg64-weight-list-actions .btn-primary{min-height:44px;padding:10px 18px;font-size:14px;touch-action:manipulation}',
      '.sg64-weight-form-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0 14px;padding:10px;background:#fff;border:1px solid #ded7dc;border-radius:9px;position:sticky;top:0;z-index:30;box-shadow:0 3px 12px rgba(41,27,38,.09)}',
      '.sg64-weight-form-actions button{min-height:42px;touch-action:manipulation}',
      '.sg64-weight-form-actions .sg64-save{min-width:170px}',
      '.sg64-weight-mobile-save{display:none}',
      'body.sg64-weight-form-open{padding-bottom:78px}',
      '@media(max-width:760px){.sg64-weight-list-actions{position:sticky;top:0;z-index:35;margin-bottom:10px}.sg64-weight-list-actions .btn-primary{width:100%;font-size:15px}.sg64-weight-list-actions span{display:none}.sg64-weight-form-actions{top:0;display:grid;grid-template-columns:1fr 1.4fr 1fr;padding:7px;gap:6px}.sg64-weight-form-actions button{padding:8px 6px;font-size:12px}.sg64-weight-form-actions .sg64-save{min-width:0;font-size:13px}.sg64-weight-mobile-save{display:block;position:fixed;right:14px;bottom:18px;z-index:120;border:0;border-radius:28px;background:#714b67;color:#fff;padding:13px 18px;font-weight:900;box-shadow:0 6px 22px rgba(63,35,57,.35);touch-action:manipulation}}'
    ].join('');
    document.head.appendChild(style);
  }

  function setSavingState(active) {
    var buttons = document.querySelectorAll('[data-sg64-save-weight]');
    for (var i = 0; i < buttons.length; i += 1) {
      var item = buttons[i];
      if (!item.dataset.sg64OriginalText) item.dataset.sg64OriginalText = item.textContent || '💾 Ruaj Formularin';
      item.disabled = active;
      item.setAttribute('aria-busy', active ? 'true' : 'false');
      item.textContent = active ? 'Duke ruajtur…' : item.dataset.sg64OriginalText;
    }
  }

  App.sg64NewWeightForm = async function () {
    try {
      App.__sg64CurrentWeightId = '';
      if (typeof App._viewWeightForm === 'function') {
        await App._viewWeightForm();
        return;
      }
      if (typeof App.navigate === 'function') {
        await App.navigate('weightForm');
        return;
      }
      throw new Error('Formulari i Peshës nuk u gjet.');
    } catch (error) {
      showError(error);
    }
  };

  App.sg64SaveVisibleWeight = async function () {
    if (saving) return;
    saving = true;
    setSavingState(true);
    try {
      if (typeof App.sg62SaveWeight !== 'function') throw new Error('Funksioni Ruaj Formularin nuk është i disponueshëm.');
      await App.sg62SaveWeight(currentWeightId());
    } catch (error) {
      showError(error);
    } finally {
      saving = false;
      setSavingState(false);
    }
  };

  function button(text, className, handler) {
    var element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.textContent = text;
    element.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      handler();
    }, { passive:false });
    return element;
  }

  function removeElement(id) {
    var element = document.getElementById(id);
    if (element && element.parentNode) element.parentNode.removeChild(element);
  }

  function leaveWeightForm() {
    document.body.classList.remove('sg64-weight-form-open');
    removeElement('sg64-weight-mobile-save');
    if (typeof App.navigate === 'function') App.navigate('weightList');
  }

  function ensureListActions() {
    var content = document.getElementById('content');
    if (!content || document.querySelector('.sg62-weight-document')) return;
    if (App.currentView !== 'weightList') return;
    if (document.getElementById('sg64-weight-list-actions')) return;
    document.body.classList.remove('sg64-weight-form-open');
    removeElement('sg64-weight-mobile-save');
    var bar = document.createElement('div');
    bar.id = 'sg64-weight-list-actions';
    bar.className = 'sg64-weight-list-actions';
    bar.appendChild(button('＋ Shto Formular Peshimi', 'btn btn-primary', App.sg64NewWeightForm));
    var label = document.createElement('span');
    label.textContent = 'Regjistri i formularëve të peshës';
    bar.appendChild(label);
    content.insertBefore(bar, content.firstChild);
  }

  function ensureFormActions() {
    var form = document.querySelector('.sg62-weight-document');
    if (!form) return;
    document.body.classList.add('sg64-weight-form-open');
    removeElement('sg64-weight-list-actions');

    if (!document.getElementById('sg64-weight-form-actions')) {
      var bar = document.createElement('div');
      bar.id = 'sg64-weight-form-actions';
      bar.className = 'sg64-weight-form-actions';
      bar.appendChild(button('← Regjistri', 'btn btn-outline', leaveWeightForm));
      var save = button('💾 Ruaj Formularin', 'btn btn-primary sg64-save', App.sg64SaveVisibleWeight);
      save.setAttribute('data-sg64-save-weight', 'true');
      bar.appendChild(save);
      bar.appendChild(button('👁 Pamje 58 mm', 'btn btn-outline', function () {
        if (typeof App.sg62OpenWeightDocumentPreview === 'function') App.sg62OpenWeightDocumentPreview();
        else showError(new Error('Pamja 58 mm nuk është e disponueshme.'));
      }));
      var head = form.querySelector('.sg62-weight-head');
      if (head && head.nextSibling) form.insertBefore(bar, head.nextSibling);
      else form.insertBefore(bar, form.firstChild);
    }

    if (!document.getElementById('sg64-weight-mobile-save')) {
      var floating = button('💾 Ruaj', 'sg64-weight-mobile-save', App.sg64SaveVisibleWeight);
      floating.id = 'sg64-weight-mobile-save';
      floating.setAttribute('data-sg64-save-weight', 'true');
      document.body.appendChild(floating);
    }

    var bottomButtons = form.querySelectorAll('.sg62-form-actions button');
    for (var i = 0; i < bottomButtons.length; i += 1) {
      var bottomButton = bottomButtons[i];
      if ((bottomButton.textContent || '').trim() === 'Ruaj Draft') {
        bottomButton.textContent = '💾 Ruaj Formularin';
        break;
      }
    }
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
      return result;
    };
  }

  installStyles();
  if (document.querySelector('.sg62-weight-document')) ensureFormActions();
  else ensureListActions();
})(window);
/* SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_END */