'use strict';
/* Customer offers round (apps/customer/pages/offers.js): the 5-second undo bar. When the choice is actually sent, the
   one-second countdown must stop too — otherwise it repaints the bar forever and, on the next choice, writes the OLD
   technician's name over the new one. Classic script loaded in node:vm with fake timers / DOM. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const timers = new Map(); let seq = 0;
  const add = (kind, fn, ms) => { const id = ++seq; timers.set(id, { kind, fn, ms }); return id; };
  const clear = (id) => { timers.delete(id); };
  const bar = { hidden: true, innerHTML: '', querySelector: () => null };
  let onClick = null;
  const sent = [];
  const ctx = {
    console, Date, Math, JSON, Number, String, Array, Map, Set, Object,
    setTimeout: (fn, ms) => add('timeout', fn, ms), clearTimeout: clear,
    setInterval: (fn, ms) => add('interval', fn, ms), clearInterval: clear,
    document: { addEventListener: (t, fn) => { if (t === 'click') onClick = fn; }, querySelector: (s) => (s === '[data-of-undo-bar]' ? bar : null) },
    MP: { get: (col, id) => ({ p1: { name: 'كريم' }, p2: { name: 'هاني' } }[id] || null) },
    esc: (s) => String(s), ic: () => '', money: (n) => String(n), toast: () => {}, show: () => {},
    state: { lastShown: { arg: 'r1' } },
    HSOrdersApi: { choose: () => ({}) },
    apiCall: (key) => { sent.push(key); }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../apps/customer/pages/offers.js'), 'utf8'), ctx, { filename: 'offers.js' });
  const choose = (pid) => {
    const btn = { dataset: { ofChoose: pid }, closest: (s) => (s === '.offers' ? {} : null) };
    onClick({ preventDefault() {}, target: { closest: (s) => (s === '[data-of-choose]' ? btn : null) } });
  };
  const fire = (kind) => { for (const [id, t] of [...timers]) if (t.kind === kind) { if (kind === 'timeout') timers.delete(id); t.fn(); } };
  return { timers, bar, choose, fire, sent };
}

test('sending the choice stops the undo countdown (no endless repaint, no stale name on the next choice)', () => {
  const w = load();
  w.choose('p1');
  assert.match(w.bar.innerHTML, /كريم/);
  assert.equal([...w.timers.values()].filter((t) => t.kind === 'interval').length, 1);
  w.fire('timeout');                                                     // 5 s later: the choice is sent
  assert.deepEqual(w.sent, ['choose:r1']);
  assert.equal([...w.timers.values()].filter((t) => t.kind === 'interval').length, 0, 'countdown cleared once sent');
  w.choose('p2');
  w.fire('interval');
  assert.match(w.bar.innerHTML, /هاني/);
  assert.doesNotMatch(w.bar.innerHTML, /كريم/, 'the old countdown never paints the previous technician');
});
