'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../apps/admin/pages/settlements.page.js');

const fixtures = () => S.buildFixtures().map((x) => structuredClone(x));
const first = () => fixtures()[0];
const errors = (row) => S.validateSettlements([row]);
const has = (row, fragment) => errors(row).some((x) => x.includes(fragment));

test('empty settlement collection has zero-safe aggregates', () => {
  assert.deepEqual(S.validateSettlements([]), []);
  assert.deepEqual(S.counts([]), { total: 0, pending: 0, in_review: 0, approved: 0, on_hold: 0, completed: 0 });
  assert.deepEqual(S.totals([]), { total: 0, settled: 0, outstanding: 0, onHold: 0, discrepancyCount: 0, discrepancyAmount: 0 });
  assert.deepEqual(S.byProvider([]), []);
});

test('validator rejects duplicate settlement ids across rows', () => {
  const a = first(); const b = { ...first(), ref: 'STL-DEMO-9999' };
  assert(S.validateSettlements([a, b]).some((x) => x.includes('duplicate id')));
});

test('validator rejects duplicate references even when ids differ', () => {
  const a = first(); const b = { ...first(), id: 'different-id' };
  assert(S.validateSettlements([a, b]).some((x) => x.includes('duplicate reference')));
});

test('validator rejects malformed reference formats', () => {
  for (const ref of ['', 'STL-1', 'STL-DEMO-12', 'stl-demo-0001', 'STL-DEMO-00001']) {
    assert(has({ ...first(), ref }, 'reference must look like'), String(ref));
  }
});

test('validator rejects zero, negative, fractional and string amounts', () => {
  for (const amount of [0, -1, 1.25, '100']) assert(has({ ...first(), amount }, 'amount must be a positive whole number'), String(amount));
});

test('validator rejects unknown workflow statuses', () => {
  assert(has({ ...first(), status: 'paid' }, 'unknown status'));
});

test('validator rejects impossible calendar dates and malformed ISO dates', () => {
  assert(has({ ...first(), periodFrom: '2026-02-30' }, 'invalid accrual period'));
  assert(has({ ...first(), periodTo: '09/11/2026' }, 'invalid accrual period'));
});

test('validator rejects accrual periods whose start is after their end', () => {
  assert(has({ ...first(), periodFrom: '2026-11-10', periodTo: '2026-11-09' }, 'invalid accrual period'));
});

test('completed settlement requires a valid demo settlement date', () => {
  const row = { ...first(), status: 'completed', settledOn: null, dueOn: null };
  assert(has(row, 'completed settlement needs a demo settlement date'));
});

test('completed settlement cannot contain an unresolved discrepancy', () => {
  const row = { ...first(), status: 'completed', settledOn: '2026-11-01', dueOn: null,
    discrepancy: { amount: 20, reason: 'فرق تجريبي', reviewed: false } };
  assert(has(row, 'completed settlement has an open discrepancy'));
});

test('completed settlement cannot retain an on-hold reason', () => {
  const row = { ...first(), status: 'completed', settledOn: '2026-11-01', dueOn: null, hold: { reason: 'سبب تجريبي' } };
  assert(has(row, 'completed settlement cannot be on hold'));
});

test('non-completed settlement cannot have a settled date', () => {
  const row = { ...first(), status: 'pending', settledOn: '2026-11-01' };
  assert(has(row, 'only completed settlements have a settlement date'));
});

test('non-completed settlement requires a valid expected due date', () => {
  const row = { ...first(), status: 'pending', dueOn: 'not-a-date' };
  assert(has(row, 'expected settlement date missing'));
});

test('on-hold settlement requires a non-empty reason of at least three characters', () => {
  for (const reason of ['', '  ', 'ab']) {
    const row = { ...first(), status: 'on_hold', dueOn: '2026-11-10', hold: { reason } };
    assert(has(row, 'on-hold settlement needs a reason'), JSON.stringify(reason));
  }
});

test('hold reason is invalid when status is not on_hold', () => {
  const row = { ...first(), status: 'pending', hold: { reason: 'سبب صالح' } };
  assert(has(row, 'hold reason on a settlement that is not on hold'));
});

test('discrepancy requires positive integer amount, reason and boolean reviewed flag', () => {
  const base = first();
  for (const discrepancy of [
    { amount: 0, reason: 'سبب', reviewed: false },
    { amount: 1.5, reason: 'سبب', reviewed: false },
    { amount: 10, reason: '   ', reviewed: false },
    { amount: 10, reason: 'سبب', reviewed: 'false' }
  ]) assert(has({ ...base, discrepancy }, 'invalid discrepancy'), JSON.stringify(discrepancy));
});

test('approved settlement cannot contain an unresolved discrepancy', () => {
  const row = { ...first(), status: 'approved', dueOn: '2026-11-10',
    discrepancy: { amount: 20, reason: 'فرق تجريبي', reviewed: false } };
  assert(has(row, 'approved settlement has an open discrepancy'));
});

test('provider aggregation is deterministic and conserves provider totals', () => {
  const rows = fixtures(); const groups = S.byProvider(rows);
  assert.equal(groups.length, 8);
  for (const group of groups) {
    const source = rows.filter((x) => x.providerId === group.providerId);
    assert.equal(group.count, source.length);
    assert.equal(group.total, source.reduce((n, x) => n + x.amount, 0));
    assert.equal(group.settled, source.filter((x) => x.status === 'completed').reduce((n, x) => n + x.amount, 0));
    assert.equal(group.outstanding, group.total - group.settled);
  }
});

test('review discrepancy trims and caps its audit reason without changing financial values', () => {
  const rows = fixtures(); const row = rows.find((x) => x.discrepancy && !x.discrepancy.reviewed);
  const beforeAmount = row.amount; const beforeStatus = row.status;
  const result = S.reviewDiscrepancy(rows, [], row.id, { note: `  ${'م'.repeat(350)}  ` }, '2026-11-09T12:00:00Z');
  const updated = result.settlements.find((x) => x.id === row.id);
  assert.equal(updated.discrepancy.reviewed, true);
  assert.equal(updated.amount, beforeAmount);
  assert.equal(updated.status, beforeStatus);
  assert.equal(result.log[0].note.length, S.REASON_MAX);
  assert.equal(result.log[0].simulated, true);
});

test('transition accepts optional note for non-reason-required states and trims it', () => {
  const rows = fixtures(); const row = rows.find((x) => x.status === 'pending' && !x.discrepancy);
  const result = S.transition(rows, [], row.id, 'in_review', { note: '  متابعة داخلية  ' }, '2026-11-09T13:00:00Z');
  assert.equal(result.log[0].note, 'متابعة داخلية');
  assert.equal(result.log[0].simulated, true);
});

test('transition caps optional notes at the documented maximum', () => {
  const rows = fixtures(); const row = rows.find((x) => x.status === 'pending' && !x.discrepancy);
  const result = S.transition(rows, [], row.id, 'in_review', { note: 'ن'.repeat(500) });
  assert.equal(result.log[0].note.length, S.REASON_MAX);
});

test('resetState restores deterministic fixture state and clears local action log', () => {
  const rows = fixtures(); const row = rows.find((x) => x.status === 'pending' && !x.discrepancy);
  const changed = S.transition(rows, [], row.id, 'in_review', {});
  // Module state is intentionally independent from pure-function return values.
  S.resetState();
  assert.equal(S._log().length, 0);
  assert.deepEqual(S.validateSettlements(S._settlements()), []);
  assert.deepEqual(S._settlements(), S.buildFixtures());
  assert.notEqual(changed.settlements.find((x) => x.id === row.id).status, 'pending');
});
