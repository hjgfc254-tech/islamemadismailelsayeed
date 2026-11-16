/**
 * MODULE: admin-shell
 * RESPONSIBILITY: Admin shell and navigation frame — sidebar (collapsible rail on desktop,
 *   drawer on mobile), header, breadcrumbs, page title/description, actions area and the
 *   content container. FRONTEND DEMO ONLY.
 * STATUS: IMPLEMENTED (shell frame). Every NAV item has a registered page (apps/admin/pages/*.page.js, demo data);
 *   the «قريبًا» fallback below remains only as a guard for future items.
 *
 * Contract
 *   HSAdminShell.registerPage(id, { title, description?, parent?, actions?, render(ctx) })
 *       render may return an HTML string (trusted), a Node, or a Promise of either.
 *       ctx = { id, route, shell, signal }  — signal is aborted when the user leaves the page.
 *       actions = [{ id, label, kind?: 'primary'|'ghost'|'danger', onClick(ctx) }]
 *   HSAdminShell.mount(selectorOrElement)  — idempotent; auto-called for #admin-app[data-admin-shell].
 *   HSAdminShell.navigate(id)  /  .refresh()  /  .openDrawer()  /  .closeDrawer()  /  .toggleSidebar()
 *
 * Rules honoured here
 *   - A nav item is enabled ONLY when a page is registered for it. Otherwise it is rendered as
 *     disabled with a visible "قريبًا" tag — no dead links.
 *   - Routing is a minimal hash route (#/<page-id>) so direct links and Back work. A future
 *     admin-router.js may take over; it only needs to call navigate()/refresh().
 *   - Permissions are NOT enforced here and the shell says so to the user (demo banner).
 *   - Sidebar collapsed-state is a local UI preference only (localStorage, wrapped in try/catch).
 *   - Uses the shared icon registry (ic()) when loaded; falls back to no icon, never breaks.
 */
'use strict';
(function (root) {
  /* ───────────── Navigation model (one entry per documented admin page) ───────────── */
  const NAV = [
    { id: 'overview', label: 'نظرة عامة', items: [
      { id: 'dashboard', label: 'لوحة الإدارة', icon: 'grid' },
      { id: 'super-dashboard', label: 'لوحة المالك', icon: 'star' } ] },
    { id: 'operations', label: 'العمليات', items: [
      { id: 'marketplace', label: 'تشغيل السوق', icon: 'grid' },
      { id: 'orders', label: 'الطلبات', icon: 'list' },
      { id: 'providers', label: 'مقدمو الخدمة', icon: 'provider' },
      { id: 'customers', label: 'العملاء', icon: 'user' },
      { id: 'quotes', label: 'عروض الأسعار', icon: 'send' } ] },
    { id: 'catalog', label: 'الكتالوج', items: [
      { id: 'services', label: 'الخدمات', icon: 'p-service' },
      { id: 'categories', label: 'التصنيفات', icon: 'book' } ] },
    { id: 'finance', label: 'الماليات', items: [
      { id: 'finance', label: 'الماليات', icon: 'wallet' },
      { id: 'commissions', label: 'العمولات', icon: 'earnings' },
      { id: 'settlements', label: 'التسويات', icon: 'check' } ] },
    { id: 'quality', label: 'الجودة والتواصل', items: [
      { id: 'complaints', label: 'الشكاوى', icon: 'warn' },
      { id: 'reviews', label: 'التقييمات', icon: 'star' },
      { id: 'notifications', label: 'الإشعارات', icon: 'bell' },
      { id: 'reports', label: 'التقارير', icon: 'info' } ] },
    { id: 'team', label: 'الفريق والصلاحيات', items: [
      { id: 'workforce', label: 'فريق العمل', icon: 'admin' },
      { id: 'departments', label: 'الإدارات', icon: 'grid' },
      { id: 'roles', label: 'الأدوار', icon: 'medal' },
      { id: 'permissions', label: 'الصلاحيات', icon: 'key' } ] },
    { id: 'oversight', label: 'الرقابة والنظام', items: [
      { id: 'security', label: 'الأمان', icon: 'shield' },
      { id: 'audit', label: 'سجل التدقيق', icon: 'clock' },
      { id: 'settings', label: 'الإعدادات', icon: 'settings' } ] }
  ];
  /* Pages that exist but are reached from a parent page, not from the menu. */
  const HIDDEN_PAGES = { 'employee-details': { label: 'تفاصيل الموظف', parent: 'workforce' } };
  const DEFAULT_ROUTE = 'dashboard';
  const STORE_KEY = 'hs_admin_sidebar_collapsed';
  const DESKTOP_MQ = '(min-width:1024px)';

  /* ───────────── Pure helpers (routing lives in admin-router.js; nav model in navigation-builder.js) ───────────── */
  /* Browser: loaded before this file by index.html. Node tests: required next to this file. */
  const load = (g, file) => root[g] || (typeof require === 'function' ? require(file) : null);
  const Router = load('HSAdminRouter', './admin-router.js');
  const NavBuilder = load('HSAdminNavigationBuilder', './navigation-builder.js');
  if (!Router || !NavBuilder) throw new Error('admin-shell.js requires admin-router.js and navigation-builder.js to load first');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const flatItems = () => Router.flatItems(NAV);
  const findItem = (id) => Router.findItem(NAV, id);
  const parseHash = (hash) => Router.parse(hash);
  /** Breadcrumb trail as plain data: [{label, id?}] — last item is the current page. */
  const breadcrumbsFor = (id, titleOverride) => Router.breadcrumbs(NAV, HIDDEN_PAGES, id, titleOverride);
  /* Presentation-only access check (set by apps/admin/app.js from permission-guard.js). Default: everything visible. */
  let canViewRoute = () => true;

  /* ───────────── State ───────────── */
  const pages = Object.create(null);
  let els = null;           // cached DOM references after mount
  let current = null;       // { id, ac: AbortController }
  let lastFocus = null;
  let renderToken = 0;
  let mq = null;

  const icon = (name) => (typeof root.ic === 'function' ? root.ic(name) : (typeof ic === 'function' ? ic(name) : ''));
  const store = {
    get() { try { return root.localStorage.getItem(STORE_KEY) === '1'; } catch (e) { return false; } },
    set(v) { try { root.localStorage.setItem(STORE_KEY, v ? '1' : '0'); } catch (e) { /* storage unavailable: preference is session-only */ } }
  };
  const isDesktop = () => (mq ? mq.matches : true);

  /* ───────────── Markup ───────────── */
  const navItemHtml = (it) => {
    const ready = it.ready !== undefined ? it.ready : !!pages[it.id];
    const ico = `<span class="adm-ico" aria-hidden="true">${icon(it.icon)}</span>`;
    if (ready) {
      return `<li><a class="adm-link" href="#/${esc(it.id)}" data-nav="${esc(it.id)}">${ico}<span class="adm-lbl">${esc(it.label)}</span></a></li>`;
    }
    return `<li><span class="adm-link is-soon" role="link" aria-disabled="true" data-nav="${esc(it.id)}">${ico}<span class="adm-lbl">${esc(it.label)}</span><span class="adm-soon">قريبًا</span></span></li>`;
  };
  const navHtml = () => NavBuilder.build(NAV, { isRegistered: (id) => !!pages[id], canView: (id) => canViewRoute(id) }).map((g) =>
    `<section class="adm-group" aria-labelledby="adm-g-${esc(g.id)}"><h2 class="adm-group-t" id="adm-g-${esc(g.id)}">${esc(g.label)}</h2><ul class="adm-list">${g.items.map(navItemHtml).join('')}</ul></section>`
  ).join('');

  const shellHtml = () => `
<a class="adm-skip" href="#adm-main">تخطي إلى المحتوى</a>
<div class="adm" data-collapsed="0" data-drawer="closed">
  <header class="adm-head">
    <button type="button" class="adm-btn adm-toggle" id="adm-toggle" aria-controls="adm-side" aria-expanded="false" aria-label="فتح القائمة">${icon('menu')}</button>
    <a class="adm-brand" href="#/${DEFAULT_ROUTE}" aria-label="مركز الإدارة — هنصلحلك"><span class="adm-brand-t">هنصلحلك</span><small>مركز الإدارة</small></a>
    ${firebaseMode() ? '' : '<span class="adm-chip" role="note">واجهة تجريبية</span>'}
    <button type="button" class="adm-btn adm-search-btn" data-adm-palette aria-label="بحث سريع (Ctrl+K)" aria-keyshortcuts="Control+K">${icon('search')}<span>بحث سريع</span><kbd>Ctrl K</kbd></button>
    <div class="adm-account" id="adm-account" hidden></div>
    <a class="adm-btn adm-site" href="../customer/index.html">العودة للموقع</a>
  </header>
  <div class="adm-backdrop" id="adm-backdrop" hidden></div>
  <aside class="adm-side" id="adm-side" aria-label="القائمة الرئيسية للإدارة">
    <div class="adm-side-top">
      <strong class="adm-side-t">القائمة</strong>
      <button type="button" class="adm-btn adm-close" id="adm-close" aria-label="إغلاق القائمة">${icon('close')}</button>
    </div>
    <nav class="adm-nav" id="adm-nav" aria-label="صفحات الإدارة">${navHtml()}</nav>
    <button type="button" class="adm-btn adm-collapse" id="adm-collapse" aria-pressed="false">
      <span class="adm-ico" aria-hidden="true">${icon('chev')}</span><span class="adm-lbl">طيّ القائمة</span>
    </button>
  </aside>
  <main class="adm-main" id="adm-main" tabindex="-1">
    <div class="adm-banner" role="note">${icon('info')}<span>هذه لوحة تجريبية: البيانات محلية، والصلاحيات المعروضة هنا للعرض فقط وليست حماية فعلية.</span></div>
    <nav class="adm-crumbs" id="adm-crumbs" aria-label="مسار التنقل"></nav>
    <div class="adm-titlebar">
      <div class="adm-titles"><h1 class="adm-title" id="adm-title" tabindex="-1"></h1><p class="adm-desc" id="adm-desc"></p></div>
      <div class="adm-actions" id="adm-actions"></div>
    </div>
    <div class="adm-content" id="adm-content" aria-live="polite" aria-busy="false"></div>
  </main>
  <div class="adm-sr" id="adm-live" role="status" aria-live="polite"></div>
</div>`;

  /* ───────────── State views (loading / empty / error) ───────────── */
  /* ───────────── Firebase backend: only pages backed by server data render in production ───────────── */
  const firebaseMode = () => !!(root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase');
  /* marketplace = providers/requests/assignment/finance/complaints on the API; workforce/roles/permissions = server RBAC */
  const LIVE_PAGES = new Set(['marketplace', 'workforce', 'employee-details', 'roles', 'permissions',
    'orders', 'customers', 'providers', 'complaints', 'reviews', 'categories', 'quotes', 'finance', 'dashboard', 'settlements']);   /* these read real data via HSAdminLive (modules/admin-live.js); categories = the real catalogue, read-only */
  const notConnectedView = (id, title) => `<div class="adm-state is-soon" data-adm-not-connected="${esc(id)}">${icon('info')}<h2>${esc(title)} — غير مرتبطة بالخادم بعد</h2><p>هذه الصفحة ما زالت مبنية على بيانات تجريبية محلية، لذلك لا تُعرض في بيئة الإنتاج. العمليات الحية متاحة في «تشغيل السوق» و«فريق العمل».</p>${id === DEFAULT_ROUTE ? '<div data-adm-live-summary role="status" aria-live="polite"><p>جارٍ تحميل الأرقام الحية من الخادم…</p></div>' : ''}<a class="adm-btn adm-btn-p" href="#/marketplace">فتح تشغيل السوق</a></div>`;
  const SUMMARY_LABELS = { requests: 'كل الطلبات', unassigned: 'طلبات بلا مقدم خدمة', providers: 'مقدمو الخدمة', pending: 'تسجيلات بانتظار المراجعة', openComplaints: 'شكاوى مفتوحة', uncollected: 'عمولات غير محصّلة' };
  const fillLiveSummary = (token) => {
    const C = root.HSApiClient; if (!C) return;
    C.request('GET', '/admin/summary').then((res) => {
      if (token !== renderToken) return;
      const box = els.content.querySelector('[data-adm-live-summary]'); if (!box) return;
      if (!res.ok) { box.innerHTML = `<p>${esc((res.error && res.error.message) || 'تعذّر تحميل الأرقام الحية.')}</p>`; return; }
      box.innerHTML = '<dl class="adm-live-summary">' + Object.keys(SUMMARY_LABELS).map((k) => `<div><dt>${SUMMARY_LABELS[k]}</dt><dd>${esc(String(res.data[k] == null ? 0 : res.data[k]))}</dd></div>`).join('') + '</dl><p class="ord-muted">أرقام حية من الخادم.</p>';
    });
  };  const stateView = {
    loading: (t) => `<div class="adm-state is-loading" role="status"><div class="adm-spin" aria-hidden="true"></div><p>${esc(t || 'جارٍ التحميل…')}</p></div>`,
    soon: (label) => `<div class="adm-state is-soon">${icon('info')}<h2>${esc(label)} — غير منفذة بعد</h2><p>هذه الصفحة ما زالت قيد التنفيذ ولا تحتوي على وظائف حتى الآن.</p><a class="adm-btn adm-btn-p" href="#/${DEFAULT_ROUTE}" data-state-home>العودة للوحة الإدارة</a></div>`,
    unknown: () => `<div class="adm-state is-empty">${icon('search')}<h2>الصفحة غير موجودة</h2><p>الرابط الذي فتحته لا يطابق أي صفحة في مركز الإدارة.</p><a class="adm-btn adm-btn-p" href="#/${DEFAULT_ROUTE}">العودة للوحة الإدارة</a></div>`,
    error: () => `<div class="adm-state is-error" role="alert">${icon('warn')}<h2>تعذّر عرض الصفحة</h2><p>حدث خطأ أثناء تحميل المحتوى. يمكنك المحاولة مرة أخرى.</p><button type="button" class="adm-btn adm-btn-p" data-retry>حاول مرة أخرى</button></div>`,
    denied: () => `<div class="adm-state is-denied" role="alert">${icon('shield')}<h2>لا تملك صلاحية عرض هذه الصفحة</h2><p>دور حساب العرض الحالي لا يتضمن صلاحية «عرض» لهذه الوحدة (تقييد تجريبي للعرض فقط، وليس حماية فعلية).</p><a class="adm-btn adm-btn-p" href="#/${DEFAULT_ROUTE}">العودة للوحة الإدارة</a></div>`
  };

  /* ───────────── Rendering ───────────── */
  const setCrumbs = (id, title) => {
    const trail = breadcrumbsFor(id, title);
    const ready = (x) => x.id && pages[x.id];
    els.crumbs.innerHTML = `<ol>${trail.map((c, i) => {
      const last = i === trail.length - 1;
      const inner = last ? `<span aria-current="page">${esc(c.label)}</span>` : (ready(c) ? `<a href="#/${esc(c.id)}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`);
      return `<li>${inner}</li>`;
    }).join('')}</ol>`;
  };

  const setActions = (list, ctx) => {
    els.actions.innerHTML = '';
    (list || []).forEach((a) => {
      if (typeof a.hidden === 'function' && a.hidden()) return;   /* e.g. local demo actions while the Firebase backend is active */
      if (a.id === 'reset' && firebaseMode()) return;              /* demo-data restore never applies to server data */
      const b = root.document.createElement('button');
      b.type = 'button';
      b.className = 'adm-btn ' + (a.kind === 'primary' ? 'adm-btn-p' : a.kind === 'danger' ? 'adm-btn-d' : '');
      b.textContent = a.label;
      if (a.id) b.dataset.action = a.id;
      b.addEventListener('click', () => { if (typeof a.onClick === 'function') a.onClick(ctx); });
      els.actions.appendChild(b);
    });
  };

  const markActive = (id) => {
    const key = HIDDEN_PAGES[id] ? HIDDEN_PAGES[id].parent : id;
    els.nav.querySelectorAll('[data-nav]').forEach((n) => {
      const on = n.getAttribute('data-nav') === key;
      n.classList.toggle('is-active', on);
      if (on && n.tagName === 'A') n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
  };

  const mountContent = (out) => {
    els.content.innerHTML = '';
    if (out == null) return;
    if (typeof out === 'string') els.content.innerHTML = out;
    else els.content.appendChild(out);
  };

  const renderRoute = (id, opts) => {
    const token = ++renderToken;
    if (current && current.ac) current.ac.abort();
    const ac = typeof root.AbortController === 'function' ? new root.AbortController() : { signal: {}, abort() {} };
    current = { id, ac };
    const page = pages[id];
    const hidden = HIDDEN_PAGES[id];
    const meta = findItem(hidden ? hidden.parent : id);
    const ctx = { id, route: '#/' + id, shell: api, signal: ac.signal };

    markActive(id);
    els.content.setAttribute('aria-busy', 'false');

    let title, desc = '';
    if (page) { title = page.title; desc = page.description || ''; }
    else if (hidden) title = hidden.label;
    else if (meta) title = meta.label;
    else title = 'الصفحة غير موجودة';

    setCrumbs(id, title);
    els.title.textContent = title;
    els.desc.textContent = desc;
    els.desc.hidden = !desc;
    root.document.title = title + ' | مركز الإدارة | هنصلحلك';
    els.live.textContent = title;
    const denied = !canViewRoute(id);
    setActions(denied ? null : page && page.actions, ctx);

    if (denied) { mountContent(stateView.denied()); }
    else if (!page) { mountContent(meta || hidden ? stateView.soon(title) : stateView.unknown()); }
    else if (firebaseMode() && !LIVE_PAGES.has(id)) {
      /* Firebase backend: pages still built on local demo fixtures never show those fixtures as real data */
      setActions(null, ctx);
      if (root.HSAdminLivePanels && root.HSAdminLivePanels.ids.includes(id)) {   /* server-backed panel (modules/admin-live-panels.js) */
        mountContent('<div data-adm-live-panel="' + esc(id) + '"></div>');
        const host = els.content.querySelector('[data-adm-live-panel]'); if (host) root.HSAdminLivePanels.mount(id, host);
      } else {
        mountContent(notConnectedView(id, title));
        if (id === DEFAULT_ROUTE) fillLiveSummary(token);
      }
    }
    else {
      els.content.setAttribute('aria-busy', 'true');
      mountContent(stateView.loading());
      Promise.resolve().then(() => page.render(ctx)).then((out) => {
        if (token !== renderToken) return;
        els.content.setAttribute('aria-busy', 'false');
        mountContent(out);
      }).catch((err) => {
        if (token !== renderToken) return;
        els.content.setAttribute('aria-busy', 'false');
        mountContent(stateView.error());
        try { root.console && root.console.error('[admin-shell] page render failed:', id, err); } catch (e) { /* ignore */ }
      });
    }
    if (!(opts && opts.keepFocus)) { try { els.main.scrollTop = 0; root.scrollTo && root.scrollTo(0, 0); els.title.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  };

  /* ───────────── Sidebar / drawer behaviour ───────────── */
  const focusables = () => Array.from(els.side.querySelectorAll('a[href],button:not([disabled])')).filter((n) => n.offsetParent !== null);

  const applyCollapsed = (v) => {
    els.root.dataset.collapsed = v ? '1' : '0';
    els.collapse.setAttribute('aria-pressed', String(!!v));
    els.collapse.querySelector('.adm-lbl').textContent = v ? 'توسيع القائمة' : 'طيّ القائمة';
    els.collapse.setAttribute('aria-label', v ? 'توسيع القائمة' : 'طيّ القائمة');
    if (isDesktop()) els.toggle.setAttribute('aria-expanded', String(!v));
  };

  const openDrawer = () => {
    if (isDesktop() || els.root.dataset.drawer === 'open') return;
    lastFocus = root.document.activeElement;
    els.root.dataset.drawer = 'open';
    els.backdrop.hidden = false;
    els.toggle.setAttribute('aria-expanded', 'true');
    root.document.documentElement.classList.add('adm-lock');
    const f = focusables()[0]; if (f) f.focus();
  };
  const closeDrawer = (restore) => {
    if (els.root.dataset.drawer !== 'open') return;
    els.root.dataset.drawer = 'closed';
    els.backdrop.hidden = true;
    els.toggle.setAttribute('aria-expanded', 'false');
    root.document.documentElement.classList.remove('adm-lock');
    if (restore !== false && lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
    lastFocus = null;
  };
  const toggleSidebar = () => {
    if (isDesktop()) { const v = els.root.dataset.collapsed !== '1'; store.set(v); applyCollapsed(v); }
    else if (els.root.dataset.drawer === 'open') closeDrawer(); else openDrawer();
  };

  const onKey = (e) => {
    if (!els || els.root.dataset.drawer !== 'open') return;
    if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); return; }
    if (e.key === 'Tab') {            // keep focus inside the open drawer
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1], a = root.document.activeElement;
      if (e.shiftKey && (a === first || !els.side.contains(a))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !els.side.contains(a))) { e.preventDefault(); first.focus(); }
    }
  };

  /* ───────────── Public API ───────────── */
  const refreshNav = () => { if (els) { els.nav.innerHTML = navHtml(); markActive(current ? current.id : parseHash(root.location.hash)); } };

  const api = {
    NAV, DEFAULT_ROUTE,
    registerPage(id, def) {
      if (!/^[a-z0-9-]+$/.test(id || '') || !def || typeof def.render !== 'function' || !def.title) {
        throw new TypeError('registerPage(id, {title, render}) requires a valid id, a title and a render function');
      }
      if (!findItem(id) && !HIDDEN_PAGES[id]) throw new RangeError('Unknown admin page id: ' + id);
      pages[id] = def;
      refreshNav();
      if (els && current && current.id === id) renderRoute(id, { keepFocus: true });
    },
    isRegistered: (id) => !!pages[id],
    /** Install a presentation-only route visibility check (id → boolean); refreshes the nav and current page. */
    setAccess(fn) { canViewRoute = typeof fn === 'function' ? fn : () => true; refreshNav(); if (els && current) renderRoute(current.id, { keepFocus: true }); },
    canView: (id) => canViewRoute(id),
    /** Header slot for the signed-in demo account (markup supplied by apps/admin/app.js); empty string hides it. */
    setAccount(html) { if (!els) return; const slot = els.host.querySelector('#adm-account'); if (slot) { slot.innerHTML = html || ''; slot.hidden = !html; } },
    navigate(id) { root.location.hash = '#/' + id; },
    refresh() { if (els) renderRoute(parseHash(root.location.hash), { keepFocus: true }); },
    openDrawer, closeDrawer: () => closeDrawer(), toggleSidebar,
    mount(target) {
      if (els) return api;
      const host = typeof target === 'string' ? root.document.querySelector(target) : target;
      if (!host) throw new Error('HSAdminShell.mount: target not found');
      host.innerHTML = shellHtml();
      root.document.body.classList.add('adm-body');
      const q = (s) => host.querySelector(s);
      els = { host, root: q('.adm'), side: q('#adm-side'), nav: q('#adm-nav'), toggle: q('#adm-toggle'), collapse: q('#adm-collapse'),
        backdrop: q('#adm-backdrop'), main: q('#adm-main'), crumbs: q('#adm-crumbs'), title: q('#adm-title'), desc: q('#adm-desc'),
        actions: q('#adm-actions'), content: q('#adm-content'), live: q('#adm-live') };
      mq = typeof root.matchMedia === 'function' ? root.matchMedia(DESKTOP_MQ) : null;
      applyCollapsed(store.get());
      els.toggle.addEventListener('click', toggleSidebar);
      els.collapse.addEventListener('click', toggleSidebar);
      q('#adm-close').addEventListener('click', () => closeDrawer());
      els.backdrop.addEventListener('click', () => closeDrawer());
      els.nav.addEventListener('click', (e) => { if (e.target.closest('a[data-nav]')) closeDrawer(false); });
      els.content.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) api.refresh(); });
      root.document.addEventListener('keydown', onKey);
      root.addEventListener('hashchange', () => { closeDrawer(false); renderRoute(parseHash(root.location.hash)); });
      if (mq) {
        const onMq = () => { if (isDesktop()) { closeDrawer(false); applyCollapsed(store.get()); } else els.toggle.setAttribute('aria-expanded', 'false'); };
        if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
      }
      if (!isDesktop()) els.toggle.setAttribute('aria-expanded', 'false');
      renderRoute(parseHash(root.location.hash), { keepFocus: true });
      return api;
    },
    _internals: { parseHash, breadcrumbsFor, flatItems, findItem, esc, HIDDEN_PAGES }
  };

  root.HSAdminShell = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.document) {
    /* apps/admin/app.js (HSAdminApp) owns mounting when present: it shows the demo account picker first. */
    const auto = () => { if (root.HSAdminApp) return; const h = root.document.querySelector('#admin-app[data-admin-shell]'); if (h) api.mount(h); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', auto); else auto();
  }
})(typeof window !== 'undefined' ? window : globalThis);
