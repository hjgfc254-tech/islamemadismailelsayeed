/**
 * MODULE: marketplace.page — Admin «تشغيل السوق (بيانات حية)»
 * RESPONSIBILITY: operate the SHARED marketplace store (`MP`, localStorage `hs_mp_db`) that the Customer and Provider apps use:
 *   - provider onboarding review (approve / reject registrations), suspend / reactivate, special commission rate;
 *   - service requests: manual assignment (candidates first), auto-match, cancel before work starts, current quote;
 *   - customers: suspend / reactivate; complaints filed from the Customer app: resolve with a note;
 *   - commission settings (default + per category) and collection status of transactions (free services shown as no charge);
 *   - restore the demo marketplace data.
 * Migrated 2026-11-14 from the legacy Admin console that lived inside apps/provider/legacy/portal-compat.js (removed).
 * Actions are gated per tab by the presentation-only permission guard (`<module>.decide` / `.edit`). LOCAL DEMO ONLY — no server.
 * Depends on: HSAdminShell, MP (services/local-market-store.js), HSAdminSession, HSAdminPermissionGuard, HSA11yTabs (optional).
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mp = () => (typeof MP !== 'undefined' ? MP : null);   /* top-level const in local-market-store.js (global lexical binding) */
  const money = (n) => { try { return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(+n || 0) + ' ج.م'; } catch (e) { return (+n || 0) + ' ج.م'; } };
  const TABS = [['providers', 'مقدمو الخدمة'], ['orders', 'الطلبات'], ['customers', 'العملاء'], ['complaints', 'الشكاوى'], ['commissions', 'العمولات والتحصيل']];
  const PSTATUS = { pending: 'قيد المراجعة', approved: 'مقبول', suspended: 'معلّق', rejected: 'مرفوض' };
  const COLL = { pending: 'لم تُحصَّل', collected: 'تم التحصيل', settled: 'تمت التسوية', none: 'بلا مقابل (خدمة مجانية)' };
  const CANCELLABLE = ['received', 'searching', 'sent', 'accepted', 'scheduled', 'enroute', 'arrived'];

  /* Which actions the signed-in demo employee may perform (presentation only). Without the admin runtime (tests), allow. */
  const allowed = (module, action) => {
    const G = root.HSAdminPermissionGuard, S = root.HSAdminSession;
    if (!G || !S) return true;
    const emp = S.current();
    return !!emp && (module === 'commissions' ? true : G.can(emp, module, action));   /* commissions: outside the demo RBAC catalog */
  };
  const btn = (attrs, text, cls, ok) => `<button type="button" class="adm-btn ${cls || ''}" ${attrs}${ok === false ? ' disabled title="لا تملك صلاحية تنفيذ هذا الإجراء"' : ''}>${text}</button>`;

  /* ───── Pure view models (unit-tested) ───── */
  const pendingProviders = (db) => db.providers.filter((p) => p.status === 'pending');
  const summary = (db) => ({ pending: pendingProviders(db).length, providers: db.providers.length, unassigned: db.serviceRequests.filter((r) => ['received', 'searching'].includes(r.status)).length,
    requests: db.serviceRequests.length, openComplaints: (db.complaints || []).filter((k) => k.status !== 'resolved').length, uncollected: db.transactions.filter((t) => t.collection === 'pending').length });

  /* ───── Tab renderers ───── */
  function providersTab(M) {
    const db = M.db(), ok = allowed('providers', 'decide'), okEdit = allowed('providers', 'edit');
    const list = db.providers.slice().sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0));
    const row = (p) => {
      const acts = p.status === 'pending' ? btn(`data-mk="padmit" data-id="${esc(p.id)}"`, 'قبول التسجيل', 'adm-btn-p', ok) + btn(`data-mk="preject" data-id="${esc(p.id)}"`, 'رفض', 'adm-btn-d', ok)
        : p.status === 'approved' ? btn(`data-mk="psusp" data-id="${esc(p.id)}"`, 'تعليق', 'adm-btn-d', ok)
        : p.status === 'suspended' ? btn(`data-mk="psusp" data-id="${esc(p.id)}"`, 'إعادة تفعيل', 'adm-btn-p', ok)
        : btn(`data-mk="padmit" data-id="${esc(p.id)}"`, 'قبول بعد المراجعة', '', ok);
      return `<tr data-row="${esc(p.id)}"><th scope="row">${esc(p.name)}<br><small class="ord-muted">${esc(p.phone || '')}</small></th><td>${esc((p.cats || []).map((c) => M.catName(c)).join('، '))}</td><td>${esc((p.govs || []).join('، '))}</td>
        <td>${esc(PSTATUS[p.status] || p.status)}</td><td><label class="mk-rate">عمولة خاصة %<input type="number" min="0" max="100" step="0.5" value="${p.specialRate == null ? '' : esc(p.specialRate)}" data-mk-rate="${esc(p.id)}" ${okEdit ? '' : 'disabled'} aria-label="عمولة خاصة لـ ${esc(p.name)}"></label>${btn(`data-mk="prate" data-id="${esc(p.id)}"`, 'حفظ', '', okEdit)}</td><td class="mk-acts">${acts}</td></tr>`;
    };
    return `<p class="ord-muted">طلبات الانضمام من تطبيق مقدم الخدمة تظهر هنا بحالة «قيد المراجعة» ولا تستقبل طلبات حتى القبول.</p>
      <div class="rl-scroll" tabindex="0" role="region" aria-label="مقدمو الخدمة"><table class="rl-table"><caption>مقدمو الخدمة (${list.length}) — قيد المراجعة: ${pendingProviders(db).length}</caption>
      <thead><tr><th scope="col">مقدم الخدمة</th><th scope="col">التخصصات</th><th scope="col">المحافظات</th><th scope="col">الحالة</th><th scope="col">العمولة</th><th scope="col">إجراءات</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`;
  }

  function ordersTab(M) {
    const db = M.db(), ok = allowed('orders', 'decide');
    const list = db.serviceRequests.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    if (!list.length) return '<div class="adm-state is-empty"><h2>لا توجد طلبات بعد</h2><p>الطلبات التي ينشئها العملاء في تطبيق العميل تظهر هنا.</p></div>';
    const row = (r) => {
      const prov = M.providerOf(r.id) || (M.activeAssignment(r.id) && M.get('providers', M.activeAssignment(r.id).providerId));
      const q = M.currentQuote(r.id), assignable = ['received', 'searching'].includes(r.status);
      const cands = assignable ? M.candidates(r) : [], others = assignable ? db.providers.filter((p) => p.status === 'approved' && (p.cats || []).includes(r.cat) && !cands.includes(p)) : [];
      const assign = assignable ? `<label class="mk-rate">إسناد إلى<select data-mk-pick="${esc(r.id)}" ${ok ? '' : 'disabled'}><option value="">اختر مقدم خدمة</option>${cands.length ? `<optgroup label="مطابقون">${cands.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</optgroup>` : ''}${others.length ? `<optgroup label="خارج التطابق الكامل">${others.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.available ? '' : ' (غير متاح)'}</option>`).join('')}</optgroup>` : ''}</select></label>${btn(`data-mk="assign" data-id="${esc(r.id)}"`, 'إسناد', 'adm-btn-p', ok)}${btn(`data-mk="automatch" data-id="${esc(r.id)}"`, 'مطابقة تلقائية', '', ok)}` : '';
      const cancel = CANCELLABLE.includes(r.status) ? btn(`data-mk="cancel" data-id="${esc(r.id)}"`, 'إلغاء الطلب', 'adm-btn-d', ok) : '';
      const quote = q ? `${money(q.total)} — ${q.status === 'approved' ? 'مقبول' : q.status === 'rejected' ? 'مرفوض' : 'بانتظار العميل'}` : (r.freeService ? 'خدمة مجانية' : '—');
      return `<tr data-row="${esc(r.id)}"><th scope="row"><bdi dir="ltr">${esc(r.no)}</bdi><br><small class="ord-muted">${esc(r.serviceName)}</small></th><td>${esc(r.gov)} — ${esc(r.area)}</td>
        <td>${esc((typeof STATUS_LABEL !== 'undefined' && STATUS_LABEL[r.status]) || r.status)}</td><td>${esc(prov ? prov.name : '—')}</td><td>${esc(quote)}</td><td class="mk-acts">${assign}${cancel}</td></tr>`;
    };
    return `<div class="rl-scroll" tabindex="0" role="region" aria-label="الطلبات"><table class="rl-table"><caption>طلبات الخدمة (${list.length})</caption>
      <thead><tr><th scope="col">الطلب</th><th scope="col">المكان</th><th scope="col">الحالة</th><th scope="col">مقدم الخدمة</th><th scope="col">عرض السعر</th><th scope="col">إجراءات</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`;
  }

  function customersTab(M) {
    const db = M.db(), ok = allowed('customers', 'decide');
    if (!db.customers.length) return '<div class="adm-state is-empty"><h2>لا يوجد عملاء بعد</h2><p>يظهر العملاء بعد تسجيل الدخول التجريبي أو إنشاء طلب في تطبيق العميل.</p></div>';
    return `<div class="rl-scroll" tabindex="0" role="region" aria-label="العملاء"><table class="rl-table"><caption>العملاء (${db.customers.length})</caption><thead><tr><th scope="col">العميل</th><th scope="col">الهاتف</th><th scope="col">الطلبات</th><th scope="col">الحالة</th><th scope="col">إجراء</th></tr></thead><tbody>
      ${db.customers.map((c) => `<tr data-row="${esc(c.id)}"><th scope="row">${esc(c.name)}</th><td><bdi dir="ltr">${esc(c.phone)}</bdi></td><td>${db.serviceRequests.filter((r) => r.customerId === c.id).length}</td><td>${c.status === 'suspended' ? 'معلّق' : 'نشط'}</td><td>${btn(`data-mk="csusp" data-id="${esc(c.id)}"`, c.status === 'suspended' ? 'إعادة تفعيل' : 'تعليق', c.status === 'suspended' ? 'adm-btn-p' : 'adm-btn-d', ok)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function complaintsTab(M) {
    const db = M.db(), ok = allowed('complaints', 'decide'), list = (db.complaints || []).slice().reverse();
    if (!list.length) return '<div class="adm-state is-empty"><h2>لا توجد شكاوى</h2><p>الشكاوى التي يرسلها العملاء من صفحة الدعم تظهر هنا.</p></div>';
    return `<div class="rl-scroll" tabindex="0" role="region" aria-label="الشكاوى"><table class="rl-table"><caption>الشكاوى (${list.length})</caption><thead><tr><th scope="col">الشكوى</th><th scope="col">الحالة</th><th scope="col">المعالجة</th></tr></thead><tbody>
      ${list.map((k) => `<tr data-row="${esc(k.id)}"><th scope="row">${esc(k.subject || k.type || 'شكوى')}<br><small class="ord-muted">${esc(k.text || k.desc || k.details || '')}</small></th><td>${k.status === 'resolved' ? 'محلولة' : 'مفتوحة'}</td>
        <td>${k.status === 'resolved' ? esc(k.resolution || '—') : `<label class="mk-rate">ملاحظة الحل<input type="text" maxlength="200" data-mk-res="${esc(k.id)}" ${ok ? '' : 'disabled'}></label>${btn(`data-mk="cresolve" data-id="${esc(k.id)}"`, 'تسجيل كمحلولة', 'adm-btn-p', ok)}`}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function commissionsTab(M) {
    const db = M.db(), s = db.settings, ok = allowed('commissions', 'edit');
    const cats = typeof SERVICE_TYPES !== 'undefined' ? Object.keys(SERVICE_TYPES) : Object.keys(s.rates || {});
    const tx = db.transactions.slice().reverse();
    return `<form class="mk-form" data-mk-form="rates" novalidate><fieldset><legend>نِسب العمولة (تؤثر على معاينة الإكمال في تطبيق مقدم الخدمة)</legend>
      <label class="mk-rate">الافتراضية %<input type="number" min="0" max="100" step="0.5" name="default" value="${esc(s.defaultRate)}" required ${ok ? '' : 'disabled'}></label>
      ${cats.map((c) => `<label class="mk-rate">${esc(M.catName(c))} %<input type="number" min="0" max="100" step="0.5" name="cat:${esc(c)}" value="${s.rates[c] == null ? '' : esc(s.rates[c])}" placeholder="${esc(s.defaultRate)}" ${ok ? '' : 'disabled'}></label>`).join('')}
      <button type="submit" class="adm-btn adm-btn-p" ${ok ? '' : 'disabled'}>حفظ النسب</button></fieldset></form>
      ${tx.length ? `<div class="rl-scroll" tabindex="0" role="region" aria-label="المعاملات"><table class="rl-table"><caption>المعاملات (${tx.length})</caption><thead><tr><th scope="col">الطلب</th><th scope="col">القيمة</th><th scope="col">العمولة</th><th scope="col">صافي مقدم الخدمة</th><th scope="col">التحصيل</th></tr></thead><tbody>
      ${tx.map((t) => { const r = M.get('serviceRequests', t.reqId); return `<tr data-row="${esc(t.id)}"><th scope="row"><bdi dir="ltr">${esc(r ? r.no : t.reqId)}</bdi></th><td>${money(t.value)}</td><td>${money(t.commission)}<br><small class="ord-muted">${esc(t.rate)}%</small></td><td>${money(t.net)}</td>
        <td>${t.free ? COLL.none : `<select data-mk-coll="${esc(t.id)}" aria-label="حالة التحصيل" ${ok ? '' : 'disabled'}>${['pending', 'collected', 'settled'].map((k) => `<option value="${k}"${t.collection === k ? ' selected' : ''}>${COLL[k]}</option>`).join('')}</select>`}</td></tr>`; }).join('')}</tbody></table></div>`
      : '<div class="adm-state is-empty"><h2>لا توجد معاملات بعد</h2><p>تُنشأ المعاملات عند إكمال الخدمات في تطبيق مقدم الخدمة.</p></div>'}`;
  }

  const RENDER = { providers: providersTab, orders: ordersTab, customers: customersTab, complaints: complaintsTab, commissions: commissionsTab };

  function render() {
    const M = mp();
    const wrap = root.document.createElement('div'); wrap.className = 'ord mk';
    if (!M) { wrap.innerHTML = '<div class="adm-state is-error" role="alert"><h2>بيانات السوق غير متاحة</h2><p>لم يُحمَّل مخزن السوق المحلي.</p></div>'; return wrap; }
    let tab = 'providers', confirmReset = false;
    const paint = (focusSel) => {
      const sm = summary(M.db()), st = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${v}</b></div>`;
      wrap.innerHTML = `<div class="fin-banner" role="note"><span>بيانات السوق المشتركة الحية (محلية): نفس بيانات تطبيقي العميل ومقدم الخدمة على هذا الجهاز. الإجراءات هنا تغيّرها فعليًا داخل العرض التجريبي — ليست خادمًا ولا صلاحيات حقيقية.</span></div>
        <section class="ord-sum" aria-label="ملخص السوق">${st('طلبات انضمام قيد المراجعة', sm.pending)}${st('طلبات بلا إسناد', sm.unassigned)}${st('شكاوى مفتوحة', sm.openComplaints)}${st('معاملات لم تُحصَّل', sm.uncollected)}</section>
        <div role="tablist" aria-label="أقسام تشغيل السوق" class="cat-tools">${TABS.map(([id, l]) => `<button type="button" role="tab" class="adm-btn" id="mk-tab-${id}" aria-controls="mk-panel" aria-selected="${tab === id}" tabindex="${tab === id ? 0 : -1}" data-mk-tab="${id}">${l}</button>`).join('')}</div>
        <div id="mk-panel" role="tabpanel" aria-labelledby="mk-tab-${tab}">${RENDER[tab](M)}</div>
        <p class="ord-muted" role="status" id="mk-live" aria-live="polite"></p>
        <p>${confirmReset ? `<span>سيُعاد إنشاء بيانات السوق التجريبية بالكامل (تُفقد الطلبات والتسجيلات المحلية). </span>${btn('data-mk="reset-yes"', 'تأكيد الاستعادة', 'adm-btn-d')}${btn('data-mk="reset-no"', 'تراجع', '')}` : btn('data-mk="reset"', 'استعادة بيانات السوق التجريبية', '')}</p>`;
      if (root.HSA11yTabs) root.HSA11yTabs.attach(wrap.querySelector('[role=tablist]'));
      const f = focusSel && wrap.querySelector(focusSel); if (f) f.focus();
    };
    const say = (msg, focusSel) => { paint(focusSel); const live = wrap.querySelector('#mk-live'); if (live) live.textContent = msg; };

    wrap.addEventListener('click', (e) => {
      const t = e.target.closest('[data-mk-tab],[data-mk]'); if (!t || t.disabled) return;
      if (t.dataset.mkTab) { tab = t.dataset.mkTab; paint('#mk-tab-' + tab); return; }
      const a = t.dataset.mk, id = t.dataset.id;
      if (a === 'padmit') { M.updateProvider(id, { status: 'approved' }); return say('تم قبول مقدم الخدمة — يمكنه الآن استقبال الطلبات.', `tr[data-row="${id}"] button`); }
      if (a === 'preject') { M.updateProvider(id, { status: 'rejected' }); return say('تم رفض طلب الانضمام.'); }
      if (a === 'psusp') { const p = M.get('providers', id); M.updateProvider(id, { status: p.status === 'suspended' ? 'approved' : 'suspended' }); return say(p.status === 'approved' ? 'أُعيد تفعيل مقدم الخدمة.' : 'تم تعليق مقدم الخدمة.'); }
      if (a === 'prate') {
        const v = (wrap.querySelector(`[data-mk-rate="${id}"]`) || {}).value; const s = String(v == null ? '' : v).trim();
        if (s !== '' && (!Number.isFinite(+s) || +s < 0 || +s > 100)) return say('نسبة غير صحيحة: أدخل رقمًا من 0 إلى 100 أو اتركها فارغة.', `[data-mk-rate="${id}"]`);
        M.updateProvider(id, { specialRate: s === '' ? null : +s }); return say(s === '' ? 'عادت العمولة للنسبة الافتراضية.' : 'تم حفظ العمولة الخاصة.');
      }
      if (a === 'assign') { const pid = (wrap.querySelector(`[data-mk-pick="${id}"]`) || {}).value; if (!pid) return say('اختر مقدم خدمة أولًا.', `[data-mk-pick="${id}"]`); const x = M.assign(id, pid); return say(x.ok ? 'تم إرسال الطلب إلى ' + x.provider.name : x.msg); }
      if (a === 'automatch') { const x = M.assign(id); return say(x.ok ? 'تمت المطابقة التلقائية — ' + x.provider.name : x.msg); }
      if (a === 'cancel') { return say(M.cancel(id, 'إلغاء من الإدارة') ? 'تم إلغاء الطلب.' : 'لا يمكن إلغاء الطلب في حالته الحالية (بعد بدء التنفيذ).'); }
      if (a === 'csusp') { const c = M.get('customers', id); if (c) { c.status = c.status === 'suspended' ? 'active' : 'suspended'; M.save(); } return say('تم تحديث حالة العميل.'); }
      if (a === 'cresolve') { const note = String((wrap.querySelector(`[data-mk-res="${id}"]`) || {}).value || '').trim(); if (!note) return say('اكتب ملاحظة الحل أولًا.', `[data-mk-res="${id}"]`); M.resolveComplaint(id, note); return say('تم تسجيل الشكوى كمحلولة.'); }
      if (a === 'reset') { confirmReset = true; return paint('[data-mk="reset-yes"]'); }
      if (a === 'reset-no') { confirmReset = false; return paint('[data-mk="reset"]'); }
      if (a === 'reset-yes') { confirmReset = false; M.reset(); return say('تمت استعادة بيانات السوق التجريبية.'); }
    });
    wrap.addEventListener('change', (e) => { const sel = e.target.closest('[data-mk-coll]'); if (sel && !sel.disabled) { M.setCollection(sel.dataset.mkColl, sel.value); say('تم تحديث حالة التحصيل.'); } });
    wrap.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-mk-form="rates"]'); if (!f) return; e.preventDefault();
      const fields = Array.from(f.querySelectorAll('input[type=number]')), bad = fields.find((i) => i.value.trim() !== '' && (!Number.isFinite(+i.value) || +i.value < 0 || +i.value > 100));
      const def = f.querySelector('[name=default]');
      if (bad || def.value.trim() === '') return say('راجع النسب: كل نسبة رقم من 0 إلى 100، والنسبة الافتراضية مطلوبة.', bad ? `[name="${bad.name}"]` : '[name=default]');
      M.setSetting('defaultRate', +def.value);
      fields.filter((i) => i.name.startsWith('cat:')).forEach((i) => M.setCatRate(i.name.slice(4), i.value.trim()));
      say('تم حفظ نسب العمولة.');
    });
    paint();
    return wrap;
  }

  const api = { TABS, PSTATUS, COLL, summary, pendingProviders, render };
  root.HSAdminMarketplacePage = api;
  if (root.HSAdminShell) root.HSAdminShell.registerPage('marketplace', { title: 'تشغيل السوق (بيانات حية)', description: 'مراجعة انضمام مقدمي الخدمة، إسناد الطلبات، الشكاوى، والعمولات على بيانات السوق المشتركة المحلية.', render });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
