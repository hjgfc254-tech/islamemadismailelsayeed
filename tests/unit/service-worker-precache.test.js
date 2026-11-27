'use strict';
/* Service Worker precache completeness: every local script/stylesheet/icon loaded by an offline-capable entry
   (one that registers the worker) must be precached, because on a first visit the worker does not yet control
   the page and uncached files would be missing offline. Derived from the real entry HTML, not a hand list. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sw = read('service-worker.js');
const FILES = (() => {
  const body = /const FILES = \[([\s\S]*?)\]/.exec(sw)[1];
  return [...body.matchAll(/'([^']+)'/g)].map(m => m[1]);
})();
const OFFLINE_ENTRIES = ['apps/customer/index.html', 'apps/provider/index.html'];

function localRefs(entry) {
  const html = read(entry), dir = path.posix.dirname(entry), refs = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) refs.push(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*\brel="(?:stylesheet|icon|manifest)"[^>]*\bhref="([^"]+)"/g)) refs.push(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*\brel="(?:stylesheet|icon|manifest)"/g)) refs.push(m[1]);
  for (const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) refs.push(m[1]);
  return [...new Set(refs)].filter(r => !/^(https?:)?\/\//.test(r) && !r.startsWith('data:'))
    .map(r => path.posix.normalize(path.posix.join(dir, r)));
}

test('the precache list is parsed and has no duplicates', () => {
  assert.ok(FILES.length > 20);
  assert.equal(new Set(FILES).size, FILES.length, 'duplicate precache entries');
});

test('every precache entry exists on disk (no stale paths)', () => {
  for (const file of FILES.filter(f => f !== './')) assert.ok(fs.existsSync(path.join(ROOT, file)), `missing on disk: ${file}`);
});

for (const entry of OFFLINE_ENTRIES) {
  test(`${entry} and every local asset it loads are precached`, () => {
    assert.ok(FILES.includes(entry), `${entry} itself should be precached`);
    const missing = localRefs(entry).filter(ref => !FILES.includes(ref));
    assert.deepEqual(missing, [], `not precached for ${entry}`);
  });
}

test('only Customer and Provider register the worker; Admin is not an offline entry (boundary is explicit)', () => {
  const registers = f => /serviceWorker\.register\(/.test(read(f));
  assert.ok(registers('apps/customer/app.js'));
  assert.ok(/shared\/boot\/sw-register\.js/.test(read('apps/provider/index.html')) && registers('shared/boot/sw-register.js'));   /* moved out of the page (CSP) */
  const admin = read('apps/admin/index.html');
  assert.doesNotMatch(admin, /serviceWorker\.register|rel="manifest"/,
    'If Admin becomes an offline/PWA entry, add apps/admin/index.html to OFFLINE_ENTRIES and precache its assets.');
});
