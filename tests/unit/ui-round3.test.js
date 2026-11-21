'use strict';
/* Round 3 UI: price-from on tiles, pinned active request, how-it-works, real reviews, help/offline, wizard map + skip,
   admin trend charts (dataviz rules) and quick search, provider today card + new-request alert. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boot, ROOT } = require('../helpers/customer-app-harness.js');
const P = require('../helpers/provider-app-harness.js');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Home: active request pinned above the hero, how-it-works for first visits, real reviews only when they exist', () => {
  const guest = boot({});
  const html = guest.html();
  assert.match(html, /إزاي هنصلحلك بتشتغل؟/, 'first visit sees how it works');
  assert.doesNotMatch(html, /آراء عملائنا/, 'no reviews → no section (nothing invented)');
  assert.match(html, /data-from-cat="electric" hidden/, 'price-from placeholder stays hidden until real prices load');
  const app = boot({});
  app.signIn(); app.newRequest();
  app.run(`MP.db().reviews.push({ id:'rv_x', reqId:'nope', providerId:'p_demo1', customerId:'c', stars:5, comment:'شغل ممتاز ومحترم', at:new Date().toISOString() })`);
  app.run("show('home')");
  const h2 = app.html();
  assert.ok(h2.indexOf('act-card') > -1 && h2.indexOf('act-card') < h2.indexOf('class="hero"'), 'active request is above the hero');
  assert.doesNotMatch(h2, /إزاي هنصلحلك بتشتغل؟/, 'returning customers do not see the explainer');
  assert.match(h2, /آراء عملائنا/); assert.match(h2, /شغل ممتاز ومحترم/);
});

test('wizard: Leaflet map picker is vendored, lazy-loaded and attributed; help button opens the support centre', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/vendor/maplibre/4.7.1/maplibre-gl.js')));
  const wiz = read('apps/customer/pages/request-wizard.page.js');
  assert.match(wiz, /data-act="wzMap"/); assert.match(wiz, /HSMap\.picker/); { const m = read('shared/components/hs-map.js'); assert.match(m, /OpenStreetMap/); assert.match(m, /tiles\.openfreemap\.org/); assert.match(m, /maplibre/); }
  assert.match(read('shared/components/hs-map.js'), /LIB \+ 'maplibre-gl\.js'/, 'map library loaded on first use only');
  const app = read('apps/customer/app.js');
  assert.match(app, /b\.addEventListener\('click', \(\) => \{ try \{ go\('support'\); \} catch \{\} \}\);/);
  assert.match(app, /addEventListener\('offline', \(\) => set\(false\)\)/);
  assert.match(read('apps/customer/styles/customer.css'), /html\[data-fs="lg"\] #app,html\[data-fs="lg"\] #sheet\{zoom:1\.12\}/);
});

test('admin trend charts: daily buckets, one hue, peak label, per-bar tooltip and a table view', () => {
  const ctx = { console, Intl }; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read('apps/admin/modules/mini-charts.js'), ctx);
  const C = ctx.HSMiniCharts;
  const today = new Date().toISOString();
  const pts = C.daily([{ at: today, v: 100 }, { at: today, v: 50 }, { at: '2001-01-01', v: 9 }], 14, x => x.at, x => x.v);
  assert.equal(pts.length, 14); assert.equal(pts[13].value, 150, 'summed into today'); assert.equal(pts.reduce((a, p) => a + p.value, 0), 150, 'out-of-range ignored');
  const html = C.bars({ id: 't', title: 'قيمة', unit: 'ج.م', points: pts });
  assert.match(html, /<figcaption id="t-t" class="mc-t"><b>قيمة<\/b>/);
  assert.equal((html.match(/class="mc-peak"/g) || []).length, 1, 'one selective direct label');
  assert.match(html, /data-tip="[^"]+ — [^"]+ ج\.م"/); assert.match(html, /<details class="mc-table">/);
  assert.match(read('apps/admin/pages/admin-dashboard.page.js'), /chartsHtml\(\)/);
});

test('admin quick search: Ctrl/⌘+K and a header button open an RBAC-filtered palette', () => {
  const src = read('apps/admin/modules/command-palette.js');
  assert.match(src, /\(e\.ctrlKey \|\| e\.metaKey\) && !e\.altKey/);
  assert.match(src, /querySelectorAll\('a\[href\^="#\/"\]'\)/, 'pages come from the rendered (RBAC-filtered) navigation');
  assert.match(read('apps/admin/admin-shell.js'), /data-adm-palette aria-label="بحث سريع \(Ctrl\+K\)"/);
  assert.match(read('apps/admin/index.html'), /modules\/command-palette\.js/);
});

test('round 4: announcement bar on Home, category header, sticky wizard nav, motion and busy-button spinner', () => {
  const app = boot({});
  app.run("HSSiteContent.banner = () => ({ text: 'عرض <b>العيد</b>', action: 'wizard' }); show('home')");
  const html = app.html();
  assert.match(html, /<div class="site-banner" role="note" data-part="banner">/);
  assert.match(html, /عرض &lt;b&gt;العيد&lt;\/b&gt;/, 'banner text is escaped');
  assert.match(html, /data-act="slideGo" data-to="wizard">اعرف أكتر/);
  app.run("startRequest('electric')");
  assert.match(app.html(), /class="cat-hero"/); assert.match(app.html(), /class="row2 wz-nav"/);
  const css = read('apps/customer/styles/customer.css');
  assert.match(css, /button\[aria-busy="true"\]::after/); assert.match(css, /#view>\.screen\.screen-in\{animation:screenIn/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{#view>\.screen\.screen-in\{animation:none\}/);
  assert.match(read('apps/customer/app.js'), /function mountSheetSwipe\(\)/);
});

test('provider: today card and a new-request alert after the first render', async () => {
  const app = P.boot({ session: 'p_demo1' });
  assert.match(app.html(), /<section class="pv-ohead">[\s\S]*النهارده:/, 'today\'s total in the orders header');
  app.go('#/earnings');
  assert.match(app.html(), /<section class="pv-today" aria-label="مكسبك النهارده">/);
  P.offerRequest(app.MP, 'p_demo1');
  app.go('#/new');
  assert.match(app.toast.textContent, /وصلك طلب جديد/);
});