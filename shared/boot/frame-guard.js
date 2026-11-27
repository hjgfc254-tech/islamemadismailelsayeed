/* boot: frame-guard — the Admin Center never runs inside another site's frame (clickjacking, security M4); also turns on
   the async web-font stylesheet (link[data-async-font]) without an inline onload handler (CSP: no inline code). */
(function () {
  try { if (window.top !== window.self) { document.documentElement.style.display = 'none'; try { window.top.location = window.self.location; } catch (e) { /* cross-origin */ } } } catch (e) { /* ignore */ }
})();