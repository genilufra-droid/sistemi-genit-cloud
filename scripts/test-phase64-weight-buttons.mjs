import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

class ClassList {
  constructor(element) { this.element = element; }
  values() { return String(this.element.className || '').split(/\s+/).filter(Boolean); }
  contains(value) { return this.values().includes(value); }
  add(value) { const items = this.values(); if (!items.includes(value)) items.push(value); this.element.className = items.join(' '); }
  remove(value) { this.element.className = this.values().filter((item) => item !== value).join(' '); }
}

class Element {
  constructor(tagName, document) {
    this.tagName = String(tagName || '').toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.parentNode = null;
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.type = '';
    this.disabled = false;
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.classList = new ClassList(this);
  }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return index >= 0 ? this.parentNode.children[index + 1] || null : null;
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  insertBefore(child, reference) {
    child.parentNode = this;
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
      this.dataset[key] = String(value);
    }
  }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  dispatchEvent(event) {
    const payload = { preventDefault() {}, stopPropagation() {}, ...event, target:this, currentTarget:this };
    for (const handler of this.listeners[payload.type] || []) handler(payload);
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector === '[data-sg64-save-weight]') return Object.prototype.hasOwnProperty.call(this.dataset, 'sg64SaveWeight');
    return this.tagName === selector.toUpperCase();
  }
  querySelectorAll(selector) {
    if (selector === '.sg62-form-actions button') {
      const actions = this.querySelector('.sg62-form-actions');
      return actions ? actions.querySelectorAll('button') : [];
    }
    const output = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) output.push(child);
        visit(child);
      }
    };
    visit(this);
    return output;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class Document {
  constructor() {
    this.documentElement = new Element('html', this);
    this.head = new Element('head', this);
    this.body = new Element('body', this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.content = new Element('main', this);
    this.content.id = 'content';
    this.body.appendChild(this.content);
  }
  createElement(tagName) { return new Element(tagName, this); }
  getElementById(id) {
    if (this.documentElement.id === id) return this.documentElement;
    return this.documentElement.querySelector('#' + id);
  }
  querySelector(selector) {
    if (this.documentElement.matches(selector)) return this.documentElement;
    return this.documentElement.querySelector(selector);
  }
  querySelectorAll(selector) {
    const output = [];
    if (this.documentElement.matches(selector)) output.push(this.documentElement);
    return output.concat(this.documentElement.querySelectorAll(selector));
  }
}

const sourcePath = new URL('../apps/web/phase64-weight-visible-actions.js', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8');
assert.equal(source.includes('new MutationObserver'), false, 'Observer-i global nuk duhet të ekzistojë.');
assert.equal(source.includes(':has('), false, 'CSS :has nuk duhet të përdoret në patch-in mobile.');

const document = new Document();
const errors = [];
let saveCount = 0;
let previewCount = 0;

const App = {
  currentView:'weightList',
  async view_weightList() {
    this.currentView = 'weightList';
    document.content.children = [];
    const card = document.createElement('section');
    card.className = 'card';
    document.content.appendChild(card);
  },
  async _viewWeightForm(existingId) {
    this.currentView = 'weightList';
    document.content.children = [];
    const form = document.createElement('section');
    form.className = 'sg62-weight-document';
    const head = document.createElement('header');
    head.className = 'sg62-weight-head';
    form.appendChild(head);
    const bottom = document.createElement('div');
    bottom.className = 'sg62-form-actions';
    const oldSave = document.createElement('button');
    oldSave.textContent = 'Ruaj Draft';
    bottom.appendChild(oldSave);
    form.appendChild(bottom);
    document.content.appendChild(form);
    this.openedId = existingId || '';
  },
  async sg62SaveWeight(id) { saveCount += 1; this.savedId = id; },
  sg62OpenWeightDocumentPreview() { previewCount += 1; },
  async navigate(view) { if (view === 'weightList') await this.view_weightList(); },
  toast(message) { errors.push(message); },
};

const context = {
  window:null,
  document,
  App,
  console,
  setTimeout,
  clearTimeout,
  Promise,
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename:'phase64-weight-visible-actions.js' });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const findButton = (root, text) => root.querySelectorAll('button').find((item) => item.textContent.includes(text));

await App.view_weightList();
const addButton = findButton(document.content, 'Shto Formular Peshimi');
assert.ok(addButton, 'Butoni Shto Formular Peshimi duhet të shfaqet.');
addButton.dispatchEvent({ type:'click' });
await tick();
assert.ok(document.querySelector('.sg62-weight-document'), 'Klikimi Shto duhet të hapë formularin.');
assert.ok(document.getElementById('sg64-weight-form-actions'), 'Shiriti i veprimeve duhet të shfaqet.');
assert.ok(document.getElementById('sg64-weight-mobile-save'), 'Butoni mobile Ruaj duhet të shfaqet.');

const saveButton = document.getElementById('sg64-weight-form-actions').querySelector('[data-sg64-save-weight]');
assert.ok(saveButton, 'Butoni Ruaj Formularin duhet të jetë i klikueshëm.');
saveButton.dispatchEvent({ type:'click' });
await tick();
assert.equal(saveCount, 1, 'Klikimi Ruaj duhet të thërrasë ruajtjen vetëm një herë.');
assert.equal(saveButton.disabled, false, 'Butoni duhet të riaktivizohet pas ruajtjes.');

const previewButton = findButton(document.getElementById('sg64-weight-form-actions'), 'Pamje 58 mm');
previewButton.dispatchEvent({ type:'click' });
assert.equal(previewCount, 1, 'Klikimi Pamje 58 mm duhet të funksionojë.');

const registryButton = findButton(document.getElementById('sg64-weight-form-actions'), 'Regjistri');
registryButton.dispatchEvent({ type:'click' });
await tick();
assert.ok(document.getElementById('sg64-weight-list-actions'), 'Kthimi në regjistër duhet të rikthejë butonin Shto.');
assert.equal(document.getElementById('sg64-weight-mobile-save'), null, 'Butoni mobile duhet të hiqet jashtë formularit.');
assert.deepEqual(errors, [], 'Nuk duhet të ketë gabime runtime.');

console.log('Phase 6.4 mobile weight buttons click test passed.');