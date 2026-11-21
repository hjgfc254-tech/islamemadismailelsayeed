#!/usr/bin/env node
/**
 * Guard rails for a temporary agent (start-deepseek.ps1 sets HS_AGENT=deepseek). Run by the git hooks in .githooks/.
 * Outside such a session (HS_AGENT unset) every check passes, so normal work is unaffected.
 *   node scripts/agent-guard.cjs pre-commit   → blocks commits on main, edits to protected files, and red tests /
 *                                                stale service-worker cache / stale functions domain copy
 *   node scripts/agent-guard.cjs pre-push     → blocks pushing anything but the deepseek-work branch
 */
'use strict';
const { execSync } = require('child_process');
const mode = process.argv[2];
if (process.env.HS_AGENT !== 'deepseek') process.exit(0);

const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fail = (msg) => { console.error('\n✗ BLOCKED: ' + msg + '\n'); process.exit(1); };
const branch = sh('git branch --show-current');

const PROTECTED = [
  /^functions\/src\/(admin-code|service|scope|limits|telemetry|owner-alerts)\.js$/, /^functions\/index\.js$/,
  /^firestore\.rules$/, /^database\.rules\.json$/, /^firebase\.json$/, /^\.firebaserc$/,
  /^apps\/admin\/(permission-guard|rbac-store)\.js$/, /^services\/(api-client|admin-api)\.js$/,
  /^\.github\//, /^\.githooks\//, /^scripts\/agent-guard\.cjs$/, /^start-deepseek\.ps1$/, /^functions\/\.env/
];

if (mode === 'pre-commit') {
  if (branch !== 'deepseek-work') fail(`commits are allowed only on the deepseek-work branch (you are on «${branch}»).`);
  const staged = sh('git diff --cached --name-only').split('\n').filter(Boolean);
  const hit = staged.filter((f) => PROTECTED.some((re) => re.test(f)));
  if (hit.length) fail('these files are protected (leave them for Claude):\n  ' + hit.join('\n  '));
  if (staged.some((f) => /^services\//.test(f))) {
    try { sh('node scripts/sync-functions-domain.cjs --check'); } catch (e) { fail('functions/domain is stale — run: npm run functions:sync, then git add functions/domain'); }
  }
  try { sh('node scripts/sw-cache.cjs --check'); } catch (e) { fail('UI files changed but the service-worker cache was not bumped — run: npm run sw:bump, then git add service-worker.js service-worker.lock.json'); }
  console.log('… running npm test (must be 100% green)');
  try { execSync('npm test --silent', { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { fail('npm test is failing — fix the failing tests before committing (run: npm test).'); }
  console.log('✓ guard: branch, protected files, cache, domain copy and tests are OK');
}
if (mode === 'pre-push') {
  if (branch !== 'deepseek-work') fail('only the deepseek-work branch may be pushed in a DeepSeek session.');
  const stdin = require('fs').readFileSync(0, 'utf8');
  if (/refs\/heads\/main\b/.test(stdin)) fail('pushing to main is not allowed — Claude reviews and merges.');
}
