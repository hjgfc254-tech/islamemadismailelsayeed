'use strict';
/* «وصلك عرض جديد» (apps/customer/pages/offer-alerts.js) in a real browser, demo mode:
   baseline on load (no alert for existing offers) → a provider answers while the customer is on Home → banner with the
   provider and price, tab title «(1) …» → «شوف العروض» opens that request and clears the count → another offer while
   that request is on screen shows no banner (the screen refreshes itself). Phone width, no overflow, no JS errors.
   Usage: python -m http.server 8099 --bind 127.0.0.1 ; node tests/e2e/offer-alerts.cdp.js http://127.0.0.1:8099 */
const { connect, driver, setupPage, withBrowser, reporter, sleep } = require('./lib/cdp.js');
const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, '');
const CUST = BASE + '/apps/customer/index.html';
const { ok, failures } = reporter();

withBrowser(async ({ wsUrl }) => {
  const cdp = await connect(wsUrl); await setupPage(cdp);
  const { errors, evaluate, waitFor, noOverflow } = driver(cdp, BASE);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const load = async () => { await cdp.send('Page.navigate', { url: CUST }); await waitFor('document.readyState==="complete" && typeof MP!=="undefined" && !!window.HSOfferAlerts', 8000); await sleep(400); };

  await load();
  const seed = await evaluate(`(()=>{localStorage.clear();sessionStorage.clear();sessionStorage.setItem('hs_intro_v1','1');localStorage.setItem('hs_onboard_v1','1');
    localStorage.setItem('hs_user',JSON.stringify({name:'سارة QA',phone:'01011112222'}));MP.reset();MP.customerFor('سارة QA','01011112222');
    const s=MP.db().settings; s.autoAssign=false; s.bidding=true; s.bidWindowMin=15;
    const base=MP.db().providers.find(p=>p.status==='approved'&&p.cats.includes('electric')&&p.govs.includes('القاهرة'));
    if(MP.db().providers.filter(p=>p.status==='approved'&&p.available&&p.cats.includes('electric')&&p.govs.includes('القاهرة')).length<2) MP.db().providers.push({...base,id:'p_qa2',name:'هاني QA',available:true});
    let it=null,pr=null; for(const i of CAT.items('electric')){ const p=CAT.problems(i.id).find(x=>!x.id.includes('/other')); if(p){it=i;pr=p;break;} }
    const r=MP.createRequest({name:'سارة QA',phone:'01011112222',cat:'electric',itemId:it.id,serviceId:it.id,itemName:it.name,serviceName:it.name,problemId:pr.id,problemName:pr.name,desc:'النور بيقطع',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1'});
    MP.save&&MP.save(); return {rid:r.id,invited:MP.db().assignments.filter(a=>a.reqId===r.id&&a.bidding).map(a=>a.providerId)};})()`);
  ok(seed.rid && seed.invited.length >= 2, 'bidding request seeded with 2+ invited providers');
  await load();                                                   // fresh page: baseline has no offers
  const [p1, p2] = seed.invited;
  ok(!(await evaluate('!!document.querySelector(".offer-alert")')), 'no banner on load');

  await evaluate(`MP.bid(${JSON.stringify(seed.rid)},${JSON.stringify(p1)},{kind:'quote',labor:300,parts:50}); HSOfferAlerts.check(); true`);
  ok(await waitFor('document.querySelector(".offer-alert.is-on")', 3000), 'a new offer shows the banner');
  const txt = await evaluate('document.querySelector(".offer-alert").innerText.replace(/\\s+/g," ")');
  ok(/وصلك عرض جديد/.test(txt) && /ج\.م/.test(txt), 'banner names the offer and its price: ' + txt);
  ok(await evaluate('/^\\(1\\) /.test(document.title)'), 'tab title counts the unseen offer');
  ok(await noOverflow(), 'no horizontal overflow with the banner');
  const box = await evaluate('(()=>{const r=document.querySelector(".offer-alert").getBoundingClientRect();return [r.top,r.bottom,innerHeight]})()');
  ok(box[0] >= 0 && box[1] < box[2] / 2, 'banner sits at the top, clear of the bottom tab bar');

  await evaluate('document.querySelector("[data-oa-open]").click(); true'); await sleep(500);
  ok(await evaluate(`state.lastShown && state.lastShown.name==='tracking' && state.lastShown.arg===${JSON.stringify(seed.rid)}`), '«شوف العروض» opens that request');
  ok(await evaluate('!/^\\(\\d+\\) /.test(document.title)'), 'opening the request clears the title count');

  await evaluate(`MP.bid(${JSON.stringify(seed.rid)},${JSON.stringify(p2)},{kind:'quote',labor:280,parts:40}); HSOfferAlerts.check(); true`);
  await sleep(400);
  ok(!(await evaluate('!!document.querySelector(".offer-alert.is-on")')), 'no banner while that request is already on screen');
  ok(!errors.length, 'no JS errors: ' + errors.slice(0, 3).join(' | '));
  console.log(failures() ? `✗ ${failures()} check(s) failed` : '✓ offer alerts work end to end');
  process.exitCode = failures() ? 1 : 0;
});
