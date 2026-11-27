/**
 * MODULE: payments-admin (HSPaymentsAdmin) — Admin «المدفوعات» (2026-11-27), a tab of the «الفلوس» section.
 * Online money (Paymob) is held by the platform until the customer confirms (or automatically after the hold time),
 * then each provider's net joins a weekly transfer to their wallet / InstaPay. Refunds go back through Paymob
 * automatically (paymentsClock every 30 min). This page shows and drives that flow:
 *   gateway banner · totals · weekly provider transfers («اتحوّل» + transfer reference) · held money (release / refund)
 *   · refunds in progress · settings (online on/off, warranty days, auto-release hours, gateway fee %).
 * Routes (services/admin-api.js «round 12: payments»; the server runs the same domain code):
 *   GET /admin/payments · PATCH /admin/payments/settings · POST /admin/payments/payouts · POST /admin/payments/:id/release|refund
 * Permissions: finance.view to see, finance.edit for every money action (the server re-checks, plus the rank rules).
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 2 }).format(+n || 0); } catch (e) { return String(+n || 0); } };
  const money = (n) => nf(n) + ' ج.م';
  const day = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(t); } catch (e) { return String(iso); } };
  const get = () => root.HSApiClient.request('GET', '/admin/payments');
  const send = (method, path, body) => (root.HSBackend && typeof root.HSBackend.admin === 'function' ? root.HSBackend.admin(method, path, body) : root.HSApiClient.request(method, path, { body }));
  const errText = (r) => (r && r.error && r.error.message) || 'تعذّر تنفيذ الإجراء.';
  const can = (a) => { const G = root.HSAdminPermissionGuard, S = root.HSAdminSession; if (!G || !S || !S.current) return true; const e = S.current(); return !!e && G.can(e, 'finance', a); };
  const PAY = { pending: 'مستني الدفع', topup: 'مستني فرق السعر', held: 'محجوز', released: 'اتحوّل', refunded: 'اترجع' };
  const orderLink = (id, no) => (root.HSAdminProfile ? `<a href="${esc(root.HSAdminProfile.href('order', id))}"><bdi dir="ltr">${esc(no || id)}</bdi></a>` : `<bdi dir="ltr">${esc(no || id)}</bdi>`);
  const provLink = (id, name) => (root.HSAdminProfile && id ? `<a href="${esc(root.HSAdminProfile.href('provider', id))}">${esc(name || '—')}</a>` : esc(name || '—'));

  /** Gateway banner text (pure). */
  function banner(gateway, online) {
    if (gateway === 'paymob') return online ? { tone: 'ok', text: 'Paymob شغال — العملاء يقدروا يدفعوا أونلاين.' } : { tone: 'warn', text: 'Paymob جاهز، بس الدفع الأونلاين مقفول من الإعدادات تحت — العملاء بيدفعوا كاش بس.' };
    if (gateway === 'demo') return { tone: 'info', text: 'وضع تجريبي — الدفع الأونلاين هنا محاكاة ومفيش فلوس حقيقية.' };
    return { tone: 'warn', text: 'الدفع الأونلاين مقفول لحد ما مفاتيح Paymob تتحط في إعدادات السيرفر — العملاء بيدفعوا كاش بس.' };
  }

  function view(d, st) {
    const c = d.config || {}, b = banner(c.gateway, c.online !== false), edit = can('edit');
    const table = (heads, rows, empty) => rows.length
      ? `<div class="hs-grid-scroll"><table class="hs-grid-table"><thead><tr>${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : `<p class="ord-muted">${esc(empty)}</p>`;
    const err = (k) => (st.errors && st.errors[k] ? `<small class="pay-err" id="pay-e-${k}">${esc(st.errors[k])}</small>` : '');
    const inv = (k) => (st.errors && st.errors[k] ? ` aria-invalid="true" aria-describedby="pay-e-${k}"` : '');
    return `<div class="pay-banner is-${b.tone}" role="note">${esc(b.text)}</div>
      <section class="pay-kpis" aria-label="ملخص الفلوس"><div class="pay-kpi"><span>فلوس محجوزة دلوقتي</span><b>${esc(money((d.totals || {}).held))}</b></div>
        <div class="pay-kpi"><span>مستحق للفنيين في التحويل الجاي</span><b>${esc(money((d.totals || {}).payouts))}</b></div>
        <div class="pay-kpi"><span>استرجاعات جارية</span><b>${esc(nf((d.refunds || []).length))}</b></div></section>
      <section class="pf-card"><h2 class="pf-h">تحويلات الفنيين الأسبوعية</h2>
        <p class="ord-muted">حوّل لكل فني صافي شغله الأونلاين (بعد حصة المنصة) على محفظته أو إنستاباي، وبعدها دوس «اتحوّل» واكتب رقم التحويل.</p>
        ${table(['الفني', 'الموبايل', 'المحفظة', 'المبلغ', 'عدد الشغلانات', ''], (d.payouts || []).map((g) => [provLink(g.providerId, g.name), g.phone ? `<bdi dir="ltr">${esc(g.phone)}</bdi>` : '—',
          g.wallet ? `<bdi dir="ltr">${esc(g.wallet)}</bdi>` : '<span class="pay-warn">الفني ما حطّش محفظة</span>', `<b>${esc(money(g.total))}</b>`, esc(nf((g.items || []).length)),
          edit ? `<button type="button" class="adm-btn adm-btn-p" data-pay-payout="${esc(g.providerId)}">اتحوّل</button>` : '']), 'مفيش مستحقات للفنيين دلوقتي.')}</section>
      <section class="pf-card"><h2 class="pf-h">فلوس محجوزة</h2>
        <p class="ord-muted">بتتحوّل للفني لوحدها بعد ما العميل يأكد، أو بعد ${esc(nf(c.autoReleaseHours || 48))} ساعة من إكمال الشغل. استخدم الأزرار دي بس لو فيه خلاف.</p>
        ${table(['الطلب', 'الفني', 'المبلغ', 'الحالة', 'الشغل خلص', ''], (d.held || []).map((r) => [orderLink(r.id, r.no), esc(r.provider || '—'), esc(money(r.amount)) + (r.due ? `<br><small class="ord-muted">فاضل ${esc(money(r.due))}</small>` : ''),
          esc(PAY[r.payStatus] || r.payStatus), esc(r.completedAt ? day(r.completedAt) : 'لسه'),
          edit && r.payStatus === 'held' ? `${r.completedAt ? `<button type="button" class="adm-btn" data-pay-release="${esc(r.id)}">حوّل للفني</button> ` : ''}<button type="button" class="adm-btn adm-btn-d" data-pay-refund="${esc(r.id)}" data-paid="${esc(r.amount)}" data-done="${r.completedAt ? 1 : 0}">رجّع للعميل</button>` : '']), 'مفيش فلوس محجوزة دلوقتي.')}</section>
      <section class="pf-card"><h2 class="pf-h">استرجاعات جارية</h2>
        <p class="ord-muted">بتتبعت لـ Paymob تلقائيًا كل 30 دقيقة، والعميل بيوصله إشعار.</p>
        ${table(['الطلب', 'المبلغ', 'السبب', 'من'], (d.refunds || []).map((r) => [orderLink(r.id, r.no), esc(money(r.refund && r.refund.amount)), esc((r.refund && r.refund.why) || '—'), esc(day(r.refund && r.refund.at))]), 'مفيش استرجاعات جارية.')}</section>
      <section class="pf-card"><h2 class="pf-h">إعدادات الدفع</h2>
        <form data-pay-settings class="pay-form" novalidate>
          <label class="hs-grid-field pay-check"><input type="checkbox" name="online" ${c.online !== false ? 'checked' : ''} ${edit ? '' : 'disabled'}><span>الدفع الأونلاين متاح للعملاء</span></label>
          <label class="hs-grid-field"><span>أيام قسيمة ضمان هنصلحلك</span><input type="number" name="warrantyDays" min="0" max="365" value="${esc(c.warrantyDays)}" ${edit ? '' : 'disabled'}${inv('warrantyDays')}>${err('warrantyDays')}</label>
          <label class="hs-grid-field"><span>تحويل تلقائي للفني بعد (ساعة) من إكمال الشغل</span><input type="number" name="autoReleaseHours" min="1" max="720" value="${esc(c.autoReleaseHours)}" ${edit ? '' : 'disabled'}${inv('autoReleaseHours')}>${err('autoReleaseHours')}</label>
          <label class="hs-grid-field"><span>رسوم بوابة الدفع (٪) — المنصة بتتحملها</span><input type="number" name="gatewayRate" min="0" max="10" step="0.05" value="${esc(c.gatewayRate)}" ${edit ? '' : 'disabled'}${inv('gatewayRate')}>${err('gatewayRate')}</label>
          ${edit ? '<p><button type="submit" class="adm-btn adm-btn-p">حفظ إعدادات الدفع</button></p>' : ''}</form></section>
      <p role="status" aria-live="polite" class="ord-muted" data-pay-status>${esc(st.msg || '')}</p>`;
  }

  async function mount(host) {
    const st = { data: null, msg: '', errors: null };
    const paint = () => { host.innerHTML = st.data ? view(st.data, st) : `<div class="adm-state"><h2>تعذّر تحميل المدفوعات</h2><p>${esc(st.msg)}</p></div>`; };
    const load = async () => { const r = await get(); if (r.ok) st.data = r.data; else st.msg = errText(r); paint(); };
    const apply = (r, okMsg) => { if (r && r.ok) { st.data = r.data; st.msg = okMsg; st.errors = null; } else { st.msg = errText(r); st.errors = r && r.error && r.error.details; } paint(); };
    const ask = (q, danger) => (root.HSUiDialog ? root.HSUiDialog.confirm(q, { danger: !!danger }) : Promise.resolve(root.confirm ? root.confirm(q) : true));
    const askText = (q, o) => (root.HSUiDialog ? root.HSUiDialog.prompt(q, o || {}) : Promise.resolve(root.prompt ? root.prompt(q) : ''));
    host.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.payPayout) {
        const g = (st.data.payouts || []).find((x) => x.providerId === b.dataset.payPayout); if (!g) return;
        const ref = await askText(`اكتب رقم التحويل لـ ${g.name || 'الفني'} (${money(g.total)}):`, { placeholder: 'رقم العملية من المحفظة أو البنك' });
        if (ref == null) return;
        if (!String(ref).trim()) { st.msg = 'اكتب رقم التحويل علشان يتسجّل.'; paint(); return; }
        b.disabled = true; apply(await send('POST', '/admin/payments/payouts', { providerId: g.providerId, ids: g.items.map((i) => i.id), ref: String(ref).trim() }), 'اتسجّل التحويل ووصل للفني إشعار.');
        return;
      }
      if (b.dataset.payRelease) { if (!(await ask('تحويل المبلغ المحجوز للفني؟ (بيدخل التحويل الأسبوعي)'))) return; b.disabled = true; apply(await send('POST', '/admin/payments/' + encodeURIComponent(b.dataset.payRelease) + '/release', {}), 'المبلغ اتحوّل لرصيد الفني.'); return; }
      if (b.dataset.payRefund) {
        const full = b.dataset.done !== '1';
        const v = full ? ((await ask(`رجوع المبلغ كله (${money(b.dataset.paid)}) للعميل؟ قبل ما الشغل يخلص الاسترجاع بيكون كامل.`, true)) ? '' : null)
          : await askText(`المبلغ اللي يرجع للعميل (فاضي = كله ${money(b.dataset.paid)}):`, { danger: true });
        if (v == null) return;
        const s = String(v).trim(); if (s !== '' && !(+s > 0)) { st.msg = 'اكتب مبلغ صحيح أو سيبه فاضي.'; paint(); return; }
        b.disabled = true; apply(await send('POST', '/admin/payments/' + encodeURIComponent(b.dataset.payRefund) + '/refund', s === '' ? {} : { amount: +s }), 'الاسترجاع اتسجّل وهيتبعت للعميل تلقائيًا.');
      }
    });
    host.addEventListener('submit', async (e) => {
      const f = e.target.closest('[data-pay-settings]'); if (!f) return; e.preventDefault();
      apply(await send('PATCH', '/admin/payments/settings', { online: f.online.checked, warrantyDays: f.warrantyDays.value, autoReleaseHours: f.autoReleaseHours.value, gatewayRate: f.gatewayRate.value }), 'إعدادات الدفع اتحفظت.');
      const bad = st.errors && Object.keys(st.errors)[0]; if (bad && f.isConnected !== false) { const n = host.querySelector(`[name="${bad}"]`); if (n && n.focus) n.focus(); }
    });
    host.innerHTML = '<div aria-busy="true" class="sk sk-bar"></div>';
    await load();
    return host;
  }

  const api = { mount, banner, view };
  root.HSPaymentsAdmin = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
