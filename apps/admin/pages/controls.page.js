/**
 * MODULE: controls.page — «الطوارئ والصيانة» (owner only).
 * Three switches, each explained in one line, each confirmed before it changes anything:
 *   maintenance  — customers and providers see a maintenance screen and cannot change anything (admins keep working);
 *                  turning it ON asks the owner to type «صيانة».
 *   pauseOrders  — no new requests; current orders continue.
 *   pauseSignups — no new provider registrations.
 * Data: GET/POST /admin/controls (services/admin-api.js; the server enforces «owner only» and audits every change).
 * Also links to «أخطاء عند المستخدمين» and «سجل الإداريين» so an incident can be followed from one place.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return ''; try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(t); } catch (e) { return iso; } };
  const SWITCHES = [
    { key: 'maintenance', title: 'وضع الصيانة — إيقاف المنصة كلها', danger: true,
      on: 'العملاء ومقدمو الخدمة شايفين شاشة صيانة ومش قادرين يعملوا أي حاجة. فريق الإدارة شغال عادي.',
      off: 'لما تشغّله: العملاء ومقدمو الخدمة هيشوفوا شاشة صيانة، ومحدش يقدر يطلب أو يقبل أو يغيّر حاجة لحد ما تقفله.',
      confirmWord: 'صيانة', message: true },
    { key: 'pauseOrders', title: 'إيقاف الطلبات الجديدة',
      on: 'مفيش طلبات جديدة بتتقبل. الطلبات الشغالة كاملة عادي.', off: 'لما تشغّله: العملاء يقدروا يتصفحوا ويتابعوا طلباتهم، بس مش هيقدروا يعملوا طلب جديد.', message: true },
    { key: 'pauseSignups', title: 'إيقاف تسجيل مقدمي خدمة جدد',
      on: 'التسجيل الجديد متوقف. الحسابات الحالية شغالة.', off: 'لما تشغّله: مفيش طلبات انضمام جديدة لحد ما تقفله.' }
  ];
  const isOwner = () => { try { const R = root.HSAdminRbac; return !!(R && R.state && R.state.actor === 'owner'); } catch (e) { return false; } };
  const api = () => root.HSAdminApi;
  const staffName = (id) => { try { const e = ((root.HSAdminRbac || {}).state || {}).roster.find((x) => x.id === id); return e ? e.name : id; } catch (e) { return id || ''; } };

  function cardHtml(s, v) {
    const on = !!(v && v.on);
    return `<section class="ctl-card ${on ? 'is-on' : ''} ${s.danger ? 'is-danger' : ''}" aria-labelledby="ctl-h-${s.key}">
      <div class="ctl-head"><h2 id="ctl-h-${s.key}">${esc(s.title)}</h2><span class="ctl-state">${on ? 'شغّال' : 'مقفول'}</span></div>
      <p>${esc(on ? s.on : s.off)}</p>
      ${on && v.at ? `<p class="ord-muted">اتشغّل ${esc(dt(v.at))}${v.by ? ' — ' + esc(staffName(v.by)) : ''}${v.message ? ` · الرسالة: «${esc(v.message)}»` : ''}</p>` : ''}
      ${!on && s.message ? `<label class="hs-grid-field"><span>رسالة تظهر للمستخدمين (اختياري)</span><input type="text" maxlength="200" data-ctl-msg="${s.key}" placeholder="${s.key === 'maintenance' ? 'مثال: صيانة لمدة ساعة — ارجع الساعة 3' : 'مثال: الطلبات هترجع الساعة 6'}"></label>` : ''}
      ${!on && s.confirmWord ? `<label class="hs-grid-field"><span>للتأكيد اكتب «${esc(s.confirmWord)}»</span><input type="text" data-ctl-confirm="${s.key}" autocomplete="off"></label>` : ''}
      <p><button type="button" class="adm-btn ${on ? 'adm-btn-p' : (s.danger ? 'adm-btn-d' : 'adm-btn-p')}" data-ctl="${s.key}" data-next="${!on}">${on ? 'إيقاف وإرجاع المنصة طبيعي' : 'تشغيل'}</button></p>
    </section>`;
  }

  async function render() {
    const wrap = root.document.createElement('div'); wrap.className = 'ctl';
    if (!isOwner()) { wrap.innerHTML = '<p class="fin-banner" role="note">الصفحة دي للمالك بس.</p>'; return wrap; }
    const paint = async (status) => {
      const r = api() ? await api().controls() : { ok: false };
      if (!r.ok) { wrap.innerHTML = '<p>تعذّر تحميل حالة المفاتيح.</p>'; return; }
      const anyOn = Object.values(r.data).some((v) => v.on);
      wrap.innerHTML = `<p class="ctl-summary ${anyOn ? 'is-alert' : ''}" role="status">${anyOn ? (typeof ic === 'function' ? ic('warn') + ' ' : '') + 'فيه مفتاح طوارئ شغّال دلوقتي.' : (typeof ic === 'function' ? ic('check') + ' ' : '') + 'المنصة شغالة طبيعي.'}</p>
        <p role="status" aria-live="polite" class="ord-muted" data-ctl-status>${esc(status || '')}</p>
        ${SWITCHES.map((s) => cardHtml(s, r.data[s.key])).join('')}
        <section class="ctl-card"><h2>متابعة أي مشكلة</h2><p><a class="dash-link" href="#/audit">سجل الإداريين وأخطاء المستخدمين</a> · <a class="dash-link" href="#/security">الأمان والدخول</a></p></section>`;
    };
    await paint();
    wrap.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ctl]'); if (!b) return;
      const key = b.dataset.ctl, next = b.dataset.next === 'true', s = SWITCHES.find((x) => x.key === key);
      const say = (m) => { const n = wrap.querySelector('[data-ctl-status]'); if (n) n.textContent = m; };
      if (next && s.confirmWord) {
        const c = wrap.querySelector(`[data-ctl-confirm="${key}"]`);
        if (!c || c.value.trim() !== s.confirmWord) { say(`اكتب «${s.confirmWord}» في خانة التأكيد الأول.`); if (c) c.focus(); return; }
      } else { const q = next ? `تشغيل «${s.title}»؟` : `إيقاف «${s.title}» وإرجاع المنصة طبيعي؟`; if (!(await (root.HSUiDialog ? root.HSUiDialog.confirm(q, { danger: next }) : Promise.resolve(root.confirm ? root.confirm(q) : true)))) return; }
      const msgEl = wrap.querySelector(`[data-ctl-msg="${key}"]`);
      b.disabled = true;
      const r = await api().setControl(key, next, msgEl ? msgEl.value : '');
      await paint(r.ok ? (next ? `اتشغّل «${s.title}».` : `اتقفل «${s.title}» — المنصة رجعت طبيعي.`) : ((r.error && r.error.message) || 'تعذّر التنفيذ.'));
      const h = wrap.querySelector(`#ctl-h-${key}`); if (h) { h.tabIndex = -1; h.focus(); }
    });
    return wrap;
  }

  const pageApi = { SWITCHES, render };
  root.HSAdminControlsPage = pageApi;
  if (typeof module !== 'undefined' && module.exports) module.exports = pageApi;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('controls', {
      title: 'الطوارئ والصيانة',
      description: 'مفاتيح المالك لإيقاف المنصة أو جزء منها وقت الأزمات — كل تغيير بيتسجل في سجل الإداريين.',
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
