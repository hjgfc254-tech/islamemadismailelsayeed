'use strict';
/* Site content managed from the Admin Center (shared/content/site-content.js) and its use by the Customer app:
   defaults stay intact without published content; published hero / slides / icons render (escaped); images are
   cached per device; missing images trigger a refetch. Runs the real scripts in node:vm (no Cache API → memory). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boot, scripts, ROOT } = require('../helpers/customer-app-harness.js');

function load() {
  const mem = new Map(), events = [];
  const ctx = { console, URL, fetch: async () => { throw new Error('no network'); },
    localStorage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) },
    dispatchEvent: e => events.push(e.type), CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } } };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['shared/icons/icon-registry.js', 'shared/content/site-content.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { ctx, mem, events, run: c => vm.runInContext(c, ctx) };
}
const IMG = 'data:image/webp;base64,UklGRgAAAABXRUJQ';
const PAYLOAD = {
  v: 3,
  hero: { eyebrow: 'عرض', title: 'عنوان <b>جديد</b>', accent: 'بسرعة', sub: 'وصف', cta: 'اطلب', media: 'mhero000001' },
  slides: [{ id: 'one', title: 'شريحة', desc: 'نص', cta: 'ابدأ', action: 'wizard', media: 'mslide00001', active: true },
           { id: 'off', title: 'مخفية', action: 'none', active: false }],
  icons: { 'c-electric': 'micon000001' },
  media: { mhero000001: IMG, mslide00001: IMG, micon000001: IMG }
};

test('the Customer and Admin entries load site-content.js after the icon registry', () => {
  const list = scripts();
  assert.ok(list.indexOf('shared/content/site-content.js') > list.indexOf('shared/icons/icon-registry.js'));
  assert.ok(list.indexOf('shared/content/site-content.js') < list.indexOf('apps/customer/app.js'));
  assert.match(fs.readFileSync(path.join(ROOT, 'apps/admin/index.html'), 'utf8'), /shared\/content\/site-content\.js[\s\S]*modules\/site-content-editor\.js/);
});

test('without published content every getter returns the defaults signal (null / empty)', () => {
  const { run } = load();
  assert.equal(run('HSSiteContent.version()'), 0);
  assert.equal(run('HSSiteContent.hero()'), null);
  assert.equal(run('HSSiteContent.slides()'), null);
  assert.equal(run("HSSiteContent.iconUrl('c-electric')"), '');
  assert.equal(run("icPhoto('c-electric')"), '', 'no bundled photo by default: categories render as the premium line icons (2026-11-20)');
});

test('applying published content: hero/slides/icons resolve, hidden slides drop, version persists, missing() empty', async () => {
  const { run, mem, events } = load();
  await run(`HSSiteContent.apply(${JSON.stringify(PAYLOAD)})`);
  assert.equal(run('HSSiteContent.version()'), 3);
  const h = run('HSSiteContent.hero()');
  assert.equal(h.title, 'عنوان <b>جديد</b>'); assert.equal(h.img, IMG, 'image available (memory fallback without Cache API)');
  const s = run('HSSiteContent.slides()');
  assert.equal(s.length, 1, 'inactive slides are not shown'); assert.equal(s[0].action, 'wizard');
  assert.equal(run("HSSiteContent.iconUrl('c-electric')"), IMG);
  assert.equal(run("icPhoto('c-electric')"), IMG, 'icon registry prefers the published image');
  assert.deepEqual(JSON.parse(JSON.stringify(run('HSSiteContent.missing()'))), []);
  assert.ok(events.includes('hs:content'), 'renderers are notified');
  assert.equal(JSON.parse(mem.get('hs_site_content')).v, 3, 'content JSON cached locally (images are not stored in localStorage)');
  assert.doesNotMatch(mem.get('hs_site_content'), /base64/);
});

test('after a reload without cached images, missing() asks for them again', async () => {
  const first = load();
  await first.run(`HSSiteContent.apply(${JSON.stringify(PAYLOAD)})`);
  const saved = first.mem.get('hs_site_content');
  const second = load();
  second.mem.set('hs_site_content', saved);
  await second.run('HSSiteContent.init()');
  assert.equal(second.run('HSSiteContent.version()'), 3);
  assert.deepEqual(JSON.parse(JSON.stringify(second.run('HSSiteContent.missing()'))).sort(), ['mhero000001', 'micon000001', 'mslide00001']);
  assert.equal(second.run('HSSiteContent.hero()').img, '', 'no broken image: the renderer falls back to the default art');
});

test('Customer Home renders the published hero and slides (escaped) and keeps the defaults otherwise', async () => {
  const plainApp = boot({});
  assert.match(plainApp.html(), /كل ما تحتاجه من خدمات/, 'default hero');
  assert.match(plainApp.html(), /خدمتك على بُعد خطوات/, 'default slides');
  const app = boot({});
  await app.run(`HSSiteContent.apply(${JSON.stringify(PAYLOAD)})`);
  app.run("show('home')");
  const html = app.html();
  assert.match(html, /عنوان &lt;b&gt;جديد&lt;\/b&gt;/, 'admin text is escaped');
  assert.doesNotMatch(html, /<b>جديد<\/b>/);
  assert.match(html, /<span>بسرعة<\/span>/);
  assert.match(html, /class="hero-photo" src="data:image\/webp/);
  assert.match(html, /data-act="slideGo" data-to="wizard">ابدأ/);
  assert.doesNotMatch(html, /مخفية/, 'hidden slide not rendered');
  assert.doesNotMatch(html, /خدمتك على بُعد خطوات/, 'published slides replace the built-in ones');
});
