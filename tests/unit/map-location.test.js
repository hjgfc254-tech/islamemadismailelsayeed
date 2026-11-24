'use strict';
/* 2026-11-24: the map opens on the customer's governorate (never the world), stays inside Egypt, searches addresses,
   names the street under the pin and explains a refused / unavailable position with iPhone + Android steps. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
function load() {
  const ctx = { document: { currentScript: null, head: null }, navigator: {}, localStorage: { getItem: () => null, setItem() {} } };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read('shared/components/hs-map.js'), ctx);
  return ctx.HSMap;
}

test('every governorate the wizard offers has a map centre inside Egypt', () => {
  const M = load();
  const src = read('services/local-market-store.js');
  const govs = JSON.parse(src.slice(src.indexOf('GOVS = [') + 7, src.indexOf('];', src.indexOf('GOVS = [')) + 1).replace(/'/g, '"'));
  assert.equal(govs.length, 27);
  for (const g of govs) {
    const c = M.centerFor(g); assert.ok(c, g);
    assert.ok(c.lat > 22 && c.lat < 32 && c.lng > 24 && c.lng < 35, g + ' inside Egypt');
  }
  assert.deepEqual(M.centerFor('محافظة الجيزة'), M.centerFor('الجيزة'), 'OSM «محافظة …» prefix');
  assert.equal(M.centerFor('باريس'), null);
  assert.equal(M.govOf('محافظة الإسكندرية'), 'الإسكندرية');
});

test('picker: governorate start, Egypt bounds, asks for the position at once, search + street under the pin', () => {
  const src = read('shared/components/hs-map.js');
  assert.match(src, /const start = opts\.start \|\| lastKnown\(\) \|\| govC \|\| CAIRO;/);
  assert.match(src, /maxBounds: EGYPT, minZoom: 5/);
  assert.match(src, /if \(state === 'denied'\) showErr\(geoHelp\(\{ code: 1 \}\)\);\s*else ask\(\);/, 'prompt / granted → ask now');
  assert.match(src, /countrycodes=eg/); assert.match(src, /accept-language=ar/);
  assert.match(src, /setTimeout\(async \(\) => \{ const a = await reverse\(centre\(\)\)/, 'reverse lookup debounced');
});

test('geoHelp explains denied / off / weak signal with concrete steps', () => {
  const M = load();
  const d = M.geoHelp({ code: 1 });
  assert.equal(d.kind, 'denied'); assert.ok(d.steps.some((s) => /آيفون/.test(s)) && d.steps.some((s) => /أندرويد/.test(s)));
  assert.equal(M.geoHelp({ code: 2 }).kind, 'off'); assert.equal(M.geoHelp({ code: 3 }).kind, 'slow'); assert.equal(M.geoHelp(null).kind, 'unsupported');
});

test('wizard: location card first, the found place fills only empty fields', () => {
  const wiz = read('apps/customer/pages/request-wizard.page.js');
  assert.ok(wiz.indexOf('${geoCard}') < wiz.indexOf('<label for="wz-gov">'), 'location before the typed address');
  assert.match(wiz, /if \(a\.area && !\(A\.area \|\| ''\)\.trim\(\)\) A\.area = a\.area;/);
  assert.match(wiz, /onHelp: wzGeoHelp/);
});
