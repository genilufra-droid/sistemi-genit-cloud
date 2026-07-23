import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="content"><section id="source-document"><input id="unsaved-note" value="Vlerë e paruajtur"><button id="source-action">Veprim</button></section></div>
  <div id="modal-overlay" class="show"><div id="modal-box"><div id="source-row" class="form-group"><label>Llogaria Bankë</label><input id="source-bank" value="Banka e Re"><input id="source-quantity" value="17"></div></div></div>
  <div id="search-results"></div>
</body></html>`, { url: 'https://sistemi-genit.test', runScripts: 'outside-only', pretendToBeVisual: true });

const { window } = dom;
window.scrollTo = () => {};
let sourceClicks = 0;
let selectedEvents = 0;
let toastMessage = '';
window.document.getElementById('source-action').addEventListener('click', () => { sourceClicks += 1; });
window.document.getElementById('source-bank').addEventListener('sg:quick-create-selected', () => { selectedEvents += 1; });

window.App = {
  currentView: 'bankPosts',
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
  async editFinanceAccount() {
    this.modal('Llogari e Re', `
      <select id="sg5-a-kind"><option value="CASH">Arkë</option><option value="BANK">Bankë</option></select>
      <input id="sg5-a-code"><input id="sg5-a-name"><input id="sg5-a-currency" value="ALL">
      <input id="sg5-a-opening" value="0"><input id="sg5-a-date" value="2026-07-23">
      <input id="sg5-a-bank"><input id="sg5-a-iban"><input id="sg5-a-number">
      <select id="sg5-a-active"><option value="true">Aktiv</option></select><textarea id="sg5-a-notes"></textarea>`,
      '<button>Ruaj</button>');
  },
  async saveFinanceAccount() { throw new Error('Wrapper-i Phase 5 nuk u instalua.'); },
};
window.Auth = { hasPermission() { return true; }, requirePermission() { return true; } };
window.SAC = {
  instances: {},
  _render(resultsEl) { resultsEl.innerHTML = '<div class="sac-empty">Nuk ka rezultate</div>'; },
};
window.CloudERP = {
  getAccess() { return { companyIds: ['11111111-1111-4111-8111-111111111111'] }; },
  async loadFinance() { return true; },
  async request(path, options = {}) {
    if (path === '/api/master-data/capabilities') return [
      { entityType:'DRIVER', canCreate:true },
      { entityType:'CASH_ACCOUNT', canCreate:true },
      { entityType:'BANK_ACCOUNT', canCreate:true },
    ];
    if (path === '/api/master-data/DRIVER' && options.method === 'POST') {
      return { id:'33333333-3333-4333-8333-333333333333', entityType:'DRIVER', code:'SHOFER-I-RI', name:'Shofer i ri' };
    }
    if (path === '/api/finance/accounts' && options.method === 'POST') {
      assert(options.body.accountKind === 'BANK', 'Quick-create financiar nuk ruajti llojin BANK.');
      return { id:'22222222-2222-4222-8222-222222222222', account_kind:'BANK', code:'BANKA-E-RE', name:'Banka e Re' };
    }
    throw new Error(`Kërkesë e papritur: ${path}`);
  },
};

const script = await fs.readFile(new URL('../apps/web/global-create-cta.js', import.meta.url), 'utf8');
window.eval(script);
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
await new Promise((resolve) => setTimeout(resolve, 0));

const sourceInput = window.document.getElementById('source-bank');
const sourceDocument = window.document.getElementById('source-document');
const sourceRow = window.document.getElementById('source-row');
const results = window.document.getElementById('search-results');
window.SAC.instances.bank = { input: sourceInput };
window.SAC._render(results, [], {}, 'bank');
const createButton = results.querySelector('.sg-create-no-result');
assert(createButton, 'Butoni + Shto të ri nuk u shfaq për Bankën.');
assert(results.textContent.includes('Nuk u gjet asnjë rezultat'), 'Mesazhi pa rezultat mungon.');
createButton.click();
await new Promise((resolve) => setTimeout(resolve, 700));
assert(window.document.getElementById('sg5-a-kind').value === 'BANK', 'Formulari nuk u hap si Bankë.');
assert(window.document.getElementById('sg5-a-name').value === 'Banka e Re', 'Teksti nuk paraplotësoi Emrin e Bankës.');
assert(window.document.getElementById('sg5-a-code').value === 'BANKA-E-RE', 'Teksti nuk paraplotësoi Kodin e Bankës.');
await window.App.saveFinanceAccount('');

const restoredInput = window.document.getElementById('source-bank');
assert(restoredInput === sourceInput, 'Fusha burim nuk u rikthye si e njëjta nyje DOM.');
assert(window.document.getElementById('source-document') === sourceDocument, 'Dokumenti aktiv u rindërtua.');
assert(window.document.getElementById('source-row') === sourceRow, 'Rreshti aktiv u rindërtua.');
assert(window.document.getElementById('unsaved-note').value === 'Vlerë e paruajtur', 'Vlera e paruajtur humbi.');
assert(window.document.getElementById('source-quantity').value === '17', 'Vlera e rreshtit aktiv humbi.');
assert(restoredInput.dataset.selectedId === '22222222-2222-4222-8222-222222222222', 'Llogaria e re nuk u zgjodh automatikisht.');
assert(restoredInput.value === 'Banka e Re', 'Emri i llogarisë së re nuk u shfaq.');
assert(selectedEvents === 1, 'Eventi i përzgjedhjes automatike nuk u lëshua.');
window.document.getElementById('source-action').click();
assert(sourceClicks === 1, 'Event listener-i i dokumentit humbi.');
assert(toastMessage.includes('PostgreSQL') && toastMessage.includes('Banka e Re'), 'Mesazhi i suksesit është i pasaktë.');

restoredInput.value = 'Banka ekzistuese';
const financeDefinition = { key:'bankAccount', permission:'masters.manage', serverType:'BANK_ACCOUNT' };
assert(window.App.beginQuickCreate(restoredInput, financeDefinition) === true, 'Quick-create për anulim nuk filloi.');
window.App.editFinanceAccount();
assert(window.App.cancelQuickCreate() === true, 'Anulimi dështoi.');
assert(window.document.getElementById('source-bank') === restoredInput, 'Fusha ndryshoi pas anulimit.');
assert(restoredInput.value === 'Banka ekzistuese', 'Anulimi ndryshoi vlerën ekzistuese.');

console.log(JSON.stringify({
  ok:true,
  phase5FinanceAccount:true,
  sameDocumentNode:true,
  sameRowNode:true,
  unsavedValuesPreserved:true,
  listenersPreserved:true,
  selectedAutomatically:true,
  cancelRestoresSource:true,
}, null, 2));
