'use strict';
/* Round 11 trust / interaction cues on the real apps:
   customer — comparison tags and «why the best», countdown ring, 5-second undo markup, «السعر ثابت» seal, the difference
   of a new price from the agreed one, the warranty certificate, Arabic digits on offer cards;
   provider — the offer form previews what the CUSTOMER will see (tier included), and the bonus card replaces the level card. */
const test = require('node:test');
const assert = require('node:assert/strict');
const customer = require('../helpers/customer-app-harness.js');
const provider = require('../helpers/provider-app-harness.js');

const ar = (n, d = 0) => (+n).toLocaleString('ar-EG-u-nu-latn', { minimumFractionDigits: d, maximumFractionDigits: d });

function seed(t) {
  t.run(`(() => { const s = MP.db().settings; s.autoAssign = false; s.bidding = true;
    const b = MP.db().providers.find(p => p.status === 'approved' && p.cats.includes('electric') && p.govs.includes('القاهرة'));
    MP.db().providers.push({ ...b, id: 'p_t2', name: 'هاني', jobs: 900, rating: 4.9 }); })()`);
  return t.run(`(() => { let it, pr; for (const i of CAT.items('electric')) { const p = CAT.problems(i.id).find(x => !x.id.includes('/other')); if (p) { it = i; pr = p; break; } }
    return MP.createRequest({ name: 'سارة أحمد', phone: '01011112222', cat: 'electric', itemId: it.id, serviceId: it.id, itemName: it.name, serviceName: it.name, problemId: pr.id, problemName: pr.name, desc: 'd', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' }).id; })()`);
}

test('offers: tags, «why the best», countdown ring, undo bar, Arabic digits', () => {
  const t = customer.boot(); t.signIn();
  const id = seed(t);
  const inv = t.run(`MP.db().assignments.filter(a => a.reqId === ${JSON.stringify(id)} && a.bidding).map(a => a.providerId)`);
  assert.ok(inv.includes('p_t2') && inv.length >= 2);
  const other = inv.find(x => x !== 'p_t2');
  t.run(`MP.bid(${JSON.stringify(id)}, ${JSON.stringify(other)}, { kind: 'quote', labor: 300 }); MP.bid(${JSON.stringify(id)}, 'p_t2', { kind: 'quote', labor: 340 })`);
  t.run(`show('tracking', ${JSON.stringify(id)})`);
  const html = t.html();
  assert.match(html, /class="of-tag">الأرخص</); assert.match(html, /class="of-tag">الأعلى تقييمًا</); assert.match(html, /class="of-tag">الأكثر خبرة</);
  assert.match(html, /class="of-why"/); assert.match(html, /الأنسب: /);
  assert.match(html, /class="of-ring" style="--p:\d+"/, 'countdown ring');
  assert.match(html, /data-of-undo-bar hidden/, 'undo bar ready, hidden');
  assert.ok(html.includes('★ ' + ar(4.9, 1)), 'rating in the platform digit style');
  assert.doesNotMatch(html, /★ [٠-٩]/, 'one digit style: no Arabic-Indic digits after the star');
});

test('after choosing: «السعر ثابت» seal; a new price shows its difference; the warranty certificate after completion', () => {
  const t = customer.boot(); t.signIn();
  const id = seed(t);
  const pid = t.run(`MP.db().assignments.find(a => a.reqId === ${JSON.stringify(id)} && a.bidding).providerId`);
  t.run(`MP.bid(${JSON.stringify(id)}, ${JSON.stringify(pid)}, { kind: 'quote', labor: 300 }); MP.chooseBid(${JSON.stringify(id)}, ${JSON.stringify(pid)}); MP.confirmTime(${JSON.stringify(id)}, 'provider'); ['enroute','arrived','started'].forEach(s => MP.advance(${JSON.stringify(id)}, s))`);
  t.run(`show('tracking', ${JSON.stringify(id)})`);
  const agreed = t.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).pricing.customerPrice`);
  assert.match(t.html(), /class="price-seal"/); assert.match(t.html(), /سعرك ثابت/);
  t.run(`MP.createQuote(${JSON.stringify(id)}, { labor: 450 })`);
  t.run(`show('tracking', ${JSON.stringify(id)})`);
  assert.doesNotMatch(t.html(), /class="price-seal"/, 'no seal while a new price waits');
  const q = t.run(`MP.currentQuote(${JSON.stringify(id)}).customerTotal`);
  assert.match(t.html(), /quote-diff is-up/); assert.match(t.html(), /أعلى من المتفق عليه/);
  assert.ok(t.html().includes('+' + (q - agreed).toLocaleString('ar-EG-u-nu-latn')), 'difference shown');
  t.run(`(id => { MP.approveQuote(id); MP.choosePay(id,'online'); MP.markPaid(id,{amount:MP.payDue(MP.get('serviceRequests',id)),ref:'t_'+id}); MP.complete(id); })(${JSON.stringify(id)})`);   /* the certificate comes with an online payment */
  t.run(`show('tracking', ${JSON.stringify(id)})`);
  assert.match(t.html(), /class="w-cert"/); assert.match(t.html(), /شهادة ضمان/); assert.match(t.html(), /data-act="printCert"/);
});

test('provider: the offer form previews what the customer will see; the bonus card replaces the level card', async () => {
  const P = 'p_demo1';
  let rid;
  const a = provider.boot({ session: P, setup: ({ MP }) => {
    MP.db().settings.bidding = true; MP.db().settings.autoAssign = false;
    MP.db().settings.bonus = { on: true, windowDays: 30, tiers: [{ id: 's', name: 'فضي', minJobs: 0, minRating: 0, maxStrikes: 99, rateOff: 5 }], weekly: { on: true, target: 4, amount: 200 } };
    const r = MP.createRequest({ name: 'عميل', phone: '01000000001', cat: 'electric', serviceId: 's1', serviceName: 'كهرباء', desc: 'd', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' });
    if (!MP.db().assignments.some(x => x.reqId === r.id && x.providerId === P)) MP.db().assignments.push({ id: 'a_x', reqId: r.id, providerId: P, status: 'offered', reason: '', at: new Date().toISOString(), bidding: true });
    rid = r.id;
  } });
  a.go('#/earnings');   // the bonus card lives in «فلوسي» (2026-11-20)
  assert.match(a.html(), /class="pv-level pv-bonus"/); assert.match(a.html(), /فضي/);
  assert.ok(a.html().includes('باقي ' + ar(4) + ' على بونص'), 'weekly target in the platform digit style'); assert.match(a.html(), /العميل يأكد إنه دفع/);
  a.go('#/request/' + rid);
  await a.click({ 'data-pv-action': 'bid', 'data-id': rid });
  assert.match(a.html(), /class="pv-bid-pair pv-wide" data-bid="quote"/, 'labor and parts side by side');
  assert.match(a.html(), /data-bid-total/);
  const t = a.run(`MP.customerTotalFor(400, 'p_demo1', 'quote')`), base = a.run(`MP.customerTotalFor(400, 'p_plain_none', 'quote')`);
  assert.ok(t.customerPrice < base.customerPrice, 'the tier lowers what the customer sees for the same base');
});
