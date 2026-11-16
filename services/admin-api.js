/**
 * MODULE: admin-api
 * RESPONSIBILITY: Admin marketplace-operations contract over services/api-client.js (mock handlers on MP). Admin-only
 *   by role; when the Admin RBAC (apps/admin/permission-guard.js) is loaded, each action is also checked against the
 *   signed-in demo employee's permissions — the same rules apps/admin/pages/marketplace.page.js applies in the UI.
 * ROUTES (admin):
 *   GET  /admin/summary                        counts for the operations dashboard
 *   GET  /admin/providers?status=              all providers (full record)
 *   POST /admin/providers/:id/status           {status: approved|rejected|suspended}      providers.decide
 *   POST /admin/providers/:id/rate             {specialRate: number|null (0–100)}          providers.edit
 *   POST /admin/requests/:id/assign            {providerId?}  (omit = auto-match)         orders.decide
 *   GET  /admin/requests/:id/candidates        matching providers                         orders.view
 *   POST /admin/customers/:id/status           {status: active|suspended}                 customers.decide
 * STATUS: IMPLEMENTED (MOCK ADAPTER — local store only; demo RBAC, NOT server authorization; no network)
 */
'use strict';
(function (root, factory) {
  const client = root.HSApiClient || (typeof require === 'function' ? require('./api-client.js') : null);
  const api = factory(root, client);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSAdminApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, client) {
  const { fail } = client;
  const A = ['admin'];
  const PROVIDER_STATUS = ['approved', 'rejected', 'suspended'];
  const CUSTOMER_STATUS = ['active', 'suspended'];

  /** Demo RBAC check; open when the Admin guard is not loaded (e.g. unit tests of the contract itself). */
  function permitted(actor, module, action) {
    const G = root.HSAdminPermissionGuard;
    if (!G || !actor.adminRole) return true;
    return G.can(((((root.HSAdminRbac || {}).state || {}).roster || []).find((x) => x.id === actor.id) || { id: actor.id, role: actor.adminRole, status: 'active' }), module, action);
  }
  const guard = (actor, module, action) => (permitted(actor, module, action) ? null : fail('FORBIDDEN'));

  function summary(db) {
    return {
      pending: db.providers.filter(p => p.status === 'pending').length,
      providers: db.providers.length,
      requests: db.serviceRequests.length,
      unassigned: db.serviceRequests.filter(r => ['received', 'searching'].includes(r.status)).length,
      openComplaints: db.complaints.filter(k => k.status === 'open').length,
      uncollected: db.transactions.filter(t => t.collection === 'pending').length
    };
  }

  client.define('GET', '/admin/summary', { roles: A, summary: 'Operations counts.' }, ({ store }) => summary(store.db()));

  client.define('GET', '/admin/providers', { roles: A, summary: 'All providers (?status=).' }, ({ query, actor, store }) =>
    guard(actor, 'providers', 'view') || store.db().providers.filter(p => !query.status || p.status === query.status));

  client.define('POST', '/admin/providers/:id/status', { roles: A, summary: 'Approve / reject / suspend a provider.' }, ({ params, body, actor, store }) => {
    const denied = guard(actor, 'providers', 'decide'); if (denied) return denied;
    const p = store.get('providers', params.id); if (!p) return fail('NOT_FOUND', 'مقدم الخدمة غير موجود');
    if (!PROVIDER_STATUS.includes(body.status)) return fail('VALIDATION', 'حالة غير صالحة', { status: PROVIDER_STATUS.join('|') });
    if (body.status === 'rejected' && p.status !== 'pending') return fail('CONFLICT', 'الرفض متاح لطلبات التسجيل المعلقة فقط');
    store.updateProvider(p.id, { status: body.status });
    return store.get('providers', p.id);
  });

  client.define('POST', '/admin/providers/:id/rate', { roles: A, summary: 'Set or clear a special commission rate.' }, ({ params, body, actor, store }) => {
    const denied = guard(actor, 'providers', 'edit'); if (denied) return denied;
    const p = store.get('providers', params.id); if (!p) return fail('NOT_FOUND', 'مقدم الخدمة غير موجود');
    const v = body.specialRate;
    if (v !== null && v !== '' && !(Number.isFinite(+v) && +v >= 0 && +v <= 100)) return fail('VALIDATION', 'النسبة من 0 إلى 100', { specialRate: '0–100' });
    store.updateProvider(p.id, { specialRate: v === null || v === '' ? null : +v });
    return store.get('providers', p.id);
  });

  client.define('GET', '/admin/requests/:id/candidates', { roles: A, summary: 'Providers matching a request.' }, ({ params, actor, store }) => {
    const denied = guard(actor, 'orders', 'view'); if (denied) return denied;
    const r = store.get('serviceRequests', params.id); if (!r) return fail('NOT_FOUND', 'الطلب غير موجود');
    return store.candidates(r).map(p => ({ id: p.id, name: p.name, rating: store.rating(p.id) }));
  });

  client.define('POST', '/admin/requests/:id/assign', { roles: A, summary: 'Assign manually {providerId} or auto-match.' }, ({ params, body, actor, store }) => {
    const denied = guard(actor, 'orders', 'decide'); if (denied) return denied;
    const r = store.get('serviceRequests', params.id); if (!r) return fail('NOT_FOUND', 'الطلب غير موجود');
    if (body.providerId) {
      const p = store.get('providers', body.providerId);
      if (!p || p.status !== 'approved') return fail('VALIDATION', 'مقدم الخدمة غير معتمد', { providerId: 'approved' });
    }
    const res = store.assign(r.id, body.providerId || undefined);
    return res && res.ok ? { reqId: r.id, providerId: res.provider.id, status: store.get('serviceRequests', r.id).status } : fail('CONFLICT', (res && res.msg) || 'تعذر الإسناد');
  });

  client.define('POST', '/admin/customers/:id/status', { roles: A, summary: 'Suspend / reactivate a customer.' }, ({ params, body, actor, store }) => {
    const denied = guard(actor, 'customers', 'decide'); if (denied) return denied;
    const c = store.get('customers', params.id); if (!c) return fail('NOT_FOUND', 'العميل غير موجود');
    if (!CUSTOMER_STATUS.includes(body.status)) return fail('VALIDATION', 'حالة غير صالحة', { status: CUSTOMER_STATUS.join('|') });
    c.status = body.status;
    store.save();
    return { id: c.id, status: c.status };
  });

  /* ── Marketing: promo codes, invite-a-friend reward and maintenance packages (stored in settings). Discounts are paid
     from the platform fee and never exceed it (see the store), so provider earnings are unaffected. ── */
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const num = (v, lo, hi) => { const n = +v; return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
  function cleanMarketing(body, cur) {
    const errors = {}, out = {};
    if (body.promos !== undefined) {
      if (!Array.isArray(body.promos) || body.promos.length > 50) errors.promos = 'حتى 50 كود';
      else {
        const seen = new Set(), prev = new Map((Array.isArray(cur.promos) ? cur.promos : []).map(p => [p.code, p]));
        out.promos = body.promos.map(p => {
          const code = String((p && p.code) || '').trim().toUpperCase();
          if (!/^[A-Z0-9]{3,16}$/.test(code) || code.startsWith('HS')) errors.promos = 'الكود من 3 لـ 16 حرف/رقم إنجليزي ولا يبدأ بـ HS';
          if (seen.has(code)) errors.promos = 'كود مكرر: ' + code; seen.add(code);
          const kind = p && p.kind === 'percent' ? 'percent' : 'amount';
          const value = num(p && p.value, 1, kind === 'percent' ? 100 : 10000);
          if (value == null) errors.promos = kind === 'percent' ? 'النسبة من 1 لـ 100' : 'المبلغ من 1 لـ 10000';
          const until = String((p && p.until) || '');
          if (until && !DAY_RE.test(until)) errors.promos = 'تاريخ الانتهاء غير صالح';
          return { code, kind, value: value || 0, maxOff: num(p && p.maxOff, 0, 10000) || 0, uses: Math.floor(num(p && p.uses, 0, 100000) || 0),
            used: (prev.get(code) && +prev.get(code).used) || 0, firstOnly: !!(p && p.firstOnly), until, active: !(p && p.active === false) };
        });
      }
    }
    if (body.referral !== undefined) {
      const b = body.referral || {}, reward = num(b.reward, 0, 1000);
      if (reward == null) errors.referral = 'المكافأة من 0 لـ 1000';
      out.referral = { on: b.on === true, reward: reward || 0 };
    }
    if (body.packages !== undefined) {
      if (!Array.isArray(body.packages) || body.packages.length > 12) errors.packages = 'حتى 12 باقة';
      else {
        const seen = new Set();
        out.packages = body.packages.map((p, i) => {
          const id = /^[a-z0-9-]{2,24}$/.test(String(p && p.id)) ? String(p.id) : 'pk' + (i + 1);
          if (seen.has(id)) errors.packages = 'معرّف باقة مكرر'; seen.add(id);
          const name = String((p && p.name) || '').trim().slice(0, 60);
          if (!name) errors.packages = 'كل باقة محتاجة اسم';
          const price = num(p && p.price, 0, 100000), visits = num(p && p.visits, 1, 24);
          if (price == null || visits == null) errors.packages = 'السعر وعدد الزيارات أرقام صحيحة';
          return { id, name, cat: String((p && p.cat) || '').slice(0, 40), visits: Math.floor(visits || 1), price: price || 0, desc: String((p && p.desc) || '').trim().slice(0, 200), active: !(p && p.active === false) };
        });
      }
    }
    return { out, errors };
  }
  const marketingView = s => ({ promos: Array.isArray(s.promos) ? s.promos : [], referral: s.referral || { on: false, reward: 0 }, packages: Array.isArray(s.packages) ? s.packages : [] });
  client.define('GET', '/admin/marketing', { roles: A, summary: 'Promo codes, invite reward and packages.' }, ({ actor, store }) =>
    guard(actor, 'services', 'view') || marketingView(store.db().settings || {}));
  client.define('PATCH', '/admin/marketing', { roles: A, summary: 'Replace promo codes / invite reward / packages {promos?, referral?, packages?}.' }, ({ body, actor, store }) => {
    const denied = guard(actor, 'services', 'edit'); if (denied) return denied;
    const st = store.db().settings || {};
    const { out, errors } = cleanMarketing(body || {}, st);
    if (Object.keys(errors).length) return fail('VALIDATION', 'راجع البيانات', errors);
    for (const [k, v] of Object.entries(out)) store.setSetting(k, v);
    return marketingView(store.db().settings);
  });

  const id = v => encodeURIComponent(v);
  return {
    summary: () => client.get('/admin/summary'),
    marketing: () => client.get('/admin/marketing'),
    saveMarketing: patch => client.patch('/admin/marketing', patch),
    providers: status => client.get('/admin/providers' + (status ? '?status=' + id(status) : '')),
    setProviderStatus: (pid, status) => client.post('/admin/providers/' + id(pid) + '/status', { status }),
    setSpecialRate: (pid, specialRate) => client.post('/admin/providers/' + id(pid) + '/rate', { specialRate }),
    candidates: reqId => client.get('/admin/requests/' + id(reqId) + '/candidates'),
    assign: (reqId, providerId) => client.post('/admin/requests/' + id(reqId) + '/assign', providerId ? { providerId } : {}),
    setCustomerStatus: (cid, status) => client.post('/admin/customers/' + id(cid) + '/status', { status }),
    _summary: summary, _permitted: permitted, _cleanMarketing: cleanMarketing
  };
});
