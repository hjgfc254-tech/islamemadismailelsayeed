'use strict';
/* Accessibility markup contracts (2026-11-14). The browser audit is tests/e2e/a11y.cdp.js; these static guards keep the
   fixed patterns from regressing in `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const glob = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? glob(d + '/' + e.name) : [d + '/' + e.name]);
const appJs = ['apps/customer', 'apps/provider', 'apps/admin', 'apps/guest'].flatMap(glob).filter(f => f.endsWith('.js'));
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('no text <label> sits next to a field without being associated (for= / wrapping)', () => {
  const offenders = [];
  for (const f of appJs) {
    for (const m of read(f).matchAll(/<label(?![^>]*\bfor=)[^>]*>([^<]{1,60})<\/label>\s*<(input|select|textarea)\b(?![^>]*\baria-label)/g)) offenders.push(f + ': ' + m[1]);
  }
  assert.deepEqual(offenders, []);
});

test('the fixed Customer forms associate every label with its field', () => {
  const pairs = {
    'apps/customer/pages/addresses.page.js': ['addr-gov', 'addr-area', 'addr-addr', 'addr-detail', 'addr-label'],
    'apps/customer/pages/support.page.js': ['sup-kind', 'sup-req', 'sup-text', 'rep-provider', 'rep-kind', 'rep-text'],
    'apps/customer/pages/market-ui.page.js': ['rv-quality', 'rv-comment', 'cmp-kind', 'cmp-text', 'ask-reason'],
    'apps/customer/pages/account.page.js': ['acc-name', 'acc-phone', 'acc-email', 'acc-del-confirm', 'account-login-name', 'account-login-phone']
  };
  for (const [f, ids] of Object.entries(pairs)) {
    const src = read(f);
    for (const id of ids) { assert.ok(src.includes(`for="${id}"`), `${f}: label for ${id}`); assert.ok(src.includes(`id="${id}"`), `${f}: field #${id}`); }
  }
  assert.match(read('apps/customer/pages/addresses.page.js'), /role="group" aria-labelledby="addr-type-lbl"/);
  assert.match(read('apps/customer/pages/market-ui.page.js'), /role="group" aria-label="عدد النجوم"[\s\S]*aria-pressed="false" aria-label="\$\{n\} من 5 نجوم"/);
});

test('no blocking native dialogs (confirm/prompt/alert) in any app runtime', () => {
  const offenders = appJs.filter(f => /(^|[^\w.])(confirm|prompt|alert)\(/.test(stripComments(read(f))));
  assert.deepEqual(offenders, []);
});

test('contrast fixes: strong brand token for small white text; decorative avatar initials hidden and readable', () => {
  const ds = read('shared/design-system/design-system.css');
  // Approved identity: deep primary green #0B3E38 carries small white text (11.6:1); primary green #135049 carries buttons (9.2:1)
  assert.match(ds, /--brand-primary-strong:#0B3E38/);
  assert.match(ds, /--brand-primary:#135049/);
  assert.match(ds, /\.qa \.n,\.tab-badge\{background:var\(--brand-primary-strong\)/);
  assert.match(read('apps/admin/styles/admin.css'), /\.adm-skip\{[^}]*background:var\(--brand-primary-strong\)/);
  for (const f of ['apps/customer/pages/account.page.js', 'apps/customer/pages/order-details.page.js']) assert.match(read(f), /class="prov-avatar" aria-hidden="true"/, f);
  // provider-data avatar colours are overridden by one calm, high-contrast avatar style (emerald ink on mint)
  assert.match(ds, /\.prov-avatar\{background:var\(--mint\)!important;[^}]*color:var\(--brand-ink\)!important/);
});

test('every app honours prefers-reduced-motion', () => {
  for (const f of ['shared/design-system/design-system.css', 'apps/customer/styles/customer.css', 'apps/provider/styles/provider.css', 'apps/admin/styles/admin-responsive.css']) assert.match(read(f), /prefers-reduced-motion:\s*reduce/, f);
});
