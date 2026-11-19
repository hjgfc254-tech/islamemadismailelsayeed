'use strict';
/* Real-browser walk of the offers cycle (round 9/10), local demo store only. Not part of `npm test`.
   Direct price: request → 2 providers bid through the form → customer compares and chooses → job → both confirm cash.
   Inspection: unknown problem → inspection offer → chosen → repair refused → «سجّل المعاينة بس» (visit charged alone).
   Usage (project root):
     python -m http.server 8099 --bind 127.0.0.1
     node tests/e2e/offers-cycle.cdp.js http://127.0.0.1:8099 [shotsDir outside the repo] */
const fs = require('node:fs'), path = require('node:path');
const { connect, driver, setupPage, withBrowser, reporter, sleep } = require('./lib/cdp.js');
const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, ''), SHOTS = process.argv[3];
const CUST = BASE + '/apps/customer/index.html', PROV = BASE + '/apps/provider/index.html';
const { ok, failures } = reporter();

async function run({ exe, wsUrl }) {
  console.log('Browser:', exe);
  const cdp = await connect(wsUrl);
  const { errors, evaluate, waitFor, noOverflow } = driver(cdp, BASE);
  await setupPage(cdp);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const shot = async name => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const s = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(s.data, 'base64')); };
  const view = async () => (await evaluate('(document.querySelector("#view")||document.querySelector("#provider-view")||document.body).innerText')).replace(/\s+/g, ' ').slice(0, 200);
  const go = async (url, ready) => { await cdp.send('Page.navigate', { url }); return waitFor(ready || 'document.readyState==="complete" && typeof MP!=="undefined"', 8000); };

  /* ── seed: customer + bidding on + a second provider in the same area ── */
  await go(CUST);
  const seed = await evaluate(`(()=>{localStorage.clear();sessionStorage.clear();sessionStorage.setItem('hs_intro_v1','1');
    localStorage.setItem('hs_user',JSON.stringify({name:'سارة QA',phone:'01011112222'}));MP.reset();MP.customerFor('سارة QA','01011112222');
    const s=MP.db().settings; s.autoAssign=false; s.bidding=true; s.bidWindowMin=15; s.cancelFee=50;
    const base=MP.db().providers.find(p=>p.status==='approved'&&p.cats.includes('electric')&&p.govs.includes('القاهرة'));
    if(!base) return {err:'no cairo electric provider'};
    if(MP.db().providers.filter(p=>p.status==='approved'&&p.available&&p.cats.includes('electric')&&p.govs.includes('القاهرة')).length<2)
      MP.db().providers.push({...base,id:'p_qa2',name:'هاني QA',available:true});
    let it=null,pr=null; for(const i of CAT.items('electric')){ const p=CAT.problems(i.id).find(x=>!x.id.includes('/other')); if(p){it=i;pr=p;break;} }
    const r=MP.createRequest({name:'سارة QA',phone:'01011112222',cat:'electric',itemId:it.id,serviceId:it.id,itemName:it.name,serviceName:it.name,problemId:pr.id,problemName:pr.name,desc:'النور بيقطع',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1'});
    return {rid:r.id,mode:r.bidding&&r.bidding.mode,invited:MP.db().assignments.filter(a=>a.reqId===r.id&&a.bidding).map(a=>a.providerId)};})()`);
  ok(!seed.err && seed.rid, 'seed request created ' + JSON.stringify(seed));
  ok(seed.mode === 'quote', 'direct-price request opens an offers round (mode quote)');
  ok(seed.invited && seed.invited.length >= 2, 'two or more providers invited: ' + (seed.invited || []).join(','));
  const rid = seed.rid, [p1, p2] = seed.invited;

  /* ── each provider sends an offer through the real form ── */
  const bid = async (pid, labor, parts, note, tag) => {
    await go(PROV); await evaluate(`sessionStorage.setItem('hs_provider_demo_session',${JSON.stringify(pid)});true`);
    await cdp.send('Page.reload', { ignoreCache: true }); await waitFor('document.readyState==="complete" && typeof MP!=="undefined"', 8000); await sleep(300);
    await evaluate(`location.hash='#/request/${rid}'`); await sleep(300);
    const has = await waitFor(`!!document.querySelector('[data-pv-action="bid"][data-id="${rid}"]')`, 4000);
    ok(has, `${tag}: «ابعت عرضك» button shown` + (has ? '' : ' — ' + await view()));
    if (!has) return;
    await evaluate(`document.querySelector('[data-pv-action="bid"][data-id="${rid}"]').click();true`);
    ok(await waitFor('!!document.querySelector("#pv-bid-form")'), `${tag}: bid form opens`);
    ok(await evaluate(`document.querySelector('#pv-bid-form [name=fee]').closest('[data-bid]').hidden===true`), `${tag}: inspection fee hidden for a quote`);
    await evaluate(`(()=>{const f=document.querySelector('#pv-bid-form');f.labor.value='${labor}';f.parts.value='${parts}';f.note.value=${JSON.stringify(note)};f.eta.value='النهارده بعد العصر';f.labor.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    ok(await waitFor(`(x => /هتاخد/.test(x) && /هيشوف/.test(x) && !/اكتب السعر/.test(x))(document.querySelector('[data-bid-total]').textContent)`, 2000), `${tag}: live «العميل هيشوف» preview — ${await evaluate("document.querySelector('[data-bid-total]').textContent")}`);
    ok(await noOverflow(), `${tag}: bid form fits 390px`);
    if (tag === 'provider 1') await shot('1-provider-bid-form');
    await evaluate(`document.querySelector('#pv-bid-form .pv-btn-primary').click();true`);
    ok(await waitFor(`!!(MP.db().assignments.find(a=>a.reqId===${JSON.stringify(rid)}&&a.providerId===${JSON.stringify(pid)})||{}).bid`, 4000), `${tag}: offer stored`);
    await sleep(300);
    ok(await waitFor(`/عدّل عرضك|مستني العميل/.test(document.body.innerText)`, 3000), `${tag}: card shows «مستني العميل»`);
    if (tag === 'provider 1') await shot('2-provider-after-bid');
  };
  await bid(p1, 300, 120, 'هغيّر المفتاح والسلك', 'provider 1');
  await bid(p2, 380, 100, '', 'provider 2');

  /* ── customer compares and chooses ── */
  await go(CUST); await sleep(400);
  await evaluate(`show('tracking',${JSON.stringify(rid)});true`);
  ok(await waitFor('document.querySelectorAll(".of-card").length===2', 5000), 'customer sees 2 offer cards' + ' — ' + await view());
  const cards = await evaluate(`[...document.querySelectorAll('.of-card')].map(c=>c.innerText.replace(/\\s+/g,' '))`);
  console.log('   offers:', cards);
  ok(await evaluate(`!!document.querySelector('[data-of-choose].of-best')`), '«اختارلي الأنسب» shown');
  ok(await noOverflow(), 'offers fit 390px');
  await shot('3-customer-offers');
  ok(await evaluate(`!!document.querySelector('.of-tag') && !!document.querySelector('.of-why') && !!document.querySelector('.of-ring')`), 'comparison tags, «why the best» and the countdown ring shown');
  /* a mis-tap can be undone within 5 seconds */
  await evaluate(`document.querySelector('.of-card [data-of-choose="${p2}"]').click();true`);
  ok(await waitFor(`!document.querySelector('[data-of-undo-bar]').hidden`, 2000), 'undo bar appears after choosing');
  await sleep(900);
  ok(await evaluate(`(() => { const r = document.querySelector('.offers').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })()`), 'the offers stay in view while the undo bar is shown');
  await shot('3b-customer-undo');
  await evaluate(`document.querySelector('[data-of-undo]').click();true`);
  await sleep(5600);
  ok(await evaluate(`MP.get('serviceRequests',${JSON.stringify(rid)}).status!=='accepted' && document.querySelectorAll('.of-card').length===2`), 'undo keeps every offer open');
  await evaluate(`document.querySelector('.of-card [data-of-choose="${p1}"]').click();true`);
  ok(await waitFor(`MP.get('serviceRequests',${JSON.stringify(rid)}).status==='accepted'`, 9000), 'customer choice accepts the request (after the undo window)');
  const after = await evaluate(`(()=>{const r=MP.get('serviceRequests',${JSON.stringify(rid)});return {price:r.pricing&&r.pricing.customerPrice,other:MP.db().assignments.find(a=>a.reqId===r.id&&a.providerId===${JSON.stringify(p2)}).status};})()`);
  ok(after.other === 'withdrawn', 'the other offer is closed');
  ok(!(await evaluate('!!document.querySelector(".of-card")')), 'offer cards disappear after choosing');
  await sleep(300); ok(await evaluate('!!document.querySelector("#view .price-seal")'), '«السعر ثابت» seal after choosing'); await shot('4-customer-after-choice');

  /* ── the job runs (provider API), then both confirm cash in the UI ── */
  await go(PROV); await evaluate(`sessionStorage.setItem('hs_provider_demo_session',${JSON.stringify(p1)});true`);
  await cdp.send('Page.reload', { ignoreCache: true }); await waitFor('document.readyState==="complete" && typeof MP!=="undefined"', 8000); await sleep(300);
  const flow = await evaluate(`(async()=>{const id=${JSON.stringify(rid)};const out=[];out.push((await HSOrdersApi.schedule(id)).ok);
    for(const to of ['enroute','arrived','started']) out.push((await HSOrdersApi.advance(id,to)).ok); out.push((await HSOrdersApi.complete(id)).ok); return out;})()`);
  ok(flow.every(Boolean), 'schedule → enroute → arrived → started → complete: ' + flow.join(','));
  const tx = await evaluate(`MP.db().transactions.find(t=>t.reqId===${JSON.stringify(rid)})`);
  ok(tx && tx.net === 420 && tx.value === after.price, `transaction: customer pays ${tx && tx.value} = chosen offer, provider net ${tx && tx.net} = 300 + 120`);
  await evaluate(`location.hash='#/done'`); await sleep(200); await evaluate(`location.hash='#/request/${rid}'`); await sleep(400);
  ok(await waitFor(`!!document.querySelector('[data-pv-action="cash-yes"][data-id="${rid}"]')`, 4000), 'provider sees «استلمت الحساب»' + ' — ' + await view());
  await evaluate(`document.querySelector('[data-pv-action="cash-yes"][data-id="${rid}"]').click();true`);
  ok(await waitFor(`(MP.get('serviceRequests',${JSON.stringify(rid)}).cash||{}).provider===true`, 4000), 'provider cash confirmation stored');
  await go(CUST); await sleep(400);
  await evaluate(`show('tracking',${JSON.stringify(rid)});true`);
  ok(await waitFor('!!document.querySelector(".of-cash")', 4000), 'customer sees «دفعت ... للفني؟»');
  await shot('5-customer-cash');
  await evaluate(`document.querySelector('[data-of-cash="1"]').click();true`);
  ok(await waitFor(`MP.db().transactions.find(t=>t.reqId===${JSON.stringify(rid)}).collection==='collected'`, 4000), 'both confirmed → transaction collected');
  ok(await evaluate(`!MP.db().complaints.some(k=>k.reqId===${JSON.stringify(rid)})`), 'no dispute complaint');
  const w = await evaluate(`MP.get('serviceRequests',${JSON.stringify(rid)}).warrantyUntil`);
  ok(!!w, 'warranty set: ' + w);
  await evaluate(`show('tracking',${JSON.stringify(rid)});true`); await sleep(300);
  ok(await evaluate('!!document.querySelector(".w-cert")'), 'warranty certificate offered');
  await evaluate(`(()=>{const d=document.querySelector('.w-cert');d.open=true;d.scrollIntoView();return true;})()`); await sleep(200); await shot('5b-warranty-cert');
  await sleep(300); await shot('6-customer-done');

  /* ── inspection path: unknown problem → inspection offer via the form (radio) → chosen → repair refused → «المعاينة بس» button ── */
  const ins = await evaluate(`(()=>{const r=MP.createRequest({name:'سارة QA',phone:'01011112222',cat:'electric',unknownProblem:true,serviceName:'مشكلة مش عارفها',desc:'ريحة شياط',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1'});
    return {rid:r.id,mode:r.bidding&&r.bidding.mode,inv:MP.db().assignments.filter(a=>a.reqId===r.id&&a.bidding).map(a=>a.providerId)};})()`);
  ok(ins.mode === 'inspection', 'unknown problem → inspection round');
  const iid = ins.rid, ip = ins.inv[0];
  await go(PROV); await evaluate(`sessionStorage.setItem('hs_provider_demo_session',${JSON.stringify(ip)});true`);
  await cdp.send('Page.reload', { ignoreCache: true }); await waitFor('document.readyState==="complete" && typeof MP!=="undefined"', 8000); await sleep(300);
  await evaluate(`location.hash='#/request/${iid}'`); await sleep(300);
  ok(await waitFor(`/ابعت سعر المعاينة/.test((document.querySelector('[data-pv-action="bid"][data-id="${iid}"]')||{}).textContent||'')`, 4000), 'provider sees «ابعت سعر المعاينة»');
  await evaluate(`document.querySelector('[data-pv-action="bid"][data-id="${iid}"]').click();true`);
  ok(await waitFor(`!!document.querySelector('#pv-bid-form input[value=inspection]:checked') && document.querySelector('#pv-bid-form [name=labor]').closest('[data-bid]').hidden`, 3000), 'form opens on «محتاج معاينة» with labor hidden');
  await evaluate(`(()=>{const f=document.querySelector('#pv-bid-form');f.fee.value='150';return true;})()`);
  await shot('7-provider-inspection-form');
  await evaluate(`document.querySelector('#pv-bid-form .pv-btn-primary').click();true`);
  ok(await waitFor(`((MP.db().assignments.find(a=>a.reqId===${JSON.stringify(iid)}&&a.providerId===${JSON.stringify(ip)})||{}).bid||{}).fee===150`, 4000), 'inspection offer stored');
  await go(CUST); await sleep(400); await evaluate(`show('tracking',${JSON.stringify(iid)});true`);
  ok(await waitFor('document.querySelectorAll(".of-card").length>=1 && /سعر المعاينة/.test(document.querySelector(".of-card").innerText)', 4000), 'customer sees the inspection offer');
  await shot('8-customer-inspection-offer');
  await evaluate(`document.querySelector('.of-card [data-of-choose]').click();true`);
  ok(await waitFor(`MP.get('serviceRequests',${JSON.stringify(iid)}).status==='accepted'`, 9000), 'inspection offer chosen (after the undo window)');
  await sleep(300);
  ok(await evaluate(`/بتتخصم/.test(document.querySelector('#view').innerText)`), 'customer told the visit is deducted if they continue');
  await go(PROV); await evaluate(`sessionStorage.setItem('hs_provider_demo_session',${JSON.stringify(ip)});true`);
  await cdp.send('Page.reload', { ignoreCache: true }); await waitFor('document.readyState==="complete" && typeof MP!=="undefined"', 8000); await sleep(300);
  const f2 = await evaluate(`(async()=>{const id=${JSON.stringify(iid)};const o=[(await HSOrdersApi.schedule(id)).ok];for(const to of ['enroute','arrived','started']) o.push((await HSOrdersApi.advance(id,to)).ok);
    o.push((await HSQuotesApi.submit(id,{labor:700,parts:0})).ok); return o;})()`);
  ok(f2.every(Boolean), 'visit done and repair quote sent: ' + f2.join(','));
  await go(CUST); await sleep(300);
  ok((await evaluate(`(async()=>(await HSQuotesApi.reject(${JSON.stringify(iid)},'غالي')).ok)()`)), 'customer refuses the repair');
  await go(PROV); await evaluate(`sessionStorage.setItem('hs_provider_demo_session',${JSON.stringify(ip)});true`);
  await cdp.send('Page.reload', { ignoreCache: true }); await waitFor('document.readyState==="complete" && typeof MP!=="undefined"', 8000); await sleep(300);
  await evaluate(`location.hash='#/request/${iid}'`); await sleep(400);
  ok(await waitFor(`!!document.querySelector('[data-pv-action="inspection-only"][data-id="${iid}"]')`, 4000), 'provider sees «سجّل المعاينة بس»' + ' — ' + await view());
  await shot('9-provider-inspection-only');
  await evaluate(`document.querySelector('[data-pv-action="inspection-only"][data-id="${iid}"]').click();true`);
  ok(await waitFor(`MP.get('serviceRequests',${JSON.stringify(iid)}).status==='completed'`, 4000), 'inspection-only completes the request');
  const tx2 = await evaluate(`MP.db().transactions.find(t=>t.reqId===${JSON.stringify(iid)})`);
  ok(tx2 && tx2.net === 150 && tx2.value === 150, `visit charged alone: ${tx2 && tx2.value} (no commission by default)`);
  ok(!(await evaluate(`MP.get('serviceRequests',${JSON.stringify(iid)}).warrantyUntil`)), 'no warranty on a visit only');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
}
withBrowser(run).then(() => { console.log(failures() ? `\n${failures()} FAILED` : '\nALL PASSED'); process.exit(failures() ? 1 : 0); }).catch(e => { console.error(e); process.exit(2); });
