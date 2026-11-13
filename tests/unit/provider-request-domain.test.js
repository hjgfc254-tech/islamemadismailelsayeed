'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const Domain = require(
  path.resolve(__dirname, '../../apps/provider/provider-request-domain.js')
);

const {
  GROUPS,
  getRequestGroup,
  groupProviderRequests,
  getProviderRequestStats,
  getProviderFinancialSummary,
  getProviderRatingSummary,
  getUpcomingAppointments,
  getProviderPriorityActions,
  filterProviderRequests
} = Domain;

/* Fixture builders */
function makeRequest(over = {}) {
  return Object.assign({
    id: 'r1', no: 1001, customerId: 'c1', serviceName: 'سباكة',
    cat: 'plumbing', desc: 'تسريب في الحمام', status: 'accepted',
    createdAt: '2024-05-01T10:00:00Z', when: '2024-05-05T09:00:00Z',
    agreedAt: '', proposal: null, flexible: false, gov: 'القاهرة',
    area: 'المعادي', addr: 'شارع 1', phone: '01000000000',
    answers: {}, photos: [], geo: null
  }, over);
}
function makeAssignment(over = {}) {
  return Object.assign({ id: 'a1', reqId: 'r1', providerId: 'p1', status: 'accepted' }, over);
}
function makeTx(over = {}) {
  return Object.assign({
    id: 't1', reqId: 'r1', providerId: 'p1', value: 100,
    rate: 0.1, commission: 10, net: 90, at: '2024-05-01T10:00:00Z'
  }, over);
}
function makeReview(over = {}) {
  return Object.assign({
    id: 'rv1', providerId: 'p1', reqId: 'r1', stars: 5,
    comment: '', quality: '', at: '2024-05-01T10:00:00Z'
  }, over);
}
function makeDb(over = {}) {
  return Object.assign({
    providers: [], serviceRequests: [], assignments: [], transactions: [], reviews: []
  }, over);
}

/* getRequestGroup */
test('getRequestGroup returns new when request or assignment missing', () => {
  assert.equal(getRequestGroup(null, null), GROUPS.NEW);
  assert.equal(getRequestGroup(makeRequest(), null), GROUPS.NEW);
  assert.equal(getRequestGroup(null, makeAssignment()), GROUPS.NEW);
  assert.equal(getRequestGroup(undefined, undefined), GROUPS.NEW);
});
test('getRequestGroup: offered => new', () => {
  assert.equal(getRequestGroup(makeRequest(), makeAssignment({ status: 'offered' })), GROUPS.NEW);
});
test('getRequestGroup: rejected and withdrawn => cancelled', () => {
  assert.equal(getRequestGroup(makeRequest(), makeAssignment({ status: 'rejected' })), GROUPS.CANCELLED);
  assert.equal(getRequestGroup(makeRequest(), makeAssignment({ status: 'withdrawn' })), GROUPS.CANCELLED);
});
test('getRequestGroup: non-accepted unknown assignment => new', () => {
  assert.equal(getRequestGroup(makeRequest(), makeAssignment({ status: 'pending' })), GROUPS.NEW);
  assert.equal(getRequestGroup(makeRequest(), makeAssignment({ status: '' })), GROUPS.NEW);
});
test('getRequestGroup: accepted + completed/closed => done', () => {
  assert.equal(getRequestGroup(makeRequest({ status: 'completed' }), makeAssignment()), GROUPS.DONE);
  assert.equal(getRequestGroup(makeRequest({ status: 'closed' }), makeAssignment()), GROUPS.DONE);
});
test('getRequestGroup: accepted + cancelled/failed => cancelled', () => {
  assert.equal(getRequestGroup(makeRequest({ status: 'cancelled' }), makeAssignment()), GROUPS.CANCELLED);
  assert.equal(getRequestGroup(makeRequest({ status: 'failed' }), makeAssignment()), GROUPS.CANCELLED);
});
test('getRequestGroup: accepted + quote => quote', () => {
  assert.equal(getRequestGroup(makeRequest({ status: 'quote' }), makeAssignment()), GROUPS.QUOTE);
});
test('getRequestGroup: accepted + enroute/arrived/started => progress', () => {
  ['enroute', 'arrived', 'started'].forEach(s => {
    assert.equal(getRequestGroup(makeRequest({ status: s }), makeAssignment()), GROUPS.PROGRESS);
  });
});
test('getRequestGroup: accepted + accepted/scheduled => accepted', () => {
  ['accepted', 'scheduled'].forEach(s => {
    assert.equal(getRequestGroup(makeRequest({ status: s }), makeAssignment()), GROUPS.ACCEPTED);
  });
});
test('getRequestGroup: accepted + unknown request status => accepted fallback', () => {
  assert.equal(getRequestGroup(makeRequest({ status: 'weird' }), makeAssignment()), GROUPS.ACCEPTED);
});
test('getRequestGroup: rejected overrides request status', () => {
  assert.equal(getRequestGroup(makeRequest({ status: 'completed' }), makeAssignment({ status: 'rejected' })), GROUPS.CANCELLED);
});
test('getRequestGroup: offered overrides done', () => {
  assert.equal(getRequestGroup(makeRequest({ status: 'completed' }), makeAssignment({ status: 'offered' })), GROUPS.NEW);
});

/* groupProviderRequests */
test('groupProviderRequests returns all six groups on empty db', () => {
  const g = groupProviderRequests(makeDb(), 'p1');
  for (const k of ['new', 'accepted', 'progress', 'quote', 'done', 'cancelled']) {
    assert.ok(Array.isArray(g[k]));
    assert.equal(g[k].length, 0);
  }
  assert.equal(Object.keys(g).length, 6);
});
test('groupProviderRequests tolerates null arrays', () => {
  assert.equal(groupProviderRequests({ serviceRequests: null, assignments: null }, 'p1').new.length, 0);
});
test('groupProviderRequests ignores other providers and orphan assignments', () => {
  const db = makeDb({
    serviceRequests: [makeRequest({ id: 'r1' })],
    assignments: [
      makeAssignment({ id: 'a1', providerId: 'p2' }),
      makeAssignment({ id: 'a2', reqId: 'missing' })
    ]
  });
  const g = groupProviderRequests(db, 'p1');
  assert.equal(g.accepted.length, 0);
});
test('groupProviderRequests deduplicates assignments by id', () => {
  const db = makeDb({
    serviceRequests: [makeRequest({ id: 'r1' })],
    assignments: [makeAssignment({ id: 'a1' }), makeAssignment({ id: 'a1' })]
  });
  assert.equal(groupProviderRequests(db, 'p1').accepted.length, 1);
});
test('groupProviderRequests sorts newest first and invalid dates last', () => {
  const db = makeDb({
    serviceRequests: [
      makeRequest({ id: 'r1', createdAt: '2024-01-01T00:00:00Z' }),
      makeRequest({ id: 'r2', createdAt: '2024-06-01T00:00:00Z' }),
      makeRequest({ id: 'r3', createdAt: 'not-a-date' })
    ],
    assignments: [
      makeAssignment({ id: 'a1', reqId: 'r1' }),
      makeAssignment({ id: 'a2', reqId: 'r2' }),
      makeAssignment({ id: 'a3', reqId: 'r3' })
    ]
  });
  const g = groupProviderRequests(db, 'p1');
  assert.deepEqual(g.accepted.map(x => x.request.id), ['r2', 'r1', 'r3']);
});

/* stats */
test('stats count groups and pending actions', () => {
  const db = makeDb({
    serviceRequests: [
      makeRequest({ id: 'r1', status: 'quote' }),
      makeRequest({ id: 'r2', status: 'accepted' }),
      makeRequest({ id: 'r3', status: 'started' }),
      makeRequest({ id: 'r4', status: 'completed' }),
      makeRequest({ id: 'r5', status: 'cancelled' })
    ],
    assignments: [
      makeAssignment({ id: 'a1', reqId: 'r1' }),
      makeAssignment({ id: 'a2', reqId: 'r2' }),
      makeAssignment({ id: 'a3', reqId: 'r3' }),
      makeAssignment({ id: 'a4', reqId: 'r4' }),
      makeAssignment({ id: 'a5', reqId: 'r5' }),
      makeAssignment({ id: 'a6', reqId: 'r1', status: 'offered' })
    ]
  });
  const s = getProviderRequestStats(db, 'p1');
  assert.deepEqual(
    [s.newRequests, s.quoteRequests, s.acceptedRequests, s.progressRequests,
      s.completedRequests, s.cancelledRequests, s.totalRequests, s.pendingActions],
    [1, 1, 1, 1, 1, 1, 6, 4]
  );
});
test('stats on empty db returns zeros', () => {
  const s = getProviderRequestStats(makeDb(), 'p1');
  assert.equal(s.totalRequests, 0);
  assert.equal(s.pendingActions, 0);
});

/* finance */
test('financial summary aggregates only provider transactions', () => {
  const db = makeDb({ transactions: [
    makeTx({ id: 't1', value: 100, commission: 10, net: 90 }),
    makeTx({ id: 't2', value: 200, commission: 20, net: 180 }),
    makeTx({ id: 't3', providerId: 'p2', value: 999, commission: 0, net: 999 })
  ]});
  assert.deepEqual(getProviderFinancialSummary(db, 'p1'), {
    transactionCount: 2, grossValue: 300, totalCommission: 30,
    netEarnings: 270, averageTransactionValue: 150
  });
});
test('financial summary converts invalid numeric values to zero', () => {
  const db = makeDb({ transactions: [
    makeTx({ id: 't1', value: 'abc', commission: null, net: undefined }),
    makeTx({ id: 't2', value: '50', commission: '5', net: '45' })
  ]});
  const f = getProviderFinancialSummary(db, 'p1');
  assert.equal(f.transactionCount, 2);
  assert.equal(f.grossValue, 50);
  assert.equal(f.totalCommission, 5);
  assert.equal(f.netEarnings, 45);
  assert.equal(f.averageTransactionValue, 25);
});
test('financial average is zero with no transactions', () => {
  assert.equal(getProviderFinancialSummary(makeDb(), 'p1').averageTransactionValue, 0);
});

/* ratings */
test('rating summary ignores invalid stars and other providers', () => {
  const db = makeDb({ reviews: [
    makeReview({ id: 'rv1', stars: 5 }), makeReview({ id: 'rv2', stars: 4 }),
    makeReview({ id: 'rv3', stars: 0 }), makeReview({ id: 'rv4', stars: 6 }),
    makeReview({ id: 'rv5', stars: 3.5 }), makeReview({ id: 'rv6', stars: '4' }),
    makeReview({ id: 'rv7', stars: null }), makeReview({ id: 'rv8', providerId: 'p2', stars: 1 })
  ]});
  const s = getProviderRatingSummary(db, 'p1');
  assert.equal(s.reviewCount, 2);
  assert.equal(s.averageRating, 4.5);
  assert.deepEqual(s.ratingDistribution, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 });
});
test('rating average is null with no valid reviews', () => {
  const s = getProviderRatingSummary(makeDb(), 'p1');
  assert.equal(s.reviewCount, 0);
  assert.equal(s.averageRating, null);
});

/* appointments */
test('upcoming appointments include accepted and progress only', () => {
  const db = makeDb({
    serviceRequests: [
      makeRequest({ id: 'r1', status: 'accepted', agreedAt: '2099-01-01T10:00:00Z' }),
      makeRequest({ id: 'r2', status: 'started', when: '2099-02-01T10:00:00Z' }),
      makeRequest({ id: 'r3', status: 'quote', agreedAt: '2099-03-01T10:00:00Z' })
    ],
    assignments: [
      makeAssignment({ id: 'a1', reqId: 'r1' }),
      makeAssignment({ id: 'a2', reqId: 'r2' }),
      makeAssignment({ id: 'a3', reqId: 'r3' })
    ]
  });
  const out = getUpcomingAppointments(db, 'p1', '2024-01-01T00:00:00Z', 10);
  assert.deepEqual(out.map(x => x.request.id), ['r1', 'r2']);
});
test('upcoming appointments sort nearest first and respect limit', () => {
  const db = makeDb({
    serviceRequests: [
      makeRequest({ id: 'r1', status: 'accepted', agreedAt: '2099-03-01T10:00:00Z' }),
      makeRequest({ id: 'r2', status: 'accepted', agreedAt: '2099-01-01T10:00:00Z' }),
      makeRequest({ id: 'r3', status: 'accepted', agreedAt: '2099-02-01T10:00:00Z' })
    ],
    assignments: [
      makeAssignment({ id: 'a1', reqId: 'r1' }),
      makeAssignment({ id: 'a2', reqId: 'r2' }),
      makeAssignment({ id: 'a3', reqId: 'r3' })
    ]
  });
  const out = getUpcomingAppointments(db, 'p1', '2024-01-01T00:00:00Z', 2);
  assert.deepEqual(out.map(x => x.request.id), ['r2', 'r3']);
});
test('upcoming appointments exclude items older than now minus 24 hours', () => {
  const db = makeDb({
    serviceRequests: [
      makeRequest({ id: 'r1', status: 'accepted', agreedAt: '2024-05-09T11:00:00Z' }),
      makeRequest({ id: 'r2', status: 'accepted', agreedAt: '2024-05-09T13:00:00Z' })
    ],
    assignments: [
      makeAssignment({ id: 'a1', reqId: 'r1' }),
      makeAssignment({ id: 'a2', reqId: 'r2' })
    ]
  });
  const out = getUpcomingAppointments(db, 'p1', '2024-05-10T12:00:00Z', 5);
  assert.deepEqual(out.map(x => x.request.id), ['r2']);
});
test('upcoming appointments fall back to proposal.at', () => {
  const db = makeDb({
    serviceRequests: [makeRequest({
      id: 'r1', status: 'accepted', agreedAt: '', when: '',
      proposal: { at: '2099-06-01T10:00:00Z' }
    })],
    assignments: [makeAssignment({ id: 'a1', reqId: 'r1' })]
  });
  const out = getUpcomingAppointments(db, 'p1', '2024-01-01T00:00:00Z', 5);
  assert.equal(out.length, 1);
  assert.equal(out[0].appointmentAt, '2099-06-01T10:00:00Z');
});
test('upcoming appointments ignore invalid dates', () => {
  const db = makeDb({
    serviceRequests: [makeRequest({ id: 'r1', status: 'accepted', agreedAt: 'nope' })],
    assignments: [makeAssignment({ id: 'a1', reqId: 'r1' })]
  });
  assert.equal(getUpcomingAppointments(db, 'p1', '2024-01-01T00:00:00Z', 5).length, 0);
});

/* priority actions */
test('priority order is quote, new, accepted, progress', () => {
  const db = makeDb({
    serviceRequests: [
      makeRequest({ id: 'r1', status: 'quote' }),
      makeRequest({ id: 'r2', status: 'accepted' }),
      makeRequest({ id: 'r3', status: 'started' }),
      makeRequest({ id: 'r4', status: 'accepted' })
    ],
    assignments: [
      makeAssignment({ id: 'a1', reqId: 'r1' }),
      makeAssignment({ id: 'a2', reqId: 'r2' }),
      makeAssignment({ id: 'a3', reqId: 'r3' }),
      makeAssignment({ id: 'a4', reqId: 'r4', status: 'offered' })
    ]
  });
  const out = getProviderPriorityActions(db, 'p1', 10);
  assert.deepEqual(out.map(x => x.group), ['quote', 'new', 'accepted', 'progress']);
  assert.deepEqual(out.map(x => x.priority), [1, 2, 3, 4]);
});
test('priority actions exclude done and cancelled', () => {
  const db = makeDb({
    serviceRequests: [
      makeRequest({ id: 'r1', status: 'completed' }),
      makeRequest({ id: 'r2', status: 'cancelled' })
    ],
    assignments: [makeAssignment({ id: 'a1', reqId: 'r1' }), makeAssignment({ id: 'a2', reqId: 'r2' })]
  });
  assert.equal(getProviderPriorityActions(db, 'p1').length, 0);
});
test('priority actions default limit is four', () => {
  const requests = [], assignments = [];
  for (let i = 0; i < 6; i++) {
    requests.push(makeRequest({ id: 'r' + i, status: 'quote' }));
    assignments.push(makeAssignment({ id: 'a' + i, reqId: 'r' + i }));
  }
  assert.equal(getProviderPriorityActions(makeDb({
    serviceRequests: requests, assignments
  }), 'p1').length, 4);
});
test('priority actions include required fields', () => {
  const db = makeDb({
    serviceRequests: [makeRequest({ id: 'r1', no: 9001, serviceName: 'كهرباء' })],
    assignments: [makeAssignment({ id: 'a1', reqId: 'r1' })]
  });
  const [item] = getProviderPriorityActions(db, 'p1', 1);
  assert.equal(item.requestId, 'r1');
  assert.equal(item.requestNumber, 9001);
  assert.equal(item.serviceName, 'كهرباء');
  assert.equal(item.group, 'accepted');
  assert.ok(item.title.length > 0);
  assert.ok(item.description.length > 0);
});

/* filters */
test('filter by group', () => {
  const items = [
    { request: makeRequest({ id: 'r1', status: 'quote' }), assignment: makeAssignment() },
    { request: makeRequest({ id: 'r2', status: 'accepted' }), assignment: makeAssignment() }
  ];
  const out = filterProviderRequests(items, { group: 'quote' });
  assert.equal(out.length, 1);
  assert.equal(out[0].request.id, 'r1');
});
test('filter by Arabic search across fields', () => {
  const items = [
    { request: makeRequest({ id: 'r1', serviceName: 'سباكة' }), assignment: makeAssignment() },
    { request: makeRequest({ id: 'r2', serviceName: 'كهرباء', gov: 'الجيزة', area: 'الدقي' }), assignment: makeAssignment() },
    { request: makeRequest({ id: 'r3', serviceName: 'نجارة', area: 'مدينة نصر' }), assignment: makeAssignment() }
  ];
  assert.equal(filterProviderRequests(items, { search: 'سباكة' }).length, 1);
  assert.equal(filterProviderRequests(items, { search: 'الجيزة' }).length, 1);
  assert.equal(filterProviderRequests(items, { search: 'المعادي' }).length, 1);
  assert.equal(filterProviderRequests(items, { search: 'غير موجود' }).length, 0);
});
test('search is case-insensitive and matches request number', () => {
  const items = [{ request: makeRequest({ no: 12345, serviceName: 'Plumbing' }), assignment: makeAssignment() }];
  assert.equal(filterProviderRequests(items, { search: 'plumbing' }).length, 1);
  assert.equal(filterProviderRequests(items, { search: 'PLUMBING' }).length, 1);
  assert.equal(filterProviderRequests(items, { search: '12345' }).length, 1);
});
test('combined group, search, and date filters', () => {
  const items = [
    { request: makeRequest({ id: 'r1', status: 'quote', serviceName: 'سباكة', createdAt: '2024-03-01T00:00:00Z' }), assignment: makeAssignment() },
    { request: makeRequest({ id: 'r2', status: 'quote', serviceName: 'كهرباء', createdAt: '2024-03-01T00:00:00Z' }), assignment: makeAssignment() },
    { request: makeRequest({ id: 'r3', status: 'accepted', serviceName: 'سباكة', createdAt: '2024-03-01T00:00:00Z' }), assignment: makeAssignment() },
    { request: makeRequest({ id: 'r4', status: 'quote', serviceName: 'سباكة', createdAt: '2023-01-01T00:00:00Z' }), assignment: makeAssignment() }
  ];
  const out = filterProviderRequests(items, {
    group: 'quote', search: 'سباكة',
    fromDate: '2024-01-01T00:00:00Z', toDate: '2024-12-31T00:00:00Z'
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].request.id, 'r1');
});
test('filter returns a new array without mutating input', () => {
  const items = [{ request: makeRequest(), assignment: makeAssignment() }];
  const snapshot = JSON.parse(JSON.stringify(items));
  const out = filterProviderRequests(items, { search: 'سباكة' });
  assert.notEqual(out, items);
  assert.deepEqual(items, snapshot);
});

/* immutability / API */
test('module operations do not mutate database', () => {
  const db = makeDb({
    serviceRequests: [makeRequest()],
    assignments: [makeAssignment()],
    transactions: [makeTx()],
    reviews: [makeReview()]
  });
  const snapshot = JSON.parse(JSON.stringify(db));
  groupProviderRequests(db, 'p1');
  getProviderRequestStats(db, 'p1');
  getProviderFinancialSummary(db, 'p1');
  getProviderRatingSummary(db, 'p1');
  getUpcomingAppointments(db, 'p1', '2024-01-01T00:00:00Z', 5);
  getProviderPriorityActions(db, 'p1', 5);
  assert.deepEqual(db, snapshot);
});
test('exposed API is frozen and complete', () => {
  assert.ok(Object.isFrozen(Domain));
  const expected = [
    'GROUPS', 'getRequestGroup', 'groupProviderRequests', 'getProviderRequestStats',
    'getProviderFinancialSummary', 'getProviderRatingSummary', 'getUpcomingAppointments',
    'getProviderPriorityActions', 'filterProviderRequests'
  ];
  for (const key of expected) assert.ok(key in Domain, 'missing ' + key);
  for (const fn of expected.slice(1)) assert.equal(typeof Domain[fn], 'function');
});
test('GROUPS object is frozen and has expected keys', () => {
  assert.ok(Object.isFrozen(GROUPS));
  assert.deepEqual(Object.keys(GROUPS).sort(),
    ['ACCEPTED', 'CANCELLED', 'DONE', 'NEW', 'PROGRESS', 'QUOTE']);
});
