'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const { HS_Q_BANK, HS_Q_ITEM, HS_Q_PROBLEM } = require(path.join(root, 'services', 'catalog-question-bank.js'));
const { CAT } = require(path.join(root, 'services', 'local-catalog.js'));

const db = CAT.db();
const itemIds = new Set(db.items.map(i => i.id));
const problemIds = new Set(db.problems.map(p => p.id));
const bankIds = new Set(HS_Q_BANK.map(q => q.id));

test('bank ids are snake_case ASCII, unique and at most 32 chars', () => {
  const seen = new Set();
  for (const q of HS_Q_BANK) {
    assert.match(q.id, /^[a-z][a-z0-9_]*$/, q.id);
    assert.ok(q.id.length <= 32, q.id);
    assert.ok(!seen.has(q.id), 'duplicate ' + q.id);
    seen.add(q.id);
    assert.ok(typeof q.label === 'string' && q.label.trim(), q.id + ' label');
    assert.ok(['select', 'number', 'input'].includes(q.type), q.id + ' type');
  }
});

test('every select has 2-6 options', () => {
  for (const q of HS_Q_BANK.filter(x => x.type === 'select')) {
    assert.ok(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 6, q.id);
  }
});

test('every catalog item is covered and every key is a real item / problem', () => {
  for (const id of itemIds) assert.ok(Array.isArray(HS_Q_ITEM[id]), 'missing item ' + id);
  for (const id of Object.keys(HS_Q_ITEM)) assert.ok(itemIds.has(id), 'unknown item ' + id);
  for (const id of Object.keys(HS_Q_PROBLEM)) assert.ok(problemIds.has(id), 'unknown problem ' + id);
});

test('every reference exists, limits hold, and no bank entry is unused', () => {
  const used = new Set();
  const check = (map, label) => {
    for (const [key, refs] of Object.entries(map)) {
      assert.ok(refs.length <= 2, label + ' ' + key + ' has more than 2');
      const ids = refs.map(r => r.id);
      assert.equal(new Set(ids).size, ids.length, 'duplicate ref in ' + key);
      for (const r of refs) {
        assert.ok(bankIds.has(r.id), key + ' -> ' + r.id);
        assert.equal(typeof r.required, 'boolean', key + ' -> ' + r.id);
        used.add(r.id);
      }
    }
  };
  check(HS_Q_ITEM, 'item');
  check(HS_Q_PROBLEM, 'problem');
  for (const id of bankIds) assert.ok(used.has(id), 'unused bank entry ' + id);
});

test('required only for car make and painting rooms', () => {
  const carItems = [...itemIds].filter(id => id.startsWith('cars/'));
  assert.ok(carItems.length > 0);
  for (const id of carItems) {
    const make = HS_Q_ITEM[id].find(r => r.id === 'make');
    assert.ok(make && make.required === true, id + ' needs required make');
  }
  const all = [].concat(...Object.entries(HS_Q_ITEM).map(([k, refs]) => refs.map(r => [k, r])),
    ...Object.entries(HS_Q_PROBLEM).map(([k, refs]) => refs.map(r => [k, r])));
  for (const [key, r] of all) {
    if (!r.required) continue;
    const ok = (key.startsWith('cars/') && r.id === 'make') || (key === 'painting/full-apartment' && r.id === 'rooms');
    assert.ok(ok, 'unexpected required ' + key + ' -> ' + r.id);
  }
});

test('kept ids and door install question', () => {
  assert.ok(problemIds.has('carpentry/doors/install'));
  assert.ok(HS_Q_PROBLEM['carpentry/doors/install'].some(r => r.id === 'door_frame'));
  assert.ok(HS_Q_ITEM['cleaning/apartments'].some(r => r.id === 'area'));
  const washer = HS_Q_ITEM['appliances/washer-auto'].map(r => r.id);
  assert.ok(washer.includes('brand') && washer.includes('pattern'));
});
