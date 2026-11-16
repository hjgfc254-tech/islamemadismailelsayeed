/**
 * MODULE: marketing-editor (HSMarketingEditor) — Admin Center editor for promo codes, the invite-a-friend reward and
 * maintenance packages (GET/PATCH /admin/marketing, stored in system settings).
 * Money rule shown to the admin: a discount is paid from the platform fee and never exceeds it, so provider earnings
 * never change; it is computed once when the job is completed.
 * STATUS: IMPLEMENTED (works on the local demo store and on the Firebase backend through HSApiClient)
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = () => root.HSApiClient;
  const errText = (r) => (r && r.error && (r.error.details ? Object.values(r.error.details)[0] : r.error.message)) || 'تعذّر الحفظ';
  const cats = () => (root.CAT && root.CAT.categories ? root.CAT.categories() : []);

  async function mount(host) {
    if (!host || !C()) return;
    const res = await C().request('GET', '/admin/marketing');
    if (!res.ok) { host.innerHTML = `<p>${esc(errText(res))}</p>`; return; }
    const work = { promos: (res.data.promos || []).map((p) => ({ ...p })), referral: { on: false, reward: 0, ...(res.data.referral || {}) }, packages: (res.data.packages || []).map((p) => ({ ...p })) };
    const status = (msg) => { const s = host.querySelector('[data-mk-status]'); if (s) s.textContent = msg || ''; };
    const catOpts = (v) => `<option value="">كل الأقسام</option>${cats().map((c) => `<option value="${esc(c.id)}" ${c.id === v ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}`;

    function render() {
      host.innerHTML = `<section class="adm-live-panel mk" aria-label="العروض والخصومات">
        <h3>العروض والخصومات والباقات</h3>
        <p class="ord-muted">الخصم بيتحسب لما الخدمة تخلص، وبيتخصم من عمولة المنصة وبحد أقصى قيمتها — مبلغ الفني ما بيتغيرش.</p>
        <p data-mk-status role="status" aria-live="polite" class="ord-muted"></p>
        <fieldset class="ord-dlg-in"><legend>أكواد الخصم</legend>
          ${work.promos.length ? work.promos.map((p, i) => `<div class="mk-row" data-i="${i}">
            <label class="hs-grid-field"><span>الكود</span><input data-mk-promo="code" value="${esc(p.code)}" maxlength="16" dir="ltr" required></label>
            <label class="hs-grid-field"><span>النوع</span><select data-mk-promo="kind"><option value="percent" ${p.kind === 'percent' ? 'selected' : ''}>نسبة ٪</option><option value="amount" ${p.kind !== 'percent' ? 'selected' : ''}>مبلغ ج.م</option></select></label>
            <label class="hs-grid-field"><span>القيمة</span><input type="number" data-mk-promo="value" min="1" value="${esc(p.value)}"></label>
            <label class="hs-grid-field"><span>أقصى خصم (ج.م، 0 = بدون)</span><input type="number" data-mk-promo="maxOff" min="0" value="${esc(p.maxOff || 0)}"></label>
            <label class="hs-grid-field"><span>عدد الاستخدامات (0 = مفتوح)</span><input type="number" data-mk-promo="uses" min="0" value="${esc(p.uses || 0)}"></label>
            <label class="hs-grid-field"><span>ينتهي يوم</span><input type="date" data-mk-promo="until" value="${esc(p.until || '')}"></label>
            <label class="hs-grid-field"><span>لأول طلب بس</span><input type="checkbox" data-mk-promo="firstOnly" ${p.firstOnly ? 'checked' : ''}></label>
            <label class="hs-grid-field"><span>شغّال</span><input type="checkbox" data-mk-promo="active" ${p.active !== false ? 'checked' : ''}></label>
            <p class="ord-muted">اتستخدم ${esc(p.used || 0)} مرة</p>
            <button type="button" class="adm-btn" data-mk-del-promo="${i}">حذف الكود</button></div>`).join('') : '<p class="ord-muted">مفيش أكواد لسه.</p>'}
          ${work.promos.length < 50 ? '<button type="button" class="adm-btn" data-mk-add-promo>إضافة كود</button>' : ''}
        </fieldset>
        <fieldset class="ord-dlg-in"><legend>ادعُ صاحبك</legend>
          <label class="hs-grid-field"><span>تشغيل برنامج الدعوة</span><input type="checkbox" data-mk-ref="on" ${work.referral.on ? 'checked' : ''}></label>
          <label class="hs-grid-field"><span>المكافأة لكل طرف (ج.م)</span><input type="number" data-mk-ref="reward" min="0" max="1000" value="${esc(work.referral.reward)}"></label>
          <p class="ord-muted">صاحب الدعوة بياخد رصيد لما صاحبه يخلّص أول طلب، والصاحب بياخد نفس القيمة خصم على أول طلب.</p>
        </fieldset>
        <fieldset class="ord-dlg-in"><legend>باقات الصيانة الدورية</legend>
          ${work.packages.length ? work.packages.map((p, i) => `<div class="mk-row" data-i="${i}">
            <label class="hs-grid-field"><span>اسم الباقة</span><input data-mk-pkg="name" value="${esc(p.name)}" maxlength="60" required></label>
            <label class="hs-grid-field"><span>القسم</span><select data-mk-pkg="cat">${catOpts(p.cat)}</select></label>
            <label class="hs-grid-field"><span>عدد الزيارات</span><input type="number" data-mk-pkg="visits" min="1" max="24" value="${esc(p.visits || 1)}"></label>
            <label class="hs-grid-field"><span>السعر (ج.م، 0 = يتحدد مع الفني)</span><input type="number" data-mk-pkg="price" min="0" value="${esc(p.price || 0)}"></label>
            <label class="hs-grid-field"><span>وصف قصير</span><input data-mk-pkg="desc" value="${esc(p.desc || '')}" maxlength="200"></label>
            <label class="hs-grid-field"><span>ظاهرة للعملاء</span><input type="checkbox" data-mk-pkg="active" ${p.active !== false ? 'checked' : ''}></label>
            <button type="button" class="adm-btn" data-mk-del-pkg="${i}">حذف الباقة</button></div>`).join('') : '<p class="ord-muted">مفيش باقات لسه.</p>'}
          ${work.packages.length < 12 ? '<button type="button" class="adm-btn" data-mk-add-pkg>إضافة باقة</button>' : ''}
        </fieldset>
        <p><button type="button" class="adm-btn adm-btn-p" data-mk-save>حفظ ونشر</button></p>
      </section>`;
    }
    const row = (t) => +t.closest('[data-i]').dataset.i;
    const val = (t) => (t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) : t.value);
    const onEdit = (e) => {
      const t = e.target;
      if (t.dataset.mkPromo) work.promos[row(t)][t.dataset.mkPromo] = t.dataset.mkPromo === 'code' ? String(t.value).toUpperCase() : val(t);
      if (t.dataset.mkPkg) work.packages[row(t)][t.dataset.mkPkg] = val(t);
      if (t.dataset.mkRef) work.referral[t.dataset.mkRef] = val(t);
    };
    host.addEventListener('input', onEdit);
    host.addEventListener('change', onEdit);
    host.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.mkAddPromo !== undefined) { work.promos.push({ code: '', kind: 'percent', value: 10, maxOff: 0, uses: 0, used: 0, firstOnly: false, until: '', active: true }); render(); }
      else if (d.mkDelPromo !== undefined) { work.promos.splice(+d.mkDelPromo, 1); render(); }
      else if (d.mkAddPkg !== undefined) { work.packages.push({ id: 'pk' + Date.now().toString(36).slice(-6), name: '', cat: '', visits: 2, price: 0, desc: '', active: true }); render(); }
      else if (d.mkDelPkg !== undefined) { work.packages.splice(+d.mkDelPkg, 1); render(); }
      else if (d.mkSave !== undefined) {
        b.disabled = true; status('جارٍ الحفظ…');
        const r = await C().request('PATCH', '/admin/marketing', { promos: work.promos, referral: work.referral, packages: work.packages });
        b.disabled = false;
        if (r.ok) { work.promos = r.data.promos.map((p) => ({ ...p })); work.packages = r.data.packages.map((p) => ({ ...p })); render(); status('تم الحفظ — التغييرات ظاهرة للعملاء.'); }
        else status(errText(r));
      }
    });
    render();
  }

  const api = Object.freeze({ mount });
  root.HSMarketingEditor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
