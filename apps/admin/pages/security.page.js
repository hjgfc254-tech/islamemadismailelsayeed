/**
 * MODULE: security.page
 * RESPONSIBILITY: Admin security center — (1) security alerts with SIMULATED acknowledge / escalate / resolve, (2) active sessions with a SIMULATED
 *   «end session», (3) READ-ONLY login attempts. Summary counters, HSDataGrid per tab, details dialog, two-step confirm with a written reason, local action log.
 * STATUS: IMPLEMENTED (DEMO). All data are fixed local fixtures (fictional actors, example.test addresses, 192.0.2.x). NOTHING is enforced:
 *   no session is really ended, no account is locked, no alert is sent to anyone, no password/2FA is changed. Local state is lost on reload.
 *   Fixed demo «now» = 2026-11-09. Workflow/severity model is a demo assumption (docs/DECISIONS/2026-11-09-security-demo-assumptions.md).
 * Depends on: HSAdminShell, HSDataGrid, HSStatusBadge (registers `securityalert`, `severity`, `sessionstatus`, `loginresult`), HSDialog.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(t); } catch (e) { return iso; } };
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const DEMO_NOW = '2026-11-09T12:00:00Z', REASON_MIN = 3, REASON_MAX = 300;

  const ALERT = {
    open: { label: 'مفتوح', tone: 'danger', icon: 'warn' }, acknowledged: { label: 'تم الاطلاع', tone: 'info', icon: 'info' },
    escalated: { label: 'مُصعَّد (محاكاة)', tone: 'warning', icon: 'warn' }, resolved: { label: 'مُعالَج', tone: 'success', icon: 'check' }
  };
  const SEVERITY = { low: { label: 'منخفضة', tone: 'neutral' }, medium: { label: 'متوسطة', tone: 'info' }, high: { label: 'عالية', tone: 'warning' }, critical: { label: 'حرجة', tone: 'danger' } };
  const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
  const SESSION = { active: { label: 'نشطة', tone: 'success' }, ended: { label: 'انتهت', tone: 'neutral' }, revoked: { label: 'أُنهيت (محاكاة)', tone: 'warning' } };
  const ATTEMPT_RESULT = { success: { label: 'نجح', tone: 'success' }, failed: { label: 'فشل', tone: 'danger' }, blocked: { label: 'محظور (مثال)', tone: 'warning' } };
  const B = root.HSStatusBadge;
  if (B) { [['securityalert', ALERT], ['severity', SEVERITY], ['sessionstatus', SESSION], ['loginresult', ATTEMPT_RESULT]].forEach((p) => { if (B.domains().indexOf(p[0]) === -1) B.register(p[0], p[1]); }); }
  const badge = (d, s, map) => (B ? B.render(d, s) : esc((map[s] || {}).label || 'غير محدد'));

  /** Allowed alert transitions (demo assumption). Resolved is final. */
  const FLOW = { open: ['acknowledged', 'escalated', 'resolved'], acknowledged: ['escalated', 'resolved'], escalated: ['resolved'], resolved: [] };
  const REASON_REQUIRED = ['escalated', 'resolved'];
  const ACTION_LABEL = { acknowledged: 'تعليم «تم الاطلاع»', escalated: 'تصعيد (محاكاة)', resolved: 'تعليم «مُعالَج»', revoke: 'إنهاء الجلسة (محاكاة)' };
  const CONFIRM_NOTE = {
    acknowledged: 'سيُعلَّم التنبيه «تم الاطلاع» داخل هذه الصفحة فقط.', escalated: 'لن يُرسَل التصعيد لأي شخص أو جهة؛ يُسجَّل محليًا فقط.',
    resolved: 'سيُعلَّم التنبيه «مُعالَج» محليًا دون أي إجراء أمني فعلي.', revoke: 'لن تُنهى أي جلسة فعلية ولن يتأثر أي حساب؛ تتغير حالة الصف محليًا فقط.'
  };

  /* ───── Fixtures (demo) ───── */
  const ACTORS = { a1: 'مالك تجريبي (owner@example.test)', a2: 'موظفة مالية تجريبية (fin@example.test)', a3: 'مشرف عمليات تجريبي (ops@example.test)', a4: 'موظف دعم تجريبي (support@example.test)' };
  const buildAlerts = () => [
    { id: 'al1', at: '2026-11-09T11:20:00Z', severity: 'critical', status: 'open', title: 'عدة محاولات دخول فاشلة متتالية', detail: 'خمس محاولات فاشلة خلال دقيقتين على حساب واحد (مثال).', actorId: 'a4', ip: '192.0.2.44' },
    { id: 'al2', at: '2026-11-09T10:05:00Z', severity: 'high', status: 'open', title: 'دخول من عنوان شبكة غير معتاد', detail: 'عنوان لم يظهر سابقًا لهذا المنفّذ (مثال).', actorId: 'a2', ip: '192.0.2.77' },
    { id: 'al3', at: '2026-11-09T08:30:00Z', severity: 'medium', status: 'acknowledged', title: 'محاولة تنفيذ إجراء بلا صلاحية', detail: 'رُفض الإجراء بسبب تجاوز سلطة المنفّذ (مثال).', actorId: 'a4', ip: '192.0.2.44' },
    { id: 'al4', at: '2026-11-08T19:45:00Z', severity: 'high', status: 'escalated', title: 'جلسات متزامنة من جهازين', detail: 'جلستان نشطتان لنفس الحساب في وقت واحد (مثال).', actorId: 'a3', ip: '192.0.2.31', escalation: 'طلب مراجعة من المالك' },
    { id: 'al5', at: '2026-11-07T14:00:00Z', severity: 'low', status: 'resolved', title: 'تغيير كلمة مرور', detail: 'تغيير كلمة المرور (محاكاة).', actorId: 'a2', ip: '192.0.2.10', resolution: 'إجراء معتاد' },
    { id: 'al6', at: '2026-11-06T09:10:00Z', severity: 'medium', status: 'open', title: 'جلسة خاملة طويلة', detail: 'جلسة نشطة دون نشاط منذ أكثر من ٧٢ ساعة (مثال).', actorId: 'a3', ip: '192.0.2.31' }
  ];
  const buildSessions = () => [
    { id: 'ss1', actorId: 'a1', device: 'Chrome — Windows', ip: '192.0.2.1', startedAt: '2026-11-09T07:00:00Z', lastSeenAt: '2026-11-09T11:58:00Z', status: 'active', current: true },
    { id: 'ss2', actorId: 'a2', device: 'Safari — iPhone', ip: '192.0.2.10', startedAt: '2026-11-09T09:20:00Z', lastSeenAt: '2026-11-09T11:42:00Z', status: 'active', current: false },
    { id: 'ss3', actorId: 'a3', device: 'Firefox — Linux', ip: '192.0.2.31', startedAt: '2026-11-08T08:00:00Z', lastSeenAt: '2026-11-09T08:55:00Z', status: 'active', current: false },
    { id: 'ss4', actorId: 'a3', device: 'Chrome — Android', ip: '192.0.2.32', startedAt: '2026-11-08T19:40:00Z', lastSeenAt: '2026-11-09T09:00:00Z', status: 'active', current: false },
    { id: 'ss5', actorId: 'a4', device: 'Edge — Windows', ip: '192.0.2.44', startedAt: '2026-11-08T16:07:00Z', lastSeenAt: '2026-11-08T18:30:00Z', status: 'ended', current: false }
  ];
  const buildLogins = () => [
    { id: 'lg1', at: '2026-11-09T11:19:00Z', actorId: 'a4', ip: '192.0.2.44', result: 'blocked', reason: 'تجاوز عدد المحاولات (مثال)' },
    { id: 'lg2', at: '2026-11-09T11:18:00Z', actorId: 'a4', ip: '192.0.2.44', result: 'failed', reason: 'كلمة مرور غير صحيحة' },
    { id: 'lg3', at: '2026-11-09T11:17:00Z', actorId: 'a4', ip: '192.0.2.44', result: 'failed', reason: 'كلمة مرور غير صحيحة' },
    { id: 'lg4', at: '2026-11-09T10:04:00Z', actorId: 'a2', ip: '192.0.2.77', result: 'success' },
    { id: 'lg5', at: '2026-11-09T09:20:00Z', actorId: 'a2', ip: '192.0.2.10', result: 'success' },
    { id: 'lg6', at: '2026-11-09T07:00:00Z', actorId: 'a1', ip: '192.0.2.1', result: 'success' },
    { id: 'lg7', at: '2026-11-08T19:40:00Z', actorId: 'a3', ip: '192.0.2.32', result: 'success' },
    { id: 'lg8', at: '2026-11-08T16:05:00Z', actorId: 'a4', ip: '192.0.2.44', result: 'failed', reason: 'كلمة مرور غير صحيحة' }
  ];
  let alerts = buildAlerts(), sessions = buildSessions(), logins = buildLogins(), log = [];
  const resetState = () => { alerts = buildAlerts(); sessions = buildSessions(); logins = buildLogins(); log = []; };

  /* ───── Pure logic (unit-tested) ───── */
  const validIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s) && Number.isFinite(Date.parse(s));
  const notFuture = (s) => Date.parse(s) <= Date.parse(DEMO_NOW);
  /** Returns human-readable consistency problems for the three fixture sets; [] = valid. */
  const validateData = (d) => {
    const p = [];
    const dup = (list, tag) => { const ids = new Set(); list.forEach((x) => { if (ids.has(x.id)) p.push(tag + ' ' + x.id + ': duplicate id'); ids.add(x.id); }); };
    dup(d.alerts, 'alert'); dup(d.sessions, 'session'); dup(d.logins, 'login');
    d.alerts.forEach((a) => {
      const w = (m) => p.push('alert ' + a.id + ': ' + m);
      if (!validIso(a.at) || !notFuture(a.at)) w('invalid or future timestamp');
      if (!ALERT[a.status]) w('unknown status'); if (!SEVERITY[a.severity]) w('unknown severity'); if (!ACTORS[a.actorId]) w('unknown actor');
      if (!String(a.title || '').trim() || !String(a.detail || '').trim()) w('title and detail are required');
      if (a.status === 'escalated' && !String(a.escalation || '').trim()) w('escalated alert needs a reason');
      if (a.status === 'resolved' && !String(a.resolution || '').trim()) w('resolved alert needs a resolution note');
    });
    d.sessions.forEach((s) => {
      const w = (m) => p.push('session ' + s.id + ': ' + m);
      if (!validIso(s.startedAt) || !validIso(s.lastSeenAt)) w('invalid timestamp'); else {
        if (Date.parse(s.lastSeenAt) < Date.parse(s.startedAt)) w('last seen before start');
        if (!notFuture(s.lastSeenAt)) w('future timestamp');
      }
      if (!SESSION[s.status]) w('unknown status'); if (!ACTORS[s.actorId]) w('unknown actor');
      if (s.current && s.status !== 'active') w('current session must be active');
    });
    if (d.sessions.filter((s) => s.current).length > 1) p.push('more than one current session');
    d.logins.forEach((l) => {
      const w = (m) => p.push('login ' + l.id + ': ' + m);
      if (!validIso(l.at) || !notFuture(l.at)) w('invalid or future timestamp');
      if (!ATTEMPT_RESULT[l.result]) w('unknown result'); if (!ACTORS[l.actorId]) w('unknown actor');
      if (l.result !== 'success' && !String(l.reason || '').trim()) w('failed/blocked attempt needs a reason');
    });
    return p;
  };
  const counts = () => {
    const c = { openAlerts: 0, critical: 0, activeSessions: 0, failedLogins: 0 };
    alerts.forEach((a) => { if (a.status === 'open') { c.openAlerts++; if (a.severity === 'critical') c.critical++; } });
    sessions.forEach((s) => { if (s.status === 'active') c.activeSessions++; });
    logins.forEach((l) => { if (l.result !== 'success') c.failedLogins++; });
    return c;
  };
  const canTransition = (from, to) => (FLOW[from] || []).indexOf(to) !== -1;
  const allowedActions = (a) => (FLOW[a.status] || []).slice();
  const cleanNote = (n) => String(n == null ? '' : n).trim();
  const reasonOk = (n) => { const t = cleanNote(n); return t.length >= REASON_MIN && t.length <= REASON_MAX; };
  const entry = (kind, id, action, note) => ({ kind, id, action, note: cleanNote(note), at: DEMO_NOW });
  /** Simulated alert transition. Immutable. Throws 'Unknown alert'|'Transition not allowed'|'Reason required'. */
  const transitionAlert = (list, lg, id, to, o) => {
    const a = list.find((x) => x.id === id); if (!a) throw new Error('Unknown alert');
    if (!canTransition(a.status, to)) throw new Error('Transition not allowed');
    const note = cleanNote(o && o.note);
    if (REASON_REQUIRED.indexOf(to) !== -1 && !reasonOk(note)) throw new Error('Reason required');
    if (note.length > REASON_MAX) throw new Error('Reason required');
    const next = Object.assign({}, a, { status: to });
    if (to === 'escalated') next.escalation = note; if (to === 'resolved') next.resolution = note || 'تم الإغلاق';
    return { alerts: list.map((x) => (x.id === id ? next : x)), log: lg.concat([entry('alert', id, to, note)]) };
  };
  /** Simulated session end. Immutable. Throws 'Unknown session'|'Session not active'|'Current session'|'Reason required'. */
  const revokeSession = (list, lg, id, o) => {
    const s = list.find((x) => x.id === id); if (!s) throw new Error('Unknown session');
    if (s.current) throw new Error('Current session');
    if (s.status !== 'active') throw new Error('Session not active');
    const note = cleanNote(o && o.note); if (!reasonOk(note)) throw new Error('Reason required');
    return { sessions: list.map((x) => (x.id === id ? Object.assign({}, x, { status: 'revoked', revokeReason: note }) : x)), log: lg.concat([entry('session', id, 'revoke', note)]) };
  };
  const sortAlerts = (list) => list.slice().sort((a, b) => (SEV_RANK[b.severity] - SEV_RANK[a.severity]) || (Date.parse(b.at) - Date.parse(a.at)) || (a.id < b.id ? -1 : 1));
  const alertRow = (a) => Object.assign({}, a, { actor: ACTORS[a.actorId] || 'غير معروف', sevRank: SEV_RANK[a.severity] || 0 });
  const sessionRow = (s) => Object.assign({}, s, { actor: ACTORS[s.actorId] || 'غير معروف', current: !!s.current });
  const attemptRow = (l) => Object.assign({}, l, { actor: ACTORS[l.actorId] || 'غير معروف' });

  const ALERT_COLS = [
    { key: 'at', label: 'الوقت', type: 'date', format: (r) => dt(r.at) }, { key: 'title', label: 'التنبيه' }, { key: 'actor', label: 'المنفّذ' },
    { key: 'severity', label: 'الخطورة', type: 'status', statusDomain: 'severity' }, { key: 'status', label: 'الحالة', type: 'status', statusDomain: 'securityalert' }
  ];
  const SESSION_COLS = [
    { key: 'actor', label: 'المنفّذ' }, { key: 'device', label: 'الجهاز' }, { key: 'ip', label: 'عنوان الشبكة', html: (r) => `<span dir="ltr">${esc(r.ip)}</span>` },
    { key: 'lastSeenAt', label: 'آخر نشاط', type: 'date', format: (r) => dt(r.lastSeenAt) }, { key: 'status', label: 'الحالة', type: 'status', statusDomain: 'sessionstatus' }
  ];
  const LOGIN_COLS = [
    { key: 'at', label: 'الوقت', type: 'date', format: (r) => dt(r.at) }, { key: 'actor', label: 'المنفّذ' }, { key: 'ip', label: 'عنوان الشبكة', html: (r) => `<span dir="ltr">${esc(r.ip)}</span>` },
    { key: 'result', label: 'النتيجة', type: 'status', statusDomain: 'loginresult' }
  ];
  const ALERT_CFG = { columns: ALERT_COLS, searchKeys: ['title', 'detail', 'actor', 'ip'], filters: [{ key: 'severity', label: 'الخطورة', options: Object.keys(SEVERITY).map((k) => ({ value: k, label: SEVERITY[k].label })) }, { key: 'status', label: 'الحالة', options: Object.keys(ALERT).map((k) => ({ value: k, label: ALERT[k].label })) }] };
  const SESSION_CFG = { columns: SESSION_COLS, searchKeys: ['actor', 'device', 'ip'], filters: [{ key: 'status', label: 'الحالة', options: Object.keys(SESSION).map((k) => ({ value: k, label: SESSION[k].label })) }, { key: 'actor', label: 'المنفّذ' }] };
  const ATTEMPT_CFG = { columns: LOGIN_COLS, searchKeys: ['actor', 'ip', 'reason'], filters: [{ key: 'result', label: 'النتيجة', options: Object.keys(ATTEMPT_RESULT).map((k) => ({ value: k, label: ATTEMPT_RESULT[k].label })) }, { key: 'actor', label: 'المنفّذ' }] };

  /* ───── Rendering ───── */
  const summaryHtml = () => {
    const c = counts(), s = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${esc(nf(v))}</b></div>`;
    return `<section class="ord-sum" aria-label="ملخص الأمان التجريبي">${s('تنبيهات مفتوحة', c.openAlerts)}${s('منها حرجة', c.critical)}${s('جلسات نشطة', c.activeSessions)}${s('محاولات دخول غير ناجحة', c.failedLogins)}</section>`;
  };
  const head = (title, sub) => `<header class="ord-dlg-h"><div><h2 id="ord-dlg-t">${esc(title)}</h2><p>${sub}</p></div><button type="button" class="adm-btn" data-ord-close aria-label="إغلاق">${icon('close')}</button></header>`;
  const SIM = '<p class="ord-sim" role="note">' + '%I%' + '<span>بيانات تجريبية: لا يُنفَّذ أي إجراء أمني حقيقي، ولا يُرسل شيء لأي جهة، وتُفقد التغييرات عند إعادة التحميل.</span></p>';
  const sim = () => SIM.replace('%I%', icon('info'));
  const logHtml = (kind, id) => {
    const h = log.filter((x) => x.kind === kind && x.id === id);
    return `<section aria-labelledby="sec-h-hist"><h3 id="sec-h-hist">السجل المحلي</h3>${h.length ? `<ul class="ord-tl">${h.slice().reverse().map((x) => `<li><span><b>${esc(ACTION_LABEL[x.action] || x.action)}</b>${x.note ? ' — ' + esc(x.note) : ''}</span><small>${esc(dt(x.at))}</small></li>`).join('')}</ul>` : '<p class="ord-muted">لا إجراءات مسجلة.</p>'}</section>`;
  };
  const alertDetail = (st, a) => {
    const acts = allowedActions(a);
    return `<div class="ord-dlg-in">${head('تفاصيل التنبيه', '<span dir="ltr">' + esc(a.id) + '</span> — ' + esc(a.title))}${sim()}
      ${st.msg ? `<p class="stl-result" id="sec-result" tabindex="-1" role="status">${esc(st.msg)}</p>` : ''}
      <dl class="ord-facts"><div><dt>الوقت (UTC)</dt><dd>${esc(dt(a.at))}</dd></div><div><dt>الخطورة</dt><dd>${badge('severity', a.severity, SEVERITY)}</dd></div>
      <div><dt>الحالة</dt><dd>${badge('securityalert', a.status, ALERT)}</dd></div><div><dt>المنفّذ</dt><dd>${esc(ACTORS[a.actorId] || 'غير معروف')}</dd></div>
      <div><dt>الوصف</dt><dd>${esc(a.detail)}</dd></div><div><dt>عنوان الشبكة (مثال)</dt><dd dir="ltr">${esc(a.ip || '—')}</dd></div>
      ${a.escalation ? `<div><dt>سبب التصعيد</dt><dd>${esc(a.escalation)}</dd></div>` : ''}${a.resolution ? `<div><dt>ملاحظة المعالجة</dt><dd>${esc(a.resolution)}</dd></div>` : ''}</dl>
      <section aria-labelledby="sec-h-act"><h3 id="sec-h-act">إجراءات (محاكاة)</h3>${acts.length ? `<div class="ord-act">${acts.map((t) => `<button type="button" class="adm-btn" data-sec-act="${t}">${esc(ACTION_LABEL[t])}</button>`).join('')}</div>` : '<p class="ord-muted">لا إجراءات متاحة: التنبيه المُعالَج نهائي.</p>'}</section>
      ${logHtml('alert', a.id)}<div class="ord-act"><button type="button" class="adm-btn" data-ord-close>إغلاق</button></div></div>`;
  };
  const sessionDetail = (st, s) => {
    const canEnd = s.status === 'active' && !s.current;
    return `<div class="ord-dlg-in">${head('تفاصيل الجلسة', '<span dir="ltr">' + esc(s.id) + '</span> — ' + esc(s.device))}${sim()}
      ${st.msg ? `<p class="stl-result" id="sec-result" tabindex="-1" role="status">${esc(st.msg)}</p>` : ''}
      <dl class="ord-facts"><div><dt>المنفّذ</dt><dd>${esc(ACTORS[s.actorId] || 'غير معروف')}</dd></div><div><dt>الحالة</dt><dd>${badge('sessionstatus', s.status, SESSION)}</dd></div>
      <div><dt>الجهاز</dt><dd>${esc(s.device)}</dd></div><div><dt>عنوان الشبكة (مثال)</dt><dd dir="ltr">${esc(s.ip)}</dd></div>
      <div><dt>بدأت (UTC)</dt><dd>${esc(dt(s.startedAt))}</dd></div><div><dt>آخر نشاط</dt><dd>${esc(dt(s.lastSeenAt))}</dd></div>
      ${s.current ? '<div><dt>ملاحظة</dt><dd>هذه هي جلستك الحالية التجريبية ولا يمكن إنهاؤها من هنا.</dd></div>' : ''}${s.revokeReason ? `<div><dt>سبب الإنهاء</dt><dd>${esc(s.revokeReason)}</dd></div>` : ''}</dl>
      <section aria-labelledby="sec-h-act"><h3 id="sec-h-act">إجراءات (محاكاة)</h3>${canEnd ? `<div class="ord-act"><button type="button" class="adm-btn" data-sec-act="revoke">${esc(ACTION_LABEL.revoke)}</button></div>` : '<p class="ord-muted">لا إجراءات متاحة لهذه الجلسة.</p>'}</section>
      ${logHtml('session', s.id)}<div class="ord-act"><button type="button" class="adm-btn" data-ord-close>إغلاق</button></div></div>`;
  };
  const loginDetail = (l) => `<div class="ord-dlg-in">${head('تفاصيل محاولة الدخول', '<span dir="ltr">' + esc(l.id) + '</span>')}${sim()}
    <dl class="ord-facts"><div><dt>الوقت (UTC)</dt><dd>${esc(dt(l.at))}</dd></div><div><dt>النتيجة</dt><dd>${badge('loginresult', l.result, ATTEMPT_RESULT)}</dd></div>
    <div><dt>المنفّذ</dt><dd>${esc(ACTORS[l.actorId] || 'غير معروف')}</dd></div><div><dt>عنوان الشبكة (مثال)</dt><dd dir="ltr">${esc(l.ip)}</dd></div>${l.reason ? `<div><dt>السبب</dt><dd>${esc(l.reason)}</dd></div>` : ''}</dl>
    <p class="ord-muted">للقراءة فقط: لا يمكن حظر عنوان أو قفل حساب من هنا.</p><div class="ord-act"><button type="button" class="adm-btn" data-ord-close>إغلاق</button></div></div>`;
  const confirmHtml = (st, target) => {
    const need = st.action === 'revoke' || REASON_REQUIRED.indexOf(st.action) !== -1;
    return `<div class="ord-dlg-in">${head('تأكيد: ' + ACTION_LABEL[st.action], '<span dir="ltr">' + esc(target.id) + '</span> — ' + esc(target.title || target.device))}
      <p class="ord-sim" role="note">${icon('info')}<span>${esc(CONFIRM_NOTE[st.action])}</span></p>
      <div class="hs-grid-field"><label for="sec-note">${need ? 'السبب (مطلوب ويُسجَّل، ' + nf(REASON_MIN) + '–' + nf(REASON_MAX) + ' حرفًا)' : 'ملاحظة (اختيارية)'}</label><textarea id="sec-note" rows="2" maxlength="${REASON_MAX}">${esc(st.note || '')}</textarea></div>
      <p class="ord-err" id="ord-err" role="alert" hidden></p>
      <div class="ord-act"><button type="button" class="adm-btn adm-btn-p" data-sec-confirm>${esc('تأكيد (محاكاة محلية)')}</button><button type="button" class="adm-btn" data-sec-back>رجوع</button></div></div>`;
  };

  const render = () => {
    const wrap = root.document.createElement('div'); wrap.className = 'ord sec';
    const TABS = [['a', 'التنبيهات'], ['s', 'الجلسات'], ['l', 'محاولات الدخول']];
    wrap.innerHTML = `<div class="fin-banner" role="note">${icon('info')}<span>بيانات تجريبية محلية للعرض فقط — لا إنفاذ أمني حقيقي: لا تُنهى جلسات فعلية، ولا تُقفل حسابات، ولا يُرسل تصعيد لأي جهة، ولا تُحمى الصلاحيات من الواجهة. لا يُحفظ شيء بعد إعادة التحميل. تاريخ العرض الثابت: ${esc(dt(DEMO_NOW))}.</span></div>
      <div id="sec-sum"></div>
      <div role="tablist" aria-label="أقسام الأمان" class="cat-tools">${TABS.map((t, i) => `<button type="button" role="tab" class="adm-btn" id="sec-tab-${t[0]}" aria-controls="sec-p-${t[0]}" aria-selected="${i === 0}" data-sec-tab="${t[0]}">${t[1]}</button>`).join('')}</div>
      ${TABS.map((t, i) => `<div role="tabpanel" id="sec-p-${t[0]}" aria-labelledby="sec-tab-${t[0]}"${i ? ' hidden' : ''}><div id="sec-grid-${t[0]}"></div></div>`).join('')}
      <dialog class="ord-dlg" id="sec-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const dlgEl = wrap.querySelector('#sec-dlg');
    let st = null, gA, gS, gL;
    const rowsA = () => sortAlerts(alerts).map(alertRow), rowsS = () => sessions.map(sessionRow), rowsL = () => logins.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).map(attemptRow);
    const paintSum = () => { wrap.querySelector('#sec-sum').innerHTML = summaryHtml(); };
    const find = () => (st ? (st.kind === 'alert' ? alerts : st.kind === 'session' ? sessions : logins).find((x) => x.id === st.id) : null);
    const paintDlg = (sel) => {
      const t = find(); if (!st || !t) return;
      dlgEl.innerHTML = st.stage === 'confirm' ? confirmHtml(st, t) : st.kind === 'alert' ? alertDetail(st, t) : st.kind === 'session' ? sessionDetail(st, t) : loginDetail(t);
      const f = sel && dlgEl.querySelector(sel); if (f) f.focus();
    };
    const openFor = (kind, id) => { st = { kind, id, stage: 'view', action: null, note: '', msg: '' }; paintDlg('[data-ord-close]'); d.open(); };
    const mk = (host, cfg, caption, rows, kind, ph, empty, retry) => root.HSDataGrid.create(wrap.querySelector(host), Object.assign({}, cfg, {
      caption, pageSize: 10, rowId: (r) => r.id, rows, searchPlaceholder: ph, emptyText: empty, onRetry: retry,
      rowActions: [{ id: 'open', label: 'التفاصيل', onClick: (r) => openFor(kind, r.id) }]
    }));
    paintSum();
    gA = mk('#sec-grid-a', ALERT_CFG, 'التنبيهات الأمنية التجريبية', rowsA(), 'alert', 'ابحث في التنبيهات…', 'لا توجد تنبيهات مطابقة.', () => gA.setRows(rowsA()));
    gS = mk('#sec-grid-s', SESSION_CFG, 'الجلسات التجريبية', rowsS(), 'session', 'ابحث بالمنفّذ أو الجهاز…', 'لا توجد جلسات مطابقة.', () => gS.setRows(rowsS()));
    gL = mk('#sec-grid-l', ATTEMPT_CFG, 'محاولات الدخول التجريبية (للقراءة فقط)', rowsL(), 'login', 'ابحث بالمنفّذ أو العنوان…', 'لا توجد محاولات مطابقة.', () => gL.setRows(rowsL()));
    const sync = () => { gA.setRows(rowsA()); gS.setRows(rowsS()); paintSum(); };
    const showTab = (k) => TABS.forEach((t) => { wrap.querySelector('#sec-p-' + t[0]).hidden = t[0] !== k; wrap.querySelector('#sec-tab-' + t[0]).setAttribute('aria-selected', t[0] === k ? 'true' : 'false'); });
    wrap.querySelector('[role=tablist]').addEventListener('click', (e) => { const b = e.target.closest('[data-sec-tab]'); if (b) showTab(b.getAttribute('data-sec-tab')); });
    if (root.HSA11yTabs) root.HSA11yTabs.attach(wrap.querySelector('[role=tablist]'));
    const d = root.HSDialog.attach(dlgEl, { closeSelector: '[data-ord-close]',
      fallbackFocus: () => (st && wrap.querySelector('tr[data-row="' + st.id + '"] [data-act="open"]')) || wrap.querySelector('.hs-grid-search input'), onClose: () => { st = null; } });
    const showErr = (m) => { const e = dlgEl.querySelector('#ord-err'); if (e) { e.textContent = m; e.hidden = !m; } };
    d.onClick((b) => {
      if (!st) return;
      if (b.hasAttribute('data-sec-act')) { st.action = b.getAttribute('data-sec-act'); st.stage = 'confirm'; st.note = ''; st.msg = ''; paintDlg('#sec-note'); }
      else if (b.hasAttribute('data-sec-back')) { st.stage = 'view'; st.action = null; paintDlg('[data-sec-act]'); }
      else if (b.hasAttribute('data-sec-confirm')) {
        st.note = dlgEl.querySelector('#sec-note').value;
        try {
          if (st.kind === 'alert') { const r = transitionAlert(alerts, log, st.id, st.action, { note: st.note }); alerts = r.alerts; log = r.log; }
          else { const r = revokeSession(sessions, log, st.id, { note: st.note }); sessions = r.sessions; log = r.log; }
          st.msg = 'سُجّل الإجراء «' + ACTION_LABEL[st.action] + '» محليًا. محاكاة فقط — لم يتغير شيء حقيقي.';
          st.stage = 'view'; st.action = null; sync(); paintDlg('#sec-result');
        } catch (err) {
          const m = err && err.message;
          if (m === 'Reason required') showErr('اكتب السبب (' + nf(REASON_MIN) + ' أحرف على الأقل) لتوثيقه.');
          else if (m === 'Transition not allowed') showErr('هذا الانتقال غير مسموح من الحالة الحالية.');
          else if (m === 'Current session') showErr('لا يمكن إنهاء الجلسة الحالية من هنا.');
          else if (m === 'Session not active') showErr('الجلسة ليست نشطة.');
          else showErr('تعذر تنفيذ الإجراء المحاكى.');
        }
      }
    });
    return wrap;
  };

  const api = { ALERT, SEVERITY, SESSION, ATTEMPT_RESULT, FLOW, ACTORS, ACTION_LABEL, DEMO_NOW, REASON_MIN, REASON_MAX, ALERT_CFG, SESSION_CFG, ATTEMPT_CFG,
    buildAlerts, buildSessions, buildLogins, validateData, counts, canTransition, allowedActions, transitionAlert, revokeSession, sortAlerts, alertRow, sessionRow, attemptRow, resetState,
    _alerts: () => alerts, _sessions: () => sessions, _logins: () => logins, _log: () => log };
  root.HSAdminSecurityPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('security', {
      title: 'الأمان',
      description: 'تنبيهات وجلسات ومحاولات دخول — عرض وإجراءات محاكاة محلية فقط، بلا إنفاذ فعلي.',
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
