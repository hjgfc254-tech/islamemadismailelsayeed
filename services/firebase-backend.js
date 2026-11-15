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
 *  - Auth: phone OTP (customer, provider) and email/password (admin) through Firebase Auth, with a small RTL dialog.
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

  async function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
      try {
        const r = (await callSession({ op: 'sync', app: APP })).data;
        actor = r.actor; last = r; if (r.serverTime) lastServerTime = Math.max(lastServerTime, r.serverTime);
        applySnapshot(r.db);
        applyAdmin(r.admin);
        reflectSession(actor, r.db || {});
        if (globalThis.HSRealtimeClient) globalThis.HSRealtimeClient.notify({ source: 'firebase' });
        document.dispatchEvent(new CustomEvent('hs:backend-sync', { detail: { actor, provider: r.provider } }));
        return r;
      } finally { syncing = null; }
    })();
    return syncing;
  }

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

  const HSBackend = {
    mode: 'firebase',
    get actor() { return actor; },
    get lastSync() { return last; },
    sync,
    /** Admin Center mutation through the server; resolves after the read model (workforce/RBAC included) is refreshed. */
    async admin(method, path, body) {
      const res = await C.request(method, path, { body });
      try { await sync(); } catch {}
      return res;
    },
    /** Customer: returns true when this phone is verified and registered; otherwise runs OTP + registration. */
    verifiedCustomer(phone) { return normalized(auth.currentUser) === String(phone).trim() && actor && actor.role === 'customer'; },
    async verifyCustomer(name, phone) {
      if (normalized(auth.currentUser) !== String(phone).trim()) await phoneSignIn(phone);
      const r = (await callSession({ op: 'registerCustomer', name })).data;
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
      if (!r.actor) { try { await callSession({ op: 'claimOwner', name: cred.user.displayName || v.email }); r = await sync(); } catch (e) { /* not the bootstrap owner: the server decides */ } }
      if (!r.actor) { alert('هذا الحساب ليس له صلاحية إدارة.'); return null; }
      location.reload(); return actor;
    },
    async signOut() { await A.signOut(auth); actor = null; try { localStorage.removeItem('hs_user'); sessionStorage.removeItem('hs_provider_demo_session'); sessionStorage.removeItem('hs_admin_demo_session'); } catch {} await sync(); },
    claimOwner: name => callSession({ op: 'claimOwner', name }).then(r => r.data),
    /** Owner-only, additive, idempotent import of this browser's local database; dryRun first. Local data is kept. */
    importLocal(dryRun = true, includeDemo = false) {
      let db = null; try { db = JSON.parse(localStorage.getItem('hs_mp_db_backup_before_firebase') || localStorage.getItem(DB_KEY) || 'null'); } catch {}
      return callSession({ op: 'importLocal', db, dryRun, includeDemo }).then(r => r.data);
    }
  };
  globalThis.HSBackend = HSBackend;

  /* Provider/Admin: offer sign-in when the app has no backend identity. */
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
