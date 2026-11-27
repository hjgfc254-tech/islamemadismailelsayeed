/**
 * MODULE: work-inbox (HSWorkInbox) — «صندوق الشغل» on the home page, item by item, for a team of employees (2026-11-27).
 * Each employee sees the work of THEIR permissions only (a provider to review, an order with no provider, an open
 * complaint, platform share overdue, a refund in progress), oldest / most urgent first, with:
 *   • «أنا هاخده»  — takes the item: opens a ticket linked to the item and puts it on me, so colleagues see «مع فلان»;
 *   • «حوّل لـ…»   — hands the item to a colleague or to another team (finance, content…);
 *   • ملاحظات      — internal notes on the item (the ticket's notes; customers and providers never see them);
 *   • «خلصت»       — closes my ticket; quick actions (approve, auto-assign, resolve) without leaving the page;
 *   • the owner / admins also see «الفريق»: who holds what and what is late.
 * Ownership lives in the existing tickets store (/admin/tickets — server: functions/src/alerts.js, demo: services/ops-api.js),
 * keyed by the item link (e.g. #/order/<id>). Items come from the synced read model (MP). No new route, no new storage.
 * Other team alerts (system, payment disputes…) still show below through HSOpsCenter.alertHtml.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 2 }).format(+n || 0); } catch (e) { return String(+n || 0); } };
  const req = (method, path, opts) => (root.HSApiClient ? root.HSApiClient.request(method, path, opts || {}) : Promise.resolve({ ok: false, error: { message: 'الخدمة غير متاحة' } }));
  const errText = (r) => (r && r.error && r.error.message) || 'حصل خطأ، جرّب تاني';
  const TEAM = { ops: 'التشغيل والدعم', finance: 'المالية', content: 'المحتوى والأسعار', tech: 'التقنية' };
  const ago = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? 'دلوقتي' : m < 60 ? m + ' دقيقة' : m < 1440 ? Math.round(m / 60) + ' ساعة' : Math.round(m / 1440) + ' يوم'; };
  const t = (iso) => { const v = Date.parse(iso); return Number.isFinite(v) ? v : 0; };
  const href = (kind, id, q) => '#/' + kind + '/' + encodeURIComponent(String(id || '')) + (q ? '?' + q : '');
  /* hidden alert kinds: the same work is listed item by item here (the alerts stay in «التنبيهات») */
  const COVERED = ['request.unassigned', 'bidding.empty', 'provider.pending', 'complaint.new', 'collection.overdue'];

  /**
   * Work items from the read model (pure; unit-tested). Each:
   * {key (= ticket link), kind, team, module (view permission), title, sub, since (ms), late, level: 'critical'|'warn'|'info', ref}
   */
  function items(d, now) {
    d = d || {}; now = now || Date.now();
    const L = (k) => (Array.isArray(d[k]) ? d[k] : []);
    const name = (k, id) => { const x = L(k).find((y) => y.id === id); return x ? x.name : ''; };
    const out = [];
    L('providers').filter((p) => p.status === 'pending').forEach((p) => {
      const since = t(p.createdAt) || now;
      out.push({ key: href('provider', p.id), kind: 'provider.pending', team: 'ops', module: 'providers', title: 'فني جديد مستني مراجعة: ' + (p.name || 'بدون اسم'),
        sub: (p.cats || []).map((c) => { try { return typeof MP !== 'undefined' && MP.catName ? MP.catName(c) : c; } catch (e) { return c; } }).join('، '), since, late: now - since > 86400000, level: now - since > 86400000 ? 'warn' : 'info', ref: p.id });
    });
    L('serviceRequests').filter((r) => ['received', 'searching'].includes(r.status)).forEach((r) => {
      const since = t(r.createdAt) || now, min = (now - since) / 60000;
      out.push({ key: href('order', r.id), kind: 'request.unassigned', team: 'ops', module: 'orders', title: 'طلب من غير فني: ' + (r.no || r.id),
        sub: [r.serviceName, [r.area, r.gov].filter(Boolean).join('، ')].filter(Boolean).join(' — '), since, late: min >= 30, level: min >= 120 ? 'critical' : min >= 30 ? 'warn' : 'info', ref: r.id });
    });
    L('complaints').filter((k) => k.status === 'open').forEach((k) => {
      const since = t(k.at) || now, r = L('serviceRequests').find((x) => x.id === k.reqId), pay = /payment|cash/i.test(String(k.kind || ''));
      out.push({ key: k.reqId ? href('order', k.reqId, 'complaint=' + encodeURIComponent(k.id)) : '#/complaints?k=' + encodeURIComponent(k.id), kind: 'complaint', team: 'ops', module: 'complaints',
        title: (pay ? 'خلاف على الدفع' : 'شكوى') + (r ? ' على ' + (r.no || r.id) : ''), sub: String(k.text || '').slice(0, 90), since, late: now - since > 4 * 3600000,
        level: pay || now - since > 24 * 3600000 ? 'critical' : 'warn', ref: k.id });
    });
    const owed = {};
    L('transactions').filter((x) => !x.free && x.collection === 'pending' && x.providerId && now - t(x.at) > 7 * 86400000).forEach((x) => {
      const o = owed[x.providerId] || (owed[x.providerId] = { sum: 0, n: 0, since: now }); o.sum += +x.commission || 0; o.n += 1; o.since = Math.min(o.since, t(x.at) || now);
    });
    Object.keys(owed).forEach((pid) => out.push({ key: href('provider', pid, 'collect=1'), kind: 'collection.overdue', team: 'finance', module: 'finance',
      title: 'حصة منصة متأخرة على ' + (name('providers', pid) || 'فني'), sub: nf(Math.round(owed[pid].sum * 100) / 100) + ' ج.م من ' + nf(owed[pid].n) + ' شغلانة', since: owed[pid].since, late: true, level: 'warn', ref: pid }));
    L('serviceRequests').filter((r) => r.payment && r.payment.refund && r.payment.refund.status === 'pending').forEach((r) => {
      const since = t(r.payment.refund.at) || now;
      out.push({ key: href('order', r.id, 'refund=1'), kind: 'refund.pending', team: 'finance', module: 'finance', title: 'استرجاع فلوس جاري: ' + (r.no || r.id),
        sub: nf(r.payment.refund.amount) + ' ج.م — بيتبعت لـ Paymob تلقائيًا', since, late: now - since > 2 * 86400000, level: 'info', ref: r.id });
    });
    const rank = { critical: 2, warn: 1, info: 0 };
    return out.sort((a, b) => rank[b.level] - rank[a.level] || a.since - b.since);
  }

  /** Joins items with the open tickets (by link): who holds each item; my tickets whose item is finished. (pure) */
  function join(list, tickets, mineIds) {
    const byLink = {}; (tickets || []).forEach((k) => { if (k.link && k.status !== 'done' && !byLink[k.link]) byLink[k.link] = k; });
    const mine = new Set(mineIds || []);
    const rows = list.map((it) => { const tk = byLink[it.key] || null; return Object.assign({}, it, { ticket: tk, holder: tk && tk.owner ? tk.owner : null, mine: !!(tk && mine.has(tk.id)) }); });
    const keys = new Set(list.map((i) => i.key));
    const finished = (tickets || []).filter((k) => mine.has(k.id) && k.status !== 'done' && /^#\/(order|provider|customer|complaints)/.test(k.link || '') && !keys.has(k.link));
    return { rows, finished };
  }

  /* ───────── permissions (presentation; the server re-checks) ───────── */
  const emp = () => { try { return root.HSAdminSession && root.HSAdminSession.current ? root.HSAdminSession.current() : null; } catch (e) { return null; } };
  const can = (m, a) => { const G = root.HSAdminPermissionGuard, e = emp(); if (!G || !root.HSAdminSession) return true; return !!e && G.can(e, m, a); };
  const isLead = () => { const e = emp(); return !e || ['owner', 'admin'].includes(e.role); };
  const roster = () => { try { return ((root.HSAdminRbac && root.HSAdminRbac.state && root.HSAdminRbac.state.roster) || []).filter((e) => e.status === 'active'); } catch (e) { return []; } };
  const fb = () => !!(root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase');
  const personId = (e) => (fb() ? e.uid || e.id : e.id);   /* tickets store the server uid live, the roster id in the demo */

  function mount(host) {
    host.className = 'wi';
    let tab = 'open', openKey = '', mineIds = [], tickets = [], ticketsOk = false, alerts = [], msg = '';
    const status = (m) => { msg = m || ''; const n = host.querySelector('[data-wi-status]'); if (n) n.textContent = msg; };
    const btn = (attrs, text, kind) => `<button type="button" class="adm-btn${kind === 'p' ? ' adm-btn-p' : kind === 'd' ? ' adm-btn-d' : ''}" ${attrs}>${esc(text)}</button>`;

    async function load() {
      const [all, mine, al] = await Promise.all([req('GET', '/admin/tickets', { query: { open: '1' } }), req('GET', '/admin/tickets', { query: { open: '1', mine: '1' } }), req('GET', '/admin/alerts')]);
      ticketsOk = !!all.ok; tickets = all.ok ? all.data.items : []; mineIds = mine.ok ? mine.data.items.map((k) => k.id) : [];
      alerts = al.ok ? al.data.items.filter((a) => a.status !== 'resolved' && !COVERED.includes(a.kind)) : [];
      paint();
    }
    const quick = (it) => {
      if (it.kind === 'provider.pending' && can('providers', 'decide')) return btn(`data-wi-q="padmit" data-ref="${esc(it.ref)}"`, 'قبول') + btn(`data-wi-q="preject" data-ref="${esc(it.ref)}"`, 'رفض', 'd');
      if (it.kind === 'request.unassigned' && can('orders', 'decide')) return btn(`data-wi-q="automatch" data-ref="${esc(it.ref)}"`, 'اختيار فني تلقائي');
      if (it.kind === 'complaint' && can('complaints', 'decide')) return btn(`data-wi-q="resolve" data-ref="${esc(it.ref)}"`, 'سجّل الحل');
      return '';
    };
    const rowHtml = (it) => {
      const own = it.holder ? (it.mine ? 'معاك' : 'مع ' + (it.holder.name || 'زميل')) : 'محدش ماسكه';
      const take = !ticketsOk ? '' : !it.ticket && can('tickets', 'create') ? btn(`data-wi-take="${esc(it.key)}"`, 'أنا هاخده', 'p')
        : it.ticket && !it.holder && can('tickets', 'edit') ? btn(`data-wi-takeover="${esc(it.ticket.id)}"`, 'أنا هاخده', 'p') : '';   /* handed to my team, nobody holds it */
      const mineActs = it.mine ? btn(`data-wi-open="${esc(it.key)}" aria-expanded="${openKey === it.key}"`, openKey === it.key ? 'اقفل التفاصيل' : 'حوّل / ملاحظات') + btn(`data-wi-done="${esc(it.ticket.id)}"`, 'خلصت') : '';
      const other = !it.mine && it.ticket ? btn(`data-wi-open="${esc(it.key)}" aria-expanded="${openKey === it.key}"`, openKey === it.key ? 'اقفل' : 'ملاحظات') : '';
      return `<li class="wi-it is-${esc(it.level)}${it.mine ? ' is-mine' : ''}" data-wi-key="${esc(it.key)}"><div class="wi-main">
          <a class="wi-t" href="${esc(it.key.split('?')[0])}">${esc(it.title)}</a>${it.sub ? `<p>${esc(it.sub)}</p>` : ''}
          <small class="ord-muted">${esc(TEAM[it.team] || it.team)} · من ${esc(ago(Date.now() - it.since))}${it.late ? ' · <b class="wi-late">متأخر</b>' : ''} · ${esc(own)}</small></div>
        <div class="wi-acts">${quick(it)}${take}${mineActs}${other}</div>${openKey === it.key && it.ticket ? panelHtml(it.ticket, it.mine) : ''}</li>`;
    };
    const panelHtml = (tk, mine) => {
      const people = roster().filter((e) => personId(e) && (!tk.owner || personId(e) !== tk.owner.id));
      return `<div class="wi-panel">
        <ul class="ops-notes">${(tk.notes || []).map((n) => `<li><b>${esc((n.by && n.by.name) || '')}</b> ${esc(n.text)} <small class="ord-muted">${esc(ago(Date.now() - t(n.at)))}</small></li>`).join('') || '<li class="ord-muted">مفيش ملاحظات لسه.</li>'}</ul>
        <form class="wi-row" data-wi-note="${esc(tk.id)}"><label class="hs-grid-field"><span>ملاحظة داخلية (العميل والفني مش بيشوفوها)</span><input name="text" maxlength="500" required autocomplete="off"></label><button type="submit" class="adm-btn">أضف</button></form>
        ${mine ? `<form class="wi-row" data-wi-move="${esc(tk.id)}"><label class="hs-grid-field"><span>حوّل لـ</span><select name="to"><option value="">اختار</option>
          <optgroup label="زميل">${people.map((e) => `<option value="p:${esc(personId(e))}|${esc(e.name)}">${esc(e.name)}</option>`).join('')}</optgroup>
          <optgroup label="فريق">${Object.keys(TEAM).filter((k) => k !== tk.team).map((k) => `<option value="t:${k}">${esc(TEAM[k])}</option>`).join('')}</optgroup></select></label><button type="submit" class="adm-btn">حوّل</button></form>` : ''}</div>`;
    };
    const teamHtml = () => {
      const by = {}; tickets.forEach((k) => { const n = k.owner ? k.owner.name || 'زميل' : 'محدش ماسكه'; (by[n] = by[n] || []).push(k); });
      const names = Object.keys(by).sort((a, b) => by[b].length - by[a].length);
      if (!names.length) return '<p class="ord-muted">مفيش شغل مفتوح مع حد دلوقتي.</p>';
      return `<div class="hs-grid-scroll"><table class="hs-grid-table"><thead><tr><th scope="col">الموظف</th><th scope="col">مفتوح معاه</th><th scope="col">أقدم حاجة</th><th scope="col">الشغل</th></tr></thead><tbody>${names.map((n) => {
        const l = by[n], oldest = Math.min(...l.map((k) => t(k.createdAt) || Date.now()));
        return `<tr><td>${esc(n)}</td><td>${esc(nf(l.length))}</td><td>${esc(ago(Date.now() - oldest))}</td><td>${l.slice(0, 4).map((k) => k.link && /^#\/[\w\-/?=&%.~:]*$/.test(String(k.link)) ? `<a href="${esc(String(k.link).split('?')[0])}">${esc(k.title)}</a>` : esc(k.title)).join('، ')}${l.length > 4 ? ' …' : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
    };

    function paint() {
      const all = typeof MP !== 'undefined' ? items(MP.db()) : [];
      const visible = all.filter((it) => can(it.module, 'view'));
      const { rows, finished } = join(visible, tickets, mineIds);
      const lists = { mine: rows.filter((r) => r.mine), open: rows.filter((r) => !r.mine && !r.holder), others: rows.filter((r) => r.holder && !r.mine) };
      const tabs = [['open', 'مستني حد', lists.open.length], ['mine', 'معايا', lists.mine.length + finished.length], ['others', 'مع زمايلي', lists.others.length]].concat(isLead() && ticketsOk ? [['team', 'الفريق', tickets.length]] : []);
      if (!tabs.some((x) => x[0] === tab)) tab = 'open';
      const late = rows.filter((r) => r.late && !r.holder).length;
      const body = tab === 'team' ? teamHtml()
        : (tab === 'mine' && finished.length ? `<div class="wi-finished"><p>حاجات معاك اتحلّت من مكانها — اقفلها:</p><ul class="ops-list">${finished.map((k) => `<li><a href="${esc(String(k.link).split('?')[0])}">${esc(k.title)}</a> ${btn(`data-wi-done="${esc(k.id)}"`, 'خلصت')}</li>`).join('')}</ul></div>` : '') +
          (lists[tab].length ? `<ul class="wi-list">${lists[tab].map(rowHtml).join('')}</ul>` : `<p class="ord-muted wi-empty">${tab === 'open' ? 'مفيش حاجة مستنية حد — كل حاجة ماسكها حد أو خلصت.' : tab === 'mine' && !finished.length ? 'مفيش حاجة معاك. خد حاجة من «مستني حد».' : tab === 'others' ? 'زمايلك مش ماسكين حاجة دلوقتي.' : ''}</p>`);
      host.innerHTML = `<section class="wi-in" aria-labelledby="wi-h"><div class="wi-head"><h2 id="wi-h">صندوق الشغل</h2>${late ? `<span class="wi-badge">${esc(nf(late))} متأخر ومحدش ماسكه</span>` : ''}${btn('data-wi-refresh', 'تحديث')}</div>
        <div class="ins-tabs" role="tablist" aria-label="صندوق الشغل">${tabs.map(([k, l, n]) => `<button type="button" role="tab" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}" data-wi-tab="${k}">${esc(l)} <span class="wi-n">${esc(nf(n))}</span></button>`).join('')}</div>
        <p role="status" aria-live="polite" class="ord-muted" data-wi-status>${esc(msg)}</p>${body}
        ${alerts.length && root.HSOpsCenter && root.HSOpsCenter.alertHtml ? `<h3 class="wi-h3">تنبيهات تانية</h3><ul class="ops-list">${alerts.slice(0, 6).map((a) => root.HSOpsCenter.alertHtml(a, true)).join('')}</ul>` : ''}
        <p class="ord-muted"><a href="#/alerts">كل التنبيهات</a> · <a href="#/tickets">كل البلاغات</a></p></section>`;
    }

    const run = async (fn, okMsg) => { const r = await fn(); if (!r || !r.ok) { status(errText(r)); return false; } await load(); status(okMsg); return true; };
    const ask = (q, danger) => (root.HSUiDialog ? root.HSUiDialog.confirm(q, { danger: !!danger }) : Promise.resolve(true));
    const askText = (q) => (root.HSUiDialog ? root.HSUiDialog.prompt(q, {}) : Promise.resolve(root.prompt ? root.prompt(q) : ''));

    host.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.wiTab) { tab = b.dataset.wiTab; openKey = ''; paint(); const n = host.querySelector(`[data-wi-tab="${tab}"]`); if (n) n.focus(); return; }
      if (b.hasAttribute('data-wi-refresh')) { status('جاري التحديث…'); await load(); status('اتحدّث.'); return; }
      if (b.dataset.wiOpen) { openKey = openKey === b.dataset.wiOpen ? '' : b.dataset.wiOpen; paint(); return; }
      b.disabled = true;
      try {
        if (b.dataset.wiTake) {
          const it = items(typeof MP !== 'undefined' ? MP.db() : {}).find((x) => x.key === b.dataset.wiTake); if (!it) { status('الحاجة دي اتحلّت خلاص.'); await load(); return; }
          const c = await req('POST', '/admin/tickets', { body: { title: it.title, description: it.sub, team: it.team, priority: it.level === 'critical' ? 'urgent' : it.level === 'warn' ? 'high' : 'normal', link: it.key } });
          if (!c.ok) { status(errText(c)); b.disabled = false; return; }
          await run(() => req('PATCH', '/admin/tickets/' + encodeURIComponent(c.data.id), { body: { status: 'doing' } }), 'بقت معاك — زمايلك هيشوفوا إنك ماسكها.');
          tab = 'mine'; paint(); return;
        }
        if (b.dataset.wiTakeover) { if (await run(() => req('PATCH', '/admin/tickets/' + encodeURIComponent(b.dataset.wiTakeover), { body: { status: 'doing' } }), 'بقت معاك.')) { tab = 'mine'; paint(); } return; }
        if (b.dataset.wiDone) { await run(() => req('PATCH', '/admin/tickets/' + encodeURIComponent(b.dataset.wiDone), { body: { status: 'done' } }), 'اتقفلت. شكرًا!'); return; }
        const q = b.dataset.wiQ, ref = b.dataset.ref, A = root.HSAdminApi, S = root.HSSupportApi;
        if (q === 'padmit') { await run(() => A.setProviderStatus(ref, 'approved'), 'الفني اتقبل.'); return; }
        if (q === 'preject') { if (!(await ask('رفض طلب انضمام الفني ده؟', true))) { b.disabled = false; return; } await run(() => A.setProviderStatus(ref, 'rejected'), 'طلب الانضمام اترفض.'); return; }
        if (q === 'automatch') { await run(() => A.assign(ref), 'اتختار فني تلقائيًا.'); return; }
        if (q === 'resolve') { const note = await askText('اكتب الحل اللي اتعمل (بيوصل لصاحب الشكوى):'); if (note == null || !String(note).trim()) { b.disabled = false; return; } await run(() => S.resolve(ref, String(note).trim()), 'الشكوى اتسجّلت محلولة.'); return; }
      } finally { if (b.isConnected) b.disabled = false; }
    });
    host.addEventListener('submit', async (e) => {
      const f = e.target; e.preventDefault();
      if (f.dataset.wiNote) { await run(() => req('POST', '/admin/tickets/' + encodeURIComponent(f.dataset.wiNote) + '/notes', { body: { text: f.text.value } }), 'الملاحظة اتضافت.'); return; }
      if (f.dataset.wiMove) {
        const v = f.to.value; if (!v) { status('اختار زميل أو فريق.'); return; }
        const body = v.startsWith('t:') ? { team: v.slice(2), owner: null, status: 'new' } : (() => { const [id, name] = v.slice(2).split('|'); return { owner: { id, name } }; })();
        const ok = await run(() => req('PATCH', '/admin/tickets/' + encodeURIComponent(f.dataset.wiMove), { body }), v.startsWith('t:') ? 'اتحوّلت للفريق — هتظهر عندهم في «مستني حد».' : 'اتحوّلت لزميلك.');
        if (ok) { openKey = ''; paint(); }
      }
    });
    /* a team alert card inside the box keeps its own buttons (claim / resolve) */
    host.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-al-claim],button[data-al-resolve]'); if (!b || !root.HSOpsCenter) return;
      const kind = b.dataset.alClaim ? 'claim' : 'resolve', id = b.dataset.alClaim || b.dataset.alResolve;
      await run(() => req('POST', '/admin/alerts/' + encodeURIComponent(id) + '/' + kind, { body: {} }), kind === 'claim' ? 'استلمت التنبيه.' : 'اتقفل التنبيه.');
      if (root.HSOpsCenter.refreshBell) root.HSOpsCenter.refreshBell();
    });
    host.innerHTML = '<section class="wi-in"><h2>صندوق الشغل</h2><p class="ord-muted">جاري التحميل…</p></section>';
    load();
    return host;
  }

  const api = { items, join, mount, COVERED };
  root.HSWorkInbox = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
