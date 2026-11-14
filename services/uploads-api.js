/**
 * MODULE: uploads-api
 * RESPONSIBILITY: Attachment-upload contract. Files never leave the device: validation and storage are delegated to the
 *   existing local attachment store (services/local-attachments.js → `AT`, IndexedDB `hs_attachments_v1`, memory
 *   fallback). This adapter only fixes the contract a future upload endpoint must satisfy (limits, accepted types,
 *   error envelope). It deliberately does not go through api-client's JSON router because payloads are binary.
 *   Contract:
 *     limits()                      → { ok, status:200, data: { maxFiles, maxImageMB, maxVideoMB, … } }
 *     validate(files, existing)     → { ok, status:200, data:{ valid[] } } | { ok:false, status:422, error:{ code:'VALIDATION', details:{ errors[] } } }
 *     upload(reqId, files)          → Promise of the same envelope with data:{ items:[summary] }
 * STATUS: IMPLEMENTED (MOCK ADAPTER — local device storage only, no upload, no network)
 */
'use strict';
(function (root, factory) {
  const client = root.HSApiClient || (typeof require === 'function' ? require('./api-client.js') : null);
  const api = factory(client);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSUploadsApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (client) {
  const { ok, fail } = client;
  /* AT is a global lexical binding (services/local-attachments.js); tests may inject one. */
  let injected = null;
  const store = () => { if (injected) return injected; try { return typeof AT !== 'undefined' ? AT : null; } catch { return null; } };
  const unavailable = () => fail('UNAVAILABLE', 'تخزين المرفقات غير محمّل');

  function limits() { const s = store(); return s ? ok(s.limits()) : unavailable(); }

  function validate(files, existingCount = 0) {
    const s = store(); if (!s) return unavailable();
    const res = s.validateFiles(Array.from(files || []), existingCount);
    return res.errors && res.errors.length && !res.valid.length
      ? fail('VALIDATION', res.errors[0], { errors: res.errors })
      : ok({ valid: res.valid, errors: res.errors || [] });
  }

  async function upload(reqId, files) {
    const s = store(); if (!s) return unavailable();
    if (!String(reqId || '').trim()) return fail('VALIDATION', 'لا يوجد طلب لربط المرفقات به', { reqId: 'مطلوب' });
    const checked = validate(files, (await s.listForReq(reqId)).length);
    if (!checked.ok) return checked;
    try {
      const res = await s.addFiles(reqId, checked.data.valid);
      const added = (res && Array.isArray(res.added)) ? res.added : [];                   // AT.addFiles → { ok, added, errors }
      if (!added.length) return fail('VALIDATION', ((res && res.errors) || [])[0] || 'لم يُحفظ أي مرفق', { errors: (res && res.errors) || [] });
      return ok({ items: added.map(s.toSummary), errors: checked.data.errors.concat(res.errors || []) }, 201);
    } catch (e) {
      return fail('INTERNAL', (e && e.message) || 'تعذر حفظ المرفقات على الجهاز');
    }
  }

  return { limits, validate, upload, local: true, _useStore(s) { injected = s || null; } };
});
