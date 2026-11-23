'use strict';
/* Regression tests for the 2026-11-23 security audit (docs/SECURITY_AUDIT_2026-11-23.md): S1, S2. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
  return { docs, adapter, runTransaction: (fn) => fn({}), async getDoc(p) { return adapter.get(null, p); },
    async setDoc(p, d, merge) { docs.set(p, merge && docs.has(p) ? { ...docs.get(p), ...clone(d) } : clone(d)); },
    async addDoc(col, d) { docs.set(`${col}/auto${++auto}`, clone(d)); }, async deleteDoc(p) { docs.delete(p); },
    async queryDocs(col, field, op, value) { return rows(col).filter((x) => (op === 'in' ? value.includes(x.data[field]) : x.data[field] === value)); },
    async signal() {}, env: { bootstrapEmails: [] } };
}
const call = (b, auth, app, method, p, body) => service.api(b, { auth, data: { app, method, path: p, body }, ip: '1.2.3.4' });
const PROVIDER = { uid: 'u_prov', token: { phone_number: '+201022223333' } };
const FORM = { name: 'كريم فتحي', phone: '01022223333', type: 'individual', cats: ['electric'], govs: ['القاهرة'], areas: ['مدينة نصر'], years: 5, bio: 'كهربائي منازل بخبرة خمس سنوات.' };

async function approvedProvider() {
  const b = memBackend();
  const reg = await call(b, PROVIDER, 'provider', 'POST', '/providers/register', FORM);
  assert.equal(reg.ok, true, JSON.stringify(reg.error));
  const key = `providers/${reg.data.id}`;
  b.docs.set(key, { ...b.docs.get(key), status: 'approved' });
  return { b, key };
}

test('S1: an approved provider cannot move the account to another phone number', async () => {
  const { b, key } = await approvedProvider();
  const res = await call(b, PROVIDER, 'provider', 'PATCH', '/providers/me', { phone: '01099998888' });
  assert.equal(res.ok, false); assert.equal(res.status, 409);
  assert.equal(b.docs.get(key).phone, '01022223333', 'the stored phone is unchanged');
  const me = await call(b, PROVIDER, 'provider', 'GET', '/providers/me');
  assert.equal(me.ok, true, 'the provider still resolves by the verified phone');
});

test('S1: the same number in another format is kept in the app format; other fields still edit', async () => {
  const { b, key } = await approvedProvider();
  const res = await call(b, PROVIDER, 'provider', 'PATCH', '/providers/me', { phone: '+20 102 222 3333', bio: 'نبذة جديدة عن الشغل.' });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(b.docs.get(key).phone, '01022223333');
  assert.equal(b.docs.get(key).bio, 'نبذة جديدة عن الشغل.');
  assert.equal((await call(b, PROVIDER, 'provider', 'GET', '/providers/me')).ok, true);
});

test('S2: developer PowerShell scripts are not published by Firebase Hosting', () => {
  const ignore = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting.ignore;
  assert.ok(ignore.includes('**/*.ps1'));
});
