'use strict';
/* Customer providers page (pages/providers.page.js): renderer contract + wiring into the real Customer runtime.
   Extraction parity with the previous market-ui.page.js renderers was verified byte-for-byte (78 renders) at extraction time. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boot, scripts, ROOT } = require('../helpers/customer-app-harness.js');

const Page = (() => { const c = {}; c.globalThis = c; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps/customer/pages/providers.page.js'), 'utf8'), c); return c.HSCustomerProvidersPage; })();
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function ctx(over = {}) {
  const providers = { p1: { id: 'p1', name: 'أحمد <b>مصطفى</b>', cats: ['electric'], govs: ['القاهرة'], areas: [], subs: ['electric/board'], years: 5, jobs: 3, bio: 'نبذة <i>x</i>', available: true, demo: true },
    p2: { id: 'p2', name: 'محمود', cats: ['plumbing'], govs: ['الجيزة'], available: false } };
  const MP = { get: (col, id) => (col === 'providers' ? providers[id] : over.request && id === over.request.id ? over.request : null) || null,
    isFavorite: (c, t, id) => id === 'p1', rating: () => 4.5, catName: c => ({ electric: 'الكهرباء', plumbing: 'السباكة' })[c] || c,
    db: () => ({ reviews: over.reviews || [] }), candidates: () => (typeof over.cands === 'function' ? over.cands(providers) : over.cands || []), providerOf: () => null };
  return { MP, me: () => ({ id: 'c1' }), esc, ic: n => `<i:${n}>`, icp: (x) => x, head: t => `<h2>${t}</h2>`, demoBanner: () => '<demo>',
    uiEmpty: (i, t) => `<empty>${t}</empty>`, uiSuccess: (i, t) => `<ok>${t}</ok>`, uiOfflineIfNeeded: () => '', starsHtml: n => '★'.repeat(n),
    fmtDT: () => 'date', icStatus: s => 'st-' + s, STATUS_LABEL: { searching: 'جارٍ البحث' }, providers, ...over };
}

test('providers.page.js is real code, loaded before market-ui.page.js, and market-ui delegates to it', () => {
  const src = fs.readFileSync(path.join(ROOT, 'apps/customer/pages/providers.page.js'), 'utf8');
  assert.doesNotMatch(src, /PLACEHOLDER|EXTRACTION PENDING|no duplicate logic/);
  const list = scripts();
  assert.ok(list.indexOf('apps/customer/pages/providers.page.js') > -1 && list.indexOf('apps/customer/pages/providers.page.js') < list.indexOf('apps/customer/pages/market-ui.page.js'));
  const market = fs.readFileSync(path.join(ROOT, 'apps/customer/pages/market-ui.page.js'), 'utf8');
  assert.match(market, /HSCustomerProvidersPage\.details\(/);
  assert.match(market, /HSCustomerProvidersPage\.matches\(/);
  assert.match(market, /function providerCard\(p, opts = \{\}\) \{ return HSCustomerProvidersPage\.card\(/, 'global providerCard kept for compatibility');
  assert.doesNotMatch(market, /class="provider-hero/, 'no duplicated provider markup left in market-ui');
});

test('renderers fail loudly when a dependency is missing', () => {
  assert.throws(() => Page.details({ id: 'p1' }), /missing dependencies: MP/);
  assert.throws(() => Page.matches({ ...ctx() }), /missing dependencies: reqId/);
  assert.throws(() => Page.details({ ...ctx() }), /missing dependencies: id/);
});

test('provider card: escapes user text, favorite state, availability and compact/showFav options', () => {
  const c = ctx();
  const html = Page.card(c.providers.p1, {}, c);
  assert.match(html, /أحمد &lt;b&gt;مصطفى&lt;\/b&gt;/); assert.doesNotMatch(html, /<b>مصطفى/);
  assert.match(html, /class="fav-btn on" data-fav-provider="p1" aria-label="مفضلة"/);
  assert.match(html, /data-provider-details="p1"/); assert.match(html, /data-choose-provider="p1"/);
  assert.match(html, /نبذة &lt;i&gt;x&lt;\/i&gt;/);
  const off = Page.card(c.providers.p2, {}, c);
  assert.match(off, /<button disabled><i:clock> غير متاح<\/button>/); assert.doesNotMatch(off, /data-choose-provider/);
  assert.doesNotMatch(Page.card(c.providers.p1, { compact: true }, c), /class="acts"|prov-bio/);
  assert.doesNotMatch(Page.card(c.providers.p1, { showFav: false }, c), /fav-btn/);
});

test('provider details: hero, stats, sub-specialties, reviews (escaped) and empty/not-found states', () => {
  const reviews = [{ providerId: 'p1', stars: 4, quality: 'ممتاز', comment: '<script>x</script>', at: 'z' }];
  const html = Page.details({ ...ctx({ reviews }), id: 'p1' });
  assert.match(html, /<h2>تفاصيل مقدم الخدمة<\/h2>/);
  assert.match(html, /<b>4.5 ★<\/b>/); assert.match(html, /<b>3<\/b>/); assert.match(html, /<b>5 سنة<\/b>/);
  assert.match(html, /<b>board<\/b>/, 'sub-specialty shows its last segment');
  assert.match(html, /التقييمات \(1\)/); assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>x/);
  assert.match(html, /data-provider-service-request="electric"/);
  assert.match(Page.details({ ...ctx(), id: 'p1' }), /<empty>لا توجد تقييمات بعد<\/empty>/);
  assert.match(Page.details({ ...ctx(), id: 'p2' }), /disabled><i:clock> غير متاح حاليًا/);
  assert.match(Page.details({ ...ctx(), id: 'nope' }), /<empty>لم يُعثر على مقدم الخدمة<\/empty>/);
});

test('provider matching: candidates list, no-candidate recovery actions, not-found request', () => {
  const request = { id: 'r1', no: 'HS-1', serviceName: 'كهرباء', gov: 'القاهرة', area: 'م', status: 'searching' };
  const base = ctx({ request });
  const withCands = Page.matches({ ...ctx({ request, cands: ps => [ps.p1, ps.p2] }), reqId: 'r1' });
  assert.match(withCands, /مقدمو الخدمة المطابقون \(2\)/);
  assert.equal((withCands.match(/prov-card/g) || []).length, 2);
  assert.match(withCands, /جارٍ البحث… سيتم إسناد الطلب تلقائيًا/);
  const none = Page.matches({ ...base, reqId: 'r1' });
  for (const act of ['expandSearch', 'editReq', 'cancelReq']) assert.match(none, new RegExp(`data-act="${act}" data-id="r1"`));
  assert.match(Page.matches({ ...ctx(), reqId: 'zz' }), /<empty>لم يُعثر على الطلب<\/empty>/);
});

test('real Customer runtime: provider deep link and in-app provider screens render through the extracted module', () => {
  const app = boot({ hash: '#/provider/p_demo1' });
  assert.match(app.html(), /<h2 tabindex="-1">تفاصيل مقدم الخدمة<\/h2>/);
  assert.match(app.html(), /أحمد مصطفى/);
  assert.match(app.run("providerCard(MP.get('providers','p_demo2'))"), /data-provider-details="p_demo2"/);
});
