'use strict';
/* Provider bonus (round 11): tiers from the admin (priority in offers + lower platform share on the provider's offers and
   on classic completion), a weekly cash target, anti-farming rules (customer-confirmed cash, distinct customers, a
   dispute is a strike), all numbers from the admin and off by default. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, plain } = require('../helpers/domain-harness.js');

const BONUS = { on: true, windowDays: 30, tiers: [
  { id: 'silver', name: 'فضي', minJobs: 2, minRating: 0, maxStrikes: 1, rateOff: 3 },
  { id: 'gold', name: 'ذهبي', minJobs: 3, minRating: 0, maxStrikes: 0, rateOff: 6 } ], weekly: { on: true, target: 3, amount: 150 } };

/* one finished, cash-confirmed job for customer `n` with provider P (offers round off: admin assignment) */
async function job(t, P, n, { confirm = true, dispute = false } = {}) {
  const who = { name: 'عميل ' + n, phone: '0101111' + String(1000 + n).slice(-4) };
  t.as('customer', who);
  const id = (await t.O.create({ cat: 'electric', serviceName: 'كهرباء', desc: 'd', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش' })).data.id;
  t.as('admin', 'e_owner'); assert.equal((await t.A.assign(id, P)).ok, true);
  t.as('provider', P); await t.O.respond(id, true); await t.O.schedule(id);
  for (const to of ['enroute', 'arrived', 'started']) await t.O.advance(id, to);
  assert.equal((await t.O.complete(id, 400)).ok, true);
  if (dispute) { await t.O.cash(id, false); t.as('customer', who); await t.O.cash(id, true); }
  else if (confirm) { t.as('customer', who); assert.equal((await t.O.cash(id, true)).ok, true); }
  return id;
}

test('bonus is off by default: no tiers, no change to the platform share or matching', async () => {
  const t = boot();
  assert.equal(t.run(`MP.tierOf('p_demo1')`), null);
  assert.equal(t.run(`MP.rateCut('p_demo1')`), 0);
  t.as('admin', 'e_owner'); const m = plain((await t.A.marketing()).data.bonus);
  assert.deepEqual(m, { on: false, windowDays: 30, tiers: [], weekly: { on: false, target: 0, amount: 0 } });
});

test('tiers: distinct confirmed customers raise the tier; the tier lowers the platform share and goes first in offers', async () => {
  const t = boot();
  t.as('admin', 'e_owner'); assert.equal((await t.A.saveMarketing({ bonus: BONUS })).ok, true);
  const P = 'p_demo1', rate0 = t.run(`MP.rateFor('electric', 'p_demo1')`);
  await job(t, P, 1);
  await job(t, P, 1);                                   // the same customer again does not count twice
  assert.equal(t.run(`MP.bonusStats('p_demo1').jobs`), 1);
  await job(t, P, 2, { confirm: false });                // not confirmed by the customer → not counted
  assert.equal(t.run(`MP.tierOf('p_demo1')`), null);
  await job(t, P, 3);
  assert.equal(t.run(`MP.tierOf('p_demo1').id`), 'silver');
  assert.equal(t.run(`MP.get('providers', 'p_demo1').tier`), 'silver', 'stored on the provider (no extra reads on the server)');
  assert.equal(t.run(`MP.rateFor('electric', 'p_demo1')`), Math.max(0, rate0 - 3), 'classic completion: lower share');
  assert.ok(t.run(`MP.db().notifications.some(n => n.to === 'provider:p_demo1' && /فضي/.test(n.text))`), 'told about the new tier');
  /* offers: a tiered provider is invited first and their customer price is lower for the same base */
  const other = t.run(`(() => { const b = MP.get('providers', 'p_demo1'); MP.db().providers.push({ ...b, id: 'p_plain', name: 'عادي', tier: '', recent: [] }); return 'p_plain'; })()`);
  const plainTotal = t.run(`MP.customerTotalFor(400, ${JSON.stringify(other)}, 'quote').customerPrice`);
  const tierTotal = t.run(`MP.customerTotalFor(400, 'p_demo1', 'quote').customerPrice`);
  assert.ok(tierTotal < plainTotal, `tier offer cheaper for the customer (${tierTotal} < ${plainTotal}); provider base unchanged`);
  t.run(`MP.db().settings.bidding = true`);
  t.as('customer', { name: 'جديد', phone: '01099990000' });
  const rid = (await t.O.create({ cat: 'electric', serviceName: 'كهرباء', desc: 'd', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش' })).data.id;
  assert.equal(t.run(`MP.db().assignments.filter(a => a.reqId === ${JSON.stringify(rid)} && a.bidding)[0].providerId`), 'p_demo1', 'tier first in the offers round');
});

test('weekly target pays once per week; a cash dispute is a strike that removes the job and can drop the tier', async () => {
  const t = boot();
  t.as('admin', 'e_owner'); await t.A.saveMarketing({ bonus: BONUS });
  const P = 'p_demo1';
  for (const n of [1, 2, 3]) await job(t, P, n);
  const bonus = plain(t.run(`MP.db().transactions.filter(x => x.kind === 'bonus' && x.providerId === 'p_demo1')`));
  assert.equal(bonus.length, 1); assert.equal(bonus[0].net, 150); assert.equal(bonus[0].collection, 'pending');
  assert.equal(t.run(`MP.tierOf('p_demo1').id`), 'gold');
  await job(t, P, 4);
  assert.equal(t.run(`MP.db().transactions.filter(x => x.kind === 'bonus').length`), 1, 'once per week');
  await job(t, P, 5, { dispute: true });
  assert.equal(t.run(`MP.bonusStats('p_demo1').strikes`), 1);
  assert.equal(t.run(`MP.tierOf('p_demo1').id`), 'silver', 'gold allows no strikes');
  assert.ok(t.run(`MP.db().complaints.some(k => k.kind === 'payment')`), 'dispute still goes to the admin');
});

test('admin validation for the bonus settings', async () => {
  const t = boot();
  t.as('admin', 'e_owner');
  assert.equal((await t.A.saveMarketing({ bonus: { on: true, tiers: [{ name: '', minJobs: 1 }] } })).ok, false, 'tier needs a name');
  assert.equal((await t.A.saveMarketing({ bonus: { on: true, tiers: [{ name: 'x', minJobs: 1, rateOff: 80 }] } })).ok, false, 'share cut 0–50 %');
  assert.equal((await t.A.saveMarketing({ bonus: { on: true, windowDays: 400 } })).ok, false, 'window 7–90 days');
  assert.equal((await t.A.saveMarketing({ bonus: { on: true, weekly: { on: true, target: 0, amount: 100 } } })).ok, false, 'weekly needs a target');
  assert.equal((await t.A.saveMarketing({ bonus: BONUS })).ok, true);
  assert.equal(plain((await t.A.marketing()).data.bonus).tiers[1].rateOff, 6);
});