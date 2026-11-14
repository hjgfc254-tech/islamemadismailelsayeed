'use strict';
/* Phase 5 item 4 — Customer Orders / Order Details / Tracking keyboard & focus behavior.
   Boots the real Customer script list (parsed from apps/customer/index.html, in order) in node:vm with a minimal DOM
   that records focus, then drives the app through its own show() and delegated document click listeners. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, scripts } = require('../helpers/customer-app-harness.js');

test('the harness boots the production Customer script list and the initial render does not steal focus', () => {
  const app = boot();
  assert.ok(scripts().includes('apps/customer/app.js'));
  assert.match(app.html(), /class="hero"/, 'home rendered after DOMContentLoaded');
  assert.deepEqual(app.focus.history, [], 'no focus move on boot');
});

test('screen headings are programmatic focus targets', () => {
  const app = boot();
  app.signIn(); app.newRequest();
  app.run("show('orders')");
  assert.match(app.html(), /<div class="dhead">[\s\S]*?<h2 tabindex="-1">طلباتي<\/h2>/);
});

test('when a screen change drops focus (it was inside #view), focus moves to the new screen heading', () => {
  const app = boot();
  app.signIn(); app.newRequest();
  app.doc.activeElement = app.body; // the activated control was replaced with the old view
  app.run("show('orders')");
  assert.equal(app.focus.current, 'heading');
});

test('focus is not moved when it is still on a connected control outside #view (e.g. the tab bar)', () => {
  const app = boot();
  app.signIn(); app.newRequest();
  app.doc.activeElement = app.tabEl;
  app.focus.history.length = 0;
  app.run("show('orders')");
  assert.deepEqual(app.focus.history, []);
});

test('activating a tab keeps focus on the re-rendered equivalent tab (renderTabs rebuilds #tabbar)', () => {
  const app = boot();
  app.signIn(); app.newRequest();
  const pressedTab = { dataset: { go: 'orders' }, closest: sel => (sel === '#tabbar' ? {} : null) };
  app.doc.activeElement = pressedTab;           // focus on the Orders tab before show()
  const realContains = app.doc.contains;
  app.doc.contains = el => el !== pressedTab && realContains(el); // ...which renderTabs() destroys
  app.focus.history.length = 0;
  app.run("show('orders')");
  assert.equal(app.focus.current, '#tabbar [data-go="orders"]');
});

test('pressing an orders filter keeps focus on that filter after the re-render', () => {
  const app = boot();
  app.signIn(); app.newRequest();
  app.run("show('orders')");
  app.doc.activeElement = app.body;
  app.clickDoc({ orderFilter: 'all' });
  assert.match(app.html(), /data-order-filter="all" aria-pressed="true"/);
  assert.equal(app.focus.current, '[data-order-filter="all"]');
});

test('opening a request from the orders list focuses the tracking heading; tracking actions keep focus on the screen', () => {
  const app = boot();
  app.signIn();
  const id = app.newRequest();
  app.run("show('orders')");
  app.doc.activeElement = app.body;
  app.clickDoc({ track: id });
  assert.match(app.html(), /<h2 tabindex="-1">متابعة الطلب #HS-/);
  assert.equal(app.focus.current, 'heading');
  // Provider side (shared store) completes the job; the customer's own action then re-renders tracking.
  app.run(`(()=>{const id=${JSON.stringify(id)};if(!MP.activeAssignment(id))MP.assign(id,'p_demo1');MP.respond(id,true);MP.confirmTime(id,'provider');['enroute','arrived','started'].forEach(s=>MP.advance(id,s));MP.complete(id,150);})()`);
  app.run(`show('tracking', ${JSON.stringify(id)})`);
  app.focus.current = null;
  app.clickDoc({ act: 'custClose', id });
  assert.equal(app.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).status`), 'closed');
  assert.equal(app.focus.current, 'heading', 'status change re-render does not drop focus to <body>');
});

test('the tracking timeline marks exactly one current step with aria-current="step"', () => {
  const app = boot();
  app.signIn();
  const id = app.newRequest();
  app.run(`show('tracking', ${JSON.stringify(id)})`);
  const current = app.html().match(/<li [^>]*aria-current="step"/g) || [];
  assert.equal(current.length, 1);
  assert.match(app.html(), /<ol class="tl" aria-label="السجل الزمني للطلب"><li class="done" aria-current="step">/, 'the latest entry (first after reverse) is current');
  app.run(`MP.cancel(${JSON.stringify(id)}, 'x'); show('tracking', ${JSON.stringify(id)})`);
  assert.equal((app.html().match(/aria-current="step"/g) || []).length, 1, 'still exactly one after a terminal status');
});

test('the tracking back control and order cards are native buttons with accessible names', () => {
  const app = boot();
  app.signIn();
  const id = app.newRequest();
  app.run("show('orders')");
  assert.match(app.html(), new RegExp(`<button class="prow glass neon" data-track="${id}">`));
  app.run(`show('tracking', ${JSON.stringify(id)})`);
  assert.match(app.html(), /<button class="back" data-back aria-label="رجوع">/);
});
