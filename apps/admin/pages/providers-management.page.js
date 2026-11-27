/**
 * MODULE: providers-management.page
 * RESPONSIBILITY: Admin providers management — summary counts, searchable/filterable/sortable providers grid, and a
 *   details dialog with profile facts, document checklist, simulated review decisions and internal notes.
 * STATUS: IMPLEMENTED (DEMO). 24 local fixtures with obviously fake phones; every change is in memory only and is
 *   labelled as a local simulation (nothing is saved, sent to the provider or enforced anywhere).
 * Depends on: HSAdminShell, HSDataGrid, HSStatusBadge («provider» domain), HSDialog.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG-u-nu-latn').format(n); } catch (e) { return String(n); } };
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' }).format(t); } catch (e) { return iso; } };

  const STATUS = { approved: 'مقبول', pending: 'قيد المراجعة', suspended: 'معلّق', rejected: 'مرفوض' };
  const B = root.HSStatusBadge;
  const label = (s) => (B && B.known('provider', s) ? B.label('provider', s) : (STATUS[s] || 'غير محدد'));
  const badge = (s) => (B ? B.render('provider', s) : esc(label(s)));

  /** Allowed review moves (local simulation only). */
  const NEXT = {
    pending: [{ to: 'approved', text: 'قبول المزود محليًا', cls: 'adm-btn-p' }, { to: 'rejected', text: 'رفض الطلب محليًا', cls: 'adm-btn-d' }],
    approved: [{ to: 'warned', text: 'إنذار: اتفاق بره المنصة', cls: 'adm-btn' }, { to: 'suspended', text: 'تعليق المزود محليًا', cls: 'adm-btn-d' }],   /* «warned» is an action, not a status: the 2nd warning suspends */
    suspended: [{ to: 'approved', text: 'إعادة التفعيل محليًا', cls: 'adm-btn-p' }],
    rejected: [{ to: 'pending', text: 'إعادة للمراجعة محليًا', cls: 'adm-btn' }]
  };
  const DOCS = [{ key: 'id', label: 'إثبات الهوية' }, { key: 'skill', label: 'شهادة/إثبات المهنة' }, { key: 'photo', label: 'صورة شخصية' }];

  /* ───── Fixtures (demo) ───── */
  const NAMES = ['محمود السيد', 'عبد الرحمن عادل', 'سعيد فتحي', 'وليد حسن', 'كريم نبيل', 'أيمن رمضان', 'هشام علي', 'رامي كمال', 'بلال صلاح', 'إسلام سمير', 'جمال إبراهيم', 'فادي محمود'];
  const SPECS = ['كهرباء', 'سباكة', 'نجارة', 'تكييف', 'دهانات'];
  const AREAS = ['مدينة نصر', 'المعادي', 'الدقي', 'التجمع الخامس', 'الهرم', 'الشيخ زايد'];
  const buildFixtures = () => {
    const out = [];
    for (let i = 0; i < 24; i++) {
      const status = i % 6 === 5 ? 'rejected' : (i % 5 === 4 ? 'pending' : (i % 9 === 8 ? 'suspended' : 'approved'));
      const active = status === 'approved' || status === 'suspended';
      const jobs = active ? 6 + ((i * 11) % 90) : 0;
      const docs = { id: status !== 'rejected' || i % 2 === 0, skill: active || i % 3 === 0, photo: status !== 'pending' || i % 2 === 1 };
      if (active) { docs.id = docs.skill = docs.photo = true; }
      out.push({
        id: 'p' + (3001 + i), name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + nf(Math.floor(i / NAMES.length) + 1) : ''),
        phone: '0100000' + String(2000 + i * 41).slice(-4), specialty: SPECS[i % SPECS.length], area: AREAS[(i * 5) % AREAS.length], status,
        rating: active ? Math.round((3.6 + ((i * 7) % 15) / 10) * 10) / 10 : null, jobs, docs,
        joined: '2026-0' + (1 + (i % 9)) + '-' + String(1 + ((i * 5) % 28)).padStart(2, '0'), notes: []
      });
    }
    return out;
  };

  let providers = buildFixtures();
  let grid = null;
  const resetState = () => { providers = buildFixtures(); };

  /* ───── Pure logic (unit-tested) ───── */
  const counts = (list) => ({
    total: list.length,
    approved: list.filter((p) => p.status === 'approved').length,
    pending: list.filter((p) => p.status === 'pending').length,
    suspended: list.filter((p) => p.status === 'suspended').length,
    rejected: list.filter((p) => p.status === 'rejected').length
  });
  const allowedNext = (s) => (NEXT[s] || []).map((x) => x.to);
  const docsComplete = (p) => DOCS.every((d) => p.docs && p.docs[d.key]);
  const setStatus = (list, id, next) => {
    const p = list.find((x) => x.id === id);
    if (!p) throw new RangeError('Unknown provider: ' + id);
    if (!allowedNext(p.status).includes(next)) throw new RangeError('Transition not allowed: ' + p.status + ' → ' + next);
    return list.map((x) => (x.id === id ? Object.assign({}, x, { status: next }) : x));
  };
  const addNote = (list, id, text, at) => {
    const t = String(text == null ? '' : text).trim();
    if (!t) throw new RangeError('Empty note');
    if (!list.some((x) => x.id === id)) throw new RangeError('Unknown provider: ' + id);
    return list.map((x) => (x.id === id ? Object.assign({}, x, { notes: x.notes.concat([{ text: t.slice(0, 500), at: at || new Date().toISOString() }]) }) : x));
  };

  /* ───── Rendering ───── */
  const COLUMNS = [
    { key: 'name', label: 'مقدم الخدمة' },
    { key: 'phone', label: 'الهاتف (تجريبي)', html: (r) => `<bdi dir="ltr">${esc(r.phone)}</bdi>` },
    { key: 'specialty', label: 'التخصص' },
    { key: 'area', label: 'المنطقة' },
    { key: 'rating', label: 'التقييم', type: 'number', align: 'end', format: (r) => (r.rating == null ? '' : nf(r.rating)) },
    { key: 'jobs', label: 'الأعمال المنجزة', type: 'number', align: 'end' },
    { key: 'status', label: 'حالة الملف', type: 'status', statusDomain: 'provider' }
  ];
  const summaryHtml = () => {
    const c = counts(providers);
    const s = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${nf(v)}</b></div>`;
    return `<section class="ord-sum" aria-label="ملخص مقدمي الخدمة">${s('الإجمالي', c.total)}${s('مقبولون', c.approved)}${s('قيد المراجعة', c.pending)}${s('معلّقون', c.suspended)}${s('مرفوضون', c.rejected)}</section>`;
  };
  const detailHtml = (p) => {
    const acts = NEXT[p.status] || [];
    return `<form method="dialog" class="ord-dlg-in">
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">${esc(p.name)}</h2><p>${badge(p.status)}</p></div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق التفاصيل">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>إجراءات تجريبية: القرارات محلية في هذه الصفحة فقط ولا تصل إلى مقدم الخدمة ولا تغيّر صلاحياته.</span></p>
      <dl class="ord-facts">
        <div><dt>الهاتف (تجريبي)</dt><dd><bdi dir="ltr">${esc(p.phone)}</bdi></dd></div><div><dt>التخصص</dt><dd>${esc(p.specialty)}</dd></div>
        <div><dt>المنطقة</dt><dd>${esc(p.area)}</dd></div><div><dt>تاريخ التسجيل</dt><dd>${esc(dt(p.joined))}</dd></div>
        <div><dt>التقييم</dt><dd>${p.rating == null ? '—' : nf(p.rating) + ' / ' + nf(5)}</dd></div><div><dt>الأعمال المنجزة</dt><dd>${nf(p.jobs)}</dd></div><div><dt>الإنذارات</dt><dd>${nf(p.warnings || 0)}${(p.warnings || 0) >= 1 ? ' — الإنذار التاني بيوقف الحساب' : ''}</dd></div></dl>
      <section aria-labelledby="ord-h-docs"><h3 id="ord-h-docs">المستندات</h3>
        <ul class="ord-notes">${DOCS.map((d) => `<li>${esc(d.label)} — ${p.docs[d.key] ? 'مرفق' : '<b>ناقص</b>'}</li>`).join('')}</ul>
        ${docsComplete(p) ? '' : '<p class="ord-muted">المستندات غير مكتملة.</p>'}</section>
      <section aria-labelledby="ord-h-act"><h3 id="ord-h-act">قرار المراجعة (محاكاة)</h3>
        ${acts.length ? `<div class="ord-act">${acts.map((a) => `<button type="button" class="adm-btn ${a.cls}" data-ord-status="${a.to}">${a.text}</button>`).join('')}</div>` : ''}</section>
      <section aria-labelledby="ord-h-notes"><h3 id="ord-h-notes">ملاحظات داخلية</h3>
        ${p.notes.length ? `<ul class="ord-notes">${p.notes.map((n) => `<li>${esc(n.text)}<small>${esc(dt(n.at))}</small></li>`).join('')}</ul>` : '<p class="ord-muted">لا توجد ملاحظات.</p>'}
        <div class="ord-note"><div class="hs-grid-field"><label for="ord-note">إضافة ملاحظة</label><textarea id="ord-note" rows="2" maxlength="500"></textarea></div>
          <button type="button" class="adm-btn" data-ord-note>إضافة</button></div>
        <p class="ord-err" id="ord-err" role="alert" hidden></p></section></form>`;
  };

  const render = () => {
    const L = root.HSAdminLive && root.HSAdminLive.enabled() ? root.HSAdminLive : null;   /* Firebase mode: real data + real routes only */
    if (L) providers = L.rows('providers');
    const wrap = root.document.createElement('div');
    wrap.className = 'ord';
    wrap.innerHTML = `<p class="dash-note">بيانات تجريبية محلية — ليست بيانات مقدمي خدمة حقيقية، وأي تغيير يُفقد عند إعادة التحميل.</p>
      <div id="ord-sum"></div><div id="ord-grid"></div><dialog class="ord-dlg" id="ord-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const sum = wrap.querySelector('#ord-sum'), dlgEl = wrap.querySelector('#ord-dlg');
    let openId = null;
    const paintSum = () => { sum.innerHTML = summaryHtml(); };
    paintSum();
    grid = root.HSDataGrid.create(wrap.querySelector('#ord-grid'), {
      caption: 'قائمة مقدمي الخدمة', columns: COLUMNS, rows: providers, pageSize: 10, rowId: (r) => r.id,
      searchKeys: ['name', 'phone', 'specialty', 'area'],
      filters: [{ key: 'status', label: 'حالة الملف', options: Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k] })) }, { key: 'specialty', label: 'التخصص' }, { key: 'area', label: 'المنطقة' }],
      rowActions: [{ id: 'details', label: 'التفاصيل', onClick: (r) => { openId = r.id; paintDlg(); d.open(); } }].concat(L && root.HSAdminProfile   /* live: the full profile (modules/profile-360.js) */
        ? [{ id: 'profile', label: 'الملف الكامل', onClick: (r) => { root.location.hash = root.HSAdminProfile.href('provider', r.id); } }] : []),
      emptyText: 'لا يوجد مقدمو خدمة في البيانات التجريبية.', onRetry: () => grid.setRows(providers)
    });
    const sync = () => { grid.setRows(providers); paintSum(); };
    const showErr = (m) => { const e = dlgEl.querySelector('#ord-err'); if (e) { e.textContent = m; e.hidden = !m; } };
    const paintDlg = (sel) => { const p = providers.find((x) => x.id === openId); if (!p) return; dlgEl.innerHTML = detailHtml(p); const f = sel && dlgEl.querySelector(sel); if (f) f.focus(); };
    const d = root.HSDialog.attach(dlgEl, {
      closeSelector: '[data-ord-close]',
      fallbackFocus: () => wrap.querySelector('tr[data-row="' + openId + '"] [data-act="details"]') || wrap.querySelector('.hs-grid-search input'),
      onClose: () => { openId = null; }
    });
    d.onClick((b) => {
      if (L && b.dataset.ordStatus) { L.status('providers', openId, b.dataset.ordStatus).then((res) => { if (res.ok) { providers = L.rows('providers'); sync(); paintDlg('[data-ord-close]'); } else showErr(L.errorText(res)); }); return; }
      if (L && b.hasAttribute('data-ord-note')) { showErr(L.UNSUPPORTED); return; }
      try {
        if (b.dataset.ordStatus === 'warned') { providers = providers.map((p) => (p.id !== openId ? p : { ...p, warnings: (p.warnings || 0) + 1, status: (p.warnings || 0) + 1 >= 2 ? 'suspended' : p.status })); sync(); paintDlg('[data-ord-close]'); return; }
    if (b.dataset.ordStatus) { providers = setStatus(providers, openId, b.dataset.ordStatus); sync(); paintDlg('[data-ord-close]'); }
        else if (b.hasAttribute('data-ord-note')) { providers = addNote(providers, openId, dlgEl.querySelector('#ord-note').value); sync(); paintDlg('#ord-note'); }
      } catch (err) { showErr(err.message === 'Empty note' ? 'اكتب نص الملاحظة أولًا.' : 'تعذر تنفيذ الإجراء على هذا المزود.'); }
    });
    return wrap;
  };

  const api = { STATUS, DOCS, allowedNext, docsComplete, counts, setStatus, addNote, buildFixtures, resetState, _providers: () => providers };
  root.HSAdminProvidersPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('providers', {
      title: 'مقدمو الخدمة',
      description: 'قائمة مقدمي الخدمة وحالة ملفاتهم، مع البحث والتصفية وفتح الملف وتجربة قرارات المراجعة محليًا.',
      actions: [{ id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { resetState(); ctx.shell.refresh(); } }],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
