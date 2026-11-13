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

test('service worker precaches standalone Provider entry, renderer modules and bumps cache version', () => {
  const sw=fs.readFileSync(path.join(ROOT,'service-worker.js'),'utf8');
  assert.match(sw,/hansalhlak-v8-architecture-5/);
  for(const file of ['apps/provider/index.html','apps/provider/styles/provider.css','apps/provider/app.js',...fs.readdirSync(path.join(ROOT,'apps/provider/pages')).filter(x=>x.endsWith('.js')).map(x=>`apps/provider/pages/${x}`)]) assert.ok(sw.includes(`'${file}'`),`${file} should be precached`);
});
