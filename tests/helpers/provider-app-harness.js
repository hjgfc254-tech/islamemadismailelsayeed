'use strict';
/* Behavior harness for the standalone Provider app (apps/provider/index.html).
   Loads the real production script list, parsed from index.html in order, into a node:vm
   context with a minimal DOM. No jsdom, no source changes. Actions are dispatched through the
   app's own delegated click/submit listeners, and only on controls the app actually rendered
   (unless `force` is used to simulate a stale control). */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const ENTRY = 'apps/provider/index.html';
const SESSION_KEY = 'hs_provider_demo_session';
const STORE_KEY = 'hs_mp_db';

function entryScripts() {
  const html = fs.readFileSync(path.join(ROOT, ENTRY), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .map(m => path.posix.normalize(path.posix.join('apps/provider', m[1])));
}

function storage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k), clear: () => m.clear(), keys: () => [...m.keys()].filter(k => k !== 'hs_backend'), _map: m };   /* hs_backend is harness-seeded configuration, not an app write */
}

function element(extra = {}) {
  return Object.assign({ innerHTML: '', textContent: '', hidden: false, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, focus() {}, scrollIntoView() {}, click() {}, remove() {},
    insertAdjacentHTML(pos, html) { this.innerHTML = pos === 'afterbegin' ? html + this.innerHTML : this.innerHTML + html; },
    querySelector: () => null, querySelectorAll: () => [] }, extra);
}

/* Parse data-* attributes of the first tag in `html` matching every given attribute. */
function findTag(html, attrs) {
  for (const m of html.matchAll(/<(button|a|form)\b([^>]*)>/g)) {
    const tagAttrs = {};
    for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) tagAttrs[a[1]] = a[2];
    if (Object.entries(attrs).every(([k, v]) => tagAttrs[k] === v)) return tagAttrs;
  }
  return null;
}
const toDataset = attrs => Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-'))
  .map(([k, v]) => [k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()), v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")]));

function boot({ session = '', hash = '', store = null, setup, backend = 'local' } = {}) {
  const local = storage({ hs_backend: backend, ...(store ? { [STORE_KEY]: store } : {}) }),   /* offline demo, like ?backend=local */ sessionStore = storage(session ? { [SESSION_KEY]: session } : {});
  const listeners = { host: {}, window: {} };
  const fetchCalls = [];
  const focus = { current: null, history: [], scrollBehaviors: [] };
  const idEls = {};
  const setFocus = what => { focus.current = what; focus.history.push(what); };
  const reducedMotion = { value: false };
  const view = element({ focus: () => setFocus('view') }), nav = element(), toastEl = element(), logout = element({ hidden: true });
  /* Supports '#id' (inline forms) and attribute selectors like '[data-pv-action="x"][data-id="y"]'. */
  view.querySelector = sel => {
    const id = /^#([\w-]+)$/.exec(sel);
    if (id) {
      if (!view.innerHTML.includes(`id="${id[1]}"`)) return null;
      if (!id[1].endsWith('-form')) return idEls[id[1]] || (idEls[id[1]] = element({ id: id[1] })); // stable stub so tests can read textContent
      return element({ id: id[1], scrollIntoView: opts => focus.scrollBehaviors.push(opts && opts.behavior),
        querySelector: () => element({ focus: () => setFocus('field:' + id[1]) }) });
    }
    if (sel === '.pv-inline-form') {
      if (!/<form class="pv-inline-form[^"]*"/.test(view.innerHTML)) return null;
      return element({ remove: () => { view.innerHTML = view.innerHTML.replace(/<form class="pv-inline-form[^"]*"[\s\S]*?<\/form>/, ''); } });
    }
    const attrs = [...sel.matchAll(/\[([\w-]+)="([^"]*)"\]/g)];
    if (attrs.length && attrs.map(m => m[0]).join('') === sel) {
      const tag = findTag(view.innerHTML, Object.fromEntries(attrs.map(m => [m[1], m[2]])));
      return tag ? element({ dataset: toDataset(tag), focus: () => setFocus(sel) }) : null;
    }
    return null;
  };
  const host = element({
    addEventListener: (type, fn) => { (listeners.host[type] = listeners.host[type] || []).push(fn); },
    querySelector: sel => ({ '#provider-view': view, '#provider-nav': nav, '#provider-toast': toastEl,
      '[data-pv-action="logout"]': logout })[sel] || null
  });
  const location = { hash };
  let formValues = {};
  const ctx = {
    console, Date, Intl, Math, JSON, Number, String, Object, Array, Set, Map, Error, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    localStorage: local, sessionStorage: sessionStore, location,
    navigator: {}, matchMedia: q => ({ matches: /prefers-reduced-motion:\s*reduce/.test(q) ? reducedMotion.value : false }),
    fetch: (...args) => { fetchCalls.push(args); return Promise.reject(new Error('network disabled in tests')); },
    FormData: function FormData() { return {
      get: k => (k in formValues ? (Array.isArray(formValues[k]) ? (formValues[k][0] ?? null) : formValues[k]) : null),
      getAll: k => (k in formValues ? [].concat(formValues[k]) : [])
    }; },
    addEventListener: (type, fn) => { (listeners.window[type] = listeners.window[type] || []).push(fn); },
    removeEventListener() {},
    document: { title: '', readyState: 'complete', getElementById: id => (id === 'provider-app' ? host : null),
      querySelector: () => null, querySelectorAll: () => [], createElement: () => element(), addEventListener() {},
      documentElement: element(), body: element() }
  };
  ctx.globalThis = ctx; ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  const run = code => vm.runInContext(code, ctx);
  const scripts = entryScripts();
  const appIndex = scripts.indexOf('apps/provider/app.js');
  scripts.forEach((file, i) => {
    if (i === appIndex && setup) setup({ MP: run('MP'), run, local, session: sessionStore });
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  });

  const fireHash = () => (listeners.window.hashchange || []).forEach(fn => fn({}));
  /* UI mutations are async (API adapters). settle() lets pending promises run (vm shares the host microtask queue),
     then fires hashchange if the handler navigated after its await — as the browser would. */
  const settle = async () => { const before = location.hash; for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); if (location.hash !== before) fireHash(); };
  const withHashSync = fn => { const before = location.hash; fn(); if (location.hash !== before) fireHash(); };
  const allHtml = () => nav.innerHTML + view.innerHTML;

  const api = {
    ctx, run, MP: run('MP'), view, nav, toast: toastEl, logout, location, local, session: sessionStore, fetchCalls, scripts,
    focus, reducedMotion, title: () => ctx.document.title,
    html: () => view.innerHTML,
    navHtml: () => nav.innerHTML,
    has: attrs => !!findTag(allHtml(), attrs),
    /* Click a rendered control matching attrs. force:true dispatches even if not rendered (stale UI). */
    click(attrs, { force = false } = {}) {
      const tag = findTag(allHtml(), attrs) || (force ? attrs : null);
      if (!tag) throw new Error('Control not rendered: ' + JSON.stringify(attrs));
      const target = { dataset: toDataset(tag),
        closest(sel) {
          if (sel === '[data-pv-route]') return 'data-pv-route' in tag ? target : null;
          if (sel === '[data-pv-action]') return 'data-pv-action' in tag ? target : null;
          if (sel === 'form') return api._openForm ? { remove: () => { view.innerHTML = view.innerHTML.replace(/<form class="pv-inline-form[^"]*"[\s\S]*?<\/form>/, ''); } } : null;
          return null;
        } };
      api._openForm = /<form class="pv-inline-form[^"]*"/.test(view.innerHTML);
      withHashSync(() => (listeners.host.click || []).forEach(fn => fn({ target })));
      return settle();
    },
    /* Submit an open inline form by id with field values. */
    submit(formId, values, { force = false } = {}) {
      const tag = findTag(view.innerHTML, { id: formId }) || (force ? { id: formId, 'data-id': values.__id || '' } : null);
      if (!tag) throw new Error('Form not rendered: ' + formId);
      formValues = values;
      let prevented = false;
      const form = { id: formId, dataset: toDataset(tag), matches: sel => sel === '.pv-inline-form' };
      withHashSync(() => (listeners.host.submit || []).forEach(fn => fn({ target: form, preventDefault: () => { prevented = true; } })));
      const result = { prevented };
      return Object.assign(settle().then(() => result), result);   // sync .prevented still works; await to let API calls finish
    },
    /* Type into an open inline form: sets field values and dispatches the app's delegated `input` listener. */
    input(formId, values) {
      const tag = findTag(view.innerHTML, { id: formId });
      if (!tag) throw new Error('Form not rendered: ' + formId);
      formValues = values;
      const form = { id: formId, dataset: toDataset(tag) };
      (listeners.host.input || []).forEach(fn => fn({ target: { closest: sel => (sel === '#' + formId ? form : null) } }));
    },
    el: id => idEls[id],
    /* Press a key with focus inside the open inline form (inForm) or elsewhere in the app. */
    key(key, { inForm = true } = {}) {
      const target = { closest: sel => (sel === '.pv-inline-form' && inForm && /<form class="pv-inline-form[^"]*"/.test(view.innerHTML) ? {} : null) };
      let prevented = false;
      (listeners.host.keydown || []).forEach(fn => fn({ key, target, preventDefault: () => { prevented = true; } }));
      return { prevented };
    },
    go(hash) { location.hash = hash; fireHash(); },
    settle,
    request: id => run('MP').get('serviceRequests', id),
    assignmentFor: (reqId, providerId) => run('MP').db().assignments.find(a => a.reqId === reqId && a.providerId === providerId)
  };
  return api;
}

/* Create a request offered to `providerId` (auto-assignment disabled so the target is deterministic). */
function offerRequest(MP, providerId = 'p_demo1', extra = {}) {
  MP.db().settings.autoAssign = false;
  const r = MP.createRequest(Object.assign({ name: 'عميل تجريبي', phone: '01000000001', cat: 'electric', serviceId: 's1',
    serviceName: 'تركيب لوحة كهرباء', desc: 'وصف تجريبي', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع 1' }, extra));
  const result = MP.assign(r.id, providerId);
  if (!result.ok) throw new Error('assign failed: ' + result.msg);
  return r;
}

module.exports = { boot, offerRequest, entryScripts, SESSION_KEY, STORE_KEY, ROOT };
