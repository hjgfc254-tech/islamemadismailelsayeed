'use strict';
/* V10 polish on the Customer app: trust strip, order journey, provider card, loading skeletons, success moment. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot, ROOT } = require('../helpers/customer-app-harness.js');

test('Home shows the three trust points under the hero (claims the product actually implements)', () => {
  const html = boot({}).html();
  assert.match(html, /<ul class="trust-strip" aria-label="ليه هنصلحلك">/);
  for (const t of ['سعر واضح قبل الحجز', 'فنيين بتراجعهم الإدارة', 'تابع طلبك خطوة بخطوة']) assert.match(html, new RegExp(t));
});

test('Orders and tracking show placeholders (not «no orders» / «not found») while the first server sync runs', () => {
  const app = boot({});
  const stub = 'head:t=>"<h2>"+t+"</h2>",demoBanner:()=>"",offlineNotice:()=>"",empty:(i,t)=>"<p>"+t+"</p>",buttonIcon:()=>"",requestCard:()=>""';
  const loading = app.run(`HSCustomerOrdersPage.render({customer:null,orders:[],${stub},loading:true})`);
  assert.match(loading, /aria-busy="true"/); assert.match(loading, /class="sk-card"/);
  assert.doesNotMatch(loading, /مفيش طلبات لسه/);
  const idle = app.run(`HSCustomerOrdersPage.render({customer:null,orders:[],${stub}})`);
  assert.match(idle, /مفيش طلبات لسه/, 'after loading the honest empty state returns');
});

test('tracking: a five-stage journey with done/current states and a provider card with verified badge and rating', () => {
  const app = boot({});
  const html = app.run(`(() => {
    const MP = { get: () => ({ id:'r1', no:'HS-1', status:'enroute', history:[], cat:'electric', serviceName:'x', gov:'g', area:'a' }),
      providerOf: () => ({ id:'p1', name:'أحمد علي', cats:['electric'], status:'approved', rating:4.6, jobs:12 }), activeAssignment: () => null,
      db: () => ({ reviews: [] }), currentQuote: () => null, catName: () => 'كهرباء', FREE_REASONS: {} };
    return HSCustomerOrderDetailsPage.render({ id:'r1', MP, head:t=>t, demoBanner:()=>'', uiOfflineIfNeeded:()=>'', uiEmpty:()=>'', esc:s=>String(s), ic:n=>'<svg data-n="'+n+'"></svg>',
      icStatus:s=>s, STATUS_LABEL:{ enroute:'في الطريق' }, money:n=>n, fmtDT:d=>d, statusTimeline:()=>'<ol class="tl"><li aria-current="step"></li></ol>', uiSuccess:()=>'', starsHtml:()=>'★' });
  })()`);
  assert.match(html, /<ol class="journey" aria-label="مراحل الطلب — المرحلة الحالية: في الطريق">/);
  assert.equal((html.match(/class="is-done"/g) || []).length, 2, 'received + accepted are done');
  assert.equal((html.match(/class="is-now"/g) || []).length, 1);
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1, 'only the detailed timeline marks the current step');
  assert.match(html, /class="verified"[^>]*>.*موثّق/);
  assert.ok(html.includes('<b>' + (4.6).toLocaleString('ar-EG', { minimumFractionDigits: 1 }) + '</b>'), 'rating in Arabic digits like the rest of the app'); assert.ok(html.includes((12).toLocaleString('ar-EG') + ' خدمة منجزة'));
});

test('request success: animated check drawn with CSS, announced politely, reduced-motion safe', () => {
  const wiz = fs.readFileSync(path.join(ROOT, 'apps/customer/pages/request-wizard.page.js'), 'utf8');
  assert.match(wiz, /class="done glass neon success-pop" role="status" aria-live="polite"/);
  assert.match(wiz, /<svg class="success-check"[^>]*aria-hidden="true"/);
  const css = fs.readFileSync(path.join(ROOT, 'apps/customer/styles/customer.css'), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.success-check circle,\.success-check path\{animation:none;stroke-dashoffset:0\}/);
});

test('order cards: mini five-stage progress + a badge for what needs the customer', () => {
  const app = boot({});
  app.signIn();
  const id = app.newRequest();
  app.run("show('orders')");
  assert.match(app.html(), /<span class="mj" aria-hidden="true"><i class="n"><\/i><i class=""><\/i>/, 'a new request is at stage 1');
  app.run(`(() => { const r = MP.get('serviceRequests', ${JSON.stringify(id)}); r.status = 'enroute'; })()`);
  app.run("show('orders')");
  assert.match(app.html(), /class="rb rb-go">في الطريق إليك</);
  app.run(`(() => { const r = MP.get('serviceRequests', ${JSON.stringify(id)}); r.status = 'completed'; })()`);
  app.run("show('orders')");
  assert.match(app.html(), /class="rb rb-need">أكّد الإتمام</);
});

test('rating: quick tags, a live star label, and a thank-you moment', () => {
  const src = fs.readFileSync(path.join(ROOT, 'apps/customer/pages/market-ui.page.js'), 'utf8');
  assert.match(src, /const RV_TAGS = \['ملتزم بالموعد', 'شغله نضيف', 'أسعاره مناسبة'/);
  assert.match(src, /id="rv-star-label" aria-live="polite"/);
  assert.match(src, /<h3>شكرًا على تقييمك<\/h3>/);
  assert.match(src, /tags\.join\('، '\), String\(d\.get\('comment'\) \|\| ''\)\.trim\(\)\]\.filter\(Boolean\)\.join\(' — '\)\.slice\(0, 500\)/, 'tags travel inside the review comment (no schema change)');
});

test('wizard: price card states and natural «steps left» wording; toasts are typed', () => {
  const app = boot({});
  assert.equal(app.run('wzLeft(0)'), 'آخر خطوة');
  assert.equal(app.run('wzLeft(1)'), 'فاضل خطوة واحدة وتخلص');
  assert.equal(app.run('wzLeft(2)'), 'فاضل خطوتين وتخلص');
  assert.equal(app.run('wzLeft(5)'), 'فاضل 5 خطوات');
  assert.equal(app.run("TOAST_TYPE('تعذّر حفظ')"), 'error');
  assert.equal(app.run("TOAST_TYPE('اختر عدد النجوم')"), 'warn');
  assert.equal(app.run("TOAST_TYPE('تم تسجيل الدخول')"), 'success');
  assert.equal(app.run("TOAST_TYPE('جارٍ تسجيل الدخول…')"), 'info');
  const wiz = fs.readFileSync(path.join(ROOT, 'apps/customer/pages/request-wizard.page.js'), 'utf8');
  assert.match(wiz, /class="price-card is-loading" id="wz-price"/);
  assert.match(wiz, /السعر ده ثابت وشامل رسوم المنصة — مش هيتغير إلا بموافقتك\./);
});

test('provider profile: rating distribution and «member since»; notifications grouped with unread dots', () => {
  const app = boot({});
  app.run(`MP.db().reviews.push({ id:'rv_t1', reqId:'r_t', providerId:'p_demo1', customerId:'c', stars:5, comment:'ممتاز', at:new Date().toISOString() }, { id:'rv_t2', reqId:'r_t2', providerId:'p_demo1', customerId:'c', stars:4, comment:'', at:new Date().toISOString() })`);
  app.run("show('providerDetails', 'p_demo1')");
  const html = app.html();
  assert.match(html, /class="rating-break glass neon" aria-label="توزيع التقييمات"/);
  assert.match(html, /<li><span>5<\/span><i style="--w:\d+%"><\/i>/);
  const src = fs.readFileSync(path.join(ROOT, 'apps/customer/app.js'), 'utf8');
  assert.match(src, /group\('النهارده', ns\.filter\(isToday\)\) \+ group\('قبل كده'/);
  assert.match(src, /const ns = MP\.notesFor\('customer:'\+c\.id\)\.slice\(0, 30\)\.map\(n => \(\{ \.\.\.n \}\)\);\r?\n  try \{ if \(typeof HSNotificationsApi/, 'unread state captured before marking read');
});

test('live screens also follow server syncs (Firebase), silently; other-tab changes are announced', () => {
  const src = fs.readFileSync(path.join(ROOT, 'apps/customer/app.js'), 'utf8');
  assert.match(src, /e\.source === 'storage' \|\| e\.source === 'firebase'\) liveRefresh\(e\.source === 'storage'\)/);
});
