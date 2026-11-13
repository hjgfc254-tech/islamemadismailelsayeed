/**
 * MODULE: customers-management.page
 * RESPONSIBILITY: Admin customers management — summary counts, searchable/filterable/sortable customers grid, and a details
 *   dialog with activity summary, recent orders, simulated suspend/reactivate and internal notes.
 * STATUS: IMPLEMENTED (DEMO). 24 local fixtures with obviously fake phone numbers; every change is in memory only and is
 *   labelled as a local simulation (nothing is saved, sent or enforced).
 * Depends on: HSAdminShell, HSDataGrid, HSStatusBadge (registers the «customer» status domain here if absent).
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const money = (n) => (Number.isFinite(n) && n > 0 ? nf(n) + ' ج.م' : '—');
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(t); } catch (e) { return iso; } };

  const STATUS = {
    active: { label: 'نشط', tone: 'success', icon: 'check' },
    inactive: { label: 'غير نشط', tone: 'neutral', icon: 'st-closed' },
    suspended: { label: 'موقوف', tone: 'danger', icon: 'warn' }
  };
  const B = root.HSStatusBadge;
  if (B && B.domains().indexOf('customer') === -1) B.register('customer', STATUS);
  const label = (s) => (B && B.known('customer', s) ? B.label('customer', s) : (STATUS[s] ? STATUS[s].label : 'غير محدد'));
  const badge = (s, o) => (B ? B.render('customer', s, o) : esc(label(s)));

  /* ───── Fixtures (demo) ───── */
  const NAMES = ['أحمد إبراهيم', 'منى السيد', 'خالد محمود', 'سارة عادل', 'ياسر فتحي', 'هدى حسن', 'عمرو نبيل', 'نهى رمضان', 'مصطفى علي', 'دينا كمال', 'إيمان صلاح', 'طارق سمير'];
  const AREAS = ['مدينة نصر', 'المعادي', 'الدقي', 'التجمع الخامس', 'الهرم', 'الشيخ زايد'];
  const SERVICES = ['إصلاح كهرباء', 'تسريب مياه', 'تركيب باب', 'صيانة تكييف', 'دهان غرفة'];
  const buildFixtures = () => {
    const out = [];
    for (let i = 0; i < 24; i++) {
      const status = i % 11 === 10 ? 'suspended' : (i % 4 === 3 ? 'inactive' : 'active');
      const orders = status === 'inactive' ? i % 2 : 1 + ((i * 3) % 9);
      const day = 1 + ((i * 5) % 28);
      out.push({
        id: 'c' + (2001 + i), name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + nf(Math.floor(i / NAMES.length) + 1) : ''),
        phone: '0100000' + String(1000 + i * 37).slice(-4), area: AREAS[(i * 5) % AREAS.length], status, orders,
        spent: orders * (180 + (i % 5) * 90), joined: '2026-0' + (1 + (i % 9)) + '-' + String(day).padStart(2, '0'),
        last: orders ? '2026-10-' + String(day).padStart(2, '0') : null,
        recent: Array.from({ length: Math.min(orders, 3) }, (_, k) => ({ no: 1001 + ((i + k * 7) % 30), service: SERVICES[(i + k) % SERVICES.length] })),
        notes: []
      });
    }
    return out;
  };

  let customers = buildFixtures();
  let grid = null;
  const resetState = () => { customers = buildFixtures(); };

  /* ───── Pure logic (unit-tested) ───── */
  const counts = (list) => ({
    total: list.length,
    active: list.filter((c) => c.status === 'active').length,
    inactive: list.filter((c) => c.status === 'inactive').length,
    suspended: list.filter((c) => c.status === 'suspended').length,
    spent: list.reduce((a, c) => a + (c.spent || 0), 0)
  });
  /** Allowed moves: active/inactive → suspended; suspended → active. */
  const allowedNext = (s) => (s === 'suspended' ? ['active'] : (s === 'active' || s === 'inactive' ? ['suspended'] : []));
  const setStatus = (list, id, next) => {
    const c = list.find((x) => x.id === id);
    if (!c) throw new RangeError('Unknown customer: ' + id);
    if (!allowedNext(c.status).includes(next)) throw new RangeError('Transition not allowed: ' + c.status + ' → ' + next);
    return list.map((x) => (x.id === id ? Object.assign({}, x, { status: next }) : x));
  };
  const addNote = (list, id, text, at) => {
    const t = String(text == null ? '' : text).trim();
    if (!t) throw new RangeError('Empty note');
    if (!list.some((x) => x.id === id)) throw new RangeError('Unknown customer: ' + id);
    return list.map((x) => (x.id === id ? Object.assign({}, x, { notes: x.notes.concat([{ text: t.slice(0, 500), at: at || new Date().toISOString() }]) }) : x));
  };

  /* ───── Rendering ───── */
  const COLUMNS = [
    { key: 'name', label: 'العميل' },
    { key: 'phone', label: 'الهاتف (تجريبي)', html: (r) => `<bdi dir="ltr">${esc(r.phone)}</bdi>` },
    { key: 'area', label: 'المنطقة' },
    { key: 'orders', label: 'عدد الطلبات', type: 'number', align: 'end' },
    { key: 'spent', label: 'إجمالي الإنفاق', type: 'number', align: 'end', format: (r) => (r.spent ? money(r.spent) : '') },
    { key: 'last', label: 'آخر طلب', type: 'date' },
    { key: 'status', label: 'الحالة', type: 'status', statusDomain: 'customer' }
  ];
  const summaryHtml = () => {
    const c = counts(customers);
    return `<section class="ord-sum" aria-label="ملخص العملاء">
      <div class="ord-stat"><span>الإجمالي</span><b>${nf(c.total)}</b></div><div class="ord-stat"><span>نشطون</span><b>${nf(c.active)}</b></div>
      <div class="ord-stat"><span>غير نشطين</span><b>${nf(c.inactive)}</b></div><div class="ord-stat"><span>موقوفون</span><b>${nf(c.suspended)}</b></div>
      <div class="ord-stat"><span>إجمالي الإنفاق</span><b>${nf(c.spent)}</b></div></section>`;
  };
  const detailHtml = (c) => {
    const next = allowedNext(c.status)[0];
    return `<form method="dialog" class="ord-dlg-in">
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">${esc(c.name)}</h2><p>${badge(c.status)}</p></div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق التفاصيل">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>إجراءات تجريبية: التغييرات محلية في هذه الصفحة فقط ولا تؤثر على حساب العميل.</span></p>
      <dl class="ord-facts">
        <div><dt>الهاتف (تجريبي)</dt><dd><bdi dir="ltr">${esc(c.phone)}</bdi></dd></div><div><dt>المنطقة</dt><dd>${esc(c.area)}</dd></div>
        <div><dt>تاريخ الانضمام</dt><dd>${esc(dt(c.joined))}</dd></div><div><dt>آخر طلب</dt><dd>${esc(dt(c.last))}</dd></div>
        <div><dt>عدد الطلبات</dt><dd>${nf(c.orders)}</dd></div><div><dt>إجمالي الإنفاق</dt><dd>${esc(money(c.spent))}</dd></div></dl>
      <section aria-labelledby="ord-h-tl"><h3 id="ord-h-tl">أحدث الطلبات</h3>
        ${c.recent.length ? `<ul class="ord-notes">${c.recent.map((o) => `<li>#${esc(o.no)} — ${esc(o.service)}</li>`).join('')}</ul>` : '<p class="ord-muted">لا توجد طلبات.</p>'}</section>
      <section aria-labelledby="ord-h-act"><h3 id="ord-h-act">حالة الحساب (محاكاة)</h3>
        ${next ? `<button type="button" class="adm-btn ${next === 'suspended' ? 'adm-btn-d' : 'adm-btn-p'}" data-ord-status="${next}">${next === 'suspended' ? 'إيقاف العميل محليًا' : 'إعادة التفعيل محليًا'}</button>` : ''}</section>
      <section aria-labelledby="ord-h-notes"><h3 id="ord-h-notes">ملاحظات داخلية</h3>
        ${c.notes.length ? `<ul class="ord-notes">${c.notes.map((n) => `<li>${esc(n.text)}<small>${esc(dt(n.at))}</small></li>`).join('')}</ul>` : '<p class="ord-muted">لا توجد ملاحظات.</p>'}
        <div class="ord-note"><div class="hs-grid-field"><label for="ord-note">إضافة ملاحظة</label><textarea id="ord-note" rows="2" maxlength="500"></textarea></div>
          <button type="button" class="adm-btn" data-ord-note>إضافة</button></div>
        <p class="ord-err" id="ord-err" role="alert" hidden></p></section></form>`;
  };

  const render = () => {
    const wrap = root.document.createElement('div');
    wrap.className = 'ord';
    wrap.innerHTML = `<p class="dash-note">بيانات تجريبية محلية — ليست بيانات عملاء حقيقية، وأي تغيير يُفقد عند إعادة التحميل.</p>
      <div id="ord-sum"></div><div id="ord-grid"></div><dialog class="ord-dlg" id="ord-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const sum = wrap.querySelector('#ord-sum'), dlg = wrap.querySelector('#ord-dlg');
    let openId = null, opener = null;
    const paintSum = () => { sum.innerHTML = summaryHtml(); };
    paintSum();
    grid = root.HSDataGrid.create(wrap.querySelector('#ord-grid'), {
      caption: 'قائمة العملاء', columns: COLUMNS, rows: customers, pageSize: 10, rowId: (r) => r.id,
      searchKeys: ['name', 'phone', 'area'],
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k].label })) }, { key: 'area', label: 'المنطقة' }],
      rowActions: [{ id: 'details', label: 'التفاصيل', onClick: (r) => open(r.id) }],
      emptyText: 'لا يوجد عملاء في البيانات التجريبية.', onRetry: () => grid.setRows(customers)
    });
    const sync = () => { grid.setRows(customers); paintSum(); };
    const showErr = (m) => { const e = dlg.querySelector('#ord-err'); if (e) { e.textContent = m; e.hidden = !m; } };
    const paintDlg = (sel) => { const c = customers.find((x) => x.id === openId); if (!c) return; dlg.innerHTML = detailHtml(c); const f = sel && dlg.querySelector(sel); if (f) f.focus(); };
    function open(id) {
      openId = id; opener = root.document.activeElement; paintDlg();
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      const c = dlg.querySelector('[data-ord-close]'); if (c) c.focus();
    }
    const close = () => { if (dlg.open) { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); } };
    dlg.addEventListener('close', () => {
      const rowId = openId; openId = null;
      const btn = (opener && opener.isConnected && opener) || wrap.querySelector('tr[data-row="' + rowId + '"] [data-act="details"]');
      if (btn && btn.focus) btn.focus(); opener = null;
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) { close(); return; }
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-ord-close')) { close(); return; }
      try {
        if (b.dataset.ordStatus) { customers = setStatus(customers, openId, b.dataset.ordStatus); sync(); paintDlg('[data-ord-close]'); }
        else if (b.hasAttribute('data-ord-note')) { customers = addNote(customers, openId, dlg.querySelector('#ord-note').value); sync(); paintDlg('#ord-note'); }
      } catch (err) { showErr(err.message === 'Empty note' ? 'اكتب نص الملاحظة أولًا.' : 'تعذر تنفيذ الإجراء على هذا العميل.'); }
    });
    return wrap;
  };

  const api = { STATUS, allowedNext, counts, setStatus, addNote, buildFixtures, resetState, _customers: () => customers };
  root.HSAdminCustomersPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('customers', {
      title: 'العملاء',
      description: 'قائمة العملاء وملخص نشاطهم، مع البحث والتصفية وفتح التفاصيل وتجربة تغيير الحالة محليًا.',
      actions: [{ id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { resetState(); ctx.shell.refresh(); } }],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
