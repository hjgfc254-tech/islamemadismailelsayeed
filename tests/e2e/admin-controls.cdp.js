'use strict';
/* Owner emergency switches end to end (demo mode): the owner turns maintenance on from «الطوارئ والصيانة» (typing
   «صيانة»), the Customer app shows the maintenance screen and refuses a new request, the owner turns it off and the
   app is back. A support employee does not see «إدارة المنصة» owner pages. Also opens «مهام اليوم» and every
   «الإحصائيات» tab. Optional screenshots: SHOTS=<dir>.
   Usage: python -m http.server 8099 --bind 127.0.0.1 ; node tests/e2e/admin-controls.cdp.js http://127.0.0.1:8099 */
const fs = require('node:fs'), path = require('node:path');
const { connect, driver, setupPage, withBrowser, reporter, sleep } = require('./lib/cdp.js');
const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, '');
const SHOTS = process.env.SHOTS || '';
const { ok, failures } = reporter();

withBrowser(async ({ wsUrl }) => {
  const cdp = await connect(wsUrl); await setupPage(cdp);
  const { errors, evaluate, waitFor, noOverflow } = driver(cdp, BASE);
  const shot = async (n) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const s = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(s.data, 'base64')); };
  const go = async (url) => { await cdp.send('Page.navigate', { url: 'about:blank' }); await sleep(100); await cdp.send('Page.navigate', { url }); await waitFor('document.readyState==="complete"', 8000); await sleep(500); };
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  const login = async (role) => {
    await go(BASE + '/apps/admin/index.html'); await evaluate('sessionStorage.clear(); true'); await go(BASE + '/apps/admin/index.html');
    const id = await evaluate(`HSAdminRbac.state.roster.find(e=>e.role==='${role}'&&e.status==='active').id`);
    await evaluate(`document.querySelector('[data-adm-login="${id}"]').click(); true`); await sleep(500);
  };
  await go(BASE + '/apps/customer/index.html');
  await evaluate("localStorage.clear(); sessionStorage.setItem('hs_intro_v1','1'); localStorage.setItem('hs_onboard_v1','1'); MP.reset(); true");

  await login('support');
  const navSupport = await evaluate('[...document.querySelectorAll("#adm-nav a[data-nav]")].map(a=>a.getAttribute("data-nav"))');
  ok(!navSupport.includes('controls') && !navSupport.includes('security') && !navSupport.includes('audit') && !navSupport.includes('settings'), 'support does not see the owner pages: ' + navSupport.join(','));

  await login('owner');
  ok(await waitFor('/مهام اليوم/.test(document.querySelector("#adm-title")?.textContent||"")', 4000), 'home is «مهام اليوم»');
  ok(await evaluate('!document.querySelector("#adm-content .dash-kpis")'), '«مهام اليوم» has no KPI cards (they live in «الإحصائيات»)');
  await shot('today');
  await evaluate('location.hash="#/insights"; true');
  ok(await waitFor('document.querySelectorAll("[data-ins-tab]").length === 5', 4000), 'owner sees 5 statistics tabs');
  for (const t of ['overview', 'areas', 'finance', 'reports', 'owner']) {
    await evaluate(`document.querySelector('[data-ins-tab="${t}"]').click(); true`); await sleep(500);
    ok(await evaluate('document.querySelector("#ins-panel").textContent.trim().length > 20'), `«الإحصائيات» › ${t} renders`);
    if (t === 'areas' || t === 'overview') await shot('insights-' + t);
  }
  ok(await noOverflow(), 'no horizontal overflow on «الإحصائيات»');
  await evaluate('location.hash="#/orders"; true'); await sleep(500);
  ok(await evaluate('[...document.querySelectorAll("#adm-content .ord-sum")].every(n => getComputedStyle(n).display === "none")'), 'the orders page shows no statistic strip');

  await evaluate('location.hash="#/controls"; true');
  ok(await waitFor('!!document.querySelector("[data-ctl=maintenance]")', 4000), 'emergency page shows the maintenance switch');
  await shot('controls-off');
  await evaluate('window.confirm = () => true; setTimeout(() => { const b = document.querySelector("[data-hsd=ok]"); if (b) b.click(); }, 250); document.querySelector("[data-ctl=maintenance]").click(); true'); await sleep(300);
  ok(await evaluate('/اكتب «صيانة»/.test(document.querySelector("[data-ctl-status]").textContent)'), 'maintenance asks for the confirmation word first');
  await evaluate('document.querySelector("[data-ctl-msg=maintenance]").value = "صيانة سريعة — راجعين الساعة ٣"; document.querySelector("[data-ctl-confirm=maintenance]").value = "صيانة"; document.querySelector("[data-ctl=maintenance]").click(); true');
  ok(await waitFor('document.querySelector(".ctl-card.is-on")', 3000), 'maintenance is on');
  await shot('controls-on');

  await go(BASE + '/apps/customer/index.html');
  ok(await waitFor('!!document.querySelector("#hs-maint")', 4000), 'Customer app shows the maintenance screen');
  ok(await evaluate('/راجعين الساعة ٣/.test(document.querySelector("#hs-maint").textContent) && document.getElementById("app").hasAttribute("inert")'), 'with the owner message, and the app underneath is inert');
  await shot('customer-maintenance');
  const res = await evaluate(`HSApiClient.request('POST','/requests',{body:{cat:'electric',serviceName:'x',desc:'وصف طويل كفاية',gov:'القاهرة',area:'مدينة نصر',addr:'ش'},actor:{role:'customer',id:'c1'}}).then(r=>({ok:r.ok,status:r.status}))`);
  ok(!res.ok && res.status === 503, 'a new request is refused during maintenance');

  await login('owner'); await evaluate('location.hash="#/controls"; true'); await waitFor('!!document.querySelector("[data-ctl=maintenance]")', 4000);
  await evaluate('window.confirm = () => true; setTimeout(() => { const b = document.querySelector("[data-hsd=ok]"); if (b) b.click(); }, 250); document.querySelector("[data-ctl=maintenance]").click(); true');
  ok(await waitFor('!document.querySelector(".ctl-card.is-on")', 3000), 'maintenance turned off');
  await go(BASE + '/apps/customer/index.html');
  ok(!(await evaluate('!!document.querySelector("#hs-maint")')), 'Customer app is back');
  ok(!errors.length, 'no JS errors: ' + errors.slice(0, 3).join(' | '));
  console.log(failures() ? `✗ ${failures()} check(s) failed` : '✓ admin structure and emergency switches work end to end');
  process.exitCode = failures() ? 1 : 0;
});
