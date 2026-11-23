/**
 * MODULE: platform-status (HSPlatformStatus) — shows the owner's emergency switches to customers and providers.
 *   maintenance  → a full-screen notice (the app underneath is inert) with the owner's message and «جرّب تاني».
 *   pauseOrders  → Customer app: a banner — browsing works, new requests are refused by the API.
 *   pauseSignups → Provider app: a banner — provider sign-ups are refused by the API.
 * Reads settings.controls from the loaded store (local demo or the server's public settings) and re-checks on every
 * store change, every backend sync and every 30 s. The API enforces the switches; this module only explains them.
 */
'use strict';
(function (root) {
  const doc = root.document;
  if (!doc || root.HSPlatformStatus) return;
  const app = /\/apps\/provider\//.test((root.location && root.location.pathname) || '') ? 'provider' : 'customer';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const controls = () => { try { return ((typeof MP !== 'undefined' && MP.db().settings) || {}).controls || {}; } catch (e) { return {}; } };
  let last = '';

  function paint() {
    const c = controls();
    const m = c.maintenance && c.maintenance.on ? c.maintenance : null;
    const banner = !m && app === 'customer' && c.pauseOrders && c.pauseOrders.on ? (c.pauseOrders.message || 'استقبال الطلبات الجديدة متوقف مؤقتًا — تقدر تتابع طلباتك الحالية عادي.')
      : !m && app === 'provider' && c.pauseSignups && c.pauseSignups.on ? 'تسجيل مقدمي الخدمة الجدد متوقف مؤقتًا — الحسابات الحالية شغالة عادي.' : '';
    const key = JSON.stringify([!!m, m && m.message, banner]);
    if (key === last) return; last = key;
    const appRoot = doc.getElementById('app') || doc.getElementById('provider-app');
    let ov = doc.getElementById('hs-maint');
    if (m) {
      if (!ov && doc.createElement && doc.body) { ov = doc.createElement('div'); ov.id = 'hs-maint'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'hs-maint-t'); doc.body.appendChild(ov); }
      if (!ov) return;
      ov.innerHTML = `<div class="hs-maint-box"><img src="../../assets/brand/hsl-lockup.png" alt="هنصلحلك" width="180" height="59"><span class="hs-maint-ic" aria-hidden="true">${typeof ic === 'function' ? ic('wrench') : ''}</span>
        <h1 id="hs-maint-t">المنصة في صيانة دلوقتي</h1><p>${esc(m.message || 'بنحسّن الخدمة عشانك. طلباتك وبياناتك محفوظة — ارجع بعد شوية.')}</p>
        <button type="button" data-maint-retry>جرّب تاني</button></div>`;
      ov.querySelector('[data-maint-retry]').addEventListener('click', () => root.location.reload());
      if (appRoot) appRoot.setAttribute('inert', '');
      setTimeout(() => { const b = ov.querySelector('[data-maint-retry]'); if (b) b.focus(); }, 30);
    } else {
      if (ov) ov.remove();
      if (appRoot) appRoot.removeAttribute('inert');
    }
    let bn = doc.getElementById('hs-pause');
    if (banner) {
      if (!bn && doc.createElement && doc.body && doc.body.prepend) { bn = doc.createElement('div'); bn.id = 'hs-pause'; bn.setAttribute('role', 'status'); doc.body.prepend(bn); }
      if (bn) bn.textContent = banner;
    } else if (bn) bn.remove();
  }

  const start = () => {
    try { paint(); } catch (e) { /* minimal DOMs (tests) */ }
    if (typeof HSRealtimeClient !== 'undefined') HSRealtimeClient.subscribe('market:changed', () => setTimeout(paint, 0));
    doc.addEventListener('hs:backend-sync', () => setTimeout(paint, 0));
    if (typeof root.addEventListener === 'function') root.addEventListener('storage', () => setTimeout(paint, 0));
    if (typeof setInterval === 'function') setInterval(paint, 30000);
    /* demo / local mode: run the offers-round clock here (on the server a scheduled function does it every 5 min) */
    const local = !(root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase');
    const tick = () => { try { if (local && typeof MP !== 'undefined' && MP.tickBidding && MP.tickBidding().length && typeof HSRealtimeClient !== 'undefined' && HSRealtimeClient.notify) HSRealtimeClient.notify({ source: 'storage' }); } catch (e) {} };
    tick(); if (typeof setInterval === 'function') setInterval(tick, 60000);
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
  root.HSPlatformStatus = Object.freeze({ paint, controls, _reset: () => { last = ''; } });
})(typeof globalThis !== 'undefined' ? globalThis : this);
