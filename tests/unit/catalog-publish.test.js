'use strict';
/* Service catalogue managed from the admin and published as one CDN file:
   server (functions/src/catalog-admin.js) validation, draft → publish → feed; client (services/local-catalog.js +
   services/catalog-remote.js) bank questions, published copy, served governorates. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const admin = require('../../functions/src/catalog-admin.js');

function bootCatalog(stored = {}) {
  const mem = new Map(Object.entries(stored));
  const ctx = { console, localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['shared/config/legacy-data.js', 'services/catalog-question-bank.js', 'services/local-catalog.js', 'services/local-market-store.js', 'services/catalog-remote.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { run: (c) => vm.runInContext(c, ctx), mem };
}
function fakeBackend() {
  const docs = new Map();
  return { docs, adapter: { get: async (tx, p) => (docs.has(p) ? JSON.parse(JSON.stringify(docs.get(p))) : null), set: (tx, p, v) => docs.set(p, v) }, getDoc: async (p) => docs.get(p) || null };
}
const OWNER = { role: 'owner', employeeId: 'e1' };

test('the built-in catalogue uses the question bank: door install asks about the frame', () => {
  const app = bootCatalog();
  assert.equal(app.run('CAT.db().v'), 3);
  const qs = app.run("CAT.questionsFor('carpentry/doors','carpentry/doors/install').map(q=>q.id)");
  assert.ok(qs.includes('door_frame'), 'frame question asked');
  assert.ok(app.run("CAT.questionsFor('cars/engine','').some(q=>q.id==='make'&&q.required)"), 'car model required');
  assert.ok(app.run("CAT.questionsFor('carpentry/doors','carpentry/doors/install').every(q=>q.label&&q.type)"), 'resolved from the bank');
});

test('server: cleanCatalog keeps known fields, checks references, always keeps «مشكلة أخرى»', () => {
  const app = bootCatalog();
  const draft = app.run('JSON.parse(JSON.stringify(CAT.db()))');
  draft.items[0].qs.push({ id: 'no_such_q', required: true });
  draft.items[0].evil = '<script>';
  draft.problems = draft.problems.filter((p) => !(p.item === draft.items[1].id && p.isOther));
  const { value, errors } = admin.cleanCatalog(draft);
  assert.ok(errors.some((e) => e.includes('no_such_q')), 'unknown bank question reported');
  assert.ok(!value.items[0].qs.some((r) => r.id === 'no_such_q'), 'and dropped');
  assert.equal(value.items[0].evil, undefined, 'unknown fields dropped');
  assert.ok(value.problems.some((p) => p.item === draft.items[1].id && p.isOther), '«مشكلة أخرى» restored');
  assert.equal(admin.cleanCatalog({ v: 3, bank: [], categories: [], items: [], problems: [] }).errors.length > 0, true, 'empty catalogue refused');
  assert.ok(admin.cleanCatalog({ ...draft, govs: [] }).errors.some((e) => e.includes('محافظة')), 'at least one governorate');
});

test('server: draft → publish → feed (one string doc, rev grows, roles enforced, unpublish)', async () => {
  const app = bootCatalog();
  const be = fakeBackend();
  const draft = app.run('JSON.parse(JSON.stringify(CAT.db()))');
  draft.govs = ['القاهرة', 'الجيزة'];
  const h = (method, p, body, adm = OWNER) => admin.handle({ backend: be, tx: null, method, path: p, body, admin: adm });
  assert.equal((await h('GET', '/admin/catalog', null, { role: 'callcenter' })).status, 403);
  assert.equal((await h('POST', '/admin/catalog/publish')).status, 409, 'nothing saved yet');
  const put = await h('PUT', '/admin/catalog', { catalog: draft });
  assert.ok(put.ok, JSON.stringify(put.error));
  assert.equal(typeof be.docs.get(admin.DRAFT).json, 'string');
  const p1 = await h('POST', '/admin/catalog/publish');
  assert.equal(p1.data.rev, 1);
  const p2 = await h('POST', '/admin/catalog/publish');
  assert.equal(p2.data.rev, 2);
  const g = await h('GET', '/admin/catalog');
  assert.equal(g.data.published.rev, 2); assert.deepEqual(g.data.draft.govs, ['القاهرة', 'الجيزة']);
  const f = await admin.feed(be);
  assert.match(f.headers['Cache-Control'], /s-maxage=\d+/, 'CDN cached');
  const body = JSON.parse(f.body);
  assert.equal(body.rev, 2); assert.equal(body.v, 3); assert.ok(body.items.length > 10);
  await h('POST', '/admin/catalog/unpublish');
  const off = JSON.parse((await admin.feed(be)).body);
  assert.ok(off.off && off.rev === 3, 'unpublish → off with a newer rev');
});

test('client: a newer published catalogue replaces the device copy, survives a reload; «off» drops it; governorates', async () => {
  const app = bootCatalog();
  const be = fakeBackend();
  const draft = app.run('JSON.parse(JSON.stringify(CAT.db()))');
  draft.govs = ['الجيزة'];
  draft.items.find((i) => i.id === 'carpentry/doors').name = 'أبواب وشبابيك';
  await admin.handle({ backend: be, method: 'PUT', path: '/admin/catalog', body: { catalog: draft }, admin: OWNER });
  await admin.handle({ backend: be, method: 'POST', path: '/admin/catalog/publish', admin: OWNER });
  const feed = (await admin.feed(be)).body;
  assert.equal(app.run(`HSCatalogRemote.apply(${feed})`), 'updated');
  assert.equal(app.run("CAT.item('carpentry/doors').name"), 'أبواب وشبابيك');
  assert.deepEqual(Array.from(app.run('CAT.govs()')), ['الجيزة']);
  assert.equal(app.run(`HSCatalogRemote.apply(${feed})`), 'same', 'same rev is ignored');
  const again = bootCatalog(Object.fromEntries(app.mem));
  assert.equal(again.run("CAT.item('carpentry/doors').name"), 'أبواب وشبابيك', 'kept on the device');
  assert.equal(again.run("HSCatalogRemote.apply({v:3,rev:9,off:true})"), 'dropped');
  assert.equal(again.run("CAT.item('carpentry/doors').name"), 'أبواب', 'back to the built-in catalogue');
  assert.ok(again.run('CAT.govs().length') > 5, 'all governorates again');
  assert.equal(again.run("HSCatalogRemote.apply({v:3,rev:10,bank:[],categories:[],items:[],problems:[]})"), 'same', 'an empty / invalid feed is never applied');
});

test('wiring: hosting rewrite, function export, script order, admin editor mounted', () => {
  const fb = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
  assert.ok(fb.hosting.rewrites.some((r) => r.source === '/catalog-feed' && r.function.functionId === 'catalogFeed'));
  assert.match(fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8'), /exports\.catalogFeed = onRequest/);
  for (const app of ['customer', 'provider']) {
    const html = fs.readFileSync(path.join(ROOT, `apps/${app}/index.html`), 'utf8');
    const a = html.indexOf('catalog-question-bank.js'), b = html.indexOf('local-catalog.js'), c = html.indexOf('catalog-remote.js');
    assert.ok(a > 0 && a < b && b < c, app + ': bank → catalogue → remote loader');
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'apps/admin/modules/admin-live-panels.js'), 'utf8'), /HSCatalogEditor\.mount/);
});
