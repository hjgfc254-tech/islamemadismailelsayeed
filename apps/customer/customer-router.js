/**
 * MODULE: customer-router
 * Hash deep links for the Customer app (frontend only). Maps URL fragments to existing screens and back:
 *   #/home  #/sections  #/search  #/orders  #/account  #/track/<requestId>  #/provider/<providerId>
 * Pure: parse/format never touch the DOM. `sync()` mirrors the current screen into the URL with
 * history.replaceState (which never fires `hashchange`, so it cannot loop with the app's own listener).
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  const TABS = Object.freeze(['home', 'sections', 'search', 'orders', 'account']);
  /* screen name used by app.js show() → route segment, for screens that take an id */
  const PARAM_SCREENS = Object.freeze({ tracking: 'track', providerDetails: 'provider' });
  const SEGMENT_TO_SCREEN = Object.freeze({ track: 'tracking', provider: 'providerDetails' });
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  /** '#/track/r_1' → {screen:'tracking', id:'r_1', tab:'orders'}; '#/orders' → {screen:'orders', tab:'orders'}; invalid → null. */
  function parse(hash) {
    const raw = String(hash || '').replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '');
    if (!raw) return null;
    const [segment, rawId, ...rest] = raw.split('/');
    if (rest.length) return null;
    if (TABS.includes(segment) && rawId === undefined) return { screen: segment, tab: segment };
    const screen = SEGMENT_TO_SCREEN[segment];
    if (!screen || rawId === undefined) return null;
    let id = '';
    try { id = decodeURIComponent(rawId); } catch { return null; }
    if (!ID_RE.test(id)) return null;
    return { screen, id, tab: screen === 'tracking' ? 'orders' : 'home' };
  }

  /** Inverse of parse for routable screens; '' for screens that have no deep link (wizard, details, sheets…). */
  function format(screen, id) {
    if (TABS.includes(screen)) return '#/' + screen;
    const segment = PARAM_SCREENS[screen];
    if (segment && id !== undefined && id !== null && ID_RE.test(String(id))) return `#/${segment}/${encodeURIComponent(String(id))}`;
    return '';
  }

  /** Mirror the shown screen into the address bar without adding history entries. Returns the hash written, or ''. */
  function sync(screen, id) {
    const hash = format(screen, id);
    if (!hash) return '';
    try {
      if (root.location && root.location.hash !== hash && root.history && typeof root.history.replaceState === 'function') {
        root.history.replaceState(root.history.state, '', hash);
      }
    } catch {}
    return hash;
  }

  root.HSCustomerRouter = Object.freeze({ TABS, parse, format, sync, isTab: name => TABS.includes(name) });
})(globalThis);
