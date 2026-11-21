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

  /* rank check for risky actions (apps/admin/permission-guard.js riskDenied; same on the server) */
  const risk = (actor, key) => { const G = (typeof globalThis !== 'undefined' && globalThis.HSAdminPermissionGuard) || null; const m = G && G.riskDenied && key ? G.riskDenied(actor, key) : ''; return m ? client.fail('FORBIDDEN', m) : null; };
  client.define('GET', '/admin/summary', { roles: A, summary: 'Operations counts.' }, ({ store }) => summary(store.db()));

  client.define('GET', '/admin/providers', { roles: A, summary: 'All providers (?status=).' }, ({ query, actor, store }) =>
    guard(actor, 'providers', 'view') || store.db().providers.filter(p => !query.status || p.status === query.status));

  client.define('POST', '/admin/providers/:id/warn', { roles: A, summary: 'Warn a provider (e.g. off-platform deals) {reason}; the second warning suspends.' }, ({ params, body, actor, store }) => {
    { const rk = risk(actor, 'providers.warn'); if (rk) return rk; }
    const denied = guard(actor, 'providers', 'decide'); if (denied) return denied;
    const p = store.get('providers', params.id); if (!p) return fail('NOT_FOUND', 'مقدم الخدمة غير موجود');
    store.warnProvider(p.id, String((body && body.reason) || 'الاتفاق مع العملاء بره المنصة'));
    return store.get('providers', p.id);
  });
  client.define('POST', '/admin/providers/:id/status', { roles: A, summary: 'Approve / reject / suspend a provider.' }, ({ params, body, actor, store }) => {
    { const rk = risk(actor, ({approved:'providers.approve',rejected:'providers.reject',suspended:'providers.suspend'})[body && body.status]); if (rk) return rk; }
    const denied = guard(actor, 'providers', 'decide'); if (denied) return denied;
    const p = store.get('providers', params.id); if (!p) return fail('NOT_FOUND', 'مقدم الخدمة غير موجود');
    if (!PROVIDER_STATUS.includes(body.status)) return fail('VALIDATION', 'حالة غير صالحة', { status: PROVIDER_STATUS.join('|') });
    if (body.status === 'rejected' && p.status !== 'pending') return fail('CONFLICT', 'الرفض متاح لطلبات التسجيل المعلقة فقط');
    store.updateProvider(p.id, { status: body.status });
    return store.get('providers', p.id);
  });

  client.define('POST', '/admin/providers/:id/rate', { roles: A, summary: 'Set or clear a special commission rate.' }, ({ params, body, actor, store }) => {
    { const rk = risk(actor, 'providers.rate'); if (rk) return rk; }
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
    { const rk = risk(actor, 'requests.assign'); if (rk) return rk; }
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
    { const rk = risk(actor, (body && body.status === 'suspended' ? 'customers.suspend' : '')); if (rk) return rk; }
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
    if (body.warranty !== undefined) {           /* warranty days: default + per category + per service item (0 = no warranty) */
      const w = body.warranty || {}, days = v => { const n = Math.round(+v); return Number.isFinite(n) && n >= 0 && n <= 365 ? n : null; };
      const map = o => { const out = {}; for (const [k, v] of Object.entries(o && typeof o === 'object' ? o : {})) { if (v === '' || v == null) continue; const d = days(v); if (d == null || !/^[a-z0-9/-]{2,60}$/.test(k)) errors.warranty = 'أيام الضمان من 0 لـ 365'; else out[k] = d; } return out; };
      const def = days(w.default == null ? 0 : w.default); if (def == null) errors.warranty = 'أيام الضمان من 0 لـ 365';
      out.warranty = { default: def || 0, cats: map(w.cats), items: map(w.items) };
    }
    if (body.bidding !== undefined) { if (typeof body.bidding !== 'boolean') errors.bidding = 'قيمة غير صالحة'; else out.bidding = body.bidding; }
    if (body.inspection !== undefined) {           /* «needs a visit first» marks: {cats, items, problems} → true / false */
      const v = body.inspection || {}, bools = o => { const m = {}; for (const [k, x] of Object.entries(o && typeof o === 'object' ? o : {})) { if (typeof x !== 'boolean') continue; if (!/^[a-z0-9/-]{2,80}$/.test(k)) errors.inspection = 'مفتاح غير صالح'; else m[k] = x; } return m; };
      out.inspection = { cats: bools(v.cats), items: bools(v.items), problems: bools(v.problems) };
    }
    if (body.bonus !== undefined) {            /* provider bonus: tiers + weekly cash target — every number from the admin */
      const v = body.bonus || {}, int = (x, lo, hi) => { const n = Math.round(+x); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
      const tiers = (Array.isArray(v.tiers) ? v.tiers : []).slice(0, 4).map((t, i) => ({ id: String(t.id || 't' + (i + 1)).replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 't' + (i + 1), name: String(t.name || '').trim().slice(0, 20),
        minJobs: int(t.minJobs, 0, 1000), minRating: t.minRating === '' || t.minRating == null ? 0 : Math.round(+t.minRating * 10) / 10, maxStrikes: int(t.maxStrikes == null || t.maxStrikes === '' ? 99 : t.maxStrikes, 0, 99), rateOff: t.rateOff === '' || t.rateOff == null ? 0 : +t.rateOff }));
      if (tiers.some(t => !t.name || t.minJobs == null || !(t.minRating >= 0 && t.minRating <= 5) || t.maxStrikes == null || !(t.rateOff >= 0 && t.rateOff <= 50))) errors.bonus = 'راجع المستويات: اسم، عدد خدمات، تقييم من 0 لـ 5، تخفيض من 0 لـ 50٪';
      const w = v.weekly || {}, wd = int(v.windowDays == null ? 30 : v.windowDays, 7, 90);
      if (wd == null) errors.bonus = 'مدة الحساب من 7 لـ 90 يوم';
      const weekly = { on: !!w.on, target: int(w.target || 0, 0, 100), amount: int(w.amount || 0, 0, 100000) };
      if (weekly.target == null || weekly.amount == null || (weekly.on && !(weekly.target > 0 && weekly.amount > 0))) errors.bonus = 'البونص الأسبوعي محتاج عدد خدمات ومبلغ';
      out.bonus = { on: !!v.on, windowDays: wd || 30, tiers, weekly };
    }
    for (const key of ['cancelFee', 'visitFee']) { if (body[key] === undefined) continue; const n = Math.round(+body[key]); if (!(n >= 0 && n <= 5000)) errors[key] = 'من 0 لـ 5000 ج.م'; else out[key] = n; }
    if (body.inspectionRate !== undefined) { const n = +body.inspectionRate; if (!(n >= 0 && n <= 50)) errors.inspectionRate = 'من 0 لـ 50٪'; else out.inspectionRate = n; }
    if (body.autoPickMin !== undefined) { const n = Math.round(+body.autoPickMin); if (!(n >= 0 && n <= 240)) errors.autoPickMin = 'من 0 (مقفول) لـ 240 دقيقة'; else out.autoPickMin = n; }
    if (body.bidWindowMin !== undefined) { const n = Math.round(+body.bidWindowMin); if (!(n >= 5 && n <= 120)) errors.bidWindowMin = 'من 5 لـ 120 دقيقة'; else out.bidWindowMin = n; }
    for (const key of ['inspectionCap', 'priceCaps']) {           /* EGP caps: default + per category (+ per item / problem for prices) */
      if (body[key] === undefined) continue;
      const v = body[key] || {}, money = x => { const n = Math.round(+x); return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null; };
      const map = o => { const m = {}; for (const [k, x] of Object.entries(o && typeof o === 'object' ? o : {})) { if (x === '' || x == null) continue; const n = money(x); if (n == null || !/^[a-z0-9/-]{2,80}$/.test(k)) errors[key] = 'أرقام صحيحة بالجنيه'; else m[k] = n; } return m; };
      out[key] = key === 'inspectionCap' ? { default: money(v.default) || 0, cats: map(v.cats) } : { cats: map(v.cats), items: map(v.items), problems: map(v.problems) };
    }
    if (body.arrivalPin !== undefined) { if (typeof body.arrivalPin !== 'boolean') errors.arrivalPin = 'قيمة غير صالحة'; else out.arrivalPin = body.arrivalPin; }
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
  const marketingView = s => ({ promos: Array.isArray(s.promos) ? s.promos : [], referral: s.referral || { on: false, reward: 0 }, packages: Array.isArray(s.packages) ? s.packages : [], warranty: s.warranty || { default: 30, cats: {}, items: {} }, arrivalPin: !!s.arrivalPin,
    bidding: !!s.bidding, bidWindowMin: +s.bidWindowMin || 15, autoPickMin: +s.autoPickMin || 0, inspectionCap: s.inspectionCap || { default: 0, cats: {} }, cancelFee: s.cancelFee != null ? +s.cancelFee : 50, visitFee: +s.visitFee || 0, inspectionRate: +s.inspectionRate || 0, priceCaps: s.priceCaps || { cats: {}, items: {}, problems: {} }, inspection: s.inspection || { cats: {}, items: {}, problems: {} },
    bonus: s.bonus || { on: false, windowDays: 30, tiers: [], weekly: { on: false, target: 0, amount: 0 } } });
  client.define('POST', '/admin/reviews/:id/visibility', { roles: A, summary: 'Hide or re-publish a review {hidden, reason}.' }, ({ params, body, actor, store }) => {
    { const rk = risk(actor, (body && body.hidden ? 'reviews.hide' : '')); if (rk) return rk; }
    const denied = guard(actor, 'reviews', 'decide'); if (denied) return denied;
    if (typeof body.hidden !== 'boolean') return fail('VALIDATION', 'حدد إخفاء أو نشر', { hidden: 'boolean' });
    if (body.hidden && String(body.reason || '').trim().length < 3) return fail('VALIDATION', 'اكتب سبب الإخفاء', { reason: 'مطلوب' });
    return store.setReviewHidden(params.id, body.hidden, body.reason) ? store.get('reviews', params.id) : fail('NOT_FOUND', 'التقييم غير موجود');
  });
  /* ── Owner emergency switches (settings.controls) — enforced for customers / providers in api-client.js ── */
  const isOwner = (actor) => (actor.adminRole ? actor.adminRole === 'owner'
    : ((((root.HSAdminRbac || {}).state || {}).roster || []).some((x) => x.id === actor.id && x.role === 'owner')));
  const CONTROL_KEYS = ['maintenance', 'pauseOrders', 'pauseSignups'];
  const controlsView = (st) => { const c = (st && st.controls) || {}; return CONTROL_KEYS.reduce((o, k) => { const v = c[k] || {}; o[k] = { on: !!v.on, message: String(v.message || ''), at: v.at || null, by: v.by || null }; return o; }, {}); };
  client.define('GET', '/admin/controls', { roles: A, summary: 'Emergency switches (maintenance, pause new requests, pause provider sign-ups).' }, ({ store }) => controlsView(store.db().settings));
  client.define('POST', '/admin/controls', { roles: A, summary: 'Owner only: turn a switch on/off {key, on, message?}.' }, ({ body, actor, store }) => {
    if (!isOwner(actor)) return fail('FORBIDDEN', 'مفاتيح الطوارئ للمالك فقط');
    const key = String((body && body.key) || '');
    if (!CONTROL_KEYS.includes(key)) return fail('VALIDATION', 'مفتاح غير معروف', { key: CONTROL_KEYS.join('|') });
    if (typeof body.on !== 'boolean') return fail('VALIDATION', 'on لازم تكون true أو false', { on: 'boolean' });
    const message = String(body.message || '').trim().slice(0, 200);
    const db = store.db(); db.settings = db.settings || {};
    const c = { ...(db.settings.controls || {}) };
    c[key] = { on: body.on, message, at: new Date().toISOString(), by: actor.id };
    db.settings.controls = c;
    if (typeof store.save === 'function') store.save();
    return controlsView(db.settings);
  });

  /* ── Support contacts (settings.support — public: shown in the customer «المساعدة» page and the provider app) ──
     Only the fields set here are shown; nothing is invented. Edit: owner or manager («مدير»). */
  const roleOf = (actor) => actor.adminRole || ((((root.HSAdminRbac || {}).state || {}).roster || []).find((x) => x.id === actor.id) || {}).role || '';
  const digits = (v) => String(v == null ? '' : v).replace(/[\s\-()]/g, '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  function cleanSupport(b) {
    const out = {}, errors = {};
    const phone = digits(b.phone), wa = digits(b.whatsapp).replace(/^\+?20(?=1)/, '0'), email = String(b.email || '').trim().toLowerCase(), hours = String(b.hours || '').replace(/[<>]/g, '').trim();
    if (phone && !/^(01[0125]\d{8}|0[2-9]\d{7,8}|1\d{4})$/.test(phone)) errors.phone = 'رقم موبايل مصري (01xxxxxxxxx) أو أرضي أو خط ساخن من 5 أرقام';
    if (wa && !/^01[0125]\d{8}$/.test(wa)) errors.whatsapp = 'رقم موبايل مصري (01xxxxxxxxx)';
    if (email && (email.length > 120 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email))) errors.email = 'بريد إلكتروني غير صحيح';
    if (hours.length > 80) errors.hours = '80 حرف بحد أقصى';
    out.phone = phone; out.whatsapp = wa; out.email = email; out.hours = hours;
    return { out, errors };
  }
  const supportView = (st) => { const s = (st && st.support) || {}; return { phone: s.phone || '', whatsapp: s.whatsapp || '', email: s.email || '', hours: s.hours || '' }; };
  client.define('GET', '/admin/support-contacts', { roles: A, summary: 'Support phone / WhatsApp / email / hours shown to customers and providers.' }, ({ store }) => supportView(store.db().settings));
  client.define('PATCH', '/admin/support-contacts', { roles: A, summary: 'Owner or manager: set support contacts {phone?, whatsapp?, email?, hours?} (empty clears).' }, ({ body, actor, store }) => {
    if (!['owner', 'admin'].includes(roleOf(actor))) return fail('FORBIDDEN', 'أرقام الدعم يعدّلها المالك أو المدير');
    const { out, errors } = cleanSupport(body || {});
    if (Object.keys(errors).length) return fail('VALIDATION', 'راجع بيانات التواصل', errors);
    const db = store.db(); db.settings = db.settings || {};
    db.settings.support = out;
    if (typeof store.save === 'function') store.save();
    return supportView(db.settings);
  });

  /* ── Admin data policy (settings.adminDataPolicy, read by functions/src/scope.js adminView) — owner only ──
     'minimal': support / moderator get customers' phones masked, no addresses, no transactions (finance keeps transactions). */
  client.define('GET', '/admin/data-policy', { roles: A, summary: 'Admin data minimisation policy {minimal}.' }, ({ store }) => ({ minimal: ((store.db().settings || {}).adminDataPolicy) === 'minimal' }));
  client.define('POST', '/admin/data-policy', { roles: A, summary: 'Owner only: {minimal: boolean} — mask customer data for support / moderator ranks.' }, ({ body, actor, store }) => {
    if (!isOwner(actor)) return fail('FORBIDDEN', 'سياسة البيانات للمالك فقط');
    if (!body || typeof body.minimal !== 'boolean') return fail('VALIDATION', 'minimal لازم تكون true أو false', { minimal: 'boolean' });
    const db = store.db(); db.settings = db.settings || {};
    if (body.minimal) db.settings.adminDataPolicy = 'minimal'; else delete db.settings.adminDataPolicy;
    if (typeof store.save === 'function') store.save();
    return { minimal: body.minimal };
  });

  client.define('GET', '/admin/marketing', { roles: A, summary: 'Promo codes, invite reward and packages.' }, ({ actor, store }) =>
    guard(actor, 'services', 'view') || marketingView(store.db().settings || {}));
  client.define('PATCH', '/admin/marketing', { roles: A, summary: 'Replace promo codes / invite reward / packages {promos?, referral?, packages?}.' }, ({ body, actor, store }) => {
    { const rk = risk(actor, 'marketing.edit'); if (rk) return rk; }
    { const rk = risk(actor, body && (body.priceCaps !== undefined || body.inspectionCap !== undefined) ? 'finance.pricing' : ''); if (rk) return rk; }   /* price caps are price edits (owner) */
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
    controls: () => client.get('/admin/controls'),
    setControl: (key, on, message) => client.post('/admin/controls', { key, on, message }),
    supportContacts: () => client.get('/admin/support-contacts'),
    saveSupportContacts: (c) => client.patch('/admin/support-contacts', c),
    dataPolicy: () => client.get('/admin/data-policy'),
    setDataPolicy: (minimal) => client.post('/admin/data-policy', { minimal }),
    marketing: () => client.get('/admin/marketing'),
    setReviewHidden: (rid, hidden, reason) => client.post('/admin/reviews/' + id(rid) + '/visibility', { hidden, reason }),
    saveMarketing: patch => client.patch('/admin/marketing', patch),
    providers: status => client.get('/admin/providers' + (status ? '?status=' + id(status) : '')),
    warnProvider: (pid, reason) => client.post('/admin/providers/' + id(pid) + '/warn', { reason }),
    setProviderStatus: (pid, status) => client.post('/admin/providers/' + id(pid) + '/status', { status }),
    setSpecialRate: (pid, specialRate) => client.post('/admin/providers/' + id(pid) + '/rate', { specialRate }),
    candidates: reqId => client.get('/admin/requests/' + id(reqId) + '/candidates'),
    assign: (reqId, providerId) => client.post('/admin/requests/' + id(reqId) + '/assign', providerId ? { providerId } : {}),
    setCustomerStatus: (cid, status) => client.post('/admin/customers/' + id(cid) + '/status', { status }),
    _summary: summary, _permitted: permitted, _cleanMarketing: cleanMarketing
  };
});
