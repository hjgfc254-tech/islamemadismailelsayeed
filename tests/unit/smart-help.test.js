'use strict';
/* 2026-11-24: emergency, diagnose, smart Home card, maintenance reminders, WhatsApp share, rating celebration. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
function boot() {
  const store = {};
  const ctx = { console, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
  ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('services/local-catalog.js') + ';globalThis.CAT = CAT;', ctx);
  vm.runInContext(read('apps/customer/pages/smart-help.js'), ctx);
  return ctx;
}

test('smart-help loads before Home and is precached', () => {
  const html = read('apps/customer/index.html');
  assert.ok(html.indexOf('pages/smart-help.js') > -1 && html.indexOf('pages/smart-help.js') < html.indexOf('pages/home.page.js'));
  assert.match(read('service-worker.js'), /'apps\/customer\/pages\/smart-help\.js'/);
  assert.match(read('apps/customer/pages/home.page.js'), /root\.HSSmartHelp\?root\.HSSmartHelp\.homeCard\(\):''[\s\S]*?data-chat-open[\s\S]*?root\.HSSmartHelp\?root\.HSSmartHelp\.myHome\(\):''/);
});

test('emergency: safety steps first, real emergency numbers, gas is never sent straight to a technician', () => {
  const S = boot().HSSmartHelp;
  for (const k of ['water', 'spark', 'power', 'gas']) assert.ok(S.EMG[k].steps.length >= 3, k);
  assert.ok(S.EMG.gas.call.some(([n]) => n === '129'), 'gas emergency 129');
  assert.ok(S.EMG.spark.call.some(([n]) => n === '180'), 'fire 180');
  assert.match(read('apps/customer/pages/smart-help.js'), /kind === 'gas' \? 'المكان اتأمّن — اطلب فني يكشف'/);
  const C = boot().CAT; for (const k of Object.keys(S.EMG)) assert.ok(C.item(S.EMG[k].item), k + ' item exists');
});

test('Home card: season by month, due reminder wins, emergency stands out at night — no invented numbers', () => {
  const ctx = boot(), S = ctx.HSSmartHelp;
  const june = S.homeCard(new Date(2026, 5, 10, 14)); assert.match(june, /item\|appliances\/ac/); assert.doesNotMatch(june, /is-night/);
  const dec = S.homeCard(new Date(2026, 11, 10, 23)); assert.match(dec, /item\|appliances\/heater-electric/); assert.match(dec, /smart-help is-night/);
  assert.doesNotMatch(S.homeCard(new Date(2026, 8, 1, 12)), /smart-card/, 'September: no seasonal card');
  ctx.localStorage.setItem('hs_maint_v1', JSON.stringify([{ item: 'plumbing/water-tanks', name: 'خزانات مياه', due: '2000-01-01' }]));
  assert.match(S.homeCard(new Date(2026, 5, 10)), /smart-card is-due[^>]*item\|plumbing\/water-tanks/);
  assert.doesNotMatch(S.homeCard(), /\d+\s*(فني|طلب)\s*(متاح|اتنفذ)/, 'no made-up live counts');
});

test('maintenance reminders: only items with a known cycle; stored on this device', () => {
  const ctx = boot(), S = ctx.HSSmartHelp;
  assert.equal(S.reminderButton({ itemId: 'carpentry/doors' }), '');
  assert.match(S.reminderButton({ itemId: 'appliances/ac' }), /data-remind="appliances\/ac"[^>]*>.*بعد 6 شهور/);
  assert.equal(S.remind('appliances/ac'), true);
  assert.equal(S._read()[0].item, 'appliances/ac');
  assert.match(S.reminderButton({ itemId: 'appliances/ac' }), /هنفكّرك/);
  assert.match(read('apps/customer/pages/order-details.page.js'), /if \(closed && root\.HSSmartHelp\)/);
});

test('tracking shares to WhatsApp on tap; a 4–5 star rating gets a short celebration', () => {
  assert.match(read('apps/customer/pages/order-details.page.js'), /https:\/\/wa\.me\/\?text=\$\{encodeURIComponent\(root\.requestShareText\(r\)\)\}/);
  assert.match(read('apps/customer/pages/market-ui.page.js'), /const confetti = s >= 4 \?/);
  assert.match(read('apps/customer/styles/brand-2026.css'), /prefers-reduced-motion:reduce\)\{\.confetti\{display:none\}/);
});

test('«بيتي» lists only this customer\'s finished devices; voice description only where the browser supports it', () => {
  const ctx = boot(), S = ctx.HSSmartHelp;
  assert.equal(S.myHome(), '', 'no session → nothing');
  ctx.me = () => ({ id: 'c1' });
  ctx.MP = { db: () => ({ serviceRequests: [
    { customerId: 'c1', status: 'closed', itemId: 'appliances/ac', createdAt: '2026-06-01T10:00:00Z' },
    { customerId: 'c1', status: 'searching', itemId: 'plumbing/faucets', createdAt: '2026-11-01T10:00:00Z' },
    { customerId: 'c2', status: 'closed', itemId: 'appliances/fridge', createdAt: '2026-06-01T10:00:00Z' }] }) };
  vm.runInContext('var me = globalThis.me; var MP = globalThis.MP;', ctx);
  const h = S.myHome();
  assert.match(h, /data-wz-hit="item\|appliances\/ac"/);
  assert.doesNotMatch(h, /plumbing\/faucets|appliances\/fridge/, 'open requests and other customers are left out');
  const wiz = read('apps/customer/pages/request-wizard.page.js');
  assert.match(wiz, /\$\{wzVoiceOk\(\) \? `<button type="button" class="chip wz-voice" data-wz-voice/);
  assert.match(wiz, /rec\.lang = 'ar-EG-u-nu-latn'/);
});
