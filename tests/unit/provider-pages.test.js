'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');
function load(file, sandbox={}) {
  const context = vm.createContext({globalThis:null, ...sandbox});
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, {filename:file});
  return context;
}
test('provider page modules register independent render functions', () => {
  const files = fs.readdirSync(path.join(ROOT,'apps/provider/pages')).filter(x=>x.endsWith('.js'));
  assert.equal(files.length, 12);
  for (const file of files) {
    const context=load(`apps/provider/pages/${file}`);
    const registered=Object.keys(context).find(k=>k.startsWith('HSProvider')&&k.endsWith('Page'));
    assert.ok(registered, `${file} should register a page renderer`);
    assert.equal(typeof context[registered].render,'function');
  }
});
test('provider route parser accepts every standalone route and decodes request ids', () => {
  const context=load('apps/provider/provider-router.js',{location:{hash:''}});
  for (const page of ['home','new','accepted','progress','quote','schedule','done','cancelled','reviews','transactions','earnings','services','notifications','profile']) {
    assert.equal(context.HSProviderRouter.parse(`#/${page}`).page,page);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(context.HSProviderRouter.parse('#/request/req%201'))),{page:'request',id:'req 1'});
});
test('provider entry loads local data and dependencies before renderers and app', () => {
  const html=fs.readFileSync(path.join(ROOT,'apps/provider/index.html'),'utf8');
  const ordered=['local-market-store.js','provider-request-domain.js','provider-domain.js','provider-auth.js','provider-session.js','provider-router.js','provider-shell.js','pages/dashboard.page.js','pages/request-details.page.js','app.js'];
  let last=-1;
  for(const item of ordered){const index=html.indexOf(item);assert.ok(index>last,`${item} must load in dependency order`);last=index;}
  assert.match(html,/<main id="provider-app">/);
  assert.match(html,/manifest\.json/);
  assert.match(html,/serviceWorker\.register\('\.\.\/\.\.\/service-worker\.js'\)/);
});
test('provider renderers escape user-controlled text and render meaningful empty states', () => {
  const dashboard=load('apps/provider/pages/dashboard.page.js').HSProviderDashboardPage;
  const ctx={p:{},groups:{new:[],accepted:[],progress:[],quote:[]},transactions:[],summary:()=>'<summary/>',requestCard:()=>'',date:()=>'',esc:x=>String(x)};
  const html=dashboard.render(ctx);
  assert.match(html,/الأولوية الآن/); assert.match(html,/لا توجد طلبات/); assert.match(html,/لا توجد مواعيد/);
  const profile=load('apps/provider/pages/profile.page.js').HSProviderProfilePage;
  const profileHtml=profile.render({p:{name:'<img src=x>',cats:[],govs:[],areas:[],status:'approved'},esc:x=>String(x).replaceAll('<','&lt;').replaceAll('>','&gt;'),catName:x=>x});
  assert.match(profileHtml,/&lt;img/); assert.doesNotMatch(profileHtml,/<img/);
});

test('provider stylesheet sizes ic() icons and the entry declares a favicon (P2 browser defects)', () => {
  const css=fs.readFileSync(path.join(ROOT,'apps/provider/styles/provider.css'),'utf8');
  const rule=/\.pv-app svg\.i\{([^}]*)\}/.exec(css);
  assert.ok(rule,'provider.css must define the svg.i icon contract');
  for(const decl of ['width:1em','height:1em','fill:none','stroke:currentColor']) assert.ok(rule[1].includes(decl),`svg.i must set ${decl}`);
  const html=fs.readFileSync(path.join(ROOT,'apps/provider/index.html'),'utf8');
  assert.match(html,/<link rel="icon" type="image\/webp" href="\.\.\/\.\.\/assets\/brand\/logo-v10-mark\.webp">/);   // V10 owner logo mark
  assert.ok(fs.existsSync(path.join(ROOT,'assets/brand/logo-v10-mark.webp')));
});

test('every pv-* class emitted by the Provider runtime has a rule in provider.css', () => {
  const css=fs.readFileSync(path.join(ROOT,'apps/provider/styles/provider.css'),'utf8');
  const sources=['apps/provider/app.js','apps/provider/provider-shell.js',...fs.readdirSync(path.join(ROOT,'apps/provider/pages')).map(f=>`apps/provider/pages/${f}`)];
  /* Not classes: inline form ids (styled via .pv-inline-form) and the preview id (styled via .pv-calc). Modifier styled by its base class: pv-finance-kpis (+ .pv-kpis). */
  const notStyledByOwnRule=new Set(['pv-reject-form','pv-propose-form','pv-quote-form','pv-complete-form','pv-complete-preview','pv-reg-phone-hint','pv-free-form','pv-profile-form','pv-finance-kpis']);
  const missing=new Set();
  for(const file of sources){
    const js=fs.readFileSync(path.join(ROOT,file),'utf8');
    for(const m of js.matchAll(/(?<![\w-])pv-[a-z0-9-]+/g)) if(!notStyledByOwnRule.has(m[0])&&!css.includes('.'+m[0])) missing.add(`${m[0]} (${file})`);
  }
  assert.deepEqual([...missing],[],'unstyled Provider classes');
  assert.match(css,/\.pv-toast\{[^}]*position:fixed[^}]*opacity:0/,'toast hidden until shown, out of document flow');
  assert.match(css,/\.pv-toast\.is-visible\{[^}]*opacity:1/);
  assert.doesNotMatch(css,/\.pv-toast\{[^}]*(visibility:hidden|display:none)/,'live region must stay in the accessibility tree');
  assert.match(css,/\.pv-availability\.is-on\{/,'availability on-state is visually distinct');
  assert.match(css,/\.pv-app \[hidden\]\{display:none!important\}/,'the hidden attribute must beat component display rules (nav on picker/gate)');
});

test('provider login route hands off to the standalone demo picker and collects no credentials (G4)', () => {
  const html=fs.readFileSync(path.join(ROOT,'apps/provider/login.html'),'utf8');
  assert.match(html,/<html lang="ar" dir="rtl">/);
  assert.match(html,/http-equiv="refresh" content="0;url=index\.html"/);
  assert.match(html,/location\.replace\('index\.html'\+location\.hash\)/);
  assert.match(html,/<a href="index\.html">/,'no-JS fallback link');
  assert.match(html,/لا توجد مصادقة فعلية/,'demo notice');
  assert.doesNotMatch(html,/<input|<form|password/i,'must not imitate a real login');
  assert.match(fs.readFileSync(path.join(ROOT,'_redirects'),'utf8'),/^\/provider\/login \/apps\/provider\/login\.html 200$/m);
});

test('service worker precaches standalone Provider entry, renderer modules and bumps cache version', () => {
  const sw=fs.readFileSync(path.join(ROOT,'service-worker.js'),'utf8');
  assert.match(sw,/hansalhlak-v11-firebase-4/);
  for(const file of ['apps/provider/index.html','apps/provider/styles/provider.css','apps/provider/app.js',...fs.readdirSync(path.join(ROOT,'apps/provider/pages')).filter(x=>x.endsWith('.js')).map(x=>`apps/provider/pages/${x}`)]) assert.ok(sw.includes(`'${file}'`),`${file} should be precached`);
});
