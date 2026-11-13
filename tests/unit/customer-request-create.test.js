'use strict';
/* Customer request-create route (pages/request-create.page.js): resolves #/request[/<catalogId>] and opens the existing wizard. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boot, scripts, ROOT } = require('../helpers/customer-app-harness.js');

function loadCatalog() {
  const c = { console }; c.globalThis = c; vm.createContext(c);
  for (const f of ['shared/icons/icon-registry.js', 'shared/config/legacy-data.js', 'services/local-catalog.js', 'apps/customer/pages/request-create.page.js', 'apps/customer/customer-router.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), c, { filename: f });
  return { CAT: vm.runInContext('CAT', c), RC: c.HSCustomerRequestCreate, R: c.HSCustomerRouter };
}
const plain = v => JSON.parse(JSON.stringify(v));

test('request-create.page.js is real code loaded right after the wizard it opens', () => {
  const src = fs.readFileSync(path.join(ROOT, 'apps/customer/pages/request-create.page.js'), 'utf8');
  assert.doesNotMatch(src, /PLACEHOLDER|EXTRACTION PENDING|no duplicate logic/);
  const list = scripts();
  assert.equal(list.indexOf('apps/customer/pages/request-create.page.js'), list.indexOf('apps/customer/pages/request-wizard.page.js') + 1);
  assert.doesNotMatch(src, /wzCheckStep|wzSubmit|WZ_STEPS/, 'does not re-implement wizard internals');
});

test('resolve maps a category, item or problem id to the wizard preselection; unknown/malformed → blank', () => {
  const { CAT, RC } = loadCatalog();
  assert.deepEqual(plain(RC.resolve('appliances', CAT)), { cat: 'appliances' });
  assert.deepEqual(plain(RC.resolve('appliances/ac', CAT)), { cat: 'appliances', item: 'appliances/ac' });
  assert.deepEqual(plain(RC.resolve('appliances/ac/no-cooling', CAT)), { cat: 'appliances', item: 'appliances/ac', problem: 'appliances/ac/no-cooling' });
  for (const bad of ['', 'nope', 'a/b/c/d', '../etc', 'appliances ac', '<x>']) assert.deepEqual(plain(RC.resolve(bad, CAT)), {}, bad);
});

test('open starts the wizard through startRequest and preselects a problem at step 3 with a re-render', () => {
  const { CAT, RC } = loadCatalog();
  const calls = [], W = {};
  const deps = { CAT, startRequest: (c, i) => { calls.push(['start', c, i]); Object.assign(W, { step: 0, problem: '', unknown: true }); }, getWizard: () => W, show: s => calls.push(['show', s]) };
  RC.open('appliances/ac/no-cooling', deps);
  assert.deepEqual(calls, [['start', 'appliances', 'appliances/ac'], ['show', 'wizard']]);
  assert.deepEqual({ ...W }, { step: 3, problem: 'appliances/ac/no-cooling', unknown: false });
  calls.length = 0;
  RC.open('', deps);
  assert.deepEqual(calls, [['start', undefined, undefined]], 'blank wizard, no extra render');
  assert.throws(() => RC.open('x', {}), /startRequest dependency missing/);
});

test('router: #/request with and without a catalog target', () => {
  const { R } = loadCatalog();
  assert.deepEqual(plain(R.parse('#/request')), { screen: 'requestCreate', target: '', tab: 'home' });
  assert.deepEqual(plain(R.parse('#/request/' + encodeURIComponent('appliances/ac/no-cooling'))), { screen: 'requestCreate', target: 'appliances/ac/no-cooling', tab: 'home' });
  assert.equal(R.parse('#/request/a/b'), null, 'raw slashes must be encoded');
  assert.equal(R.parse('#/request/' + encodeURIComponent('../x')), null);
  assert.equal(R.format('requestCreate', 'appliances/ac'), '#/request/appliances%2Fac');
});

test('app: #/request/<problem> deep link opens the existing wizard at the problem step for a guest', () => {
  const app = boot({ hash: '#/request/' + encodeURIComponent('appliances/ac/no-cooling') });
  assert.equal(app.run('WZ && WZ.cat'), 'appliances');
  assert.equal(app.run('WZ.item'), 'appliances/ac');
  assert.equal(app.run('WZ.problem'), 'appliances/ac/no-cooling');
  assert.equal(app.run('WZ.step'), 3);
  assert.match(app.html(), /طلب خدمة/);
  assert.deepEqual(JSON.parse(app.run('JSON.stringify(state.stack)')), ['wizard'], 'Back leaves the wizard to home, as in-app');
  assert.equal(app.location.hash, '#/request', 'URL mirrors the wizard route');
});

test('app: #/request opens a blank wizard; unknown targets also open a blank wizard (no error)', () => {
  const blank = boot({ hash: '#/request' });
  assert.equal(blank.run('WZ && WZ.step'), 0);
  assert.equal(blank.run('WZ.cat'), '');
  const unknown = boot({ hash: '#/request/zzz' });
  assert.equal(unknown.run('WZ && WZ.step'), 0);
});
