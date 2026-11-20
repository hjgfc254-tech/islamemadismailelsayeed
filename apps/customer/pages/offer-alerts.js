/**
 * MODULE: offer-alerts (HSOfferAlerts) — tells the customer the moment a provider answers an open offers round, wherever
 * they are in the app:
 *   • in-app banner «وصلك عرض جديد … بـ X ج.م» with «شوف العروض» (opens that request) — not shown while that request's
 *     tracking screen is already on screen (it refreshes live);
 *   • the tab title counts unseen offers «(2) هنصلحلك…» until the request is opened;
 *   • a short vibration where supported;
 *   • tab in the background: a system notification through the service worker when permission was already granted and
 *     the server push (Firebase mode) is not doing it. Never asks for permission by itself.
 * Offers that existed when the app opened are the baseline (no alert storm on reload).
 * Classic script on the Customer app globals (MP, me, show, state, esc, money).
 */
'use strict';
(function (root) {
  const doc = root.document;
  if (!doc || root.HSOfferAlerts) return;
  const APP_ICON = '../../assets/app-icon-192.png';   // notification image (a file, not a registry icon)
  let known = null; const unseen = new Map();          // reqId → count
  let baseTitle = doc.title, banner = null, hideT = 0;

  const customer = () => { try { return typeof me === 'function' ? me() : null; } catch (e) { return null; } };
  const open = (r) => r && r.bidding && ['received', 'searching', 'sent'].includes(r.status);
  function offers() {
    const c = customer(); if (!c || typeof MP === 'undefined') return [];
    const reqs = (MP.db().serviceRequests || []).filter((r) => r.customerId === c.id && open(r));
    return reqs.flatMap((r) => (typeof MP.offersFor === 'function' ? MP.offersFor(r.id) : [])
      .filter((a) => a.status === 'offered' && a.offer)
      .map((a) => ({ key: r.id + '|' + a.providerId + '|' + a.offer.at, r, a, p: MP.get('providers', a.providerId) || {} })));
  }
  const viewing = (reqId) => !!(typeof state !== 'undefined' && state.lastShown && state.lastShown.name === 'tracking' && state.lastShown.arg === reqId && doc.visibilityState !== 'hidden');
  const fmt = (n) => (typeof money === 'function' ? money(n) : (+n || 0).toLocaleString('ar-EG') + ' ج.م');
  const safe = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';'));

  function paintTitle() {
    const n = [...unseen.values()].reduce((s, v) => s + v, 0);
    const clean = doc.title.replace(/^\(\d+\)\s*/, ''); baseTitle = clean;
    doc.title = n ? `(${n}) ${clean}` : clean;
  }
  function openReq(reqId) {
    unseen.delete(reqId); paintTitle(); hide();
    try { state.stack.push('track:' + reqId); root.history.pushState({ t: 1 }, ''); show('tracking', reqId); } catch (e) {}
  }
  function hide() { if (banner) { banner.classList.remove('is-on'); const b = banner; setTimeout(() => b.remove(), 250); banner = null; } clearTimeout(hideT); }
  function showBanner(o, more) {
    hide();
    banner = doc.createElement('div');
    banner.className = 'offer-alert'; banner.setAttribute('role', 'status'); banner.setAttribute('aria-live', 'polite');
    const who = o.p.name ? safe(o.p.name) : 'فني';
    banner.innerHTML = `<span class="oa-ic" aria-hidden="true">${typeof ic === 'function' ? ic('bell') : ''}</span>
      <span class="oa-txt"><b>وصلك عرض جديد${more ? ` (+${(more).toLocaleString('ar-EG')})` : ''}</b><small>${who} — ${safe(fmt(o.a.offer.total))} على ${safe(o.r.serviceName || 'طلبك')}</small></span>
      <button type="button" class="oa-go" data-oa-open="${safe(o.r.id)}">شوف العروض</button>
      <button type="button" class="oa-x" data-oa-close aria-label="إخفاء">×</button>`;
    banner.addEventListener('click', (e) => {
      const go = e.target.closest('[data-oa-open]'); if (go) return openReq(go.getAttribute('data-oa-open'));
      if (e.target.closest('[data-oa-close]')) hide();
    });
    doc.body.appendChild(banner);
    requestAnimationFrame(() => banner && banner.classList.add('is-on'));
    hideT = setTimeout(hide, 12000);
  }
  function systemNotify(o, total) {
    try {
      if (root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase') return;     // the server push covers this
      if (!('Notification' in root) || root.Notification.permission !== 'granted' || !root.navigator.serviceWorker) return;
      root.navigator.serviceWorker.ready.then((reg) => reg.showNotification('وصلك عرض جديد', {
        body: `${o.p.name || 'فني'} — ${fmt(o.a.offer.total)}${total > 1 ? ` (${total.toLocaleString('ar-EG')} عروض جديدة)` : ''}`,
        icon: APP_ICON, badge: APP_ICON, dir: 'rtl', lang: 'ar', tag: 'offers-' + o.r.id, renotify: true,
        data: { link: 'apps/customer/index.html#/track/' + o.r.id }
      })).catch(() => {});
    } catch (e) {}
  }

  function check() {
    const list = offers();
    if (known === null) { known = new Set(list.map((o) => o.key)); return; }   // baseline: what was there on load
    const fresh = list.filter((o) => !known.has(o.key));
    fresh.forEach((o) => known.add(o.key));
    for (const reqId of [...unseen.keys()]) if (viewing(reqId)) unseen.delete(reqId);
    const alert = fresh.filter((o) => !viewing(o.r.id));
    if (alert.length) {
      alert.forEach((o) => unseen.set(o.r.id, (unseen.get(o.r.id) || 0) + 1));
      const top = alert[alert.length - 1];
      if (doc.visibilityState === 'hidden') systemNotify(top, alert.length);
      else { showBanner(top, alert.length - 1); try { if (root.navigator.vibrate) root.navigator.vibrate([60, 40, 60]); } catch (e) {} }
    }
    paintTitle();
  }

  const start = () => {
    check();
    if (typeof HSRealtimeClient !== 'undefined') HSRealtimeClient.subscribe('market:changed', () => setTimeout(check, 0));
    doc.addEventListener('hs:backend-sync', () => setTimeout(check, 0));
    doc.addEventListener('visibilitychange', () => setTimeout(check, 0));
    root.addEventListener('hashchange', () => setTimeout(check, 50));
    root.addEventListener('popstate', () => setTimeout(check, 50));
    setInterval(check, 15000);                                   // same-tab updates (own actions, timers)
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);

  root.HSOfferAlerts = Object.freeze({ check, unseen: () => new Map(unseen), _reset: () => { known = null; unseen.clear(); hide(); } });
})(typeof globalThis !== 'undefined' ? globalThis : this);
