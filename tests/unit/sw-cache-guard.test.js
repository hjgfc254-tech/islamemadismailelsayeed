'use strict';
/* The service worker serves same-origin files cache-first: any change to a served file must come with a new cache
   name, or returning visitors keep the old files (this is how the dark footer missed GitHub Pages once). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const guard = require('../../scripts/sw-cache.cjs');

test('service-worker cache name was bumped for the current served files (run `npm run sw:bump`)', () => {
  const r = guard.check();
  assert.ok(r.ok, r.message);
});

test('the fingerprint covers every app, shared, service and asset file but not tests or docs', () => {
  const files = guard.servedFiles();
  assert.ok(files.includes('apps/customer/app.js'));
  assert.ok(files.includes('shared/design-system/design-system.css'));
  assert.ok(files.includes('assets/brand/loader/wrench.webp'));
  assert.ok(files.includes('index.html'));
  assert.ok(!files.some(f => f.startsWith('tests/') || f.startsWith('docs/')));
  assert.ok(!files.includes('service-worker.js'), 'the worker itself is not fingerprinted (bumping it would change the hash)');
});

test('the lock file records the same name as service-worker.js', () => {
  const sw = fs.readFileSync(path.join(__dirname, '../../service-worker.js'), 'utf8');
  assert.ok(sw.includes(`const CACHE = '${guard.readLock().cache}';`));
});
