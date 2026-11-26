#!/usr/bin/env node
/**
 * Copies the application's domain layer (business rules + route handlers) into functions/domain/ so Cloud Functions
 * run the SAME code the app is tested against (firebase deploy uploads only the functions/ folder).
 * Writes functions/domain/manifest.json with SHA-256 hashes; tests/unit/firebase-domain-sync.test.js fails when the copy
 * is stale. Usage: node scripts/sync-functions-domain.cjs [--check]
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'functions', 'domain');
const FILES = [
  'shared/config/legacy-data.js', 'services/catalog-question-bank.js', 'services/local-catalog.js', 'services/local-market-store.js',
  'services/api-client.js', 'services/auth-api.js', 'services/orders-api.js', 'services/quotes-api.js',
  'services/catalog-api.js', 'services/provider-api.js', 'services/customer-api.js', 'services/notifications-api.js',
  'services/support-api.js', 'services/finance-api.js', 'services/admin-api.js',
  'apps/admin/modules/ops-core.js', 'apps/admin/modules/ops-routes.js', 'services/ops-api.js',
  'apps/admin/rbac-store.js', 'apps/admin/permission-guard.js',
  'apps/admin/modules/workforce/employee-status.js', 'apps/admin/modules/workforce/employee-form.js', 'apps/admin/modules/workforce/employee-invitation.js'
];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const check = process.argv.includes('--check');
const manifest = { generatedBy: 'scripts/sync-functions-domain.cjs', files: {} };
let stale = 0;
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f));
  manifest.files[f] = sha(src);
  const dst = path.join(OUT, f);
  const cur = fs.existsSync(dst) ? fs.readFileSync(dst) : null;
  if (!cur || sha(cur) !== sha(src)) {
    stale++;
    if (!check) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, src); }
  }
}
if (check) { console.log(stale ? `STALE: ${stale} domain file(s) differ — run node scripts/sync-functions-domain.cjs` : 'domain copy is current'); process.exit(stale ? 1 : 0); }
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`synced ${FILES.length} domain files (${stale} updated) → functions/domain/`);
module.exports = { FILES };
