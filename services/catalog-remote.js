/* Published service catalogue loader (customer / provider apps).
   The owner edits the catalogue in Admin › «كتالوج الخدمات» and publishes it; the server freezes it into one JSON file
   served at /catalog-feed through the CDN (functions/src/catalog-admin.js feed). Here, in Firebase mode only:
   - CAT already starts from the last copy saved on this device (services/local-catalog.js, key hs_catalog_pub), or
     from the built-in catalogue the first time — the app never waits for the network;
   - in the background we fetch /catalog-feed (browser revalidation + CDN cache: no Firestore read per customer);
   - a newer `rev` replaces the device copy and the open catalogue screens are drawn again; «off» drops it.
   Loaded after services/local-catalog.js and services/firebase-config.js. */
'use strict';
(function () {
  const G = typeof globalThis !== 'undefined' ? globalThis : window;
  const REDRAW = ['home', 'services', 'search'];
  function redraw() {
    try {
      /* the customer app's `state` / `show` are script-scope globals (let / function), not window properties */
      const st = typeof state !== 'undefined' ? state : null;   // eslint-disable-line no-undef
      if (!st || typeof show !== 'function' || !Array.isArray(st.stack)) return;   // eslint-disable-line no-undef
      const scr = st.stack.length ? st.stack[st.stack.length - 1] : st.tab;
      if (REDRAW.includes(String(scr).split(':')[0])) show(scr);   // eslint-disable-line no-undef
    } catch (e) { /* drawing again is best-effort */ }
  }
  /* apply(feed) → 'updated' | 'dropped' | 'same' (exported for tests) */
  function apply(d) {
    if (typeof CAT === 'undefined' || !d || typeof d !== 'object') return 'same';
    if (d.off) { if (CAT.rev()) { CAT.dropRemote(); return 'dropped'; } return 'same'; }
    return CAT.applyRemote(d) ? 'updated' : 'same';
  }
  async function refresh() {
    if (typeof fetch !== 'function' || typeof CAT === 'undefined' || !CAT.applyRemote) return 'same';
    const cfg = G.HSFirebaseConfig;
    if (!cfg || cfg.mode !== 'firebase') return 'same';
    try {
      const res = await fetch('/catalog-feed', { credentials: 'omit', cache: 'no-cache' });
      if (!res.ok) return 'same';
      const out = apply(await res.json());
      if (out !== 'same') redraw();
      return out;
    } catch (e) { return 'same'; }   /* offline / not deployed: keep what we have */
  }
  G.HSCatalogRemote = { refresh, apply };
  if (typeof document !== 'undefined' && typeof setTimeout === 'function') setTimeout(refresh, 1500);
})();
