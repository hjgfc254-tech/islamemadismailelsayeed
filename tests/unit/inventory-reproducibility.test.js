'use strict';
/* Inventory reproducibility (2026-11-14): the inventory is the git file set (tracked + untracked-unignored), so ignored
   local artefacts can neither appear in the map nor make a clean clone report them missing. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
let hasGit = true;
try { git(['--version'], ROOT); } catch { hasGit = false; }
const load = () => import(path.join(ROOT, 'scripts/inventory-files.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));

test('projectFiles: tracked + untracked-unignored only; ignored files excluded; deleted tracked files not present', { skip: !hasGit && 'git unavailable' }, async () => {
  const { projectFiles } = await load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-inv-'));
  try {
    git(['init', '-q'], dir);
    fs.writeFileSync(path.join(dir, '.gitignore'), '*.log\n');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(dir, 'gone.txt'), 'g');
    git(['add', '.'], dir);
    fs.writeFileSync(path.join(dir, 'b.log'), 'ignored');
    fs.writeFileSync(path.join(dir, 'c.txt'), 'new, unignored');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'd.txt'), 'd');
    fs.rmSync(path.join(dir, 'gone.txt'));
    const { files, source } = await projectFiles(dir);
    assert.equal(source, 'git');
    assert.deepEqual([...files].sort(), ['.gitignore', 'a.txt', 'c.txt', 'sub/d.txt']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('projectFiles falls back to a directory walk outside git', async () => {
  const { projectFiles } = await load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-inv-nogit-'));
  try {
    fs.mkdirSync(path.join(dir, 'x'));
    fs.writeFileSync(path.join(dir, 'x', 'y.txt'), 'y');
    const { files, source } = await projectFiles(dir);
    if (source === 'git') return; // tmpdir happens to be inside a git work tree: nothing to assert about the fallback
    assert.deepEqual([...files], ['x/y.txt']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the project map lists no git-ignored path and both scripts use the shared resolver', { skip: !hasGit && 'git unavailable' }, () => {
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/AI_PROJECT_MAP.json'), 'utf8'));
  const paths = map.files.map(f => f.path);
  assert.ok(!paths.includes('test-write.tmp'));
  let ignored = '';
  try { ignored = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: ROOT, input: paths.join('\n'), encoding: 'utf8' }); }
  catch (e) { ignored = e.status === 1 ? '' : String(e.stdout || ''); }   // exit 1 = nothing ignored
  assert.equal(ignored.trim(), '', 'ignored paths in the map: ' + ignored);
  for (const s of ['scripts/verify-project-inventory.mjs', 'scripts/refresh-project-inventory.mjs']) {
    const src = fs.readFileSync(path.join(ROOT, s), 'utf8');
    assert.match(src, /from '\.\/inventory-files\.mjs'/, s);
    assert.doesNotMatch(src, /readdir\(/, s + ' must not walk the raw filesystem');
  }
});
