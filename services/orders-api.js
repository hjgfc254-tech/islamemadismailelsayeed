/**
 * MODULE: orders-api
 * RESPONSIBILITY: Service-request (order) contract over services/api-client.js. Mock handlers delegate to the local
 *   demo store (MP) and add the boundaries a backend must enforce: role, ownership and state-transition errors.
 *   Access rule (shared by the other adapters via `canAccess`): a customer sees only their own requests; a provider
 *   only requests offered/assigned to them; admin sees all.
 * ROUTES:
 *   POST /requests                     customer   create a request (status received → searching)
 *   GET  /requests                     customer|provider|admin   list visible requests (?status=)
 *   GET  /requests/:id                 customer|provider|admin   one visible request (+ current quote)
 *   POST /requests/:id/cancel          customer|admin   cancel before work starts
 *   POST /requests/:id/provider        customer   pick a provider for an own unassigned request {providerId}
 *   POST /requests/:id/respond         provider   accept/decline an offered assignment {accept, reason}
 *   POST /requests/:id/schedule        provider|customer   propose {at} (provider) / confirm the time
 *   POST /requests/:id/advance         provider   next FLOW step {to}
 *   POST /requests/:id/complete        provider   complete with {value, deductions} (> 0, or the approved quote)
 *   POST /requests/:id/close           customer   confirm completion
 *   POST /requests/:id/review          customer   {stars 1–5, comment}
 *   POST /requests/:id/messages        customer|provider   chat on an accepted job {text}
 *   POST /requests/:id/rate-customer   provider   rate the customer once after the job {stars, comment}
 *   POST /requests (body.promo, body.packageId)   promo / invite code / credit and maintenance packages
 * STATUS: IMPLEMENTED (MOCK ADAPTER — local store only, no network)
 */
'use strict';
(function (root, factory) {
  const client = root.HSApiClient || (typeof require === 'function' ? require('./api-client.js') : null);
  const api = factory(client);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSOrdersApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (client) {
  const { ok, fail } = client;

  /** Can this actor see/act on this request? */
  function canAccess(actor, r, store) {
    if (!actor || !r) return false;
    if (actor.role === 'admin') return true;
    if (actor.role === 'customer') return r.customerId === actor.id;
    if (actor.role === 'provider') {   /* offered (incl. one of several offers) or accepted for THIS provider */
      return (store.db().assignments || []).some(a => a.reqId === r.id && a.providerId === actor.id && ['offered', 'accepted'].includes(a.status));
    }
    return false;
  }
  /** Loads a request the actor may access, or returns a NOT_FOUND envelope (never leaks existence). */
  function load(store, actor, id) {
    const r = store.get('serviceRequests', id);
    return r && canAccess(actor, r, store) ? r : null;
  }
  const notFound = () => fail('NOT_FOUND', 'الطلب غير موجود');
  const view = (store, r, actor) => {
    const out = { ...r, currentQuote: store.currentQuote(r.id) || null, statusLabel: (store.STATUS_LABEL && store.STATUS_LABEL[r.status]) || r.status };
    if (actor && actor.role === 'provider') { out.chat = typeof store.chatFor === 'function' ? store.chatFor(r.id, actor.id) : []; delete out.pin; }   // the provider gets the arrival code from the customer
    if (actor && actor.role === 'customer') delete out.customerReview;     // the provider's rating of the customer stays private
    if (actor && actor.role !== 'provider' && r.bidding && typeof store.offersFor === 'function') {   // offers: customer-facing totals only
      out.offers = store.offersFor(r.id).map(a => { const p = store.get('providers', a.providerId) || {}; return { providerId: a.providerId, name: p.name || '', rating: p.rating || null, jobs: p.jobs || 0, status: a.status, offer: a.offer }; });
    }
    return out;
  };
  /* Discount on a new request: an admin promo code, a friend's invite code (first request only), or the customer's
     own credit. Only the terms are stored on the request; the amount is computed once at completion (see the store). */
  function resolvePromo(store, c, codeIn) {
    const st = store.db().settings || {};
    const code = String(codeIn || '').trim().toUpperCase();
    if (!code) return +c.credit > 0 ? { promo: { code: 'رصيد', kind: 'credit', value: +c.credit } } : { promo: null };
    if (!/^[A-Z0-9]{3,16}$/.test(code)) return { error: 'كود الخصم غير صالح' };
    const prior = store.reqs().some(x => x.customerId === c.id);
    const used = Array.isArray(c.promosUsed) ? c.promosUsed : [];
    const pm = (Array.isArray(st.promos) ? st.promos : []).find(x => x && x.code === code && x.active !== false);
    if (pm) {
      const today = new Date().toISOString().slice(0, 10);
      if ((pm.until && pm.until < today) || (+pm.uses > 0 && (+pm.used || 0) >= +pm.uses)) return { error: 'كود الخصم انتهى' };
      if (pm.firstOnly && prior) return { error: 'الكود ده لأول طلب بس' };
      if (used.includes(code)) return { error: 'استخدمت الكود ده قبل كده' };
      return { promo: { code, kind: pm.kind === 'percent' ? 'percent' : 'amount', value: +pm.value || 0, maxOff: +pm.maxOff || 0 }, commit() { pm.used = (+pm.used || 0) + 1; c.promosUsed = used.concat(code).slice(-50); } };
    }
    const ref = st.referral && st.referral.on && +st.referral.reward > 0 ? (store.db().customers || []).find(x => x.refCode === code) : null;
    if (ref) {
      if (ref.id === c.id) return { error: 'ده كود الدعوة بتاعك — ابعته لصاحبك' };
      if (prior || c.referredBy) return { error: 'كود الدعوة لأول طلب بس' };
      const reward = +st.referral.reward;
      return { promo: { code, kind: 'amount', value: reward, ref: ref.id, refReward: reward }, commit() { c.referredBy = ref.id; } };
    }
    return { error: 'كود الخصم غير صالح' };
  }


  const REQUIRED = ['cat', 'serviceName', 'gov', 'addr'];   // desc is optional (diagnosis-by-visit requests), as in the store
  function validateCreate(b) {
    const errors = {};
    for (const k of REQUIRED) if (!String(b[k] || '').trim()) errors[k] = 'مطلوب';
    if (String(b.desc || '').length > 2000) errors.desc = 'الوصف أطول من 2000 حرف';
    /* the governorates the owner serves (published catalogue, CAT.govs) — also enforced here, not only in the app */
    if (!errors.gov && typeof CAT !== 'undefined' && CAT.govs) { const served = CAT.govs(); if (served.length && !served.includes(String(b.gov).trim())) errors.gov = 'لسه مش متاحين في المحافظة دي'; }
    if (b.geo != null) {   /* optional map pin: two finite numbers in range, nothing else is stored */
      const g = b.geo, lat = g && Number(g.lat), lng = g && Number(g.lng);
      if (typeof g !== 'object' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) errors.geo = 'موقع غير صالح';
    }
    return errors;
  }

  client.define('POST', '/requests', { roles: ['customer'], summary: 'Create a service request for the signed-in customer.' }, ({ body, actor, store }) => {
    const errors = validateCreate(body);
    if (Object.keys(errors).length) return fail('VALIDATION', 'راجع الحقول المطلوبة', errors);
    const c = store.get('customers', actor.id);
    if (!c) return fail('UNAUTHENTICATED');
    /* security (M1): an unverified quick / email account may keep 3 open requests, a verified one 10 — no flooding the
       providers with fake jobs. Local demo customers (no phoneVerified field) are not limited. */
    if (c.phoneVerified !== undefined) {
      const OPEN = ['received', 'searching', 'sent', 'accepted', 'scheduled', 'enroute', 'arrived', 'started', 'quote'];
      const open = (store.db().serviceRequests || []).filter(r => r.customerId === c.id && OPEN.includes(r.status)).length;
      const cap = c.phoneVerified === true ? 10 : 3;
      if (open >= cap) return fail('CONFLICT', c.phoneVerified === true ? 'عندك طلبات مفتوحة كتير — خلّص أو الغي واحد الأول' : 'عندك ' + open + ' طلبات مفتوحة — أكّد رقمك بكود SMS عشان تقدر تفتح طلبات أكتر');
    }
    const disc = resolvePromo(store, c, body.promo);
    if (disc.error) return fail('VALIDATION', disc.error, { promo: disc.error });
    const pkgs = Array.isArray((store.db().settings || {}).packages) ? store.db().settings.packages : [];
    const pkg = body.packageId ? pkgs.find(x => x && x.id === String(body.packageId) && x.active !== false) : null;
    if (body.packageId && !pkg) return fail('VALIDATION', 'الباقة غير متاحة', { packageId: 'unknown' });
    if (disc.commit) disc.commit();
    const r = store.createRequest({ ...body, name: c.name, phone: c.phone, promo: disc.promo, packageId: pkg ? pkg.id : '', packageName: pkg ? pkg.name : '' });
    return ok(view(store, r, actor), 201);
  });

  client.define('GET', '/requests', { roles: ['customer', 'provider', 'admin'], summary: 'List requests visible to the actor (?status=).' }, ({ query, actor, store }) => {
    const items = store.reqs().filter(r => canAccess(actor, r, store) && (!query.status || r.status === query.status));
    return { items: items.map(r => view(store, r, actor)), total: items.length };
  });

  client.define('GET', '/requests/:id', { roles: ['customer', 'provider', 'admin'], summary: 'One request (with current quote).' }, ({ params, actor, store }) => {
    const r = load(store, actor, params.id);
    return r ? view(store, r, actor) : notFound();
  });

  client.define('POST', '/requests/:id/cancel', { roles: ['customer', 'admin'], summary: 'Cancel before work starts.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const reason = String(body.reason || (actor.role === 'admin' ? 'إلغاء من الإدارة' : 'إلغاء من العميل'));
    return store.cancel(r.id, reason, actor.role === 'admin') ? view(store, r, actor) : fail('CONFLICT', 'لا يمكن إلغاء الطلب في حالته الحالية');
  });

  client.define('POST', '/requests/:id/provider', { roles: ['customer'], summary: 'Customer picks a provider for an own unassigned request {providerId}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    if (!['received', 'searching'].includes(r.status)) return fail('CONFLICT', 'الطلب أُسند بالفعل أو لم يعد بانتظار الإسناد');
    const p = store.get('providers', String(body.providerId || ''));
    if (!p || p.status !== 'approved' || p.available === false) return fail('VALIDATION', 'مقدم الخدمة غير متاح', { providerId: 'approved & available' });
    if (!(p.cats || []).includes(r.cat)) return fail('VALIDATION', 'مقدم الخدمة لا يقدّم هذا التخصص', { providerId: 'category' });
    const res = store.assign(r.id, p.id);
    return res && res.ok ? { ...view(store, r, actor), providerName: p.name } : fail('CONFLICT', (res && res.msg) || 'تعذّر الإسناد');
  });

  client.define('POST', '/requests/:id/respond', { roles: ['provider'], summary: 'Accept or decline an offered assignment.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    if (!body.accept && !String(body.reason || '').trim()) return fail('VALIDATION', 'اذكر سبب الاعتذار', { reason: 'مطلوب' });
    if (r.bidding && !store.providerOf(r.id)) {   /* offers round: answer with an offer, or decline your own invitation */
      if (body.accept) return fail('CONFLICT', 'ابعت عرضك الأول — العميل هو اللي بيختار');
      return store.declineBid(r.id, actor.id, body.reason || '') ? view(store, r, actor) : fail('CONFLICT', 'لا يوجد عرض بانتظار ردّك على هذا الطلب');
    }
    return store.respond(r.id, !!body.accept, body.reason || '') ? view(store, r, actor) : fail('CONFLICT', 'لا يوجد عرض بانتظار ردّك على هذا الطلب');
  });

  client.define('POST', '/requests/:id/schedule', { roles: ['provider', 'customer'], summary: 'Provider proposes {at}; either side confirms.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const done = body.at && actor.role === 'provider' ? store.propose(r.id, String(body.at)) : store.confirmTime(r.id, actor.role);
    return done ? view(store, r, actor) : fail('CONFLICT', 'حالة الطلب لا تسمح بتحديد الموعد');
  });

  /* live tracking (enroute / arrived): the assigned provider posts the latest point; at most one update per 10 s */
  client.define('POST', '/requests/:id/location', { roles: ['provider'], summary: 'Live tracking: latest position {lat, lng, acc?} while enroute / arrived (assigned provider only).' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const p = store.providerOf(r.id); if (!p || p.id !== actor.id) return fail('FORBIDDEN', 'الطلب مش مسند ليك');
    if (!['enroute', 'arrived'].includes(r.status)) return fail('CONFLICT', 'مشاركة الموقع متاحة وانت في الطريق بس');
    if (r.liveGeo && Date.now() - Date.parse(r.liveGeo.at) < 10000) return { ok: true, throttled: true };
    if (!store.setLiveGeo(r.id, actor.id, body && body.lat, body && body.lng, body && body.acc)) return fail('VALIDATION', 'موقع غير صالح', { lat: 'number', lng: 'number' });
    return { ok: true, liveGeo: r.liveGeo };
  });
  client.define('POST', '/requests/:id/advance', { roles: ['provider'], summary: 'Move to the next FLOW status {to}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    if (!store.providerOf(r.id)) return fail('FORBIDDEN', 'اقبل الطلب أولًا');
    /* arrival code: «وصلت» needs the 4 digits the customer sees in the app (5 wrong tries → the admin is told) */
    const pinOn = !!((store.db().settings || {}).arrivalPin);            // switched on by the admin (العروض والضمان)
    if (pinOn && body.to === 'arrived' && r.pin && r.status === 'enroute' && String(body.pin || '').trim() !== r.pin) {
      r.pinTries = (+r.pinTries || 0) + 1;
      if (r.pinTries === 5 && typeof store.notifyAdmin === 'function') store.notifyAdmin('محاولات كود وصول غلط على الطلب ' + r.no, r.id);
      store.save();
      return fail('VALIDATION', 'كود الوصول غلط — اطلبه من العميل', { pin: 'wrong' });
    }
    if (!store.advance(r.id, String(body.to || ''))) return fail('CONFLICT', 'انتقال غير مسموح من الحالة الحالية');
    if (body.to === 'enroute' && body.eta != null && typeof store.setEta === 'function') store.setEta(r.id, body.eta);   // optional arrival estimate (minutes)
    return view(store, r, actor);
  });

  client.define('POST', '/requests/:id/complete', { roles: ['provider'], summary: 'Complete a paid job: {value>0, deductions} or the approved quote.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    if (store.payBlocked && store.payBlocked(r)) return fail('CONFLICT', 'العميل اختار الدفع أونلاين ولسه ما دفعش — استنى الدفع قبل ما تسجّل الإكمال');
    if (body.value !== undefined && body.value !== '' && !(+body.value > 0)) return fail('VALIDATION', 'القيمة النهائية يجب أن تكون أكبر من صفر — للخدمة بلا مقابل استخدم مسار الخدمة المجانية', { value: 'أكبر من صفر' });
    return store.complete(r.id, body.value, body.deductions) ? view(store, r, actor) : fail('CONFLICT', 'لا يمكن إكمال الطلب الآن (حالة غير مناسبة، أو خدمة مجانية قيد التنفيذ، أو لا يوجد عرض سعر معتمد)');
  });

  /* ── round 12: payments — cash after the job, or online up front (held until the customer confirms) ── */
  client.define('POST', '/requests/:id/pay', { roles: ['customer'], summary: 'Choose how to pay the agreed price {method: cash | online}; online returns the amount due (checkout runs on the server).' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const res = store.choosePay(r.id, String((body && body.method) || ''));
    return res.ok ? { ...view(store, r, actor), due: res.due, gateway: res.gateway || null } : fail('CONFLICT', res.msg);
  });
  client.define('POST', '/requests/:id/pay/demo', { roles: ['customer'], summary: 'Local demo only: simulate the gateway confirming the online payment.' }, ({ params, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    if (store.payConfig().gateway !== 'demo') return fail('FORBIDDEN', 'الدفع التجريبي مش متاح هنا');
    if (!r.payment || r.payment.method !== 'online' || !(store.payDue(r) > 0)) return fail('CONFLICT', 'مفيش مبلغ مطلوب دفعه');
    const res = store.markPaid(r.id, { amount: store.payDue(r), ref: 'demo_' + Date.now().toString(36), gateway: 'demo' });
    return res.ok ? view(store, r, actor) : fail('CONFLICT', res.msg);
  });
  client.define('POST', '/requests/:id/close', { roles: ['customer'], summary: 'Customer confirms completion.' }, ({ params, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    return store.close(r.id) ? view(store, r, actor) : fail('CONFLICT', 'الطلب لم يكتمل بعد');
  });

  client.define('POST', '/requests/:id/attachments', { roles: ['customer'], summary: 'Link uploaded attachment ids to an own open request {ids[]}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    if (store.FINAL_STATUSES && store.FINAL_STATUSES.has(r.status)) return fail('CONFLICT', 'الطلب مغلق');
    if (!Array.isArray(body.ids) || body.ids.length > 10 || body.ids.some(v => typeof v !== 'string' || v.length > 80)) return fail('VALIDATION', 'مرفقات غير صالحة', { ids: 'حتى 10 معرّفات' });
    r.attachments = body.ids.slice();
    store.save();
    return view(store, r, actor);
  });
  client.define('POST', '/requests/:id/repeat', { roles: ['customer'], summary: 'Create a new request from an own previous one.' }, ({ params, body, actor, store }) => {
    const old = load(store, actor, params.id); if (!old) return notFound();
    /* «اطلب نفس الفني»: only the provider who did the previous job can be requested directly */
    const prev = body && body.providerId ? store.providerOf(old.id) : null;
    if (body && body.providerId && (!prev || prev.id !== String(body.providerId))) return fail('VALIDATION', 'الفني ده مش هو اللي نفّذ الطلب', { providerId: 'previous provider only' });
    const r = store.repeatRequest(old.id, prev ? prev.id : '');
    return r ? ok(view(store, r, actor), 201) : fail('CONFLICT', 'تعذّر إعادة الطلب');
  });
  client.define('POST', '/requests/:id/review', { roles: ['customer'], summary: 'Rate the provider once {stars 1–5, comment}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const stars = +body.stars;
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return fail('VALIDATION', 'اختر تقييمًا من 1 إلى 5', { stars: '1–5' });
    if (!['completed', 'closed'].includes(r.status)) return fail('CONFLICT', 'التقييم متاح بعد إتمام الخدمة');
    const extra = { quality: body.quality == null ? undefined : String(body.quality).slice(0, 20), attachments: Array.isArray(body.attachments) ? body.attachments.map(String).slice(0, 6) : [] };
    return store.review(r.id, { stars, comment: String(body.comment || '').slice(0, 1000), ...extra }) ? ok(view(store, r, actor), 201) : fail('CONFLICT', 'تم تقييم هذا الطلب من قبل');
  });

  /* ── round 9: offers ── */
  client.define('POST', '/requests/:id/bid', { roles: ['provider'], summary: 'Send or update an offer {kind: quote or inspection, labor + parts or fee, note, eta}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const res = store.bid(r.id, actor.id, body || {});
    return res.ok ? ok({ offer: res.offer }, 201) : fail(/أعلى من الحد|اكتب/.test(res.msg) ? 'VALIDATION' : 'CONFLICT', res.msg);
  });
  client.define('POST', '/requests/:id/choose', { roles: ['customer'], summary: 'Choose one of the offers {providerId}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const res = store.chooseBid(r.id, String((body && body.providerId) || ''));
    return res.ok ? view(store, r, actor) : fail('CONFLICT', res.msg);
  });
  client.define('POST', '/requests/:id/inspection-only', { roles: ['provider'], summary: 'Close an inspection the customer did not continue: the visit fee is the job.' }, ({ params, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const p = store.providerOf(r.id); if (!p || p.id !== actor.id) return fail('FORBIDDEN');
    return store.inspectionOnly(r.id) ? view(store, r, actor) : fail('CONFLICT', 'المعاينة بس بتتسجل لما يكون الطلب معاينة ومفيش عرض إصلاح متوافق عليه');
  });
  /* ── round 10 ── */
  client.define('POST', '/requests/:id/widen', { roles: ['customer'], summary: 'No offers after the window: invite providers from other areas (once).' }, ({ params, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    return store.widenBidding(r.id) ? view(store, r, actor) : fail('CONFLICT', 'البحث اتوسّع بالفعل أو لسه فيه وقت للعروض');
  });
  client.define('POST', '/requests/:id/cash', { roles: ['customer', 'provider'], summary: 'Cash after completion: did the money change hands {paid}. A mismatch opens a complaint.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    if (typeof (body && body.paid) !== 'boolean') return fail('VALIDATION', 'قيمة غير صالحة');
    if (actor.role === 'provider') { const p = store.providerOf(r.id); if (!p || p.id !== actor.id) return fail('FORBIDDEN'); }
    return store.cashConfirm(r.id, actor.role, body.paid) ? view(store, r, actor) : fail('CONFLICT', 'التأكيد متاح بعد ما الخدمة تخلص');
  });

  /* ── round 8: warranty claim, tip, read receipts, before/after photos ── */
  client.define('POST', '/requests/:id/warranty', { roles: ['customer'], summary: '«المشكلة رجعت» within the warranty: a linked request to the same provider {desc}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const res = store.warrantyClaim(r.id, body.desc);
    return res.ok ? ok(view(store, res.request, actor), 201) : fail('CONFLICT', res.msg);
  });
  client.define('POST', '/requests/:id/tip', { roles: ['customer'], summary: 'Tip for the provider, paid in cash with the bill {amount 5–1000}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const a = Math.round(+body.amount);
    if (!(a >= 5 && a <= 1000)) return fail('VALIDATION', 'البقشيش من 5 لـ 1000 ج.م', { amount: '5–1000' });
    return store.tip(r.id, a) ? ok(view(store, r, actor), 201) : fail('CONFLICT', 'البقشيش بيتسجّل مرة واحدة بعد ما الخدمة تخلص');
  });
  client.define('POST', '/requests/:id/chat-seen', { roles: ['customer', 'provider'], summary: 'Read receipt: the caller saw the conversation.' }, ({ params, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const p = store.providerOf(r.id); if (actor.role === 'provider' && (!p || p.id !== actor.id)) return fail('FORBIDDEN');
    return store.chatSeen(r.id, actor.role) ? view(store, r, actor) : fail('CONFLICT');
  });
  client.define('GET', '/requests/:id/photos', { roles: ['customer', 'provider', 'admin'], summary: 'Before / after photos of the job.' }, ({ params, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const x = store.jobPhotosOf(r.id);
    return { before: (x && x.before) || '', after: (x && x.after) || '', share: !!(x && x.share) };
  });
  client.define('POST', '/requests/:id/photos', { roles: ['provider'], summary: 'Provider uploads the before / after photo {kind, data (compressed data URL)}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const p = store.providerOf(r.id); if (!p || p.id !== actor.id) return fail('FORBIDDEN', 'اقبل الطلب أولًا');
    if (!['arrived', 'started', 'quote', 'completed'].includes(r.status)) return fail('CONFLICT', 'الصور بتترفع وانت في مكان الشغل');
    return store.setJobPhoto(r.id, String(body.kind || ''), String(body.data || '')) ? ok({ kind: body.kind }, 201) : fail('VALIDATION', 'الصورة غير صالحة أو أكبر من المسموح', { data: 'webp/jpeg ≤ 130 KB' });
  });
  client.define('POST', '/requests/:id/photos/share', { roles: ['customer'], summary: 'Customer allows (or not) the photos in the provider portfolio {share}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    return store.shareJobPhotos(r.id, body.share === true) ? { share: body.share === true } : fail('NOT_FOUND', 'مفيش صور للطلب ده');
  });
  /* ── round 5: chat, customer rating ── */
  client.define('POST', '/requests/:id/messages', { roles: ['customer', 'provider'], summary: 'Message the other side of an accepted job {text ≤ 500}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const p = store.providerOf(r.id);
    if (!p || (actor.role === 'provider' && p.id !== actor.id)) return fail('CONFLICT', 'المحادثة بتفتح بعد ما الفني يقبل الطلب');
    if (!String(body.text || '').trim()) return fail('VALIDATION', 'اكتب رسالتك', { text: 'مطلوب' });
    if (String(body.text).length > 500) return fail('VALIDATION', 'الرسالة أطول من 500 حرف', { text: '≤ 500' });
    return store.message(r.id, actor.role, body.text) ? ok(view(store, r, actor), 201) : fail('CONFLICT', 'المحادثة مقفولة على الطلب ده');
  });
  client.define('POST', '/requests/:id/rate-customer', { roles: ['provider'], summary: 'Provider rates the customer once after the job {stars 1–5, comment}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const p = store.providerOf(r.id); if (!p || p.id !== actor.id) return fail('FORBIDDEN');
    const stars = +body.stars;
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return fail('VALIDATION', 'اختر تقييمًا من 1 إلى 5', { stars: '1–5' });
    return store.rateCustomer(r.id, { stars, comment: body.comment }) ? ok(view(store, r, actor), 201) : fail('CONFLICT', 'التقييم متاح مرة واحدة بعد إتمام الخدمة');
  });

  const id = v => encodeURIComponent(v);
  return {
    canAccess,
    create: body => client.post('/requests', body),
    list: (status) => client.get('/requests' + (status ? '?status=' + id(status) : '')),
    get: reqId => client.get('/requests/' + id(reqId)),
    cancel: (reqId, reason) => client.post('/requests/' + id(reqId) + '/cancel', { reason }),
    chooseProvider: (reqId, providerId) => client.post('/requests/' + id(reqId) + '/provider', { providerId }),
    respond: (reqId, accept, reason) => client.post('/requests/' + id(reqId) + '/respond', { accept, reason }),
    schedule: (reqId, at) => client.post('/requests/' + id(reqId) + '/schedule', at ? { at } : {}),
    shareLocation: (reqId, lat, lng, acc) => client.post('/requests/' + id(reqId) + '/location', { lat, lng, acc }),
    advance: (reqId, to, eta, pin) => client.post('/requests/' + id(reqId) + '/advance', Object.assign({ to }, eta ? { eta } : {}, pin ? { pin } : {})),
    widen: reqId => client.post('/requests/' + id(reqId) + '/widen', {}),
    cash: (reqId, paid) => client.post('/requests/' + id(reqId) + '/cash', { paid }),
    bid: (reqId, b) => client.post('/requests/' + id(reqId) + '/bid', b),
    choose: (reqId, providerId) => client.post('/requests/' + id(reqId) + '/choose', { providerId }),
    inspectionOnly: reqId => client.post('/requests/' + id(reqId) + '/inspection-only', {}),
    warranty: (reqId, desc) => client.post('/requests/' + id(reqId) + '/warranty', { desc }),
    tip: (reqId, amount) => client.post('/requests/' + id(reqId) + '/tip', { amount }),
    chatSeen: reqId => client.post('/requests/' + id(reqId) + '/chat-seen', {}),
    photos: reqId => client.get('/requests/' + id(reqId) + '/photos'),
    uploadPhoto: (reqId, kind, data) => client.post('/requests/' + id(reqId) + '/photos', { kind, data }),
    sharePhotos: (reqId, share) => client.post('/requests/' + id(reqId) + '/photos/share', { share }),
    message: (reqId, text) => client.post('/requests/' + id(reqId) + '/messages', { text }),
    rateCustomer: (reqId, stars, comment) => client.post('/requests/' + id(reqId) + '/rate-customer', { stars, comment }),
    complete: (reqId, value, deductions) => client.post('/requests/' + id(reqId) + '/complete', { value, deductions }),
    close: reqId => client.post('/requests/' + id(reqId) + '/close'),
    review: (reqId, stars, comment, extra) => client.post('/requests/' + id(reqId) + '/review', { stars, comment, ...(extra || {}) }),
    attachments: (reqId, ids) => client.post('/requests/' + id(reqId) + '/attachments', { ids }),
    repeat: (reqId, providerId) => client.post('/requests/' + id(reqId) + '/repeat', providerId ? { providerId } : {})
  };
});
