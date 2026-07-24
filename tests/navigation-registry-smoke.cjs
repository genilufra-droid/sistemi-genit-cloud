'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

class ClassList {
  constructor(owner) { this.owner = owner; this.values = new Set(); }
  sync() { this.owner._className = Array.from(this.values).join(' '); }
  set(value) { this.values = new Set(String(value || '').split(/\s+/).filter(Boolean)); this.sync(); }
  toggle(value, force) {
    const active = force === undefined ? !this.values.has(value) : Boolean(force);
    if (active) this.values.add(value); else this.values.delete(value);
    this.sync();
    return active;
  }
  contains(value) { return this.values.has(value); }
}

function dataKey(attribute) {
  return attribute.slice(5).replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
}

class Element {
  constructor(tagName) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = {};
    this.id = '';
    this._className = '';
    this.classList = new ClassList(this);
    this._textContent = '';
    this.listeners = {};
  }
  set className(value) { this.classList.set(value); }
  get className() { return this._className; }
  set textContent(value) { this._textContent = String(value == null ? '' : value); }
  get textContent() { return this._textContent || this.children.map((child) => child.textContent).join(''); }
  set innerHTML(value) { this._textContent = String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
  get innerHTML() { return this._textContent; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { const index = this.children.indexOf(child); if (index >= 0) this.children.splice(index, 1); child.parentNode = null; return child; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  click() { if (this.listeners.click) return this.listeners.click.call(this); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
    if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value);
  }
  getAttribute(name) {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    if (name.startsWith('data-')) return this.dataset[dataKey(name)] || null;
    return this.attributes[name] || null;
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    const data = selector.match(/^\[data-([a-z0-9-]+)="([^"]+)"\]$/i);
    if (data) return String(this.dataset[dataKey('data-' + data[1])] || '') === data[2];
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
  querySelectorAll(selector) {
    const results = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        if (child.matches(selector)) results.push(child);
        visit(child);
      });
    };
    visit(this);
    return results;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

const document = {
  body: new Element('body'),
  createElement: (tag) => new Element(tag),
  querySelector(selector) {
    if (selector === '.topbar h2') return heading;
    if (this.body.matches(selector)) return this.body;
    return this.body.querySelector(selector);
  },
  querySelectorAll(selector) {
    const rows = this.body.querySelectorAll(selector);
    if (this.body.matches(selector)) rows.unshift(this.body);
    return rows;
  }
};

const sidebar = new Element('aside'); sidebar.className = 'sidebar'; document.body.appendChild(sidebar);
const topbar = new Element('div'); topbar.className = 'topbar'; document.body.appendChild(topbar);
const heading = new Element('h2'); topbar.appendChild(heading);

function oldSection(id, title, items) {
  const section = new Element('div'); section.id = id; section.className = 'nav-section';
  const headingNode = new Element('div'); headingNode.className = 'nav-section-title'; headingNode.textContent = title; section.appendChild(headingNode);
  items.forEach((row) => {
    const item = new Element('div'); item.className = 'nav-item';
    if (row.sg5) item.dataset.sg5View = row.view;
    if (row.sg6) item.dataset.sg6View = row.view;
    if (row.sg62) item.dataset.sg62View = row.view;
    item.textContent = row.label;
    item.setAttribute('onclick', `App.navigate('${row.view}')`);
    section.appendChild(item);
  });
  sidebar.appendChild(section);
}
oldSection('sg5-nav-section', 'ARKA & BANKA', [{view:'financeAccounts',label:'Llogaritë',sg5:true},{view:'expenses',label:'Shpenzime',sg5:true}]);
oldSection('sg6-nav-section', 'OPERACIONE', [{view:'expenses',label:'Shpenzime',sg6:true},{view:'drivers',label:'Shoferë',sg6:true}]);
oldSection('sg62-trace-nav', 'GJURMUESHMËRI', [{view:'weightList',label:'Formularët e Peshës',sg62:true}]);
oldSection('legacy-weight', 'BLERJE', [{view:'weightForms',label:'Formulari i Peshave'}]);

const calls = [];
const App = {
  currentView: '',
  toast(message, type) { calls.push(['toast', type, message]); },
  navigate(view) { calls.push(['base', view]); },
  view_traceRegistry() { calls.push(['view_traceRegistry']); },
  view_weightList() { calls.push(['view_weightList']); },
  view_traceDossiers() { calls.push(['view_traceDossiers']); },
  view_traceLots() { calls.push(['view_traceLots']); },
  view_financeDashboard() { calls.push(['view_financeDashboard']); },
  view_financeAccounts() { calls.push(['view_financeAccounts']); },
  view_expenses() { calls.push(['view_expenses']); },
  view_expenseCategories() { calls.push(['view_expenseCategories']); },
  view_financeDocuments(type) { calls.push(['view_financeDocuments', type]); },
  view_financeJournal() { calls.push(['view_financeJournal']); },
  view_cashClosings() { calls.push(['view_cashClosings']); },
  view_financeReports() { calls.push(['view_financeReports']); },
  view_operationsDashboard() { calls.push(['view_operationsDashboard']); },
  view_drivers() { calls.push(['view_drivers']); },
  view_routes() { calls.push(['view_routes']); },
  view_trips() { calls.push(['view_trips']); },
  view_fuel() { calls.push(['view_fuel']); },
  view_maintenance() { calls.push(['view_maintenance']); },
  view_assets() { calls.push(['view_assets']); },
  view_logisticsReports() { calls.push(['view_logisticsReports']); },
  view_assetReports() { calls.push(['view_assetReports']); }
};
const window = { App, document, console };
window.window = window;

const source = fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'phase70-navigation-registry.js'), 'utf8');
assert.equal(source.includes('MutationObserver'), false, 'Regjistri nuk duhet të përdorë MutationObserver.');
vm.runInNewContext(source, { window, document, console, Array, String, Object, Boolean, Error, Promise, Set });

for (const id of ['sg62-trace-nav','sg5-nav-section','sg6-nav-section']) {
  assert.equal(document.querySelectorAll('#' + id).length, 1, `Duhet vetëm një seksion ${id}.`);
}
const items = sidebar.querySelectorAll('.nav-item');
const views = items.map((item) => item.dataset.sgNavView || item.dataset.sg5View || item.dataset.sg6View || item.dataset.sg62View || '');
assert.equal(views.length, 23, 'Katalogu final duhet të ketë 23 hyrje unike në tre modulet e zgjeruara.');
assert.equal(new Set(views).size, views.length, 'Nuk lejohen view të dublikuara.');
assert.equal(views.filter((view) => view === 'expenses').length, 1, 'Shpenzimet duhet të shfaqen vetëm një herë.');
assert.equal(document.querySelector('#sg6-nav-section').querySelectorAll('.nav-item').some((item) => item.dataset.sg6View === 'expenses'), false, 'Shpenzimet nuk duhet të jenë te Operacionet.');
assert.equal(document.querySelector('#sg5-nav-section').querySelectorAll('.nav-item').some((item) => item.dataset.sg5View === 'expenses'), true, 'Shpenzimet duhet të jenë te Financa.');

App.navigate('expenses');
App.navigate('cashReceipts');
App.navigate('weightForms');
App.navigate('drivers');
App.navigate('unknownCoreView');
assert(calls.some((row) => row[0] === 'view_expenses'));
assert(calls.some((row) => row[0] === 'view_financeDocuments' && row[1] === 'CASH_RECEIPT'));
assert(calls.some((row) => row[0] === 'view_weightList'));
assert(calls.some((row) => row[0] === 'view_drivers'));
assert(calls.some((row) => row[0] === 'base' && row[1] === 'unknownCoreView'));
assert.equal(calls.some((row) => row[0] === 'toast'), false, 'Navigimi i moduleve të regjistruara nuk duhet të japë gabim.');
console.log('NAVIGATION_REGISTRY_SUCCESS views=' + views.length);
