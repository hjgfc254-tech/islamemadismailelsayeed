'use strict';
/* Offers-round clock (MP.tickBidding): window over with offers → the customer is told once to choose; no offers →
   the search widens once; still nothing after the widened window → the round closes, the request goes back to the
   normal search and the admin is told. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, plain } = require('../helpers/domain-harness.js');

function seed() {
  const h = boot();
  const out = plain(h.run(`(() => {
    const s = MP.db().settings; s.bidding = true; s.bidWindowMin = 15;
    const base = MP.db().providers.find(p => p.status === 'approved' && p.cats.includes('electric') && p.govs.includes('القاهرة'));
    if (MP.db().providers.filter(p => p.status === 'approved' && p.available && p.cats.includes('electric') && p.govs.includes('القاهرة')).length < 2) MP.db().providers.push({ ...base, id: 'p_qa2', name: 'هاني', available: true });
    let it = null, pr = null; for (const i of CAT.items('electric')) { const p = CAT.problems(i.id).find(x => !x.id.includes('/other')); if (p) { it = i; pr = p; break; } }
    const r = MP.createRequest({ name: 'سارة', phone: '01011112222', cat: 'electric', itemId: it.id, serviceId: it.id, itemName: it.name, serviceName: it.name, problemId: pr.id, problemName: pr.name, desc: 'النور بيقطع', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' });
    return { id: r.id, invited: MP.db().assignments.filter(a => a.reqId === r.id && a.bidding).map(a => a.providerId) };
  })()`));
  return { h, ...out };
}
const later = (h, id, min) => h.run(`Date.parse(MP.get('serviceRequests', ${JSON.stringify(id)}).bidding.until) + ${min} * 60000`);
const notes = (h, to) => plain(h.run(`MP.db().notifications.filter(n => n.to === ${JSON.stringify(to)}).map(n => n.text)`));

test('nothing happens while the window is open', () => {
  const { h, id } = seed();
  assert.deepEqual(plain(h.run('MP.tickBidding()')), []);
  assert.ok(id);
});

test('window over with offers: the customer is told once to choose; the round stays open', () => {
  const { h, id, invited } = seed();
  h.run(`MP.bid(${JSON.stringify(id)}, ${JSON.stringify(invited[0])}, { kind: 'quote', labor: 300 })`);
  const t = later(h, id, 1);
  assert.deepEqual(plain(h.run(`MP.tickBidding(${t})`)), [id]);
  assert.deepEqual(plain(h.run(`MP.tickBidding(${t})`)), [], 'told once');
  const cust = plain(h.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).customerId`));
  assert.ok(notes(h, 'customer:' + cust).some(x => /وقت العروض خلص — عندك 1 عرض/.test(x)));
  assert.equal(plain(h.run(`!!MP.get('serviceRequests', ${JSON.stringify(id)}).bidding.closed`)), false);
});

test('no offers: widen once, then close and hand to the admin', () => {
  const { h, id } = seed();
  const realNow = Date.now;
  try {
    const t1 = later(h, id, 1);
    h.run(`Date.now = () => ${t1}`);                      // widenBidding checks the real clock
    assert.deepEqual(plain(h.run(`MP.tickBidding(${t1})`)), [id]);
    assert.equal(plain(h.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).bidding.widened`)), true);
    const t2 = later(h, id, 1);
    h.run(`Date.now = () => ${t2}`);
    assert.deepEqual(plain(h.run(`MP.tickBidding(${t2})`)), [id]);
    const r = plain(h.run(`MP.get('serviceRequests', ${JSON.stringify(id)})`));
    assert.equal(r.bidding.closed, true); assert.equal(r.status, 'searching');
    assert.ok(notes(h, 'admin').some(x => /محتاج إسناد يدوي/.test(x)));
    assert.ok(notes(h, 'customer:' + r.customerId).some(x => /فريقنا هيدوّرلك/.test(x)));
    assert.deepEqual(plain(h.run(`MP.tickBidding(${t2 + 3600000})`)), [], 'a closed round is left alone');
  } finally { h.run(`Date.now = ${realNow.toString().includes('native') ? 'Date.now' : 'Date.now'}`); }
});
