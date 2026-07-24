/* SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_START — Sistemi Genit */
(function (global) {
  'use strict';
  var App = global.App;
  if (!App || global.__SG_PHASE64_WEIGHT_VISIBLE_ACTIONS__) return;
  global.__SG_PHASE64_WEIGHT_VISIBLE_ACTIONS__ = true;

  function showError(error) {
    if (App.toast) App.toast(error && error.message ? error.message : String(error || 'Veprimi dështoi.'), 'error');
  }

  function renameNativeSave(actions) {
    if (!actions) return;
    var buttons = actions.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i += 1) {
      var text = String(buttons[i].textContent || '').trim();
      if (text === 'Ruaj Draft' || text === 'Ruaj Formularin') {
        buttons[i].textContent = '💾 Ruaj Formularin';
        break;
      }
    }
  }

  function moveNativeActionsToTop() {
    var form = document.querySelector('.sg62-weight-document');
    if (!form) return;
    var actions = form.querySelector('.sg62-form-actions');
    if (!actions) return;
    renameNativeSave(actions);
    actions.classList.add('sg64-native-weight-actions');
    var head = form.querySelector('.sg62-weight-head');
    if (head && head.nextSibling !== actions) form.insertBefore(actions, head.nextSibling);
  }

  function addNewWeightButton() {
    var content = document.getElementById('content');
    if (!content || App.currentView !== 'weightList' || document.querySelector('.sg62-weight-document')) return;
    if (document.getElementById('sg64-new-weight-button')) return;
    var wrap = document.createElement('div');
    wrap.id = 'sg64-new-weight-button';
    wrap.className = 'sg62-toolbar';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary';
    button.textContent = '＋ Shto Formular Peshimi';
    button.onclick = function () {
      try {
        if (typeof App.navigate === 'function') App.navigate('weightForm');
        else if (typeof App._viewWeightForm === 'function') App._viewWeightForm();
        else throw new Error('Formulari i Peshës nuk u gjet.');
      } catch (error) {
        showError(error);
      }
    };
    wrap.appendChild(button);
    content.insertBefore(wrap, content.firstChild);
  }

  var originalWeightView = App._viewWeightForm;
  if (typeof originalWeightView === 'function') {
    App._viewWeightForm = async function (existingId) {
      var result = await originalWeightView.call(this, existingId);
      moveNativeActionsToTop();
      return result;
    };
  }

  var originalWeightList = App.view_weightList;
  if (typeof originalWeightList === 'function') {
    App.view_weightList = async function () {
      var result = await originalWeightList.apply(this, arguments);
      addNewWeightButton();
      return result;
    };
  }

  if (document.querySelector('.sg62-weight-document')) moveNativeActionsToTop();
  else addNewWeightButton();
})(window);
/* SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_END */