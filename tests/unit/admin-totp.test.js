'use strict';
/* Two-step verification for admins (functions/src/admin-code.js): RFC 6238 TOTP with Node crypto, enrollment through
   the session op `adminCode`, the app code required at unlock / code change, replay refused, the secret never returned
   after enabling, and the owner reset for a lost phone. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const service = require(path.join(ROOT, 'functions/src/service.js'));
const code = require(path.join(ROOT, 'functions/src/admin-code.js'));

test('TOTP matches the RFC 6238 SHA-1 test vectors (8 digits) and base32 round-trips', () => {
  const key = Buffer.from('12345678901234567890', 'ascii');
  const vectors = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']];
  for (const [t, want] of vectors) assert.equal(code.totpAt(key, t * 1000, 8), want, 'T=' + t);
  assert.equal(code.base32Encode(key), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual(code.base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), key);
  /* ±1 step window, 6 digits, a used step (or older) is refused */
  const b32 = code.base32Encode(key), now = 1111111111 * 1000, step = Math.floor(now / 30000);
  const six = (ms) => code.totpAt(key, ms);
  assert.equal(code.totpMatch(b32, six(now), now), step);
  assert.equal(code.totpMatch(b32, six(now - 30000), now), step - 1);
  assert.equal(code.totpMatch(b32, six(now + 30000), now), step + 1);
  assert.equal(code.totpMatch(b32, six(now - 90000), now), -1, 'outside the window');
  assert.equal(code.totpMatch(b32, six(now), now, step), -1, 'replay of the same step');
  assert.equal(code.totpMatch(b32, 'abcdef', now), -1);
});

function memBackend() {
  const docs = new Map(); let auto = 0; const clone = (v) => JSON.parse(JSON.stringify(v));
  const rows = (col) => [...docs].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2).map(([p, d]) => ({ id: p.split('/')[1], data: clone(d) }));
  const match = (r, [f, op, v]) => { const x = f === 'id' ? r.id : r.data[f]; return op === '==' ? x === v : op === 'in' ? v.includes(x) : op === 'array-contains' ? Array.isArray(x) && x.includes(v) : false; };
  const adapter = {
    async get(tx, p) { return docs.has(p) ? clone(docs.get(p)) : null; },
    async query(tx, col, q) { let out = rows(col).filter((r) => (q.where || []).every((w) => match(r, w))); if (q.limit) out = out.slice(0, q.limit); return out; },
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
const ses = (b, auth, data) => service.session(b, { auth, data: { op: 'adminCode', ...data } });
const call = (b, auth, method, p) => service.api(b, { auth, data: { app: 'admin', method, path: p, body: {} } });
const appCode = (secret, ms = Date.now()) => code.totpAt(code.base32Decode(secret), ms);

test('setup → enable → unlock needs the app code → replay refused → disable; the secret never comes back', async () => {
  const b = memBackend();
  await service.session(b, { auth: OWNER, data: { op: 'claimOwner', name: 'المالك' } });
  await ses(b, OWNER, { action: 'set', code: '24681357' });
  assert.equal((await ses(b, OWNER, { action: 'totpStatus' })).on, false);

  const s = await ses(b, OWNER, { action: 'totpSetup' });
  assert.match(s.secret, /^[A-Z2-7]{32}$/, '20 random bytes in base32');
  assert.ok(s.otpauth.startsWith('otpauth://totp/Hansalehlak:owner%40example.com?secret=' + s.secret + '&issuer=Hansalehlak'));
  await assert.rejects(ses(b, OWNER, { action: 'totpEnable', code: '000000' }), /كود التطبيق غلط/);
  assert.equal(b.docs.get('admins/u_owner').totpOn, undefined, 'a wrong code does not enable');
  const now = Date.now();
  const on = await ses(b, OWNER, { action: 'totpEnable', code: appCode(s.secret, now) });
  assert.deepEqual(on, { ok: true, on: true });
  const doc = b.docs.get('admins/u_owner');
  assert.equal(doc.totpSecret, s.secret); assert.equal(doc.totpPending, null);

  const seen = [];
  const watch = async (p) => { const r = await p; seen.push(JSON.stringify(r)); return r; };
  assert.equal((await watch(ses(b, OWNER, { action: 'totpStatus' }))).on, true);
  await assert.rejects(ses(b, OWNER, { action: 'totpSetup' }), /شغّال بالفعل/, 'no second secret while on');
  const sync = await watch(service.session(b, { auth: OWNER, data: { op: 'sync', app: 'admin' } }));
  const list = await watch(call(b, OWNER, 'GET', '/admin/security/admins'));
  assert.equal(list.data.items.find((u) => u.uid === 'u_owner').totpOn, true);
  assert.ok(sync);

  /* unlock: the 8-digit code alone is no longer enough */
  await ses(b, OWNER, { action: 'lock' });
  const gate = (await watch(service.session(b, { auth: OWNER, data: { op: 'sync', app: 'admin' } }))).adminGate;
  assert.equal(gate.totp, true, 'the dialog knows to ask for the app code');
  await assert.rejects(ses(b, OWNER, { action: 'unlock', code: '24681357' }), (e) => e.details && e.details.reason === 'TOTP_REQUIRED');
  await assert.rejects(ses(b, OWNER, { action: 'unlock', code: '99990000', totp: '123456' }), /الكود غلط/, 'the 8-digit code is still checked first');
  await assert.rejects(ses(b, OWNER, { action: 'set', code: '13572468', current: '24681357' }), (e) => e.details && e.details.reason === 'TOTP_REQUIRED', 'changing the code (which unlocks) needs the app code too');
  /* the step used at enabling cannot be reused; the next one opens (a fake clock walks the 30-second steps) */
  await assert.rejects(ses(b, OWNER, { action: 'unlock', code: '24681357', totp: appCode(s.secret, now) }), /كود التطبيق غلط أو اتستخدم/);
  const realNow = Date.now; let clock = now; Date.now = () => clock;
  let off;
  try {
    clock = now + 30000;
    const ok = await watch(ses(b, OWNER, { action: 'unlock', code: '24681357', totp: appCode(s.secret, clock) }));
    assert.equal(ok.ok, true);
    await ses(b, OWNER, { action: 'lock' });
    await assert.rejects(ses(b, OWNER, { action: 'unlock', code: '24681357', totp: appCode(s.secret, clock) }), /اتستخدم/, 'replay of the same time-step is refused');
    assert.equal(b.docs.get('admins/u_owner').codeFails, 1, 'a replayed app code counts toward the lock');
    clock += 30000;
    await ses(b, OWNER, { action: 'unlock', code: '24681357', totp: appCode(s.secret, clock) });
    /* disable needs a valid, unused app code */
    await assert.rejects(ses(b, OWNER, { action: 'totpDisable', code: '000000' }), /كود التطبيق غلط/);
    await assert.rejects(ses(b, OWNER, { action: 'totpDisable', code: appCode(s.secret, clock) }), /كود التطبيق غلط أو اتستخدم/, 'the step just used to unlock');
    clock += 30000;
    off = await watch(ses(b, OWNER, { action: 'totpDisable', code: appCode(s.secret, clock) }));
  } finally { Date.now = realNow; }
  assert.deepEqual(off, { ok: true, on: false });
  assert.equal(b.docs.get('admins/u_owner').totpSecret, null, 'secret wiped on disable');
  await ses(b, OWNER, { action: 'lock' });
  assert.equal((await ses(b, OWNER, { action: 'unlock', code: '24681357' })).ok, true, 'back to the code alone');

  for (const r of seen) assert.ok(!r.includes(s.secret), 'the secret is never in a response after enabling');
  const audit = [...b.docs.values()].map((d) => String(d.action || ''));
  for (const a of ['admin.totp.setup', 'admin.totp.enable', 'admin.totp.disable']) assert.ok(audit.includes(a), a + ' audited');
});

test('owner turns off an employee 2FA (lost phone), never their own; staff cannot', async () => {
  const b = memBackend();
  await service.session(b, { auth: OWNER, data: { op: 'claimOwner', name: 'المالك' } });
  await ses(b, OWNER, { action: 'set', code: '24681357' });
  b.docs.set('admins/u_sup', { status: 'active', role: 'support', name: 'دعم', employeeId: 'e2' });
  await ses(b, SUP, { action: 'set', code: '86420975' });
  const s = await ses(b, SUP, { action: 'totpSetup' });
  await ses(b, SUP, { action: 'totpEnable', code: appCode(s.secret) });
  assert.equal((await call(b, SUP, 'POST', '/admin/security/reset-totp/u_owner')).ok, false, 'staff cannot reset');
  assert.equal((await call(b, OWNER, 'POST', '/admin/security/reset-totp/u_owner')).ok, false, 'not on the owner self');
  const r = await call(b, OWNER, 'POST', '/admin/security/reset-totp/u_sup');
  assert.equal(r.ok, true, JSON.stringify(r.error));
  const doc = b.docs.get('admins/u_sup');
  assert.equal(doc.totpOn, false); assert.equal(doc.totpSecret, null);
  await ses(b, SUP, { action: 'lock' });
  assert.equal((await ses(b, SUP, { action: 'unlock', code: '86420975' })).ok, true, 'signs in with the 8-digit code and can enroll again');
});

test('setup and enable require an unlocked console', async () => {
  const b = memBackend();
  await service.session(b, { auth: OWNER, data: { op: 'claimOwner', name: 'المالك' } });
  await assert.rejects(ses(b, OWNER, { action: 'totpSetup' }), /كود الدخول/);
  await ses(b, OWNER, { action: 'set', code: '24681357' });
  await ses(b, OWNER, { action: 'lock' });
  await assert.rejects(ses(b, OWNER, { action: 'totpSetup' }), /كود الدخول/);
});
