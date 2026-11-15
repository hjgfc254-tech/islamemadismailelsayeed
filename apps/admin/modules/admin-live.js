/**
 * MODULE: admin-live (HSAdminLive) — Admin pages on the real backend (Firebase mode).
 * Maps the server-synced read model (MP, filled by services/firebase-backend.js from session.sync, admin window) to
 * the row shapes the existing Admin pages render, and maps page actions to the REAL API routes only:
 *   orders     → cancel                POST /requests/:id/cancel            (the only admin lifecycle action)
 *   customers  → active | suspended    POST /admin/customers/:id/status
 *   providers  → approved | rejected | suspended   POST /admin/providers/:id/status
 *   complaints → resolved              POST /complaints/:id/resolve {resolution}
 *   reviews    → read-only (no moderation route exists)
 * Any other page action has NO backend route: it is refused with an explicit message, never simulated locally.
 * Business rules stay on the server (e.g. rejecting is only for pending registrations); this module invents nothing.
 */
'use strict';
(function (root) {
  const cfg = () => root.HSFirebaseConfig;
  const enabled = () => !!(cfg() && cfg().mode === 'firebase' && root.HSApiClient && typeof MP !== 'undefined');
  const db = () => MP.db();
  const UNSUPPORTED = 'هذا الإجراء غير متاح على الخادم بعد — لم يُنفَّذ أي تغيير.';
  const catName = (c) => { try { return MP.catName(c); } catch (e) { return c || ''; } };
  const acceptedProvider = (reqId) => {
    const a = (db().assignments || []).find((x) => x.reqId === reqId && x.status === 'accepted');
    return a ? (db().providers || []).find((p) => p.id === a.providerId) || null : null;
  };
  const amountOf = (r) => {
    const t = (db().transactions || []).find((x) => x.reqId === r.id);
    if (t) return +t.value || 0;
    const q = (db().quotes || []).find((x) => x.reqId === r.id && x.status === 'approved');
    return q ? +q.total || 0 : 0;
  };
  const nameOf = (col, id) => { const x = (db()[col] || []).find((y) => y.id === id); return x ? x.name : ''; };

  const MAP = {
    orders: () => (db().serviceRequests || []).map((r) => {
      const p = acceptedProvider(r.id);
      return {
        id: r.id, no: r.no, customer: nameOf('customers', r.customerId) || '—', service: r.serviceName || '', category: r.catName || catName(r.cat),
        provider: p ? p.name : null, area: [r.area, r.gov].filter(Boolean).join('، '), status: r.status, amount: amountOf(r), at: r.createdAt,
        history: (r.history || []).map((h) => ({ status: h.s, at: h.at, by: h.note || '' })), notes: []
      };
    }),
    customers: () => {
      const reqs = db().serviceRequests || [], txs = db().transactions || [];
      return (db().customers || []).map((c) => {
        const mine = reqs.filter((r) => r.customerId === c.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        return {
          id: c.id, name: c.name, phone: c.phone, area: mine[0] ? [mine[0].area, mine[0].gov].filter(Boolean).join('، ') : '', status: c.status || 'active',
          orders: mine.length, spent: txs.filter((t) => t.customerId === c.id).reduce((a, t) => a + (+t.value || 0), 0),
          joined: c.createdAt || null, last: mine[0] ? mine[0].createdAt : null, recent: mine.slice(0, 3).map((r) => ({ no: r.no, service: r.serviceName })), notes: []
        };
      });
    },
    providers: () => (db().providers || []).map((p) => {
      let rating = null; try { rating = MP.rating(p.id); } catch (e) { rating = null; }
      const submitted = !!(p.docs && String(p.docs).trim());       /* the backend stores one documents field */
      return {
        id: p.id, name: p.name, phone: p.phone || '', specialty: (p.cats || []).map(catName).join('، '), area: (p.areas && p.areas.length ? p.areas : (p.govs || [])).join('، '),
        status: p.status, rating: rating == null ? (p.rating || null) : rating, jobs: +p.jobs || 0, docs: { id: submitted, skill: submitted, photo: submitted },
        joined: p.createdAt || null, notes: []
      };
    }),
    complaints: (opts) => (db().complaints || []).map((k, i) => {
      const req = k.reqId ? (db().serviceRequests || []).find((r) => r.id === k.reqId) : null;
      const [role, id] = String(k.by || '').split(':');
      const types = (opts && opts.TYPES) || [];
      return {
        id: k.id, no: i + 1, subject: String(k.text || '').slice(0, 60), type: types.includes(k.kind) ? k.kind : (types[types.length - 1] || k.kind || ''),
        priority: 'medium', status: k.status === 'resolved' ? 'resolved' : 'review',
        reporter: nameOf(role === 'provider' ? 'providers' : 'customers', id) || '—', provider: k.providerId ? nameOf('providers', k.providerId) : (req && acceptedProvider(req.id) ? acceptedProvider(req.id).name : ''),
        orderNo: req ? req.no : '', created: k.at, assignee: null, text: k.text || '',
        log: [{ kind: 'open', text: 'شكوى مسجلة على الخادم', at: k.at }].concat(k.status === 'resolved' ? [{ kind: 'status', text: 'تم الحل: ' + (k.resolution || ''), at: k.at }] : [])
      };
    }),
    /* real quotes; decisions belong to the customer (quote/approve|reject) — the Admin page is read-only here.
       The backend has no expiry concept, so validUntil stays empty (never shown as expired). */
    quotes: () => {
      const MAPQ = { pending: 'submitted', approved: 'approved', rejected: 'rejected', superseded: 'returned' };
      return (db().quotes || []).map((q) => {
        const r = (db().serviceRequests || []).find((x) => x.id === q.reqId) || {};
        return { id: q.id, ref: r.no ? r.no + ' / ' + String(q.id).slice(-4) : q.id, orderNo: r.no || '', customer: nameOf('customers', r.customerId) || '—',
          provider: nameOf('providers', q.providerId) || '—', service: r.serviceName || '', category: r.catName || catName(r.cat), amount: +q.total || 0,
          submittedOn: String(q.at || '').slice(0, 10), validUntil: null, status: MAPQ[q.status] || 'submitted' };
      });
    },
    /* Uber cash model: the customer pays the provider; the provider owes the platform share (transaction commission).
       One "approved" row per provider = uncollected platform share (ready to collect); one "completed" row = collected. */
    settlements: (opts) => {
      const cats = (opts && opts.CATS) || [], known = cats.map((c) => c.id).filter((id) => id !== 'other');
      const bucket = (p) => { const c = p && (p.cats || [])[0]; return known.includes(c) ? c : 'other'; };
      const label = (id) => { const c = cats.find((x) => x.id === id); return c ? c.label : id; };
      const out = [];
      (db().providers || []).forEach((p) => {
        const txs = (db().transactions || []).filter((t) => t.providerId === p.id && !t.free);
        const pend = txs.filter((t) => t.collection === 'pending'), done = txs.filter((t) => t.collection === 'collected');
        const sum = (l) => Math.round(l.reduce((a, t) => a + (+t.commission || 0), 0) * 100) / 100;
        const span = (l) => { const ds = l.map((t) => String(t.at || '').slice(0, 10)).filter(Boolean).sort(); return { from: ds[0] || null, to: ds[ds.length - 1] || null }; };
        const base = { providerId: p.id, provider: p.name, category: bucket(p), categoryLabel: label(bucket(p)), discrepancy: null, hold: null, dueOn: null };
        if (pend.length) { const s = span(pend); out.push(Object.assign({ id: 'stl:pending:' + p.id, ref: 'BAL-' + String(p.id).slice(-6), amount: sum(pend), status: 'approved', periodFrom: s.from, periodTo: s.to, settledOn: null }, base)); }
        if (done.length) { const s = span(done); out.push(Object.assign({ id: 'stl:done:' + p.id, ref: 'COL-' + String(p.id).slice(-6), amount: sum(done), status: 'completed', periodFrom: s.from, periodTo: s.to, settledOn: s.to }, base)); }
      });
      return out;
    },
    /* the real service catalogue (services/local-catalog.js, CAT): categories as roots, their devices/work types as children */
    categories: () => {
      if (typeof CAT === 'undefined' || !CAT.db) return [];
      const c = CAT.db(), out = [];
      (c.categories || []).forEach((k, i) => {
        const items = (c.items || []).filter((it) => it.cat === k.id);
        out.push({ id: 'cat:' + k.id, parentId: null, name: k.name, status: k.active === false ? 'inactive' : 'active', services: items.length, order: i + 1 });
        items.forEach((it, j) => out.push({ id: 'item:' + it.id, parentId: 'cat:' + k.id, name: it.name, status: it.active === false ? 'inactive' : 'active',
          services: (c.problems || []).filter((p) => p.item === it.id).length, order: j + 1 }));
      });
      return out;
    },
    reviews: () => (db().reviews || []).map((v) => {
      const req = (db().serviceRequests || []).find((r) => r.id === v.reqId);
      return { id: v.id, customer: nameOf('customers', v.customerId) || '—', provider: nameOf('providers', v.providerId) || '—', orderNo: req ? req.no : '', rating: +v.stars || 0, text: v.comment || '', created: v.at, status: 'published', report: null, log: [] };
    })
  };

  /**
   * Finance rows per category bucket of the Finance page (its ids: electric, plumbing, carpentry, other), computed from
   * REAL transactions within the last `days` days using only stored fields: value, commission, net, collection.
   * Current collection model: the customer pays the provider and the platform collects its commission from the
   * provider, so the platform owes no payouts → settled = pendingDues = 0 until a payout process is decided.
   */
  function financeRows(days, bucketIds, labels) {
    const since = Date.now() - (+days || 30) * 86400000;
    const known = (bucketIds || []).filter((id) => id !== 'other');
    const bucketOf = (cat) => (known.includes(cat) ? cat : 'other');
    const rowsBy = {};
    (bucketIds || []).forEach((id) => { rowsBy[id] = { id, label: (labels && labels[id]) || id, gmv: 0, commission: 0, collected: 0, uncollected: 0, providerNet: 0, settled: 0, pendingDues: 0 }; });
    (db().transactions || []).filter((t) => !t.free && Date.parse(t.at) >= since).forEach((t) => {
      const r = rowsBy[bucketOf(t.cat)]; if (!r) return;
      const commission = +t.commission || 0;
      r.gmv += +t.value || 0; r.commission += commission; r.providerNet += +t.net || 0;
      if (t.collection === 'collected') r.collected += commission; else if (t.collection === 'pending') r.uncollected += commission;
    });
    return (bucketIds || []).map((id) => rowsBy[id]);
  }

  /**
   * Dashboard KPIs from real records: { id: [value, deltaPercentVsPreviousPeriod] }.
   * orders = requests created in the period; customers = new customers; providers = approved providers (new ones drive
   * the delta); revenue = commission of paid transactions; rating = average stars of reviews; complaints = open now
   * (delta = complaints filed). Delta: (current − previous) / previous × 100 over the preceding period of equal length.
   */
  function dashboardKpis(days) {
    const d = +days || 30, now = Date.now(), from = now - d * 86400000, prevFrom = from - d * 86400000;
    const inP = (iso) => { const t = Date.parse(iso); return t >= from && t <= now; };
    const inPrev = (iso) => { const t = Date.parse(iso); return t >= prevFrom && t < from; };
    const delta = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0);
    const reqs = db().serviceRequests || [], custs = db().customers || [], provs = db().providers || [], txs = (db().transactions || []).filter((t) => !t.free);
    const revs = db().reviews || [], comps = db().complaints || [];
    const sumC = (f) => Math.round(txs.filter((t) => f(t.at)).reduce((a, t) => a + (+t.commission || 0), 0));
    const avg = (f) => { const r = revs.filter((v) => f(v.at)); return r.length ? Math.round((r.reduce((a, v) => a + (+v.stars || 0), 0) / r.length) * 10) / 10 : 0; };
    return {
      orders: [reqs.filter((r) => inP(r.createdAt)).length, delta(reqs.filter((r) => inP(r.createdAt)).length, reqs.filter((r) => inPrev(r.createdAt)).length)],
      customers: [custs.filter((c) => inP(c.createdAt)).length, delta(custs.filter((c) => inP(c.createdAt)).length, custs.filter((c) => inPrev(c.createdAt)).length)],
      providers: [provs.filter((p) => p.status === 'approved').length, delta(provs.filter((p) => inP(p.createdAt)).length, provs.filter((p) => inPrev(p.createdAt)).length)],
      revenue: [sumC(inP), delta(sumC(inP), sumC(inPrev))],
      rating: [avg(inP), delta(avg(inP), avg(inPrev))],
      complaints: [comps.filter((k) => k.status !== 'resolved').length, delta(comps.filter((k) => inP(k.at)).length, comps.filter((k) => inPrev(k.at)).length)]
    };
  }

  /** Rows for a page entity, from the server read model. */
  function rows(entity, opts) { return MAP[entity] ? MAP[entity](opts) : []; }

  /** Performs a page status action through the real route (or refuses it). Resolves with an API envelope. */
  function status(entity, id, next, extra) {
    const B = root.HSBackend;
    const call = (method, path, body) => (B && typeof B.admin === 'function' ? B.admin(method, path, body) : root.HSApiClient.request(method, path, { body }));
    const enc = encodeURIComponent(id);
    if (entity === 'orders' && next === 'cancelled') return call('POST', '/requests/' + enc + '/cancel', { reason: (extra && extra.reason) || 'إلغاء من الإدارة' });
    if (entity === 'customers' && (next === 'active' || next === 'suspended')) return call('POST', '/admin/customers/' + enc + '/status', { status: next });
    if (entity === 'providers' && ['approved', 'rejected', 'suspended'].includes(next)) return call('POST', '/admin/providers/' + enc + '/status', { status: next });
    if (entity === 'settlements' && next === 'completed' && /^stl:pending:/.test(id)) {
      /* collect the provider's whole uncollected platform share: mark each pending transaction collected (existing route) */
      const pid = id.slice('stl:pending:'.length);
      const pend = (db().transactions || []).filter((t) => t.providerId === pid && !t.free && t.collection === 'pending');
      return pend.reduce((p, t) => p.then((prev) => (prev && !prev.ok ? prev : call('POST', '/admin/transactions/' + encodeURIComponent(t.id) + '/collection', { status: 'collected' }))), Promise.resolve(null))
        .then((res) => res || { ok: false, status: 409, error: { code: 'CONFLICT', message: 'لا يوجد رصيد غير محصّل لهذا المقدم.' } });
    }
    if (entity === 'complaints' && next === 'resolved') return call('POST', '/complaints/' + enc + '/resolve', { resolution: (extra && extra.resolution) || 'تم الحل من الإدارة' });
    return Promise.resolve({ ok: false, status: 501, error: { code: 'UNSUPPORTED', message: UNSUPPORTED } });
  }
  const errorText = (res) => (res && res.error && res.error.message) || 'تعذّر تنفيذ الإجراء.';

  const api = Object.freeze({ enabled, rows, status, errorText, financeRows, dashboardKpis, UNSUPPORTED, ENTITIES: Object.keys(MAP) });
  root.HSAdminLive = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
