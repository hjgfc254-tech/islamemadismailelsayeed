'use strict';
/* Provider P3 — executable parity evidence between the Customer-loaded legacy Provider path
   (apps/provider/legacy/portal-compat.js + provider-workspace.js) and the standalone app (apps/provider/*).
   Audit only: these tests document parity and known divergences; they do not change either runtime.
   See docs/PROVIDER_LEGACY_PARITY_AUDIT.md. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* Evaluate the legacy bridge with only the globals its top level touches; functions stay lazily bound. */
function loadLegacy() {
  const ctx = { screens: {}, document: { addEventListener() {}, body: { classList: { add() {}, remove() {} } } },
    window: { addEventListener() {} }, history: {}, state: {}, store: { get: () => null, set() {} }, console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('apps/provider/legacy/portal-compat.js'), ctx, { filename: 'portal-compat.js' });
  return ctx;
}
function loadStandaloneDomain() {
  const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read('apps/provider/provider-request-domain.js'), ctx, { filename: 'provider-request-domain.js' });
  return ctx.HSProviderRequestDomain;
}
const scriptsOf = entry => [...read(entry).matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => path.posix.normalize(path.posix.join(path.posix.dirname(entry), m[1])));

test('legacy bridge evaluates in isolation and registers both legacy role screens', () => {
  const legacy = loadLegacy();
  assert.equal(typeof legacy.providerGroupOf, 'function');
  assert.equal(typeof legacy.screens.provider, 'function');
  assert.equal(typeof legacy.screens.admin, 'function', 'portal-compat.js also hosts the legacy Admin console');
});

test('request grouping is identical for every request × assignment status combination', () => {
  const legacy = loadLegacy();
  const domain = loadStandaloneDomain();
  const requestStatuses = ['received', 'searching', 'sent', 'accepted', 'scheduled', 'enroute', 'arrived', 'started', 'quote',
    'completed', 'closed', 'cancelled', 'failed', 'unknown-status', undefined];
  const assignmentStatuses = ['offered', 'accepted', 'rejected', 'withdrawn', 'unknown-assignment', undefined];
  let compared = 0;
  const diffs = [];
  for (const rs of requestStatuses) {
    const r = { id: 'r1', status: rs };
    diffs.push(...[[null, 'none']].concat(assignmentStatuses.map(s => [{ id: 'a1', reqId: 'r1', status: s }, s]))
      .map(([a, label]) => {
        compared++;
        const l = legacy.providerGroupOf(r, a || undefined), s = domain.getRequestGroup(r, a || undefined);
        return l === s ? null : `request=${rs} assignment=${label}: legacy=${l} standalone=${s}`;
      }).filter(Boolean));
  }
  assert.equal(compared, requestStatuses.length * (assignmentStatuses.length + 1));
  assert.deepEqual(diffs, []);
});

test('both paths share one local demo store (same MP implementation and storage key)', () => {
  const customer = scriptsOf('apps/customer/index.html');
  const provider = scriptsOf('apps/provider/index.html');
  for (const shared of ['services/local-market-store.js', 'shared/config/legacy-data.js', 'services/local-catalog.js']) {
    assert.ok(customer.includes(shared), `Customer entry loads ${shared}`);
    assert.ok(provider.includes(shared), `Provider entry loads ${shared}`);
  }
  assert.match(read('services/local-market-store.js'), /const KEY = 'hs_mp_db'/);
});

test('documented divergence: the two paths use separate demo identities', () => {
  // Legacy: Customer `store` → localStorage 'hs_provId' (persists across tabs/sessions).
  assert.match(read('apps/customer/app.js'), /localStorage\.getItem\('hs_'\+k\)/);
  assert.match(read('apps/provider/legacy/portal-compat.js'), /store\.get\('provId',null\)/);
  // Standalone: sessionStorage 'hs_provider_demo_session' (per tab, cleared on logout).
  assert.match(read('apps/provider/provider-session.js'), /const KEY = 'hs_provider_demo_session'/);
  assert.match(read('apps/provider/provider-session.js'), /sessionStorage/);
});

test('every legacy provider request action has a standalone equivalent backed by the same MP method', () => {
  const legacy = read('apps/provider/legacy/portal-compat.js');
  const standalone = read('apps/provider/app.js');
  const map = [
    // [legacy data-pa, standalone data-pv-action, MP method both call]
    ['accept', 'accept', 'MP.respond'], ['reject', 'reject', 'MP.respond'], ['confirm', 'confirm', 'MP.confirmTime'],
    ['propose', 'propose', 'MP.propose'], ['enroute', 'advance', 'MP.advance'], ['arrived', 'advance', 'MP.advance'],
    ['started', 'advance', 'MP.advance'], ['sendQuote', 'quote', 'MP.createQuote'], ['finish', 'complete', 'MP.complete'],
    ['avail', 'availability', 'MP.updateProvider'], ['login', 'select', null], ['logout', 'logout', null]
  ];
  for (const [l, s, method] of map) {
    assert.ok(legacy.includes(`data-pa="${l}"`), `legacy action ${l}`);
    assert.ok(standalone.includes(`data-pv-action="${s}"`) || standalone.includes(`action==='${s}'`), `standalone action ${s}`);
    if (method) { assert.ok(legacy.includes(method + '('), `legacy uses ${method}`); assert.ok(standalone.includes(method + '('), `standalone uses ${method}`); }
  }
});

test('documented gaps: legacy-only Provider capabilities not present in the standalone app', () => {
  const legacy = read('apps/provider/legacy/portal-compat.js');
  const standalone = read('apps/provider/app.js') + read('apps/provider/pages/profile.page.js');
  // Profile editing (provider-workspace data-pw-edit-profile → providerForm).
  assert.ok(read('apps/provider/provider-workspace.js').includes('providerForm(p, false)'));
  assert.match(read('apps/provider/pages/profile.page.js'), /تعديل الملف .* غير متاحين/, 'standalone profile is read-only by explicit decision (gap G2)');
});

test('closed gap G1: both paths offer demo self-registration through MP.registerProvider with the same required fields', () => {
  const legacy = read('apps/provider/legacy/portal-compat.js');
  const standalone = read('apps/provider/app.js');
  assert.ok(legacy.includes(`data-pa="register"`) && legacy.includes('MP.registerProvider('));
  assert.ok(standalone.includes(`data-pv-action="register"`) && standalone.includes('MP.registerProvider('));
  for (const field of ['name="name"', 'name="phone"', 'name="type"', 'name="cats"', 'name="govs"', 'name="areas"', 'name="years"', 'name="bio"', 'name="docs"', 'pattern="[0-9+ ]{8,15}"']) {
    const group = /^name="(cats|govs)"$/.exec(field); // standalone renders checkbox groups via checks('cats'|'govs', …)
    assert.ok(legacy.includes(field), `legacy has ${field}`);
    assert.ok(standalone.includes(field) || (group && standalone.includes(`checks('${group[1]}',`)), `standalone has ${field}`);
  }
});

test('closed gap G3: both paths preview commission/net with the same MP.rateFor + MP.calc while completing', () => {
  const legacy = read('apps/provider/legacy/portal-compat.js');
  const standalone = read('apps/provider/app.js');
  assert.ok(legacy.includes('id="finPrev"') && legacy.includes('MP.rateFor(') && legacy.includes('MP.calc('));
  assert.ok(standalone.includes('id="pv-complete-preview"') && standalone.includes('MP.rateFor(') && standalone.includes('MP.calc('));
});
