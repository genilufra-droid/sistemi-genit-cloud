import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

class ClassList {
  constructor(element) { this.element = element; }
  values() { return String(this.element.className || '').split(/\s+/).filter(Boolean); }
  contains(value) { return this.values().includes(value); }
  add(value) { const items = this.values(); if (!items.includes(value)) items.push(value); this.element.className = items.join(' '); }
}

class Element {
  constructor(tagName) {
    this.tagName = String(tagName || '').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.type = '';
    this.onclick = null;
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
    if (child.parentNode) {
      const oldIndex = child.parentNode.children.indexOf(child);
      if (oldIndex >= 0) child.parentNode.children.splice(oldIndex, 1);
    }
    child.parentNode = this;
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
    return child;
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    return this.tagName === selector.toUpperCase();
  }
  querySelectorAll(selector) {
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
  click() {
    if (typeof this.onclick === 'function') this.onclick({ preventDefault() {}, stopPropagation() {}, target:this });
    for (const handler of this.listeners.click || []) handler({ preventDefault() {}, stopPropagation() {}, target:this });
  }
}

class Document {
  constructor() {
    this.documentElement = new Element('html');
    this.head = new Element('head');
    this.body = new Element('body');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.content = new Element('main');
    this.content.id = 'content';
    this.body.appendChild(this.content);
  }
  createElement(tagName) { return new Element(tagName); }
  getElementById(id) { return this.documentElement.querySelector('#' + id); }
  querySelector(selector) { return this.documentElement.querySelector(selector); }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
}

const sourcePath = new URL('../apps/web/phase64-weight-visible-actions.js', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8');
assert.equal(source.includes('MutationObserver'), false, 'Nuk lejohet MutationObserver.');
assert.equal(source.includes(':has('), false, 'Nuk lejohet CSS :has.');
assert.equal(source.includes('sg64-weight-mobile-save'), false, 'Nuk lejohet buton lundrues mobile.');
assert.equal(source.includes('position:fixed'), false, 'Nuk lejohet overlay fixed.');

const document = new Document();
const errors = [];
let saveCount = 0;
let previewCount = 0;
let registryCount = 0;

const App = {
  currentView:'weightList',
  async view_weightList() {
    this.currentView = 'weightList';
    document.content.children = [];
    const card = document.createElement('section');
    card.className = 'card';
    document.content.appendChild(card);
  },
  async _viewWeightForm() {
    document.content.children = [];
    const form = document.createElement('section');
    form.className = 'sg62-weight-document';
    const head = document.createElement('header');
    head.className = 'sg62-weight-head';
    form.appendChild(head);
    const meta = document.createElement('div');
    meta.className = 'sg62-form-grid';
    form.appendChild(meta);
    const actions = document.createElement('div');
    actions.className = 'sg62-form-actions';
    const registry = document.createElement('button');
    registry.textContent = '← Regjistri';
    registry.onclick = () => { registryCount += 1; };
    const save = document.createElement('button');
    save.textContent = 'Ruaj Draft';
    save.onclick = () => { saveCount += 1; };
    const preview = document.createElement('button');
    preview.textContent = '👁 Pamje 58 mm';
    preview.onclick = () => { previewCount += 1; };
    actions.appendChild(registry);
    actions.appendChild(save);
    actions.appendChild(preview);
    form.appendChild(actions);
    document.content.appendChild(form);
  },
  async navigate(view) {
    if (view === 'weightList') return this.view_weightList();
    if (view === 'weightForm') return this._viewWeightForm();
  },
  toast(message) { errors.push(message); },
};

const context = { window:null, document, App, console, Promise };
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename:'phase64-weight-visible-actions.js' });

await App.view_weightList();
const addButton = document.getElementById('sg64-new-weight-button').querySelector('button');
assert.ok(addButton, 'Butoni Shto Formular Peshimi duhet të shfaqet.');
addButton.click();
await Promise.resolve();
await Promise.resolve();

const form = document.querySelector('.sg62-weight-document');
assert.ok(form, 'Klikimi Shto duhet të hapë formularin.');
const head = form.querySelector('.sg62-weight-head');
const actions = form.querySelector('.sg62-form-actions');
assert.equal(head.nextSibling, actions, 'Veprimet native duhet të zhvendosen direkt nën kokë.');
assert.ok(actions.classList.contains('sg64-native-weight-actions'), 'Shiriti native duhet të identifikohet pa overlay.');

const buttons = actions.querySelectorAll('button');
assert.equal(buttons[1].textContent, '💾 Ruaj Formularin', 'Ruaj Draft duhet të riemërtohet.');
buttons[0].click();
buttons[1].click();
buttons[2].click();
assert.equal(registryCount, 1, 'Butoni Regjistri duhet të mbetet funksional.');
assert.equal(saveCount, 1, 'Butoni native Ruaj duhet të mbetet funksional.');
assert.equal(previewCount, 1, 'Butoni native Pamje 58 mm duhet të mbetet funksional.');
assert.equal(document.getElementById('sg64-weight-mobile-save'), null, 'Nuk duhet të ekzistojë buton lundrues.');
assert.deepEqual(errors, [], 'Nuk duhet të ketë gabime runtime.');

console.log('Phase 6.4 stable native weight actions test passed.');