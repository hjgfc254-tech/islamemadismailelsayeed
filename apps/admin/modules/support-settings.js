/**
 * MODULE: support-settings (HSAdminSupportSettings) — two owner-level controls under Admin › الإعدادات:
 *   1. «بيانات تواصل الدعم»: phone, WhatsApp, email, working hours shown to customers («المساعدة») and providers
 *      (GET/PATCH /admin/support-contacts; owner or manager). Empty fields are simply not shown in the apps.
 *   2. «خصوصية بيانات العملاء داخل الإدارة» (owner only): adminDataPolicy 'minimal' masks customers' phones,
 *      addresses and (except for finance) transactions for the support / moderator ranks (GET/POST /admin/data-policy;
 *      enforced on the server in functions/src/scope.js).
 * Works in demo mode (local store) and live mode (server routes; changes go through HSBackend.admin to re-sync).
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = () => root.HSAdminApi;
  const call = (method, path, body) => (root.HSBackend && root.HSBackend.admin ? root.HSBackend.admin(method, path, body) : root.HSApiClient.request(method, path, { body }));
  const isOwner = () => { try { return root.HSAdminRbac.state.actor === 'owner'; } catch (e) { return false; } };
  const errText = (r) => (r && r.error && r.error.message) || 'تعذّر الحفظ.';
  const field = (name, label, value, attrs, hint, err) => `<label class="hs-grid-field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${attrs || ''} ${err ? 'aria-invalid="true"' : ''}>${err ? `<small class="ord-err" role="alert">${esc(err)}</small>` : hint ? `<small class="ord-muted">${hint}</small>` : ''}</label>`;

  async function mount(host) {
    if (!host || !A()) return;
    const [sc, dp] = await Promise.all([A().supportContacts(), A().dataPolicy()]);
    const paint = (c, errs, status, minimal) => {
      errs = errs || {};
      host.innerHTML = `<section class="sup-set" aria-labelledby="sup-h">
        <h3 id="sup-h">بيانات تواصل الدعم</h3>
        <p class="ord-muted">بتظهر للعملاء في «المساعدة» ولمقدمي الخدمة في «حسابي». أي خانة فاضية مش بتظهر خالص.</p>
        <form data-sup-form class="ord-dlg-in" novalidate>
          ${field('phone', 'رقم الاتصال', c.phone, 'inputmode="tel" autocomplete="off" dir="ltr" placeholder="01xxxxxxxxx أو 19xxx"', 'موبايل أو أرضي أو خط ساخن من ٥ أرقام', errs.phone)}
          ${field('whatsapp', 'واتساب', c.whatsapp, 'inputmode="tel" autocomplete="off" dir="ltr" placeholder="01xxxxxxxxx"', 'العميل بيفتح محادثة فيها رقم طلبه تلقائيًا', errs.whatsapp)}
          ${field('email', 'البريد الإلكتروني', c.email, 'type="email" inputmode="email" autocomplete="off" dir="ltr"', '', errs.email)}
          ${field('hours', 'مواعيد الدعم', c.hours, 'maxlength="80" placeholder="مثال: يوميًا من ٩ الصبح لـ ١٠ بالليل"', '', errs.hours)}
          <p><button type="submit" class="adm-btn adm-btn-p">حفظ بيانات التواصل</button> <span role="status" aria-live="polite" class="ord-muted" data-sup-status>${esc(status || '')}</span></p>
        </form>
      </section>
      <section class="sup-set" aria-labelledby="dp-h">
        <h3 id="dp-h">خصوصية بيانات العملاء داخل الإدارة</h3>
        <p>لما تتفعّل: موظف <b>الدعم</b> و<b>مراقب المحتوى</b> بيشوفوا رقم العميل مستخبي جزئيًا (010•••••678)، ومن غير العناوين المحفوظة ولا المعاملات المالية. <b>المالية</b> بتشوف المعاملات من غير الأرقام والعناوين. <b>المدير</b> و<b>المالك</b> بيشوفوا كل حاجة.</p>
        <p class="ord-muted">الحالة دلوقتي: <b data-dp-state>${minimal ? 'مفعّلة' : 'مقفولة — كل الموظفين بيشوفوا البيانات كاملة'}</b></p>
        ${isOwner() ? `<p><button type="button" class="adm-btn ${minimal ? '' : 'adm-btn-p'}" data-dp-toggle="${!minimal}">${minimal ? 'إيقاف الإخفاء' : 'تفعيل إخفاء بيانات العملاء'}</button> <span role="status" aria-live="polite" class="ord-muted" data-dp-status></span></p>` : '<p class="ord-muted">التغيير للمالك فقط.</p>'}
      </section>`;
      const form = host.querySelector('[data-sup-form]');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = { phone: form.phone.value, whatsapp: form.whatsapp.value, email: form.email.value, hours: form.hours.value };
        const r = await call('PATCH', '/admin/support-contacts', v);
        if (r.ok) paint(r.data, {}, 'اتحفظت بيانات التواصل.', minimal);
        else { paint(v, (r.error && r.error.details) || {}, errText(r), minimal); const f = host.querySelector('[aria-invalid="true"]'); if (f) f.focus(); }
      });
      const t = host.querySelector('[data-dp-toggle]');
      if (t) t.addEventListener('click', async () => {
        const next = t.dataset.dpToggle === 'true';
        const ask = root.HSUiDialog && root.HSUiDialog.confirm ? root.HSUiDialog.confirm(next ? 'تفعيل إخفاء بيانات العملاء عن الدعم ومراقب المحتوى؟' : 'إيقاف الإخفاء؟ كل الموظفين هيشوفوا البيانات كاملة.') : Promise.resolve(root.confirm ? root.confirm('تأكيد؟') : true);
        if (!(await ask)) return;
        const r = await call('POST', '/admin/data-policy', { minimal: next });
        if (r.ok) { paint(c, {}, '', r.data.minimal); const s = host.querySelector('[data-dp-status]'); if (s) s.textContent = r.data.minimal ? 'اتفعّل الإخفاء.' : 'اتقفل الإخفاء.'; }
        else { const s = host.querySelector('[data-dp-status]'); if (s) s.textContent = errText(r); }
      });
    };
    paint(sc.ok ? sc.data : { phone: '', whatsapp: '', email: '', hours: '' }, {}, sc.ok ? '' : errText(sc), !!(dp.ok && dp.data.minimal));
  }

  const api = Object.freeze({ mount });
  root.HSAdminSupportSettings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
