'use strict';
/* Phase 5 item 4 — Customer Orders / Order Details / Tracking keyboard & focus behavior.
   Boots the real Customer script list (parsed from apps/customer/index.html, in order) in node:vm with a minimal DOM
   that records focus, then drives the app through its own show() and delegated document click listeners. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const ENTRY = 'apps/customer/index.html';
const scripts = () => [...fs.readFileSync(path.join(ROOT, ENTRY), 'utf8').matchAll(/<script src="([^"]+)"><\/script>/g)]
  .map(m => path.posix.normalize(path.posix.join('apps/customer', m[1])));

function boot() {
  const mem = {}, docListeners = {}, focus = { current: null, history: [] };
  const connected = new Set();
  let doc; // assigned below; focus recorders behave like a browser: the focused element becomes document.activeElement
  const record = (what, el) => { focus.current = what; focus.history.push(what); if (el && doc) { connected.add(el); doc.activeElement = el; } };
  const mkEl = (extra = {}) => Object.assign({ innerHTML: '', value: '', hidden: false, dataset: {}, style: {}, scrollTop: 0, inert: false, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, removeEventListener() {}, setAttribute() {},
    removeAttribute() {}, getAttribute: () => null, hasAttribute: () => false, appendChild() {}, remove() {}, focus() {}, click() {}, scrollIntoView() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, contains: () => false,
    getBoundingClientRect: () => ({ width: 300, height: 300, top: 0, left: 0, right: 300, bottom: 300 }) }, extra);
  const els = {};
  const view = mkEl({ focus() { record('view', this); } });
  /* view.querySelector: the heading and attribute selectors resolve against the rendered markup. */
  view.querySelector = sel => {
    if (sel === '.dhead h2') return /<div class="dhead">[\s\S]*?<h2 tabindex="-1">/.test(view.innerHTML) ? ownedByView(mkEl({ focus() { record('heading', this); } })) : null;
    const attr = /^\[([\w-]+)="([^"]*)"\]$/.exec(sel);
    if (attr) return view.innerHTML.includes(`${attr[1]}="${attr[2]}"`) ? ownedByView(mkEl({ focus() { record(sel, this); } })) : null;
    return null;
  };
  /* Replacing #view markup disconnects anything focused inside it (as in a browser). */
  const viewOwned = new Set();
  let viewHtml = '';
  Object.defineProperty(view, 'innerHTML', { get: () => viewHtml, set: v => { viewHtml = String(v); viewOwned.forEach(e => connected.delete(e)); viewOwned.clear(); } });
  const ownedByView = el => { viewOwned.add(el); return el; };
  els['#view'] = view;
  const getEl = id => els[id] || (els[id] = mkEl());
  const body = mkEl();
  doc = { readyState: 'loading', hidden: false, body, activeElement: body, title: '',
    documentElement: Object.assign(mkEl(), { classList: { add() {}, remove() {}, contains: () => true } }),
    querySelector: s => (/^#tabbar \[data-go="[\w-]+"\]$/.test(s) ? mkEl({ focus() { record(s, this); } }) : getEl(s)), getElementById: i => getEl('#' + i), createElement: () => mkEl(), createDocumentFragment: () => mkEl(),
    querySelectorAll: () => [], contains: el => el === body || el === tabEl || connected.has(el),
    addEventListener: (t, f) => (docListeners[t] = docListeners[t] || []).push(f), removeEventListener() {} };
  const tabEl = mkEl();
  const ctx = { console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } },
    sessionStorage: { getItem: () => '1', setItem() {}, removeItem() {} }, document: doc,
    window: { addEventListener() {} }, history: { pushState() {}, replaceState() {}, back() {} }, navigator: {}, location: { protocol: 'file:', hash: '' },
    matchMedia: () => ({ matches: false, addEventListener() {} }), innerWidth: 390, innerHeight: 800, Image: function () {}, URL: {}, File: function () {},
    Blob: function () {}, requestAnimationFrame: () => 0, indexedDB: undefined, Event: function () {}, CustomEvent: function () {}, MutationObserver: function () { return { observe() {}, disconnect() {} }; } };
  ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of scripts()) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const run = code => vm.runInContext(code, ctx);
  (docListeners.DOMContentLoaded || []).forEach(f => f());
  const clickDoc = dataset => {
    const target = { dataset, closest: sel => (sel.split(',').some(s => { const m = /^\[data-([\w-]+)\]$/.exec(s.trim()); return m && m[1].replace(/-(\w)/g, (_, c) => c.toUpperCase()) in dataset; }) ? target : null) };
    (docListeners.click || []).forEach(f => f({ target, preventDefault() {}, stopPropagation() {} }));
  };
  return { run, view, focus, doc, body, tabEl, clickDoc,
    html: () => view.innerHTML,
    signIn() { run("store.set('user',{name:'سارة أحمد',phone:'01011112222'}); MP.customerFor('سارة أحمد','01011112222')"); },
    newRequest() { return run("MP.createRequest({name:'سارة أحمد',phone:'01011112222',cat:'electric',serviceId:'s1',serviceName:'فحص كهرباء',desc:'d',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1'}).id"); } };
}

test('the harness boots the production Customer script list and the initial render does not steal focus', () => {
  const app = boot();
  assert.ok(scripts().includes('apps/customer/app.js'));
  assert.match(app.html(), /class="hero"/, 'home rendered after DOMContentLoaded');
  assert.deepEqual(app.focus.history, [], 'no focus move on boot');
});

test('screen headings are programmatic focus targets', () => {
  const app = boot();
  app.signIn(); app.newRequest();
  app.run("show('orders')");
  assert.match(app.html(), /<div class="dhead">[\s\S]*?<h2 tabindex="-1">طلباتي<\/h2>/);
});

test('when a screen change drops focus (it was inside #view), focus moves to the new screen heading', () => {
  const app = boot();
  app.signIn(); app.newRequest();
  app.doc.activeElement = app.body; // the activated control was replaced with the old view
  app.run("show('orders')");
  assert.equal(app.focus.current, 'heading');
});

test('focus is not moved when it is still on a connected control outside #view (e.g. the tab bar)', () => {
  const app = boot();
  app.signIn(); app.newRequest();
  app.doc.activeElement = app.tabEl;
  app.focus.history.length = 0;
  app.run("show('orders')");
  assert.deepEqual(app.focus.history, []);
});

test('activating a tab keeps focus on the re-rendered equivalent tab (renderTabs rebuilds #tabbar)', () => {
  const app = boot();
  app.signIn(); app.newRequest();
  const pressedTab = { dataset: { go: 'orders' }, closest: sel => (sel === '#tabbar' ? {} : null) };
  app.doc.activeElement = pressedTab;           // focus on the Orders tab before show()
  const realContains = app.doc.contains;
  app.doc.contains = el => el !== pressedTab && realContains(el); // ...which renderTabs() destroys
  app.focus.history.length = 0;
  app.run("show('orders')");
  assert.equal(app.focus.current, '#tabbar [data-go="orders"]');
});

test('pressing an orders filter keeps focus on that filter after the re-render', () => {
  const app = boot();
  app.signIn(); app.newRequest();
  app.run("show('orders')");
  app.doc.activeElement = app.body;
  app.clickDoc({ orderFilter: 'all' });
  assert.match(app.html(), /data-order-filter="all" aria-pressed="true"/);
  assert.equal(app.focus.current, '[data-order-filter="all"]');
});

test('opening a request from the orders list focuses the tracking heading; tracking actions keep focus on the screen', () => {
  const app = boot();
  app.signIn();
  const id = app.newRequest();
  app.run("show('orders')");
  app.doc.activeElement = app.body;
  app.clickDoc({ track: id });
  assert.match(app.html(), /<h2 tabindex="-1">متابعة الطلب #HS-/);
  assert.equal(app.focus.current, 'heading');
  app.focus.current = null;
  app.clickDoc({ act: 'simAdvance', id });
  assert.equal(app.focus.current, 'heading', 'status change re-render does not drop focus to <body>');
});

test('the tracking timeline marks exactly one current step with aria-current="step"', () => {
  const app = boot();
  app.signIn();
  const id = app.newRequest();
  app.run(`show('tracking', ${JSON.stringify(id)})`);
  const current = app.html().match(/<li [^>]*aria-current="step"/g) || [];
  assert.equal(current.length, 1);
  assert.match(app.html(), /<ol class="tl" aria-label="السجل الزمني للطلب"><li class="done" aria-current="step">/, 'the latest entry (first after reverse) is current');
  app.run(`MP.cancel(${JSON.stringify(id)}, 'x'); show('tracking', ${JSON.stringify(id)})`);
  assert.equal((app.html().match(/aria-current="step"/g) || []).length, 1, 'still exactly one after a terminal status');
});

test('the tracking back control and order cards are native buttons with accessible names', () => {
  const app = boot();
  app.signIn();
  const id = app.newRequest();
  app.run("show('orders')");
  assert.match(app.html(), new RegExp(`<button class="prow glass neon" data-track="${id}">`));
  app.run(`show('tracking', ${JSON.stringify(id)})`);
  assert.match(app.html(), /<button class="back" data-back aria-label="رجوع">/);
});
