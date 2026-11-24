/**
 * MODULE: ops-center (HSOpsCenter) — the team workflow screens of the Admin Center:
 *   • bell in the header with the unread count of my teams' alerts (refreshes every 2 min; click → #/alerts)
 *   • page `alerts`   «التنبيهات»: open / mine / all, «أنا هاخده» (claim), «تم» (resolve), «حوّل لبلاغ»
 *   • page `tickets`  «البلاغات»: filter by team / status / mine, new ticket, start / finish, notes
 *   • mountWorkBox(host) «صندوق الشغل» on the home page: my claimed alerts, my team's open alerts, my open tickets
 *   • role home: the `tech` role opens on #/tech instead of the day view
 * Data: HSApiClient → /admin/alerts, /admin/tickets (server: functions/src/alerts.js; local demo: services/ops-api.js).
 * The rules (who sees what, claim conflicts, transitions) live in ops-core.js / ops-routes.js and the server enforces them.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = () => root.HSApiClient;
  const core = () => root.HSOpsCore;
  const req = (method, path, opts) => (api() ? api().request(method, path, opts || {}) : Promise.resolve({ ok: false, error: { message: 'الخدمة غير متاحة' } }));
  const errText = (r) => (r && r.error && r.error.message) || 'حصل خطأ، جرّب تاني';
  const ago = (iso) => {
    const t = Date.parse(iso); if (!Number.isFinite(t)) return '';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return m < 1 ? 'دلوقتي' : m < 60 ? 'من ' + m + ' دقيقة' : m < 1440 ? 'من ' + Math.round(m / 60) + ' ساعة' : 'من ' + Math.round(m / 1440) + ' يوم';
  };
  const teamName = (t) => (core() && core().TEAMS[t]) || t;
  const SEV = { critical: ['عاجل', 'is-critical'], normal: ['عادي', 'is-normal'], info: ['معلومة', 'is-info'] };
  const BELL = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

  /* ───────────── alert card (shared by the page and the work box) ───────────── */
  function alertHtml(a, compact) {
    const [sevLabel, sevCls] = SEV[a.severity] || SEV.normal;
    const who = a.claimedBy ? 'مع ' + esc(a.claimedBy.name || 'زميل') : 'محدش استلمه';
    const acts = a.status === 'resolved' ? '<span class="ops-done">اتقفل</span>'
      : `${a.status === 'open' ? `<button type="button" class="adm-btn adm-btn-p" data-al-claim="${esc(a.id)}">أنا هاخده</button>` : ''}<button type="button" class="adm-btn" data-al-resolve="${esc(a.id)}">تم</button>${compact ? '' : `<button type="button" class="adm-btn" data-al-ticket="${esc(a.id)}">حوّل لبلاغ</button>`}`;
    return `<li class="ops-al ${sevCls}" data-al="${esc(a.id)}"><div class="ops-al-main"><span class="ops-sev">${esc(sevLabel)}</span>
      <strong>${a.link ? `<a href="${esc(a.link)}">${esc(a.title)}</a>` : esc(a.title)}</strong>${a.count > 1 ? ` <small class="ops-count">×${esc(a.count)}</small>` : ''}
      ${a.body ? `<p>${esc(a.body)}</p>` : ''}<small class="ord-muted">${esc(teamName(a.team))} · ${esc(ago(a.lastAt))} · ${who}${a.escalated ? ' · اتصعّد للمالك' : ''}</small></div>
      <div class="ops-al-acts">${acts}</div></li>`;
  }
  async function alertAction(t, status) {
    const id = t.dataset.alClaim || t.dataset.alResolve || t.dataset.alTicket;
    const kind = t.dataset.alClaim ? 'claim' : t.dataset.alResolve ? 'resolve' : 'ticket';
    t.disabled = true;
    const r = await req('POST', '/admin/alerts/' + encodeURIComponent(id) + '/' + kind, { body: {} });
    if (!r.ok) { t.disabled = false; status(errText(r)); return false; }
    status({ claim: 'استلمت التنبيه.', resolve: 'اتقفل التنبيه.', ticket: 'اتعمل بلاغ من التنبيه — تلاقيه في «البلاغات».' }[kind]);
    refreshBell();
    return true;
  }

  /* ───────────── page: alerts ───────────── */
  function renderAlerts() {
    const wrap = root.document.createElement('div'); wrap.className = 'ops';
    let filter = 'open';
    const status = (m) => { const n = wrap.querySelector('[data-ops-status]'); if (n) n.textContent = m || ''; };
    async function load() {
      const q = filter === 'mine' ? { mine: '1' } : filter === 'all' ? { all: '1' } : {};
      const r = await req('GET', '/admin/alerts', { query: q });
      const tabs = [['open', 'المفتوحة'], ['mine', 'اللي معايا'], ['all', 'الكل']].map(([k, l]) => `<button type="button" class="adm-btn${k === filter ? ' adm-btn-p' : ''}" data-al-filter="${k}" aria-pressed="${k === filter}">${l}</button>`).join('');
      if (!r.ok) { wrap.innerHTML = `<div class="adm-state"><h2>تعذّر تحميل التنبيهات</h2><p>${esc(errText(r))}</p></div>`; return; }
      const d = r.data, items = filter === 'open' ? d.items.filter((a) => a.status !== 'resolved') : d.items;
      wrap.innerHTML = `<div class="ops-bar" role="group" aria-label="تصفية التنبيهات">${tabs}</div><p class="ord-muted">مفتوح ${esc(d.open)} · معايا ${esc(d.mine)} · فرقي: ${esc(d.teams.map(teamName).join('، '))}</p>
        <p role="status" aria-live="polite" data-ops-status></p>
        ${items.length ? `<ul class="ops-list">${items.map((a) => alertHtml(a)).join('')}</ul>` : '<div class="adm-state is-empty"><h2>مفيش تنبيهات هنا</h2><p>كل حاجة تمام دلوقتي.</p></div>'}`;
      if (d.unread) { await req('POST', '/admin/alerts/seen', { body: {} }); refreshBell(); }
    }
    wrap.addEventListener('click', async (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.alFilter) { filter = t.dataset.alFilter; return load(); }
      if (t.dataset.alClaim || t.dataset.alResolve || t.dataset.alTicket) { if (await alertAction(t, status)) { const m = wrap.querySelector('[data-ops-status]').textContent; await load(); status(m); } }
    });
    load();
    return wrap;
  }

  /* ───────────── page: tickets ───────────── */
  function renderTickets() {
    const wrap = root.document.createElement('div'); wrap.className = 'ops';
    const C = core(); const f = { team: '', status: '', mine: '' };
    const status = (m) => { const n = wrap.querySelector('[data-ops-status]'); if (n) n.textContent = m || ''; };
    const opt = (obj, cur, all) => (all ? `<option value="">${all}</option>` : '') + Object.entries(obj).filter(([k]) => k !== 'owner').map(([k, l]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const ticketHtml = (t) => `<li class="ops-tk is-${esc(t.priority)}" data-tk="${esc(t.id)}"><details><summary><strong>${esc(t.title)}</strong>
        <small class="ord-muted">${esc(teamName(t.team))} · ${esc(C.PRIORITY_LABEL[t.priority])} · ${esc(C.TICKET_STATUS[t.status])}${t.owner ? ' · مع ' + esc(t.owner.name || 'زميل') : ''} · ${esc(ago(t.updatedAt))}</small></summary>
        ${t.description ? `<p>${esc(t.description)}</p>` : ''}${t.link ? `<p><a href="${esc(t.link)}">افتح المكان المرتبط</a></p>` : ''}
        <ul class="ops-notes">${(t.notes || []).map((n) => `<li><b>${esc((n.by && n.by.name) || '')}</b> ${esc(n.text)} <small class="ord-muted">${esc(ago(n.at))}</small></li>`).join('')}</ul>
        <div class="ops-al-acts">${t.status !== 'doing' ? `<button type="button" class="adm-btn" data-tk-set="doing" data-id="${esc(t.id)}">ابدأ فيه</button>` : ''}${t.status !== 'done' ? `<button type="button" class="adm-btn adm-btn-p" data-tk-set="done" data-id="${esc(t.id)}">خلص</button>` : ''}</div>
        <form class="ops-note-f" data-tk-note="${esc(t.id)}"><label class="hs-grid-field"><span>ملاحظة</span><input name="text" maxlength="500" required></label><button type="submit" class="adm-btn">أضف</button></form>
      </details></li>`;
    async function load() {
      const q = {}; if (f.team) q.team = f.team; if (f.status) q.status = f.status; if (f.mine) q.mine = '1';
      const r = await req('GET', '/admin/tickets', { query: q });
      if (!r.ok) { wrap.innerHTML = `<div class="adm-state"><h2>تعذّر تحميل البلاغات</h2><p>${esc(errText(r))}</p></div>`; return; }
      wrap.innerHTML = `<form class="ops-new" data-tk-new><h2>بلاغ جديد</h2>
          <label class="hs-grid-field"><span>العنوان</span><input name="title" minlength="3" maxlength="120" required></label>
          <label class="hs-grid-field"><span>التفاصيل</span><textarea name="description" maxlength="1000" rows="2"></textarea></label>
          <label class="hs-grid-field"><span>الفريق</span><select name="team">${opt(C.TEAMS, 'ops')}</select></label>
          <label class="hs-grid-field"><span>الأولوية</span><select name="priority">${opt(C.PRIORITY_LABEL, 'normal')}</select></label>
          <p><button type="submit" class="adm-btn adm-btn-p">افتح البلاغ</button></p></form>
        <div class="ops-bar" role="group" aria-label="تصفية البلاغات">
          <label class="hs-grid-field"><span>الفريق</span><select data-tk-f="team">${opt(C.TEAMS, f.team, 'كل الفرق')}</select></label>
          <label class="hs-grid-field"><span>الحالة</span><select data-tk-f="status">${opt(C.TICKET_STATUS, f.status, 'كل الحالات')}</select></label>
          <label class="hs-grid-field"><span>بلاغاتي بس</span><input type="checkbox" data-tk-f="mine"${f.mine ? ' checked' : ''}></label></div>
        <p role="status" aria-live="polite" data-ops-status></p>
        ${r.data.items.length ? `<ul class="ops-list">${r.data.items.map(ticketHtml).join('')}</ul>` : '<div class="adm-state is-empty"><h2>مفيش بلاغات</h2><p>افتح بلاغ جديد من الفورم اللي فوق، أو حوّل تنبيه لبلاغ.</p></div>'}`;
    }
    wrap.addEventListener('change', (e) => { const k = e.target.dataset && e.target.dataset.tkF; if (!k) return; f[k] = k === 'mine' ? (e.target.checked ? '1' : '') : e.target.value; load(); });
    wrap.addEventListener('click', async (e) => {
      const t = e.target.closest('button[data-tk-set]'); if (!t) return;
      t.disabled = true;
      const r = await req('PATCH', '/admin/tickets/' + encodeURIComponent(t.dataset.id), { body: { status: t.dataset.tkSet } });
      if (!r.ok) { t.disabled = false; return status(errText(r)); }
      await load(); status(t.dataset.tkSet === 'done' ? 'البلاغ خلص.' : 'البلاغ بقى معاك.');
    });
    wrap.addEventListener('submit', async (e) => {
      const form = e.target; e.preventDefault();
      if (form.hasAttribute('data-tk-new')) {
        const r = await req('POST', '/admin/tickets', { body: { title: form.title.value, description: form.description.value, team: form.team.value, priority: form.priority.value } });
        if (!r.ok) return status(errText(r) + (r.error && r.error.details ? ' — ' + Object.values(r.error.details).join('، ') : ''));
        await load(); return status('اتفتح البلاغ.');
      }
      if (form.dataset.tkNote) {
        const r = await req('POST', '/admin/tickets/' + encodeURIComponent(form.dataset.tkNote) + '/notes', { body: { text: form.text.value } });
        if (!r.ok) return status(errText(r));
        await load(); status('اتضافت الملاحظة.');
      }
    });
    load();
    return wrap;
  }

  /* ───────────── «صندوق الشغل» on the home page ───────────── */
  function mountWorkBox(host) {
    host.className = 'ops-box';
    const status = (m) => { const n = host.querySelector('[data-ops-status]'); if (n) n.textContent = m || ''; };
    async function load() {
      const [a, t] = await Promise.all([req('GET', '/admin/alerts'), req('GET', '/admin/tickets', { query: { mine: '1', open: '1' } })]);
      if (!a.ok && !t.ok) { host.innerHTML = ''; return; }                   // no alerts / tickets permission: no box
      const alerts = a.ok ? a.data.items.filter((x) => x.status !== 'resolved') : [];
      const mine = alerts.filter((x) => x.status === 'claimed'), open = alerts.filter((x) => x.status === 'open').slice(0, 5);
      const tickets = t.ok ? t.data.items.slice(0, 5) : [];
      host.innerHTML = `<section class="ops-box-in" aria-labelledby="ops-box-h"><h2 id="ops-box-h">صندوق الشغل</h2>
        <p role="status" aria-live="polite" data-ops-status></p>
        ${!alerts.length && !tickets.length ? '<p class="ord-muted">مفيش حاجة مستنياك دلوقتي.</p>' : ''}
        ${mine.length ? `<h3>معايا</h3><ul class="ops-list">${mine.map((x) => alertHtml(x, true)).join('')}</ul>` : ''}
        ${open.length ? `<h3>مستنية حد يستلمها</h3><ul class="ops-list">${open.map((x) => alertHtml(x, true)).join('')}</ul>` : ''}
        ${tickets.length ? `<h3>بلاغاتي المفتوحة</h3><ul class="ops-list">${tickets.map((k) => `<li><a href="#/tickets">${esc(k.title)}</a> <small class="ord-muted">${esc(core().TICKET_STATUS[k.status])}</small></li>`).join('')}</ul>` : ''}
        <p><a href="#/alerts">كل التنبيهات</a> · <a href="#/tickets">كل البلاغات</a></p></section>`;
    }
    host.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b || !(b.dataset.alClaim || b.dataset.alResolve)) return;
      if (await alertAction(b, status)) { const m = host.querySelector('[data-ops-status]').textContent; await load(); status(m); }
    });
    load();
  }

  /* ───────────── bell ───────────── */
  let bellTimer = 0;
  async function refreshBell() {
    const doc = root.document; if (!doc) return;
    const head = doc.querySelector('.adm-head'); if (!head) return;
    let bell = head.querySelector('[data-adm-bell]');
    if (!bell) {
      bell = doc.createElement('a'); bell.href = '#/alerts'; bell.className = 'adm-btn adm-bell'; bell.setAttribute('data-adm-bell', '');
      bell.setAttribute('aria-label', 'التنبيهات'); bell.innerHTML = BELL + '<span class="adm-bell-n" hidden></span>';
      const acc = head.querySelector('#adm-account'); head.insertBefore(bell, acc || null);
    }
    const r = await req('GET', '/admin/alerts');
    if (!r.ok) { bell.hidden = true; return; }                                // role without alerts: no bell
    bell.hidden = false;
    const n = bell.querySelector('.adm-bell-n'), c = +r.data.unread || 0;
    n.hidden = !c; n.textContent = c > 99 ? '99+' : String(c);
    bell.setAttribute('aria-label', c ? 'التنبيهات — ' + c + ' جديد' : 'التنبيهات');
  }
  function startBell() {
    if (bellTimer || !root.setInterval) return;
    refreshBell();
    bellTimer = root.setInterval(() => { if (!root.document || root.document.visibilityState !== 'hidden') refreshBell(); }, 120000);   // cost: each check loads the open alerts — every 2 minutes, paused while the tab is hidden
  }

  /* role home: the tech team opens on its own centre, the call centre on #/callcenter (no access to the day view's data) */
  function roleHome() {
    try {
      const R = root.HSAdminRbac, h = root.location && root.location.hash;
      const home = R && R.state && { tech: '#/tech', callcenter: '#/callcenter' }[R.state.actor];
      if (home && (!h || h === '#' || h === '#/' || h === '#/dashboard')) root.location.hash = home;
    } catch (e) { /* never block the shell */ }
  }

  const api_ = { renderAlerts, renderTickets, mountWorkBox, refreshBell, startBell, roleHome, alertHtml };
  root.HSOpsCenter = api_;
  if (typeof module !== 'undefined' && module.exports) module.exports = api_;
  /* the pages are registered by pages/alerts.page.js */

  if (root.document && root.addEventListener) {
    const boot = () => { roleHome(); startBell(); };
    if (root.document.readyState === 'loading') root.addEventListener('DOMContentLoaded', boot); else root.setTimeout(boot, 0);
    root.addEventListener('hashchange', () => { roleHome(); if (!root.document.querySelector('[data-adm-bell]')) refreshBell(); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
