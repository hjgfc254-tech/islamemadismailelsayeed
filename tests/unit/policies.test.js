'use strict';
/* 2026-11-24: policies — full text inside the app (one source: legal/*.html), readable colours, a real cancellation policy. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('the three policy pages exist in the 2026 identity and link each other', () => {
  for (const f of ['privacy', 'terms', 'cancellation']) {
    const h = read(`legal/${f}.html`);
    assert.match(h, /<main>[\s\S]*<h1>/, f + ' has its text in <main>');
    assert.match(h, /hsl-lockup-light\.png/); assert.doesNotMatch(h, /logo-v10/, f + ' has no old logo');
    assert.match(h, /href="legal\.css"/);
    assert.match(read('service-worker.js'), new RegExp(`'legal/${f}\\.html'`));
  }
  assert.match(read('legal/terms.html'), /cancellation\.html/);
  assert.doesNotMatch(read('legal/legal.css'), /#2FA57A|#F6F1EA/, 'no old green / beige');
});

test('cancellation policy matches the app rules: free until on the way, travel fee shown before confirming, visit fee only after inspection', () => {
  const c = read('legal/cancellation.html');
  assert.match(c, /الإلغاء ببلاش لحد ما الفني يتحرك/);
  assert.match(c, /«في الطريق» أو «وصل»/); assert.match(c, /بتظهرلك بوضوح <b>قبل<\/b> ما تأكد الإلغاء/);
  assert.match(c, /رسم معاينة/);
  const od = read('apps/customer/pages/order-details.page.js');
  assert.match(od, /'enroute', 'arrived'\]\.includes\(r\.status\)/, 'the order page still has the en-route stage the policy refers to');
});

test('privacy policy names the outside services used on demand (map search, voice, WhatsApp)', () => {
  const p = read('legal/privacy.html');
  assert.match(p, /Nominatim/); assert.match(p, /احكي المشكلة بصوتك/); assert.match(p, /واتساب/);
});

test('in-app policy sheet: full text from legal/*.html, no hard-coded pale colour, safe parsing', () => {
  const s = read('apps/customer/pages/support.page.js');
  assert.doesNotMatch(s, /#eadfe7/);
  assert.match(s, /const POLICY_PAGE = \{ privacy: 'privacy\.html', terms: 'terms\.html', cancel: 'cancellation\.html' \}/);
  assert.match(s, /querySelectorAll\('script,style,iframe,object,embed,form,img,\.links'\)/);
  assert.match(read('apps/customer/styles/brand-2026.css'), /#sheet \.policy-text\{[^}]*color:var\(--text-primary\)/);
});
