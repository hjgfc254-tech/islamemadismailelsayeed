'use strict';
/* Domain harness: the real marketplace store + API adapters in node:vm, with an actor switcher (as(app, who)).
   Used by tests that drive the marketplace through the same routes the apps call. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const FILES = ['shared/config/legacy-data.js', 'services/local-catalog.js', 'services/local-market-store.js',
  ...['api-client', 'auth-api', 'orders-api', 'quotes-api', 'catalog-api', 'provider-api', 'customer-api', 'notifications-api', 'support-api', 'finance-api', 'admin-api', 'ops-api', 'uploads-api', 'realtime-client'].map(n => `services/${n}.js`), 'apps/admin/modules/ops-core.js', 'apps/admin/modules/ops-routes.js'];
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() }; };

function boot(extraFiles = [], extraCtx = {}) {
  const ctx = { console, setTimeout, clearTimeout, setImmediate, Promise, JSON, Date, Math, Intl, localStorage: mem(), sessionStorage: mem(), addEventListener() {}, removeEventListener() {},
    location: { pathname: '/apps/customer/index.html' }, HSAdminRbac: { state: { roster: [{ id: 'e_owner', name: 'مالك', role: 'owner', status: 'active' }] } }, ...extraCtx };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of [...FILES, ...extraFiles]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const run = code => vm.runInContext(code, ctx);
  run('MP.db().settings.autoAssign = false');
  const as = (app, v) => {
    ctx.HSAuthApi.useApp(app);
    if (app === 'customer') { ctx.localStorage.setItem('hs_user', JSON.stringify(v)); run(`MP.customerFor(${JSON.stringify(v.name)}, ${JSON.stringify(v.phone)})`); }
    if (app === 'provider') ctx.sessionStorage.setItem('hs_provider_demo_session', v);
    if (app === 'admin') ctx.sessionStorage.setItem('hs_admin_demo_session', v);
  };
  return { g: ctx, run, as, O: ctx.HSOrdersApi, C: ctx.HSCustomerApi, A: ctx.HSAdminApi, F: ctx.HSFinanceApi, Q: ctx.HSQuotesApi };
}
const plain = x => JSON.parse(JSON.stringify(x));   /* vm objects come from another realm */

module.exports = { boot, plain, ROOT, FILES };