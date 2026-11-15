/**
 * Route → data plan. For every application route, loads exactly the documents the domain handler needs
 * (see docs/FIREBASE_BACKEND.md "Read/write cost per operation"). Lists are bounded and cursor-paginated.
 * Correctness rule: anything a handler checks (ownership, duplicate phone, candidate matching, current quote,
 * existing review/transaction) MUST be loaded here, otherwise the rule would silently weaken — covered by tests.
 */
'use strict';
const { decodeCursor } = require('./partial');

const PAGE_DEFAULT = 50, PAGE_MAX = 100, CANDIDATE_LIMIT = 100, DIRECTORY_LIMIT = 100;
const pageOpts = (query, pageKey, orderBy) => ({
  orderBy, pageKey,
  limit: Math.min(PAGE_MAX, Math.max(1, parseInt(query.limit, 10) || PAGE_DEFAULT)),
  cursor: decodeCursor(query.cursor)
});

/** A request with everything its lifecycle rules read: quotes, assignments, transactions, reviews, people. */
async function requestBundle(ld, id) {
  const r = await ld.doc('serviceRequests', id);
  if (!r) return null;
  const [, assignments] = await Promise.all([
    ld.where('quotes', [['reqId', '==', r.id]]),
    ld.where('assignments', [['reqId', '==', r.id]]),
    ld.where('transactions', [['reqId', '==', r.id]]),
    ld.where('reviews', [['reqId', '==', r.id]]),
    ld.doc('customers', r.customerId)
  ]);
  await ld.docsIn('providers', assignments.map(a => a.providerId));
  return r;
}
/** Many requests' quotes + assignments in chunked queries (lists; no per-request round trips). */
async function requestsLite(ld, reqs) {
  const ids = reqs.map(r => r.id);
  const [, assignments] = await Promise.all([ld.where('quotes', [['reqId', 'in', ids]]), ld.where('assignments', [['reqId', 'in', ids]])]);
  await ld.docsIn('providers', assignments.filter(a => a.status === 'accepted').map(a => a.providerId));
  return reqs;
}
/** Matching candidates for assignment: approved providers in the category, with the history ranking uses. */
async function candidates(ld, cat) {
  if (!cat) return [];
  const ps = await ld.where('providers', [['status', '==', 'approved'], ['cats', 'array-contains', String(cat)]], { limit: CANDIDATE_LIMIT });
  const ids = ps.map(p => p.id);
  await Promise.all([ld.where('reviews', [['providerId', 'in', ids]]), ld.where('assignments', [['providerId', 'in', ids]])]);
  return ps;
}

async function plan(ld, { method, path, query, body, actor }) {
  const sys = await ld.loadSystem();
  const autoAssign = !sys.settings || sys.settings.autoAssign !== false;
  const seg = path.split('/').filter(Boolean);
  const tag = actor ? actor.role + ':' + actor.id : null;
  if (actor && actor.role === 'customer') await ld.doc('customers', actor.id);
  if (actor && actor.role === 'provider') await ld.doc('providers', actor.id);

  /* ── requests ── */
  if (seg[0] === 'requests') {
    if (seg.length === 1 && method === 'POST') { if (autoAssign) await candidates(ld, body.cat); return; }
    if (seg.length === 1 && method === 'GET') {
      if (!actor) return;
      let reqs;
      if (actor.role === 'customer') reqs = await ld.where('serviceRequests', [['customerId', '==', actor.id]], pageOpts(query, 'requests', ['createdAt', 'desc']));
      else if (actor.role === 'provider') {
        const as = await ld.where('assignments', [['providerId', '==', actor.id]], pageOpts(query, 'requests', ['at', 'desc']));
        reqs = await ld.docsIn('serviceRequests', as.map(a => a.reqId));
      } else reqs = await ld.where('serviceRequests', query.status ? [['status', '==', String(query.status)]] : [], pageOpts(query, 'requests', ['createdAt', 'desc']));
      await requestsLite(ld, reqs);
      return;
    }
    const r = await requestBundle(ld, seg[1]);
    if (!r) return;
    const act = seg[2];
    if (act === 'provider' && body.providerId) await ld.doc('providers', body.providerId);
    if ((act === 'respond' && !body.accept && autoAssign) || act === 'cancel' || (act === 'repeat' && autoAssign)) await candidates(ld, r.cat);
    if (act === 'review' || act === 'close' || act === 'complete') {
      const accepted = [...ld.maps.assignments.values()].find(a => a.reqId === r.id && a.status === 'accepted');
      if (accepted) await ld.where('reviews', [['providerId', '==', accepted.providerId]]);
    }
    return;
  }

  /* ── admin ── */
  if (seg[0] === 'admin') {
    if (seg[1] === 'requests') { const r = await requestBundle(ld, seg[2]); if (r) await candidates(ld, r.cat); if (body && body.providerId) await ld.doc('providers', body.providerId); return; }
    if (seg[1] === 'providers' && seg.length === 2) { await ld.where('providers', query.status ? [['status', '==', String(query.status)]] : [], pageOpts(query, 'providers', ['createdAt', 'desc'])); return; }
    if (seg[1] === 'providers') { await ld.doc('providers', seg[2]); return; }
    if (seg[1] === 'customers') { await ld.doc('customers', seg[2]); return; }
    if (seg[1] === 'transactions' && seg.length === 2) { await ld.where('transactions', query.collection ? [['collection', '==', String(query.collection)]] : [], pageOpts(query, 'transactions', ['at', 'desc'])); return; }
    if (seg[1] === 'transactions') { await ld.doc('transactions', seg[2]); return; }
    return;                                   // commission → settings (already loaded); summary → aggregation (service)
  }

  /* ── providers ── */
  if (seg[0] === 'providers') {
    if (seg[1] === 'register') { if (body.phone) await ld.where('providers', [['phone', '==', String(body.phone)]], { limit: 1 }); return; }
    if (seg[1] === 'me' && seg[2] === 'earnings') { await ld.where('transactions', [['providerId', '==', actor ? actor.id : '-']], pageOpts(query, 'transactions', ['at', 'desc'])); return; }
    if (seg[1] === 'me') return;
    if (seg.length === 1) {
      const ps = await ld.where('providers', [['status', '==', 'approved'], ...(query.cat ? [['cats', 'array-contains', String(query.cat)]] : [])], { limit: DIRECTORY_LIMIT });
      await ld.where('reviews', [['providerId', 'in', ps.map(p => p.id)]]);
      return;
    }
    await ld.doc('providers', seg[1]);
    await ld.where('reviews', [['providerId', '==', String(seg[1])]], { orderBy: ['at', 'desc'], limit: 50 });
    return;
  }

  /* ── customer self-service ── */
  if (seg[0] === 'customers' && actor && actor.role === 'customer') {
    if (seg.length === 2 && method === 'DELETE') { await Promise.all([ld.where('addresses', [['customerId', '==', actor.id]]), ld.where('favorites', [['customerId', '==', actor.id]])]); return; }
    if (seg.length === 2 && method === 'PATCH' && body.phone) await ld.where('customers', [['phone', '==', String(body.phone).trim()]], { limit: 2 });
    if (seg[2] === 'addresses') await ld.where('addresses', [['customerId', '==', actor.id]]);
    if (seg[2] === 'favorites') await ld.where('favorites', [['customerId', '==', actor.id]]);
    return;
  }

  /* ── inbox / support ── */
  if (seg[0] === 'notifications' && tag) {
    if (method === 'GET') await ld.where('notifications', [['to', '==', tag]], pageOpts(query, 'notifications', ['at', 'desc']));
    else await ld.where('notifications', [['to', '==', tag], ['read', '==', false]]);
    return;
  }
  if (seg[0] === 'complaints') {
    if (seg.length === 1 && method === 'POST') { if (body.reqId) await requestBundle(ld, body.reqId); if (body.providerId) await ld.doc('providers', body.providerId); return; }
    if (seg.length === 1) {
      const f = actor && actor.role === 'admin' ? [] : [['by', '==', tag || '-']];
      if (query.status) f.push(['status', '==', String(query.status)]);
      await ld.where('complaints', f, pageOpts(query, 'complaints', ['at', 'desc']));
      return;
    }
    await ld.doc('complaints', seg[1]);
  }
  /* auth/me, categories, services, free-reasons: catalogue/static — nothing to load */
}

/** Actor-scoped read model loads for session.sync (bounded windows; the UI pages beyond them on demand). */
async function syncPlan(ld, actor) {
  await ld.loadSystem();
  await ld.where('serviceAreas', []);
  const approved = await ld.where('providers', [['status', '==', 'approved']], { limit: 200 });
  if (!actor) return;
  const tag = actor.role + ':' + actor.id;
  const inbox = ld.where('notifications', [['to', '==', tag]], { orderBy: ['at', 'desc'], limit: 50 });
  const filed = ld.where('complaints', [['by', '==', tag]], { orderBy: ['at', 'desc'], limit: 50 });
  if (actor.role === 'customer') {
    await ld.doc('customers', actor.id);
    const reqs = await ld.where('serviceRequests', [['customerId', '==', actor.id]], { orderBy: ['createdAt', 'desc'], limit: 50 });
    await Promise.all([requestsLite(ld, reqs), ld.where('addresses', [['customerId', '==', actor.id]]), ld.where('favorites', [['customerId', '==', actor.id]]),
      ld.where('transactions', [['customerId', '==', actor.id]], { orderBy: ['at', 'desc'], limit: 50 }), inbox, filed]);
  } else if (actor.role === 'provider') {
    await ld.doc('providers', actor.id);
    const as = await ld.where('assignments', [['providerId', '==', actor.id]], { orderBy: ['at', 'desc'], limit: 100 });
    const reqs = await ld.docsIn('serviceRequests', as.map(a => a.reqId));
    await Promise.all([requestsLite(ld, reqs), ld.docsIn('customers', reqs.map(r => r.customerId)),
      ld.where('transactions', [['providerId', '==', actor.id]], { orderBy: ['at', 'desc'], limit: 100 }),
      ld.where('reviews', [['providerId', '==', actor.id]], { orderBy: ['at', 'desc'], limit: 50 }), inbox, filed]);
  } else if (actor.role === 'admin') {
    const reqs = await ld.where('serviceRequests', [], { orderBy: ['createdAt', 'desc'], limit: 200 });
    await Promise.all([requestsLite(ld, reqs), ld.docsIn('customers', reqs.map(r => r.customerId)),
      ld.where('providers', [], { orderBy: ['createdAt', 'desc'], limit: 300 }),
      ld.where('customers', [], { orderBy: ['createdAt', 'desc'], limit: 300 }),
      ld.where('complaints', [], { orderBy: ['at', 'desc'], limit: 200 }),
      ld.where('transactions', [], { orderBy: ['at', 'desc'], limit: 200 }),
      ld.where('reviews', [], { orderBy: ['at', 'desc'], limit: 200 }),
      ld.where('notifications', [['to', '==', 'admin']], { orderBy: ['at', 'desc'], limit: 50 })]);
  }
  void approved;
}

module.exports = { plan, syncPlan, requestBundle, candidates, PAGE_DEFAULT, PAGE_MAX };
