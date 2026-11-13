'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scanProjectStyles } = require('../helpers/design-token-audit');

const ROOT = path.resolve(__dirname, '../..');
const ADMIN_HARDCODED_BASELINE = 163;

test('the live shared design-system stylesheet is loaded by Admin and Customer', () => {
  const admin = fs.readFileSync(path.join(ROOT, 'apps/admin/index.html'), 'utf8');
  const customer = fs.readFileSync(path.join(ROOT, 'apps/customer/index.html'), 'utf8');
  assert.match(admin, /href="\.\.\/\.\.\/shared\/design-system\/design-system\.css"/);
  assert.match(customer, /href="\.\.\/\.\.\/shared\/design-system\/design-system\.css"/);
});

test('the split design-system files remain documented placeholders, not competing token sources', () => {
  for (const file of ['tokens.css', 'typography.css', 'components.css', 'layout.css']) {
    const css = fs.readFileSync(path.join(ROOT, 'shared/design-system', file), 'utf8');
    assert.match(css, /STATUS:\s*PLACEHOLDER/);
  }
});

test('hard-coded values in Admin CSS do not exceed the recorded baseline', () => {
  const audit = scanProjectStyles();
  assert.ok(audit.adminHardcodedCount <= ADMIN_HARDCODED_BASELINE,
    `Admin CSS hard-coded count grew to ${audit.adminHardcodedCount}; recorded baseline is ${ADMIN_HARDCODED_BASELINE}. Review the new literals and update the baseline only with an explicit audit.`);
});

test('Provider standalone stylesheet contains its implemented responsive workspace system', () => {
  const provider = fs.readFileSync(path.join(ROOT, 'apps/provider/styles/provider.css'), 'utf8');
  for (const selector of ['.pv-topbar', '.pv-main', '.pv-nav', '.pv-kpis', '.pv-request', '.pv-inline-form']) assert.match(provider, new RegExp(selector.replace('.', '\\.') ));
  const entry = fs.readFileSync(path.join(ROOT, 'apps/provider/index.html'), 'utf8');
  assert.match(entry, /styles\/provider\.css/);
  assert.match(entry, /pages\/dashboard\.page\.js/);
});
