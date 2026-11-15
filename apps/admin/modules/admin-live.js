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
    reviews: () => (db().reviews || []).map((v) => {
      const req = (db().serviceRequests || []).find((r) => r.id === v.reqId);
      return { id: v.id, customer: nameOf('customers', v.customerId) || '—', provider: nameOf('providers', v.providerId) || '—', orderNo: req ? req.no : '', rating: +v.stars || 0, text: v.comment || '', created: v.at, status: 'published', report: null, log: [] };
    })
  };

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
    if (entity === 'complaints' && next === 'resolved') return call('POST', '/complaints/' + enc + '/resolve', { resolution: (extra && extra.resolution) || 'تم الحل من الإدارة' });
    return Promise.resolve({ ok: false, status: 501, error: { code: 'UNSUPPORTED', message: UNSUPPORTED } });
  }
  const errorText = (res) => (res && res.error && res.error.message) || 'تعذّر تنفيذ الإجراء.';

  const api = Object.freeze({ enabled, rows, status, errorText, UNSUPPORTED, ENTITIES: Object.keys(MAP) });
  root.HSAdminLive = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
