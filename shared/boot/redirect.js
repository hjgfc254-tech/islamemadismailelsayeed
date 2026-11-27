/* boot: redirect — sends a short entry URL to its page, keeping the query and hash (replaces inline location.replace;
   CSP: no inline code). Target: data-to on this script tag; data-keep="search" keeps the query string too. */
(function () {
  var s = document.currentScript; if (!s) return;
  var to = s.getAttribute('data-to'); if (!to || !/^[\w./-]+$/.test(to)) return;
  location.replace(to + (s.getAttribute('data-keep') === 'search' ? location.search : '') + location.hash);
})();