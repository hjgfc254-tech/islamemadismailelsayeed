/**
 * MODULE: orders-management.page
 * RESPONSIBILITY: Admin orders management — summary counts, searchable/filterable/sortable orders grid, and a details dialog
 *   with a status timeline plus simulated admin actions (move to an allowed next status, add an internal note).
 * STATUS: IMPLEMENTED (DEMO). Orders are local fixtures defined in this file; every change lives in memory only and is
 *   labelled in the UI as a local simulation (no server, no notification to the customer or provider, nothing persisted).
 * Depends on: HSAdminShell (registerPage), HSDataGrid, HSStatusBadge (domain «order»; labels mirror local-market-store.js).
 * Permissions: none enforced (frontend demo) — the shell banner says so.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG-u-nu-latn').format(n); } catch (e) { return String(n); } };
  const money = (n) => (Number.isFinite(n) && n > 0 ? nf(n) + ' ج.م' : '—');
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(t); } catch (e) { return iso; } };

  /* ───── Status model (keys must exist in HSStatusBadge «order») ───── */
  const NEXT = {
    received: ['searching', 'cancelled'], searching: ['sent', 'cancelled'], sent: ['accepted', 'searching', 'cancelled'],
    accepted: ['scheduled', 'cancelled'], scheduled: ['enroute', 'cancelled'], enroute: ['arrived', 'failed', 'cancelled'],
    arrived: ['started', 'failed'], started: ['quote', 'completed', 'failed'], quote: ['started', 'cancelled'],
    completed: ['closed'], failed: ['searching'], closed: [], cancelled: []
  };
  const GROUPS = [
    { id: 'new', label: 'جديدة', keys: ['received', 'searching', 'sent'] },
    { id: 'active', label: 'قيد التنفيذ', keys: ['accepted', 'scheduled', 'enroute', 'arrived', 'started', 'quote'] },
    { id: 'done', label: 'مكتملة', keys: ['completed', 'closed'] },
    { id: 'problem', label: 'ملغاة / متعثرة', keys: ['cancelled', 'failed'] }
  ];
  const allowedNext = (status) => (Object.prototype.hasOwnProperty.call(NEXT, status) ? NEXT[status].slice() : []);
  const groupOf = (status) => { const g = GROUPS.find((x) => x.keys.includes(status)); return g ? g.id : null; };
  const label = (s) => (root.HSStatusBadge ? root.HSStatusBadge.label('order', s) : s);
  const badge = (s, o) => (root.HSStatusBadge ? root.HSStatusBadge.render('order', s, o) : esc(s));

  /* ───── Fixtures (demo) ───── */
  const CUSTOMERS = ['أحمد إبراهيم', 'منى السيد', 'خالد محمود', 'سارة عادل', 'ياسر فتحي', 'هدى حسن', 'عمرو نبيل', 'نهى رمضان', 'مصطفى علي', 'دينا كمال'];
  const PROVIDERS = ['محمود الكهربائي', 'سيد للسباكة', 'ورشة النور للنجارة', 'عادل لتكييف الهواء', 'حسام للدهانات', null];
  const SERVICES = [['إصلاح كهرباء', 'كهرباء', 250], ['تسريب مياه', 'سباكة', 300], ['تركيب باب', 'نجارة', 450], ['صيانة تكييف', 'تكييف', 600], ['دهان غرفة', 'دهانات', 900]];
  const AREAS = ['مدينة نصر', 'المعادي', 'الدقي', 'التجمع الخامس', 'الهرم', 'الشيخ زايد'];
  const STATUS_CYCLE = ['received', 'searching', 'sent', 'accepted', 'scheduled', 'enroute', 'arrived', 'started', 'quote', 'completed', 'closed', 'cancelled', 'failed'];
  const buildFixtures = () => {
    const out = [];
    for (let i = 0; i < 30; i++) {
      const status = STATUS_CYCLE[(i * 5) % STATUS_CYCLE.length];
      const svc = SERVICES[i % SERVICES.length];
      const early = ['received', 'searching'].includes(status);
      const day = 1 + ((i * 7) % 28);
      out.push({
        id: 'o' + (1001 + i), no: 1001 + i, customer: CUSTOMERS[i % CUSTOMERS.length], service: svc[0], category: svc[1],
        provider: early ? null : PROVIDERS[i % (PROVIDERS.length - 1)], area: AREAS[(i * 3) % AREAS.length], status,
        amount: ['completed', 'closed', 'quote', 'started'].includes(status) ? svc[2] + (i % 4) * 50 : 0,
        at: '2026-10-' + String(day).padStart(2, '0') + 'T' + String(8 + (i % 10)).padStart(2, '0') + ':30:00',
        history: [{ status: 'received', at: '2026-10-' + String(day).padStart(2, '0') + 'T08:00:00', by: 'النظام (تجريبي)' }].concat(
          status === 'received' ? [] : [{ status, at: '2026-10-' + String(day).padStart(2, '0') + 'T' + String(9 + (i % 9)).padStart(2, '0') + ':15:00', by: 'النظام (تجريبي)' }]),
        notes: []
      });
    }
    return out;
  };

  /* ───── State (memory only) ───── */
  let orders = buildFixtures();
  let grid = null;
  const resetState = () => { orders = buildFixtures(); };

  /* ───── Pure logic (unit-tested) ───── */
  const counts = (list) => {
    const c = { total: list.length };
    GROUPS.forEach((g) => { c[g.id] = list.filter((o) => g.keys.includes(o.status)).length; });
    return c;
  };
  /** Returns a NEW orders array with the order moved to `next`; throws RangeError when the transition is not allowed. */
  const applyTransition = (list, id, next, by, at) => {
    const o = list.find((x) => x.id === id);
    if (!o) throw new RangeError('Unknown order: ' + id);
    if (!allowedNext(o.status).includes(next)) throw new RangeError('Transition not allowed: ' + o.status + ' → ' + next);
    return list.map((x) => (x.id === id ? Object.assign({}, x, { status: next, history: x.history.concat([{ status: next, at: at || new Date().toISOString(), by: by || 'الإدارة (محاكاة)' }]) }) : x));
  };
  const addNote = (list, id, text, at) => {
    const t = String(text == null ? '' : text).trim();
    if (!t) throw new RangeError('Empty note');
    if (!list.some((x) => x.id === id)) throw new RangeError('Unknown order: ' + id);
    return list.map((x) => (x.id === id ? Object.assign({}, x, { notes: x.notes.concat([{ text: t.slice(0, 500), at: at || new Date().toISOString() }]) }) : x));
  };

  /* ───── Rendering ───── */
  const COLUMNS = [
    { key: 'no', label: 'رقم الطلب', type: 'number', format: (r) => '#' + r.no },
    { key: 'customer', label: 'العميل' },
    { key: 'service', label: 'الخدمة' },
    { key: 'provider', label: 'مقدم الخدمة', format: (r) => r.provider || 'لم يُسند بعد' },
    { key: 'area', label: 'المنطقة' },
    { key: 'status', label: 'الحالة', type: 'status', statusDomain: 'order' },
    { key: 'amount', label: 'المبلغ', type: 'number', align: 'end', format: (r) => (r.amount ? money(r.amount) : '') },
    { key: 'at', label: 'التاريخ', type: 'date' }
  ];
  const statusOptions = () => STATUS_CYCLE.map((k) => ({ value: k, label: label(k) }));

  const summaryHtml = () => {
    const c = counts(orders);
    return `<section class="ord-sum" aria-label="ملخص الطلبات">
      <div class="ord-stat"><span>الإجمالي</span><b>${nf(c.total)}</b></div>
      ${GROUPS.map((g) => `<div class="ord-stat"><span>${esc(g.label)}</span><b>${nf(c[g.id])}</b></div>`).join('')}</section>`;
  };

  const detailHtml = (o) => {
    const next = allowedNext(o.status);
    return `<form method="dialog" class="ord-dlg-in">
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">طلب #${esc(o.no)}</h2><p>${badge(o.status)}</p></div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق التفاصيل">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>إجراءات تجريبية: التغييرات تُحفظ في هذه الصفحة فقط ولا يتم إبلاغ العميل أو مقدم الخدمة.</span></p>
      <dl class="ord-facts">
        <div><dt>العميل</dt><dd>${esc(o.customer)}</dd></div><div><dt>الخدمة</dt><dd>${esc(o.service)} (${esc(o.category)})</dd></div>
        <div><dt>مقدم الخدمة</dt><dd>${esc(o.provider || 'لم يُسند بعد')}</dd></div><div><dt>المنطقة</dt><dd>${esc(o.area)}</dd></div>
        <div><dt>المبلغ</dt><dd>${esc(money(o.amount))}</dd></div><div><dt>تاريخ الطلب</dt><dd>${esc(dt(o.at))}</dd></div></dl>
      <section aria-labelledby="ord-h-tl"><h3 id="ord-h-tl">سجل الحالة</h3>
        <ol class="ord-tl">${o.history.map((h) => `<li>${badge(h.status, { size: 'sm' })}<small>${esc(dt(h.at))} — ${esc(h.by)}</small></li>`).join('')}</ol></section>
      <section aria-labelledby="ord-h-act"><h3 id="ord-h-act">تغيير الحالة (محاكاة)</h3>
        ${next.length ? `<div class="ord-act"><div class="hs-grid-field"><label for="ord-next">الحالة التالية</label>
          <select id="ord-next">${next.map((k) => `<option value="${esc(k)}">${esc(label(k))}</option>`).join('')}</select></div>
          <button type="button" class="adm-btn adm-btn-p" data-ord-apply>تطبيق محليًا</button></div>`
          : '<p class="ord-muted">هذا الطلب في حالة نهائية؛ لا توجد حالات تالية متاحة.</p>'}</section>
      <section aria-labelledby="ord-h-notes"><h3 id="ord-h-notes">ملاحظات داخلية</h3>
        ${o.notes.length ? `<ul class="ord-notes">${o.notes.map((n) => `<li>${esc(n.text)}<small>${esc(dt(n.at))}</small></li>`).join('')}</ul>` : '<p class="ord-muted">لا توجد ملاحظات.</p>'}
        <div class="ord-note"><div class="hs-grid-field"><label for="ord-note">إضافة ملاحظة</label><textarea id="ord-note" rows="2" maxlength="500"></textarea></div>
          <button type="button" class="adm-btn" data-ord-note>إضافة</button></div>
        <p class="ord-err" id="ord-err" role="alert" hidden></p></section>
    </form>`;
  };

  const render = (ctx) => {
    const L = root.HSAdminLive && root.HSAdminLive.enabled() ? root.HSAdminLive : null;   /* Firebase mode: real data + real routes only */
    if (L) orders = L.rows('orders');
    const wrap = root.document.createElement('div');
    wrap.className = 'ord';
    wrap.innerHTML = `<p class="dash-note">بيانات تجريبية محلية — ليست طلبات حقيقية، وأي تغيير يُفقد عند إعادة التحميل.</p>
      <div id="ord-sum"></div><div id="ord-grid"></div><dialog class="ord-dlg" id="ord-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const sum = wrap.querySelector('#ord-sum');
    const dlg = wrap.querySelector('#ord-dlg');
    let openId = null, opener = null;
    const paintSum = () => { sum.innerHTML = summaryHtml(); };
    paintSum();

    grid = root.HSDataGrid.create(wrap.querySelector('#ord-grid'), {
      caption: 'قائمة الطلبات', columns: COLUMNS, rows: orders, pageSize: 10, rowId: (r) => r.id,
      searchKeys: ['no', 'customer', 'service', 'provider', 'area'],
      filters: [{ key: 'status', label: 'الحالة', options: statusOptions() }, { key: 'category', label: 'التصنيف' }, { key: 'area', label: 'المنطقة' }],
      rowActions: [{ id: 'details', label: 'التفاصيل', onClick: (r) => open(r.id) }].concat(L && root.HSAdminProfile   /* live: the full profile (modules/profile-360.js) */
        ? [{ id: 'profile', label: 'الملف الكامل', onClick: (r) => { root.location.hash = root.HSAdminProfile.href('order', r.id); } }] : []),
      emptyText: 'لا توجد طلبات في البيانات التجريبية.',
      onRetry: () => grid.setRows(orders)
    });

    const sync = () => { grid.setRows(orders); paintSum(); };
    const showErr = (m) => { const e = dlg.querySelector('#ord-err'); if (e) { e.textContent = m; e.hidden = !m; } };
    const paintDlg = (focusSel) => {
      const o = orders.find((x) => x.id === openId); if (!o) return;
      dlg.innerHTML = detailHtml(o);
      const f = focusSel && dlg.querySelector(focusSel); if (f) f.focus();
    };
    function open(id) {
      openId = id; opener = root.document.activeElement;
      paintDlg();
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      const c = dlg.querySelector('[data-ord-close]'); if (c) c.focus();
    }
    const close = () => { if (dlg.open) { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); } };
    dlg.addEventListener('close', () => {
      const rowId = openId; openId = null;
      /* The grid repaints after a simulated change, so the original button may be detached: refocus the same row's button. */
      const btn = (opener && opener.isConnected && opener) || wrap.querySelector('tr[data-row="' + rowId + '"] [data-act="details"]');
      if (btn && btn.focus) btn.focus(); opener = null;
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-ord-close')) { close(); return; }
      if (L && b.hasAttribute('data-ord-apply')) { const next = dlg.querySelector('#ord-next').value; L.status('orders', openId, next).then((res) => { if (res.ok) { orders = L.rows('orders'); sync(); paintDlg('[data-ord-close]'); } else showErr(L.errorText(res)); }); return; }
      if (L && b.hasAttribute('data-ord-note')) { showErr(L.UNSUPPORTED); return; }
      try {
        if (b.hasAttribute('data-ord-apply')) {
          orders = applyTransition(orders, openId, dlg.querySelector('#ord-next').value); sync(); paintDlg('[data-ord-close]');
          if (ctx && ctx.shell) { const l = root.document.getElementById('adm-live'); if (l) l.textContent = 'تم تغيير حالة الطلب محليًا (محاكاة).'; }
        } else if (b.hasAttribute('data-ord-note')) {
          const ta = dlg.querySelector('#ord-note'); orders = addNote(orders, openId, ta.value); sync(); paintDlg('#ord-note');
        }
      } catch (err) { showErr(err.message === 'Empty note' ? 'اكتب نص الملاحظة أولًا.' : 'تعذر تنفيذ الإجراء على هذا الطلب.'); }
    });
    return wrap;
  };

  const api = { NEXT, GROUPS, allowedNext, groupOf, counts, applyTransition, addNote, buildFixtures, resetState, _orders: () => orders };
  root.HSAdminOrdersPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('orders', {
      title: 'الطلبات',
      description: 'متابعة الطلبات والبحث والتصفية وفتح التفاصيل وتجربة تغيير الحالة محليًا.',
      actions: [{ id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { resetState(); ctx.shell.refresh(); } }],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
