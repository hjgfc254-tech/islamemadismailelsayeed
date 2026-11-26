'use strict';
/* Live technician tracking: POST /requests/:id/location (assigned provider only, enroute / arrived only, ~10 m rounding,
   latest point only, cleared after arrival → start), and visibility (the request's customer yes, other providers no). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { boot, plain, ROOT } = require('../helpers/domain-harness.js');
const { scopeFor } = require(path.join(ROOT, 'functions/src/scope.js'));

function seed() {
  const h = boot();
  const id = plain(h.run(`(() => { const r = MP.createRequest({ name: 'سارة', phone: '01011112222', cat: 'electric', serviceName: 'تركيب', desc: 'وصف كافي للطلب', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' });
    MP.assign(r.id, 'p_demo1'); MP.respond(r.id, true); MP.confirmTime(r.id, 'provider'); return r.id; })()`));
  return { h, id };
}

test('location is refused before «في الطريق», accepted while enroute (rounded to ~10 m), throttled, and cleared on start', async () => {
  const { h, id } = seed();
  h.as('provider', 'p_demo1');
  const early = plain(await h.O.shareLocation(id, 30.0444123, 31.2357456, 12));
  assert.equal(early.ok, false); assert.equal(early.status, 409);
  h.run(`MP.advance(${JSON.stringify(id)}, 'enroute')`);
  const r1 = plain(await h.O.shareLocation(id, 30.0444123, 31.2357456, 12));
  assert.equal(r1.ok, true, JSON.stringify(r1));
  const g = plain(h.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).liveGeo`));
  assert.deepEqual([g.lat, g.lng, g.acc], [30.0444, 31.2357, 12]);
  const r2 = plain(await h.O.shareLocation(id, 30.05, 31.24, 5));
  assert.equal(r2.ok, true); assert.equal(r2.data.throttled, true, 'a second point within 10 s is dropped');
  const bad = plain(h.run(`MP.setLiveGeo(${JSON.stringify(id)}, 'p_demo1', 'x', 31)`));
  assert.equal(bad, false);
  h.run(`MP.advance(${JSON.stringify(id)}, 'arrived')`);
  assert.ok(plain(h.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).liveGeo`)), 'kept on arrival');
  h.run(`MP.advance(${JSON.stringify(id)}, 'started')`);
  assert.equal(plain(h.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).liveGeo || null`)), null, 'cleared once the job starts');
});

test('only the assigned provider may share a position', async () => {
  const { h, id } = seed();
  h.run(`MP.advance(${JSON.stringify(id)}, 'enroute')`);
  const other = plain(h.run(`MP.db().providers.find(p => p.id !== 'p_demo1' && p.status === 'approved').id`));
  h.as('provider', other);
  const r = plain(await h.O.shareLocation(id, 30.04, 31.23));
  assert.equal(r.ok, false);
  assert.equal(plain(h.run(`MP.setLiveGeo(${JSON.stringify(id)}, ${JSON.stringify(other)}, 30.04, 31.23)`)), false);
});

test('scope: the request’s customer sees the live point, a provider not assigned to it never does', () => {
  const db = { serviceRequests: [{ id: 'r1', customerId: 'c1', status: 'enroute', phone: '010', addr: 'x', liveGeo: { lat: 30.04, lng: 31.23, at: '2026-11-21T10:00:00Z' } }],
    assignments: [{ id: 'a1', reqId: 'r1', providerId: 'p1', status: 'accepted' }, { id: 'a2', reqId: 'r1', providerId: 'p2', status: 'withdrawn' }],
    providers: [{ id: 'p1', status: 'approved' }, { id: 'p2', status: 'approved' }], customers: [{ id: 'c1' }, { id: 'c2' }] };
  assert.ok(scopeFor(db, { role: 'customer', id: 'c1' }).serviceRequests[0].liveGeo);
  assert.equal(scopeFor(db, { role: 'customer', id: 'c2' }).serviceRequests.length, 0);
  assert.ok(scopeFor(db, { role: 'provider', id: 'p1' }).serviceRequests[0].liveGeo, 'the assigned provider sees their own point');
  assert.equal(scopeFor(db, { role: 'provider', id: 'p2' }).serviceRequests[0].liveGeo, null);
});

test('customer tracking renders a lazy map card while enroute; live-map module and the SW never cache map tiles', () => {
  const src = fs.readFileSync(path.join(ROOT, 'apps/customer/pages/order-details.page.js'), 'utf8');
  assert.match(src, /data-live-map=/);
  const html = fs.readFileSync(path.join(ROOT, 'apps/customer/index.html'), 'utf8');
  assert.ok(html.includes('pages/live-map.js'));
  const lm = fs.readFileSync(path.join(ROOT, 'apps/customer/pages/live-map.js'), 'utf8');
  assert.match(lm, /HSMap\.view/); { const hm = fs.readFileSync(path.join(ROOT, 'shared/components/hs-map.js'), 'utf8'); assert.match(hm, /tiles\.openfreemap\.org/); assert.match(hm, /OpenStreetMap/); }   // shared fast map, OSM data credited by the style attribution
  const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  assert.match(sw, /url\.origin === location\.origin/, 'only same-origin responses are cached (third-party tiles are not)');
  const ctx = { document: { readyState: 'complete', addEventListener() {} }, setTimeout: () => 0 }; ctx.globalThis = ctx;
  require('node:vm').runInNewContext(lm, ctx);
  const M = ctx.HSLiveMap;
  assert.match(M.noteText(null, null), /لما الفني يشارك موقعه/);
  const at = new Date(Date.now() - 3 * 60000).toISOString();
  assert.match(M.noteText({ lat: 30.0444, lng: 31.2357, at }, { lat: 30.0626, lng: 31.2497 }), /آخر تحديث من 3 دقيقة · على بعد/);
});

/* server path: the real callable code over an in-memory Firestore stand-in */
const service = require(path.join(ROOT, 'functions/src/service.js'));
function memBackend() {
  const docs = new Map(); let auto = 0; const clone = (v) => JSON.parse(JSON.stringify(v));
  const rows = (col) => [...docs].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2).map(([p, d]) => ({ id: p.split('/')[1], data: clone(d) }));
  const match = (r, [f, op, v]) => { const x = f === 'id' ? r.id : r.data[f]; return op === '==' ? x === v : op === 'in' ? v.includes(x) : op === 'array-contains' ? Array.isArray(x) && x.includes(v) : false; };
  const adapter = {
    async get(tx, p) { return docs.has(p) ? clone(docs.get(p)) : null; },
    async query(tx, col, q) { let out = rows(col).filter((r) => (q.where || []).every((w) => match(r, w))); if (q.orderBy) { const [f, dir] = q.orderBy, s = dir === 'desc' ? -1 : 1; out = out.filter((r) => r.data[f] !== undefined).sort((a, b) => (a.data[f] < b.data[f] ? -s : s)); } if (q.limit) out = out.slice(0, q.limit); return out; },
    async count(col, where) { return rows(col).filter((r) => (where || []).every((w) => match(r, w))).length; },
    set(tx, p, d) { docs.set(p, clone(d)); }, del(tx, p) { docs.delete(p); }
  };
  const deleted = [];
  return { docs, deleted, adapter, runTransaction: (fn) => fn({}), async getDoc(p) { return adapter.get(null, p); },
    async setDoc(p, d, merge) { docs.set(p, merge && docs.has(p) ? { ...docs.get(p), ...clone(d) } : clone(d)); },
    async addDoc(col, d) { docs.set(`${col}/auto${++auto}`, clone(d)); }, async deleteDoc(p) { docs.delete(p); },
    async deleteAuthUser(uid) { deleted.push(uid); },
    async queryDocs(col, field, op, value) { return rows(col).filter((x) => (op === 'in' ? value.includes(x.data[field]) : x.data[field] === value)); },
    async signal() {}, env: { bootstrapEmails: ['owner@example.com'] } };
}

test('server: the assigned provider posts the point, no audit row per point; the customer syncs it, another provider does not', async () => {
  const b = memBackend();
  const now = new Date().toISOString();
  b.docs.set('customers/c1', { id: 'c1', name: 'سارة', phone: '01011112222', status: 'active', phoneVerified: true });
  b.docs.set('providers/p1', { id: 'p1', name: 'كريم', phone: '01000000001', status: 'approved', cats: ['electric'], govs: ['القاهرة'], available: true });
  b.docs.set('providers/p2', { id: 'p2', name: 'هاني', phone: '01000000002', status: 'approved', cats: ['electric'], govs: ['القاهرة'], available: true });
  b.docs.set('requests/r1', { id: 'r1', no: 'HS-1', customerId: 'c1', status: 'enroute', cat: 'electric', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1', phone: '01011112222', history: [], createdAt: now });
  b.docs.set('assignments/a1', { id: 'a1', reqId: 'r1', providerId: 'p1', status: 'accepted', at: now });
  b.docs.set('assignments/a2', { id: 'a2', reqId: 'r1', providerId: 'p2', status: 'withdrawn', at: now });
  const P1 = { uid: 'u_p1', token: { phone_number: '+201000000001' } }, P2 = { uid: 'u_p2', token: { phone_number: '+201000000002' } }, C1 = { uid: 'u_c1', token: { phone_number: '+201011112222' } };
  const call = (auth, app, p, body) => service.api(b, { auth, data: { app, method: 'POST', path: p, body }, ip: '1.1.1.1' });
  const r = await call(P1, 'provider', '/requests/r1/location', { lat: 30.0444123, lng: 31.2357456, acc: 9 });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual([b.docs.get('requests/r1').liveGeo.lat, b.docs.get('requests/r1').liveGeo.lng], [30.0444, 31.2357]);
  assert.ok(![...b.docs.entries()].some(([k, d]) => k.startsWith('audit/') && /location/.test(d.path || '')), 'no audit row per point');
  const r2 = await call(P2, 'provider', '/requests/r1/location', { lat: 30, lng: 31 });
  assert.equal(r2.ok, false, 'a provider not assigned to the job is refused');
  const sc = await service.session(b, { auth: C1, data: { op: 'sync', app: 'customer' } });
  assert.ok(sc.db.serviceRequests.find((x) => x.id === 'r1').liveGeo, 'the customer receives the point');
  const sp = await service.session(b, { auth: P2, data: { op: 'sync', app: 'provider' } });
  const seen = (sp.db.serviceRequests || []).find((x) => x.id === 'r1');
  assert.ok(!seen || !seen.liveGeo, 'the other provider never sees it');
});
