/**
 * MODULE: firebase-backend (ES module) — connects the running app to the Firebase backend when
 * HSFirebaseConfig.mode === 'firebase'. In 'local' mode it does nothing (the offline demo stays untouched).
 *
 * What it does in firebase mode:
 *  - Transport: HSApiClient.setTransport → callable `api` {app, method, path, query, body}. The server resolves the
 *    actor from the verified Firebase Auth token; nothing the client sends is trusted as identity.
 *  - Read model: callable `session.sync` returns the actor-scoped database, written into the existing local store
 *    (localStorage `hs_mp_db`, device-local drafts/searchHistory preserved) so every screen keeps rendering from MP.
 *  - Realtime: Realtime Database `signals/{uid}` → re-sync, then HSRealtimeClient publishes `market:changed`.
 *  - Auth: customers choose a quick device account (anonymous), email/password or SMS code; providers use SMS;
 *    admins use verified email/password — all through Firebase Auth with small RTL dialogs.
 * Firebase Storage is not used (deferred).
 */
const CFG = globalThis.HSFirebaseConfig;
const SDK = new URL(`../assets/vendor/firebase/${(CFG && CFG.sdkVersion) || '13.1.0'}/`, import.meta.url).href;
const DB_KEY = 'hs_mp_db';
const DEVICE_LOCAL = ['drafts', 'searchHistory'];
const CODE_FOR = { unauthenticated: 'UNAUTHENTICATED', 'permission-denied': 'FORBIDDEN', 'not-found': 'NOT_FOUND', 'invalid-argument': 'BAD_REQUEST', 'failed-precondition': 'CONFLICT', 'resource-exhausted': 'CONFLICT', unavailable: 'UNAVAILABLE', internal: 'INTERNAL' };

const appName = () => { try { return globalThis.HSAuthApi ? globalThis.HSAuthApi.currentApp() : 'customer'; } catch { return 'customer'; } };

async function start() {
  const [{ initializeApp }, A, F, D] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-functions.js', 'firebase-database.js'].map(m => import(SDK + m)));
  const app = initializeApp(CFG.web);
  const auth = A.getAuth(app);
  auth.languageCode = 'ar';
  const fns = F.getFunctions(app, CFG.region);
  const rtdb = D.getDatabase(app);
  if (CFG.emulators) {
    const e = CFG.emulators;
    A.connectAuthEmulator(auth, `http://${e.host}:${e.auth}`, { disableWarnings: true });
    F.connectFunctionsEmulator(fns, e.host, e.functions);
    D.connectDatabaseEmulator(rtdb, e.host, e.database);
    auth.settings.appVerificationDisabledForTesting = true;   // emulator only: no real reCAPTCHA
  }
  const callApi = F.httpsCallable(fns, 'api');
  const callSession = F.httpsCallable(fns, 'session');
  const C = globalThis.HSApiClient;
  const APP = appName();
  let actor = null, last = null, syncing = null, offSignal = null, lastServerTime = 0, syncTimer = null;
  /* One sync per burst: a write and its own RTDB signal (and rapid consecutive writes) coalesce into a single read. */
  const scheduleSync = () => { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync().catch(() => {}), 250); };

  const envelopeFromError = e => {
    const code = CODE_FOR[String(e && e.code || '').replace(/^functions\//, '')] || 'UNAVAILABLE';
    return C.fail(code, e && e.message);
  };

  function applySnapshot(db) {
    if (!db) return;
    let cur = null;
    try { cur = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); } catch { cur = null; }
    for (const k of DEVICE_LOCAL) db[k] = (cur && Array.isArray(cur[k])) ? cur[k] : [];
    db._source = 'firebase';                                      // marks the cache as server data (see local-market-store load)
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch {}
    try { if (typeof MP !== 'undefined') MP.reload(); } catch {}
  }
  function reflectSession(a, db) {
    try {
      if (APP === 'customer') {
        const c = a && a.role === 'customer' && (db.customers || []).find(x => x.id === a.id);
        if (c) localStorage.setItem('hs_user', JSON.stringify({ name: c.name, phone: c.phone }));
      } else if (APP === 'provider') {
        if (a && a.role === 'provider') sessionStorage.setItem('hs_provider_demo_session', a.id);
        else sessionStorage.removeItem('hs_provider_demo_session');
      } else if (APP === 'admin' && a && a.role === 'admin' && a.employeeId) {
        sessionStorage.setItem('hs_admin_demo_session', a.employeeId);
      }
    } catch {}
  }

  /* Admin Center: the server's employees, roles and overrides replace the local demo workforce/RBAC state. */
  function applyAdmin(a) {
    if (APP !== 'admin' || !a) return;
    const R = globalThis.HSAdminRbac;
    if (R && R.state) {
      R.state.roster = (a.employees || []).map(e => ({ ...e }));
      if (a.rbac && Array.isArray(a.rbac.roles)) R.state.roles = a.rbac.roles;
      if (a.rbac && a.rbac.overrides) R.state.overrides = a.rbac.overrides;
      if (a.employeeId) R.state.selectedEmployee = R.state.selectedEmployee || a.employeeId;
    }
    if (globalThis.HSAdminWorkforcePage && typeof globalThis.HSAdminWorkforcePage.setStaff === 'function') globalThis.HSAdminWorkforcePage.setStaff(a.employees || []);
  }

  /* Admin access code (third factor after email + password; functions/src/admin-code.js): set it the first time,
     enter it on every new sign-in. Wrong codes show the server message (remaining tries / 15-minute lock). */
  let codeFlow = null;
  function adminCodeFlow(gate) {
    if (codeFlow) return codeFlow;
    codeFlow = (async () => {
      try {
        for (let tries = 0; tries < 6; tries++) {
          const first = !gate.hasCode;
          const num = 'inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="one-time-code" required';
          const v = await dialog(first ? 'اعمل كود دخول من ٨ أرقام' : 'كود الدخول',
            first ? [{ name: 'code', label: 'كود جديد (٨ أرقام، مش متتالي ولا متكرر)', type: 'password', attrs: num }, { name: 'again', label: 'اكتبه تاني للتأكيد', type: 'password', attrs: num }]
                  : [{ name: 'code', label: 'اكتب كود الدخول الخاص بيك (٨ أرقام)', type: 'password', attrs: num }],
            first ? 'حفظ الكود والدخول' : 'دخول');
          if (!v) return false;
          if (first && v.code !== v.again) { alert('الكودين مش زي بعض — اكتبهم تاني.'); continue; }
          try { await callSession({ op: 'adminCode', action: first ? 'set' : 'unlock', code: v.code }); location.reload(); return true; }
          catch (e) { alert((e && e.message) || 'تعذّر التحقق من الكود'); if (/مقفول/.test(String(e && e.message))) return false; }
        }
        return false;
      } finally { codeFlow = null; }
    })();
    return codeFlow;
  }

  async function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
      try {
        const r = (await callSession({ op: 'sync', app: APP })).data;
        if (APP === 'admin' && r.adminGate && r.adminGate.needsCode) setTimeout(() => adminCodeFlow(r.adminGate), 0);   /* 8-digit access code */
        actor = r.actor; last = r; if (r.serverTime) lastServerTime = Math.max(lastServerTime, r.serverTime);
        applySnapshot(r.db);
        applyAdmin(r.admin);
        reflectSession(actor, r.db || {});
        if (globalThis.HSRealtimeClient) globalThis.HSRealtimeClient.notify({ source: 'firebase' });
        document.dispatchEvent(new CustomEvent('hs:backend-sync', { detail: { actor, provider: r.provider } }));
        refreshContent(r.db && r.db.settings && r.db.settings.contentV);
        return r;
      } finally { syncing = null; }
    })();
    return syncing;
  }

  /* Site content (hero / slides / icons from the Admin Center): fetched only when the announced version is newer than
     this device's copy (or a published image is not cached here); only the missing images travel. */
  let contentBusy = null;
  function refreshContent(v) {
    const S = globalThis.HSSiteContent;
    if (!S || !(Number(v) > 0) || contentBusy) return;
    if (Number(v) <= S.version() && !S.missing().length) return;
    contentBusy = callSession({ op: 'content', have: S.cachedIds() })
      .then(r => S.apply(r.data)).catch(e => console.warn('[backend] content refresh failed', e && e.message))
      .finally(() => { contentBusy = null; });
  }
  /* live: the public, read-only RTDB value public/content changes when the admin publishes (guests included) */
  try { D.onValue(D.ref(rtdb, 'public/content'), snap => { const val = snap.val(); if (val && val.v) refreshContent(val.v); }); } catch (e) {}

  C.setActorResolver(() => actor);
  /* Mutations: identical in-flight requests are merged (double clicks), and each carries an idempotency key so a
     network retry replays the first result on the server instead of repeating the write. */
  const inflight = new Map();
  const newKey = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  C.setTransport(async ({ method, path, query, body }) => {
    const isWrite = method !== 'GET';
    const sig = isWrite ? method + ' ' + path + ' ' + JSON.stringify(body || {}) : null;
    if (sig && inflight.has(sig)) return inflight.get(sig);
    const run = (async () => {
      const payload = { app: APP, method, path, query, body };
      if (isWrite) payload.idempotencyKey = newKey();
      try {
        let env;
        try { env = (await callApi(payload)).data; }
        catch (e) { if (isWrite && /unavailable|deadline-exceeded/.test(String(e && e.code))) env = (await callApi(payload)).data; else throw e; }
        if (isWrite) scheduleSync();
        return env;
      } catch (e) { return envelopeFromError(e); }
      finally { if (sig) inflight.delete(sig); }
    })();
    if (sig) inflight.set(sig, run);
    return run;
  });

  A.onAuthStateChanged(auth, user => {
    if (offSignal) { offSignal(); offSignal = null; }
    /* a signal older than the last sync's server time is already reflected — skip it (no duplicate reads) */
    if (user) { let initial = true; offSignal = D.onValue(D.ref(rtdb, `signals/${user.uid}`), snap => { const v = snap.val(); if (initial) { initial = false; return; } if (!v || !v.at || v.at > lastServerTime) scheduleSync(); }); }   // the initial value is covered by the sign-in sync below
    sync().catch(e => console.warn('[backend] sync failed', e && e.message));
  });

  /* ── sign-in dialog (RTL, design-system tokens) ── */
  function dialog(title, fields, submitLabel) {
    return new Promise(resolve => {
      const d = document.createElement('dialog');
      d.setAttribute('dir', 'rtl');
      d.style.cssText = 'border:0;border-radius:20px;padding:22px;max-width:min(92vw,380px);width:100%;font-family:var(--font-body,inherit);color:var(--text-primary,#1F1B17);box-shadow:0 22px 50px rgba(31,27,23,.18)';
      d.innerHTML = `<form method="dialog" style="display:grid;gap:12px"><h2 style="margin:0;font-size:19px">${title}</h2>${fields.map(f => `<label style="display:grid;gap:6px;font-weight:600">${f.label}<input name="${f.name}" type="${f.type || 'text'}" ${f.attrs || ''} required style="min-height:46px;border:1.5px solid var(--border-default,#D2D8E3);border-radius:12px;padding:0 12px;font:inherit"></label>`).join('')}<p data-err role="alert" style="margin:0;color:var(--danger,#B4413C);min-height:1em"></p><div style="display:flex;gap:8px"><button value="ok" style="flex:1;min-height:46px;border:0;border-radius:12px;background:var(--brand-primary,#1F1B17);color:#fff;font:inherit;font-weight:700">${submitLabel}</button><button value="cancel" formnovalidate style="min-height:46px;padding:0 16px;border:1.5px solid var(--border-default,#D2D8E3);border-radius:12px;background:#fff;font:inherit">إلغاء</button></div></form>`;
      document.body.appendChild(d);
      d.addEventListener('close', () => { const v = d.returnValue === 'ok' ? Object.fromEntries(new FormData(d.querySelector('form'))) : null; d.remove(); resolve(v); }, { once: true });
      d.showModal();
    });
  }
  const toE164 = p => '+20' + String(p).trim().replace(/^0/, '');
  let verifier = null;
  async function phoneSignIn(phone) {
    if (!verifier) {
      const host = document.createElement('div'); host.id = 'hs-recaptcha'; document.body.appendChild(host);
      verifier = new A.RecaptchaVerifier(auth, host, { size: 'invisible' });
    }
    const confirmation = await A.signInWithPhoneNumber(auth, toE164(phone), verifier);
    const v = await dialog('أدخل رمز التحقق', [{ name: 'code', label: `الرمز المرسل إلى ${phone}`, attrs: 'inputmode="numeric" autocomplete="one-time-code" maxlength="6"' }], 'تحقق');
    if (!v) throw new Error('cancelled');
    return confirmation.confirm(String(v.code).trim());
  }
  const normalized = u => (u && u.phoneNumber ? '0' + u.phoneNumber.replace(/^\+20/, '') : '');

  /* ── customer sign-in without forcing SMS (owner decision, 2026-11-15) ──
     quick  : Firebase anonymous account on this device + name/phone (no code, no password)
     email  : email + password (create or sign in; verification mail sent but not required)
     phone  : SMS one-time code (unchanged)                                                      */
  const BTN = 'display:grid;gap:2px;width:100%;min-height:56px;padding:10px 14px;border:1.5px solid var(--border-default,#D6CBB9);border-radius:14px;background:var(--surface-primary,#fff);font:inherit;text-align:start;cursor:pointer';
  function choiceDialog(title, intro, choices, err) {
    return new Promise(resolve => {
      const d = document.createElement('dialog'); d.setAttribute('dir', 'rtl');
      d.style.cssText = 'border:0;border-radius:20px;padding:22px;max-width:min(92vw,400px);width:100%;font-family:var(--font-body,inherit);color:var(--text-primary,#1F1B17);box-shadow:0 22px 50px rgba(31,27,23,.18)';
      d.innerHTML = `<form method="dialog" style="display:grid;gap:10px"><h2 style="margin:0;font-size:19px">${title}</h2>${intro ? `<p style="margin:0;color:var(--text-secondary,#4A433C);font-size:14px">${intro}</p>` : ''}${err ? `<p role="alert" style="margin:0;color:var(--danger,#A8261B);font-size:14px">${err}</p>` : ''}${choices.map(c => `<button value="${c.value}" style="${BTN}${c.primary ? ';border-color:var(--accent,#B4511C);box-shadow:0 0 0 1px var(--accent,#B4511C)' : ''}"><b style="font-size:15px">${c.label}</b>${c.hint ? `<small style="color:var(--text-muted,#6B625A);font-size:12.5px">${c.hint}</small>` : ''}</button>`).join('')}<button value="cancel" formnovalidate style="min-height:44px;border:0;background:none;font:inherit;color:var(--text-secondary,#4A433C);cursor:pointer">إلغاء</button></form>`;
      document.body.appendChild(d);
      d.addEventListener('close', () => { const v = d.returnValue; d.remove(); resolve(v && v !== 'cancel' ? v : null); }, { once: true });
      d.showModal();
    });
  }
  function emailDialog(err) {
    return new Promise(resolve => {
      const d = document.createElement('dialog'); d.setAttribute('dir', 'rtl');
      d.style.cssText = 'border:0;border-radius:20px;padding:22px;max-width:min(92vw,380px);width:100%;font-family:var(--font-body,inherit);color:var(--text-primary,#1F1B17);box-shadow:0 22px 50px rgba(31,27,23,.18)';
      const inp = 'min-height:46px;border:1.5px solid var(--border-default,#D6CBB9);border-radius:12px;padding:0 12px;font:inherit';
      d.innerHTML = `<form method="dialog" style="display:grid;gap:12px"><h2 style="margin:0;font-size:19px">الدخول بالبريد الإلكتروني</h2><label style="display:grid;gap:6px;font-weight:600">البريد الإلكتروني<input name="email" type="email" autocomplete="email" dir="ltr" required style="${inp}"></label><label style="display:grid;gap:6px;font-weight:600">كلمة المرور<input name="password" type="password" autocomplete="current-password" minlength="6" required style="${inp}"></label><p role="alert" style="margin:0;color:var(--danger,#A8261B);min-height:1em;font-size:14px">${err || ''}</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button value="login" style="min-height:46px;border:0;border-radius:12px;background:var(--brand-primary,#1F1B17);color:#fff;font:inherit;font-weight:700">دخول</button><button value="signup" style="min-height:46px;border:1.5px solid var(--brand-primary,#1F1B17);border-radius:12px;background:#fff;font:inherit;font-weight:700">حساب جديد</button></div><div style="display:flex;justify-content:space-between"><button value="reset" style="border:0;background:none;font:inherit;font-size:13.5px;color:var(--accent-ink,#9A4415);cursor:pointer">نسيت كلمة المرور؟</button><button value="cancel" formnovalidate style="border:0;background:none;font:inherit;font-size:13.5px;cursor:pointer">رجوع</button></div></form>`;
      document.body.appendChild(d);
      const form = d.querySelector('form');
      d.addEventListener('close', () => { const v = d.returnValue; const f = Object.fromEntries(new FormData(form)); d.remove(); resolve(v && v !== 'cancel' ? { action: v, ...f } : null); }, { once: true });
      d.showModal();
    });
  }
  const AUTH_MSG = {
    'auth/invalid-credential': 'البريد أو كلمة المرور غير صحيحة', 'auth/wrong-password': 'البريد أو كلمة المرور غير صحيحة',
    'auth/user-not-found': 'لا يوجد حساب بهذا البريد — اختر «حساب جديد»', 'auth/email-already-in-use': 'هذا البريد له حساب بالفعل — اختر «دخول»',
    'auth/weak-password': 'كلمة المرور 6 أحرف على الأقل', 'auth/invalid-email': 'اكتب بريدًا إلكترونيًا صحيحًا',
    'auth/too-many-requests': 'محاولات كثيرة — انتظر قليلًا ثم حاول', 'auth/network-request-failed': 'لا يوجد اتصال بالإنترنت',
    'auth/operation-not-allowed': 'هذه الطريقة غير مفعّلة حاليًا — اختر طريقة أخرى', 'auth/admin-restricted-operation': 'هذه الطريقة غير مفعّلة حاليًا — اختر طريقة أخرى'
  };
  const authMsg = e => AUTH_MSG[e && e.code] || (e && e.message) || 'حدث خطأ — حاول مرة أخرى';
  async function emailSignIn() {
    let err = '';
    for (;;) {
      const v = await emailDialog(err);
      if (!v) return false;
      try {
        if (v.action === 'reset') { await A.sendPasswordResetEmail(auth, String(v.email).trim()); err = 'أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك'; continue; }
        if (v.action === 'signup') {
          const cred = await A.createUserWithEmailAndPassword(auth, String(v.email).trim(), v.password);
          A.sendEmailVerification(cred.user).catch(() => {});              // optional confirmation; not required to continue
        } else await A.signInWithEmailAndPassword(auth, String(v.email).trim(), v.password);
        return true;
      } catch (e) { err = authMsg(e); }
    }
  }
  async function customerSignIn(phone) {
    let err = '';
    for (;;) {
      const how = await choiceDialog('اختر طريقة الدخول', 'بياناتك (الاسم ورقم التواصل) تُحفظ مع حسابك، ويراها مقدم الخدمة فقط بعد قبول طلبك.', [
        { value: 'quick', label: 'متابعة سريعة', hint: 'بالاسم والرقم فقط — بدون كود أو كلمة مرور. الحساب محفوظ على هذا الجهاز.', primary: true },
        { value: 'email', label: 'البريد الإلكتروني وكلمة المرور', hint: 'للدخول من أي جهاز.' },
        { value: 'phone', label: 'كود تحقق على الموبايل (SMS)', hint: `نرسل كودًا إلى ${phone}.` }
      ], err);
      if (!how) return false;
      try {
        if (how === 'quick') { await A.signInAnonymously(auth); return true; }
        if (how === 'email') { if (await emailSignIn()) return true; err = ''; continue; }
        await phoneSignIn(phone); return true;
      } catch (e) { if (e && e.message === 'cancelled') { err = ''; continue; } err = authMsg(e); }
    }
  }

  /* «بيكتب…» in the request chat: a tiny Realtime Database flag per request and user (typing/{reqId}/{uid} = {r, at});
     no Firestore reads or writes. Request ids are random and unguessable; the flag carries no message content. */
  let typingAt = 0;
  function setTyping(reqId, role) {
    const u = auth.currentUser; if (!u || !reqId || Date.now() - typingAt < 2500) return;
    typingAt = Date.now();
    try { D.set(D.ref(rtdb, `typing/${reqId}/${u.uid}`), { r: role, at: D.serverTimestamp() }); } catch (e) {}
  }
  function onTyping(reqId, role, cb) {
    const u = auth.currentUser; if (!u || !reqId) return () => {};
    try { return D.onValue(D.ref(rtdb, `typing/${reqId}`), snap => { const v = snap.val() || {}; const other = Object.entries(v).find(([uid, x]) => uid !== u.uid && x && x.r !== role && Date.now() - (+x.at || 0) < 6000); cb(!!other); }); } catch (e) { return () => {}; }
  }

  const HSBackend = {
    mode: 'firebase',
    setTyping, onTyping,
    /** «اكتب مشكلتك» / «صوّر المشكلة»: {kind:'text', text} | {kind:'photo', image} → {cat, item, problem, …} (throws when unavailable) */
    async ai(payload) { return (await callSession({ op: 'ai', ...payload })).data; },
    get actor() { return actor; },
    get lastSync() { return last; },
    sync,
    /** Admin Center mutation through the server; resolves after the read model (workforce/RBAC included) is refreshed. */
    async admin(method, path, body) {
      const res = await C.request(method, path, { body });
      try { await sync(); } catch {}
      return res;
    },
    /** Customer: signed in (any method) and registered server-side. */
    verifiedCustomer() { return !!(auth.currentUser && actor && actor.role === 'customer'); },
    /** Customer sign-in + registration: quick account, email or SMS (the user chooses); name + contact phone. */
    async verifyCustomer(name, phone, opts) {
      const u = auth.currentUser;
      const usable = u && (!u.phoneNumber || normalized(u) === String(phone).trim());
      if (opts && opts.method) {
        /* the method was chosen in the form: run it directly (no second dialog) */
        try {
          if (opts.method === 'email') {
            const email = String(opts.email || '').trim();
            if (!(u && u.email && u.email.toLowerCase() === email.toLowerCase())) {
              if (opts.mode === 'login') await A.signInWithEmailAndPassword(auth, email, opts.password);
              else { const cred = await A.createUserWithEmailAndPassword(auth, email, opts.password); A.sendEmailVerification(cred.user).catch(() => {}); }
            }
          } else if (opts.method === 'phone') { if (!(u && normalized(u) === String(phone).trim())) await phoneSignIn(phone); }
          else if (!usable) await A.signInAnonymously(auth);     // quick: reuse any existing session on this device
        } catch (e) { if (e && e.message === 'cancelled') throw e; throw new Error(authMsg(e)); }
      } else if (!usable && !(await customerSignIn(phone))) throw new Error('cancelled');
      const body = auth.currentUser.phoneNumber ? { name } : { name, phone: String(phone).trim() };
      const r = (await callSession({ op: 'registerCustomer', ...body })).data;
      actor = r.actor; applySnapshot(r.db); reflectSession(actor, r.db);
      if (globalThis.HSRealtimeClient) globalThis.HSRealtimeClient.notify({ source: 'firebase' });
      return actor;
    },
    async signInProvider() {
      const v = await dialog('دخول مقدم الخدمة', [{ name: 'phone', label: 'رقم الموبايل المسجّل', type: 'tel', attrs: 'inputmode="tel" pattern="01[0125][0-9]{8}"' }], 'إرسال الرمز');
      if (!v) return null;
      await phoneSignIn(v.phone); await sync(); location.reload(); return actor;
    },
    async signInAdmin() {
      const v = await dialog('دخول الإدارة', [{ name: 'email', label: 'البريد الإلكتروني', type: 'email' }, { name: 'password', label: 'كلمة المرور', type: 'password' }], 'دخول');
      if (!v) return null;
      const cred = await A.signInWithEmailAndPassword(auth, v.email, v.password);
      if (!cred.user.emailVerified) { await A.sendEmailVerification(cred.user); alert('أرسلنا رسالة تأكيد إلى بريدك — أكّد البريد ثم سجّل الدخول مرة أخرى.'); return null; }
      await cred.user.getIdToken(true);
      let r = await sync();
      if (r.adminGate) return null;                                     // the access-code dialog takes over (adminCodeFlow)
      if (!r.actor) { try { await callSession({ op: 'claimOwner', name: cred.user.displayName || v.email }); r = await sync(); } catch (e) { /* not the bootstrap owner: the server decides */ } }
      if (r.adminGate) return null;                                     // new owner: sets the access code now
      if (!r.actor) { alert('هذا الحساب ليس له صلاحية إدارة.'); return null; }
      location.reload(); return actor;
    },
    /** Web push: ask permission (only from a user gesture), get this device's FCM token, register it server-side. */
    async enablePush() {
      if (!('Notification' in globalThis) || !('serviceWorker' in navigator)) throw new Error('المتصفح لا يدعم الإشعارات');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return false;
      const M = await import(SDK + 'firebase-messaging.js');
      if (!(await M.isSupported())) throw new Error('المتصفح لا يدعم الإشعارات');
      const reg = await navigator.serviceWorker.ready;
      const token = await M.getToken(M.getMessaging(app), { vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg });
      if (!token) return false;
      await callSession({ op: 'registerPush', app: APP, token });
      try { localStorage.setItem('hs_push_token', token); } catch {}
      return true;
    },
    pushState() { return !('Notification' in globalThis) ? 'unsupported' : Notification.permission; },
    /** Admin: change my own 8-digit code (current code required). */
    async changeAdminCode() {
      const num = 'inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autocomplete="off" required';
      const v = await dialog('تغيير كود الدخول', [{ name: 'current', label: 'الكود الحالي', type: 'password', attrs: num }, { name: 'code', label: 'الكود الجديد (٨ أرقام)', type: 'password', attrs: num }, { name: 'again', label: 'الكود الجديد تاني', type: 'password', attrs: num }], 'تغيير');
      if (!v) return false;
      if (v.code !== v.again) { alert('الكودين الجداد مش زي بعض.'); return false; }
      try { await callSession({ op: 'adminCode', action: 'set', code: v.code, current: v.current }); alert('اتغيّر كود الدخول.'); return true; }
      catch (e) { alert((e && e.message) || 'تعذّر تغيير الكود'); return false; }
    },
    /** Admin: end the code unlock on this account (also part of signing out). */
    lockAdmin: () => callSession({ op: 'adminCode', action: 'lock' }).catch(() => {}),
    async signOut() {
      if (APP === 'admin') { try { await callSession({ op: 'adminCode', action: 'lock' }); } catch {} }
      try { const t = localStorage.getItem('hs_push_token'); if (t) { await callSession({ op: 'unregisterPush', token: t }); localStorage.removeItem('hs_push_token'); } } catch {}
      await A.signOut(auth); actor = null; try { localStorage.removeItem('hs_user'); sessionStorage.removeItem('hs_provider_demo_session'); sessionStorage.removeItem('hs_admin_demo_session'); } catch {} await sync(); },
    claimOwner: name => callSession({ op: 'claimOwner', name }).then(r => r.data),
    /** Owner-only, additive, idempotent import of this browser's local database; dryRun first. Local data is kept. */
    importLocal(dryRun = true, includeDemo = false) {
      let db = null; try { db = JSON.parse(localStorage.getItem('hs_mp_db_backup_before_firebase') || localStorage.getItem(DB_KEY) || 'null'); } catch {}
      return callSession({ op: 'importLocal', db, dryRun, includeDemo }).then(r => r.data);
    }
  };
  globalThis.HSBackend = HSBackend;

  /* Admin idle lock: 30 minutes without any interaction ends the code unlock on the server and asks for the code
     again (an unattended screen in an office or café cannot be used by someone else). */
  if (APP === 'admin') {
    const IDLE_MS = 30 * 60000; let lastAct = Date.now();
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true, capture: true }));
    setInterval(async () => {
      if (!actor || actor.role !== 'admin' || Date.now() - lastAct < IDLE_MS) return;
      lastAct = Date.now();
      try { await callSession({ op: 'adminCode', action: 'lock' }); } catch {}
      location.reload();                                              // sync returns {adminGate} → the code dialog
    }, 60000);
  }

  /* Provider/Admin: offer sign-in when the app has no backend identity. */
  /* Customer/Provider: once signed in, offer device notifications politely (never an automatic permission prompt).
     The browser prompt only opens when the user taps «تفعيل». «لاحقًا» hides the offer for 7 days. */
  document.addEventListener('hs:backend-sync', e => {
    try {
      if (APP === 'admin' || !(e.detail && e.detail.actor)) return;
      if (HSBackend.pushState() !== 'default' || document.getElementById('hs-push-offer')) return;
      const until = Number(localStorage.getItem('hs_push_later') || 0); if (until > Date.now()) return;
      const box = document.createElement('div');
      box.id = 'hs-push-offer'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'تفعيل الإشعارات'); box.dir = 'rtl';
      box.style.cssText = 'position:fixed;inset-inline:12px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:220;max-width:440px;margin-inline:auto;display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid var(--border-subtle,#E6DDCF);border-radius:16px;background:var(--surface-primary,#fff);box-shadow:0 12px 30px rgba(31,27,23,.16);font-family:var(--font-body,inherit);color:var(--text-primary,#1F1B17)';
      /* a customer waiting for offers hears the most relevant reason */
      let biddingOpen = false; try { biddingOpen = typeof MP !== 'undefined' && (MP.db().serviceRequests || []).some(r => r.bidding && ['received', 'searching', 'sent'].includes(r.status)); } catch {}
      const msg = APP === 'provider' ? 'فعّل الإشعارات عشان توصلك الطلبات الجديدة فورًا.' : biddingOpen ? 'فعّل الإشعارات عشان نبلغك أول ما توصلك عروض الفنيين — حتى لو قفلت الصفحة.' : 'فعّل الإشعارات عشان نبلغك بحالة طلبك أول بأول.';
      box.innerHTML = `<span style="flex:1;font-size:14px;line-height:1.5">${msg}</span><button type="button" data-push-yes style="min-height:40px;padding:0 14px;border:0;border-radius:12px;background:var(--brand-primary,#1F1B17);color:#fff;font:inherit;font-weight:700;cursor:pointer">تفعيل</button><button type="button" data-push-later style="min-height:40px;padding:0 10px;border:0;background:none;color:var(--text-secondary,#4A433C);font:inherit;cursor:pointer">لاحقًا</button>`;
      box.querySelector('[data-push-yes]').addEventListener('click', () => {
        box.remove();
        HSBackend.enablePush().then(ok => { try { if (globalThis.toast) globalThis.toast(ok ? 'تم تفعيل الإشعارات على هذا الجهاز' : 'لم يتم تفعيل الإشعارات'); } catch {} })
          .catch(err => { try { if (globalThis.toast) globalThis.toast(err && /[؀-ۿ]/.test(err.message) ? err.message : 'تعذّر تفعيل الإشعارات'); } catch {} });
      });
      box.querySelector('[data-push-later]').addEventListener('click', () => { box.remove(); try { localStorage.setItem('hs_push_later', String(Date.now() + 7 * 864e5)); } catch {} });
      document.body.appendChild(box);
    } catch {}
  });

  document.addEventListener('hs:backend-sync', e => {
    if (APP === 'customer' || (e.detail && e.detail.actor)) return;
    if (document.getElementById('hs-backend-signin')) return;
    const b = document.createElement('button');
    b.id = 'hs-backend-signin'; b.type = 'button';
    b.textContent = APP === 'admin' ? 'دخول الإدارة' : (e.detail && e.detail.provider && e.detail.provider.status === 'pending' ? 'تسجيلك قيد المراجعة' : 'دخول مقدم الخدمة');
    b.style.cssText = 'position:fixed;inset-inline-start:16px;bottom:88px;z-index:200;min-height:46px;padding:0 18px;border:0;border-radius:14px;background:var(--brand-primary,#1F1B17);color:#fff;font:inherit;font-weight:700;box-shadow:0 8px 22px rgba(31,27,23,.2)';
    b.addEventListener('click', () => (APP === 'admin' ? HSBackend.signInAdmin() : HSBackend.signInProvider()).catch(err => alert(err.message)));
    document.body.appendChild(b);
  });
}

if (CFG && CFG.mode === 'firebase') {
  /* keep a one-time backup of this browser's local database before the server snapshot replaces it */
  try { if (!localStorage.getItem('hs_mp_db_backup_before_firebase') && localStorage.getItem(DB_KEY)) localStorage.setItem('hs_mp_db_backup_before_firebase', localStorage.getItem(DB_KEY)); } catch {}
  start().catch(e => {
    console.error('[backend] Firebase start failed', e);
    /* never fall back silently to the local demo store: every request now fails visibly until the page reloads online */
    try {
      const C = globalThis.HSApiClient;
      C.setTransport(async () => C.fail('UNAVAILABLE', 'تعذّر الاتصال بالخادم — تحقق من الإنترنت ثم أعد تحميل الصفحة'));
      C.setActorResolver(() => null);
    } catch {}
  });
}
