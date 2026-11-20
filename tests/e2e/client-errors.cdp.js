'use strict';
/* Client error reporting end to end in demo mode: an uncaught error and an unhandled rejection in the Provider app are
   captured (masked), kept on the device, and listed in Admin › سجل التدقيق › «أخطاء عند المستخدمين»; «مسح السجل» clears it.
   Usage: python -m http.server 8099 --bind 127.0.0.1 ; node tests/e2e/client-errors.cdp.js http://127.0.0.1:8099 */
const { connect, driver, setupPage, withBrowser, reporter, sleep } = require('./lib/cdp.js');
const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, '');
const { ok, failures } = reporter();

withBrowser(async (browser) => {
  const cdp = await connect(browser.wsUrl); await setupPage(cdp);
  const { evaluate, waitFor } = driver(cdp, BASE);
  const go = async (url) => { await cdp.send('Page.navigate', { url: 'about:blank' }); await sleep(120); await cdp.send('Page.navigate', { url }); await waitFor('document.readyState==="complete"', 8000); await sleep(400); };

  await go(BASE + '/apps/provider/index.html');
  await evaluate('localStorage.removeItem("hs_client_errors"); true');
  ok(await evaluate('!!window.HSErrorReporter'), 'provider app loads the reporter');
  await evaluate('setTimeout(() => { throw new Error("QA crash for 01012345678") }, 0); Promise.reject(new Error("QA rejection")); true');
  await sleep(300);
  await evaluate('HSErrorReporter.flush(); true');
  const saved = await evaluate('HSErrorReporter.local()');
  ok(saved.length === 2, `two reports kept on the device (got ${saved.length})`);
  ok(saved.every((x) => x.app === 'provider' && !/01012345678/.test(x.msg)), 'app tagged, phone number masked');

  await go(BASE + '/apps/admin/index.html');
  await evaluate('sessionStorage.clear(); true');
  await go(BASE + '/apps/admin/index.html');
  const owner = await evaluate('HSAdminRbac.state.roster.find(e=>e.role==="owner"&&e.status==="active").id');
  await evaluate(`document.querySelector('[data-adm-login="${owner}"]').click(); true`);
  await sleep(400);
  await evaluate('location.hash = "#/audit"; true');
  ok(await waitFor('!!document.querySelector("[data-client-errors] table")', 6000), 'audit log shows the client-errors table');
  const text = await evaluate('document.querySelector("[data-client-errors]").textContent');
  ok(/QA crash/.test(text) && /QA rejection/.test(text) && /مقدم الخدمة/.test(text), 'both errors listed with their app');
  ok(await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'), 'no horizontal overflow');
  await evaluate('window.confirm = () => true; document.querySelector("[data-cerr-clear]").click(); true');
  ok(await waitFor('/مفيش أخطاء/.test(document.querySelector("[data-client-errors]").textContent)', 4000), '«مسح السجل» clears the list');
  console.log(failures() ? `✗ ${failures()} check(s) failed` : '✓ client-error reporting works end to end');
  process.exitCode = failures() ? 1 : 0;
});
