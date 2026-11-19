'use strict';
/* Admin live editors that no test loaded before:
   • marketing-editor (HSMarketingEditor) on the REAL local API: renders the offers / inspection / fees / caps controls,
     edits go into the PATCH body, the server stores them, validation errors are shown.
   • ai-settings (HSAiSettings) against a recording fake server: providers add / reorder / remove, keys are never echoed
     back, the test button reports the result, save sends exactly the editable fields.
   • mini-charts (HSMiniCharts): daily buckets and accessible bar markup.
   The host is a tiny delegated-events stand-in (the editors attach input / change / click listeners on the host). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const DOMAIN = ['shared/config/legacy-data.js', 'services/local-catalog.js', 'services/local-market-store.js',
  ...['api-client', 'auth-api', 'orders-api', 'quotes-api', 'catalog-api', 'provider-api', 'customer-api', 'notifications-api', 'support-api', 'finance-api', 'admin-api', 'uploads-api', 'realtime-client'].map(n => `services/${n}.js`)];
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() }; };
const tick = () => new Promise(r => setImmediate(r));

function context(files, extra = {}) {
  const ctx = { console, setTimeout, clearTimeout, setImmediate, Promise, JSON, Date, Math, Intl, localStorage: mem(), sessionStorage: mem(),
    addEventListener() {}, removeEventListener() {}, location: { pathname: '/apps/admin/index.html' },
    HSAdminRbac: { state: { roster: [{ id: 'e_owner', name: 'مالك', role: 'owner', status: 'active' }] } }, ...extra };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { ctx, run: c => vm.runInContext(c, ctx) };
}

/* Delegated host: listeners on the host, querySelector for [data-x] / [data-x="v"] against the rendered markup. */
function host() {
  const listeners = {}, nodes = new Map();
  const h = {
    innerHTML: '',
    addEventListener: (t, f) => (listeners[t] = listeners[t] || []).push(f),
    querySelector(sel) {
      const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel); if (!m) return null;
      if (!new RegExp(m[1] + (m[2] != null ? `="${m[2]}"` : '(?=[\\s>="])')).test(h.innerHTML)) return null;
      if (!nodes.has(sel)) nodes.set(sel, { textContent: '' });
      return nodes.get(sel);
    },
    has: attr => h.innerHTML.includes(attr),
    /* target with dataset from data-* attrs; `row` = the data-i of the enclosing row; `button` = closest('button') is itself */
    async fire(type, attrs, { value = '', checked = false, kind = 'text', row = null, button = false } = {}) {
      const dataset = {};
      for (const [k, v] of Object.entries(attrs)) if (k.startsWith('data-')) dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
      const target = { dataset, value: String(value), checked, type: kind, disabled: false,
        hasAttribute: a => a in attrs,
        closest: s => (s === 'button' ? (button ? target : null) : s === '[data-i]' && row != null ? { dataset: { i: String(row) } } : null) };
      for (const f of listeners[type] || []) await f({ target, preventDefault() {} });
      await tick();
    },
    status: attr => (nodes.get(`[${attr}]`) || {}).textContent || ''
  };
  return h;
}

test('marketing editor on the real API: offers, inspection, fees and caps go to the server; errors are shown', async () => {
  const { ctx, run } = context([...DOMAIN, 'apps/admin/modules/marketing-editor.js']);
  ctx.HSAuthApi.useApp('admin'); ctx.sessionStorage.setItem('hs_admin_demo_session', 'e_owner');
  const h = host();
  await ctx.HSMarketingEditor.mount(h); await tick();
  for (const a of ['data-mk-bid', 'data-mk-bidwin', 'data-mk-icap-default', 'data-mk-num="cancelFee"', 'data-mk-num="visitFee"', 'data-mk-num="inspectionRate"', 'data-mk-insp-cat="electric"', 'data-mk-pcap-cat="electric"', 'data-mk-w-default', 'data-mk-pin', 'data-mk-save'])
    assert.ok(h.has(a), 'renders ' + a);
  assert.match(h.innerHTML, /data-mk-w-default value="30"/, 'a month of warranty by default');
  assert.ok((h.innerHTML.match(/data-mk-insp-cat=/g) || []).length >= 5, 'one row per category (the catalogue is read even though CAT is not a window property)');
  assert.ok(h.has('data-mk-w-item='), 'per-item warranty rows');
  assert.match(h.innerHTML, /data-mk-icap-default value=""/, 'no inspection cap until the admin sets one');
  await h.fire('change', { 'data-mk-bid': '' }, { checked: true, kind: 'checkbox' });
  await h.fire('input', { 'data-mk-bidwin': '' }, { value: '20', kind: 'number' });
  await h.fire('input', { 'data-mk-num': 'cancelFee' }, { value: '65', kind: 'number' });
  await h.fire('input', { 'data-mk-num': 'visitFee' }, { value: '90', kind: 'number' });
  await h.fire('change', { 'data-mk-insp-cat': 'electric' }, { checked: true, kind: 'checkbox' });
  await h.fire('input', { 'data-mk-pcap-cat': 'electric' }, { value: '1200', kind: 'number' });
  await h.fire('input', { 'data-mk-icap-cat': 'plumbing' }, { value: '150', kind: 'number' });
  await h.fire('click', { 'data-mk-save': '' }, { button: true });
  await tick();
  const s = JSON.parse(run('JSON.stringify(MP.db().settings)'));
  assert.equal(s.bidding, true); assert.equal(s.bidWindowMin, 20); assert.equal(s.cancelFee, 65); assert.equal(s.visitFee, 90);
  assert.equal(s.inspection.cats.electric, true); assert.equal(s.priceCaps.cats.electric, 1200); assert.equal(s.inspectionCap.cats.plumbing, 150);
  assert.match(h.status('data-mk-status'), /تم الحفظ/);
  /* clearing a cap removes it; an invalid value shows the server's message */
  await h.fire('input', { 'data-mk-pcap-cat': 'electric' }, { value: '', kind: 'number' });
  await h.fire('input', { 'data-mk-bidwin': '' }, { value: '500', kind: 'number' });
  await h.fire('click', { 'data-mk-save': '' }, { button: true }); await tick();
  assert.match(h.status('data-mk-status'), /دقيقة/, 'validation message shown');
  assert.equal(JSON.parse(run('JSON.stringify(MP.db().settings)')).bidWindowMin, 20, 'nothing saved on error');
});

test('AI settings: providers add / reorder / remove; keys stay server-side; test button; save sends the editable fields', async () => {
  const calls = [];
  let server = { features: { text: true, photo: false }, dailyLimit: 10, globalDailyLimit: 500,
    providers: [{ id: 'p1', label: 'DeepSeek 1', kind: 'deepseek', model: 'deepseek-chat', baseUrl: '', roles: ['text'], enabled: true, hasKey: true, keyLast4: 'ab12' }] };
  const fake = { request: async (method, p, opts = {}) => {
    calls.push({ method, p, body: opts.body && JSON.parse(JSON.stringify(opts.body)) });
    if (method === 'GET') return { ok: true, data: JSON.parse(JSON.stringify(server)) };
    if (p === '/admin/ai/test') return { ok: true, data: { ok: true, ms: 420, result: { itemName: 'غسالة', problemName: 'مش بتعصر' } } };
    if (opts.body.dailyLimit > 500) return { ok: false, error: { code: 'VALIDATION', message: 'x', details: { dailyLimit: 'من 0 لـ 500' } } };
    server = { ...server, ...opts.body, providers: opts.body.providers.map((q, i) => ({ ...q, id: q.id || 'new' + i, hasKey: !!q.apiKey || !!q.id, keyLast4: q.apiKey ? q.apiKey.slice(-4) : 'ab12', apiKey: undefined })) };
    return { ok: true, data: JSON.parse(JSON.stringify(server)) };
  } };
  const { ctx } = context(['apps/admin/modules/ai-settings.js'], { HSApiClient: fake });
  const h = host();
  await ctx.HSAiSettings.mount(h); await tick();
  assert.match(h.innerHTML, /محفوظ …ab12/, 'only the last 4 characters of a saved key are shown');
  assert.doesNotMatch(h.innerHTML, /value="sk-/, 'no key in the markup');
  await h.fire('click', { 'data-ai-add': 'gemini' }, { button: true });
  assert.match(h.innerHTML, /data-i="1"/, 'second provider row');
  await h.fire('input', { 'data-ai-p': 'apiKey' }, { value: 'AIza-test-9999', row: 1 });
  await h.fire('click', { 'data-ai-up': '1' }, { button: true });
  await h.fire('change', { 'data-ai-f': 'photo' }, { checked: true, kind: 'checkbox' });
  await h.fire('input', { 'data-ai-n': 'dailyLimit' }, { value: '20', kind: 'number' });
  await h.fire('click', { 'data-ai-test': '1' }, { button: true });
  assert.match(h.status('data-ai-out="1"'), /شغّال ✓ \(420 ms\)/);
  await h.fire('click', { 'data-ai-save': '' }, { button: true }); await tick();
  const save = calls.find(c => c.method === 'PATCH');
  assert.deepEqual(save.body.providers.map(p => p.kind), ['gemini', 'deepseek'], 'order follows the admin');
  assert.equal(save.body.providers[0].apiKey, 'AIza-test-9999'); assert.equal(save.body.providers[1].apiKey, undefined, 'an untouched key is not resent');
  assert.deepEqual(save.body.features, { text: true, photo: true }); assert.equal(save.body.dailyLimit, 20);
  assert.match(h.status('data-ai-status'), /تم الحفظ/);
  assert.doesNotMatch(h.innerHTML, /AIza-test-9999/, 'the key is not rendered back after saving');
  await h.fire('click', { 'data-ai-del': '1' }, { button: true });
  assert.doesNotMatch(h.innerHTML, /data-i="1"/, 'removed');
  await h.fire('input', { 'data-ai-n': 'dailyLimit' }, { value: '900', kind: 'number' });
  await h.fire('click', { 'data-ai-save': '' }, { button: true }); await tick();
  assert.match(h.status('data-ai-status'), /من 0 لـ 500/, 'server validation shown');
});

test('AI settings: a server error on load is shown instead of the form', async () => {
  const { ctx } = context(['apps/admin/modules/ai-settings.js'], { HSApiClient: { request: async () => ({ ok: false, error: { code: 'FORBIDDEN', message: 'مش مسموح' } }) } });
  const h = host();
  await ctx.HSAiSettings.mount(h);
  assert.match(h.innerHTML, /مش مسموح/); assert.ok(!h.has('data-ai-save'));
});

test('mini charts: daily buckets and accessible thin bars', () => {
  const C = require('../../apps/admin/modules/mini-charts.js');
  const day = 864e5, now = Date.now();
  const items = [{ at: new Date(now).toISOString(), v: 3 }, { at: new Date(now - day).toISOString(), v: 2 }, { at: new Date(now - 10 * day).toISOString(), v: 9 }];
  const pts = C.daily(items, 7, x => x.at, x => x.v);
  assert.equal(pts.length, 7);
  assert.equal(pts.reduce((s, p) => s + p.value, 0), 5, 'only the last 7 days count');
  const html = C.bars({ id: 'c1', title: 'الطلبات', points: pts });
  assert.match(html, /الطلبات/);
  assert.equal((html.match(/class="mc-bar[ "]/g) || []).length, 7);
  assert.match(html, /is-zero/, 'empty days drawn as zero bars');
});
