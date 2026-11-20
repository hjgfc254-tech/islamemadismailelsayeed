'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scanProjectStyles } = require('../helpers/design-token-audit');

const ROOT = path.resolve(__dirname, '../..');
/* 163 → 173 (2026-11-16, explicit audit): the dashboard trend charts and the Ctrl+K quick search use design tokens for all
   colours, spacing, type and radii; the 10 remaining literals are layout dimensions with no token equivalent
   (chart plot height 9rem, chart column min 22rem, dialog width 35rem / 92vw, list max-height 26rem / 55vh, input
   height 3.4rem, label min-width 4rem, the 700px breakpoint and the 2px bar gap from the dataviz mark spec). */
/* 173 → 176 (2026-11-20, explicit audit): «الإحصائيات» card column min 15rem, the emergency page width 46rem and the
   card border 1px have no token equivalent. */
const ADMIN_HARDCODED_BASELINE = 176;

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
