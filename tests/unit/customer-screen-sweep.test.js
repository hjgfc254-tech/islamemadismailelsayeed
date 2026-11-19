'use strict';
/* Every Customer screen renders, for a guest and for a signed-in customer, and order tracking renders in every request
   state the marketplace can produce (offers round, inspection, quote, free / warranty, cancelled with a travel fee, cash
   confirmation). Catches «this screen throws for this state» bugs that targeted tests miss. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('../helpers/customer-app-harness.js');

const SCREEN_ARGS = { search: 'غسالة', disc: 'cat|electric', tracking: null, providerProfile: null };
const firstDevice = t => t.run('Object.keys(DEVICES)[0]');

function screensOf(t) { return t.run('Object.keys(screens)'); }
function render(t, name, arg) {
  let html = '', err = null;
  try { t.run(`show(${JSON.stringify(name)}, ${JSON.stringify(arg ?? '')})`); html = t.html(); } catch (e) { err = e; }
  return { html, err };
}

test('every customer screen renders for a guest and for a signed-in customer', () => {
  for (const signed of [false, true]) {
    const t = boot();
    if (signed) { t.signIn(); t.newRequest(); }
    const pid = t.run(`(MP.db().providers.find(p => p.status === 'approved') || {}).id`);
    const rid = signed ? t.run(`MP.reqs()[0].id`) : '';
    const names = screensOf(t);
    assert.ok(names.length >= 10, 'screens registry found: ' + names.length);
    for (const name of names) {
      const arg = name === 'details' ? firstDevice(t) : name === 'tracking' ? rid : name === 'providerProfile' || name === 'provider' ? pid : SCREEN_ARGS[name];
      if (name === 'tracking' && !rid) continue;
      const { html, err } = render(t, name, arg);
      assert.equal(err, null, `${signed ? 'customer' : 'guest'} · ${name} threw: ${err && err.message}`);
      assert.ok(html.length > 40, `${signed ? 'customer' : 'guest'} · ${name} rendered something (${html.length} chars)`);
      assert.doesNotMatch(html, /undefined|\[object Object\]|NaN/, `${name}: no leaked undefined / object / NaN`);
    }
  }
});

test('screens opened with a missing or stale id show a message instead of crashing', () => {
  const t = boot(); t.signIn();
  for (const name of screensOf(t)) for (const arg of ['', 'zz_missing']) {
    const { html, err } = render(t, name, arg);
    assert.equal(err, null, `${name}(${JSON.stringify(arg)}) threw: ${err && err.message}`);
    assert.ok(html.length > 40, `${name}(${JSON.stringify(arg)}) rendered`);
  }
});

test('order tracking renders in every marketplace state', () => {
  const t = boot();
  t.signIn();
  const pick = id => t.run(`MP.db().assignments.filter(a => a.reqId === ${JSON.stringify(id)}).map(a => a.providerId)`);
  t.run(`(() => { const s = MP.db().settings; s.autoAssign = false; s.bidding = true; s.cancelFee = 50; s.visitFee = 80;
    if (MP.db().providers.filter(p => p.status === 'approved' && p.available && p.cats.includes('electric') && p.govs.includes('القاهرة')).length < 2)
      MP.db().providers.push({ ...MP.db().providers.find(p => p.status === 'approved' && p.cats.includes('electric') && p.govs.includes('القاهرة')), id: 'p_sw2', name: 'فني تاني' }); })()`);
  const states = {};
  const mk = (extra = '') => t.run(`(() => { let it = null, pr = null; for (const i of CAT.items('electric')) { const p = CAT.problems(i.id).find(x => !x.id.includes('/other')); if (p) { it = i; pr = p; break; } }
    return MP.createRequest({ name: 'سارة أحمد', phone: '01011112222', cat: 'electric', itemId: it.id, serviceId: it.id, itemName: it.name, serviceName: it.name, problemId: pr.id, problemName: pr.name, desc: 'd', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' ${extra} }).id; })()`);
  const as = pid => t.run(`MP.db().assignments.find(a => a.providerId === ${JSON.stringify(pid)})`) && pid;
  const prov = (id) => pick(id)[0];
  const advance = (id, list) => { for (const to of list) assert.ok(t.run(to === 'scheduled' ? `MP.confirmTime(${JSON.stringify(id)}, 'provider')` : `MP.advance(${JSON.stringify(id)}, ${JSON.stringify(to)})`), `step ${to}`); };

  states.waitingOffers = mk();
  states.withOffers = mk(); t.run(`MP.bid(${JSON.stringify(states.withOffers)}, ${JSON.stringify(prov(states.withOffers))}, { kind: 'quote', labor: 300, parts: 50, note: 'ملاحظة', eta: 'بكرة' })`);
  t.run(`MP.bid(${JSON.stringify(states.withOffers)}, ${JSON.stringify(pick(states.withOffers)[1])}, { kind: 'quote', labor: 280 })`);
  states.windowOver = mk(); t.run(`MP.get('serviceRequests', ${JSON.stringify(states.windowOver)}).bidding.until = new Date(Date.now() - 7200e3).toISOString()`);
  states.windowOverWithOffers = mk(); t.run(`MP.bid(${JSON.stringify(states.windowOverWithOffers)}, ${JSON.stringify(prov(states.windowOverWithOffers))}, { kind: 'quote', labor: 300 }); MP.get('serviceRequests', ${JSON.stringify(states.windowOverWithOffers)}).bidding.until = new Date(Date.now() - 7200e3).toISOString()`);
  states.inspectionRound = t.run(`MP.createRequest({ name: 'سارة أحمد', phone: '01011112222', cat: 'electric', unknownProblem: true, serviceName: 'مش عارف', desc: 'd', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' }).id`);
  const chosen = (id, b) => { const p = prov(id); t.run(`MP.bid(${JSON.stringify(id)}, ${JSON.stringify(p)}, ${JSON.stringify(b)}); MP.chooseBid(${JSON.stringify(id)}, ${JSON.stringify(p)})`); return p; };
  states.accepted = mk(); chosen(states.accepted, { kind: 'quote', labor: 300 });
  states.inspectionAccepted = t.run(`MP.createRequest({ name: 'سارة أحمد', phone: '01011112222', cat: 'electric', unknownProblem: true, serviceName: 'مش عارف', desc: 'd', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' }).id`);
  chosen(states.inspectionAccepted, { kind: 'inspection', fee: 120 });
  states.started = mk(); chosen(states.started, { kind: 'quote', labor: 300 }); advance(states.started, ['scheduled', 'enroute', 'arrived', 'started']);
  states.quotePending = mk(); chosen(states.quotePending, { kind: 'quote', labor: 300 }); advance(states.quotePending, ['scheduled', 'enroute', 'arrived', 'started']); t.run(`MP.createQuote(${JSON.stringify(states.quotePending)}, { labor: 600 })`);
  states.completed = mk(); chosen(states.completed, { kind: 'quote', labor: 300 }); advance(states.completed, ['scheduled', 'enroute', 'arrived', 'started']); t.run(`MP.complete(${JSON.stringify(states.completed)})`);
  states.cashDisputed = mk(); chosen(states.cashDisputed, { kind: 'quote', labor: 300 }); advance(states.cashDisputed, ['scheduled', 'enroute', 'arrived', 'started']);
  t.run(`MP.complete(${JSON.stringify(states.cashDisputed)}); MP.cashConfirm(${JSON.stringify(states.cashDisputed)}, 'customer', true); MP.cashConfirm(${JSON.stringify(states.cashDisputed)}, 'provider', false)`);
  states.cancelledWithFee = mk(); chosen(states.cancelledWithFee, { kind: 'quote', labor: 300 }); advance(states.cancelledWithFee, ['scheduled', 'enroute']); t.run(`MP.cancel(${JSON.stringify(states.cancelledWithFee)}, 'x')`);
  states.warrantyClaim = t.run(`(MP.warrantyClaim(${JSON.stringify(states.completed)}, 'رجعت') || {}).request?.id || ''`);
  states.inspectionOnly = t.run(`MP.createRequest({ name: 'سارة أحمد', phone: '01011112222', cat: 'electric', unknownProblem: true, serviceName: 'مش عارف', desc: 'd', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' }).id`);
  chosen(states.inspectionOnly, { kind: 'inspection', fee: 100 }); advance(states.inspectionOnly, ['scheduled', 'enroute', 'arrived', 'started']); t.run(`MP.inspectionOnly(${JSON.stringify(states.inspectionOnly)})`);

  const expect = {
    waitingOffers: /بنستنى عروض الفنيين/, withOffers: /اختارلي الأنسب/, windowOver: /دوّر على فنيين في مناطق تانية/,
    windowOverWithOffers: /العروض جاهزة/, inspectionRound: /عروض المعاينة/, inspectionAccepted: /بتتخصم/,
    completed: /دفعت/, cashDisputed: /اختلاف على الدفع/, warrantyClaim: /طلب ضمان/, inspectionOnly: /المعاينة بس/
  };
  const status = { waitingOffers: 'searching', accepted: 'accepted', inspectionAccepted: 'accepted', started: 'started', quotePending: 'quote', completed: 'completed', cashDisputed: 'completed', cancelledWithFee: 'cancelled', inspectionOnly: 'completed' };
  for (const [name, id] of Object.entries(states)) {
    assert.ok(id, `${name}: request created`);
    if (status[name]) assert.equal(t.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).status`), status[name], `${name}: reached its state`);
    const { html, err } = render(t, 'tracking', id);
    assert.equal(err, null, `tracking · ${name} threw: ${err && err.message}`);
    assert.doesNotMatch(html, /undefined|\[object Object\]|NaN/, `tracking · ${name}: no leaked undefined / object / NaN`);
    if (expect[name]) assert.match(html, expect[name], `tracking · ${name} shows its state`);
  }
  assert.equal(t.run(`MP.get('serviceRequests', ${JSON.stringify(states.cancelledWithFee)}).cancelFee`), 50);
});
