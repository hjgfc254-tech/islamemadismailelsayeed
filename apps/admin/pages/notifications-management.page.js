/**
 * MODULE: notifications-management.page
 * RESPONSIBILITY: Admin notifications — two tabs: (1) templates grid + dialog to create/edit a template (validated, known placeholders only),
 *   preview it with sample values and simulate activate/disable; (2) a READ-ONLY demo delivery log with delivery statuses.
 * STATUS: IMPLEMENTED (DEMO). 10 template fixtures + 16 delivery-log fixtures, in memory only. NOTHING IS EVER SENT: the preview is a local
 *   rendering with sample data and the log is static demo data. Campaigns, scheduling, real audience selection and sending are NOT implemented.
 * Depends on: HSAdminShell, HSDataGrid, HSStatusBadge (registers «notification» and «delivery» domains here if absent), HSDialog.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG-u-nu-latn').format(n); } catch (e) { return String(n); } };
  const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();

  const STATUS = { draft: { label: 'مسودة', tone: 'neutral', icon: 'st-closed' }, active: { label: 'مفعّل', tone: 'success', icon: 'check' }, disabled: { label: 'معطّل', tone: 'warning', icon: 'warn' } };
  const DELIVERY = { delivered: { label: 'تم التسليم', tone: 'success', icon: 'check' }, partial: { label: 'تسليم جزئي', tone: 'warning', icon: 'warn' }, failed: { label: 'فشل التسليم', tone: 'danger', icon: 'warn' } };
  const B = root.HSStatusBadge;
  if (B && B.domains().indexOf('notification') === -1) B.register('notification', STATUS);
  if (B && B.domains().indexOf('delivery') === -1) B.register('delivery', DELIVERY);
  const badge = (d, s) => (B ? B.render(d, s) : esc(((d === 'delivery' ? DELIVERY : STATUS)[s] || {}).label || 'غير محدد'));
  const CHANNELS = { app: 'داخل التطبيق', push: 'إشعار فوري', sms: 'رسالة نصية' };
  const AUDIENCES = { customers: 'العملاء', providers: 'مقدمو الخدمة', all: 'الجميع' };
  const NEXT = { draft: [{ to: 'active', text: 'تفعيل القالب محليًا', cls: 'adm-btn-p' }], active: [{ to: 'disabled', text: 'تعطيل القالب محليًا', cls: 'adm-btn-d' }], disabled: [{ to: 'active', text: 'إعادة التفعيل محليًا', cls: 'adm-btn-p' }] };
  const LIMITS = { name: 60, title: 60, body: 200 };
  const SAMPLE = { name: 'أحمد', order_no: '1024', date: '2026/11/15' };
  const PLACEHOLDERS = Object.keys(SAMPLE);

  /* ───── Fixtures (demo) ───── */
  const buildTemplates = () => [
    ['تأكيد استلام الطلب', 'app', 'customers', 'تم استلام طلبك', 'مرحبًا {{name}}، استلمنا طلبك رقم {{order_no}}.', 'active'],
    ['تحديث حالة الطلب', 'push', 'customers', 'تحديث على طلبك', 'طلبك رقم {{order_no}} تغيّرت حالته.', 'active'],
    ['تذكير بالموعد', 'sms', 'customers', 'تذكير بموعدك', 'موعدك يوم {{date}} للطلب رقم {{order_no}}.', 'active'],
    ['طلب جديد لمقدم الخدمة', 'push', 'providers', 'طلب جديد', 'وصلك طلب جديد رقم {{order_no}}.', 'active'],
    ['ترحيب بمقدم خدمة', 'app', 'providers', 'أهلًا بك', 'مرحبًا {{name}}، ملفك قيد المراجعة.', 'draft'],
    ['طلب تقييم', 'app', 'customers', 'قيّم خدمتك', 'كيف كانت تجربتك في الطلب رقم {{order_no}}؟', 'active'],
    ['إشعار صيانة عام', 'app', 'all', 'إشعار من المنصة', 'تنبيه تجريبي بتاريخ {{date}}.', 'disabled'],
    ['تأخر الفني', 'sms', 'customers', 'تأخر بسيط', 'نعتذر، الفني سيتأخر عن الطلب رقم {{order_no}}.', 'draft'],
    ['اكتمال الخدمة', 'push', 'customers', 'اكتملت الخدمة', 'اكتمل الطلب رقم {{order_no}}. شكرًا {{name}}.', 'active'],
    ['تنبيه لمقدمي الخدمة', 'app', 'providers', 'تنبيه', 'تنبيه تجريبي لمقدمي الخدمة بتاريخ {{date}}.', 'disabled']
  ].map((r, i) => ({ id: 'n' + (7001 + i), name: r[0], channel: r[1], audience: r[2], title: r[3], body: r[4], status: r[5] }));
  const buildLog = () => Array.from({ length: 16 }, (_, i) => {
    const t = ['تأكيد استلام الطلب', 'تحديث حالة الطلب', 'تذكير بالموعد', 'طلب جديد لمقدم الخدمة', 'طلب تقييم', 'اكتمال الخدمة'][i % 6], ch = ['app', 'push', 'sms'][i % 3];
    const recipients = 20 + ((i * 17) % 80), delivered = i % 7 === 3 ? 0 : (i % 4 === 1 ? Math.max(1, recipients - 5 - (i % 6)) : recipients);
    return { id: 'l' + (8001 + i), template: t, channel: ch, audience: i % 2 ? 'customers' : 'providers', recipients, delivered, failed: recipients - delivered, sentAt: '2026-10-' + String(1 + ((i * 2) % 28)).padStart(2, '0') };
  });

  let templates = buildTemplates();
  let log = buildLog();
  let tplGrid = null, logGrid = null, createHook = null, showTab = null;
  const resetState = () => { templates = buildTemplates(); log = buildLog(); };

  /* ───── Pure logic (unit-tested) ───── */
  const deliveryStatus = (r) => (r.delivered >= r.recipients ? 'delivered' : (r.delivered <= 0 ? 'failed' : 'partial'));
  const rate = (list) => { const rec = list.reduce((a, r) => a + r.recipients, 0); return rec ? Math.round((list.reduce((a, r) => a + r.delivered, 0) / rec) * 100) : null; };
  const counts = (t, l) => ({ templates: t.length, active: t.filter((x) => x.status === 'active').length, draft: t.filter((x) => x.status === 'draft').length, logs: l.length, rate: rate(l) });
  const clean = (f) => { const g = (k) => String((f && f[k]) == null ? '' : f[k]); return { name: g('name').replace(/\s+/g, ' ').trim(), channel: g('channel'), audience: g('audience'), title: g('title').trim(), body: g('body').trim() }; };
  const unknownPlaceholders = (text) => (String(text).match(/\{\{\s*([^}]*?)\s*\}\}/g) || []).map((m) => m.replace(/[{}\s]/g, '')).filter((k) => !PLACEHOLDERS.includes(k));
  const validate = (fields, list, selfId) => {
    const v = clean(fields), errors = {};
    if (!v.name) errors.name = 'اكتب اسم القالب.'; else if (v.name.length < 2) errors.name = 'اسم القالب قصير جدًا.'; else if (v.name.length > LIMITS.name) errors.name = 'اسم القالب أطول من ' + nf(LIMITS.name) + ' حرفًا.';
    else if (list.some((x) => x.id !== selfId && norm(x.name) === norm(v.name))) errors.name = 'يوجد قالب بنفس الاسم.';
    if (!CHANNELS[v.channel]) errors.channel = 'اختر قناة من القائمة.';
    if (!AUDIENCES[v.audience]) errors.audience = 'اختر جمهورًا من القائمة.';
    if (!v.title) errors.title = 'اكتب عنوان الإشعار.'; else if (v.title.length > LIMITS.title) errors.title = 'العنوان أطول من ' + nf(LIMITS.title) + ' حرفًا.';
    else if (unknownPlaceholders(v.title).length) errors.title = 'متغيرات غير معروفة: ' + unknownPlaceholders(v.title).join('، ');
    if (!v.body) errors.body = 'اكتب نص الإشعار.'; else if (v.body.length > LIMITS.body) errors.body = 'النص أطول من ' + nf(LIMITS.body) + ' حرفًا.';
    else if (unknownPlaceholders(v.body).length) errors.body = 'متغيرات غير معروفة: ' + unknownPlaceholders(v.body).join('، ');
    return { ok: !Object.keys(errors).length, errors, value: v };
  };
  const fail = (errors) => { const e = new RangeError('Invalid template'); e.errors = errors; return e; };
  const nextId = (list) => 'n' + (Math.max(7000, ...list.map((x) => Number(String(x.id).slice(1)) || 0)) + 1);
  const createTemplate = (list, fields) => { const r = validate(fields, list); if (!r.ok) throw fail(r.errors); return list.concat([Object.assign({ id: nextId(list), status: 'draft' }, r.value)]); };
  const updateTemplate = (list, id, fields) => {
    if (!list.some((x) => x.id === id)) throw new RangeError('Unknown template: ' + id);
    const r = validate(fields, list, id); if (!r.ok) throw fail(r.errors);
    return list.map((x) => (x.id === id ? Object.assign({}, x, r.value) : x));
  };
  const allowedNext = (s) => (NEXT[s] || []).map((x) => x.to);
  const setStatus = (list, id, next) => {
    const x = list.find((y) => y.id === id); if (!x) throw new RangeError('Unknown template: ' + id);
    if (!allowedNext(x.status).includes(next)) throw new RangeError('Transition not allowed: ' + x.status + ' → ' + next);
    return list.map((y) => (y.id === id ? Object.assign({}, y, { status: next }) : y));
  };
  /** Local preview only: known placeholders are replaced with SAMPLE values; unknown ones are left as typed. Output is plain text (escape before inserting in HTML). */
  const renderPreview = (text) => String(text == null ? '' : text).replace(/\{\{\s*([^}]*?)\s*\}\}/g, (m, k) => (PLACEHOLDERS.includes(k) ? SAMPLE[k] : m));

  /* ───── Rendering ───── */
  const TPL_COLS = [
    { key: 'name', label: 'القالب' }, { key: 'channelName', label: 'القناة' }, { key: 'audienceName', label: 'الجمهور' }, { key: 'title', label: 'العنوان' },
    { key: 'status', label: 'الحالة', type: 'status', statusDomain: 'notification' }
  ];
  const LOG_COLS = [
    { key: 'sentAt', label: 'التاريخ', type: 'date' }, { key: 'template', label: 'القالب' }, { key: 'channelName', label: 'القناة' }, { key: 'audienceName', label: 'الجمهور' },
    { key: 'recipients', label: 'المستلمون', type: 'number', align: 'end' }, { key: 'delivered', label: 'تم تسليمه', type: 'number', align: 'end' }, { key: 'failed', label: 'فشل', type: 'number', align: 'end' },
    { key: 'dstatus', label: 'حالة التسليم', type: 'status', statusDomain: 'delivery' }
  ];
  const tplRows = () => templates.map((t) => Object.assign({}, t, { channelName: CHANNELS[t.channel], audienceName: AUDIENCES[t.audience] }));
  const logRows = () => log.map((l) => Object.assign({}, l, { channelName: CHANNELS[l.channel], audienceName: AUDIENCES[l.audience], dstatus: deliveryStatus(l) }));
  const summaryHtml = () => {
    const c = counts(templates, log); const s = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${v}</b></div>`;
    return `<section class="ord-sum" aria-label="ملخص الإشعارات">${s('القوالب', nf(c.templates))}${s('مفعّلة', nf(c.active))}${s('مسودات', nf(c.draft))}${s('سجلات الإرسال', nf(c.logs))}${s('نسبة التسليم', c.rate == null ? '—' : nf(c.rate) + '٪')}</section>`;
  };
  const fErr = (e, k) => (e && e[k] ? `<small class="ord-err" id="nt-e-${k}" role="alert">${esc(e[k])}</small>` : '');
  const optionsOf = (map, cur, ph) => `<option value="">${ph}</option>` + Object.keys(map).map((k) => `<option value="${k}"${cur === k ? ' selected' : ''}>${esc(map[k])}</option>`).join('');
  const dialogHtml = (t, st) => {
    const creating = !t, v = st.values || t || { name: '', channel: '', audience: '', title: '', body: '' }, e = st.errors || {}, inv = (k) => (e[k] ? ` aria-invalid="true" aria-describedby="nt-e-${k}"` : '');
    const acts = t ? (NEXT[t.status] || []) : [];
    const shown = { title: renderPreview(v.title), body: renderPreview(v.body) };
    return `<form class="ord-dlg-in" novalidate>
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">${creating ? 'إضافة قالب إشعار' : esc(t.name)}</h2>${creating ? '' : `<p>${badge('notification', t.status)}</p>`}</div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>إجراءات تجريبية: لا يُرسل أي إشعار فعليًا، والتغييرات محلية في هذه الصفحة فقط.</span></p>
      ${st.message ? `<p class="ord-muted" role="status">${esc(st.message)}</p>` : ''}
      <section aria-labelledby="ord-h-form"><h3 id="ord-h-form">${creating ? 'بيانات القالب' : 'تعديل القالب'}</h3>
        <div class="hs-grid-field"><label for="nt-name">اسم القالب</label><input id="nt-name" type="text" value="${esc(v.name)}" required${inv('name')}>${fErr(e, 'name')}</div>
        <div class="hs-grid-field"><label for="nt-ch">القناة</label><select id="nt-ch"${inv('channel')}>${optionsOf(CHANNELS, v.channel, 'اختر القناة')}</select>${fErr(e, 'channel')}</div>
        <div class="hs-grid-field"><label for="nt-aud">الجمهور (تجريبي)</label><select id="nt-aud"${inv('audience')}>${optionsOf(AUDIENCES, v.audience, 'اختر الجمهور')}</select>${fErr(e, 'audience')}</div>
        <div class="hs-grid-field"><label for="nt-title">عنوان الإشعار</label><input id="nt-title" type="text" value="${esc(v.title)}"${inv('title')}>${fErr(e, 'title')}</div>
        <div class="hs-grid-field"><label for="nt-body">نص الإشعار</label><textarea id="nt-body" rows="3"${inv('body')}>${esc(v.body)}</textarea>${fErr(e, 'body')}</div>
        <p class="ord-muted">المتغيرات المتاحة: ${PLACEHOLDERS.map((p) => '<bdi dir="ltr">{{' + p + '}}</bdi>').join('، ')}</p>
        <p class="ord-act"><button type="submit" class="adm-btn adm-btn-p" data-nt-save>${creating ? 'إضافة كمسودة' : 'حفظ التعديلات محليًا'}</button><button type="button" class="adm-btn" data-nt-preview>تحديث المعاينة</button></p></section>
      <section aria-labelledby="nt-h-pv"><h3 id="nt-h-pv">معاينة محلية (بيانات عيّنة — لم يُرسل شيء)</h3>
        <div class="ord-sim" role="group" aria-label="معاينة الإشعار"><span><b>${esc(shown.title) || '—'}</b><br>${esc(shown.body) || '—'}</span></div></section>
      ${creating ? '' : `<section aria-labelledby="ord-h-act"><h3 id="ord-h-act">حالة القالب (محاكاة)</h3><div class="ord-act">${acts.map((a) => `<button type="button" class="adm-btn ${a.cls}" data-ord-status="${a.to}">${a.text}</button>`).join('')}</div></section>`}</form>`;
  };

  const render = () => {
    const wrap = root.document.createElement('div'); wrap.className = 'ord';
    wrap.innerHTML = `<p class="dash-note">بيانات تجريبية محلية — لا يُرسل أي إشعار، والحملات والجدولة والإرسال الفعلي غير منفذة. أي تغيير يُفقد عند إعادة التحميل.</p>
      <div id="ord-sum"></div>
      <div role="tablist" aria-label="أقسام الإشعارات" class="cat-tools"><button type="button" role="tab" class="adm-btn" id="nt-tab-t" aria-controls="nt-p-t" aria-selected="true" data-nt-tab="t">القوالب</button><button type="button" role="tab" class="adm-btn" id="nt-tab-l" aria-controls="nt-p-l" aria-selected="false" data-nt-tab="l">سجل الإرسال (تجريبي)</button></div>
      <div role="tabpanel" id="nt-p-t" aria-labelledby="nt-tab-t"><div id="nt-grid-t"></div></div>
      <div role="tabpanel" id="nt-p-l" aria-labelledby="nt-tab-l" hidden><div id="nt-grid-l"></div></div>
      <dialog class="ord-dlg" id="ord-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const sum = wrap.querySelector('#ord-sum'), dlgEl = wrap.querySelector('#ord-dlg');
    let openId = null, st = {};
    const paintSum = () => { sum.innerHTML = summaryHtml(); }; paintSum();
    tplGrid = root.HSDataGrid.create(wrap.querySelector('#nt-grid-t'), {
      caption: 'قوالب الإشعارات', columns: TPL_COLS, rows: tplRows(), pageSize: 10, rowId: (r) => r.id, searchKeys: ['name', 'title', 'body'],
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k].label })) }, { key: 'channelName', label: 'القناة' }, { key: 'audienceName', label: 'الجمهور' }],
      rowActions: [{ id: 'details', label: 'فتح', onClick: (r) => { openId = r.id; st = {}; paintDlg(); d.open(); } }],
      emptyText: 'لا توجد قوالب في البيانات التجريبية.', onRetry: () => tplGrid.setRows(tplRows())
    });
    logGrid = root.HSDataGrid.create(wrap.querySelector('#nt-grid-l'), {
      caption: 'سجل الإرسال التجريبي (للقراءة فقط)', columns: LOG_COLS, rows: logRows(), pageSize: 10, rowId: (r) => r.id, searchKeys: ['template'],
      filters: [{ key: 'dstatus', label: 'حالة التسليم', options: Object.keys(DELIVERY).map((k) => ({ value: k, label: DELIVERY[k].label })) }, { key: 'channelName', label: 'القناة' }],
      emptyText: 'لا توجد سجلات إرسال في البيانات التجريبية.', onRetry: () => logGrid.setRows(logRows())
    });
    showTab = (k) => {
      ['t', 'l'].forEach((x) => { wrap.querySelector('#nt-p-' + x).hidden = x !== k; wrap.querySelector('#nt-tab-' + x).setAttribute('aria-selected', x === k ? 'true' : 'false'); });
    };
    wrap.querySelector('[role=tablist]').addEventListener('click', (e) => { const b = e.target.closest('[data-nt-tab]'); if (b) showTab(b.dataset.ntTab); });
    if (root.HSA11yTabs) root.HSA11yTabs.attach(wrap.querySelector('[role=tablist]'));
    const sync = () => { tplGrid.setRows(tplRows()); paintSum(); };
    const paintDlg = (sel) => { const t = openId ? templates.find((x) => x.id === openId) : null; if (openId && !t) return; dlgEl.innerHTML = dialogHtml(t, st); const f = sel && dlgEl.querySelector(sel); if (f) f.focus(); };
    const read = () => ({ name: dlgEl.querySelector('#nt-name').value, channel: dlgEl.querySelector('#nt-ch').value, audience: dlgEl.querySelector('#nt-aud').value, title: dlgEl.querySelector('#nt-title').value, body: dlgEl.querySelector('#nt-body').value });
    const d = root.HSDialog.attach(dlgEl, {
      closeSelector: '[data-ord-close]',
      fallbackFocus: () => wrap.querySelector('tr[data-row="' + openId + '"] [data-act="details"]') || wrap.querySelector('.hs-grid-search input'),
      onClose: () => { openId = null; st = {}; }
    });
    createHook = () => { showTab('t'); openId = null; st = {}; paintDlg(); d.open(root.document.activeElement); const f = dlgEl.querySelector('#nt-name'); if (f) f.focus(); };
    const save = () => {
      const values = read();
      try {
        if (openId) { templates = updateTemplate(templates, openId, values); st = { message: 'تم حفظ التعديلات محليًا.' }; sync(); paintDlg('#nt-name'); }
        else { templates = createTemplate(templates, values); openId = templates[templates.length - 1].id; st = { message: 'أُضيف القالب كمسودة محلية.' }; sync(); paintDlg('[data-ord-close]'); }
      } catch (err) {
        if (!err.errors) { st = { values, errors: {}, message: 'تعذر تنفيذ الإجراء.' }; paintDlg(); return; }
        st = { values, errors: err.errors }; paintDlg(); const k = ['name', 'channel', 'audience', 'title', 'body'].find((x) => err.errors[x]); const f = dlgEl.querySelector({ name: '#nt-name', channel: '#nt-ch', audience: '#nt-aud', title: '#nt-title', body: '#nt-body' }[k]); if (f) f.focus();
      }
    };
    dlgEl.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    d.onClick((b) => {
      try {
        if (b.hasAttribute('data-nt-save')) return; /* submit button: handled once by the form's submit event (also covers Enter) */
        if (b.hasAttribute('data-nt-preview')) { st = Object.assign({}, st, { values: read(), errors: st.errors }); paintDlg('#nt-body'); }
        else if (b.dataset.ordStatus) { templates = setStatus(templates, openId, b.dataset.ordStatus); st = {}; sync(); paintDlg('[data-ord-close]'); }
      } catch (err) { st = { message: 'تعذر تنفيذ الإجراء على هذا القالب.' }; paintDlg(); }
    });
    return wrap;
  };

  const api = { STATUS, DELIVERY, CHANNELS, AUDIENCES, PLACEHOLDERS, LIMITS, deliveryStatus, rate, counts, validate, unknownPlaceholders, renderPreview, createTemplate, updateTemplate, allowedNext, setStatus, buildTemplates, buildLog, resetState, _templates: () => templates, _log: () => log };
  root.HSAdminNotificationsPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('notifications', {
      title: 'الإشعارات',
      description: 'قوالب الإشعارات مع معاينة محلية وتفعيل/تعطيل تجريبي، وسجل إرسال تجريبي بحالات التسليم. لا يُرسل شيء فعليًا.',
      actions: [
        { id: 'create', label: 'إضافة قالب', kind: 'primary', onClick: () => { if (createHook) createHook(); } },
        { id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { resetState(); ctx.shell.refresh(); } }
      ],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
