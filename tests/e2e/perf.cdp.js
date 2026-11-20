'use strict';
/* First-visit load performance on a throttled phone profile (real browser via tests/e2e/lib/cdp.js).
   Profile: "Fast 3G"-like network (1.6 Mbit/s down, 750 kbit/s up, 150 ms RTT) and 4x CPU slowdown, cold cache, no
   service worker. Google Fonts are NOT blocked here (unlike the other runners) because the font is part of real load time.
   Reports FCP, LCP, DOMContentLoaded, load, transferred KB, request count and the longest main-thread task per entry.
   Budgets fail the run, so a regression shows up as ✗.
   Usage: node tests/e2e/perf.cdp.js            (serves the repo with gzip on 127.0.0.1:8097)
          node tests/e2e/perf.cdp.js <base-url>  (any other server)
          PERF_TOP=1 also lists the largest responses per page. */
const { connect, withBrowser, reporter, sleep } = require('./lib/cdp.js');

/* Without a URL argument the runner serves the repo itself with gzip, like GitHub Pages does (python -m http.server
   sends uncompressed files and overstates the transferred size about 3-4x). */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const ROOT = path.resolve(__dirname, '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
let server = null;
if (!process.argv[2]) {
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    let body = fs.readFileSync(file);
    const headers = { 'Content-Type': type, 'Cache-Control': 'max-age=600' };
    if (/text|json|svg/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) { body = zlib.gzipSync(body); headers['Content-Encoding'] = 'gzip'; }
    res.writeHead(200, headers); res.end(body);
  }).listen(8097, '127.0.0.1');
}
const BASE = (process.argv[2] || 'http://127.0.0.1:8097').replace(/\/$/, '');
const PAGES = [['customer', '/apps/customer/index.html'], ['provider', '/apps/provider/index.html'], ['admin', '/apps/admin/index.html'], ['landing', '/index.html']];
const BUDGET = { fcp: 3000, lcp: 4500, kb: 1500 };   // ms, ms, KB on the profile above
const { ok, failures } = reporter();

const COLLECT = String.raw`new Promise(res => {
  const out = { fcp: 0, lcp: 0, longTask: 0 };
  const p = performance.getEntriesByName('first-contentful-paint')[0]; if (p) out.fcp = p.startTime;
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.startTime >= out.lcp) { out.lcp = e.startTime; const el = e.element; out.lcpEl = el ? el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') + (e.url ? ' ' + e.url.split('/').pop() : '') : ''; } }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) out.longTask = Math.max(out.longTask, e.duration); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  setTimeout(() => { const n = performance.getEntriesByType('navigation')[0] || {}; out.dcl = n.domContentLoadedEventEnd || 0; out.load = n.loadEventEnd || 0; res(out); }, 1500);
})`;

withBrowser(async browser => {
  const cdp = await connect(browser.wsUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Network.enable');
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "try { if (!localStorage.getItem('hs_backend')) localStorage.setItem('hs_backend', 'local'); localStorage.setItem('hs_onboard_v1', '1'); } catch (e) {}" });
  await cdp.send('Network.setBlockedURLs', { urls: ['https://*.cloudfunctions.net/*', 'https://*.firebasedatabase.app/*', 'wss://*.firebasedatabase.app/*', 'https://identitytoolkit.googleapis.com/*', 'https://securetoken.googleapis.com/*'] });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 7.5e5 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });

  let bytes = 0, reqs = 0, top = []; const byUrl = new Map();   // PERF_TOP=1 prints the 12 largest responses per page
  cdp.on(m => {
    if (m.method === 'Network.requestWillBeSent') reqs++;
    if (m.method === 'Network.loadingFinished') { bytes += m.params.encodedDataLength; if (process.env.PERF_TOP) top.push([m.params.encodedDataLength, byUrl.get(m.params.requestId)]); }
    if (m.method === 'Network.responseReceived') byUrl.set(m.params.requestId, m.params.response.url);
  });
  const rows = [];
  for (const [name, path] of PAGES) {
    await cdp.send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    bytes = 0; reqs = 0;
    const loaded = new Promise(r => cdp.on(m => { if (m.method === 'Page.loadEventFired') r(); }));
    await cdp.send('Page.navigate', { url: BASE + path });
    await Promise.race([loaded, sleep(60000)]);
    const r = (await cdp.send('Runtime.evaluate', { expression: COLLECT, awaitPromise: true, returnByValue: true })).result.value;
    await sleep(500);
    const kb = Math.round(bytes / 1024);
    if (process.env.PERF_TOP) { console.log(`-- ${name} largest:`); top.sort((a, b) => b[0] - a[0]).slice(0, 12).forEach(([b, u]) => console.log(String(Math.round(b / 1024)).padStart(5) + ' KB  ' + String(u).replace(BASE, ''))); top = []; }
    rows.push({ page: name, fcp: Math.round(r.fcp), lcp: Math.round(r.lcp), dcl: Math.round(r.dcl), load: Math.round(r.load), kb, requests: reqs, longestTask: Math.round(r.longTask), lcpElement: r.lcpEl || '' });
    ok(r.fcp > 0 && r.fcp <= BUDGET.fcp, `${name}: FCP ${Math.round(r.fcp)} ms (budget ${BUDGET.fcp})`);
    ok(r.lcp > 0 && r.lcp <= BUDGET.lcp, `${name}: LCP ${Math.round(r.lcp)} ms (budget ${BUDGET.lcp})`);
    ok(kb <= BUDGET.kb, `${name}: ${kb} KB transferred in ${reqs} requests (budget ${BUDGET.kb} KB)`);
  }
  console.table(rows);
  console.log(failures() ? `✗ ${failures()} budget(s) exceeded` : '✓ all pages within budget');
  process.exitCode = failures() ? 1 : 0;
  if (server) server.close();
}, { watchdogMs: 400000 });
