/* SG_PHASE99_PROFESSIONAL_SCREEN_COPY_START — clean operational UI */
(function (global) {
  'use strict';

  function install() {
    if (global.__SG_PHASE99_PROFESSIONAL_SCREEN_COPY__) return true;
    var App = global.App;
    if (!App) return false;
    global.__SG_PHASE99_PROFESSIONAL_SCREEN_COPY__ = true;

    var style = document.createElement('style');
    style.id = 'sg99-professional-screen-copy';
    style.textContent = [
      '#content .card-title > div > p.muted,',
      '#content .sg71-hint,',
      '#content .sg74-help,',
      '#content .sg75-help,',
      '#content .sg81-quick-note,',
      '#content .sg-gm-note,',
      '#content .alert-info,',
      '#content .info-banner,',
      '#content .sg-odoo-info,',
      '#content .sg-odoo-guide { display:none !important; }'
    ].join('');
    document.head.appendChild(style);

    function inDocument(node) {
      return !!(node && node.closest && node.closest(
        '.sg80-paper,.sg85-paper,.sg86-sheet,.sg91-sheet,.sg96-doc,.sg96-document,'+
        '.sg76-document,.sg62-weight-print,.sg43-cmr,.print-document,.a4-document'
      ));
    }

    function isExplanatory(text) {
      var value = String(text || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('sq-AL');
      if (!value || value.length < 18) return false;
      return [
        /^kthim nga fatur/, /^kthimi nga pranimi/, /^zgjidhni vetëm/, /^serveri kontrollon/,
        /^ndryshohet vetëm emri/, /^rekordi ruhet/, /^fermeri merret nga/,
        /^sasia e mostrës del/, /^si plotësohet:/, /^kontrollo vetëm/,
        /^plotëso vetëm/, /^çdo kompani ka të dhëna/, /^tabs mund të mbajnë/,
        /^paneli tregon/, /^blerja nis/, /^shitja ndjek/, /^çdo lëvizje magazine/,
        /^dosja lidh/, /^prodhimi lidh/, /^financa regjistron/, /^moduli menaxhon/,
        /^raportet lexojnë/, /^administrimi përmban/, /^mos krijo /, /^mos e konfirmo/,
        /^mos ndrysho/, /^mos mbyll/, /^validimi prek/, /^pagesa duhet të lidhet/
      ].some(function (pattern) { return pattern.test(value); });
    }

    function removeExplanations(root) {
      root = root || document.getElementById('content');
      if (!root) return;
      var candidates = root.querySelectorAll('p,small,.muted,.hint,.help,.notice,[class*="hint"],[class*="help"],[class*="guide"],[class*="info"],[class*="note"]');
      Array.prototype.forEach.call(candidates, function (node) {
        if (!node || inDocument(node) || !isExplanatory(node.textContent)) return;
        node.remove();
      });
    }

    var scheduled = false;
    function scheduleCleanup() {
      if (scheduled) return;
      scheduled = true;
      global.setTimeout(function () {
        scheduled = false;
        removeExplanations();
      }, 0);
    }

    var previousNavigate = App.navigate;
    if (typeof previousNavigate === 'function') {
      App.navigate = function () {
        var result = previousNavigate.apply(this, arguments);
        if (result && typeof result.then === 'function') {
          return result.then(function (value) { scheduleCleanup(); return value; }, function (error) { scheduleCleanup(); throw error; });
        }
        scheduleCleanup();
        return result;
      };
    }

    var previousModal = App.modal;
    if (typeof previousModal === 'function') {
      App.modal = function () {
        var result = previousModal.apply(this, arguments);
        scheduleCleanup();
        return result;
      };
    }

    scheduleCleanup();
    global.SGPhase99 = { cleanScreenCopy: removeExplanations };
    return true;
  }

  function boot() {
    if (!install()) global.setTimeout(boot, 250);
  }
  boot();
})(window);
