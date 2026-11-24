'use strict';
/* 2026-11-24 round 4: the Customer app "answers back" — experience layer, brand backgrounds, live wizard sentence. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('experience.js loads after app.js, is precached, and is inert without a DOM', () => {
  const html = read('apps/customer/index.html');
  assert.ok(html.indexOf('src="experience.js"') > html.indexOf('src="app.js"'), 'after app.js');
  assert.match(read('service-worker.js'), /'apps\/customer\/experience\.js'/);
  const ctx = {}; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read('apps/customer/experience.js'), ctx);
  assert.equal(ctx.HSExperience, undefined, 'no document → nothing mounted');
});

test('guide hints: once per session, never over forms or sheets, menu reaches orders and support', () => {
  const src = read('apps/customer/experience.js');
  assert.match(src, /sessionStorage\.setItem\('hs_cue_'/);
  assert.match(src, /getComputedStyle\(fab\)\.display === 'none'/, 'hidden help button (forms) → no hint');
  assert.match(src, /classList\.contains\('open'\)\) return false/, 'open sheet → no hint');
  for (const a of ['data-act="newReq"', 'data-go="orders"', 'data-go="support"', 'data-act="cam"']) assert.ok(src.includes(a), a);
  assert.match(src, /if \(!fresh \|\| reduce\(\)\) return;/, 'silent re-renders and reduced motion never animate');
});

test('brand backgrounds are light vectors and used by the inner-page header, empty states and the guide', () => {
  for (const f of ['bg-navy.svg', 'bg-red.svg', 'bg-light.svg']) {
    const p = path.join(ROOT, 'assets/brand', f);
    assert.ok(fs.statSync(p).size < 6000, f + ' is light');
    assert.match(fs.readFileSync(p, 'utf8'), /^<svg /);
    assert.match(read('service-worker.js'), new RegExp(`'assets/brand/${f.replace('.', '\\.')}'`));
  }
  const css = read('apps/customer/styles/brand-2026.css');
  assert.match(css, /\.dhead:first-child\{height:auto[^}]*\}[\s\S]*bg-navy\.svg/);
  assert.match(css, /#view \.empty,#sheet \.empty\{[^}]*bg-light\.svg/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.hm-gear\{transform:none\}\}/);
});

test('wizard: a live sentence follows the progress bar; categories use the brand icons', () => {
  const wiz = read('apps/customer/pages/request-wizard.page.js');
  assert.match(wiz, /wzProgressBar\(w\.step\) \+ wzSay\(w\)/);
  assert.match(wiz, /role="status" aria-live="polite"/);
  assert.match(wiz, /wzBrandIc\(x\.id\) \|\| safeIcp/);
  const bi = {}; bi.globalThis = bi; vm.createContext(bi);
  vm.runInContext(read('apps/customer/brand-icons.js'), bi);
  const m = bi.HSBrandIcons.mark(40);
  assert.match(m, /class="hm-gear"/); assert.equal((m.match(/<rect x="42\.5"/g) || []).length, 8, 'eight gear teeth');
});
