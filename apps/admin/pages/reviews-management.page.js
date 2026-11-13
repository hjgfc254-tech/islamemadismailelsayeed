/**
 * MODULE: reviews-management.page
 * RESPONSIBILITY: Admin reviews management — summary counts, searchable/filterable/sortable reviews grid, and a details dialog
 *   with the review, its content report (if any), simulated moderation decisions (each one REQUIRES a written reason that is
 *   recorded in the decision log) and internal notes.
 * STATUS: IMPLEMENTED (DEMO). 24 local fixtures with neutral placeholder review texts; every change is in memory only and labelled as
 *   a local simulation (nothing is published, hidden, or sent to the customer/provider). No moderation policy text is invented here.
 * Depends on: HSAdminShell, HSDataGrid, HSStatusBadge (registers the «review» status domain here if absent), HSDialog.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(t); } catch (e) { return iso; } };

  const STATUS = {
    published: { label: 'منشورة', tone: 'success', icon: 'check' },
    flagged: { label: 'عليها بلاغ', tone: 'warning', icon: 'warn' },
    hidden: { label: 'مخفية', tone: 'neutral', icon: 'st-closed' }
  };
  const B = root.HSStatusBadge;
  if (B && B.domains().indexOf('review') === -1) B.register('review', STATUS);
  const badge = (s) => (B ? B.render('review', s) : esc((STATUS[s] || {}).label || 'غير محدد'));
  const NEXT = {
    flagged: [{ to: 'published', text: 'إبقاء المراجعة منشورة محليًا', cls: 'adm-btn-p' }, { to: 'hidden', text: 'إخفاء المراجعة محليًا', cls: 'adm-btn-d' }],
    published: [{ to: 'hidden', text: 'إخفاء المراجعة محليًا', cls: 'adm-btn-d' }],
    hidden: [{ to: 'published', text: 'إعادة النشر محليًا', cls: 'adm-btn-p' }]
  };
  const REASONS = ['محتوى مسيء', 'محتوى غير مناسب', 'مراجعة غير حقيقية', 'تتضمن بيانات شخصية', 'أخرى'];
  const REPORTERS = { provider: 'مقدم الخدمة', customer: 'عميل آخر' };
  const REASON_MIN = 3, REASON_MAX = 300;

  /* ───── Fixtures (demo) ───── */
  const CUST = ['أحمد إبراهيم', 'منى السيد', 'خالد محمود', 'سارة عادل', 'ياسر فتحي', 'هدى حسن'];
  const PROV = ['محمود السيد', 'سعيد فتحي', 'وليد حسن', 'كريم نبيل', 'أيمن رمضان'];
  const TEXTS = ['نص تجريبي: الخدمة كانت جيدة والفني التزم بالموعد.', 'نص تجريبي: العمل تم بإتقان وبسعر مناسب.', 'نص تجريبي: تأخر الفني قليلًا لكن النتيجة مقبولة.', 'نص تجريبي: لم أكن راضيًا عن جودة التشطيب.', 'نص تجريبي: تعامل محترم وسرعة في الإنجاز.', 'نص تجريبي: الخدمة أقل من المتوقع.'];
  const buildFixtures = () => Array.from({ length: 24 }, (_, i) => {
    const status = i % 6 === 2 ? 'flagged' : (i % 8 === 5 ? 'hidden' : 'published'), created = '2026-10-' + String(1 + ((i * 4) % 28)).padStart(2, '0');
    const rating = 1 + ((i * 3) % 5);
    const reported = status !== 'published';
    return {
      id: 'r' + (6001 + i), customer: CUST[i % CUST.length], provider: PROV[(i * 3) % PROV.length], orderNo: 1001 + ((i * 5) % 30), rating, text: TEXTS[i % TEXTS.length], created, status,
      report: reported ? { reason: REASONS[i % (REASONS.length - 1)], by: i % 2 ? 'provider' : 'customer', at: created, resolved: status === 'hidden' } : null,
      log: status === 'hidden' ? [{ kind: 'decision', text: 'إخفاء المراجعة — السبب: مخالفة لمعايير المحتوى (بيانات تجريبية)', at: created }] : []
    };
  });

  let items = buildFixtures();
  let grid = null;
  const resetState = () => { items = buildFixtures(); };

  /* ───── Pure logic (unit-tested) ───── */
  const counts = (list) => {
    const pub = list.filter((r) => r.status === 'published');
    return { total: list.length, published: pub.length, flagged: list.filter((r) => r.status === 'flagged').length, hidden: list.filter((r) => r.status === 'hidden').length,
      average: pub.length ? Math.round((pub.reduce((a, r) => a + r.rating, 0) / pub.length) * 10) / 10 : null };
  };
  const allowedNext = (s) => (NEXT[s] || []).map((x) => x.to);
  const get = (list, id) => { const r = list.find((x) => x.id === id); if (!r) throw new RangeError('Unknown review: ' + id); return r; };
  const entry = (kind, text, at) => ({ kind, text, at: at || new Date().toISOString() });
  /** A moderation decision needs a written reason (trimmed, 3–300 chars) — it is recorded in the log. */
  const decide = (list, id, next, reason, at) => {
    const r = get(list, id);
    if (!allowedNext(r.status).includes(next)) throw new RangeError('Transition not allowed: ' + r.status + ' → ' + next);
    const why = String(reason == null ? '' : reason).trim();
    if (why.length < REASON_MIN) throw new RangeError('Reason required');
    const verb = next === 'hidden' ? 'إخفاء المراجعة' : (r.status === 'flagged' ? 'إبقاء المراجعة منشورة' : 'إعادة نشر المراجعة');
    return list.map((x) => (x.id === id ? Object.assign({}, x, { status: next, report: x.report ? Object.assign({}, x.report, { resolved: true }) : x.report, log: x.log.concat([entry('decision', verb + ' — السبب: ' + why.slice(0, REASON_MAX), at)]) }) : x));
  };
  const addNote = (list, id, text, at) => {
    const t = String(text == null ? '' : text).trim();
    if (!t) throw new RangeError('Empty note');
    get(list, id);
    return list.map((x) => (x.id === id ? Object.assign({}, x, { log: x.log.concat([entry('note', t.slice(0, 500), at)]) }) : x));
  };

  /* ───── Rendering ───── */
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const COLUMNS = [
    { key: 'customer', label: 'العميل' }, { key: 'provider', label: 'مقدم الخدمة' },
    { key: 'rating', label: 'التقييم', type: 'number', align: 'end', format: (r) => nf(r.rating) + ' / ' + nf(5) },
    { key: 'text', label: 'المراجعة', sortable: false, format: (r) => (r.text.length > 42 ? r.text.slice(0, 42) + '…' : r.text) },
    { key: 'created', label: 'التاريخ', type: 'date' },
    { key: 'status', label: 'الحالة', type: 'status', statusDomain: 'review' }
  ];
  const summaryHtml = () => {
    const c = counts(items); const s = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${v}</b></div>`;
    return `<section class="ord-sum" aria-label="ملخص التقييمات">${s('الإجمالي', nf(c.total))}${s('منشورة', nf(c.published))}${s('بلاغات مفتوحة', nf(c.flagged))}${s('مخفية', nf(c.hidden))}${s('متوسط المنشورة', c.average == null ? '—' : nf(c.average))}</section>`;
  };
  const detailHtml = (r, st) => {
    const acts = NEXT[r.status] || [];
    return `<form method="dialog" class="ord-dlg-in">
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">مراجعة ${esc(r.customer)} لـ ${esc(r.provider)}</h2><p>${badge(r.status)}</p></div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق التفاصيل">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>إجراءات تجريبية: القرارات محلية في هذه الصفحة فقط ولا تغيّر ما يراه العميل أو مقدم الخدمة.</span></p>
      <dl class="ord-facts"><div><dt>التقييم</dt><dd><span aria-hidden="true">${stars(r.rating)}</span> ${nf(r.rating)} / ${nf(5)}</dd></div><div><dt>الطلب المرتبط</dt><dd>#${esc(r.orderNo)}</dd></div>
        <div><dt>تاريخ المراجعة</dt><dd>${esc(dt(r.created))}</dd></div><div><dt>مقدم الخدمة</dt><dd>${esc(r.provider)}</dd></div></dl>
      <section aria-labelledby="rv-h-t"><h3 id="rv-h-t">نص المراجعة</h3><p>${esc(r.text)}</p></section>
      ${r.report ? `<section aria-labelledby="rv-h-r"><h3 id="rv-h-r">البلاغ</h3><dl class="ord-facts"><div><dt>سبب البلاغ</dt><dd>${esc(r.report.reason)}</dd></div><div><dt>مقدم البلاغ</dt><dd>${esc(REPORTERS[r.report.by] || '—')}</dd></div>
        <div><dt>تاريخ البلاغ</dt><dd>${esc(dt(r.report.at))}</dd></div><div><dt>حالة البلاغ</dt><dd>${r.report.resolved ? 'تمت مراجعته' : 'مفتوح'}</dd></div></dl></section>` : ''}
      <section aria-labelledby="ord-h-act"><h3 id="ord-h-act">قرار المراجعة (محاكاة)</h3>
        ${acts.length ? `<div class="hs-grid-field"><label for="rv-reason">سبب القرار (مطلوب ويُسجَّل)</label><textarea id="rv-reason" rows="2" maxlength="${REASON_MAX}">${esc(st.reason || '')}</textarea></div>
        <div class="ord-act">${acts.map((a) => `<button type="button" class="adm-btn ${a.cls}" data-ord-status="${a.to}">${a.text}</button>`).join('')}</div>` : ''}</section>
      <section aria-labelledby="ord-h-notes"><h3 id="ord-h-notes">سجل القرارات والملاحظات</h3>
        ${r.log.length ? `<ul class="ord-tl">${r.log.slice().reverse().map((l) => `<li><span>${l.kind === 'note' ? 'ملاحظة: ' : ''}${esc(l.text)}</span><small>${esc(dt(l.at))}</small></li>`).join('')}</ul>` : '<p class="ord-muted">لا توجد قرارات أو ملاحظات.</p>'}
        <div class="ord-note"><div class="hs-grid-field"><label for="ord-note">إضافة ملاحظة داخلية</label><textarea id="ord-note" rows="2" maxlength="500"></textarea></div>
          <button type="button" class="adm-btn" data-ord-note>إضافة</button></div>
        <p class="ord-err" id="ord-err" role="alert" hidden></p></section></form>`;
  };

  const render = () => {
    const wrap = root.document.createElement('div'); wrap.className = 'ord';
    wrap.innerHTML = `<p class="dash-note">بيانات تجريبية محلية — ليست مراجعات حقيقية، وأي تغيير يُفقد عند إعادة التحميل.</p>
      <div id="ord-sum"></div><div id="ord-grid"></div><dialog class="ord-dlg" id="ord-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const sum = wrap.querySelector('#ord-sum'), dlgEl = wrap.querySelector('#ord-dlg');
    let openId = null, st = {};
    const paintSum = () => { sum.innerHTML = summaryHtml(); }; paintSum();
    grid = root.HSDataGrid.create(wrap.querySelector('#ord-grid'), {
      caption: 'قائمة التقييمات', columns: COLUMNS, rows: items, pageSize: 10, rowId: (r) => r.id,
      searchKeys: ['customer', 'provider', 'text'],
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k].label })) },
        { key: 'rating', label: 'التقييم', options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: nf(n) + ' / ' + nf(5) })) }, { key: 'provider', label: 'مقدم الخدمة' }],
      rowActions: [{ id: 'details', label: 'التفاصيل', onClick: (r) => { openId = r.id; st = {}; paintDlg(); d.open(); } }],
      emptyText: 'لا توجد تقييمات في البيانات التجريبية.', onRetry: () => grid.setRows(items)
    });
    const sync = () => { grid.setRows(items); paintSum(); };
    const showErr = (m) => { const e = dlgEl.querySelector('#ord-err'); if (e) { e.textContent = m; e.hidden = !m; } };
    const paintDlg = (sel) => { const r = items.find((x) => x.id === openId); if (!r) return; dlgEl.innerHTML = detailHtml(r, st); const f = sel && dlgEl.querySelector(sel); if (f) f.focus(); };
    const d = root.HSDialog.attach(dlgEl, {
      closeSelector: '[data-ord-close]',
      fallbackFocus: () => wrap.querySelector('tr[data-row="' + openId + '"] [data-act="details"]') || wrap.querySelector('.hs-grid-search input'),
      onClose: () => { openId = null; st = {}; }
    });
    d.onClick((b) => {
      try {
        if (b.dataset.ordStatus) {
          const reason = dlgEl.querySelector('#rv-reason').value;
          try { items = decide(items, openId, b.dataset.ordStatus, reason); st = {}; sync(); paintDlg('[data-ord-close]'); }
          catch (err) { if (err.message === 'Reason required') { st = { reason }; paintDlg('#rv-reason'); showErr('اكتب سبب القرار (' + nf(REASON_MIN) + ' أحرف على الأقل) لتوثيقه.'); } else throw err; }
        } else if (b.hasAttribute('data-ord-note')) { items = addNote(items, openId, dlgEl.querySelector('#ord-note').value); sync(); paintDlg('#ord-note'); }
      } catch (err) { showErr(err.message === 'Empty note' ? 'اكتب نص الملاحظة أولًا.' : 'تعذر تنفيذ الإجراء على هذه المراجعة.'); }
    });
    return wrap;
  };

  const api = { STATUS, REASONS, REASON_MIN, allowedNext, counts, decide, addNote, buildFixtures, resetState, _items: () => items };
  root.HSAdminReviewsPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('reviews', {
      title: 'التقييمات',
      description: 'قائمة التقييمات والمراجعات والبلاغات المرتبطة بها، مع البحث والتصفية وتجربة قرارات الإخفاء والإبقاء بسبب موثّق محليًا.',
      actions: [{ id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { resetState(); ctx.shell.refresh(); } }],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
