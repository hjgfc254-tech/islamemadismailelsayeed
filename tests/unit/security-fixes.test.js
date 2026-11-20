'use strict';
/* Regression tests for the 2026-11-20 security review (H1, M1, M2, L1, L2, L3). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
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
const call = (b, auth, app, method, p, body, ip) => service.api(b, { auth, data: { app, method, path: p, body }, ip });
const REQ = { cat: 'electric', serviceName: 'إصلاح', desc: 'الكهرباء مقطوعة في المطبخ', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع 1' };
const QUICK = { uid: 'u_attacker', token: { firebase: { sign_in_provider: 'anonymous' } } };
const VICTIM = { uid: 'u_victim', token: { phone_number: '+201011112222' } };

test('H1: an unverified quick account that registered someone else’s number loses it when the real owner verifies by SMS', async () => {
  const b = memBackend();
  await service.session(b, { auth: QUICK, data: { op: 'registerCustomer', name: 'مهاجم', phone: '01011112222' } });
  await service.session(b, { auth: VICTIM, data: { op: 'registerCustomer', name: 'الضحية' } });
  const cust = [...b.docs.entries()].find(([p, d]) => p.startsWith('customers/') && d.phone === '01011112222')[1];
  assert.equal(cust.uid, 'u_victim'); assert.equal(cust.phoneVerified, true);
  assert.ok(b.deleted.includes('u_attacker'), 'the squatting sign-in account is removed');
  assert.equal(b.docs.has('users/u_attacker'), false);
  const r = await call(b, VICTIM, 'customer', 'POST', '/requests', REQ);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  const s = await service.session(b, { auth: QUICK, data: { op: 'sync', app: 'customer' } });
  assert.ok(!(s.db.serviceRequests || []).some((x) => x.id === r.data.id), 'the attacker no longer sees the victim’s request');
});

test('M1: an unverified account keeps at most 3 open requests', async () => {
  const b = memBackend();
  await service.session(b, { auth: QUICK, data: { op: 'registerCustomer', name: 'سريع', phone: '01033334444' } });
  for (let i = 0; i < 3; i++) assert.equal((await call(b, QUICK, 'customer', 'POST', '/requests', REQ)).ok, true);
  const fourth = await call(b, QUICK, 'customer', 'POST', '/requests', REQ);
  assert.equal(fourth.ok, false); assert.equal(fourth.status, 409); assert.match(fourth.error.message, /كود SMS/);
});

test('M2: provider registration needs an SMS-verified phone; anonymous writes are limited per IP, not one shared bucket', async () => {
  const b = memBackend();
  const form = { name: 'كريم فتحي', phone: '01000000000', type: 'individual', cats: ['electric'], govs: ['القاهرة'], areas: ['مدينة نصر'], years: 5, bio: 'كهربائي منازل بخبرة خمس سنوات.' };
  const anon = await call(b, null, 'provider', 'POST', '/providers/register', form, '1.2.3.4');
  assert.equal(anon.status, 401);
  assert.ok([...b.docs.keys()].some((k) => k === 'rateLimits/anon_1.2.3.4'), 'rate limit key is per IP');
});

test('L3: maintenance also stops new customer sign-ups', async () => {
  const b = memBackend();
  b.docs.set('system/settings', { controls: { maintenance: { on: true } } });
  await assert.rejects(service.session(b, { auth: VICTIM, data: { op: 'registerCustomer', name: 'سارة' } }), /صيانة/);
});

test('L1 / L2: CSV cells cannot start a formula; Arabic-Indic phone digits are scrubbed', () => {
  const I = require(path.join(ROOT, 'apps/admin/pages/insights.page.js'));
  const csv = I.toCsv([['=HYPERLINK("x")', '-5', '+20', '@a']]);
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"x\"\")\"") || csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes(',-5,'), 'plain negative numbers stay numbers');
  assert.ok(csv.includes("'+20") && csv.includes("'@a"));
  const t = require(path.join(ROOT, 'functions/src/telemetry.js'));
  assert.ok(!t.scrub('رقمي ٠١٠١٢٣٤٥٦٧٨', 200).includes('٠١٠١٢٣٤٥٦٧٨'));
});
