/**
 * MODULE: admin-live-panels (HSAdminLivePanels) — server-backed panels for Admin pages whose demo UI is built on
 * fixture-only entities (alerts, templates, KPI targets…). In Firebase mode the shell mounts these panels instead of
 * the fixture page: every value comes from the backend and every action calls a real route. Local mode is untouched.
 *   audit · settings · departments · security · notifications · commissions · reports · super-dashboard · services
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = () => root.HSApiClient;
  const call = (method, path, body) => (root.HSBackend && root.HSBackend.admin ? root.HSBackend.admin(method, path, body) : C().request(method, path, { body }));
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG-u-nu-latn').format(n); } catch (e) { return String(n); } };
  const money = (n) => nf(Math.round((+n || 0) * 100) / 100) + ' ج.م';
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(t); } catch (e) { return iso; } };
  const db = () => (typeof MP !== 'undefined' ? MP.db() : {});
  const errText = (res) => (res && res.error && res.error.message) || 'تعذّر تنفيذ الإجراء.';
  const table = (heads, rows) => rows.length
    ? `<div class="hs-grid-scroll"><table class="hs-grid-table"><thead><tr>${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : '<p class="ord-muted">لا توجد سجلات بعد — تظهر هنا عند حدوث عمليات حقيقية.</p>';
  const note = '<p class="ord-muted" role="note">بيانات حية من الخادم.</p>';
  const status = (host, msg) => { const s = host.querySelector('[data-live-status]'); if (s) s.textContent = msg || ''; };
  const frame = (title, body) => `<section class="adm-live-panel" aria-label="${esc(title)}">${note}<p data-live-status role="status" aria-live="polite" class="ord-muted"></p>${body}</section>`;

  const PANELS = {
    async audit(host) {
      /* «سجل الإداريين»: who did what and when — sign-ins with the access code (ok / wrong / locked), code set / reset,
         emergency switches, and every change made from the Admin Center; filters by kind and by person. */
      const res = await C().request('GET', '/admin/audit', { query: { limit: 100 } });
      if (!res.ok) { host.innerHTML = frame('سجل الإداريين', `<p>${esc(errText(res))}</p>`); return; }
      const roster = ((root.HSAdminRbac || {}).state || {}).roster || [];
      const who = (a) => { const e = roster.find((x) => (a.uid && x.uid === a.uid) || (a.actor && (x.id === a.actor.id || x.uid === a.actor.id))); return e ? e.name : a.actor ? (a.actor.role === 'admin' ? 'إداري' : a.actor.role === 'customer' ? 'عميل' : a.actor.role === 'provider' ? 'مقدم خدمة' : a.actor.role) : (a.action === 'claimOwner' ? 'المالك' : 'النظام'); };
      const KIND = (a) => /^admin\.code|claimOwner/.test(a.action || '') ? 'login' : /\/admin\/controls/.test(a.path || '') ? 'emergency' : a.app === 'admin' ? 'admin' : 'other';
      const LABEL = (a) => {
        const act = a.action || '';
        if (act === 'claimOwner') return 'تسجيل المالك لأول مرة';
        if (act === 'admin.code.set') return 'عمل كود الدخول';
        if (act === 'admin.code.change') return 'غيّر كود الدخول';
        if (act === 'admin.code.unlock') return 'دخول بالكود';
        if (act.startsWith('admin.code.reset:')) { const e = roster.find((x) => x.uid === act.split(':')[1]); return 'إعادة ضبط كود ' + (e ? e.name : 'موظف'); }
        if (/\/admin\/controls/.test(a.path || '')) return 'مفاتيح الطوارئ';
        return (a.method || '') + ' ' + (a.path || '');
      };
      const RESULT = (a) => ({ ok: 'تم', failed: 'كود غلط', locked: 'اتقفل 15 دقيقة' })[a.status] || (a.status >= 400 ? 'اترفض' : a.status ? 'تم' : '—');
      const items = res.data.items;
      let kind = 'all', person = '';
      const people = [...new Set(items.map(who))].sort();
      const paint = () => {
        const rows = items.filter((a) => (kind === 'all' || KIND(a) === kind) && (!person || who(a) === person));
        const bad = items.filter((a) => a.status === 'failed' || a.status === 'locked').length;
        host.innerHTML = frame('سجل الإداريين', `${bad ? `<p class="fin-banner" role="note">${typeof ic === 'function' ? ic('warn') : ''} ${nf(bad)} محاولة دخول بكود غلط في آخر السجلات — راجع «الأمان والدخول» لو مش متوقعة.</p>` : ''}
          <div class="aud-filters" role="group" aria-label="تصفية السجل">${[['all', 'الكل'], ['login', 'الدخول والأكواد'], ['emergency', 'الطوارئ'], ['admin', 'تعديلات الإدارة'], ['other', 'العملاء ومقدمو الخدمة']].map(([k, l]) => `<button type="button" class="adm-btn ${kind === k ? 'adm-btn-p' : ''}" aria-pressed="${kind === k}" data-aud-kind="${k}">${l}</button>`).join('')}
          <label class="hs-grid-field"><span>الشخص</span><select data-aud-person><option value="">الكل</option>${people.map((p) => `<option ${p === person ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label></div>` +
          table(['الوقت', 'مين', 'العملية', 'النتيجة'], rows.map((a) => [esc(dt(a.at)), esc(who(a)), esc(LABEL(a)), esc(RESULT(a))])) +
          '<section class="cerr" data-client-errors aria-labelledby="cerr-h"></section>');
        if (root.HSClientErrors) root.HSClientErrors.mount(host.querySelector('[data-client-errors]'));   /* modules/client-errors.js */
        host.querySelectorAll('[data-aud-kind]').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.audKind; paint(); const n = host.querySelector(`[data-aud-kind="${kind}"]`); if (n) n.focus(); }));
        const sel = host.querySelector('[data-aud-person]'); if (sel) sel.addEventListener('change', () => { person = sel.value; paint(); const n = host.querySelector('[data-aud-person]'); if (n) n.focus(); });
      };
      paint();
    },
    async settings(host) {
      const res = await C().request('GET', '/admin/settings');
      if (!res.ok) { host.innerHTML = frame('إعدادات النظام', `<p>${esc(errText(res))}</p>`); return; }
      const s = res.data;
      host.innerHTML = frame('إعدادات النظام', `<form data-live-settings class="ord-dlg-in">
        <label class="hs-grid-field"><span>الإسناد التلقائي للطلبات الجديدة</span><input type="checkbox" name="autoAssign" ${s.autoAssign ? 'checked' : ''}></label>
        <label class="hs-grid-field"><span>تطبيق رسوم على العميل</span><input type="checkbox" name="customerFee" ${s.customerFee ? 'checked' : ''}></label>
        <label class="hs-grid-field"><span>نسبة المنصة على السعر (٪)</span><input type="number" name="markupRate" min="0" max="100" step="0.5" value="${esc(s.markupRate)}"></label>
        <p class="ord-muted">نموذج التحصيل: العميل يدفع لمقدم الخدمة، وحصة المنصة تُحصَّل من مقدم الخدمة.</p>
        <p><button type="submit" class="adm-btn adm-btn-p">حفظ الإعدادات</button></p></form><div data-support-settings></div><div data-digest></div><div data-marketing></div><div data-ai-settings></div><div data-site-content></div>`);
      const dg = host.querySelector('[data-digest]');
      if (dg && root.HSDigestSettings) root.HSDigestSettings.mount(dg).catch(() => { dg.innerHTML = '<p>تعذّر تحميل إعدادات الملخصات.</p>'; });   /* modules/digest-settings.js */
      const sup = host.querySelector('[data-support-settings]');
      if (sup && root.HSAdminSupportSettings) root.HSAdminSupportSettings.mount(sup).catch(() => { sup.innerHTML = '<p>تعذّر تحميل بيانات تواصل الدعم.</p>'; });
      const ais = host.querySelector('[data-ai-settings]');
      if (ais && root.HSAiSettings) root.HSAiSettings.mount(ais).catch(() => { ais.innerHTML = '<p>تعذّر تحميل إعدادات التوجيه الذكي.</p>'; });
      const mk = host.querySelector('[data-marketing]');
      if (mk && root.HSMarketingEditor) root.HSMarketingEditor.mount(mk).catch(() => { mk.innerHTML = '<p>تعذّر تحميل العروض والخصومات.</p>'; });
      const sc = host.querySelector('[data-site-content]');
      if (sc && root.HSSiteContentEditor) root.HSSiteContentEditor.mount(sc).catch(() => { sc.innerHTML = '<p>تعذّر تحميل محتوى الواجهة.</p>'; });
      host.querySelector('[data-live-settings]').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = e.target;
        const r1 = await call('POST', '/admin/settings', { autoAssign: f.autoAssign.checked, customerFee: f.customerFee.checked });
        const r2 = r1.ok ? await call('POST', '/admin/pricing', { markupRate: Number(f.markupRate.value) }) : r1;
        status(host, r2.ok ? 'تم حفظ الإعدادات على الخادم.' : errText(r2));
      });
    },
    async departments(host) {
      const res = await C().request('GET', '/admin/departments');
      if (!res.ok) { host.innerHTML = frame('الإدارات', `<p>${esc(errText(res))}</p>`); return; }
      const items = res.data.items, emps = ((root.HSAdminRbac || {}).state || {}).roster || [];
      const name = (id) => { const d = items.find((x) => x.id === id); return d ? d.name : '—'; };
      host.innerHTML = frame('الإدارات', table(['الإدارة', 'تتبع', 'المسؤول', 'الحالة', ''], items.map((d) => [
        esc(d.name), esc(d.parentId ? name(d.parentId) : 'رئيسية'), esc((emps.find((e) => e.id === d.headId) || {}).name || '—'), esc(d.status === 'active' ? 'مفعّلة' : 'متوقفة'),
        `<button type="button" class="adm-btn" data-dept-toggle="${esc(d.id)}" data-next="${d.status === 'active' ? 'inactive' : 'active'}">${d.status === 'active' ? 'إيقاف' : 'تفعيل'}</button>`])) +
        `<form data-live-dept class="ord-dlg-in"><h3>إضافة إدارة</h3><label class="hs-grid-field"><span>الاسم</span><input name="name" required maxlength="50" autocomplete="off" enterkeyhint="done"></label>
         <label class="hs-grid-field"><span>تتبع</span><select name="parentId"><option value="">إدارة رئيسية</option>${items.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select></label>
         <p><button type="submit" class="adm-btn adm-btn-p">إضافة</button></p></form>`);
      host.querySelector('[data-live-dept]').addEventListener('submit', async (e) => {
        e.preventDefault(); const r = await call('POST', '/admin/departments', { name: e.target.name.value, parentId: e.target.parentId.value || null });
        if (r.ok) return PANELS.departments(host); status(host, errText(r));
      });
      host.querySelectorAll('[data-dept-toggle]').forEach((b) => b.addEventListener('click', async () => {
        const r = await call('PATCH', '/admin/departments/' + encodeURIComponent(b.dataset.deptToggle), { status: b.dataset.next });
        if (r.ok) return PANELS.departments(host); status(host, errText(r));
      }));
    },
    async security(host) {
      const res = await C().request('GET', '/admin/security/admins');
      if (!res.ok) { host.innerHTML = frame('الأمان', `<p>${esc(errText(res))}</p>`); return; }
      const codeText = (u) => (u.codeLocked ? 'مقفول (محاولات غلط)' : u.hasCode ? 'متعمل' + (u.lastUnlockAt ? ' · آخر استخدام ' + dt(u.lastUnlockAt) : '') : 'لسه ما اتعملش');
      host.innerHTML = frame('الأمان', table(['الموظف', 'البريد', 'الدور', 'آخر دخول', 'كود الدخول (8 أرقام)', 'التحقق بخطوتين', ''], res.data.items.map((u) => [
        esc(u.name), esc(u.email), esc(u.role), esc(u.lastSignIn ? dt(u.lastSignIn) : '—'), esc(codeText(u)), esc(u.totpOn ? 'شغّال' : 'مقفول'),
        `${u.role === 'owner' ? '' : `<button type="button" class="adm-btn" data-reset-code="${esc(u.uid)}">إعادة ضبط الكود</button> `}${u.role !== 'owner' && u.totpOn ? `<button type="button" class="adm-btn" data-reset-totp="${esc(u.uid)}">إلغاء التحقق بخطوتين</button> ` : ''}<button type="button" class="adm-btn adm-btn-d" data-revoke="${esc(u.uid)}">إنهاء كل الجلسات</button>`])) +
        '<p class="ord-muted">الدخول للإدارة: إيميل مؤكَّد + كلمة مرور + كود شخصي من 8 أرقام، وكمان كود تطبيق المصادقة لو «التحقق بخطوتين» شغّال (كل موظف يشغّله من زرار «التحقق بخطوتين» فوق). 5 محاولات غلط بتقفل الحساب 15 دقيقة. «إعادة ضبط الكود» بتخلّي الموظف يعمل كود جديد في دخوله الجاي. «إلغاء التحقق بخطوتين» لموظف ضاع موبايله: يدخل بالكود بس ويشغّله تاني. إنهاء الجلسات يُخرج الحساب من كل الأجهزة (للمالك فقط، ولا يشمل حسابك).</p>');
      host.querySelectorAll('[data-reset-totp]').forEach((b) => b.addEventListener('click', async () => {
        const q = 'إلغاء التحقق بخطوتين للموظف ده؟ هيدخل بكلمة المرور والكود بس لحد ما يشغّله تاني.';
        if (!(await (root.HSUiDialog ? root.HSUiDialog.confirm(q, { danger: true }) : Promise.resolve(root.confirm ? root.confirm(q) : true)))) return;
        const r = await call('POST', '/admin/security/reset-totp/' + encodeURIComponent(b.dataset.resetTotp), {});
        if (r.ok) return PANELS.security(host); status(host, errText(r));
      }));
      host.querySelectorAll('[data-reset-code]').forEach((b) => b.addEventListener('click', async () => {
        if (!(await (root.HSUiDialog ? root.HSUiDialog.confirm('إعادة ضبط كود الدخول للموظف ده؟ هيعمل كود جديد في دخوله الجاي.', { danger: true }) : Promise.resolve(root.confirm ? root.confirm('إعادة ضبط كود الدخول للموظف ده؟ هيعمل كود جديد في دخوله الجاي.') : true)))) return;
        const r = await call('POST', '/admin/security/reset-code/' + encodeURIComponent(b.dataset.resetCode), {});
        if (r.ok) return PANELS.security(host); status(host, errText(r));
      }));
      host.querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
        const r = await call('POST', '/admin/security/revoke/' + encodeURIComponent(b.dataset.revoke), {});
        status(host, r.ok ? 'تم إنهاء جلسات الحساب.' : errText(r));
      }));
    },
    async notifications(host) {
      const res = await C().request('GET', '/admin/notifications/broadcasts');
      if (!res.ok) { host.innerHTML = frame('الإشعارات', `<p>${esc(errText(res))}</p>`); return; }
      host.innerHTML = frame('الإشعارات', `<form data-live-bc class="ord-dlg-in"><h3>إرسال إشعار داخل التطبيق</h3>
        <label class="hs-grid-field"><span>الجمهور</span><select name="audience"><option value="customers">العملاء</option><option value="providers">مقدمو الخدمة المعتمدون</option></select></label>
        <label class="hs-grid-field"><span>النص</span><textarea name="text" required minlength="5" maxlength="500" rows="3"></textarea></label>
        <p class="ord-muted">يصل إلى صندوق الإشعارات داخل التطبيق (حتى 500 مستلم). الرسائل النصية والبريد تحتاج مزودًا خارجيًا.</p>
        <p><button type="submit" class="adm-btn adm-btn-p">إرسال</button></p></form>` +
        table(['الوقت', 'الجمهور', 'النص', 'المستلمون'], res.data.items.map((x) => [esc(dt(x.at)), esc(x.audience === 'customers' ? 'العملاء' : 'مقدمو الخدمة'), esc(x.text), esc(nf(x.recipients))])));
      host.querySelector('[data-live-bc]').addEventListener('submit', async (e) => {
        e.preventDefault(); const r = await call('POST', '/admin/notifications/broadcast', { audience: e.target.audience.value, text: e.target.text.value });
        if (r.ok) return PANELS.notifications(host); status(host, errText(r));
      });
    },
    async commissions(host) {
      const [c, p] = await Promise.all([C().request('GET', '/admin/commission'), C().request('GET', '/admin/pricing')]);
      if (!c.ok) { host.innerHTML = frame('العمولات', `<p>${esc(errText(c))}</p>`); return; }
      const rates = c.data.rates || {};
      host.innerHTML = frame('العمولات', `<dl class="ord-facts"><div><dt>نسبة المنصة على السعر المحدد مسبقًا</dt><dd>${esc(p.ok ? p.data.markupRate : '—')}٪</dd></div>
        <div><dt>النسبة الافتراضية للطلبات بلا سعر محدد</dt><dd>${esc(c.data.defaultRate)}٪</dd></div></dl>` +
        table(['القسم', 'نسبة خاصة'], Object.keys(rates).map((k) => [esc(typeof MP !== 'undefined' ? MP.catName(k) : k), esc(rates[k] + '٪')])) +
        `<form data-live-rate class="ord-dlg-in"><h3>تعديل النسبة الافتراضية</h3><label class="hs-grid-field"><span>النسبة (٪)</span><input type="number" name="rate" min="0" max="100" step="0.5" value="${esc(c.data.defaultRate)}"></label>
         <p><button type="submit" class="adm-btn adm-btn-p">حفظ</button></p></form>`);
      host.querySelector('[data-live-rate]').addEventListener('submit', async (e) => {
        e.preventDefault(); const r = await call('POST', '/admin/commission', { defaultRate: Number(e.target.rate.value) });
        if (r.ok) return PANELS.commissions(host); status(host, errText(r));
      });
    },
    async reports(host) {
      const reqs = db().serviceRequests || [], txs = (db().transactions || []).filter((t) => !t.free);
      const by = {}; reqs.forEach((r) => { by[r.status] = (by[r.status] || 0) + 1; });
      const label = (s) => (typeof STATUS_LABEL !== 'undefined' && STATUS_LABEL[s]) || s;
      const win = (d) => { const since = Date.now() - d * 86400000; const l = txs.filter((t) => Date.parse(t.at) >= since); return [d, l.length, l.reduce((a, t) => a + (+t.value || 0), 0), l.reduce((a, t) => a + (+t.commission || 0), 0)]; };
      host.innerHTML = frame('التقارير', '<h3>الطلبات حسب الحالة</h3>' + table(['الحالة', 'العدد'], Object.keys(by).map((s) => [esc(label(s)), esc(nf(by[s]))])) +
        '<h3>المعاملات المكتملة</h3>' + table(['الفترة', 'المعاملات', 'ما دفعه العملاء', 'حصة المنصة'], [7, 30, 90].map(win).map(([d, n, v, c]) => [esc(d + ' يوم'), esc(nf(n)), esc(money(v)), esc(money(c))])) +
        '<p class="ord-muted">محسوبة من نافذة المزامنة الحالية (أحدث السجلات).</p>');
    },
    async 'super-dashboard'(host) {
      const res = await C().request('GET', '/admin/summary');
      if (!res.ok) { host.innerHTML = frame('لوحة المالك', `<p>${esc(errText(res))}</p>`); return; }
      const s = res.data, txs = (db().transactions || []).filter((t) => !t.free);
      const pending = txs.filter((t) => t.collection === 'pending').reduce((a, t) => a + (+t.commission || 0), 0);
      host.innerHTML = frame('لوحة المالك', `<dl class="ord-facts">${[['كل الطلبات', nf(s.requests)], ['طلبات بلا مقدم خدمة', nf(s.unassigned)], ['مقدمو الخدمة', nf(s.providers)], ['تسجيلات بانتظار المراجعة', nf(s.pending)], ['شكاوى مفتوحة', nf(s.openComplaints)], ['حصة المنصة غير المحصّلة', money(pending)]]
        .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`);
    },
    async services(host) {
      const [p] = await Promise.all([C().request('GET', '/admin/pricing')]);
      const prices = p.ok ? p.data.prices : {}, m = p.ok ? +p.data.markupRate : 0;
      const c = typeof CAT !== 'undefined' && CAT.db ? CAT.db() : { categories: [], items: [] };
      const catName = (id) => { const k = (c.categories || []).find((x) => x.id === id); return k ? k.name : id; };
      /* the catalogue editor (modules/catalog-editor.js) sits above the price list */
      host.innerHTML = '<div data-catalog-editor></div>' + frame('الخدمات', table(['الخدمة', 'القسم', 'مبلغ مقدم الخدمة', 'سعر العميل'], (c.items || []).map((it) => {
        const b = prices[it.id]; return [esc(it.name), esc(catName(it.cat)), esc(b ? money(b) : '—'), esc(b ? money(Math.round(b * (1 + m / 100))) : 'بعد المعاينة')];
      })) + '<p class="ord-muted">تعديل الأسعار من صفحة «التصنيفات» (اختر الجهاز أو نوع العمل).</p>');
      const ce = host.querySelector('[data-catalog-editor]');
      if (ce && root.HSCatalogEditor) root.HSCatalogEditor.mount(ce).catch(() => { ce.innerHTML = '<p class="ord-muted">تعذّر تحميل كتالوج الخدمات.</p>'; });
    }
  };

  async function mount(id, host) {
    const p = PANELS[id]; if (!p) return false;
    host.innerHTML = '<div aria-busy="true" role="status" aria-label="جارٍ التحميل من الخادم"><div class="sk sk-bar"></div><div class="sk-card"><span class="sk sk-line w60"></span><span class="sk sk-line w80"></span><span class="sk sk-line w40"></span></div><div class="sk-card"><span class="sk sk-line w80"></span><span class="sk sk-line w60"></span></div></div>';
    try { await p(host); } catch (e) { host.innerHTML = frame('', '<p>تعذّر تحميل البيانات من الخادم.</p>'); }
    return true;
  }
  const api = Object.freeze({ mount, ids: Object.keys(PANELS) });
  root.HSAdminLivePanels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
