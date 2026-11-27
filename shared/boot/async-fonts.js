/* boot: async-fonts — the Google Fonts stylesheet loads with media="print" (not render-blocking) and switches to all
   once loaded. Replaces the inline onload="this.media='all'" handler so the pages carry no inline code (CSP). */
(function () {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;   /* non-browser hosts (unit-test vm) */
  function on(l) { if (l.media === 'all') return; if (l.sheet) { l.media = 'all'; return; } l.addEventListener('load', function () { l.media = 'all'; }, { once: true }); }
  function run() { var ls = document.querySelectorAll('link[data-async-font]'); for (var i = 0; i < ls.length; i++) on(ls[i]); }
  run();
  if (!document.addEventListener) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  /* images marked data-remove-on-error disappear when they fail (replaces inline onerror="this.remove()") */
  document.addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'IMG' && t.hasAttribute('data-remove-on-error')) t.remove(); }, true);
})();