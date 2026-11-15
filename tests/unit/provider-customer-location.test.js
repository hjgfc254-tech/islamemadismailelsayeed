'use strict';
/* Provider — "موقع العميل" panel (apps/provider/provider-location.js + the customer-location action in app.js).
   Runs the real production script order via tests/helpers/provider-app-harness.js. The provider's position comes
   from a stubbed navigator.geolocation (one read per press); no live tracking and nothing is sent anywhere. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, offerRequest, entryScripts } = require('../helpers/provider-app-harness.js');

const PROVIDER = 'p_demo1';
const TAHRIR = { lat: 30.0444, lng: 31.2357 };     // customer pin
const PYRAMIDS = { lat: 29.9792, lng: 31.1342 };   // provider position (~12 km away)

function stubGeo(app, outcome) {
  const calls = [];
  app.ctx.navigator.geolocation = {
    getCurrentPosition(ok, fail, opts) {
      calls.push(opts);
      if (outcome.code) fail({ code: outcome.code }); else ok({ coords: { latitude: outcome.lat, longitude: outcome.lng } });
    }
  };
  return calls;
}
async function acceptedJob(extra = { geo: TAHRIR }) {
  let rid;
  const app = boot({ session: PROVIDER, setup: ({ MP }) => { rid = offerRequest(MP, PROVIDER, extra).id; } });
  app.go('#/new');
  await app.click({ 'data-pv-action': 'accept', 'data-id': rid });
  app.go('#/accepted');
  return { app, rid };
}
const L = () => boot().ctx.HSProviderLocation;

test('script order: provider-location.js loads before app.js', () => {
  const s = entryScripts();
  assert.ok(s.indexOf('apps/provider/provider-location.js') > -1 && s.indexOf('apps/provider/provider-location.js') < s.indexOf('apps/provider/app.js'));
});

test('helpers: geo validation, haversine distance, km formatting, contact and map links', () => {
  const loc = L();
  assert.equal(loc.validGeo(null), null);
  assert.equal(loc.validGeo({ lat: 'x', lng: 1 }), null);
  assert.equal(loc.validGeo({ lat: 91, lng: 0 }), null, 'latitude out of range');
  assert.equal(loc.validGeo({ lat: 0, lng: 0 }), null, '0,0 placeholder is not a location');
  assert.equal(JSON.stringify(loc.validGeo({ lat: '30.5', lng: 31 })), '{"lat":30.5,"lng":31}');
  const km = loc.distanceKm(PYRAMIDS, TAHRIR);
  assert.ok(km > 11.5 && km < 12.5, 'Pyramids → Tahrir ≈ 12 km, got ' + km);
  assert.equal(loc.distanceKm(TAHRIR, TAHRIR), 0);
  assert.ok(Number.isNaN(loc.distanceKm(TAHRIR, null)));
  assert.match(loc.formatKm(2.44), /كم$/);
  assert.equal(loc.formatKm(NaN), '');
  assert.equal(loc.whatsappHref('01011112222'), 'https://wa.me/201011112222', 'Egyptian local mobile → 20 country code');
  assert.equal(loc.whatsappHref('+20 101 111 2222'), 'https://wa.me/201011112222');
  assert.equal(loc.whatsappHref('12'), '');
  assert.equal(loc.telHref('010 1111 2222'), 'tel:01011112222');
  assert.equal(loc.telHref(''), '');
  assert.equal(loc.mapsUrl({ geo: TAHRIR }), 'https://www.google.com/maps/dir/?api=1&destination=30.0444,31.2357');
  assert.match(loc.mapsUrl({ geo: null, addr: 'شارع 1', area: 'مدينة نصر', gov: 'القاهرة' }), /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.equal(loc.mapsUrl({}), '');
});

test('panel markup escapes request data', () => {
  const loc = L();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = loc.panelHtml({ id: 'r1', addr: '<img src=x onerror=alert(1)>', phone: '01011112222', geo: TAHRIR }, '<b>x</b>', { status: 'ok', km: 3 }, esc);
  assert.doesNotMatch(html, /<img|<b>x/);
  assert.match(html, /&lt;img/);
});

test('an offered (not yet accepted) job has no customer-location button', async () => {
  let rid;
  const app = boot({ session: PROVIDER, setup: ({ MP }) => { rid = offerRequest(MP, PROVIDER, { geo: TAHRIR }).id; } });
  app.go('#/new');
  assert.ok(app.has({ 'data-pv-action': 'accept', 'data-id': rid }));
  assert.equal(app.has({ 'data-pv-action': 'customer-location', 'data-id': rid }), false);
});

test('after acceptance: each press reads the position once and shows address, contact links, map link and distance', async () => {
  const { app, rid } = await acceptedJob();
  assert.ok(app.has({ 'data-pv-action': 'customer-location', 'data-id': rid }));
  const calls = stubGeo(app, PYRAMIDS);
  await app.click({ 'data-pv-action': 'customer-location', 'data-id': rid });
  const html = app.html();
  assert.match(html, /data-pv-distance="ok"/);
  assert.match(html, /المسافة التقريبية: <b>1[12](٫\d|\.\d)? كم|المسافة التقريبية: <b>[١٢٠-٩٫.]+ كم/);
  assert.match(html, /شارع 1/);
  assert.ok(app.has({ 'data-pv-contact': 'call', href: 'tel:01000000001' }));
  assert.ok(app.has({ 'data-pv-contact': 'whatsapp', href: 'https://wa.me/201000000001' }));
  assert.ok(app.has({ 'data-pv-contact': 'map', href: 'https://www.google.com/maps/dir/?api=1&amp;destination=30.0444,31.2357' }));
  assert.match(html, /rel="noopener noreferrer"/);
  await app.click({ 'data-pv-action': 'customer-location', 'data-id': rid });
  assert.equal(calls.length, 2, 'every press recomputes (one position read per press, no watch)');
  assert.equal(app.request(rid).geo.lat, TAHRIR.lat, 'customer pin unchanged; provider position is not stored');
  assert.equal(JSON.stringify(app.MP.db()).includes(String(PYRAMIDS.lat)), false, 'provider position never persisted');
});

test('hide removes the panel; permission denied, no browser support and missing pin show honest messages', async () => {
  const { app, rid } = await acceptedJob();
  stubGeo(app, { code: 1 });
  await app.click({ 'data-pv-action': 'customer-location', 'data-id': rid });
  assert.match(app.html(), /data-pv-distance="denied"/);
  assert.match(app.html(), /شارع 1/, 'address and contact stay available without the distance');
  await app.click({ 'data-pv-action': 'customer-location-close', 'data-id': rid });
  assert.doesNotMatch(app.html(), /data-pv-location=/);

  delete app.ctx.navigator.geolocation;
  await app.click({ 'data-pv-action': 'customer-location', 'data-id': rid });
  assert.match(app.html(), /data-pv-distance="unsupported"/);

  const noPin = await acceptedJob({});
  stubGeo(noPin.app, PYRAMIDS);
  await noPin.app.click({ 'data-pv-action': 'customer-location', 'data-id': noPin.rid });
  assert.match(noPin.app.html(), /data-pv-distance="nogeo"/);
  assert.ok(noPin.app.has({ 'data-pv-contact': 'map' }), 'map link falls back to the written address');
});

test('the request stores only a clean pin: rounded numbers, junk rejected', () => {
  const app = boot({ session: PROVIDER });
  const MP = app.MP;
  MP.db().settings.autoAssign = false;
  const base = { name: 'ع', phone: '01000000002', cat: 'electric', serviceId: 's1', serviceName: 'خدمة', desc: '', gov: 'القاهرة', area: 'ن', addr: 'ش' };
  assert.equal(JSON.stringify(MP.createRequest({ ...base, geo: { lat: 30.04441234, lng: 31.23571234, extra: '<x>' } }).geo), '{"lat":30.04441,"lng":31.23571}');
  assert.equal(MP.createRequest({ ...base, geo: { lat: 'NaN', lng: 1 } }).geo, null);
  assert.equal(MP.createRequest({ ...base, geo: '30,31' }).geo, null);
});

test('completed jobs no longer offer the customer-location button', async () => {
  const { app, rid } = await acceptedJob();
  const r = app.request(rid);
  r.status = 'closed';
  app.go('#/done');
  assert.equal(app.has({ 'data-pv-action': 'customer-location', 'data-id': rid }), false);
});
