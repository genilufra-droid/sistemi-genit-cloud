import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath = new URL('../apps/web/phase63-traceability-ui-hotfix.js', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8');

assert.equal(
  source.includes('new MutationObserver'),
  false,
  'Phase 6.3 nuk duhet të krijojë MutationObserver global.',
);
assert.ok(
  source.includes('label&&label.textContent!==next'),
  'Ndryshimi i etiketës duhet të jetë idempotent.',
);
assert.ok(
  source.includes('SG_PHASE63_NO_GLOBAL_DOM_OBSERVER'),
  'Duhet të ekzistojë markeri i korrigjimit kundër ciklit DOM.',
);

class Label {
  constructor() {
    this._textContent = 'Etiketë e vjetër';
    this.writeCount = 0;
  }
  get textContent() { return this._textContent; }
  set textContent(value) {
    this.writeCount += 1;
    this._textContent = String(value);
  }
}

class Group {
  constructor(label) { this.label = label; }
  querySelector(selector) { return selector === 'label' ? this.label : null; }
}

class Input {
  constructor(id, group) {
    this.id = id;
    this.group = group;
    this.value = '';
  }
  closest(selector) { return selector === '.form-group' ? this.group : null; }
}

class Meta {
  constructor() {
    this.children = [];
    this.firstChild = null;
  }
  querySelector(selector) {
    if (selector !== '.sg63-origin-note') return null;
    return this.children.find((item) => String(item.className || '').split(/\s+/).includes('sg63-origin-note')) || null;
  }
  insertBefore(child) {
    this.children.unshift(child);
    this.firstChild = this.children[0] || null;
    return child;
  }
}

const elements = new Map();
let meta = null;
const labels = [];

function renderWeightForm() {
  if (!meta) {
    meta = new Meta();
    for (const id of ['wf-p4-farm', 'sg62-weight-plant', 'wf-p4-parcel']) {
      const label = new Label();
      labels.push(label);
      elements.set(id, new Input(id, new Group(label)));
    }
  }
}

const document = {
  getElementById(id) { return elements.get(id) || null; },
  querySelector(selector) { return selector === '.sg62-weight-meta' ? meta : null; },
  querySelectorAll() { return []; },
  createElement(tagName) { return { tagName, className:'', textContent:'' }; },
};

let observerCount = 0;
class ForbiddenMutationObserver {
  constructor() {
    observerCount += 1;
    throw new Error('MutationObserver global nuk lejohet në Phase 6.3.');
  }
}

const App = {
  company: { id:'company-1', name:'Test' },
  data: { traceFarms:[], tracePlants:[] },
  async _viewWeightForm() {
    renderWeightForm();
    return 'rendered';
  },
  toast() {},
};

const context = {
  window:null,
  document,
  App,
  CloudERP: {
    apiUrl:'https://api.example.test',
    offlineTestMode:false,
    getAccess() { return { companyIds:['company-1'] }; },
  },
  Auth:{},
  MutationObserver:ForbiddenMutationObserver,
  console,
  Number,
  String,
  Math,
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename:'phase63-traceability-ui-hotfix.js' });

assert.equal(observerCount, 0, 'Nuk duhet të ndërtohet asnjë observer global.');

await App._viewWeightForm();
assert.deepEqual(
  labels.map((label) => label.textContent),
  ['Ferma (opsionale)', 'Bima (opsionale)', 'Parcela/Zona (opsionale)'],
  'Etiketat opsionale duhet të aplikohen pas renderimit.',
);
assert.deepEqual(labels.map((label) => label.writeCount), [1, 1, 1]);
assert.equal(meta.children.length, 1, 'Shënimi i origjinës duhet të shtohet vetëm një herë.');

await App._viewWeightForm();
assert.deepEqual(
  labels.map((label) => label.writeCount),
  [1, 1, 1],
  'Rihapja nuk duhet të rishkruajë etiketat dhe të krijojë cikël DOM.',
);
assert.equal(meta.children.length, 1, 'Rihapja nuk duhet të dyfishojë shënimin.');

console.log('Phase 6.3 weight form no-loop regression test passed.');
