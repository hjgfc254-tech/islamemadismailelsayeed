'use strict';
/* Shared, dependency-free Chromium/Edge DevTools Protocol helpers for manual browser QA runners (Node >= 22: built-in fetch/WebSocket).
   Used by tests/e2e/*.cdp.js. Not part of `npm test`. */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CANDIDATES = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
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

/* Page driver: evaluate/waitFor/keys plus error collection for local same-origin failures. */
function driver(cdp, base) {
  const errors = [];
  cdp.on(m => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Network.responseReceived' && m.params.response.url.startsWith(base) && m.params.response.status >= 400) errors.push(`HTTP ${m.params.response.status}: ${m.params.response.url}`);
    if (m.method === 'Network.loadingFailed' && !m.params.blockedReason && !m.params.canceled) errors.push('load failed: ' + m.params.errorText);
  });
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
  return { errors, evaluate, waitFor, key,
    TAB: () => key('Tab', 'Tab', 9), ENTER: () => key('Enter', 'Enter', 13, '\r'), ESC: () => key('Escape', 'Escape', 27),
    noOverflow: () => evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1') };
}

async function setupPage(cdp) {
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
}

/* Run `body(browser)` with guaranteed teardown and a watchdog so a failing step can never leave the browser running. */
async function withBrowser(body, { watchdogMs = 180000 } = {}) {
  const browser = await launch();
  const teardown = () => { try { browser.proc.kill(); } catch {} try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch {} };
  const watchdog = setTimeout(() => { console.error(`✗ watchdog: run exceeded ${watchdogMs / 1000}s`); teardown(); process.exit(3); }, watchdogMs);
  try { return await body(browser); } finally { clearTimeout(watchdog); setTimeout(teardown, 300); }
}

function reporter() {
  let failures = 0;
  const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) failures++; };
  return { ok, failures: () => failures };
}

module.exports = { launch, connect, driver, setupPage, withBrowser, reporter, sleep };
