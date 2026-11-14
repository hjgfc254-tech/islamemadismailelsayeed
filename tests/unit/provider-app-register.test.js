'use strict';
/* Provider G1 — standalone demo self-registration (parity with legacy providerForm/pvForm → MP.registerProvider). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, SESSION_KEY, STORE_KEY } = require('../helpers/provider-app-harness.js');

const VALID = { name: '  مقدم تجريبي جديد  ', phone: '010 1234 5678', type: 'company', cats: ['electric', 'plumbing'],
  govs: ['القاهرة', 'الجيزة'], areas: 'مدينة نصر، المعادي ,  الدقي ,', years: '7', bio: '  نبذة قصيرة  ', docs: ' بطاقة، شهادة ' };
async function openRegister() {
  const app = boot();
  await app.click({ 'data-pv-action': 'register' });
  return app;
}
const providerCount = app => app.MP.db().providers.length;

test('the account picker offers demo registration that opens an accessible inline form', async () => {
  const app = boot();
  assert.ok(app.has({ 'data-pv-action': 'register' }));
  await app.click({ 'data-pv-action': 'register' });
  const html = app.html();
  assert.match(html, /<form class="pv-inline-form pv-register-form" id="pv-register-form" aria-label="تسجيل مقدم خدمة جديد"/);
  assert.equal(app.focus.current, 'field:pv-register-form', 'first field focused');
  assert.match(html, /name="name" required maxlength="80"/);
  assert.match(html, /name="phone" type="tel" inputmode="tel" required pattern="\[0-9\+ \]\{8,15\}" aria-describedby="pv-reg-phone-hint"/);
  assert.match(html, /<fieldset class="pv-wide"><legend>التخصصات \*<\/legend>/);
  assert.match(html, /<fieldset class="pv-wide"><legend>المحافظات \*<\/legend>/);
  assert.equal((html.match(/type="checkbox" name="cats"/g) || []).length, 7);
  assert.equal((html.match(/type="checkbox" name="govs"/g) || []).length, app.MP.GOVS.length);
  assert.match(html, /name="years" type="number" min="0" max="60"/);
  assert.match(html, /name="bio" maxlength="300"/);
  assert.match(html, /لا يتم التحقق من الهوية أو المستندات/, 'demo notice');
});

test('registration validates every field and creates nothing on failure', async () => {
  const cases = [
    [{ name: '   ' }, /الاسم/], [{ name: 'x'.repeat(81) }, /الاسم/],
    [{ phone: '12' }, /الهاتف/], [{ phone: 'abc12345678' }, /الهاتف/], [{ phone: '0'.repeat(16) }, /الهاتف/],
    [{ cats: [] }, /تخصص/], [{ cats: ['electric', 'hacking'] }, /تخصص/],
    [{ govs: [] }, /محافظة/], [{ govs: ['أطلانتس'] }, /محافظة/],
    [{ years: '61' }, /الخبرة/], [{ years: '-1' }, /الخبرة/], [{ years: '2.5' }, /الخبرة/], [{ years: 'abc' }, /الخبرة/],
    [{ bio: 'ن'.repeat(301) }, /النبذة/]
  ];
  for (const [patch, message] of cases) {
    const app = await openRegister();
    const before = providerCount(app);
    app.focus.current = null;
    await app.submit('pv-register-form', { ...VALID, ...patch });
    assert.equal(providerCount(app), before, JSON.stringify(patch));
    assert.match(app.toast.textContent, message, JSON.stringify(patch));
    assert.equal(app.session.getItem(SESSION_KEY), null, 'no identity selected on failure');
    assert.match(app.html(), /id="pv-register-form"/, 'form stays open');
    assert.equal(app.focus.current, 'field:pv-register-form', 'focus stays in the form');
  }
});

test('a valid registration creates a pending local demo provider, selects it and shows the review gate', async () => {
  const app = await openRegister();
  const before = providerCount(app);
  await app.submit('pv-register-form', VALID);
  assert.equal(providerCount(app), before + 1);
  const p = app.MP.db().providers.at(-1);
  assert.equal(p.status, 'pending');
  assert.equal(p.name, 'مقدم تجريبي جديد');
  assert.equal(p.phone, '010 1234 5678');
  assert.equal(p.type, 'company');
  assert.deepEqual([...p.cats], ['electric', 'plumbing']);
  assert.deepEqual([...p.govs], ['القاهرة', 'الجيزة']);
  assert.deepEqual([...p.areas], ['مدينة نصر', 'المعادي', 'الدقي']);
  assert.equal(p.years, 7);
  assert.equal(p.bio, 'نبذة قصيرة');
  assert.equal(p.docs, 'بطاقة، شهادة');
  assert.equal(app.session.getItem(SESSION_KEY), p.id);
  assert.match(app.html(), /pv-gate[\s\S]*طلب التسجيل قيد المراجعة/);
  assert.equal(app.nav.hidden, true);
  assert.match(app.toast.textContent, /تم إرسال طلب التسجيل/);
  assert.equal(app.focus.current, 'view');
  assert.ok(app.MP.db().notifications.some(n => n.to === 'admin' && n.text.includes('مقدم تجريبي جديد')), 'admin is notified locally');
  assert.equal(JSON.parse(app.local.getItem(STORE_KEY)).providers.at(-1).id, p.id, 'persisted locally');
});

test('defaults: optional fields may be empty and unknown type falls back to individual', async () => {
  const app = await openRegister();
  await app.submit('pv-register-form', { ...VALID, type: 'agency', areas: '', years: '', bio: '', docs: '' });
  const p = app.MP.db().providers.at(-1);
  assert.equal(p.type, 'individual');
  assert.deepEqual([...p.areas], []);
  assert.equal(p.years, 0);
  assert.equal(p.bio, '');
});

test('after admin approval the newly registered provider reaches the workspace', async () => {
  const app = await openRegister();
  await app.submit('pv-register-form', VALID);
  const id = app.session.getItem(SESSION_KEY);
  app.MP.updateProvider(id, { status: 'approved' }); // done by Admin → providers management (local demo)
  app.go('#/profile');
  assert.match(app.html(), /مقدم تجريبي جديد/);
  assert.equal(app.nav.hidden, false);
});

test('the new account appears in the picker as pending after switching accounts', async () => {
  const app = await openRegister();
  await app.submit('pv-register-form', VALID);
  const id = app.session.getItem(SESSION_KEY);
  await app.click({ 'data-pv-action': 'logout' }, { force: true });
  assert.ok(app.has({ 'data-pv-action': 'select', 'data-id': id }));
  assert.match(app.html(), /حساب مسجل · قيد المراجعة/);
});

test('cancel and Escape close the registration form and return focus to the register control', async () => {
  const app = await openRegister();
  await app.click({ 'data-pv-action': 'cancel-form' });
  assert.doesNotMatch(app.html(), /pv-register-form/);
  assert.equal(app.focus.current, '[data-pv-action="register"]');
  await app.click({ 'data-pv-action': 'register' });
  assert.equal(app.key('Escape').prevented, true);
  assert.doesNotMatch(app.html(), /pv-register-form/);
  assert.equal(app.focus.current, '[data-pv-action="register"]');
  assert.equal(app.session.getItem(SESSION_KEY), null);
});

test('registration stays local: no network, only the demo store and demo session keys', async () => {
  const app = await openRegister();
  await app.submit('pv-register-form', VALID);
  assert.equal(app.fetchCalls.length, 0);
  assert.deepEqual(app.local.keys(), [STORE_KEY]);
  assert.deepEqual(app.session.keys(), [SESSION_KEY]);
});

test('registration text from the user is escaped when shown back', async () => {
  const app = await openRegister();
  await app.submit('pv-register-form', { ...VALID, name: '<img src=x onerror=alert(1)>' });
  await app.click({ 'data-pv-action': 'logout' }, { force: true });
  assert.doesNotMatch(app.html(), /<img src=x/);
  assert.match(app.html(), /&lt;img src=x/);
});
