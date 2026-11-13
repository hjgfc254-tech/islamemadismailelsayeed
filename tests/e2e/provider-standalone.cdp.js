'use strict';
/* Provider P2 — real-browser QA for the standalone Provider app, with NO dependencies.
   Drives Chromium/Edge over the DevTools Protocol using Node's built-in WebSocket (Node >= 22).
   Not part of `npm test`.

   Usage (project root):
     python -m http.server 8099 --bind 127.0.0.1        # in another terminal / background
     node tests/e2e/provider-standalone.cdp.js http://127.0.0.1:8099
   Env:
     BROWSER=<path to msedge/chrome/chromium>  (default: Edge on Windows, else chromium/chrome on PATH locations)
     QA_SHOTS=<dir>                            (optional: write PNG screenshots per viewport; keep outside the repo)
   Google Fonts are blocked for determinism; a fresh profile is used so the cache-first Service Worker cannot serve stale JS. */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, '');
const ENTRY = BASE + '/apps/provider/index.html';
const VIEWPORTS = [[1280, 800], [768, 1024], [430, 932], [390, 844], [320, 640]];
const ROUTES = ['home', 'new', 'accepted', 'progress', 'quote', 'schedule', 'done', 'cancelled', 'reviews', 'transactions', 'earnings', 'services', 'notifications', 'profile'];
const CANDIDATES = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch() {
  const exe = CANDIDATES.find(p => fs.existsSync(p));
  if (!exe) throw new Error('No Chromium-based browser found; set BROWSER=<path>.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-cdp-'));
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  if (!fs.existsSync(portFile)) throw new Error('Browser did not expose DevToolsActivePort');
  await sleep(200);
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(t => t.type === 'page');
  return { proc, profile, exe, wsUrl: page.webSocketDebuggerUrl };
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0; const pending = new Map(); const handlers = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
    else if (msg.method) handlers.forEach(h => h(msg));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  return new Promise((resolve, reject) => { ws.onopen = () => resolve({ ws, send, on: h => handlers.push(h) }); ws.onerror = reject; });
}

async function main() {
  const browser = await launch();
  /* Guaranteed teardown: a failing step or a hung page must never leave the browser (and this process) running. */
  const teardown = () => { try { browser.proc.kill(); } catch {} try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch {} };
  const watchdog = setTimeout(() => { console.error('✗ watchdog: run exceeded 180s'); teardown(); process.exit(3); }, 180000);
  try { await run(browser); } finally { clearTimeout(watchdog); setTimeout(teardown, 300); }
}

async function run({ exe, wsUrl }) {
  console.log('Browser:', exe);
  const cdp = await connect(wsUrl);
  const errors = [];
  cdp.on(m => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Network.responseReceived' && m.params.response.url.startsWith(BASE) && m.params.response.status >= 400) errors.push(`HTTP ${m.params.response.status}: ${m.params.response.url}`);
    if (m.method === 'Network.loadingFailed' && !m.params.blockedReason && !m.params.canceled) errors.push('load failed: ' + m.params.errorText);
  });
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });

  const evaluate = async expr => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('evaluate failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + ' :: ' + expr.slice(0, 120));
    return r.result.value;
  };
  const waitFor = async (expr, timeout = 4000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await evaluate(expr)) return true; await sleep(50); } return false; };
  const key = async (k, code, vk, text) => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };
  const TAB = () => key('Tab', 'Tab', 9); const ENTER = () => key('Enter', 'Enter', 13, '\r'); const ESC = () => key('Escape', 'Escape', 27);
  const goto = async url => { await cdp.send('Page.navigate', { url }); await waitFor('document.readyState==="complete" && !!document.querySelector("#provider-view")'); await sleep(150); };
  const noOverflow = () => evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1');
  const clipped = () => evaluate(`[...document.querySelectorAll('#provider-view *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<-1)&&!e.closest('[style*="overflow"]');}).slice(0,3).map(e=>e.tagName+'.'+e.className).join(', ')`);
  /* Icons from ic() must be glyph-sized and unfilled; an unstyled SVG renders at container size with a black fill. */
  const badIcons = () => evaluate(`[...document.querySelectorAll('#provider-app svg.i')].filter(s=>{const r=s.getBoundingClientRect();return r.width>48||r.height>48||getComputedStyle(s).fill!=='none';}).length`);
  /* Focus a control; when it is missing, report what is on screen instead of throwing. */
  const focusEl = async (sel, label) => {
    const found = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e)e.focus();return !!e;})()`);
    if (!found) ok(false, `${label}: control ${sel} not rendered — hash ${await evaluate('location.hash')}, view: ${(await evaluate('document.querySelector("#provider-view")?.innerText||""')).replace(/\s+/g, ' ').slice(0, 160)}`);
    return found;
  };

  for (const [w, h] of VIEWPORTS) {
    const tag = `${w}px`;
    errors.length = 0;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
    // Isolate viewports: fresh demo store and no session. Page.navigate to a URL differing only by #fragment is a
    // same-document navigation (no reload), so clear storage and then force a real reload.
    await goto(ENTRY + '#/home');
    await evaluate('localStorage.clear(); sessionStorage.clear(); history.replaceState(null, "", "#/home"); true');
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor('document.readyState==="complete" && !!document.querySelector("#provider-view .pv-account-list")');
    ok(await waitFor('!!document.querySelector(".pv-account-list")'), `${tag} account picker renders`);
    ok(await noOverflow(), `${tag} picker: no horizontal overflow`);
    ok(await badIcons() === 0, `${tag} picker: icons glyph-sized`);

    // Keyboard: Tab reaches an account button with a visible focus indicator; Enter opens the workspace.
    let reached = false;
    for (let i = 0; i < 15 && !reached; i++) { await TAB(); reached = await evaluate('document.activeElement?.matches(".pv-account")'); }
    ok(reached, `${tag} Tab reaches a demo account button`);
    ok(await evaluate('getComputedStyle(document.activeElement).outlineStyle !== "none"'), `${tag} keyboard focus is visible`);
    await ENTER();
    ok(await waitFor('!document.querySelector("#provider-nav").hidden && !!document.querySelector(".pv-hero")'), `${tag} Enter opens the workspace`);
    ok(await evaluate('document.title.startsWith("الرئيسية |")'), `${tag} title reflects the route`);
    ok(await evaluate('document.activeElement?.id === "provider-view"'), `${tag} focus moves to the main view after sign-in`);

    // Seed one request offered to the selected provider (local demo store only).
    const rid = await evaluate(`(()=>{const id=sessionStorage.getItem('hs_provider_demo_session');MP.db().settings.autoAssign=false;
      const r=MP.createRequest({name:'عميل QA',phone:'01000000009',cat:'electric',serviceId:'s1',serviceName:'فحص لوحة كهرباء — اسم طويل لاختبار الالتفاف داخل البطاقة على الشاشات الصغيرة',desc:'وصف',gov:'القاهرة',area:'مدينة نصر',addr:'شارع 1'});
      MP.assign(r.id,id);return r.id;})()`);

    for (const route of ROUTES) {
      await evaluate(`location.hash='#/${route}'`); await sleep(80);
      const over = await noOverflow(); const clip = await clipped(); const icons = await badIcons();
      ok(over && !clip && icons === 0, `${tag} #/${route}: no overflow/clipping, icons glyph-sized${clip ? ' — ' + clip : ''}${icons ? ` — ${icons} oversized/filled icon(s)` : ''}`);
    }
    await evaluate(`location.hash='#/request/${rid}'`); await sleep(80);
    ok(await evaluate('document.activeElement?.id === "provider-view"'), `${tag} route change focuses the main view`);
    ok(await noOverflow(), `${tag} request details: no horizontal overflow`);

    // Keyboard: reject form opens with focus inside; Escape closes it and returns focus to the opener.
    await evaluate(`location.hash='#/new'`); await sleep(80);
    if (!await focusEl(`[data-pv-action="reject"][data-id="${rid}"]`, `${tag} reject`)) continue;
    await ENTER();
    ok(await waitFor('!!document.querySelector("#pv-reject-form") && !!document.activeElement.closest("#pv-reject-form")'), `${tag} Enter opens reject form with focus inside`);
    ok(await noOverflow(), `${tag} inline form: no horizontal overflow`);
    await ESC();
    ok(await waitFor(`!document.querySelector("#pv-reject-form") && document.activeElement?.matches('[data-pv-action="reject"][data-id="${rid}"]')`), `${tag} Escape closes the form and restores focus`);

    // Keyboard: accept moves to the accepted group and focuses the view.
    if (!await focusEl(`[data-pv-action="accept"][data-id="${rid}"]`, `${tag} accept`)) continue;
    await ENTER();
    ok(await waitFor('location.hash === "#/accepted" && document.activeElement?.id === "provider-view"'), `${tag} Enter on accept routes to accepted and focuses the view`);
    ok(await evaluate(`/تم قبول الطلب/.test(document.querySelector('#provider-toast').textContent)`), `${tag} success is announced in the live region`);
    ok(await evaluate(`(()=>{const t=document.querySelector('#provider-toast'),s=getComputedStyle(t),r=t.getBoundingClientRect();return s.position==='fixed'&&+s.opacity>0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})()`), `${tag} toast is visible, fixed and inside the viewport`);
    ok(await waitFor(`getComputedStyle(document.querySelector('#provider-toast')).opacity==='0'`, 4000), `${tag} toast hides again after its timeout`);
    await evaluate(`location.hash='#/home'`); await sleep(80);
    const avail = `document.querySelector('[data-pv-action="availability"]')`;
    const before = await evaluate(`[${avail}.getAttribute('aria-pressed'),getComputedStyle(${avail}).color]`);
    if (!await focusEl('[data-pv-action="availability"]', `${tag} availability`)) continue;
    await ENTER(); await sleep(80);
    const after = await evaluate(`[${avail}.getAttribute('aria-pressed'),getComputedStyle(${avail}).color,document.activeElement===${avail}]`);
    ok(before[0] !== after[0] && before[1] !== after[1] && after[2], `${tag} availability toggle: aria-pressed and colour change, focus kept`);
    await evaluate(`${avail}.click()`); await sleep(50);

    // Deep link + reload keeps the demo session and shows the request.
    await evaluate(`location.hash='#/request/${rid}'`); await sleep(80);
    await cdp.send('Page.reload'); await waitFor('document.readyState==="complete"'); await sleep(300);
    ok(await waitFor('/تفاصيل الطلب/.test(document.querySelector("#provider-view")?.textContent||"")'), `${tag} deep link survives reload`);

    if (process.env.QA_SHOTS) {
      fs.mkdirSync(process.env.QA_SHOTS, { recursive: true });
      for (const route of ['home', 'new']) {
        await evaluate(`location.hash='#/${route}'`); await sleep(150);
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(process.env.QA_SHOTS, `provider-${route}-${w}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
    ok(errors.length === 0, `${tag} no JS errors or failed local requests${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
  }

  await cdp.send('Browser.close').catch(() => {});
  cdp.ws.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 2; });
