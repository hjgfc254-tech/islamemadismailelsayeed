'use strict';
/* Staging wiring: services/firebase-config.js picks the staging web config only on a *-staging host or on localhost
   with ?env=staging; every other host keeps the production config unchanged. .firebaserc aliases and npm scripts. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'services/firebase-config.js'), 'utf8');

function load(href, stored = {}) {
  const u = new URL(href), ls = new Map(Object.entries(stored));
  const ctx = { URLSearchParams, location: { search: u.search, hostname: u.hostname }, localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) } };
  ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return { cfg: ctx.HSFirebaseConfig, ls };
}
const PROD = { projectId: 'hansalahlak', authDomain: 'hansalahlak.firebaseapp.com', apiKey: 'AIzaSyDDI0YfY28KQwFEumo9fuFm10uzRj5-Fk8' };

test('production hosts keep the production web config and VAPID key', () => {
  for (const href of ['https://hansalahlak.web.app/apps/customer/', 'https://example.github.io/x/', 'http://127.0.0.1:8099/', 'https://hansalahlak.web.app/?env=staging']) {
    const { cfg } = load(href);
    assert.equal(cfg.env, 'prod', href);
    for (const [k, v] of Object.entries(PROD)) assert.equal(cfg.web[k], v, href + ' ' + k);
    assert.match(cfg.vapidKey, /^BA1u/);
  }
});

test('staging hosts and localhost ?env=staging select the staging project (remembered, ?env=prod clears)', () => {
  assert.equal(load('https://hansalahlak-staging.web.app/apps/admin/').cfg.web.projectId, 'hansalahlak-staging');
  assert.equal(load('https://hansalahlak-staging.firebaseapp.com/').cfg.env, 'staging');
  const a = load('http://localhost:8099/?env=staging');
  assert.equal(a.cfg.env, 'staging'); assert.equal(a.ls.get('hs_env'), 'staging');
  assert.equal(load('http://localhost:8099/', { hs_env: 'staging' }).cfg.env, 'staging', 'remembered');
  assert.equal(load('http://localhost:8099/?env=prod', { hs_env: 'staging' }).cfg.env, 'prod');
});

test('.firebaserc aliases and the deploy scripts', () => {
  const rc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8')).projects;
  assert.equal(rc.default, 'hansalahlak'); assert.equal(rc.prod, 'hansalahlak'); assert.equal(rc.staging, 'hansalahlak-staging');
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
  assert.equal(s['deploy:staging'], 'firebase deploy -P staging --only functions,hosting,firestore');
  assert.equal(s['deploy:prod'], 'node scripts/deploy-prod.cjs');
  const prod = fs.readFileSync(path.join(ROOT, 'scripts/deploy-prod.cjs'), 'utf8');
  assert.match(prod, /isTTY/); assert.match(prod, /rl\.question/); assert.match(prod, /'-P', 'prod'/);
});
