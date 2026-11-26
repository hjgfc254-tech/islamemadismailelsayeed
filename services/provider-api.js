/**
 * MODULE: provider-api
 * RESPONSIBILITY: Provider onboarding and self-service contract over services/api-client.js (mock handlers on MP).
 *   • Registration is public and creates a PENDING record only — it grants no provider role (see auth-api: the
 *     provider actor requires status 'approved', which only Admin can set via admin-api).
 *   • A provider edits only their own profile fields (allow-list); status, commission and rating are not writable.
 * ROUTES:
 *   POST  /providers/register        public     {name, phone, type, cats[], govs[], areas[], years, bio, docs}
 *   GET   /providers/me              provider   own full profile
 *   PATCH /providers/me              provider   allow-listed profile fields
 *   PATCH /providers/me/availability provider   {available: boolean}
 * STATUS: IMPLEMENTED (MOCK ADAPTER — local store only, no network, no real verification)
 */
'use strict';
(function (root, factory) {
  const client = root.HSApiClient || (typeof require === 'function' ? require('./api-client.js') : null);
  const api = factory(client);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSProviderApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (client) {
  const { ok, fail } = client;
  /* Same rules as the Provider app form (apps/provider/app.js registrationFrom). */
  const PHONE_RE = /^[0-9+ ]{8,15}$/;
  const TYPES = ['individual', 'company'];
  const EDITABLE = ['name', 'phone', 'type', 'cats', 'govs', 'areas', 'years', 'bio', 'docs', 'payoutWallet'];   // payoutWallet: where weekly online earnings are sent
  /* SERVICE_TYPES is a global lexical binding (shared/config/legacy-data.js). */
  const knownCats = () => { try { return typeof SERVICE_TYPES !== 'undefined' ? Object.keys(SERVICE_TYPES) : null; } catch { return null; } };

  /** Pure validation shared by onboarding and profile editing. Returns { value, errors }. */
  function validateProfile(b, store) {
    const errors = {};
    const name = String(b.name || '').trim();
    const phone = String(b.phone || '').trim();
    const list = v => (Array.isArray(v) ? v : v ? String(v).split(/[،,]/) : []).map(String).map(s => s.trim()).filter(Boolean);
    const cats = list(b.cats), govs = list(b.govs), areas = list(b.areas);
    const years = b.years === undefined || b.years === '' ? 0 : +b.years;
    const cats0 = knownCats(), govs0 = store && store.GOVS;
    if (!name || name.length > 80) errors.name = 'أدخل الاسم (حتى 80 حرفًا)';
    if (!PHONE_RE.test(phone)) errors.phone = 'رقم الهاتف من 8 إلى 15 خانة (أرقام ومسافات و+)';
    if (!TYPES.includes(b.type || 'individual')) errors.type = 'نوع غير صالح';
    if (!cats.length || (cats0 && !cats.every(c => cats0.includes(c)))) errors.cats = 'اختر تخصصًا واحدًا على الأقل من القائمة';
    if (!govs.length || (govs0 && !govs.every(g => govs0.includes(g)))) errors.govs = 'اختر محافظة واحدة على الأقل من القائمة';
    if (!Number.isInteger(years) || years < 0 || years > 60) errors.years = 'سنوات الخبرة رقم صحيح من 0 إلى 60';
    if (String(b.bio || '').trim().length > 300) errors.bio = 'النبذة حتى 300 حرف';
    /* payout: an Egyptian mobile wallet number, or an InstaPay address / IBAN (free text up to 60) */
    const wallet = String(b.payoutWallet || '').trim().slice(0, 60);
    if (wallet && !/^(?:01[0125]\d{8}|[\w.\-]+@[\w.\-]+|EG\d{27})$/i.test(wallet.replace(/\s+/g, ''))) errors.payoutWallet = 'رقم محفظة (01xxxxxxxxx) أو عنوان إنستاباي (name@bank) أو IBAN';
    return { value: { name, phone, type: b.type || 'individual', cats, govs, areas, years, bio: String(b.bio || '').trim(), docs: String(b.docs || '').trim().slice(0, 200), payoutWallet: String(b.payoutWallet || '').replace(/\s+/g, '').slice(0, 60) }, errors };
  }
  const own = (store, p) => ({ ...p, rating: store.rating(p.id), acceptRate: store.acceptRate(p.id) });

  client.define('POST', '/providers/register', { roles: ['public'], summary: 'Onboarding: create a pending provider registration.' }, ({ body, store }) => {
    const { value, errors } = validateProfile(body, store);
    if (Object.keys(errors).length) return fail('VALIDATION', 'راجع بيانات التسجيل', errors);
    if (store.db().providers.some(p => p.phone === value.phone)) return fail('CONFLICT', 'يوجد تسجيل سابق بهذا الرقم');
    const p = store.registerProvider(value);
    return ok({ id: p.id, status: p.status }, 201);
  });

  client.define('GET', '/providers/me', { roles: ['provider'], summary: 'Own full profile.' }, ({ actor, store }) => {
    const p = store.get('providers', actor.id);
    return p ? own(store, p) : fail('NOT_FOUND');
  });

  client.define('PATCH', '/providers/me', { roles: ['provider'], summary: 'Edit allow-listed own profile fields.' }, ({ body, actor, store }) => {
    const p = store.get('providers', actor.id); if (!p) return fail('NOT_FOUND');
    const blocked = Object.keys(body).filter(k => !EDITABLE.includes(k));
    if (blocked.length) return fail('FORBIDDEN', 'حقول لا يمكن تعديلها من ملف مقدم الخدمة', { fields: blocked });
    const { value, errors } = validateProfile({ ...p, ...body }, store);
    if (Object.keys(errors).length) return fail('VALIDATION', 'راجع بيانات الملف', errors);
    if (store.db().providers.some(x => x.id !== p.id && x.phone === value.phone)) return fail('CONFLICT', 'الرقم مستخدم في حساب آخر');
    store.updateProvider(p.id, value);
    return own(store, store.get('providers', p.id));
  });

  /* Account deletion (store requirement): refused while a job is open; afterwards the record is anonymised — past
     jobs, reviews and transactions keep their numbers for customers' history and the accounts, without personal data. */
  client.define('DELETE', '/providers/me', { roles: ['provider'], summary: 'Delete own account (anonymise; refused with open jobs).' }, ({ actor, store }) => {
    const db = store.db(), p = store.get('providers', actor.id);
    if (!p) return client.fail('NOT_FOUND');
    const open = (db.assignments || []).filter((x) => x.providerId === p.id && x.status === 'accepted')
      .some((x) => { const r = store.get('serviceRequests', x.reqId); return r && !['completed', 'closed', 'cancelled', 'failed'].includes(r.status); });
    if (open) return client.fail('CONFLICT', 'عندك شغل لسه مفتوح — خلّصه أو اعتذر عنه الأول، وبعدها احذف الحساب');
    (db.assignments || []).forEach((x) => { if (x.providerId === p.id && x.status === 'offered') x.status = 'withdrawn'; });
    Object.assign(p, { name: 'مقدم خدمة محذوف', phone: '', email: '', bio: '', photo: '', available: false, status: 'deleted', deletedAt: new Date().toISOString(), areas: [], govs: [] });
    store.save();
    return { id: p.id, deleted: true };
  });
  client.define('PATCH', '/providers/me/availability', { roles: ['provider'], summary: 'Toggle availability for new requests.' }, ({ body, actor, store }) => {
    if (typeof body.available !== 'boolean') return fail('VALIDATION', 'قيمة التوفر غير صالحة', { available: 'boolean' });
    store.updateProvider(actor.id, { available: body.available });
    return { available: store.get('providers', actor.id).available };
  });

  return {
    EDITABLE, validateProfile,
    register: body => client.post('/providers/register', body),
    me: () => client.get('/providers/me'),
    update: patch => client.patch('/providers/me', patch),
    setAvailability: available => client.patch('/providers/me/availability', { available }),
    deleteMe: () => client.del('/providers/me')
  };
});
