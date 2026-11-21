'use strict';
/* Auto-pick when the customer does not choose, the learned price library, and per-item / per-problem price caps. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { boot, plain, ROOT } = require('../helpers/domain-harness.js');

function seed(h) {
  return plain(h.run(`(() => {
    const s = MP.db().settings; s.bidding = true; s.bidWindowMin = 15;
    const base = MP.db().providers.find(p => p.status === 'approved' && p.cats.includes('electric') && p.govs.includes('القاهرة'));
    if (MP.db().providers.filter(p => p.status === 'approved' && p.available && p.cats.includes('electric') && p.govs.includes('القاهرة')).length < 2) MP.db().providers.push({ ...base, id: 'p_qa2', name: 'هاني', available: true });
    let it = null, pr = null; for (const i of CAT.items('electric')) { const p = CAT.problems(i.id).find(x => !x.id.includes('/other')); if (p) { it = i; pr = p; break; } }
    const r = MP.createRequest({ name: 'سارة', phone: '01011112222', cat: 'electric', itemId: it.id, serviceId: it.id, itemName: it.name, serviceName: it.name, problemId: pr.id, problemName: pr.name, desc: 'النور بيقطع', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' });
    return { id: r.id, itemId: it.id, problemId: pr.id, invited: MP.db().assignments.filter(a => a.reqId === r.id && a.bidding).map(a => a.providerId) };
  })()`));
}

test('auto-pick: off by default; when set, the best offer («الأنسب») is chosen N minutes after the customer was told', () => {
  const h = boot(); const { id, invited } = seed(h);
  const [p1, p2] = invited;
  h.run(`MP.bid(${JSON.stringify(id)}, ${JSON.stringify(p1)}, { kind: 'quote', labor: 500 })`);
  h.run(`MP.bid(${JSON.stringify(id)}, ${JSON.stringify(p2)}, { kind: 'quote', labor: 300 })`);
  const until = h.run(`Date.parse(MP.get('serviceRequests', ${JSON.stringify(id)}).bidding.until)`);
  h.run(`MP.tickBidding(${until + 60000})`);
  assert.equal(plain(h.run(`MP.tickBidding(${until + 3600000})`)).length, 0, 'off by default: the round waits for the customer');
  h.run('MP.db().settings.autoPickMin = 10');
  assert.deepEqual(plain(h.run(`MP.tickBidding(${until + 60000 + 5 * 60000})`)), [], 'not before the delay… measured from readyAt');
  const changed = plain(h.run(`MP.tickBidding(${until + 60000 + 11 * 60000})`));
  assert.deepEqual(changed, [id]);
  const r = plain(h.run(`MP.get('serviceRequests', ${JSON.stringify(id)})`));
  assert.equal(r.bidding.chosen, p2, 'cheaper offer wins with equal ratings'); assert.equal(r.bidding.autoPicked, true);
  const notes = plain(h.run(`MP.db().notifications.filter(n => n.to === 'customer:${r.customerId}').map(n => n.text)`));
  assert.ok(notes.some((x) => /اخترنالك أنسب عرض/.test(x)));
  const prov = plain(h.run(`MP.db().notifications.filter(n => n.to === 'provider:${p1}').map(n => n.text)`));
  assert.ok(prov.some((x) => /اختار عرض تاني/.test(x)), 'the other provider is told');
});

test('price library: completed jobs feed a running range per problem (O(1), last 15 kept, bounded)', () => {
  const h = boot();
  for (const v of [200, 220, 250, 260, 300, 900]) h.run(`MP.learnPrice('electric/x/p1', ${v})`);
  const r = plain(h.run(`MP.priceRange('electric/x/p1')`));
  assert.equal(r.n, 6); assert.equal(r.min, 200); assert.equal(r.max, 900);
  assert.ok(r.low >= 200 && r.high <= 300, 'the 25–75% range ignores the outlier: ' + JSON.stringify(r));
  for (let i = 0; i < 30; i++) h.run(`MP.learnPrice('electric/x/p1', 100)`);
  assert.equal(plain(h.run(`MP.db().settings.priceLib['electric/x/p1'].recent.length`)), 15);
  assert.equal(plain(h.run(`MP.priceRange('none')`)), null);
});

test('price library: a classic completion records the provider amount (value − platform share) under the problem', () => {
  const h = boot(); h.run('MP.db().settings.bidding = false; MP.db().settings.autoAssign = false');
  const { id, problemId } = seed(h);
  h.run(`(() => { const id = ${JSON.stringify(id)}; MP.assign(id, 'p_demo1'); MP.respond(id, true); MP.confirmTime(id, 'provider'); ['enroute', 'arrived', 'started'].forEach(s => MP.advance(id, s)); return MP.complete(id, 400); })()`);
  const lib = plain(h.run(`MP.db().settings.priceLib[${JSON.stringify(problemId)}]`));
  const tx = plain(h.run(`MP.db().transactions.find(t => t.reqId === ${JSON.stringify(id)})`));
  assert.equal(lib.n, 1); assert.equal(lib.recent[0], Math.round(400 - tx.commission));
});

test('caps: per-problem cap beats item and category; offers above it are refused; caps are an owner (price) edit', async () => {
  const h = boot(); const { id, itemId, problemId, invited } = seed(h);
  h.as('admin', 'e_owner');
  const ok = await h.A.saveMarketing({ priceCaps: { cats: { electric: 1000 }, items: { [itemId]: 600 }, problems: { [problemId]: 350 } } });
  assert.equal(plain(ok).ok, true, JSON.stringify(plain(ok).error));
  assert.equal(plain(h.run(`MP.priceCap(MP.get('serviceRequests', ${JSON.stringify(id)}))`)), 350);
  const over = plain(h.run(`MP.bid(${JSON.stringify(id)}, ${JSON.stringify(invited[0])}, { kind: 'quote', labor: 400 })`));
  assert.equal(over.ok, false); assert.match(over.msg, /الحد المسموح/);
  /* rank: the harness has no RBAC catalogue, so check the route asks for the owner-level price rank (rank tests: admin-platform-controls) */
  const src = require('node:fs').readFileSync(path.join(ROOT, 'services/admin-api.js'), 'utf8');
  assert.match(src, /body\.priceCaps !== undefined \|\| body\.inspectionCap !== undefined\) \? 'finance\.pricing'/);
});

test('scope: providers receive the price library for the bid hint, customers never do; autoPickMin is public', () => {
  const scope = require(path.join(ROOT, 'functions/src/scope.js'));
  const db = { settings: { autoPickMin: 10, priceLib: { k: { n: 3, sum: 600, min: 100, max: 300, recent: [100, 200, 300] } } }, providers: [], serviceRequests: [], assignments: [], customers: [] };
  const prov = scope.scopeFor(db, { role: 'provider', id: 'p1' });
  const cust = scope.scopeFor(db, { role: 'customer', id: 'c1' });
  assert.ok(prov.settings.priceLib && prov.settings.priceLib.k);
  assert.equal(cust.settings.priceLib, undefined);
  assert.equal(cust.settings.autoPickMin, 10);
});
