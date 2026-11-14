/* ═══════════════════════════════════════════════════════════════
   هنصلحلك — إدارة العناوين (Addresses) — V7 — ملف جديد
   ───────────────────────────────────────────────────────────────
   الغرض:
   • شاشة عناوين العميل: إضافة/تعديل/حذف/تعيين افتراضي.
   • تستخدم MP.addressesFor/addAddress/updateAddress/removeAddress/defaultAddress.
   • تظهر ضمن تبويب "حسابي" (screens.account) بضغطة زر.
   • تعيد استخدام نفس نماذج wizard.js (gov/area/addr/detail/type/label).
   • تقبل prefill من التدفقات الأخرى (مثلاً: تعديل عنوان من wizard).

   الواجهة العامة:
   • Addresses.open()          — فتح شاشة العناوين
   • Addresses.openForm(id?)   — فتح نموذج إضافة/تعديل (id فارغ = جديد)
   • Addresses.renderScreen()  — HTML الشاشة (يُستدعى من screens.addresses)

   ملاحظات:
   • لا تُخزّن الإحداثيات (geo) في العنوان المحفوظ؛ تُحدَّد عند الطلب فقط.
   • لا تحتاج مصادقة (تستخدم me() من market-ui).
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const Addresses = (() => {
  const _esc = (typeof esc === 'function') ? esc : (s => String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));
  const safeIc = (n, cls) => (typeof ic === 'function') ? ic(n, cls) : '';

  const TYPES = { home:'منزل', work:'عمل', other:'أخرى' };
  const typeLabel = t => TYPES[t] || 'منزل';

  /* قائمة أنواع العناوين */
  const typeChips = (current) => Object.entries(TYPES).map(([k, l]) =>
    `<button type="button" class="chip ${current === k ? 'on' : ''}" data-addr-type="${k}">${_esc(l)}</button>`
  ).join('');

  /* بطاقة عنوان */
  const addressCard = (a) => {
    const addr = [a.addr, a.detail].filter(Boolean).join(' — ');
    return `<div class="card2 glass neon addr-card">
      <div class="top">
        <b>${safeIc('pin')} ${_esc(a.label || typeLabel(a.type))}</b>
        ${a.default ? `<span class="tag">افتراضي</span>` : ''}
      </div>
      <small>${_esc(a.gov)} — ${_esc(a.area)}<br>${_esc(addr)}</small>
      <div class="acts">
        <button data-addr-edit="${_esc(a.id)}">${safeIc('edit')} تعديل</button>
        ${!a.default ? `<button data-addr-default="${_esc(a.id)}">${safeIc('check')} افتراضي</button>` : ''}
        <button class="bad" data-addr-remove="${_esc(a.id)}">${safeIc('trash')} حذف</button>
      </div>
    </div>`;
  };

  /* الشاشة الرئيسية */
  const renderScreen = () => {
    const u = (typeof me === 'function') ? me() : null;
    if (!u) {
      return `<div class="screen">${typeof head === 'function' ? head('عناويني', true) : ''}
        <div class="empty">${safeIc('user')}<p>سجّل بياناتك أولًا لتتمكن من إضافة عناوين</p></div>
        <button class="cta" data-go="account">${safeIc('user')} تسجيل الدخول</button>
      </div>`;
    }
    const list = MP.addressesFor(u.id);
    return `<div class="screen">${typeof head === 'function' ? head('عناويني', true) : ''}
      <div class="demo-banner">${safeIc('info')}<span>عناوينك محفوظة على جهازك فقط في الوضع التجريبي.</span></div>
      <button class="cta" data-addr-new>${safeIc('plus')} إضافة عنوان جديد</button>
      ${list.length
        ? `<h2 class="sec-title">${safeIc('pin')}عناوينك (${list.length})</h2><div class="plist">${list.map(addressCard).join('')}</div>`
        : `<div class="empty">${safeIc('pin')}<p>لا توجد عناوين محفوظة<br><small>أضف عنوانًا لتسريع الطلبات القادمة</small></p></div>`}
    </div>`;
  };

  /* نموذج إضافة/تعديل */
  const openForm = (id) => {
    const u = (typeof me === 'function') ? me() : null;
    if (!u) { toast('سجّل بياناتك أولًا'); return; }
    const a = id ? MP.get('addresses', id) : null;
    const v = a || {label:'', gov:'', area:'', addr:'', detail:'', type:'home', default:false};
    if (typeof sheet !== 'function') return;
    sheet(`<h4>${safeIc('pin')} ${a ? 'تعديل عنوان' : 'إضافة عنوان'}</h4>
      <form class="form" id="addrForm" data-id="${a ? a.id : ''}">
        <div><label for="addr-gov">المحافظة *</label>
          <select id="addr-gov" required><option value="">اختر المحافظة</option>
            ${(MP.GOVS || []).map(g => `<option ${g === v.gov ? 'selected' : ''}>${_esc(g)}</option>`).join('')}
          </select>
        </div>
        <div><label for="addr-area">المنطقة *</label>
          <input id="addr-area" list="addr-areas" value="${_esc(v.area)}" placeholder="المنطقة / الحي">
          <datalist id="addr-areas">${((MP.AREA_HINTS && MP.AREA_HINTS[v.gov]) || []).map(x => `<option value="${_esc(x)}">`).join('')}</datalist>
        </div>
        <div><label for="addr-addr">الشارع ورقم العقار *</label>
          <input id="addr-addr" value="${_esc(v.addr)}" placeholder="الشارع، رقم العمارة">
        </div>
        <div><label for="addr-detail">تفاصيل إضافية</label>
          <input id="addr-detail" value="${_esc(v.detail)}" placeholder="الدور، الشقة، علامة مميزة">
        </div>
        <div><span class="lbl-like" id="addr-type-lbl">نوع العنوان</span>
          <div class="chips" role="group" aria-labelledby="addr-type-lbl">${typeChips(v.type)}</div>
        </div>
        <div><label for="addr-label">اسم مختصر (اختياري)</label>
          <input id="addr-label" value="${_esc(v.label)}" placeholder="مثل: البيت، المكتب">
        </div>
        <label class="hint" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="addr-default" ${v.default ? 'checked' : ''} style="width:auto"> اجعله العنوان الافتراضي</label>
        <button class="cta" type="submit">${safeIc('check')} ${a ? 'حفظ التعديلات' : 'إضافة العنوان'}</button>
      </form>
    `);
    /* localStorage مؤقت للنوع */
    window._addrType = v.type;
  };

  /* ربط الأحداث */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-addr-new],[data-addr-edit],[data-addr-remove],[data-addr-default],[data-addr-type]');
    if (!t) return;
    const d = t.dataset;
    if (d.addrNew !== undefined) return openForm();
    if (d.addrEdit) return openForm(d.addrEdit);
    if (d.addrRemove) {
      /* Accessible confirmation sheet (market-ui askSheet) instead of native confirm(); removal goes through customer-api. */
      askSheet({ id: d.addrRemove, kind: 'addrRemove', title: 'حذف العنوان', text: 'سيُحذف هذا العنوان من عناويني المحفوظة.', reasonLabel: '', confirmLabel: 'تأكيد الحذف' });
      return;
    }
    if (d.addrDefault) {
      apiCall('addr-def:' + d.addrDefault, t, () => HSCustomerApi.updateAddress(d.addrDefault, {default: true}), () => { toast('تم تعيينه كعنوان افتراضي'); if (typeof show === 'function') show('addresses'); });
      return;
    }
    if (d.addrType) {
      window._addrType = d.addrType;
      document.querySelectorAll('#addrForm [data-addr-type]').forEach(b => b.classList.toggle('on', b.dataset.addrType === d.addrType));
      return;
    }
  });

  /* تحديث قائمة المناطق عند تغيير المحافظة */
  document.addEventListener('change', (e) => {
    if (e.target.id === 'addr-gov') {
      const dl = document.getElementById('addr-areas');
      if (dl) {
        const hints = (MP.AREA_HINTS && MP.AREA_HINTS[e.target.value]) || [];
        dl.innerHTML = hints.map(x => `<option value="${_esc(x)}">`).join('');
      }
    }
  });

  /* حفظ النموذج */
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'addrForm') return;
    e.preventDefault();
    const f = e.target;
    const u = (typeof me === 'function') ? me() : null;
    if (!u) return toast('سجّل بياناتك أولًا');
    const gov = (document.getElementById('addr-gov') || {}).value || '';
    const area = ((document.getElementById('addr-area') || {}).value || '').trim();
    const addr = ((document.getElementById('addr-addr') || {}).value || '').trim();
    const detail = ((document.getElementById('addr-detail') || {}).value || '').trim();
    const label = ((document.getElementById('addr-label') || {}).value || '').trim();
    const isDefault = !!(document.getElementById('addr-default') || {}).checked;
    if (!gov) return toast('اختر المحافظة');
    if (!area) return toast('اكتب المنطقة');
    if (addr.length < 5) return toast('اكتب العنوان بالتفصيل');
    const payload = { gov, area, addr, detail, label, type: window._addrType || 'home', default: isDefault };
    const editing = !!f.dataset.id;
    apiCall('addr-save', f.querySelector('[type=submit]'), () => editing ? HSCustomerApi.updateAddress(f.dataset.id, payload) : HSCustomerApi.addAddress(payload), () => {
      toast(editing ? 'تم حفظ التعديلات' : 'تم إضافة العنوان');
      if (typeof closeSheet === 'function') closeSheet();
      if (typeof show === 'function') show('addresses');
    });
  });

  return { openForm, renderScreen };
})();

/* شاشة "addresses" — تُستدعى من app.js عبر go('addresses') */
if (typeof screens !== 'undefined' && screens) {
  screens.addresses = () => Addresses.renderScreen();
}