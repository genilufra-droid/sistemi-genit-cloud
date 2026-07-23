import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = await fs.readFile(new URL('../apps/web/global-create-cta.js', import.meta.url), 'utf8');

function wait(ms = 300) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createEnvironment({ permission = true, inputKind = 'supplier', currentView = 'partners' } = {}) {
  const labels = {
    supplier: 'Furnitor / Fermer',
    customer: 'Klient',
    product: 'Artikull',
    lot: 'Loti / Seriali',
  };
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="content"><div id="document-state"><input id="document-note" value="Mos e humb dokumentin"><button id="document-action">Veprim</button></div></div>
    <div id="modal-overlay" class="show">
      <div id="modal-box">
        <div class="form-group"><label>${labels[inputKind] || inputKind}</label><input id="source-search" value="Kërkim Test"></div>
        <table><tbody><tr id="source-row"><td><input id="row-value" value="17"></td></tr></tbody></table>
      </div>
    </div>
    <div id="search-results" class="show"></div>
  </body></html>`, { runScripts: 'outside-only', url: 'http://127.0.0.1/' });

  const { window } = dom;
  window.scrollTo = () => {};
  const calls = { toast: [], create: [], input: 0, change: 0, selected: 0, documentAction: 0 };
  const App = {
    currentView,
    company: { id: '11111111-1111-4111-8111-111111111111' },
    data: {},
    esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    },
    toast(message) { calls.toast.push(message); },
    closeModal() { window.document.getElementById('modal-overlay')?.classList.remove('show'); },
    editPartner(type) {
      calls.create.push(`partner:${type}`);
      window.document.getElementById('modal-box').innerHTML = '<div class="form-group"><label>Kodi</label><input id="p-code"></div><div class="form-group"><label>Emri</label><input id="p-name"></div>';
    },
    editProduct() {
      calls.create.push('product');
      window.document.getElementById('modal-box').innerHTML = '<div class="form-group"><label>Kodi</label><input id="pr-code"></div><div class="form-group"><label>Emri</label><input id="pr-name"></div>';
    },
    navigate(view) { calls.create.push(`navigate:${view}`); },
  };
  const sourceInput = window.document.getElementById('source-search');
  const sourceRow = window.document.getElementById('source-row');
  const documentState = window.document.getElementById('document-state');
  sourceInput.addEventListener('input', () => { calls.input += 1; });
  sourceInput.addEventListener('change', () => { calls.change += 1; });
  sourceInput.addEventListener('sg:quick-create-selected', () => { calls.selected += 1; });
  window.document.getElementById('document-action').addEventListener('click', () => { calls.documentAction += 1; });

  const SAC = {
    instances: { instance1: { input: sourceInput } },
    _render(resultsEl, items) {
      resultsEl.innerHTML = items?.length
        ? items.map((item) => `<button>${item.name}</button>`).join('')
        : '<div class="sac-empty">Nuk u gjet asnjë rezultat</div>';
    },
  };
  const Auth = { hasPermission() { return permission; } };
  window.App = App;
  window.SAC = SAC;
  window.Auth = Auth;
  window.eval(source);
  return {
    dom, window, App, SAC, Auth, calls, sourceInput, sourceRow, documentState,
    results: window.document.getElementById('search-results'),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 1. Kontrata pa rezultat, paraplotësimi Emër/Kod dhe rikthimi i të njëjtave nyje DOM.
{
  const env = createEnvironment({ inputKind: 'supplier' });
  env.SAC._render(env.results, [], {}, 'instance1');
  const button = env.results.querySelector('.sg-create-no-result');
  assert(button, 'Butoni + Shto të ri nuk u shfaq kur kërkimi nuk gjeti rezultat.');
  assert(env.results.textContent.includes('Nuk u gjet asnjë rezultat'), 'Mesazhi standard pa rezultat mungon.');
  assert(button.textContent.includes('+ Shto të ri') && button.textContent.includes('Furnitor'), 'Etiketa globale e Furnitorit është e pasaktë.');
  button.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait();
  assert(env.calls.create.includes('partner:supplier'), 'Formulari i Furnitorit/Fermerit nuk u hap.');
  assert(env.window.document.getElementById('p-name')?.value === 'Kërkim Test', 'Teksti nuk paraplotësoi Emrin.');
  assert(env.window.document.getElementById('p-code')?.value === 'KERKIM-TEST', 'Teksti nuk paraplotësoi Kodin.');
  assert(env.App.hasQuickCreateContext('supplier'), 'Konteksti i formularit burim nuk u ruajt.');

  const completed = env.App.completeQuickCreate('supplier', { id: 'sup-001', code: 'SUP-001', name: 'Furnitori i Ri' });
  assert(completed, 'Krijimi i shpejtë nuk u përfundua.');
  const restored = env.window.document.getElementById('source-search');
  assert(restored === env.sourceInput, 'Fusha burim u rindërtua në vend që të rikthehej si e njëjta nyje DOM.');
  assert(env.window.document.getElementById('source-row') === env.sourceRow, 'Rreshti aktiv humbi identitetin DOM.');
  assert(env.window.document.getElementById('document-state') === env.documentState, 'Dokumenti aktiv humbi identitetin DOM.');
  assert(restored.value === 'Furnitori i Ri', 'Rekordi i krijuar nuk u zgjodh automatikisht.');
  assert(restored.dataset.selectedId === 'sup-001', 'ID-ja e rekordit të krijuar nuk u vendos në autocomplete.');
  assert(restored.dataset.selectedCode === 'SUP-001', 'Kodi i rekordit të krijuar nuk u vendos në autocomplete.');
  assert(env.window.document.getElementById('row-value')?.value === '17', 'Vlera e rreshtit aktiv humbi.');
  assert(env.window.document.getElementById('document-note')?.value === 'Mos e humb dokumentin', 'Gjendja e dokumentit burim humbi.');
  env.window.document.getElementById('document-action').click();
  assert(env.calls.documentAction === 1, 'Event listener-i i dokumentit humbi.');
  assert(env.calls.input === 1 && env.calls.change === 1 && env.calls.selected === 1, 'Eventet e përzgjedhjes automatike janë të pasakta.');
  assert(env.calls.toast.some((message) => message.includes('PostgreSQL') && message.includes('Furnitori i Ri')), 'Konfirmimi PostgreSQL mungon.');
}

// 2. Anulimi rikthen dokumentin pa përzgjedhje të re.
{
  const env = createEnvironment({ inputKind: 'product' });
  env.SAC._render(env.results, [], {}, 'instance1');
  env.results.querySelector('.sg-create-no-result')?.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait();
  assert(env.window.document.getElementById('pr-name')?.value === 'Kërkim Test', 'Artikulli nuk u paraplotësua.');
  assert(env.window.document.getElementById('pr-code')?.value === 'KERKIM-TEST', 'Kodi i Artikullit nuk u paraplotësua.');
  env.App.closeModal();
  const restored = env.window.document.getElementById('source-search');
  assert(restored === env.sourceInput, 'Anulimi nuk riktheu të njëjtën fushë burim.');
  assert(restored.value === 'Kërkim Test', 'Anulimi nuk riktheu vlerën e kërkimit.');
  assert(!restored.dataset.selectedId, 'Anulimi vendosi gabimisht një rekord të zgjedhur.');
  assert(env.window.document.getElementById('modal-overlay')?.classList.contains('show'), 'Anulimi nuk riktheu modalin burim.');
}

// 3. Leja fsheh CTA-në.
{
  const env = createEnvironment({ inputKind: 'customer', permission: false });
  env.SAC._render(env.results, [], {}, 'instance1');
  assert(!env.results.querySelector('.sg-create-no-result'), 'Butoni + Shto të ri u shfaq pa leje krijimi.');
}

// 4. Loti/seriali nuk krijohet manualisht.
{
  const env = createEnvironment({ inputKind: 'lot' });
  env.SAC._render(env.results, [], {}, 'instance1');
  assert(!env.results.querySelector('.sg-create-no-result'), 'Loti ofron krijim manual, megjithëse duhet të krijohet nga dokumenti burim.');
}

// 5. Lista bosh ka veprim krijimi dhe respekton lejet.
{
  const env = createEnvironment({ currentView: 'products' });
  const content = env.window.document.getElementById('content');
  content.innerHTML = '<div class="card"><p class="empty-report">Nuk ka artikuj</p></div>';
  env.App.enhanceEmptyCreateActions();
  const button = content.querySelector('.sg-empty-create-actions button');
  assert(button?.textContent.includes('+ Shto Artikull'), 'Lista bosh e artikujve nuk ofron + Shto Artikull.');
}

console.log(JSON.stringify({
  result: 'TEST_SUCCESS',
  noResultCreate: true,
  nameCodePrefill: true,
  sameDocumentNode: true,
  sameRowNode: true,
  listenersPreserved: true,
  autoSelection: true,
  cancelRestore: true,
  permissionGuard: true,
  manualLotBlocked: true,
  emptyListAction: true,
}, null, 2));
