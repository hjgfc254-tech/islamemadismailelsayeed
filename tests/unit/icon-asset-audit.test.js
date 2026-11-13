'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const walkJs = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
  const rel = path.posix.join(dir, entry.name);
  if (entry.isDirectory()) return walkJs(rel);
  return rel.endsWith('.js') ? [rel] : [];
});
const registry = vm.runInNewContext(
  `${read('shared/icons/icon-registry.js')}\n;({\n` +
  `defs:Object.keys(ICON_DEFS), aliases:ICON_ALIAS, status:STATUS_ICON, sec:SEC_ICON, ` +
  `probTargets:PROB_RULES.map((x)=>x[1]), exists:icExists, render:(n)=>_build(n), ` +
  `secIcon:icSec\n})`,
  {}
);

const assetFiles = [
  'assets/icon.svg',
  'assets/logo-mark.webp',
  'assets/logo-word.webp',
  'assets/slide-guide.svg',
  'assets/slide-latest.svg',
  'assets/slide-popular.svg',
];

test('all icon definitions render non-empty SVG and aliases resolve to real definitions', () => {
  assert.equal(registry.defs.length, 188);
  for (const name of registry.defs) {
    const rendered = registry.render(name);
    assert.ok(rendered && rendered.html.length > 0, `empty icon: ${name}`);
  }
  for (const [alias, target] of Object.entries(registry.aliases)) {
    assert.ok(registry.defs.includes(target), `broken alias ${alias} -> ${target}`);
    assert.ok(registry.exists(alias), `alias not recognised: ${alias}`);
  }
});

test('status, section and problem icon maps only point to registered icons', () => {
  for (const [status, icon] of Object.entries(registry.status)) assert.ok(registry.exists(icon), `status ${status}: ${icon}`);
  for (const [section, icon] of Object.entries(registry.sec)) assert.ok(registry.exists(icon), `section ${section}: ${icon}`);
  for (const icon of registry.probTargets) assert.ok(registry.exists(icon), `problem rule: ${icon}`);
  for (const name of ['bolt', 'tap', 'saw', 'roller', 'car', 'broom', 'sparkle', 'washer', 'plug']) {
    assert.ok(registry.exists(registry.secIcon(name)), `legacy section icon ${name}`);
  }
});

test('literal icon calls and declared icon properties resolve in the central registry', () => {
  const files = [...walkJs('apps'), ...walkJs('shared')];
  const candidates = new Set();
  for (const file of files) {
    const source = read(file);
    for (const match of source.matchAll(/\b(?:ic|icon)\(\s*['"]([^'"]+)['"]/g)) candidates.add(match[1]);
    for (const match of source.matchAll(/\bicon\s*:\s*['"]([^'"]+)['"]/g)) candidates.add(match[1]);
  }
  for (const name of candidates) assert.ok(registry.exists(name), `unknown icon reference: ${name}`);
  // This dynamic Provider queue chooses its icon from a ternary, not a direct literal call.
  for (const name of ['st-quote', 'inbox', 'calendar', 'wrench']) assert.ok(registry.exists(name), `provider queue icon: ${name}`);
});

test('all six shipped image assets exist, are referenced, and are precached', () => {
  const sourceFiles = [
    'apps/admin/index.html', 'apps/customer/index.html', 'apps/customer/styles/customer.css',
    'shared/config/legacy-data.js', 'manifest.json', 'service-worker.js',
  ];
  const combined = sourceFiles.map(read).join('\n');
  const sw = read('service-worker.js');
  for (const asset of assetFiles) {
    const full = path.join(ROOT, asset);
    assert.ok(fs.statSync(full).size > 0, `empty asset: ${asset}`);
    assert.ok(combined.includes(path.posix.basename(asset)), `unreferenced asset: ${asset}`);
    assert.ok(sw.includes(`'${asset}'`), `asset not in service-worker precache: ${asset}`);
    if (asset.endsWith('.svg')) {
      const svg = read(asset);
      assert.match(svg, /<svg[\s>]/i, `invalid SVG root: ${asset}`);
      assert.match(svg, /viewBox=/i, `missing viewBox: ${asset}`);
    }
  }
});

test('shipped image assets are not byte-identical duplicates', () => {
  const hashes = assetFiles.map((asset) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, asset))).digest('hex'));
  assert.equal(new Set(hashes).size, hashes.length, 'duplicate asset bytes detected; review before retaining both');
});
