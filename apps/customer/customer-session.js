/**
 * MODULE: customer-session
 * Customer demo identity boundary (frontend only). Owns the signed-in demo customer stored locally under the
 * existing key `hs_user` ({name, phone} JSON — the same format the Customer `store` helper has always used), so
 * existing local data keeps working. This is NOT authentication: there is no password, token or server check.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  const KEY = 'hs_user';
  const PHONE_RE = /^[0-9+ ]{8,15}$/;
  const NAME_MAX = 80;

  const storage = () => { try { return root.localStorage || null; } catch { return null; } };
  /* MP is a top-level `const` in services/local-market-store.js: a global *lexical* binding, not a globalThis property. */
  const mp = () => (typeof MP !== 'undefined' ? MP : null);
  const read = () => {
    const s = storage(); if (!s) return null;
    try { const v = JSON.parse(s.getItem(KEY)); return v && typeof v === 'object' && typeof v.name === 'string' && v.name.trim() && typeof v.phone === 'string' ? { name: v.name, phone: v.phone } : null; }
    catch { return null; }
  };
  const write = v => { const s = storage(); if (!s) return; try { s.setItem(KEY, JSON.stringify(v)); } catch {} };

  /** Returns an Arabic error message, or '' when the pair is valid. Same rules as the existing sign-in forms. */
  function validate(name, phone) {
    const n = String(name ?? '').trim(), p = String(phone ?? '').trim();
    if (!n || n.length > NAME_MAX) return 'اكتب الاسم (حتى 80 حرفًا)';
    if (!PHONE_RE.test(p)) return 'رقم الهاتف غير صحيح';
    return '';
  }

  /** Stores the demo identity and ensures a local customer record exists (MP.customerFor).
      opts (optional): {method:'quick'|'email'|'phone', email, password, mode:'signup'|'login'} chosen in the form;
      without a method the Firebase bridge asks for one. */
  function signIn(name, phone, opts) {
    const error = validate(name, phone);
    if (error) return { ok: false, error };
    const o = opts && typeof opts === 'object' ? opts : {};
    if (o.method === 'email') {
      if (!/^\S+@\S+\.\S+$/.test(String(o.email || '').trim())) return { ok: false, error: 'اكتب بريدًا إلكترونيًا صحيحًا' };
      if (String(o.password || '').length < 6) return { ok: false, error: 'كلمة المرور 6 أحرف على الأقل' };
    }
    const user = { name: String(name).trim(), phone: String(phone).trim() };
    /* Firebase backend: the customer signs in with the chosen method (quick device account, email or SMS) and is
       registered server-side; on success the app continues by itself. */
    const cfg = root.HSFirebaseConfig;
    if (cfg && cfg.mode === 'firebase') {
      const B = root.HSBackend;
      if (!B) return { ok: false, error: 'جارٍ الاتصال بالخادم — حاول بعد لحظة' };
      if (!B.verifiedCustomer(user.phone)) {
        const say = m => { try { if (typeof root.toast === 'function') root.toast(m); } catch {} };
        B.verifyCustomer(user.name, user.phone, o.method ? o : undefined)
          .then(() => {
            write(user); say('تم تسجيل الدخول');
            try { if (!(typeof root.afterSignIn === 'function' && root.afterSignIn()) && typeof root.show === 'function') root.show('account'); } catch {}
          })
          .catch(e => say(e && e.message === 'cancelled' ? 'تم إلغاء تسجيل الدخول' : ('تعذّر تسجيل الدخول' + (e && e.message && /[؀-ۿ]/.test(e.message) ? ' — ' + e.message : ''))));
        return { ok: false, pending: true, error: 'جارٍ تسجيل الدخول…' };
      }
      write(user);
      return { ok: true, user };
    }
    write(user);
    try { const m = mp(); if (m && typeof m.customerFor === 'function') m.customerFor(user.name, user.phone); } catch {}
    return { ok: true, user };
  }

  /** Updates the stored identity without creating a customer record (profile edit already updated MP). */
  function update(user) { if (user && !validate(user.name, user.phone)) write({ name: String(user.name).trim(), phone: String(user.phone).trim() }); }

  function signOut() { write(null); }

  /** The local MP customer record for the current identity, or null. */
  function customer() {
    const u = read();
    const m = mp();
    try { return u && m ? (m.db().customers.find(c => c.phone === u.phone) || null) : null; } catch { return null; }
  }

  root.HSCustomerSession = Object.freeze({ KEY, PHONE_RE, current: read, validate, signIn, update, signOut, customer, isSignedIn: () => !!read() });
})(globalThis);
