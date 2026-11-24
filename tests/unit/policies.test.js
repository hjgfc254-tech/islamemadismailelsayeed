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
  assert.match(c, /يحق لك إلغاء الطلب دون أي رسوم ما دام مقدم الخدمة لم يتحرك إليك بعد/);
  assert.match(c, /«في الطريق» أو أنه «وصل»/); assert.match(c, /يُعرض على العميل بوضوح <b>قبل<\/b> تأكيد الإلغاء/);
  assert.match(c, /رسم المعاينة/);
  const od = read('apps/customer/pages/order-details.page.js');
  assert.match(od, /'enroute', 'arrived'\]\.includes\(r\.status\)/, 'the order page still has the en-route stage the policy refers to');
});

test('privacy policy names the outside services used on demand (map search, voice, WhatsApp)', () => {
  const p = read('legal/privacy.html');
  assert.match(p, /Nominatim/); assert.match(p, /إملاء وصف المشكلة بالصوت/); assert.match(p, /واتساب/);
});

test('in-app policy sheet: full text from legal/*.html, no hard-coded pale colour, safe parsing', () => {
  const s = read('apps/customer/pages/support.page.js');
  assert.doesNotMatch(s, /#eadfe7/);
  assert.match(s, /const POLICY_PAGE = \{ privacy: 'privacy\.html', terms: 'terms\.html', cancel: 'cancellation\.html' \}/);
  assert.match(s, /querySelectorAll\('script,style,iframe,object,embed,form,img,\.links'\)/);
  assert.match(read('apps/customer/styles/brand-2026.css'), /#sheet \.policy-text\{[^}]*color:var\(--text-primary\)/);
});

test('legal texts are formal Arabic and cover what Egyptian law expects', () => {
  const p = read('legal/privacy.html'), t = read('legal/terms.html'), c = read('legal/cancellation.html');
  for (const [n, h] of [['privacy', p], ['terms', t], ['cancellation', c]]) assert.doesNotMatch(h.replace(/<[^>]+>/g, ' '), /(^|[\s،.«(])(بتاعك|عشان|دلوقتي|ببلاش|مش|احنا|بنجمع|بيشوف|هنبلّغك)(?=[\s،.»)]|$)/, n + ' has no colloquial wording');
  assert.match(p, /قانون حماية البيانات الشخصية رقم 151 لسنة 2020/);
  for (const k of ['المتحكم في البيانات', 'مسؤول حماية البيانات', 'نقل البيانات خارج جمهورية مصر العربية', 'الإخطار بخرق البيانات', 'مركز حماية البيانات الشخصية', 'سحب موافقتك']) assert.ok(p.includes(k), 'privacy: ' + k);
  for (const k of ['قانون حماية المستهلك', 'جهاز حماية المستهلك', 'القوة القاهرة', 'الملكية الفكرية', 'القانون الواجب التطبيق', 'النص العربي']) assert.ok((t + c).includes(k), 'terms: ' + k);
  assert.ok((p + t).includes('class="fill"'), 'owner details are marked to be completed, never invented');
});

test('sign-up asks for agreement to the policies (customer and provider)', () => {
  assert.match(read('apps/customer/pages/account.page.js'), /class="auth-legal">بالمتابعة، فإنك توافق على <a href="\.\.\/\.\.\/legal\/terms\.html"/);
  assert.match(read('apps/provider/app.js'), /class="pv-wide pv-legal">بإرسال الطلب، فإنك توافق على/);
});