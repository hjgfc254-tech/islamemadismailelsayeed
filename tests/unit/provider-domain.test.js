/* HANSALEHLAK V8 — Provider domain adapter tests. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REQUEST_DOMAIN_PATH = path.resolve(__dirname, '../../apps/provider/provider-request-domain.js');
const ADAPTER_PATH = path.resolve(__dirname, '../../apps/provider/provider-domain.js');

function freshContext() {
  const sandbox = { globalThis: null, module: { exports: {} }, exports: {} };
  sandbox.globalThis = sandbox;
  return vm.createContext(sandbox);
}

function loadInto(ctx, file) {
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, ctx, { filename: file });
}

function loadBoth() {
  const ctx = freshContext();
  loadInto(ctx, REQUEST_DOMAIN_PATH);
  loadInto(ctx, ADAPTER_PATH);
  return ctx;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const ctx = loadBoth();

test('loads new domain first, then adapter; HSProviderDomain exists on globalThis', () => {
  assert.ok(ctx.HSProviderRequestDomain, 'HSProviderRequestDomain missing');
  assert.ok(ctx.HSProviderDomain, 'HSProviderDomain missing');
});

test('adapter API is frozen', () => {
  assert.equal(Object.isFrozen(ctx.HSProviderDomain), true);
  assert.equal(Object.isFrozen(ctx.HSProviderDomain.GROUPS), true);
});

test('GROUPS exposes the six Arabic labels', () => {
  const expected = {
    new: 'طلبات جديدة', accepted: 'مقبولة', progress: 'جارية',
    quote: 'عروض الأسعار', done: 'مكتملة', cancelled: 'ملغاة / مرفوضة'
  };
  const { GROUPS } = ctx.HSProviderDomain;
  assert.deepEqual(Object.keys(GROUPS).sort(), Object.keys(expected).sort());
  for (const key of Object.keys(expected)) assert.equal(GROUPS[key], expected[key]);
});

test('groupOf matches getRequestGroup across all cases', () => {
  const { HSProviderDomain, HSProviderRequestDomain } = ctx;
  const cases = [
    { name: 'no assignment', request: { status: 'scheduled' }, assignment: undefined },
    { name: 'offered', request: { status: 'scheduled' }, assignment: { status: 'offered' } },
    { name: 'rejected', request: { status: 'scheduled' }, assignment: { status: 'rejected' } },
    { name: 'withdrawn', request: { status: 'scheduled' }, assignment: { status: 'withdrawn' } },
    { name: 'accepted+completed', request: { status: 'completed' }, assignment: { status: 'accepted' } },
    { name: 'accepted+closed', request: { status: 'closed' }, assignment: { status: 'accepted' } },
    { name: 'accepted+cancelled', request: { status: 'cancelled' }, assignment: { status: 'accepted' } },
    { name: 'accepted+failed', request: { status: 'failed' }, assignment: { status: 'accepted' } },
    { name: 'accepted+quote', request: { status: 'quote' }, assignment: { status: 'accepted' } },
    { name: 'accepted+enroute', request: { status: 'enroute' }, assignment: { status: 'accepted' } },
    { name: 'accepted+arrived', request: { status: 'arrived' }, assignment: { status: 'accepted' } },
    { name: 'accepted+started', request: { status: 'started' }, assignment: { status: 'accepted' } },
    { name: 'accepted+scheduled', request: { status: 'scheduled' }, assignment: { status: 'accepted' } },
    { name: 'accepted+unknown', request: { status: 'mystery' }, assignment: { status: 'accepted' } }
  ];
  for (const c of cases) {
    assert.equal(HSProviderDomain.groupOf(c.request, c.assignment), HSProviderRequestDomain.getRequestGroup(c.request, c.assignment), `mismatch for case: ${c.name}`);
  }
});

test('groupAssignments matches groupProviderRequests output', () => {
  const db = {
    serviceRequests: [
      { id: 'r1', status: 'scheduled', createdAt: '2024-01-01' },
      { id: 'r2', status: 'completed', createdAt: '2024-01-02' },
      { id: 'r3', status: 'quote', createdAt: '2024-01-03' },
      { id: 'r4', status: 'cancelled', createdAt: '2024-01-04' }
    ],
    assignments: [
      { id: 'a1', reqId: 'r1', providerId: 'p1', status: 'accepted' },
      { id: 'a2', reqId: 'r2', providerId: 'p1', status: 'accepted' },
      { id: 'a3', reqId: 'r3', providerId: 'p1', status: 'accepted' },
      { id: 'a4', reqId: 'r4', providerId: 'p1', status: 'accepted' }
    ]
  };
  assert.deepEqual(plain(ctx.HSProviderDomain.groupAssignments(db, 'p1')), plain(ctx.HSProviderRequestDomain.groupProviderRequests(db, 'p1')));
});

test('all six groups exist even for an empty database', () => {
  const result = ctx.HSProviderDomain.groupAssignments({ serviceRequests: [], assignments: [] }, 'p1');
  assert.deepEqual(Object.keys(result).sort(), ['accepted', 'cancelled', 'done', 'new', 'progress', 'quote']);
  for (const key of Object.keys(result)) assert.ok(Array.isArray(result[key])) && assert.equal(result[key].length, 0);
  const empty = ctx.HSProviderDomain.groupAssignments({}, 'p1');
  assert.deepEqual(Object.keys(empty).sort(), ['accepted', 'cancelled', 'done', 'new', 'progress', 'quote']);
});

test('does not include assignments belonging to other providers', () => {
  const db = {
    serviceRequests: [{ id: 'r1', status: 'scheduled' }, { id: 'r2', status: 'scheduled' }],
    assignments: [
      { id: 'a1', reqId: 'r1', providerId: 'p1', status: 'accepted' },
      { id: 'a2', reqId: 'r2', providerId: 'p2', status: 'accepted' }
    ]
  };
  const all = Object.values(ctx.HSProviderDomain.groupAssignments(db, 'p1')).flat();
  assert.equal(all.length, 1);
  assert.equal(all[0].assignment.id, 'a1');
  assert.equal(all[0].request.id, 'r1');
});

test('ignores orphan assignments whose request is missing', () => {
  const db = {
    serviceRequests: [{ id: 'r1', status: 'scheduled' }],
    assignments: [
      { id: 'a1', reqId: 'r1', providerId: 'p1', status: 'accepted' },
      { id: 'a2', reqId: 'missing', providerId: 'p1', status: 'accepted' }
    ]
  };
  const all = Object.values(ctx.HSProviderDomain.groupAssignments(db, 'p1')).flat();
  assert.equal(all.length, 1);
  assert.equal(all[0].assignment.id, 'a1');
});

test('preserves assignment-id deduplication behavior of the underlying domain', () => {
  const db = {
    serviceRequests: [{ id: 'r1', status: 'scheduled' }],
    assignments: [
      { id: 'dup', reqId: 'r1', providerId: 'p1', status: 'accepted' },
      { id: 'dup', reqId: 'r1', providerId: 'p1', status: 'accepted' }
    ]
  };
  const adapterResult = ctx.HSProviderDomain.groupAssignments(db, 'p1');
  const domainResult = ctx.HSProviderRequestDomain.groupProviderRequests(db, 'p1');
  assert.deepEqual(plain(adapterResult), plain(domainResult));
  assert.ok(Object.values(adapterResult).flat().length <= 1);
});

test('totals sums value, commission and net', () => {
  assert.deepEqual(plain(ctx.HSProviderDomain.totals([
    { value: 100, commission: 10, net: 90 },
    { value: 200, commission: 20, net: 180 },
    { value: 50, commission: 5, net: 45 }
  ])), { value: 350, commission: 35, net: 315 });
});

test('totals handles null, undefined, non-numeric and infinite values as zero', () => {
  const result = ctx.HSProviderDomain.totals([
    { value: 100, commission: 10, net: 90 },
    { value: null, commission: undefined, net: 'abc' },
    { value: '50', commission: '5', net: '45' },
    null, undefined,
    { value: NaN, commission: Infinity, net: -Infinity }
  ]);
  assert.deepEqual(plain(result), { value: 150, commission: 15, net: 135 });
});

test('totals does not mutate the input array', () => {
  const input = [{ value: 10, commission: 1, net: 9 }, { value: 20, commission: 2, net: 18 }];
  const snapshot = JSON.stringify(input);
  ctx.HSProviderDomain.totals(input);
  assert.equal(JSON.stringify(input), snapshot);
});

test('totals handles missing or invalid transactions array', () => {
  for (const input of [undefined, null, 'not-an-array', 42, {}]) {
    assert.deepEqual(plain(ctx.HSProviderDomain.totals(input)), { value: 0, commission: 0, net: 0 });
  }
});

test('adapter throws a clear error if loaded without the base domain', () => {
  const isolated = freshContext();
  assert.throws(() => loadInto(isolated, ADAPTER_PATH), (err) => {
    assert.match(String(err.message), /HSProviderRequestDomain/);
    assert.match(String(err.message), /provider-request-domain\.js/);
    return true;
  });
  assert.equal(isolated.HSProviderDomain, undefined);
});
