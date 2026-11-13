'use strict';
/* Provider P1 — keyboard/focus/semantics behavior of the standalone Provider app. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot, offerRequest, ROOT } = require('../helpers/provider-app-harness.js');

const PROVIDER = 'p_demo1';
const withOffer = () => { let rid; const app = boot({ session: PROVIDER, setup: ({ MP }) => { rid = offerRequest(MP, PROVIDER).id; } }); return { app, rid }; };
const detailsSel = rid => `[data-pv-route="request/${encodeURIComponent(rid)}"]`;

test('route changes move focus to the main view and update the document title', () => {
  const app = boot({ session: PROVIDER });
  app.focus.history.length = 0;
  app.click({ 'data-pv-route': 'earnings' });
  assert.equal(app.focus.current, 'view');
  assert.match(app.title(), /^الأرباح \| /);
  app.go('#/new');
  assert.equal(app.focus.current, 'view');
  assert.match(app.title(), /^طلبات جديدة \| /);
});

test('initial boot does not steal focus but sets a meaningful title', () => {
  const app = boot({ session: PROVIDER });
  assert.equal(app.focus.history.includes('view'), false);
  assert.match(app.title(), /^الرئيسية \| مساحة مقدم الخدمة/);
});

test('picker, gate, details and cancelled routes have their own titles', () => {
  assert.match(boot().title(), /^اختيار حساب العرض \| /);
  const gated = boot({ session: PROVIDER, setup: ({ MP }) => MP.updateProvider(PROVIDER, { status: 'pending' }) });
  assert.match(gated.title(), /^حالة الحساب \| /);
  const { app, rid } = withOffer();
  app.go('#/request/' + rid);
  assert.match(app.title(), /^تفاصيل الطلب \| /);
  app.go('#/cancelled');
  assert.match(app.title(), /^ملغاة \/ مرفوضة \| /);
});

test('re-rendering the same route keeps focus on the control the user operated', () => {
  const app = boot({ session: PROVIDER });
  app.click({ 'data-pv-action': 'availability' });
  assert.equal(app.focus.current, '[data-pv-action="availability"]');
});

test('confirm and advance keep focus on the same request when it stays on the route', () => {
  const { app, rid } = withOffer();
  app.go('#/new');
  app.click({ 'data-pv-action': 'accept', 'data-id': rid });
  app.click({ 'data-pv-action': 'confirm', 'data-id': rid });
  assert.equal(app.focus.current, `[data-pv-action="advance"][data-id="${rid}"]`, 'confirm: focus moves to the request\'s next step');
  app.MP.db().assignments.find(a => a.reqId === rid).status = 'withdrawn'; // card leaves the list on next render
  app.click({ 'data-pv-action': 'confirm', 'data-id': rid }, { force: true });
  assert.equal(app.focus.current, 'view', 'stale action with the card gone falls back to the view');
  app.MP.db().assignments.find(a => a.reqId === rid).status = 'accepted';
  app.go('#/request/' + rid);
  app.click({ 'data-pv-action': 'advance', 'data-next': 'enroute', 'data-id': rid });
  assert.equal(app.focus.current, `[data-pv-action="advance"][data-id="${rid}"]`, 'details: focus on the next step control');
});

test('an action that moves the request to another route focuses the new view', () => {
  const { app, rid } = withOffer();
  app.go('#/new');
  app.click({ 'data-pv-action': 'accept', 'data-id': rid });
  assert.equal(app.location.hash, '#/accepted');
  assert.equal(app.focus.current, 'view');
});

test('opening an inline form focuses its first field and gives the form an accessible name', () => {
  const { app, rid } = withOffer();
  app.go('#/new');
  app.click({ 'data-pv-action': 'reject', 'data-id': rid });
  assert.equal(app.focus.current, 'field:pv-reject-form');
  const no = app.request(rid).no;
  assert.match(app.html(), new RegExp(`<form class="pv-inline-form" id="pv-reject-form" data-id="${rid}" aria-label="رفض الطلب ${no}"`));
});

test('only one inline form can be open at a time (no duplicate ids)', () => {
  const { app, rid } = withOffer();
  app.go('#/new');
  app.click({ 'data-pv-action': 'reject', 'data-id': rid });
  app.click({ 'data-pv-action': 'reject', 'data-id': rid });
  assert.equal((app.html().match(/id="pv-reject-form"/g) || []).length, 1);
  app.MP.respond(rid, true); app.MP.confirmTime(rid, 'provider'); app.MP.advance(rid, 'enroute'); app.MP.advance(rid, 'arrived'); app.MP.advance(rid, 'started');
  app.go('#/progress');
  app.click({ 'data-pv-action': 'quote', 'data-id': rid });
  app.click({ 'data-pv-action': 'complete', 'data-id': rid });
  assert.equal((app.html().match(/class="pv-inline-form"/g) || []).length, 1);
  assert.match(app.html(), /id="pv-complete-form"/);
});

test('cancelling an inline form returns focus to the control that opened it', () => {
  const { app, rid } = withOffer();
  app.go('#/new');
  app.click({ 'data-pv-action': 'reject', 'data-id': rid });
  app.click({ 'data-pv-action': 'cancel-form' });
  assert.equal(app.focus.current, `[data-pv-action="reject"][data-id="${rid}"]`);
});

test('Escape inside an open inline form cancels it and restores focus; Escape elsewhere does nothing', () => {
  const { app, rid } = withOffer();
  app.go('#/new');
  assert.equal(app.key('Escape', { inForm: false }).prevented, false);
  app.click({ 'data-pv-action': 'reject', 'data-id': rid });
  const { prevented } = app.key('Escape');
  assert.equal(prevented, true);
  assert.doesNotMatch(app.html(), /pv-reject-form/);
  assert.equal(app.focus.current, `[data-pv-action="reject"][data-id="${rid}"]`);
  assert.equal(app.assignmentFor(rid, PROVIDER).status, 'offered');
});

test('invalid inline form submission keeps focus in the form for correction', () => {
  const { app, rid } = withOffer();
  app.go('#/new');
  app.click({ 'data-pv-action': 'accept', 'data-id': rid });
  app.click({ 'data-pv-action': 'propose', 'data-id': rid });
  app.focus.current = null;
  app.submit('pv-propose-form', { at: '' });
  assert.equal(app.focus.current, 'field:pv-propose-form');
  assert.match(app.html(), /id="pv-propose-form"/);
});

test('form scrolling respects prefers-reduced-motion', () => {
  const { app, rid } = withOffer();
  app.go('#/new');
  app.click({ 'data-pv-action': 'reject', 'data-id': rid });
  app.click({ 'data-pv-action': 'cancel-form' });
  app.reducedMotion.value = true;
  app.click({ 'data-pv-action': 'reject', 'data-id': rid });
  assert.deepEqual(app.focus.scrollBehaviors, ['smooth', 'auto']);
});

test('feedback is announced through a polite live region and the main view is a programmatic focus target', () => {
  const shell = fs.readFileSync(path.join(ROOT, 'apps/provider/provider-shell.js'), 'utf8');
  assert.match(shell, /id="provider-toast" class="pv-toast" role="status" aria-live="polite"/);
  assert.match(shell, /<main id="provider-view" class="pv-main" tabindex="-1">/);
  assert.match(shell, /<nav id="provider-nav" class="pv-nav" aria-label="[^"]+"/);
});

test('every rendered action control is a native button with visible text', () => {
  const { app, rid } = withOffer();
  for (const hash of ['#/home', '#/new', '#/request/' + rid]) {
    app.go(hash);
    const buttons = [...app.html().matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)];
    assert.ok(buttons.length > 0, hash);
    for (const [, inner] of buttons) {
      const text = inner.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
      assert.ok(text.length > 0, `${hash}: button without visible text: ${inner.slice(0, 80)}`);
    }
    assert.doesNotMatch(app.html(), /<(div|span|a)\b[^>]*data-pv-action=/, `${hash}: actions must be buttons`);
  }
});
