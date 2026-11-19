'use strict';
/* Provider app: every route renders, the request page renders in every marketplace state, and EVERY action button that
   a state shows can be clicked without throwing (a fresh app per click). This is the test that would have caught the
   «استلمت الحساب» button running before its helper existed (a temporal-dead-zone ReferenceError). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('../helpers/provider-app-harness.js');

const P = 'p_demo1';
const ROUTES = ['home', 'new', 'accepted', 'progress', 'quote', 'schedule', 'done', 'cancelled', 'reviews', 'transactions', 'earnings', 'services', 'notifications', 'profile'];

/* Builds one request per state, all involving P. Returns { state: requestId }. */
function seedStates(MP) {
  const s = MP.db().settings; s.autoAssign = false; s.bidding = true; s.cancelFee = 50; s.visitFee = 80;
  const base = MP.get('providers', P);
  if (!MP.db().providers.some(p => p.id === 'p_sw2')) MP.db().providers.push({ ...base, id: 'p_sw2', name: 'فني تاني' });
  let it = null, pr = null;
  for (const i of CAT_ITEMS(MP)) { const p = i.problems.find(x => !x.id.includes('/other')); if (p) { it = i; pr = p; break; } }
  const mk = (extra = {}) => {
    const r = MP.createRequest({ name: 'عميل', phone: '01000000001', cat: 'electric', itemId: it.id, serviceId: it.id, itemName: it.name, serviceName: it.name, problemId: pr.id, problemName: pr.name, desc: 'd', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1', ...extra });
    if (!MP.db().assignments.some(a => a.reqId === r.id && a.providerId === P)) MP.db().assignments.push({ id: 'a_' + r.id, reqId: r.id, providerId: P, status: 'offered', reason: '', at: new Date().toISOString(), bidding: true });
    return r.id;
  };
  const unknown = () => mk({ itemId: '', problemId: '', unknownProblem: true, serviceName: 'مش عارف' });
  const choose = (id, b) => { assert.equal(MP.bid(id, P, b).ok, true, 'bid'); assert.equal(MP.chooseBid(id, P).ok, true, 'choose'); };
  const go = (id, steps) => steps.forEach(to => assert.ok(to === 'scheduled' ? MP.confirmTime(id, 'provider') : MP.advance(id, to), 'step ' + to));
  const st = {};
  st.offerToBid = mk();
  st.bidSent = mk(); MP.bid(st.bidSent, P, { kind: 'quote', labor: 300 });
  st.inspectionInvite = unknown();
  st.accepted = mk(); choose(st.accepted, { kind: 'quote', labor: 300 });
  st.inspectionAccepted = unknown(); choose(st.inspectionAccepted, { kind: 'inspection', fee: 120 });
  st.scheduled = mk(); choose(st.scheduled, { kind: 'quote', labor: 300 }); go(st.scheduled, ['scheduled']);
  st.started = mk(); choose(st.started, { kind: 'quote', labor: 300 }); go(st.started, ['scheduled', 'enroute', 'arrived', 'started']);
  st.inspectionVisit = unknown(); choose(st.inspectionVisit, { kind: 'inspection', fee: 120 }); go(st.inspectionVisit, ['scheduled', 'enroute', 'arrived', 'started']);
  st.priceRefused = mk(); choose(st.priceRefused, { kind: 'quote', labor: 300 }); go(st.priceRefused, ['scheduled', 'enroute', 'arrived', 'started']);
  MP.createQuote(st.priceRefused, { labor: 600 }); MP.rejectQuote(st.priceRefused, 'غالي');
  st.quotePending = mk(); choose(st.quotePending, { kind: 'quote', labor: 300 }); go(st.quotePending, ['scheduled', 'enroute', 'arrived', 'started']); MP.createQuote(st.quotePending, { labor: 500 });
  st.completed = mk(); choose(st.completed, { kind: 'quote', labor: 300 }); go(st.completed, ['scheduled', 'enroute', 'arrived', 'started']); assert.ok(MP.complete(st.completed));
  st.cancelledLate = mk(); choose(st.cancelledLate, { kind: 'quote', labor: 300 }); go(st.cancelledLate, ['scheduled', 'enroute']); MP.cancel(st.cancelledLate, 'x');
  st.warrantyClaim = MP.warrantyClaim(st.completed, 'رجعت').request.id;
  return st;
}
const CAT_ITEMS = () => { const C = globalThis.__CAT; return C.items('electric').map(i => ({ ...i, problems: C.problems(i.id) })); };

function app(state) {
  let ids = null;
  const a = boot({ session: P, setup: ({ MP, run }) => { globalThis.__CAT = (run || (c => a.run(c)))('CAT'); ids = seedStates(MP); } });
  return { a, ids };
}

test('provider: every route renders with requests in every state', () => {
  const { a } = app();
  for (const r of ROUTES) {
    a.go('#/' + r);
    assert.ok(a.html().length > 40, r + ' rendered');
    assert.doesNotMatch(a.html(), /undefined|\[object Object\]|NaN/, r + ': no leaked undefined / object / NaN');
  }
});

test('provider: the request page renders in every state with the right controls', () => {
  const { a, ids } = app();
  const expect = { offerToBid: /ابعت عرضك/, bidSent: /عدّل عرضك/, inspectionInvite: /ابعت سعر المعاينة/, inspectionVisit: /سجّل المعاينة بس/,
    priceRefused: /سجّل الزيارة بس/, completed: /استلمت الحساب/, cancelledLate: /رسوم انتقال/ };
  for (const [name, id] of Object.entries(ids)) {
    a.go('#/request/' + id);
    const html = a.html();
    assert.doesNotMatch(html, /undefined|\[object Object\]|NaN/, name + ': no leaked undefined / object / NaN');
    if (expect[name]) assert.match(html, expect[name], name + ' shows its control');
  }
});

test('provider: every action button in every state can be clicked without throwing', async () => {
  const { a: probe, ids } = app();
  const buttons = [];
  for (const [name, id] of Object.entries(ids)) {
    probe.go('#/request/' + id);
    for (const m of probe.html().matchAll(/data-pv-action="([\w-]+)"(?:\s+data-id="([^"]*)")?/g)) {
      if (m[2] && m[2] !== id) continue;
      if (!buttons.some(b => b.name === name && b.action === m[1])) buttons.push({ name, id, action: m[1], hasId: !!m[2] });
    }
  }
  assert.ok(buttons.length >= 15, 'found ' + buttons.length + ' state × action pairs');
  const failures = [];
  for (const b of buttons) {
    const { a, ids: fresh } = app();
    const id = fresh[b.name];
    a.go('#/request/' + id);
    const attrs = { 'data-pv-action': b.action, ...(b.hasId ? { 'data-id': id } : {}) };
    if (!a.has(attrs)) continue;   // ids differ between boots only in value — the same control must exist
    const errs = [];
    const onRej = e => errs.push(e);
    process.on('unhandledRejection', onRej);
    try { await a.click(attrs); await a.settle(); } catch (e) { errs.push(e); }
    process.off('unhandledRejection', onRej);
    if (errs.length) failures.push(`${b.name} · ${b.action}: ${errs[0] && errs[0].message}`);
  }
  assert.deepEqual(failures, []);
});
