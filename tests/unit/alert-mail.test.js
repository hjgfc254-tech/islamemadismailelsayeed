'use strict';
/* Critical Tech Center alerts by e-mail (functions/src/alert-mail.js): only critical / «clock not running» alerts,
   recipients from the digest owner / tech teams or ADMIN_BOOTSTRAP_EMAILS, one e-mail per key per hour (Firestore),
   quiet skip with a single log line when no mail transport is configured. The mailer is faked. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const mail = require(path.join(ROOT, 'functions/src/alert-mail.js'));
const tech = require(path.join(ROOT, 'functions/src/tech-status.js'));
const usage = require(path.join(ROOT, 'functions/src/usage.js'));
const adapterMod = require(path.join(ROOT, 'functions/src/alerts-adapter.js'));

function memBackend(extra = {}) {
  const docs = new Map(); const clone = (v) => JSON.parse(JSON.stringify(v)); let auto = 0;
  const rows = (col) => [...docs].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2).map(([p, d]) => ({ id: p.split('/')[1], data: clone(d) }));
  const adapter = { async get(tx, p) { return docs.has(p) ? clone(docs.get(p)) : null; }, async query(tx, col) { return rows(col); }, set(tx, p, d) { docs.set(p, clone(d)); }, del(tx, p) { docs.delete(p); } };
  return { docs, adapter, runTransaction: (fn) => fn({}), async getDoc(p) { return adapter.get(null, p); },
    async setDoc(p, d, merge) { docs.set(p, merge && docs.has(p) ? { ...docs.get(p), ...clone(d) } : clone(d)); },
    async addDoc(col, d) { docs.set(`${col}/auto${++auto}`, clone(d)); },
    async queryDocs(col, field, op, value) { return rows(col).filter((x) => (op === 'in' ? value.includes(x.data[field]) : x.data[field] === value)); },
    env: { bootstrapEmails: [] }, ...extra };
}
function fakeMailer(configured = true) {
  const sent = [];
  return { sent, isEmail: require(path.join(ROOT, 'functions/src/mailer.js')).isEmail,
    status: () => (configured ? { transport: 'resend', configured: true, missing: [] } : { transport: null, configured: false, missing: ['RESEND_API_KEY + MAIL_FROM'] }),
    async send(msg) { sent.push(msg); return { ok: true, transport: 'resend', id: 'm' + sent.length }; } };
}
const CRIT = { key: 'health:firestore', level: 'critical', text: 'قاعدة البيانات مش بترد', link: 'apps/admin/index.html#/tech' };
const SLOW = { key: 'slow:rtdb', level: 'normal', text: 'بطيئة', link: '' };
const CLOCK = { key: 'clock:offers', level: 'normal', text: 'ساعة جولات العروض ما اشتغلتش', link: '' };

test('only critical alerts and «clock not running» are e-mail worthy', () => {
  assert.equal(mail.mailWorthy(CRIT), true);
  assert.equal(mail.mailWorthy(CLOCK), true);
  assert.equal(mail.mailWorthy(SLOW), false);
  assert.equal(mail.mailWorthy({ key: 'clock:offers:fail', level: 'normal' }), false);
});

test('sends to the owner / tech digest recipients, once per key per hour (stored in Firestore)', async () => {
  const b = memBackend(), m = fakeMailer(), H = 3600000, now = 500 * H;
  b.docs.set('admins/o', { status: 'active', role: 'owner', email: 'Owner@Example.com' });
  b.docs.set('admins/t', { status: 'active', role: 'tech', email: 'tech@example.com' });
  b.docs.set('admins/f', { status: 'active', role: 'finance', email: 'fin@example.com' });
  b.docs.set('digestPrefs/t', { off: true });   // the digest opt-out does not silence critical alerts
  b.docs.set('system/digest', { extraRecipients: [{ email: 'oncall@example.com', team: 'tech' }, { email: 'ops@example.com', team: 'ops' }] });
  const r1 = await mail.mailAlerts(b, [CRIT, SLOW, CLOCK], now, { mailer: m });
  assert.equal(r1.sent, 2); assert.equal(m.sent.length, 2);
  assert.deepEqual(m.sent[0].to.slice().sort(), ['oncall@example.com', 'owner@example.com', 'tech@example.com']);
  assert.match(m.sent[0].subject, /تنبيه حرج/); assert.ok(m.sent[0].html.includes('dir="rtl"') && m.sent[0].text.includes(CRIT.text));
  assert.ok(b.docs.get('system/alertMail').sent['health:firestore'] === now, 'dedupe state kept in Firestore');
  const r2 = await mail.mailAlerts(b, [CRIT], now + 30 * 60000, { mailer: m });
  assert.equal(r2.sent, 0); assert.equal(m.sent.length, 2, 'the same key 30 minutes later is not mailed again');
  const r3 = await mail.mailAlerts(b, [CRIT], now + H, { mailer: m });
  assert.equal(r3.sent, 1, 'after an hour the same key may be mailed again');
});

test('falls back to ADMIN_BOOTSTRAP_EMAILS when there are no digest recipients', async () => {
  const b = memBackend({ env: { bootstrapEmails: ['boss@example.com', 'not-an-email'] } }), m = fakeMailer();
  const r = await mail.mailAlerts(b, [CRIT], Date.now(), { mailer: m });
  assert.equal(r.sent, 1); assert.deepEqual(m.sent[0].to, ['boss@example.com']);
});

test('no mail credentials: skips quietly and logs once', async () => {
  mail._resetWarned();
  const b = memBackend({ env: { bootstrapEmails: ['boss@example.com'] } }), m = fakeMailer(false), logs = [];
  const deps = { mailer: m, log: (s) => logs.push(s) };
  const r = await mail.mailAlerts(b, [CRIT], Date.now(), deps);
  await mail.mailAlerts(b, [CRIT], Date.now() + 2 * 3600000, deps);
  assert.equal(r.sent, 0); assert.equal(r.reason, 'transport-missing'); assert.equal(m.sent.length, 0);
  assert.equal(logs.length, 1, 'logged once per instance'); assert.ok(!b.docs.has('system/alertMail'), 'nothing claimed');
  mail._resetWarned();
});

test('healthTick e-mails a critical health alert through the faked mailer', async () => {
  const b = memBackend({ ping: async () => { throw new Error('down'); }, env: { bootstrapEmails: ['boss@example.com'] } }), m = fakeMailer();
  usage._reset(); tech._resetCache();
  const orig = adapterMod.notifyTeam; adapterMod.notifyTeam = async () => {};
  try {
    const now = Date.now();
    const r1 = await tech.healthTick(b, now, { mailer: m });
    assert.ok(r1.mailed >= 1 && m.sent.length === r1.mailed);
    assert.ok(m.sent.every((x) => x.to[0] === 'boss@example.com' && /تنبيه حرج/.test(x.subject)));
    const n = m.sent.length;
    await tech.healthTick(b, now + 60000, { mailer: m });
    assert.equal(m.sent.length, n, 'one minute later: no new e-mail');
  } finally { adapterMod.notifyTeam = orig; }
});
