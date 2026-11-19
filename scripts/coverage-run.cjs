#!/usr/bin/env node
/* Runs the unit suite with raw V8 coverage into a temp dir, then prints the function-level coverage map. */
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-v8cov-'));
const files = fs.readdirSync('tests/unit').filter(f => f.endsWith('.test.js')).map(f => path.join('tests/unit', f));
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, NODE_V8_COVERAGE: dir } });
if (r.status) console.warn('note: some tests failed under coverage (exit ' + r.status + ') — the map is still written');
spawnSync(process.execPath, [path.join(__dirname, 'coverage-map.cjs'), dir, process.cwd(), 'coverage-map.txt'], { stdio: 'inherit' });
fs.rmSync(dir, { recursive: true, force: true });