/*
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  هنصلحلك — فحص الأمان الذاتي من المتصفح (HSSelfTest)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  إزاي تستخدمه:
 *   1. افتح الموقع: https://hansalahlak.web.app (العميل) أو /apps/provider/index.html (المزود)
 *      أو /apps/admin/index.html (الإدارة). تقدر تجرّب وانت مسجّل دخول أو كزائر.
 *   2. افتح أدوات المطوّر: F12 (أو Ctrl+Shift+I) ← تبويب Console.
 *   3. لو كروم قالك «allow pasting» اكتب: allow pasting   واضغط Enter.
 *   4. انسخ الملف ده كله والصقه في الـ Console واضغط Enter.
 *   5. شغّل:   await HSSelfTest.run()
 *      هيطلع جدول فيه كل فحص: المتوقع · اللي حصل · ناجح/فاشل، وفي الآخر درجة من 100.
 *
 *  خيارات:
 *   await HSSelfTest.run({ verbose: true })     ← يطبع تفاصيل الرد لكل فحص
 *   await HSSelfTest.run({ allowWrites: true }) ← يسمح بفحوصات بتبعت طلبات كتابة «غلط عمدًا»
 *                                                 (لازم تترفض) — برضه مفيش أي بيانات حقيقية بتتغير.
 *
 *  الأمان: السكريبت ده ما بيكتبش بيانات حقيقية. كل اللي بيبعته يا قراءة، يا طلب غلط لازم السيرفر
 *  يرفضه، يا تعديل بنفس القيم أو بحقول ممنوعة لازم تتجاهل (وبيتأكد بإعادة القراءة). مفيش توكن
 *  أو باسورد بيتطبع. مش بيضغط على السيرفر (أقصى حاجة 5 طلبات ورا بعض).
 *  (Technical note: this file lives in tools/ and is NOT served by Firebase Hosting.)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';
  const W = window;
  const rows = [];
  let verbose = false;
  const add = (probe, expected, actual, pass, detail) => {
    rows.push({ 'الفحص': probe, 'المتوقع': expected, 'اللي حصل': actual, 'النتيجة': pass === null ? 'ℹ️ معلومة' : pass ? '✅ ناجح' : '❌ فاشل' });
    if (verbose && detail !== undefined) console.log('  ↳', probe, detail);
  };
  const api = () => W.HSApiClient;
  async function req(method, path, body) {
    try { const r = await api().request(method, path, { body }); return r || { ok: false, status: 0 }; }
    catch (e) { return { ok: false, status: 0, error: { code: 'THROWN', message: String(e && e.message || e) } }; }
  }
  const denied = (r) => !r.ok && [401, 403, 404, 405, 409, 413, 422, 429, 503].includes(r.status);
  const stat = (r) => (r.ok ? 'مسموح (' + r.status + ')' : 'مرفوض (' + (r.status || '?') + (r.error && r.error.code ? ' ' + r.error.code : '') + ')');

  function context() {
    const p = location.pathname;
    const app = /\/apps\/admin\//.test(p) ? 'admin' : /\/apps\/provider\//.test(p) ? 'provider' : 'customer';
    const live = !!(W.HSFirebaseConfig && W.HSFirebaseConfig.mode === 'firebase');
    let actor = null;
    try { actor = W.HSBackend && W.HSBackend.actor ? W.HSBackend.actor : null; } catch (e) {}
    if (!live) {
      try {
        if (app === 'customer' && localStorage.getItem('hs_user')) actor = { role: 'customer' };
        if (app === 'provider' && sessionStorage.getItem('hs_provider_demo_session')) actor = { role: 'provider' };
        if (app === 'admin' && sessionStorage.getItem('hs_admin_demo_session')) actor = { role: 'admin' };
      } catch (e) {}
    }
    let adminRole = actor && actor.adminRole;
    if (!adminRole && app === 'admin') { try { adminRole = W.HSAdminRbac && W.HSAdminRbac.state && W.HSAdminRbac.state.actor; } catch (e) {} }
    return { app, live, actor, role: actor ? actor.role : 'زائر', adminRole: adminRole || null };
  }

  /* ── page / browser hygiene ── */
  async function pageChecks(ctx) {
    try {
      const r = await fetch(location.href, { method: 'GET', cache: 'no-store', credentials: 'omit' });
      const h = (k) => r.headers.get(k) || '';
      const xfo = h('x-frame-options'), csp = h('content-security-policy');
      const host = location.hostname;
      if (/web\.app|firebaseapp\.com/.test(host)) {
        add('حماية من التضمين (X-Frame-Options / CSP)', 'DENY أو frame-ancestors none', (xfo || '—') + ' | ' + (csp || '—'), /deny/i.test(xfo) || /frame-ancestors\s+'none'/.test(csp));
        add('HTTPS إجباري (HSTS)', 'Strict-Transport-Security موجود', h('strict-transport-security') ? 'موجود' : 'مش موجود', !!h('strict-transport-security'));
        add('منع تخمين نوع الملفات', 'nosniff', h('x-content-type-options') || '—', /nosniff/i.test(h('x-content-type-options')));
      } else add('هيدرز الأمان', 'تتفحص على الموقع الحقيقي', host + ' (مش استضافة فايربيز — GitHub Pages ما بيسمحش بهيدرز)', null);
    } catch (e) { add('هيدرز الأمان', 'قراءة الهيدرز', 'تعذّر: ' + e.message, null); }
    const framed = (() => { try { return W.top !== W.self; } catch (e) { return true; } })();
    add('الصفحة مش متضمنة في موقع تاني', 'مش جوه iframe', framed ? 'جوه iframe!' : 'لوحدها', !framed);
    if (ctx.app === 'admin') {
      let src = ''; try { src = document.documentElement.outerHTML.slice(0, 4000); } catch (e) {}
      add('لوحة الإدارة بترفض التضمين (frame-buster)', 'كود حماية في الصفحة', /window\.top !== window\.self/.test(src) ? 'موجود' : 'مش موجود', /window\.top !== window\.self/.test(src));
    }
    /* storage: key names only, values never printed */
    const SECRET = /(password|passwd|secret|private.?key|api.?key|bearer|refresh.?token|id.?token|access.?token)/i;
    const VAL = /(AIza[0-9A-Za-z_-]{20,}|eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.|-----BEGIN)/;
    const hits = [];
    for (const [name, st] of [['localStorage', W.localStorage], ['sessionStorage', W.sessionStorage]]) {
      try { for (let i = 0; i < st.length; i++) { const k = st.key(i), v = String(st.getItem(k) || ''); if (SECRET.test(k) || VAL.test(v)) hits.push(name + ':' + k); } } catch (e) {}
    }
    add('مفيش أسرار في تخزين المتصفح', 'مفيش توكن/باسورد/مفتاح', hits.length ? 'لقيت: ' + hits.join(', ') : 'نضيف', hits.length === 0);
    /* service worker cache must not hold authenticated API responses */
    try {
      if (W.caches) {
        const bad = [];
        for (const k of await caches.keys()) { const c = await caches.open(k); for (const rq of await c.keys()) if (/cloudfunctions\.net|googleapis\.com\/identitytoolkit|securetoken|firebasedatabase|firebaseio/.test(rq.url)) bad.push(rq.url.slice(0, 80)); }
        add('الكاش مفيهوش ردود السيرفر الخاصة', 'مفيش ردود API متخزنة', bad.length ? bad.length + ' رد متخزن' : 'نضيف', bad.length === 0, bad);
      }
    } catch (e) { add('فحص الكاش', 'قراءة الكاش', 'تعذّر', null); }
    try { const c = W.HSPlatformStatus ? W.HSPlatformStatus.controls() : null; const on = c ? Object.entries(c).filter(([, v]) => v && v.on).map(([k]) => k) : []; add('مفاتيح الطوارئ', 'معلومة', on.length ? 'شغّال: ' + on.join(', ') : 'كلها مقفولة', null); } catch (e) {}
  }

  /* ── server authorisation ── */
  const RID = () => 'r_probe_' + Math.random().toString(36).slice(2, 10);
  async function authzChecks(ctx) {
    if (!api()) { add('HSApiClient', 'موجود على الصفحة', 'مش موجود — افتح صفحة التطبيق نفسها', false); return; }
    const isAdmin = ctx.role === 'admin', isOwner = isAdmin && (ctx.adminRole === 'owner');
    /* other people's data with made-up ids */
    for (const p of ['/requests/' + RID(), '/requests/' + RID() + '/messages', '/quotes/' + RID()]) {
      const r = await req('GET', p);
      add('قراءة بيانات حد تاني: ' + p.replace(/r_probe_\w+/, '<id غريب>'), 'مرفوض / مش موجود', stat(r), !r.ok, r);
    }
    /* admin-only reads */
    for (const p of ['/admin/summary', '/admin/customers', '/admin/providers', '/admin/controls']) {
      const r = await req('GET', p);
      if (isAdmin) add('قراءة إدارية ' + p, 'مسموح للإداري (حسب صلاحيته)', stat(r), null, r);
      else add('صفحة إدارة من غير صلاحية: ' + p, 'مرفوض', stat(r), denied(r), r);
    }
    /* owner-only */
    for (const [m, p, b] of [['GET', '/admin/audit'], ['GET', '/admin/client-errors'], ['POST', '/admin/controls', { key: '__probe__', on: 'not-a-boolean' }], ['POST', '/admin/security/reset-code/__probe__', {}]]) {
      const r = await req(m, p, b);
      if (isOwner) add('المالك فقط: ' + m + ' ' + p, m === 'GET' ? 'مسموح' : 'مرفوض كطلب غلط (422/404) — مفيش تغيير', stat(r), m === 'GET' ? (ctx.live ? r.ok : null) : !r.ok, r);   /* audit / client-errors are server-only routes */
      else add('المالك فقط: ' + m + ' ' + p, 'مرفوض لغير المالك', stat(r), denied(r), r);
    }
    /* path tricks */
    for (const p of ['/requests/../admin/summary', '/admin/%2e%2e/customers', '//admin/summary']) {
      const r = await req('GET', p);
      add('خدعة في المسار: ' + p, 'مرفوض', stat(r), !r.ok || (isAdmin && p.includes('summary')), r);
    }
    /* forged price on a request that can never be created (missing required fields) */
    const forged = await req('POST', '/requests', { pricing: { customerPrice: 1, providerAmount: 1 }, finalValue: 1, discount: 99999, status: 'completed', customerId: 'c_someone_else' });
    add('تزوير السعر/الحالة في طلب جديد', 'مرفوض (ناقص بيانات) — مفيش طلب اتعمل', stat(forged), !forged.ok, forged);
    /* oversized body */
    const big = await req('POST', '/complaints', { text: 'x'.repeat(150000) });
    add('طلب حجمه كبير جدًا (150KB)', 'مرفوض', stat(big), !big.ok, big);
    /* prototype pollution */
    try {
      const evil = JSON.parse('{"__proto__":{"hsPolluted":1},"constructor":{"prototype":{"hsPolluted2":1}}}');
      await req('PATCH', ctx.role === 'provider' ? '/providers/me' : '/customers/me', evil);
      const polluted = ({}).hsPolluted || ({}).hsPolluted2;
      add('تلويث الـ prototype (__proto__)', 'مفيش تأثير', polluted ? 'اتلوث!' : 'مفيش تأثير', !polluted);
    } catch (e) { add('تلويث الـ prototype', 'مفيش تأثير', 'تعذّر الفحص', null); }
    /* mass assignment on own profile: forbidden fields only, then re-read */
    if (ctx.role === 'customer' || ctx.role === 'provider') {
      const me = ctx.role === 'customer' ? '/customers/me' : '/providers/me';
      const before = await req('GET', me);
      if (before.ok) {
        const forbid = ctx.role === 'customer' ? { status: 'active', rating: 5, ratingCount: 999, uid: 'probe', role: 'admin', phoneVerified: true } : { rating: 5, jobs: 9999, tier: 'probe', status: 'approved', warnings: 0, phone: before.data.phone };
        await req('PATCH', me, forbid);
        const after = await req('GET', me);
        const changed = after.ok ? Object.keys(forbid).filter((k) => k !== 'phone' && JSON.stringify(after.data[k]) !== JSON.stringify(before.data[k])) : [];
        add('تعديل حقول ممنوعة في ملفي (تقييم/حالة/رتبة)', 'متتجاهلش أي حاجة', changed.length ? 'اتغيّر: ' + changed.join(', ') : 'محدش اتغيّر', changed.length === 0, { before: before.data, after: after.data });
      } else add('تعديل حقول ممنوعة في ملفي', 'محتاج تسجيل دخول', 'مش مسجّل', null);
    }
    /* admin without the 8-digit code */
    if (ctx.app === 'admin' && ctx.live && !isAdmin) {
      const r = await req('GET', '/admin/controls');
      add('الإدارة من غير كود الـ 8 أرقام', 'مرفوض', stat(r), denied(r), r);
    }
    /* provider sees customer contact only after accepting */
    if (ctx.role === 'provider') {
      try {
        const db = W.MP && W.MP.db ? W.MP.db() : null;
        const mine = db ? db.assignments.filter((a) => a.status === 'offered') : [];
        const leaks = mine.map((a) => db.serviceRequests.find((r) => r.id === a.reqId)).filter((r) => r && (r.phone || r.addr));
        add('رقم وعنوان العميل قبل قبول الطلب', 'مستخبيين', leaks.length ? leaks.length + ' طلب ظاهر فيه الرقم/العنوان' : 'مستخبيين (' + mine.length + ' عرض)', ctx.live ? leaks.length === 0 : null);
      } catch (e) {}
    }
    /* small rate-limit sanity: 5 reads */
    let okReads = 0; for (let i = 0; i < 5; i++) { const r = await req('GET', ctx.role === 'customer' ? '/customers/me' : ctx.role === 'provider' ? '/providers/me' : '/admin/summary'); if (r.ok) okReads++; }
    add('5 طلبات قراءة ورا بعض', 'معلومة (الحد الحقيقي أعلى بكتير)', okReads + ' من 5 اتقبلوا', null);
  }

  async function writeChecks(ctx) {
    /* only obviously invalid payloads — every one must be refused */
    const cases = [
      ['POST', '/providers/register', { name: '' }, 'تسجيل مزود ببيانات فاضية'],
      ['POST', '/complaints', { text: '' }, 'شكوى فاضية'],
      ['POST', '/requests/' + RID() + '/tip', { amount: -50 }, 'بقشيش بالسالب على طلب مش موجود'],
      ['POST', '/requests/' + RID() + '/review', { stars: 99 }, 'تقييم 99 نجمة على طلب مش موجود'],
      ['POST', '/admin/providers/' + RID() + '/status', { status: 'approved' }, 'اعتماد مزود مش موجود'],
      ['POST', '/admin/commission', { defaultRate: -5 }, 'عمولة بالسالب']
    ];
    for (const [m, p, b, label] of cases) { const r = await req(m, p, b); add('كتابة غلط عمدًا: ' + label, 'مرفوض', stat(r), !r.ok, r); }
  }

  async function run(opts) {
    opts = opts || {}; verbose = !!opts.verbose; rows.length = 0;
    const ctx = context();
    console.log('%cهنصلحلك — فحص الأمان الذاتي', 'font-size:16px;font-weight:bold');
    console.log('التطبيق:', ctx.app, '| السيرفر الحقيقي:', ctx.live ? 'أيوه' : 'لأ (وضع تجريبي محلي)', '| الدور:', ctx.role + (ctx.adminRole ? ' (' + ctx.adminRole + ')' : ''));
    try { await pageChecks(ctx); } catch (e) { add('فحوصات الصفحة', 'تكمل', 'وقفت: ' + e.message, null); }
    try { await authzChecks(ctx); } catch (e) { add('فحوصات الصلاحيات', 'تكمل', 'وقفت: ' + e.message, null); }
    if (opts.allowWrites) { try { await writeChecks(ctx); } catch (e) { add('فحوصات الكتابة الغلط', 'تكمل', 'وقفت: ' + e.message, null); } }
    else add('فحوصات الكتابة الغلط', 'اختيارية', 'متشغّلتش — استخدم { allowWrites: true }', null);
    console.table(rows);
    const scored = rows.filter((r) => r['النتيجة'] !== 'ℹ️ معلومة'), pass = scored.filter((r) => r['النتيجة'] === '✅ ناجح').length;
    const score = scored.length ? Math.round(pass / scored.length * 100) : 0;
    console.log('%cالدرجة: ' + score + '/100  (' + pass + ' ناجح من ' + scored.length + ')', 'font-size:15px;font-weight:bold;color:' + (score === 100 ? 'green' : score >= 80 ? 'orange' : 'red'));
    const fails = scored.filter((r) => r['النتيجة'] === '❌ فاشل');
    if (fails.length) console.warn('الفحوصات الفاشلة:', fails.map((f) => f['الفحص']));
    return { score, pass, total: scored.length, rows: rows.slice(), context: { app: ctx.app, live: ctx.live, role: ctx.role, adminRole: ctx.adminRole } };
  }

  W.HSSelfTest = Object.freeze({ run, version: '2026-11-20' });
  console.log('HSSelfTest جاهز — شغّل:  await HSSelfTest.run()   أو   await HSSelfTest.run({ allowWrites: true, verbose: true })');
})();
