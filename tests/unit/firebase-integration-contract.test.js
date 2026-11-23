'use strict';
/* Firebase integration contract: the functions/domain copy is current, rules deny direct client access, local demo
   mode stays the default, the apps load the backend bridge, and no Admin SDK or private credential reaches the client. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('functions/domain is a byte-identical copy of the app domain layer (run scripts/sync-functions-domain.cjs)', () => {
  const manifest = JSON.parse(read('functions/domain/manifest.json'));
  for (const f of Object.keys(manifest.files)) {
    const src = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
    const copy = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'functions/domain', f))).digest('hex');
    assert.equal(copy, src, `${f} is stale in functions/domain`);
  }
  for (const f of ['services/local-market-store.js', 'services/orders-api.js', 'services/quotes-api.js', 'services/admin-api.js']) assert.ok(manifest.files[f], f);
});

test('security rules: no direct client access to Firestore; RTDB exposes only the own change signal', () => {
  const fr = read('firestore.rules');
  assert.match(fr, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
  assert.doesNotMatch(fr, /request\.time\s*</, 'the 30-day open test rule is gone');
  const db = JSON.parse(read('database.rules.json')).rules;
  assert.equal(db['.read'], false); assert.equal(db['.write'], false);
  assert.equal(db.signals.$uid['.read'], 'auth != null && auth.uid === $uid');
  assert.equal(db.signals.$uid['.write'], false);
  /* the only public node: the site-content version (a number + timestamp, written by Functions only) */
  assert.deepEqual(Object.keys(db).filter(k => !k.startsWith('.')).sort(), ['public', 'signals', 'typing']);
  /* «بيكتب…» flags: signed-in users write only their own flag, with a role and a server timestamp (no message content) */
  assert.equal(db.typing.$reqId['.read'], 'auth != null');
  assert.equal(db.typing.$reqId.$uid['.write'], 'auth != null && auth.uid === $uid');
  assert.match(db.typing.$reqId.$uid['.validate'], /hasChildren\(\['r', 'at'\]\)/);
  assert.deepEqual(Object.keys(db.public), ['content']);
  assert.equal(db.public.content['.read'], true); assert.equal(db.public.content['.write'], false);
});

test('apps load the backend bridge; Firebase is the default with an explicit local override; Storage is not used', () => {
  for (const f of ['apps/customer/index.html', 'apps/provider/index.html', 'apps/admin/index.html']) {
    const h = read(f);
    assert.match(h, /services\/firebase-config\.js/, f);
    assert.match(h, /<script type="module" src="\.\.\/\.\.\/services\/firebase-backend\.js"><\/script>/, f);
  }
  const cfg = read('services/firebase-config.js');
  assert.match(cfg, /const DEFAULT_MODE = 'firebase';/, 'production activation');
  assert.match(cfg, /asked === 'firebase' \|\| asked === 'local'/, '?backend=local stays available for development/tests');
  for (const f of ['apps/customer/index.html', 'apps/provider/index.html', 'apps/admin/index.html']) { const h = read(f); assert.ok(h.indexOf('services/firebase-config.js') < h.indexOf('services/local-market-store.js'), f + ': mode is known before the store loads'); }
  const store = read('services/local-market-store.js');
  assert.match(store, /if \(firebaseMode\(\) && db\._source !== 'firebase'\)/, 'firebase mode never shows local/demo data as server data');
  assert.match(store, /db = seed\(\); db\.providers = \[\]; db\._source = 'firebase';/);
  const bridge = read('services/firebase-backend.js');
  assert.match(bridge, /never fall back silently to the local demo store/, 'a failed SDK start makes requests fail visibly');
  assert.match(bridge, /db\._source = 'firebase';/);
  assert.match(read('tests/e2e/lib/cdp.js'), /localStorage\.setItem\('hs_backend', 'local'\)/, 'browser runners pin local mode');
  assert.match(read('tests/e2e/lib/cdp.js'), /https:\/\/\*\.cloudfunctions\.net\/\*/, 'browser runners block production backend hosts (host-anchored, emulators on 127.0.0.1 stay reachable)');
  assert.match(read('service-worker.js'), /'assets\/vendor\/firebase\/13\.1\.0\/firebase-functions\.js'/, 'the SDK is precached so offline starts fail visibly, not silently');
  for (const f of ['services/firebase-backend.js', 'services/firebase-config.js', 'functions/index.js']) assert.doesNotMatch(read(f), /firebase-storage|getStorage\(/, f);
});

test('no Admin SDK or private credentials in client code', () => {
  const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
  const client = ['apps', 'shared', 'services'].flatMap(walk).filter(f => /\.(js|html)$/.test(f));
  for (const f of client) {
    const s = read(f);
    assert.doesNotMatch(s, /firebase-admin|private_key|BEGIN PRIVATE KEY|service[-_]account/i, f);
  }
  const ignore = read('.gitignore');
  assert.match(ignore, /service-account|\*-adminsdk-\*\.json/i, '.gitignore excludes service-account keys');
});

test('the service worker never caches Firebase backend traffic', () => {
  const sw = read('service-worker.js');
  assert.match(sw, /firebasedatabase\\\.app\|cloudfunctions\\\.net/);
  assert.match(sw, /'services\/firebase-backend\.js'/);
});

test('the bridge refreshes screens through the realtime client API that exists (notify)', () => {
  const bridge = read('services/firebase-backend.js');
  assert.match(read('services/realtime-client.js'), /notify: detail =>/);
  assert.match(bridge, /HSRealtimeClient\.notify\(/);
  assert.doesNotMatch(bridge, /HSRealtimeClient\.publish\(/, 'publish() is internal to realtime-client');
  assert.match(bridge, /idempotencyKey/, 'mutations carry an idempotency key');
});
test('read efficiency on the client: syncs are coalesced and stale signals skipped; TTL fields on transient server docs', () => {
  const bridge = read('services/firebase-backend.js');
  assert.match(bridge, /const scheduleSync = \(own\) =>/, 'post-write syncs are debounced');
  assert.match(bridge, /visibilityState === 'hidden'\) \{ syncWhenVisible = true; return; \}/, 'a hidden tab defers signal syncs until shown');
  assert.match(bridge, /v\.at > lastServerTime/, 'a signal already covered by the last sync is ignored');
  assert.doesNotMatch(bridge, /if \(isWrite\) sync\(\)/, 'no immediate full sync after every write');
  const svc = read('functions/src/service.js');
  assert.match(svc, /rateLimits\/\$\{key\}`, \{ minute, count, expiresAt/);
  assert.match(svc, /expiresAt: new Date\(Date\.now\(\) \+ IDEMPOTENCY_TTL_MS\)/);
  assert.match(svc, /serverTime: Date\.now\(\)/);
});
test('deployment configuration: TTL overrides preserved, one Functions region everywhere, demo resets hidden in firebase mode', () => {
  const ix = JSON.parse(read('firestore.indexes.json'));
  for (const g of ['idempotency', 'rateLimits']) assert.ok(ix.fieldOverrides.some(o => o.collectionGroup === g && o.fieldPath === 'expiresAt' && o.ttl === true), g + ' TTL override kept (a deploy must not remove it)');
  assert.equal(ix.indexes.length, 14);
  assert.ok(ix.indexes.some(i => i.collectionGroup === 'notifications' && i.fields.map(f => f.fieldPath).join() === 'to,_u'), 'Admin delta sync: admin inbox changes by (to, _u)');
  assert.match(read('functions/index.js'), /region: 'me-central1'/, 'Functions in me-central1 (Doha): nearest region to Firestore me-central2 that allows Cloud Functions');
  assert.match(read('services/firebase-config.js'), /region: 'me-central1'/, 'the client calls the same region');
  assert.match(read('services/firebase-config.js'), /firebasedatabase\.app/, 'RTDB keeps its own URL (europe-west1)');
  assert.match(read('functions/index.js'), /isReadCall\(name, request\.data\) && !readLimiter\.allowRead/, 'reads are rate-limited before any Firestore access');
  assert.match(read('apps/admin/admin-shell.js'), /a\.hidden\(\)\) return;/);
  for (const f of ['apps/admin/pages/workforce.page.js', 'apps/admin/pages/admin-dashboard.page.js']) assert.match(read(f), /id: 'reset'[^\n]*hidden:/, f);
  assert.match(read('apps/admin/pages/marketplace.page.js'), /a === 'reset-yes'\) && root\.HSFirebaseConfig/);
});