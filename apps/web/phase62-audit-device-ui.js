/* SG_PHASE62_AUDIT_DEVICE_UI_START — Sistemi Genit */
(function (global) {
  'use strict';
  var Cloud = global.CloudERP;
  if (!Cloud || !Cloud.apiUrl || Cloud.offlineTestMode || global.__SG_PHASE62_AUDIT_DEVICE_UI__) return;
  global.__SG_PHASE62_AUDIT_DEVICE_UI__ = true;

  var DEVICE_ID_KEY = 'sg_device_id_v1';
  var DEVICE_NAME_KEY = 'sg_device_name_v1';
  var lastActionKey = '';
  var lastActionAt = 0;

  function storageGet(key) { try { return global.localStorage && global.localStorage.getItem(key); } catch (_) { return null; } }
  function storageSet(key, value) { try { if (global.localStorage) global.localStorage.setItem(key, String(value)); } catch (_) {} }
  function randomId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    return 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
  }
  function platformName() {
    var nav = global.navigator || {};
    return String((nav.userAgentData && nav.userAgentData.platform) || nav.platform || 'Web');
  }
  function defaultDeviceName() {
    var screenInfo = global.screen ? global.screen.width + 'x' + global.screen.height : 'pa-ekran';
    return platformName() + ' · ' + screenInfo;
  }
  function deviceInfo() {
    var id = storageGet(DEVICE_ID_KEY);
    if (!id) { id = randomId(); storageSet(DEVICE_ID_KEY, id); }
    var name = storageGet(DEVICE_NAME_KEY) || defaultDeviceName();
    var timezone = '';
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) {}
    return {
      id: id,
      name: name,
      platform: platformName(),
      serial: String(global.__SG_DEVICE_SERIAL__ || ''),
      timezone: timezone,
      clientTime: new Date().toISOString()
    };
  }
  function deviceHeaders() {
    var info = deviceInfo();
    return {
      'X-SG-Device-ID': info.id,
      'X-SG-Device-Name': info.name,
      'X-SG-Device-Platform': info.platform,
      'X-SG-Device-Timezone': info.timezone,
      'X-SG-Client-Time': info.clientTime,
      'X-SG-Device-Serial': info.serial
    };
  }

  var originalRequest = Cloud.request.bind(Cloud);
  Cloud.request = function (path, options) {
    options = options || {};
    var wrapped = Object.assign({}, options, {
      headers: Object.assign({}, options.headers || {}, deviceHeaders())
    });
    return originalRequest(path, wrapped);
  };
  Cloud.getDeviceInfo = deviceInfo;
  Cloud.renameDevice = function (name) {
    var value = String(name || '').trim();
    if (!value) throw new Error('Emri i pajisjes nuk mund të jetë bosh.');
    storageSet(DEVICE_NAME_KEY, value.slice(0, 180));
    return deviceInfo();
  };
  Cloud.auditEvent = function (action, context) {
    context = context || {};
    return Cloud.request('/api/audit/client-event', {
      method: 'POST',
      body: {
        action: action,
        companyId: context.companyId || (global.App && global.App.company && global.App.company.id) || null,
        entityType: context.entityType || 'document',
        entityId: context.entityId || null,
        documentNo: context.documentNo || null,
        sourceView: context.sourceView || (global.App && global.App.currentView) || global.location.pathname,
        metadata: context.metadata || {}
      },
      timeout: 12000
    });
  };

  function actionFromElement(element) {
    var label = [element.textContent, element.title, element.getAttribute('aria-label'), element.getAttribute('onclick')].filter(Boolean).join(' ').toLowerCase();
    if (/excel|xlsx|📊/.test(label)) return 'EXCEL';
    if (/pdf|📄/.test(label)) return 'PDF';
    if (/print|printo|🖨/.test(label)) return 'PRINT';
    if (/download|shkarko|⬇/.test(label)) return 'DOWNLOAD';
    if (/preview|pamje/.test(label)) return 'PREVIEW';
    if (/shiko|view|syri|👁/.test(label)) return 'VIEW';
    return '';
  }
  function uuidFromText(value) {
    var match = String(value || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    return match ? match[0] : null;
  }
  function contextFromElement(element, action) {
    var row = element.closest && element.closest('tr');
    var card = element.closest && element.closest('.card,.modal-content,.document-preview,.sg-doc-sheet');
    var onclick = element.getAttribute('onclick') || '';
    var entityId = element.dataset.entityId || element.dataset.documentId || (row && (row.dataset.entityId || row.dataset.documentId)) || uuidFromText(onclick);
    var documentNo = element.dataset.documentNo || (row && row.dataset.documentNo) || '';
    if (!documentNo && row) {
      var strong = row.querySelector('strong');
      if (strong) documentNo = String(strong.textContent || '').trim();
    }
    var title = '';
    if (card) {
      var heading = card.querySelector('h1,h2,h3,h4,.card-title');
      if (heading) title = String(heading.textContent || '').trim();
    }
    return {
      entityType: (global.App && global.App.currentView) || 'document',
      entityId: entityId || null,
      documentNo: documentNo || null,
      sourceView: (global.App && global.App.currentView) || global.location.pathname,
      metadata: {
        controlLabel: String(element.textContent || element.title || element.getAttribute('aria-label') || '').trim().slice(0, 250),
        documentTitle: title.slice(0, 250),
        action: action,
        url: global.location.href
      }
    };
  }

  document.addEventListener('click', function (event) {
    var element = event.target && event.target.closest ? event.target.closest('button,a,[role="button"]') : null;
    if (!element) return;
    var action = actionFromElement(element);
    if (!action) return;
    var context = contextFromElement(element, action);
    var key = [action, context.entityId, context.documentNo, context.sourceView].join('|');
    var now = Date.now();
    if (key === lastActionKey && now - lastActionAt < 800) return;
    lastActionKey = key;
    lastActionAt = now;
    void Cloud.auditEvent(action, context).catch(function () {});
  }, true);

  global.SGAuditDevice = {
    getInfo: deviceInfo,
    rename: Cloud.renameDevice,
    log: Cloud.auditEvent
  };
})(window);
/* SG_PHASE62_AUDIT_DEVICE_UI_END */
