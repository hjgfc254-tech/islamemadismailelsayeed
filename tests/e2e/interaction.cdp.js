'use strict';
/* Interaction QA — "every visible control does something" across Customer, Guest, Provider and Admin, real browser via
   tests/e2e/lib/cdp.js (no dependencies). For each screen it inventories the visible buttons/links/tabs, de-duplicates
   them by action signature (repeated rows, tab bars, headers are tested once), clicks each one from a freshly loaded
   state and records an observable response: DOM change, URL/hash change, toast/live-region text, focus move, scroll,
   storage change, or a file-chooser request. A control with no response is reported as INERT. Disabled controls are
   counted separately and must carry a reason (visible text or aria-disabled with a label). Cross-app links are fetched.
   Workflow correctness (state, permissions, invalid input) is covered by the dedicated runners and unit tests; this
   runner proves there are no dead controls.
   Usage: python -m http.server 8099 --bind 127.0.0.1 ; node tests/e2e/interaction.cdp.js http://127.0.0.1:8099 */
const { connect, driver, setupPage, withBrowser, reporter, sleep } = require('./lib/cdp.js');

const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, '');
const C = BASE + '/apps/customer/index.html', P = BASE + '/apps/provider/index.html', A = BASE + '/apps/admin/index.html';
const { ok, failures } = reporter();

/* Visible, enabled controls with a de-duplication signature. */
const INVENTORY = String.raw`(() => {
  const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden],[inert],[aria-hidden="true"]'); };
  const attrs = el => [...el.attributes].filter(a => a.name.startsWith('data-') && !/^data-(id|row|label)$/.test(a.name)).map(a => a.name + (/(act|action|go|tab|nav|mk|pv-action|account|addr|sup|support|dot|filter|route|star)$/.test(a.name) || /-(tab|act|action)$/.test(a.name) ? '=' + a.value : '')).sort().join(' ');
  const out = [], disabled = [];
  const all = [...document.querySelectorAll('button,a[href],[role=tab],[role=button],summary')];
  all.forEach((el, i) => {
    if (!vis(el)) return;
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') { disabled.push(text); return; }
    const href = el.tagName === 'A' ? el.getAttribute('href') : '';
    const sig = el.tagName + '|' + (attrs(el) || ('text:' + text)) + '|' + (href && !href.startsWith('#') ? href : (href ? 'hash' : ''));
    const cur = el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true' || (el.hasAttribute('aria-current') && el.getAttribute('aria-current') !== 'false');
    const here = !!(href && href.startsWith('#') && (href === location.hash || (href === '#/' + 'home' && !location.hash)));
    out.push({ i, sig, text, href, cur, here, ext: !!(href && !href.startsWith('#') && !href.startsWith('javascript')) });
  });
  return { controls: out, disabled };
})()`;

const SNAP = String.raw`(() => {
  const b = document.body.innerHTML; let h = 0; for (let k = 0; k < b.length; k += 7) h = (h * 31 + b.charCodeAt(k)) | 0;
  const ae = document.activeElement; const live = [...document.querySelectorAll('[aria-live],[role=status],#toast,#provider-toast')].map(e => e.textContent).join('|');
  let st = ''; try { st = localStorage.length + ':' + (localStorage.getItem('hs_mp_db') || '').length + ':' + sessionStorage.length + ':' + JSON.stringify(Object.keys(sessionStorage)); } catch {}
  return JSON.stringify({ href: location.href, h, len: b.length, live, ae: ae ? ae.tagName + (ae.id || '') + (ae.className || '') + (ae.textContent || '').slice(0, 20) : '', y: scrollY, st });
})()`;

async function run({ exe, wsUrl }) {
  console.log('Browser:', exe);
  const cdp = await connect(wsUrl);
  const { errors, evaluate, waitFor } = driver(cdp, BASE);
  await setupPage(cdp);
  let chooser = 0;
  cdp.on(m => { if (m.method === 'Page.fileChooserOpened') chooser++; });
  await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true });
  /* System UI (print dialog, OS share sheet) never appears in headless mode: record the calls as a response instead of
     reporting those buttons as inert. The counter lives in sessionStorage, which SNAP already compares. */
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const hit = () => { try { sessionStorage.setItem('qa_system_ui_' + Date.now(), '1'); } catch (e) {} };
    window.print = hit; try { Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { hit(); } }); } catch (e) {} })();` });
  const load = async (url, code) => {
    await cdp.send('Page.navigate', { url: 'about:blank' }); await sleep(60);
    await cdp.send('Page.navigate', { url }); await waitFor('document.readyState==="complete"', 6000); await sleep(200);
    if (code) { await evaluate(`(()=>{${code};return true;})()`); await sleep(250); }
    // freeze timers (carousels, auto-refresh) so only the click can change the page
    await evaluate('(()=>{const top=setTimeout(()=>{},0);for(let i=0;i<=top;i++){clearTimeout(i);clearInterval(i);}return true;})()');
    await sleep(80);
  };
  const tested = new Set(), externals = new Set();
  let total = 0, inert = [], disabledCount = 0, currentOk = 0; const hereNoState = [];

  async function screen(app, label, url, code) {
    await load(url, code);
    const inv = await evaluate(INVENTORY);
    disabledCount += inv.disabled.length;
    for (const d of inv.disabled) ok(d.length > 0, `${label}: disabled control explains itself ("${d}")`);
    for (const c of inv.controls) {
      if (c.ext) { externals.add(c.href.startsWith('http') ? c.href : new URL(c.href, url).href); continue; }
      const key = app + '|' + c.sig;
      if (tested.has(key)) continue;
      tested.add(key); total++;
      await load(url, code);
      const inv2 = await evaluate(INVENTORY);
      const target = inv2.controls.find(x => x.sig === c.sig);
      if (!target) { tested.delete(key); total--; continue; }
      const before = await evaluate(SNAP); const ch0 = chooser;
      await evaluate(`(()=>{const el=[...document.querySelectorAll('button,a[href],[role=tab],[role=button],summary')][${target.i}];el.scrollIntoView({block:'center',behavior:'instant'});return true;})()`);
      const mid = await evaluate(SNAP);
      // click with user activation (file pickers and similar browser features require a real gesture)
      await cdp.send('Runtime.evaluate', { expression: `(()=>{const el=[...document.querySelectorAll('button,a[href],[role=tab],[role=button],summary')][${target.i}];el.click();return true;})()`, userGesture: true, returnByValue: true }).catch(() => {});
      await sleep(450);
      let after; try { after = await evaluate(SNAP); } catch { after = '{"nav":1}'; }
      const responded = chooser > ch0 || after !== mid;
      if (!responded && target.cur) currentOk++;                                   // re-selecting the current tab/page: idempotent and exposed
      else if (!responded && target.here) hereNoState.push(`${label}: "${c.text}"`); // link to the page you are on, without aria-current
      else if (!responded) inert.push(`${label}: "${c.text}" [${c.sig}]`);
      void before;
    }
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  // Seed: one customer with requests in useful states, a pending provider registration, a complaint, a transaction.
  await load(C);
  await evaluate(`(()=>{localStorage.clear();sessionStorage.clear();sessionStorage.setItem('hs_intro_v1','1');MP.reset();MP.db().settings.autoAssign=false;return true;})()`);
  const SIGNIN = `sessionStorage.setItem('hs_intro_v1','1');if(!HSCustomerSession.current())HSCustomerSession.signIn('سارة','01011112222')`;
  await load(C, SIGNIN + `;const mk=()=>MP.createRequest({name:'سارة',phone:'01011112222',cat:'electric',serviceName:'كهرباء',desc:'عطل',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1'});
    const a=mk();const b=mk();MP.assign(b.id,'p_demo1');MP.respond(b.id,true);MP.confirmTime(b.id,'provider');['enroute','arrived','started'].forEach(s=>MP.advance(b.id,s));MP.createQuote(b.id,{labor:200});
    const c=mk();MP.assign(c.id,'p_demo1');MP.respond(c.id,true);MP.confirmTime(c.id,'provider');['enroute','arrived','started'].forEach(s=>MP.advance(c.id,s));MP.complete(c.id,300);MP.close(c.id);
    const d=mk();MP.assign(d.id,'p_demo1');MP.respond(d.id,true);MP.confirmTime(d.id,'provider');['enroute','arrived','started'].forEach(s=>MP.advance(d.id,s));MP.proposeFree(d.id,'warranty');
    const e=mk();MP.assign(e.id,'p_demo1');
    MP.complain(c.id,'customer:'+MP.db().customers[0].id,'تأخر الفني عن الموعد',{kind:'delay'});
    MP.registerProvider({name:'فني جديد',phone:'01077770000',type:'individual',cats:['plumbing'],govs:['الجيزة'],areas:[],years:2,bio:'',docs:''});
    MP.addAddress(MP.db().customers[0].id,{label:'البيت',gov:'القاهرة',area:'المعادي',addr:'ش 9'});
    sessionStorage.setItem('__ids',JSON.stringify({a:a.id,b:b.id,c:c.id,d:d.id,e:e.id}))`);
  const ids = JSON.parse(await evaluate(`sessionStorage.getItem('__ids')`));
  await evaluate(`localStorage.setItem('__ids', sessionStorage.getItem('__ids')); true`);

  /* Guest (restricted Customer mode) */
  const GUEST = `sessionStorage.setItem('hs_intro_v1','1');HSCustomerSession.signOut()`;
  for (const s of ['home', 'sections', 'search', 'account']) await screen('guest', 'guest ' + s, C + '#/' + s, GUEST);

  /* Customer */
  for (const s of ['home', 'sections', 'search', 'orders', 'account']) await screen('customer', 'customer ' + s, C + '#/' + s, SIGNIN);
  for (const t of ['favorites', 'notifs', 'reviews', 'profile', 'settings']) await screen('customer', 'customer account/' + t, C + '#/account', SIGNIN + `;state.accountTab='${t}';show('account')`);
  for (const [k, v] of Object.entries(ids)) await screen('customer', 'customer tracking ' + k, C + '#/track/' + v, SIGNIN);
  await screen('customer', 'customer matches', C + '#/home', SIGNIN + `;show('matchProviders','${ids.a}')`);
  await screen('customer', 'customer provider profile', C + '#/provider/p_demo1', SIGNIN);
  await screen('customer', 'customer addresses', C + '#/home', SIGNIN + `;show('addresses')`);
  await screen('customer', 'customer support', C + '#/home', SIGNIN + `;show('support')`);
  await screen('customer', 'customer wizard', C + '#/home', SIGNIN + `;startRequest()`);

  /* Provider */
  await screen('provider', 'provider picker', P + '#/home', `sessionStorage.removeItem('hs_provider_demo_session')`);
  for (const r of ['home', 'new', 'accepted', 'progress', 'quote', 'schedule', 'done', 'cancelled', 'earnings', 'transactions', 'reviews', 'notifications', 'services', 'profile', 'request/' + ids.b]) {
    await screen('provider', 'provider ' + r, P + '#/' + r, `if(sessionStorage.getItem('hs_provider_demo_session')!=='p_demo1'){sessionStorage.setItem('hs_provider_demo_session','p_demo1');location.reload();}`);
  }

  /* Admin (desktop layout) */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const OWNER = `if(!sessionStorage.getItem('hs_admin_demo_session')){sessionStorage.setItem('hs_admin_demo_session',HSAdminRbac.state.roster.find(e=>e.role==='owner'&&e.status==='active').id);location.reload();}`;
  await screen('admin', 'admin picker', A, `sessionStorage.removeItem('hs_admin_demo_session');location.hash='';`);
  const adminRoutes = await (async () => { await load(A + '#/dashboard', OWNER); await sleep(600); return evaluate('HSAdminShell.openablePages().map(i=>i.id)'); })();   /* menu entries + section tabs */
  for (const r of adminRoutes) await screen('admin', 'admin ' + r, A + '#/' + r, OWNER);
  for (const t of ['orders', 'customers', 'complaints', 'commissions']) await screen('admin', 'admin marketplace/' + t, A + '#/marketplace', OWNER + `;setTimeout(()=>{},0);document.querySelector('[data-mk-tab="${t}"]')&&document.querySelector('[data-mk-tab="${t}"]').click()`);

  /* Cross-app links resolve */
  for (const href of externals) {
    /* third-party share targets (WhatsApp) open in the customer's own app; they are not ours to fetch from the test */
    if (/^https:\/\/wa\.me\//.test(href)) { ok(/^https:\/\/wa\.me\/\?text=/.test(href), 'WhatsApp share link is well-formed'); continue; }
    const status = await evaluate(`fetch(${JSON.stringify(href.split('#')[0])},{method:'GET'}).then(r=>r.status).catch(()=>0)`);
    ok(status === 200, `link target resolves: ${href} (HTTP ${status})`);
  }

  console.log(`\nInventory: ${total} distinct controls clicked, ${disabledCount} disabled controls seen, ${externals.size} cross-app links, ${currentOk} current-state controls (idempotent, state exposed).`);
  if (hereNoState.length) console.log('Note — links to the current page without aria-current (a11y, not inert):\n    ' + hereNoState.join('\n    '));
  ok(inert.length === 0, `no inert controls${inert.length ? ' — ' + inert.length + ':\n    ' + inert.join('\n    ') : ''}`);
  ok(errors.length === 0, `no JS errors or failed local requests${errors.length ? ' — ' + [...new Set(errors)].slice(0, 5).join(' | ') : ''}`);
  await cdp.send('Browser.close').catch(() => {});
  cdp.ws.close();
  console.log(failures() ? `\n${failures()} check(s) failed` : '\nAll checks passed');
  process.exitCode = failures() ? 1 : 0;
}

withBrowser(run, { watchdogMs: 1500000 }).catch(e => { console.error(e); process.exitCode = 2; });
