'use strict';
/* Support contacts managed from the Admin Center (public settings.support) and the owner-only admin data policy. */
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
  return { docs, adapter, runTransaction: (fn) => fn({}), async getDoc(p) { return adapter.get(null, p); },
    async setDoc(p, d, merge) { docs.set(p, merge && docs.has(p) ? { ...docs.get(p), ...clone(d) } : clone(d)); },
    async addDoc(col, d) { docs.set(`${col}/auto${++auto}`, clone(d)); }, async deleteDoc(p) { docs.delete(p); },
    async queryDocs(col, field, op, value) { return rows(col).filter((x) => (op === 'in' ? value.includes(x.data[field]) : x.data[field] === value)); },
    async signal() {}, env: { bootstrapEmails: ['owner@example.com'] } };
}
const OWNER = { uid: 'u_owner', token: { email: 'owner@example.com', email_verified: true } };
const SUP = { uid: 'u_sup', token: { email: 's@x.com', email_verified: true } };
const MGR = { uid: 'u_mgr', token: { email: 'm@x.com', email_verified: true } };
const SARA = { uid: 'u_sara', token: { phone_number: '+201011112222' } };
const call = (b, auth, app, method, p, body) => service.api(b, { auth, data: { app, method, path: p, body } });
async function setup() {
  const b = memBackend();
  await service.session(b, { auth: OWNER, data: { op: 'claimOwner', name: 'المالك' } });
  await service.session(b, { auth: OWNER, data: { op: 'adminCode', action: 'set', code: '24681357' } });
  b.docs.set('admins/u_sup', { status: 'active', role: 'support', name: 'دعم', employeeId: 'e2', codeHash: 'x', unlockedUntil: 9e15 });
  b.docs.set('admins/u_mgr', { status: 'active', role: 'admin', name: 'مدير', employeeId: 'e3', codeHash: 'x', unlockedUntil: 9e15 });
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  return b;
}

test('support contacts: owner / manager save validated fields; customers receive them in the public settings', async () => {
  const b = await setup();
  const bad = await call(b, OWNER, 'admin', 'PATCH', '/admin/support-contacts', { phone: '123', whatsapp: '0201', email: 'x@' });
  assert.equal(bad.status, 422); assert.ok(bad.error.details.phone && bad.error.details.whatsapp && bad.error.details.email);
  const sup = await call(b, SUP, 'admin', 'PATCH', '/admin/support-contacts', { phone: '19999' });
  assert.equal(sup.status, 403, 'support rank cannot change the public numbers');
  const ok = await call(b, MGR, 'admin', 'PATCH', '/admin/support-contacts', { phone: '١٩٩٩٩', whatsapp: '+20 101 111 2222', email: 'Help@Hansalahlak.com', hours: 'يوميًا ٩ص – ١٠م <b>' });
  assert.equal(ok.ok, true, JSON.stringify(ok.error));
  assert.deepEqual(ok.data, { phone: '19999', whatsapp: '01011112222', email: 'help@hansalahlak.com', hours: 'يوميًا ٩ص – ١٠م b' });
  const s = await service.session(b, { auth: SARA, data: { op: 'sync', app: 'customer' } });
  assert.deepEqual(s.db.settings.support, ok.data);
  const anon = await service.session(b, { auth: null, data: { op: 'sync', app: 'customer' } });
  assert.equal(anon.db.settings.support.phone, '19999', 'guests see the support numbers too');
});

test('data policy: owner only; when on, a support admin sees masked customer phones and no transactions', async () => {
  const b = await setup();
  assert.equal((await call(b, SUP, 'admin', 'POST', '/admin/data-policy', { minimal: true })).status, 403);
  assert.equal((await call(b, MGR, 'admin', 'POST', '/admin/data-policy', { minimal: true })).status, 403, 'manager cannot either');
  assert.equal((await call(b, OWNER, 'admin', 'POST', '/admin/data-policy', { minimal: 'yes' })).status, 422);
  let sync = await service.session(b, { auth: SUP, data: { op: 'sync', app: 'admin' } });
  assert.equal(sync.db.customers.find((c) => c.name === 'سارة').phone, '01011112222', 'off by default');
  const on = await call(b, OWNER, 'admin', 'POST', '/admin/data-policy', { minimal: true });
  assert.equal(on.ok, true); assert.equal(on.data.minimal, true);
  assert.ok([...b.docs.values()].some((d) => d.path === '/admin/data-policy'), 'the change is audited');
  sync = await service.session(b, { auth: SUP, data: { op: 'sync', app: 'admin' } });
  assert.equal(sync.db.customers.find((c) => c.name === 'سارة').phone, '010•••••222');
  assert.deepEqual(sync.db.transactions, []);
  const own = await service.session(b, { auth: OWNER, data: { op: 'sync', app: 'admin' } });
  assert.equal(own.db.customers.find((c) => c.name === 'سارة').phone, '01011112222', 'the owner still sees everything');
  assert.equal((await call(b, SUP, 'admin', 'GET', '/admin/data-policy')).data.minimal, true);
  await call(b, OWNER, 'admin', 'POST', '/admin/data-policy', { minimal: false });
  sync = await service.session(b, { auth: SUP, data: { op: 'sync', app: 'admin' } });
  assert.equal(sync.db.customers.find((c) => c.name === 'سارة').phone, '01011112222');
});

test('client helper shows only the channels that are set, WhatsApp prefilled with the order number', () => {
  const SC = require(path.join(ROOT, 'shared/components/support-contacts.js'));
  assert.equal(SC.html({ settings: {} }), '', 'nothing set → no contact block (no fake numbers)');
  const h = SC.html({ settings: { support: { whatsapp: '01011112222', email: 'bad' } }, orderNo: 'HS-2026-1001' });
  assert.ok(h.includes('https://wa.me/201011112222?text=') && h.includes(encodeURIComponent('HS-2026-1001')));
  assert.ok(!h.includes('tel:') && !h.includes('mailto:'), 'unset / invalid channels are not shown');
});
