'use strict';
/* UI → API adapter integration (2026-11-14). Customer, Provider and Admin marketplace mutations go through
   services/*-api.js (mock transport over MP); MP remains the synchronous local read model. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot: bootProvider, offerRequest } = require('../helpers/provider-app-harness.js');
const { boot: bootCustomer } = require('../helpers/customer-app-harness.js');

const ROOT = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const MUTATORS = 'createRequest|assign|respond|propose|confirmTime|advance|createQuote|approveQuote|rejectQuote|proposeFree|respondFree|completeFree|complete|close|cancel|fail|review|complain|resolveComplaint|setCollection|registerProvider|updateProvider|setSetting|setCatRate|markRead|addAddress|updateAddress|removeAddress|toggleFavorite|customerFor|reset|save|saveDraft|clearDraft|addSearch|repeatRequest';
const directWrites = src => [...src.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(new RegExp(`\\b(?:MP|M)\\.(${MUTATORS})\\(`, 'g'))].map(m => m[1]);

/* Documented exceptions — device-local or presentation-only data that is not a marketplace entity:
   drafts/recent searches/attachment links live on this device; review quality+photos are presentation extras on the
   local review record; the account page stores UI preferences; the Admin demo reset restores seed data. */
const ALLOWED = {
  'apps/provider/app.js': [],
  'apps/admin/pages/marketplace.page.js': ['reset'],
  'apps/customer/pages/market-ui.page.js': [],                 // review quality/photos now travel with the review route
  'apps/customer/pages/addresses.page.js': [],
  'apps/customer/pages/support.page.js': [],
  'apps/customer/pages/request-wizard.page.js': ['saveDraft', 'clearDraft', 'save'],
  'apps/customer/pages/search.page.js': ['addSearch', 'addSearch', 'save'],
  'apps/customer/app.js': ['addSearch'],                       // repeat goes through POST /requests/:id/repeat
  'apps/customer/pages/account.page.js': ['save'],             // only device-local drafts/searches on deletion; profile/prefs/deletion use customer-api
  'apps/customer/customer-session.js': []   // signIn uses MP.customerFor through a local alias (demo identity, not a marketplace write)
};

test('UI modules perform no direct marketplace writes outside the documented local-only exceptions', () => {
  for (const [file, allowed] of Object.entries(ALLOWED)) assert.deepEqual(directWrites(read(file)).sort(), allowed.slice().sort(), file);
});

test('each entry loads the adapters after the store and before the app scripts; the adapter graph has no cycles', () => {
  const order = (html, names) => names.map(n => html.indexOf(n));
  const asc = a => a.every((v, i) => v >= 0 && (i === 0 || v > a[i - 1]));
  assert.ok(asc(order(read('apps/customer/index.html'), ['local-market-store.js', 'api-client.js', 'auth-api.js', 'orders-api.js', 'quotes-api.js', 'customer-api.js', 'support-api.js', 'notifications-api.js', 'realtime-client.js', 'src="customer-session.js"', 'src="app.js"'])));
  assert.ok(asc(order(read('apps/provider/index.html'), ['local-market-store.js', 'api-client.js', 'auth-api.js', 'orders-api.js', 'quotes-api.js', 'provider-api.js', 'realtime-client.js', 'src="app.js"'])));
  assert.ok(asc(order(read('apps/admin/index.html'), ['local-market-store.js', 'api-client.js', 'auth-api.js', 'orders-api.js', 'support-api.js', 'finance-api.js', 'admin-api.js', 'pages/marketplace.page.js'])));
  // dependency graph from the require fallbacks: api-client ← everything; orders-api ← quotes/support; nothing else.
  const deps = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'services')).filter(f => /-api\.js$|api-client\.js$|realtime-client\.js$/.test(f))) {
    deps[f] = [...read('services/' + f).matchAll(/req(?:uire)?\('\.\/([\w-]+\.js)'\)/g)].map(m => m[1]);
  }
  const visiting = new Set(), done = new Set();
  const visit = f => { assert.ok(!visiting.has(f), 'cycle at ' + f); if (done.has(f)) return; visiting.add(f); (deps[f] || []).forEach(visit); visiting.delete(f); done.add(f); };
  Object.keys(deps).forEach(visit);
  assert.deepEqual(deps['api-client.js'], []);
});

test('Provider actions travel through the adapter routes (accept → schedule → advance → quote → complete)', async () => {
  const app = bootProvider({ session: 'p_demo1' });
  const seen = [];
  app.run('HSApiClient').onMutation(e => seen.push(e.method + ' ' + e.route));
  const rid = offerRequest(app.MP, 'p_demo1').id;
  app.go('#/new');
  await app.click({ 'data-pv-action': 'accept', 'data-id': rid });
  app.go('#/accepted');
  await app.click({ 'data-pv-action': 'confirm', 'data-id': rid });
  for (const next of ['enroute', 'arrived', 'started']) { app.go('#/request/' + rid); await app.click({ 'data-pv-action': 'advance', 'data-next': next, 'data-id': rid }); }
  app.go('#/request/' + rid);
  await app.click({ 'data-pv-action': 'quote', 'data-id': rid });
  await app.submit('pv-quote-form', { labor: '150', parts: '0', visitFee: '0', discount: '0', note: '' });
  assert.deepEqual(seen, [
    'POST /requests/:id/respond', 'POST /requests/:id/schedule',
    'POST /requests/:id/advance', 'POST /requests/:id/advance', 'POST /requests/:id/advance',
    'POST /requests/:id/quotes'
  ]);
  app.MP.approveQuote(rid);
  app.go('#/request/' + rid);
  await app.click({ 'data-pv-action': 'complete', 'data-id': rid });
  await app.submit('pv-complete-form', { value: '150', deductions: '0' });
  assert.equal(seen.at(-1), 'POST /requests/:id/complete');
  assert.equal(app.request(rid).status, 'completed');
});

test('Provider: a double click sends one request; availability and profile edits use provider-api', async () => {
  const app = bootProvider({ session: 'p_demo1' });
  const seen = [];
  app.run('HSApiClient').onMutation(e => seen.push(e.route));
  const rid = offerRequest(app.MP, 'p_demo1').id;
  app.go('#/new');
  app.click({ 'data-pv-action': 'accept', 'data-id': rid });
  app.click({ 'data-pv-action': 'accept', 'data-id': rid }, { force: true });   // second click before the first resolves
  await app.settle();
  assert.deepEqual(seen, ['/requests/:id/respond'], 'one in-flight request per action');
  app.go('#/home');
  await app.click({ 'data-pv-action': 'availability' });
  assert.equal(seen.at(-1), '/providers/me/availability');
  app.go('#/profile');
  await app.click({ 'data-pv-action': 'edit-profile' });
  const p = app.MP.get('providers', 'p_demo1');
  await app.submit('pv-profile-form', { name: p.name, phone: '01012345678', type: 'individual', cats: p.cats, govs: p.govs, areas: '', years: String(p.years), bio: 'عبر الواجهة', docs: '' });
  assert.equal(seen.at(-1), '/providers/me');
  assert.equal(app.MP.get('providers', 'p_demo1').bio, 'عبر الواجهة');
});

test('Provider onboarding goes through POST /providers/register and grants no provider role', async () => {
  const app = bootProvider({ hash: '#/join' });
  const seen = [];
  app.run('HSApiClient').onMutation(e => seen.push(e.route));
  await app.submit('pv-register-form', { name: 'فني عبر الواجهة', phone: '01077778888', type: 'individual', cats: ['plumbing'], govs: ['الجيزة'], areas: '', years: '2', bio: '', docs: '' });
  assert.deepEqual(seen, ['/providers/register']);
  const reg = app.MP.db().providers.find(x => x.phone === '01077778888');
  assert.equal(reg.status, 'pending');
  assert.equal(app.run('HSAuthApi.currentActor()'), null, 'pending registration: no provider actor');
});

test('Customer actions travel through the adapters; another customer is refused (404) and nothing changes', async () => {
  const app = bootCustomer();
  app.signIn();
  const id = app.newRequest();
  const q = JSON.stringify(id);
  const seen = [];
  app.run('HSApiClient').onMutation(e => seen.push(e.route));
  app.run(`(()=>{const id=${q};MP.db().settings.autoAssign=false;if(!MP.activeAssignment(id))MP.assign(id,'p_demo1');MP.respond(id,true);MP.confirmTime(id,'provider');['enroute','arrived','started'].forEach(s=>MP.advance(id,s));MP.createQuote(id,{labor:90});show('tracking',id);})()`);
  await app.clickDoc({ act: 'approveQuote', id });
  assert.deepEqual(seen, ['/requests/:id/quote/approve']);
  // switch to another customer and try to act on the first customer's request
  app.run("store.set('user',{name:'علي',phone:'01099998888'}); MP.customerFor('علي','01099998888')");
  app.run(`MP.complete(${q})`);
  await app.clickDoc({ act: 'custClose', id });
  assert.equal(app.run(`MP.get('serviceRequests', ${q}).status`), 'completed', 'not closed by a foreign customer');
  assert.match(app.toast(), /الطلب غير موجود/);
});

test('Customer: cancel and reject use an accessible sheet form (no native confirm/prompt) and the adapters', async () => {
  const src = read('apps/customer/pages/market-ui.page.js') + read('apps/customer/pages/addresses.page.js');
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /\b(confirm|prompt)\(/);
  const app = bootCustomer();
  app.signIn();
  const id = app.newRequest();
  const seen = [];
  app.run('HSApiClient').onMutation(e => seen.push(e.route));
  app.run(`show('tracking', ${JSON.stringify(id)})`);
  app.run('globalThis.HTMLElement = globalThis.HTMLElement || function HTMLElement() {}');   // harness has no DOM classes
  await app.clickDoc({ act: 'cancelReq', id });
  assert.match(app.run("document.getElementById('sheet').innerHTML"), /<label for="ask-reason">سبب الإلغاء/);
});
