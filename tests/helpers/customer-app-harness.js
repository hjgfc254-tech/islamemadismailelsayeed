'use strict';
/* Customer app behavior harness: boots the real Customer script list (parsed from apps/customer/index.html, in order)
   in node:vm with a minimal DOM that records focus, history and window listeners. No jsdom, no source changes. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const ENTRY = 'apps/customer/index.html';
/* `override` maps repo-relative paths to source text (e.g. a previous git revision) — used for extraction parity checks. */
const readSrc = (f, override = {}) => (f in override ? override[f] : fs.readFileSync(path.join(ROOT, f), 'utf8'));
const scripts = (override = {}) => [...readSrc(ENTRY, override).matchAll(/<script src="([^"]+)"><\/script>/g)]
  .map(m => path.posix.normalize(path.posix.join('apps/customer', m[1])));

function storage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, _map: m };
}

/* boot({hash, local, session}) — `local`/`session` seed storage before scripts load (MP reads localStorage at load). */
function boot({ hash = '', local = {}, session = {}, override = {} } = {}) {
  const docListeners = {}, winListeners = {}, focus = { current: null, history: [] };
  const historyLog = [];
  const connected = new Set();
  let doc; // focus recorders behave like a browser: the focused element becomes document.activeElement
  const record = (what, el) => { focus.current = what; focus.history.push(what); if (el && doc) { connected.add(el); doc.activeElement = el; } };
  const mkEl = (extra = {}) => Object.assign({ innerHTML: '', value: '', hidden: false, dataset: {}, style: {}, scrollTop: 0, inert: false, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, removeEventListener() {}, setAttribute() {},
    removeAttribute() {}, getAttribute: () => null, hasAttribute: () => false, appendChild() {}, remove() {}, focus() {}, click() {}, scrollIntoView() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, contains: () => false,
    getBoundingClientRect: () => ({ width: 300, height: 300, top: 0, left: 0, right: 300, bottom: 300 }) }, extra);
  const els = {};
  const view = mkEl({ focus() { record('view', this); } });
  /* Replacing #view markup disconnects anything focused inside it (as in a browser). */
  const viewOwned = new Set();
  let viewHtml = '';
  Object.defineProperty(view, 'innerHTML', { get: () => viewHtml, set: v => { viewHtml = String(v); viewOwned.forEach(e => connected.delete(e)); viewOwned.clear(); } });
  const ownedByView = el => { viewOwned.add(el); return el; };
  /* view.querySelector: the heading and attribute selectors resolve against the rendered markup. */
  view.querySelector = sel => {
    if (sel === '.dhead h2') return /<div class="dhead">[\s\S]*?<h2 tabindex="-1">/.test(view.innerHTML) ? ownedByView(mkEl({ focus() { record('heading', this); } })) : null;
    const attr = /^\[([\w-]+)="([^"]*)"\]$/.exec(sel);
    if (attr) return view.innerHTML.includes(`${attr[1]}="${attr[2]}"`) ? ownedByView(mkEl({ focus() { record(sel, this); } })) : null;
    return null;
  };
  els['#view'] = view;
  const getEl = id => els[id] || (els[id] = mkEl());
  const body = mkEl();
  const tabEl = mkEl();
  doc = { readyState: 'loading', hidden: false, body, activeElement: body, title: '',
    documentElement: Object.assign(mkEl(), { classList: { add() {}, remove() {}, contains: () => true } }),
    querySelector: s => (/^#tabbar \[data-go="[\w-]+"\]$/.test(s) ? mkEl({ focus() { record(s, this); } }) : getEl(s)), getElementById: i => getEl('#' + i),
    createElement: () => mkEl(), createDocumentFragment: () => mkEl(),
    querySelectorAll: () => [], contains: el => el === body || el === tabEl || connected.has(el),
    addEventListener: (t, f) => (docListeners[t] = docListeners[t] || []).push(f), removeEventListener() {} };
  const location = { protocol: 'file:', hash };
  const history = { state: null,
    pushState(state, _t, url) { historyLog.push(['push', url ?? null]); history.state = state; if (url) location.hash = String(url).slice(String(url).indexOf('#')); },
    replaceState(state, _t, url) { historyLog.push(['replace', url ?? null]); history.state = state; if (url) location.hash = String(url).slice(String(url).indexOf('#')); },
    back() { historyLog.push(['back']); } };
  const local$ = storage(local), session$ = storage({ hs_intro_v1: '1', ...session });
  const win = { addEventListener: (t, f) => (winListeners[t] = winListeners[t] || []).push(f), removeEventListener() {} };
  const ctx = { console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    localStorage: local$, sessionStorage: session$, document: doc, window: win, history, navigator: {}, location,
    matchMedia: () => ({ matches: false, addEventListener() {} }), innerWidth: 390, innerHeight: 800, Image: function () {}, URL, File: function () {},
    Blob: function () {}, requestAnimationFrame: () => 0, indexedDB: undefined, Event: function () {}, CustomEvent: function () {},
    MutationObserver: function () { return { observe() {}, disconnect() {} }; }, confirm: () => true };
  ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of scripts(override)) vm.runInContext(readSrc(f, override), ctx, { filename: f });
  const run = code => vm.runInContext(code, ctx);
  (docListeners.DOMContentLoaded || []).forEach(f => f());
  const clickDoc = dataset => {
    const target = { dataset, closest: sel => (sel.split(',').some(s => { const m = /^\[data-([\w-]+)\]$/.exec(s.trim()); return m && m[1].replace(/-(\w)/g, (_, c) => c.toUpperCase()) in dataset; }) ? target : null) };
    (docListeners.click || []).forEach(f => f({ target, preventDefault() {}, stopPropagation() {} }));
  };
  /* Dispatch a delegated document submit for a form id with field values. */
  const submitDoc = (id, values) => {
    const form = { id, dataset: {}, closest: () => null };
    ctx.FormData = function () { return { get: k => (k in values ? values[k] : null), getAll: k => [].concat(values[k] ?? []) }; };
    (docListeners.submit || []).forEach(f => f({ target: form, preventDefault() {} }));
  };
  /* Simulate the user editing the address bar like Chromium does: the hash changes, `popstate` fires first, then
     `hashchange` with oldURL/newURL. Handlers that run on popstate may rewrite location.hash before hashchange runs. */
  const navigate = h => {
    const oldURL = 'http://localhost/apps/customer/index.html' + location.hash;
    location.hash = h;
    const newURL = 'http://localhost/apps/customer/index.html' + h;
    (winListeners.popstate || []).forEach(f => f({ state: history.state }));
    (winListeners.hashchange || []).forEach(f => f({ oldURL, newURL }));
  };
  return { run, view, focus, doc, body, tabEl, clickDoc, submitDoc, navigate, location, history, historyLog, local: local$, session: session$,
    toast: () => getEl('#toast').textContent,
    html: () => view.innerHTML,
    signIn() { run("store.set('user',{name:'سارة أحمد',phone:'01011112222'}); MP.customerFor('سارة أحمد','01011112222')"); },
    newRequest(name = 'سارة أحمد', phone = '01011112222') {
      return run(`MP.createRequest({name:${JSON.stringify(name)},phone:${JSON.stringify(phone)},cat:'electric',serviceId:'s1',serviceName:'فحص كهرباء',desc:'d',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1'}).id`);
    } };
}

module.exports = { boot, scripts, ROOT, ENTRY };
