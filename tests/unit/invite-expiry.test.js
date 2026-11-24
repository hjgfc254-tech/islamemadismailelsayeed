'use strict';
/* Security audit S9 (2026-11-24): staff invitations expire after 7 days; re-sending opens a new window. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const wf = require(path.join(ROOT, 'functions/src/workforce.js'));
const DAY = 86400000;
function adapterWith(row) {
  const docs = new Map([['employees/' + row.id, row]]);
  return { docs, async query(tx, col, q) { return [...docs].filter(([p, d]) => p.startsWith(col + '/') && (q.where || []).every(([f, , v]) => d[f] === v)).map(([p, d]) => ({ id: p.split('/')[1], data: JSON.parse(JSON.stringify(d)) })); },
    async get(tx, p) { return docs.get(p) || null; }, set(tx, p, d) { docs.set(p, d); }, del(tx, p) { docs.delete(p); } };
}
const token = { uid: 'u_new', email: 'mona@example.com', email_verified: true };

test('an invitation is accepted within 7 days and refused after', async () => {
  assert.equal(wf.INVITE_TTL_DAYS, 7);
  const now = Date.parse('2026-11-24T12:00:00Z');
  const fresh = { id: 'e9', email: 'mona@example.com', status: 'invited', role: 'ops', inviteAt: new Date(now - 3 * DAY).toISOString(), log: [] };
  const ok = await wf.acceptInvite(adapterWith(fresh), {}, token, now);
  assert.ok(ok && ok.status === 'active' && ok.uid === 'u_new', '3 days old → accepted');
  const old = { ...fresh, inviteAt: new Date(now - 8 * DAY).toISOString() };
  assert.equal(await wf.acceptInvite(adapterWith(old), {}, token, now), null, '8 days old → refused');
});

test('without inviteAt the newest create / invite log entry counts; no date at all is closed', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  const resent = { status: 'invited', log: [{ kind: 'create', at: '2026-10-01T10:00:00Z' }, { kind: 'invite', at: '2026-11-22T10:00:00Z' }] };
  assert.equal(wf.inviteOpen(resent, now), true, 're-sent 2 days ago');
  assert.equal(wf.inviteOpen({ status: 'invited', log: [{ kind: 'create', at: '2026-10-01T10:00:00Z' }] }, now), false);
  assert.equal(wf.inviteOpen({ status: 'invited', log: [] }, now), false);
});

test('create and resend stamp a new window; the admin list says when an invitation expired', () => {
  const src = fs.readFileSync(path.join(ROOT, 'functions/src/workforce.js'), 'utf8');
  assert.match(src, /const next = stampInvite\(made, made\[made\.length - 1\]\.id\);/);
  assert.match(src, /stampInvite\(d\.INV\.resendInvite\(st\.employees, target\.id\), target\.id\)/);
  assert.match(src, /okEnv\(\{ items: withInviteState\(st\.employees\) \}\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'apps/admin/pages/workforce.page.js'), 'utf8'), /الدعوة انتهت \(صالحة 7 أيام\)/);
});
