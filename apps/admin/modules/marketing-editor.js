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
  /* CAT is a top-level const of local-catalog.js: a global binding, NOT a property of window — read it by name */
  const catalog = () => root.CAT || (typeof CAT !== 'undefined' ? CAT : null);
  const cats = () => { const c = catalog(); return c && c.categories ? c.categories() : []; };

  async function mount(host) {
    if (!host || !C()) return;
    const res = await C().request('GET', '/admin/marketing');
    if (!res.ok) { host.innerHTML = `<p>${esc(errText(res))}</p>`; return; }
    const work = { promos: (res.data.promos || []).map((p) => ({ ...p })), referral: { on: false, reward: 0, ...(res.data.referral || {}) }, packages: (res.data.packages || []).map((p) => ({ ...p })),
      warranty: { default: 30, cats: {}, items: {}, ...(res.data.warranty || {}) }, arrivalPin: !!res.data.arrivalPin,
      bidding: !!res.data.bidding, bidWindowMin: +res.data.bidWindowMin || 15,
      cancelFee: res.data.cancelFee != null ? +res.data.cancelFee : 50, visitFee: +res.data.visitFee || 0, inspectionRate: +res.data.inspectionRate || 0,
      inspectionCap: { default: 0, ...(res.data.inspectionCap || {}) }, priceCaps: { cats: {}, items: {}, problems: {}, ...(res.data.priceCaps || {}) },
      inspection: { cats: {}, items: {}, problems: {}, ...(res.data.inspection || {}) },
      bonus: JSON.parse(JSON.stringify(res.data.bonus || { on: false, windowDays: 30, tiers: [], weekly: { on: false, target: 0, amount: 0 } })) };
    work.bonus.weekly = { on: false, target: 0, amount: 0, ...(work.bonus.weekly || {}) }; work.bonus.tiers = work.bonus.tiers || [];
    work.inspectionCap.cats = { ...(work.inspectionCap.cats || {}) }; work.priceCaps.cats = { ...(work.priceCaps.cats || {}) }; work.inspection.cats = { ...(work.inspection.cats || {}) };
    work.warranty.cats = { ...(work.warranty.cats || {}) }; work.warranty.items = { ...(work.warranty.items || {}) };
    const items = (cat) => { const c = catalog(); return c && c.items ? c.items(cat) : []; };
    const wVal = (v) => (v === undefined || v === null ? '' : esc(v));
    const status = (msg) => { const s = host.querySelector('[data-mk-status]'); if (s) s.textContent = msg || ''; };
    const catOpts = (v) => `<option value="">كل الأقسام</option>${cats().map((c) => `<option value="${esc(c.id)}" ${c.id === v ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}`;

    function render() {
      host.innerHTML = `<section class="adm-live-panel mk" aria-label="العروض والخصومات">
        <h3>الضمان والعروض والباقات</h3>
        <p class="ord-muted">الخصم بيتحسب لما الخدمة تخلص، وبيتخصم من عمولة المنصة وبحد أقصى قيمتها — مبلغ الفني ما بيتغيرش.</p>
        <p data-mk-status role="status" aria-live="polite" class="ord-muted"></p>
        <fieldset class="ord-dlg-in"><legend>الضمان على الخدمات</legend>
          <p class="ord-muted">عدد أيام الضمان بعد ما الخدمة تخلص. الخدمة بتاخد رقمها هي، ولو فاضي بتاخد رقم القسم، ولو فاضي بتاخد الافتراضي. صفر يعني مفيش ضمان.</p>
          <label class="hs-grid-field"><span>الضمان الافتراضي (يوم)</span><input type="number" min="0" max="365" data-mk-w-default value="${esc(work.warranty.default || 0)}"></label>
          <div class="mk-warranty">${cats().map((c) => `<details class="mk-wcat"><summary><span>${esc(c.name)}</span><input type="number" min="0" max="365" placeholder="الافتراضي" aria-label="أيام ضمان ${esc(c.name)}" data-mk-w-cat="${esc(c.id)}" value="${wVal(work.warranty.cats[c.id])}"></summary>
            <div class="mk-witems">${items(c.id).map((it) => `<label><span>${esc(it.name)}</span><input type="number" min="0" max="365" placeholder="زي القسم" data-mk-w-item="${esc(it.id)}" value="${wVal(work.warranty.items[it.id])}"></label>`).join('')}</div></details>`).join('')}</div>
        </fieldset>
        <fieldset class="ord-dlg-in"><legend>عروض الفنيين والمعاينة</legend>
          <label class="hs-grid-field"><span>الطلب يروح لأقرب 3 فنيين وكل واحد يبعت سعره والعميل يختار</span><input type="checkbox" data-mk-bid ${work.bidding ? 'checked' : ''}></label>
          <label class="hs-grid-field"><span>مهلة العروض (دقيقة)</span><input type="number" min="5" max="120" data-mk-bidwin value="${esc(work.bidWindowMin)}"></label>
          <label class="hs-grid-field"><span>أقصى سعر معاينة افتراضي (ج.م) — فاضي = بدون حد</span><input type="number" min="0" placeholder="بدون حد" data-mk-icap-default value="${work.inspectionCap.default ? esc(work.inspectionCap.default) : ''}"></label>
          <label class="hs-grid-field"><span>عمولة المنصة على المعاينة (٪)</span><input type="number" min="0" max="50" data-mk-num="inspectionRate" value="${esc(work.inspectionRate)}"></label>
          <label class="hs-grid-field"><span>رسوم الإلغاء بعد ما الفني يتحرك (ج.م — بتروح للفني)</span><input type="number" min="0" data-mk-num="cancelFee" value="${esc(work.cancelFee)}"></label>
          <label class="hs-grid-field"><span>رسوم الزيارة لو العميل رفض السعر الجديد (ج.م) — صفر = بدون</span><input type="number" min="0" data-mk-num="visitFee" value="${esc(work.visitFee)}"></label>
          <p class="ord-muted">لكل قسم: «معاينة الأول» يخلي كل طلباته تبدأ بمعاينة (المشاكل غير المعروفة أو «أخرى» دايمًا معاينة). أقصى سعر للإصلاح: السيرفر بيرفض أي عرض أعلى منه. فاضي = من غير حد.</p>
          <div class="mk-warranty">${cats().map((c) => `<div class="mk-row"><b>${esc(c.name)}</b>
            <label class="hs-grid-field"><span>معاينة الأول</span><input type="checkbox" data-mk-insp-cat="${esc(c.id)}" ${work.inspection.cats[c.id] ? 'checked' : ''}></label>
            <label class="hs-grid-field"><span>أقصى معاينة</span><input type="number" min="0" placeholder="الافتراضي" data-mk-icap-cat="${esc(c.id)}" value="${wVal(work.inspectionCap.cats[c.id])}"></label>
            <label class="hs-grid-field"><span>أقصى سعر إصلاح</span><input type="number" min="0" placeholder="بدون حد" data-mk-pcap-cat="${esc(c.id)}" value="${wVal(work.priceCaps.cats[c.id])}"></label></div>`).join('')}</div>
        </fieldset>
        <fieldset class="ord-dlg-in"><legend>بونص الفنيين</legend>
          <label class="hs-grid-field"><span>تشغيل برنامج البونص</span><input type="checkbox" data-mk-bonus="on" ${work.bonus.on ? 'checked' : ''}></label>
          <label class="hs-grid-field"><span>المستويات بتتحسب على آخر (يوم)</span><input type="number" min="7" max="90" data-mk-bonus="windowDays" value="${esc(work.bonus.windowDays || 30)}"></label>
          <p class="ord-muted">الخدمة بتتحسب لما العميل يأكد إنه دفع، ولعملاء مختلفين — وأي خلاف على الدفع بيتحسب «إنذار». المستوى الأعلى بياخد الطلبات الأول في جولة العروض، ونسبة المنصة على عروضه بتقل بالتخفيض اللي تحدده (العميل بيدفع أقل، ومبلغ الفني زي ما هو).</p>
          ${work.bonus.tiers.map((tr, i) => `<div class="mk-row" data-i="${i}">
            <label class="hs-grid-field"><span>اسم المستوى</span><input data-mk-tier="name" maxlength="20" value="${esc(tr.name)}" required></label>
            <label class="hs-grid-field"><span>عملاء على الأقل</span><input type="number" min="0" data-mk-tier="minJobs" value="${esc(tr.minJobs)}"></label>
            <label class="hs-grid-field"><span>أقل تقييم</span><input type="number" min="0" max="5" step="0.1" data-mk-tier="minRating" value="${esc(tr.minRating || '')}"></label>
            <label class="hs-grid-field"><span>أقصى إنذارات</span><input type="number" min="0" data-mk-tier="maxStrikes" value="${tr.maxStrikes === 99 || tr.maxStrikes == null ? '' : esc(tr.maxStrikes)}" placeholder="بدون حد"></label>
            <label class="hs-grid-field"><span>تخفيض نسبة المنصة (٪)</span><input type="number" min="0" max="50" data-mk-tier="rateOff" value="${esc(tr.rateOff || 0)}"></label>
            <button type="button" class="adm-btn adm-btn-d" data-mk-del-tier="${i}">حذف</button></div>`).join('')}
          ${work.bonus.tiers.length < 4 ? '<p><button type="button" class="adm-btn" data-mk-add-tier>+ مستوى</button></p>' : ''}
          <label class="hs-grid-field"><span>بونص أسبوعي نقدي</span><input type="checkbox" data-mk-weekly="on" ${work.bonus.weekly.on ? 'checked' : ''}></label>
          <label class="hs-grid-field"><span>عدد العملاء في الأسبوع</span><input type="number" min="0" data-mk-weekly="target" value="${esc(work.bonus.weekly.target || '')}"></label>
          <label class="hs-grid-field"><span>مبلغ البونص (ج.م)</span><input type="number" min="0" data-mk-weekly="amount" value="${esc(work.bonus.weekly.amount || '')}"></label>
          <p class="ord-muted">الأسبوع بيبدأ السبت. البونص بيتسجّل مستحق للفني مرة واحدة في الأسبوع، وبيظهر في التسويات.</p>
        </fieldset>
        <fieldset class="ord-dlg-in"><legend>كود الوصول</legend>
          <label class="hs-grid-field"><span>الفني لازم يكتب كود من العميل عشان يسجّل «وصلت»</span><input type="checkbox" data-mk-pin ${work.arrivalPin ? 'checked' : ''}></label>
          <p class="ord-muted">العميل بيشوف كود من 4 أرقام في صفحة طلبه بعد القبول. بيأكد إن اللي على الباب هو الفني الصح، وإن الفني وصل فعلًا.</p>
        </fieldset>
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
      if (t.hasAttribute && t.hasAttribute('data-mk-w-default')) work.warranty.default = Number(t.value) || 0;
      if (t.dataset.mkWCat) { if (t.value === '') delete work.warranty.cats[t.dataset.mkWCat]; else work.warranty.cats[t.dataset.mkWCat] = Number(t.value); }
      if (t.dataset.mkWItem) { if (t.value === '') delete work.warranty.items[t.dataset.mkWItem]; else work.warranty.items[t.dataset.mkWItem] = Number(t.value); }
      if (t.hasAttribute && t.hasAttribute('data-mk-pin')) work.arrivalPin = t.checked;
      if (t.hasAttribute && t.hasAttribute('data-mk-bid')) work.bidding = t.checked;
      if (t.dataset && t.dataset.mkNum) work[t.dataset.mkNum] = +t.value || 0;
      if (t.dataset && t.dataset.mkBonus) work.bonus[t.dataset.mkBonus] = t.dataset.mkBonus === 'on' ? t.checked : (+t.value || 0);
      if (t.dataset && t.dataset.mkWeekly) work.bonus.weekly[t.dataset.mkWeekly] = t.dataset.mkWeekly === 'on' ? t.checked : (+t.value || 0);
      if (t.dataset && t.dataset.mkTier) { const tr = work.bonus.tiers[row(t)]; const k = t.dataset.mkTier; tr[k] = k === 'name' ? t.value : (t.value === '' ? (k === 'maxStrikes' ? '' : 0) : +t.value); }
      if (t.hasAttribute && t.hasAttribute('data-mk-bidwin')) work.bidWindowMin = +t.value || 15;
      if (t.hasAttribute && t.hasAttribute('data-mk-icap-default')) work.inspectionCap.default = +t.value || 0;
      if (t.dataset && t.dataset.mkInspCat) { if (t.checked) work.inspection.cats[t.dataset.mkInspCat] = true; else delete work.inspection.cats[t.dataset.mkInspCat]; }
      if (t.dataset && t.dataset.mkIcapCat) { if (t.value === '') delete work.inspectionCap.cats[t.dataset.mkIcapCat]; else work.inspectionCap.cats[t.dataset.mkIcapCat] = +t.value; }
      if (t.dataset && t.dataset.mkPcapCat) { if (t.value === '') delete work.priceCaps.cats[t.dataset.mkPcapCat]; else work.priceCaps.cats[t.dataset.mkPcapCat] = +t.value; }
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
      else if (d.mkAddTier !== undefined) { work.bonus.tiers.push({ id: 't' + Date.now().toString(36).slice(-5), name: '', minJobs: 0, minRating: 0, maxStrikes: '', rateOff: 0 }); render(); }
      else if (d.mkDelTier !== undefined) { work.bonus.tiers.splice(+d.mkDelTier, 1); render(); }
      else if (d.mkSave !== undefined) {
        b.disabled = true; status('جارٍ الحفظ…');
        const r = await C().request('PATCH', '/admin/marketing', { body: { promos: work.promos, referral: work.referral, packages: work.packages, warranty: work.warranty, arrivalPin: work.arrivalPin,
        bidding: work.bidding, bidWindowMin: work.bidWindowMin, cancelFee: work.cancelFee, visitFee: work.visitFee, inspectionRate: work.inspectionRate, inspectionCap: work.inspectionCap, priceCaps: work.priceCaps, inspection: work.inspection, bonus: work.bonus } });
        b.disabled = false;
        if (r.ok) { work.promos = r.data.promos.map((p) => ({ ...p })); work.packages = r.data.packages.map((p) => ({ ...p })); work.warranty = { ...r.data.warranty, cats: { ...r.data.warranty.cats }, items: { ...r.data.warranty.items } }; work.arrivalPin = !!r.data.arrivalPin; if (r.data.bonus) work.bonus = JSON.parse(JSON.stringify(r.data.bonus)); render(); status('تم الحفظ — التغييرات ظاهرة للعملاء.'); }
        else status(errText(r));
      }
    });
    render();
  }

  const api = Object.freeze({ mount });
  root.HSMarketingEditor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
