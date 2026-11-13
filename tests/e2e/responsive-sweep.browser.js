'use strict';
/* PHASE 5 TASK 03 — manual Playwright/Chromium regression for the responsive sweep defects.
   Usage: python3 -m http.server 8099 (project root) ; node tests/e2e/responsive-sweep.browser.js http://127.0.0.1:8099
   Playwright is NOT a project dependency (see tests/e2e/README.md). Google Fonts are blocked on purpose. */
const {chromium}=require('playwright');
const BASE=process.argv[2]||'http://127.0.0.1:8099';
const VPS=[[1280,800],[768,1024],[390,844],[320,640]];
let fail=0;const ok=(c,m)=>{console.log((c?'✓ ':'✗ ')+m);if(!c)fail++;};
(async()=>{const b=await chromium.launch();
for(const [w,h] of VPS){
  const ctx=await b.newContext({viewport:{width:w,height:h},locale:'ar-EG'});
  await ctx.addInitScript(()=>sessionStorage.setItem('hs_intro_v1','1'));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE+'/apps/customer/index.html');await p.waitForSelector('#view .screen');
  ok(await p.evaluate(()=>{const a=document.getElementById('app');return a.scrollWidth<=a.clientWidth+0||getComputedStyle(a).overflowX==='clip';}),w+' #app is clipped, not scrollable');
  await p.click('[data-act=menu]');await p.waitForTimeout(350);await p.evaluate(()=>closeSheet(true));await p.waitForTimeout(500);
  let inSheet=0;for(let i=0;i<70;i++){await p.keyboard.press('Tab');if(await p.evaluate(()=>!!document.activeElement.closest('#sheet')))inSheet++;}
  ok(inSheet===0,w+' Tab never enters the closed sheet');
  ok(await p.evaluate(()=>{const a=document.getElementById('app');return !a.scrollTop&&!a.scrollLeft;}),w+' app not displaced after Tab');
  // provider flexible request: no "Invalid Date"
  await p.evaluate(()=>{const s=(MP.db().services||[])[0]||{};const r=MP.createRequest({name:'س',phone:'01012345678',cat:'electric',serviceId:s.id,serviceName:'خدمة تجريبية طويلة الاسم لاختبار الالتفاف داخل البطاقة',desc:'وصف',gov:'القاهرة',area:'م',addr:'ش',flexible:true});MP.assign(r.id,'p_demo1');store.set('provId','p_demo1');enterRole('provider');});
  await p.waitForSelector('.pw-nav');await p.click('.pw-nav [data-id=new]');await p.waitForTimeout(300);
  const txt=await p.evaluate(()=>document.getElementById('view').innerText);
  ok(!/Invalid Date/.test(txt),w+' provider card has no "Invalid Date"');
  ok(await p.evaluate(()=>{const b=document.querySelector('.card2 .top b');return b.getBoundingClientRect().width>=120;}),w+' provider card title not squeezed');
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),w+' provider no horizontal overflow');
  // admin tables: badges stay single-word-wide
  await p.goto(BASE+'/apps/admin/index.html#/audit');await p.reload();await p.waitForSelector('.hs-grid-table .hs-badge-t');
  ok(await p.evaluate(()=>[...document.querySelectorAll('.hs-badge-t')].every(e=>{const r=e.getBoundingClientRect();return r.height<r.width*1.8||r.width>40;})),w+' admin badges not squeezed');
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),w+' admin no horizontal overflow');
  ok(errs.length===0,w+' no JS errors '+errs.join('|'));
  await ctx.close();}
await b.close();process.exit(fail?1:0);})();
