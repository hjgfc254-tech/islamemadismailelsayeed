'use strict';
/* Regression tests for the round-2 security review (2026-11-20). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const service = require(path.join(ROOT, 'functions/src/service.js'));
const scope = require(path.join(ROOT, 'functions/src/scope.js'));
const { boot, plain } = require('../helpers/domain-harness.js');

/* in-memory backend whose reads yield (calls interleave like the network) and whose transactions are serialised like
   Firestore's (one at a time) */
function memBackend() {
  const docs = new Map(); let auto = 0; let chain = Promise.resolve();
  const clone = (v) => JSON.parse(JSON.stringify(v)); const tick = () => new Promise((r) => setImmediate(r));
  const rows = (col) => [...docs].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2).map(([p, d]) => ({ id: p.split('/')[1], data: clone(d) }));
  const adapter = {
    async get(tx, p) { await tick(); return docs.has(p) ? clone(docs.get(p)) : null; },
    async query(tx, col, q) { await tick(); let out = rows(col); if (q.limit) out = out.slice(0, q.limit); return out; },
    async count() { return 0; }, set(tx, p, d) { docs.set(p, clone(d)); }, del(tx, p) { docs.delete(p); }
  };
  return { docs, adapter,
    runTransaction(fn) { const run = chain.then(() => fn({})); chain = run.catch(() => {}); return run; },
    async getDoc(p) { return adapter.get(null, p); },
    async setDoc(p, d, merge) { await tick(); docs.set(p, merge && docs.has(p) ? { ...docs.get(p), ...clone(d) } : clone(d)); },
    async addDoc(col, d) { docs.set(`${col}/auto${++auto}`, clone(d)); }, async deleteDoc(p) { docs.delete(p); },
    async queryDocs(col, field, op, value) { return rows(col).filter((x) => x.data[field] === value); }, async signal() {}, env: { bootstrapEmails: ['owner@example.com'] } };
}
const OWNER = { uid: 'u_owner', token: { email: 'owner@example.com', email_verified: true } };
const ses = (b, data) => service.session(b, { auth: OWNER, data }).then((r) => ({ ok: true, r }), (e) => ({ ok: false, msg: e.message }));

test('access code: 20 parallel wrong guesses still lock the account after 5 (no counter race)', async () => {
  const b = memBackend();
  await ses(b, { op: 'claimOwner', name: 'المالك' });
  await ses(b, { op: 'adminCode', action: 'set', code: '24681357' });
  await ses(b, { op: 'adminCode', action: 'lock' });
  const res = await Promise.all(Array.from({ length: 20 }, () => ses(b, { op: 'adminCode', action: 'unlock', code: '99990000' })));
  const audits = [...b.docs.values()].filter((d) => d.action === 'admin.code.unlock');
  assert.ok(audits.filter((d) => d.status === 'failed').length <= 4, 'at most 4 plain failures before the lock');
  assert.equal(audits.filter((d) => d.status === 'locked').length, 1, 'locked exactly once');
  assert.ok(+b.docs.get('admins/u_owner').codeLockUntil > Date.now());
  assert.ok(res.filter((x) => /مقفول/.test(x.msg || '')).length >= 15);
  const right = await ses(b, { op: 'adminCode', action: 'unlock', code: '24681357' });
  assert.equal(right.ok, false, 'even the right code waits for the lock');
});

function seedSelf() {
  const h = boot();
  h.run(`(() => { const s = MP.db().settings; s.autoAssign = false;
    const base = MP.db().providers.find(p => p.status === 'approved' && p.cats.includes('electric') && p.govs.includes('القاهرة'));
    MP.db().providers.push({ ...base, id: 'p_self', name: 'نفس الرقم', phone: '01011112222', available: true }); })()`);
  const id = h.run(`MP.createRequest({ name: 'سارة', phone: '01011112222', cat: 'electric', serviceName: 'x', desc: 'وصف طويل كفاية', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' }).id`);
  return { h, id };
}

test('self-dealing: a provider is never matched with, assigned to or accepting a request from their own phone', () => {
  const { h, id } = seedSelf();
  const as = plain(h.run(`MP.assign(${JSON.stringify(id)}, 'p_self')`));
  assert.equal(as.ok, false); assert.match(as.msg, /صاحب الطلب/);
  for (let i = 0; i < 6; i++) { const a = plain(h.run(`MP.assign(${JSON.stringify(id)})`)); if (a && a.provider) assert.notEqual(a.provider.id, 'p_self'); h.run(`MP.db().assignments.forEach(x => { if (x.reqId === ${JSON.stringify(id)}) x.status = 'rejected'; }); MP.get('serviceRequests', ${JSON.stringify(id)}).status = 'searching'`); }
  /* even if an offer exists (older data), accepting it is refused */
  h.run(`MP.db().assignments.push({ id: 'a_x', reqId: ${JSON.stringify(id)}, providerId: 'p_self', status: 'offered', at: new Date().toISOString() })`);
  assert.equal(plain(h.run(`MP.respond(${JSON.stringify(id)}, true)`)), false);
});

test('cash confirmation: each side answers once (no flipping after the bonus was counted)', () => {
  const h = boot();
  const id = h.run(`(() => { const r = MP.createRequest({ name: 'س', phone: '01011112222', cat: 'electric', serviceName: 'x', desc: 'وصف طويل كفاية', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش' });
    MP.assign(r.id, 'p_demo1'); MP.respond(r.id, true); MP.confirmTime(r.id, 'provider'); ['enroute', 'arrived', 'started'].forEach(s => MP.advance(r.id, s)); MP.complete(r.id, 300); return r.id; })()`);
  assert.equal(plain(h.run(`MP.cashConfirm(${JSON.stringify(id)}, 'customer', true)`)), true);
  assert.equal(plain(h.run(`MP.cashConfirm(${JSON.stringify(id)}, 'customer', false)`)), false);
  assert.equal(plain(h.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).cash.customer`)), true);
});

test('AI classification: per-IP daily cap on top of the per-account quota', () => {
  const ip = '203.0.113.' + Math.floor(Math.random() * 200);
  let allowed = 0; for (let i = 0; i < service.AI_IP_DAILY + 5; i++) if (service.aiIpAllow(ip)) allowed++;
  assert.equal(allowed, service.AI_IP_DAILY);
});

test('M3 policy is OFF by default; «minimal» masks phones / addresses / money for low admin ranks only', () => {
  const db = { settings: {}, customers: [{ id: 'c1', phone: '01011112222', email: 'a@b.c' }], serviceRequests: [{ id: 'r1', phone: '01011112222', addr: 'ش 1', geo: { lat: 1 } }], addresses: [{ id: 'x' }], transactions: [{ id: 't' }] };
  assert.equal(scope.scopeFor(db, { role: 'admin', adminRole: 'support' }).customers[0].phone, '01011112222', 'default: unchanged');
  db.settings.adminDataPolicy = 'minimal';
  const sup = scope.scopeFor(db, { role: 'admin', adminRole: 'support' });
  assert.equal(sup.customers[0].phone, '010•••••222'); assert.equal(sup.serviceRequests[0].addr, '•••'); assert.equal(sup.addresses.length, 0); assert.equal(sup.transactions.length, 0);
  assert.equal(scope.scopeFor(db, { role: 'admin', adminRole: 'finance' }).transactions.length, 1);
  assert.equal(scope.scopeFor(db, { role: 'admin', adminRole: 'owner' }).customers[0].phone, '01011112222');
});
