'use strict';
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('accessible tabs helper is loaded before Customer and Admin page code and precached', () => {
  const customer = read('apps/customer/index.html');
  const admin = read('apps/admin/index.html');
  const sw = read('service-worker.js');
  assert(customer.indexOf('accessible-tabs.js') < customer.indexOf('<script src="app.js">'));
  assert(admin.indexOf('accessible-tabs.js') < admin.indexOf('<script src="admin-shell.js">'));
  assert(sw.includes("'shared/components/accessible-tabs.js'"));
  assert(sw.includes("'hansalhlak-v8-architecture-22'"));
});

test('all multi-panel Admin tablists opt into shared keyboard navigation', () => {
  for (const file of [
    'apps/admin/pages/notifications-management.page.js',
    'apps/admin/pages/permissions.page.js',
    'apps/admin/pages/security.page.js'
  ]) assert.match(read(file), /HSA11yTabs\.attach\(wrap\.querySelector\('\[role=tablist\]'\)\)/);
});

test('Customer guide carousel tabs opt into shared keyboard navigation', () => {
  assert.match(read('apps/customer/app.js'), /HSA11yTabs\.attach\(dotList\)/);
});
