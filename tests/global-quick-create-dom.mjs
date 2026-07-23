// CI contract: dokumenti dhe rreshti aktiv duhet të mbeten të njëjtat nyje DOM.
import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="content"><section id="source-document"><input id="unsaved-note" value="Vlerë e paruajtur"><button id="source-action">Veprim</button></section></div>
  <div id="modal-overlay" class="show"><div id="modal-box"><div id="source-row"><label>Shoferi</label><input id="source-driver" value="Shofer i ri"><input id="source-quantity" value="17"></div></div></div>
</body></html>`, { url: 'https://sistemi-genit.test', runScripts: 'outside-only', pretendToBeVisual: true });

const { window } = dom;
window.scrollTo = () => {};
let sourceClicks = 0;
let selectedEvents = 0;
let toastMessage = '';
window.document.getElementById('source-action').addEventListener('click', () => { sourceClicks += 1; });
window.document.getElementById('source-driver').addEventListener('sg:quick-create-selected', () => { selectedEvents += 1; });

window.App = {
  currentView: 'exportShipments',
  company: { id: '11111111-1111-4111-8111-111111111111' },
  esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); },
  toast(message) { toastMessage = message; },
  modal(title, body, footer) {
    const overlay = window.document.getElementById('modal-overlay');
    const box = window.document.getElementById('modal-box');
    box.innerHTML = `<h2>${title}</h2>${body}<footer>${footer}</footer>`;
    overlay.classList.add('show');
  },
  closeModal() { window.document.getElementById('modal-overlay').classList.remove('show'); },
  navigate(view) { this.currentView = view; },
  data: {},
};
window.Auth = { hasPermission() { return true; } };
window.SAC = { instances: {}, _render(resultsEl) { resultsEl.innerHTML = '<div class="sac-empty">Nuk ka rezultate</div>'; } };
window.CloudERP = {
  getAccess() { return { companyIds: ['11111111-1111-4111-8111-111111111111'] }; },
  async request(path, options = {}) {
    if (path === '/api/master-data/capabilities') return [{ entityType:'DRIVER', canCreate:true }];
    if (path === '/api/master-data/DRIVER' && options.method === 'POST') {
      return { id:'22222222-2222-4222-8222-222222222222', entityType:'DRIVER', code:'SHOFER-I-RI', name:'Shofer i ri' };
    }
    throw new Error(`Kërkesë e papritur: ${path}`);
  },
};

const script = await fs.readFile(new URL('../apps/web/global-create-cta.js', import.meta.url), 'utf8');
window.eval(script);
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
await new Promise((resolve) => setTimeout(resolve, 0));

const sourceInput = window.document.getElementById('source-driver');
const sourceDocument = window.document.getElementById('source-document');
const sourceRow = window.document.getElementById('source-row');
const definition = { key:'driver', permission:'masters.manage', serverType:'DRIVER' };
assert(window.App.beginQuickCreate(sourceInput, definition) === true, 'Quick-create nuk filloi.');
assert(!sourceInput.isConnected, 'Fusha burim duhet të ruhet jashtë DOM-it gjatë formularit të ri.');
window.App.openGenericMasterQuickCreate('driver', 'DRIVER', 'Shofer', 'Shofer i ri');
assert(window.document.getElementById('sg-gm-name').value === 'Shofer i ri', 'Teksti i kërkimit nuk paraplotësoi Emrin.');
assert(window.document.getElementById('sg-gm-code').value === 'SHOFER-I-RI', 'Teksti i kërkimit nuk paraplotësoi Kodin.');
await window.App.saveGenericMasterQuickCreate('driver', 'DRIVER');

const restoredInput = window.document.getElementById('source-driver');
assert(restoredInput === sourceInput, 'Fusha burim nuk u rikthye si e njëjta nyje DOM.');
assert(window.document.getElementById('source-document') === sourceDocument, 'Dokumenti aktiv u rindërtua dhe humbi identitetin DOM.');
assert(window.document.getElementById('source-row') === sourceRow, 'Rreshti aktiv u rindërtua dhe humbi identitetin DOM.');
assert(window.document.getElementById('unsaved-note').value === 'Vlerë e paruajtur', 'Vlera e paruajtur e dokumentit humbi.');
assert(window.document.getElementById('source-quantity').value === '17', 'Vlera e rreshtit aktiv humbi.');
assert(restoredInput.dataset.selectedId === '22222222-2222-4222-8222-222222222222', 'ID-ja e rekordit të ri nuk u zgjodh.');
assert(restoredInput.value === 'Shofer i ri', 'Emri i rekordit të ri nuk u shfaq.');
assert(selectedEvents === 1, 'Eventi i përzgjedhjes automatike nuk u lëshua.');
window.document.getElementById('source-action').click();
assert(sourceClicks === 1, 'Event listener-i i dokumentit humbi gjatë quick-create.');
assert(toastMessage.includes('PostgreSQL') && toastMessage.includes('Shofer i ri'), 'Mesazhi i suksesit është i pasaktë.');

restoredInput.value = 'Shofer ekzistues';
assert(window.App.beginQuickCreate(restoredInput, definition) === true, 'Quick-create për anulim nuk filloi.');
window.App.openGenericMasterQuickCreate('driver', 'DRIVER', 'Shofer', 'Nuk do të ruhet');
assert(window.App.cancelQuickCreate() === true, 'Anulimi i quick-create dështoi.');
assert(window.document.getElementById('source-driver') === restoredInput, 'Fusha burim ndryshoi pas anulimit.');
assert(restoredInput.value === 'Shofer ekzistues', 'Anulimi ndryshoi vlerën ekzistuese të dokumentit.');

console.log(JSON.stringify({ ok:true, sameDocumentNode:true, sameRowNode:true, unsavedValuesPreserved:true, listenersPreserved:true, selectedAutomatically:true, cancelRestoresSource:true }, null, 2));
