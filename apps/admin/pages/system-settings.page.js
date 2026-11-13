/**
 * MODULE: system-settings.page
 * RESPONSIBILITY: Admin system settings — grouped settings form (general, operations, tax, access), per-field validation, a mandatory
 *   two-step save (review of exact changes → confirm with a written reason), restore-defaults (also reviewed) and a local change log.
 * STATUS: IMPLEMENTED (DEMO). Values live in memory only: nothing is saved, nothing changes the behaviour of any app (maintenance mode, tax,
 *   timeouts and limits are NOT enforced anywhere), and state is lost on reload. Ranges/defaults are demo assumptions
 *   (docs/DECISIONS/2026-11-09-system-settings-demo-assumptions.md). Commission rules stay in commissions.page.js (no second copy).
 * Depends on: HSAdminShell, HSDialog.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(t); } catch (e) { return iso; } };
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const DEMO_NOW = '2026-11-09T12:00:00Z', REASON_MIN = 3, REASON_MAX = 300;

  const GROUPS = { general: 'عام', operations: 'التشغيل', tax: 'الضريبة', access: 'الدخول والجلسات' };
  const LANGS = { ar: 'العربية', en: 'الإنجليزية' };
  const ZONES = { 'Africa/Cairo': 'القاهرة', 'Asia/Riyadh': 'الرياض', 'UTC': 'التوقيت العالمي' };
  /** Field schema (demo assumption). type: text | email | int | bool | select. */
  const FIELDS = [
    { key: 'platformName', group: 'general', type: 'text', label: 'اسم المنصة', min: 2, max: 60, def: 'حنصلحلك (تجريبي)' },
    { key: 'supportEmail', group: 'general', type: 'email', label: 'بريد الدعم', max: 80, def: 'support@example.test', hint: 'عنوان مثال فقط؛ لا يُرسل إليه شيء.' },
    { key: 'language', group: 'general', type: 'select', label: 'اللغة الافتراضية', options: LANGS, def: 'ar' },
    { key: 'timezone', group: 'general', type: 'select', label: 'المنطقة الزمنية', options: ZONES, def: 'Africa/Cairo' },
    { key: 'autoCancelHours', group: 'operations', type: 'int', label: 'إلغاء الطلب غير المؤكد بعد (ساعات)', min: 1, max: 72, def: 24 },
    { key: 'maxAttachmentMb', group: 'operations', type: 'int', label: 'أقصى حجم مرفق (ميجابايت)', min: 1, max: 25, def: 5 },
    { key: 'providerApproval', group: 'operations', type: 'bool', label: 'اشتراط اعتماد المزود الجديد', def: true },
    { key: 'maintenance', group: 'operations', type: 'bool', label: 'وضع الصيانة', def: false, hint: 'لا يوقف أي تطبيق فعليًا.' },
    { key: 'taxEnabled', group: 'tax', type: 'bool', label: 'تفعيل الضريبة', def: false, hint: 'الضريبة غير معتمدة بعد؛ العرض تجريبي.' },
    { key: 'taxRatePct', group: 'tax', type: 'int', label: 'نسبة الضريبة (٪)', min: 0, max: 30, def: 14, when: 'taxEnabled' },
    { key: 'sessionTimeoutMin', group: 'access', type: 'int', label: 'مهلة الخمول (دقائق)', min: 5, max: 480, def: 60 },
    { key: 'maxLoginAttempts', group: 'access', type: 'int', label: 'أقصى محاولات دخول فاشلة', min: 3, max: 10, def: 5 }
  ];
  const BY_KEY = {}; FIELDS.forEach((f) => { BY_KEY[f.key] = f; });
  const defaults = () => { const o = {}; FIELDS.forEach((f) => { o[f.key] = f.def; }); return o; };
  let current = defaults(), log = [];
  const resetState = () => { current = defaults(); log = []; };

  /* ───── Pure logic (unit-tested) ───── */
  /** Coerces raw form input to the field's type. Returns undefined when not coercible. */
  const coerce = (f, raw) => {
    if (f.type === 'bool') return raw === true || raw === 'true' || raw === 'on' ? true : (raw === false || raw === 'false' || raw == null || raw === '' ? false : undefined);
    if (f.type === 'int') { const t = String(raw == null ? '' : raw).trim(); return /^\d{1,4}$/.test(t) ? Number(t) : undefined; }
    return String(raw == null ? '' : raw).trim();
  };
  /** Returns { key: message } for invalid values; {} = valid. Expects already-coerced values. */
  const validate = (v) => {
    const e = {};
    FIELDS.forEach((f) => {
      const x = v[f.key];
      if (f.when && !v[f.when]) return;
      if (f.type === 'bool') { if (typeof x !== 'boolean') e[f.key] = 'قيمة غير صالحة.'; return; }
      if (f.type === 'int') { if (!Number.isInteger(x)) e[f.key] = 'أدخل عددًا صحيحًا.'; else if (x < f.min || x > f.max) e[f.key] = 'القيمة بين ' + nf(f.min) + ' و' + nf(f.max) + '.'; return; }
      if (f.type === 'select') { if (!Object.prototype.hasOwnProperty.call(f.options, x)) e[f.key] = 'اختر قيمة من القائمة.'; return; }
      if (typeof x !== 'string' || !x) { e[f.key] = 'هذا الحقل مطلوب.'; return; }
      if (f.min && x.length < f.min) e[f.key] = 'الحد الأدنى ' + nf(f.min) + ' أحرف.';
      else if (f.max && x.length > f.max) e[f.key] = 'الحد الأقصى ' + nf(f.max) + ' حرفًا.';
      else if (f.type === 'email' && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(x)) e[f.key] = 'بريد إلكتروني غير صالح.';
    });
    return e;
  };
  const show = (f, x) => (f.type === 'bool' ? (x ? 'مفعّل' : 'معطّل') : f.type === 'select' ? f.options[x] || String(x) : f.type === 'int' ? nf(x) : String(x));
  /** Changes between two value sets: [{ key, label, from, to }] (display strings). Ignores a hidden field (taxRatePct while tax is off). */
  const diff = (a, b) => FIELDS.filter((f) => a[f.key] !== b[f.key] && !(f.when && !a[f.when] && !b[f.when]))
    .map((f) => ({ key: f.key, label: f.label, from: show(f, a[f.key]), to: show(f, b[f.key]) }));
  /** Simulated save. Immutable. Throws 'Invalid values'|'No changes'|'Reason required'. */
  const applyChange = (cur, lg, next, o) => {
    if (Object.keys(validate(next)).length) throw new Error('Invalid values');
    const d = diff(cur, next); if (!d.length) throw new Error('No changes');
    const note = String((o && o.note) == null ? '' : o.note).trim();
    if (note.length < REASON_MIN || note.length > REASON_MAX) throw new Error('Reason required');
    return { values: Object.assign({}, next), log: lg.concat([{ at: DEMO_NOW, note, changes: d }]) };
  };
  const diffText = (d) => d.map((c) => c.label + ': ' + c.from + ' ← ' + c.to).join('؛ ');

  /* ───── Rendering ───── */
  const fieldHtml = (f, v, err) => {
    const id = 'set-' + f.key, hint = f.hint ? `<small class="ord-muted" id="${id}-h">${esc(f.hint)}</small>` : '', er = `<small class="ord-err" id="${id}-e" role="alert"${err ? '' : ' hidden'}>${esc(err || '')}</small>`;
    const desc = ' aria-describedby="' + (f.hint ? id + '-h ' : '') + id + '-e"' + (err ? ' aria-invalid="true"' : '');
    if (f.type === 'bool') return `<div class="hs-grid-field set-bool"><label for="${id}"><input type="checkbox" id="${id}" name="${f.key}"${v[f.key] ? ' checked' : ''}${desc}> ${esc(f.label)}</label>${hint}${er}</div>`;
    if (f.type === 'select') return `<div class="hs-grid-field"><label for="${id}">${esc(f.label)}</label><select id="${id}" name="${f.key}"${desc}>${Object.keys(f.options).map((k) => `<option value="${esc(k)}"${v[f.key] === k ? ' selected' : ''}>${esc(f.options[k])}</option>`).join('')}</select>${hint}${er}</div>`;
    const isNum = f.type === 'int';
    return `<div class="hs-grid-field"><label for="${id}">${esc(f.label)}</label><input id="${id}" name="${f.key}" type="text" ${isNum ? 'inputmode="numeric" dir="ltr"' : f.type === 'email' ? 'dir="ltr"' : ''} value="${esc(v[f.key])}" ${f.max && !isNum ? 'maxlength="' + f.max + '"' : ''}${desc}>${hint}${er}</div>`;
  };
  const formHtml = (v, errs) => Object.keys(GROUPS).map((g) => `<fieldset class="set-grp"><legend>${esc(GROUPS[g])}</legend>${FIELDS.filter((f) => f.group === g).map((f) => fieldHtml(f, v, errs[f.key])).join('')}</fieldset>`).join('');
  const logHtml = () => `<section aria-labelledby="set-h-log"><h3 id="set-h-log">سجل التغييرات (محلي)</h3>${log.length ? `<ul class="ord-tl">${log.slice().reverse().map((x) => `<li><span><b>${esc(x.note)}</b><br>${esc(diffText(x.changes))}</span><small>${esc(dt(x.at))}</small></li>`).join('')}</ul>` : '<p class="ord-muted">لا تغييرات مسجلة في هذه الجلسة.</p>'}</section>`;
  const reviewHtml = (d, note) => `<div class="ord-dlg-in"><header class="ord-dlg-h"><div><h2 id="ord-dlg-t">مراجعة التغييرات قبل الحفظ</h2><p>${esc(nf(d.length))} تغيير</p></div><button type="button" class="adm-btn" data-ord-close aria-label="إغلاق">${icon('close')}</button></header>
    <p class="ord-sim" role="note">${icon('info')}<span>محاكاة محلية: لن يُحفظ شيء ولن يتغير سلوك أي تطبيق، وتُفقد التغييرات عند إعادة التحميل.</span></p>
    <ul class="ord-tl">${d.map((c) => `<li><span><b>${esc(c.label)}</b></span><small>${esc(c.from)} ← ${esc(c.to)}</small></li>`).join('')}</ul>
    <div class="hs-grid-field"><label for="set-note">السبب (مطلوب ويُسجَّل، ${nf(REASON_MIN)}–${nf(REASON_MAX)} حرفًا)</label><textarea id="set-note" rows="2" maxlength="${REASON_MAX}">${esc(note || '')}</textarea></div>
    <p class="ord-err" id="ord-err" role="alert" hidden></p>
    <div class="ord-act"><button type="button" class="adm-btn adm-btn-p" data-set-confirm>تأكيد الحفظ (محاكاة محلية)</button><button type="button" class="adm-btn" data-ord-close>رجوع</button></div></div>`;

  const render = () => {
    const wrap = root.document.createElement('div'); wrap.className = 'ord set';
    wrap.innerHTML = `<div class="fin-banner" role="note">${icon('info')}<span>إعدادات تجريبية محلية — لا يُحفظ شيء ولا يتأثر أي تطبيق: وضع الصيانة والضريبة والمهل والحدود غير مطبَّقة فعليًا، ولا تُحمى الصلاحيات من الواجهة. قواعد العمولة في صفحة «العمولات». تاريخ العرض الثابت: ${esc(dt(DEMO_NOW))}.</span></div>
      <p class="stl-result" id="set-result" tabindex="-1" role="status" hidden></p>
      <form id="set-form" novalidate></form><div id="set-log"></div><dialog class="ord-dlg" id="set-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const form = wrap.querySelector('#set-form'), dlgEl = wrap.querySelector('#set-dlg'), res = wrap.querySelector('#set-result');
    let pending = null;
    const paintForm = (v, errs) => { form.innerHTML = formHtml(v, errs || {}) + '<div class="ord-act"><button type="submit" class="adm-btn adm-btn-p">مراجعة وحفظ</button><button type="button" class="adm-btn" data-set-defaults>استعادة الافتراضيات</button></div>'; };
    const paintLog = () => { wrap.querySelector('#set-log').innerHTML = logHtml(); };
    const readForm = () => { const v = {}; FIELDS.forEach((f) => { const el = form.elements[f.key]; v[f.key] = coerce(f, f.type === 'bool' ? !!(el && el.checked) : el && el.value); }); return v; };
    paintForm(current); paintLog();
    const d = root.HSDialog.attach(dlgEl, { closeSelector: '[data-ord-close]', focusSelector: '#set-note', fallbackFocus: () => form.querySelector('button[type=submit]'), onClose: () => { pending = null; } });
    form.addEventListener('submit', (e) => {
      e.preventDefault(); const v = readForm(), errs = validate(v);
      if (Object.keys(errs).length) { paintForm(Object.assign({}, current, v), errs); const f = form.querySelector('[aria-invalid="true"]'); if (f) f.focus(); return; }
      const ch = diff(current, v);
      res.hidden = false;
      if (!ch.length) { res.textContent = 'لا توجد تغييرات للحفظ.'; return; }
      res.hidden = true; pending = v; dlgEl.innerHTML = reviewHtml(ch, ''); d.open(form.querySelector('button[type=submit]'));
    });
    form.addEventListener('change', (e) => { if (e.target && e.target.name === 'taxEnabled') { const v = readForm(); paintForm(Object.assign({}, current, v), {}); const el = form.elements.taxEnabled; if (el) el.focus(); } });
    form.addEventListener('click', (e) => { if (e.target.closest('[data-set-defaults]')) { paintForm(defaults(), {}); res.hidden = false; res.textContent = 'حُمّلت القيم الافتراضية في النموذج. اضغط «مراجعة وحفظ» لتطبيقها محليًا.'; res.focus(); } });
    d.onClick((b) => {
      if (!pending || !b.hasAttribute('data-set-confirm')) return;
      try {
        const r = applyChange(current, log, pending, { note: dlgEl.querySelector('#set-note').value });
        current = r.values; log = r.log; pending = null; d.close(); paintForm(current); paintLog();
        res.hidden = false; res.textContent = 'سُجّل الحفظ محليًا. محاكاة فقط — لم يتغير سلوك أي تطبيق.'; res.focus();
      } catch (err) {
        const m = err && err.message, el = dlgEl.querySelector('#ord-err'); if (!el) return;
        el.textContent = m === 'Reason required' ? 'اكتب السبب (' + nf(REASON_MIN) + ' أحرف على الأقل) لتوثيقه.' : m === 'No changes' ? 'لا توجد تغييرات.' : 'قيم غير صالحة.'; el.hidden = false;
      }
    });
    return wrap;
  };

  const api = { GROUPS, FIELDS, LANGS, ZONES, DEMO_NOW, REASON_MIN, REASON_MAX, defaults, coerce, validate, diff, diffText, applyChange, resetState, _current: () => current, _log: () => log };
  root.HSAdminSystemSettingsPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('settings', {
      title: 'إعدادات النظام',
      description: 'إعدادات المنصة العامة والتشغيل والضريبة والدخول — محاكاة محلية بلا حفظ ولا تأثير فعلي.',
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
