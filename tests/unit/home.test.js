/* اختبارات الرئيسية والتنقل (V8-C3) بمحاكاة Node: node tests/home.test.js
   يحمّل السكربتات بنفس ترتيب index.html ثم يطلق DOMContentLoaded (لاختبار تأجيل البدء). */
const fs=require('fs'),vm=require('vm'),path=require('path');
const dir=path.join(__dirname,'../..');
let pass=0,fail=0; const ok=(c,m)=>{ if(c)pass++; else {fail++; console.log('FAIL:',m);} };
const mem={}, listeners={}, toasts=[];
const mkEl=()=>{ const e={innerHTML:'',value:'',hidden:false,dataset:{},style:{},scrollTop:0,inert:false,children:[],
  classList:{add(){},remove(){},toggle(){},contains:()=>false},
  addEventListener(){},removeEventListener(){},setAttribute(){},appendChild(){},remove(){},focus(){},click(){},scrollIntoView(){},
  querySelector:()=>null,querySelectorAll:()=>[],closest:()=>null,getBoundingClientRect:()=>({width:300,height:300})}; return e; };
const els={};
const getEl=id=>els[id]||(els[id]=mkEl());
const doc={readyState:'loading',hidden:false,body:mkEl(),documentElement:Object.assign(mkEl(),{classList:{add(){},remove(){},contains:()=>true}}),
  querySelector:s=>getEl(s),getElementById:i=>getEl('#'+i),createElement:mkEl,createDocumentFragment:mkEl,querySelectorAll:()=>[],
  addEventListener:(t,f,c)=>(listeners[t]=listeners[t]||[]).push({f,c}),removeEventListener(){}};
const ctx={console,setTimeout:(f)=>0,clearTimeout(){},setInterval(){return 0},clearInterval(){},
  localStorage:{getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>mem[k]=String(v),removeItem:k=>delete mem[k]},
  sessionStorage:{getItem:()=>'1',setItem(){}},document:doc,
  window:{addEventListener(){}},history:{pushState(){},replaceState(){},back(){}},navigator:{},location:{protocol:'file:'},
  matchMedia:()=>({matches:false}),innerWidth:390,innerHeight:800,Image:function(){},URL:{},File:function(){},Blob:function(){},
  requestAnimationFrame:f=>0,indexedDB:undefined,Event:function(){}};
ctx.globalThis=ctx; vm.createContext(ctx);
const load=f=>vm.runInContext(fs.readFileSync(path.join(dir,f),'utf8').replace(/^'use strict';/m,''),ctx,{filename:f});
const run=c=>vm.runInContext(c,ctx);
['shared/icons/icon-registry.js','shared/config/legacy-data.js','services/local-catalog.js','services/local-market-store.js','apps/customer/pages/home.page.js','apps/customer/app.js','shared/components/ui-kit.js','apps/customer/pages/order-details.page.js','apps/customer/pages/market-ui.page.js','apps/customer/pages/request-wizard.page.js','apps/customer/pages/search.page.js','apps/customer/pages/addresses.page.js','apps/customer/pages/account.page.js'].forEach(load);
const view=()=>els['#view'].innerHTML;

/* 1) البدء المؤجل: لا عرض قبل DOMContentLoaded، ثم عرض الرئيسية */
ok(view()==='','no render before DOMContentLoaded');
(listeners.DOMContentLoaded||[]).forEach(l=>l.f());
ok(view().includes('class="hero"'),'home rendered after DOMContentLoaded');

/* 2) زائر غير مسجل */
ok(view().includes('في هنصلحلك')&&view().includes('data-go="account"'),'guest greeting + login link');
ok(!view().includes('act-card'),'no active cards for guest');
ok((view().match(/data-wz-hit="cat\|/g)||[]).length===7,'7 tiles route to CAT categories');
ok(!/class="tile[^>]*data-dev=/.test(view()),'no tile uses legacy data-dev');
ok(!view().includes('عناويني</h2>'),'no addresses section for guest');

/* 3) مشكلات شائعة: كلها موجودة في CAT */
const cp=view().match(/data-wz-hit="problem\|[^"]+"/g)||[];
ok(cp.length===6,'6 common problems rendered');
ok(cp.every(x=>run(`!!CAT.problem('${x.slice(x.indexOf('|')+1,-1)}')`)),'every common problem exists in CAT');
ok(run('COMMON_PROBLEMS').every(id=>run(`CAT.problem('${id}').active`)),'common problems active');

/* 4) عميل مسجل: ترحيب باسمه + حالة فراغ للعناوين + بلا طلبات نشطة */
run("store.set('user',{name:'أحمد علي',phone:'01000000000'}); MP.customerFor('أحمد علي','01000000000'); show('home')");
ok(view().includes('يا أحمد')&&!view().includes('يا أحمد علي'),'greets by first name');
ok(view().includes('تحب نصلّحلك'),'no-active subtitle');
ok(!view().includes('طلباتك النشطة'),'no active section without requests');
ok(view().includes('مفيش عناوين محفوظة'),'addresses empty state');
ok(!els['#tabbar'].innerHTML.includes('tab-badge'),'no tab badge without active');

/* 5) طلب نشط: بطاقة + شارة + سطر «الخطوة التالية» */
run(`globalThis.__r = MP.createRequest({name:'أحمد علي',phone:'01000000000',cat:'appliances',serviceId:'x',serviceName:'غسالة — لا تصرف',desc:'d',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1'}); show('home')`);
ok(view().includes('طلباتك النشطة')&&view().includes('act-card')&&view().includes(`data-track="${run('__r.id')}"`),'active request card rendered');
ok(view().includes('عندك طلب واحد'),'greeting counts active');
ok(els['#tabbar'].innerHTML.includes('tab-badge'),'tab badge for active orders');
ok(/data-go="orders"[^>]*aria-label="طلباتي — 1 نشطة"/.test(els['#tabbar'].innerHTML),'orders tab aria-label includes count');
ok(view().includes('class="n">1'),'quick action count');
/* إجراء مطلوب من العميل */
run("__r.status='quote'; show('home')");
ok(/act-card glass neon need/.test(view())&&view().includes('مطلوب موافقتك على السعر'),'needs-action highlighted for quote');
run("__r.status='accepted'; __r.proposal={at:'2026-11-10T10:00:00Z'}; show('home')");
ok(/act-card glass neon need/.test(view())&&view().includes('اقترح موعدًا'),'needs-action for proposed time');
run("__r.proposal=null; __r.status='sent'; show('home')");
ok(!/act-card glass neon need/.test(view())&&view().includes('بانتظار رد مقدم الخدمة'),'normal next-step for sent');
/* النهائي لا يظهر */
['closed','cancelled','failed'].forEach(st=>{ run(`__r.status='${st}'; show('home')`); ok(!view().includes('act-card'),'final status hidden: '+st); });
/* أكثر من 3 */
run(`__r.status='sent'; for(let i=0;i<3;i++) MP.createRequest({name:'أحمد علي',phone:'01000000000',cat:'plumbing',serviceId:'x',serviceName:'s'+i,desc:'d',gov:'g',area:'a',addr:'x'}); show('home')`);
ok((view().match(/class="act-card/g)||[]).length===3&&view().includes('عرض الكل (4)'),'max 3 cards + view-all');

/* 6) العناوين المحفوظة */
run("MP.addAddress(MP.db().customers.find(c=>c.phone==='01000000000').id,{label:'البيت',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1',default:true}); MP.addAddress(MP.db().customers.find(c=>c.phone==='01000000000').id,{label:'الشغل',gov:'الجيزة',area:'الدقي',addr:'ش 2'}); MP.addAddress(MP.db().customers.find(c=>c.phone==='01000000000').id,{label:'ثالث',gov:'x',area:'y',addr:'z'}); show('home')");
ok(view().includes('البيت')&&view().includes('افتراضي')&&view().includes('إدارة (3)'),'addresses shown with default tag and manage link');
ok(view().indexOf('البيت')<view().indexOf('الشغل'),'default address first');
ok(!view().includes('ثالث'),'max 2 addresses on home');

/* 7) اقتراحات فورية */
const sg=run("homeSuggestHtml('غسالة')");
ok(sg.includes('data-wz-hit="')&&!sg.includes('data-hs-hit')&&sg.includes('homeSearchAll'),'suggestions use wizard route + see-all');
ok(/data-wz-hit="problem\|/.test(run("homeSuggestHtml('لا تصرف المياه')")),'problem suggestion for "لا تصرف المياه"');
const none=run("homeSuggestHtml('zzzqqq')");
ok(none.includes('sr-none')&&none.includes('data-act="newReq"'),'no-result state offers generic request');
ok(run("homeSuggestHtml('<img onerror=x>')").includes('&lt;img'),'query escaped in no-result');

/* 8) النقرات: البلاطة/المشكلة/طلب جديد تفتح الويزارد بالحالة الصحيحة */
const click=attrs=>{ const dataset={...attrs};
  const has=sel=>String(sel).split(',').some(x=>{ x=x.trim(); const m=/\[data-([a-z-]+)(\^?)=?"?([^\]"]*)"?\]/.exec(x); if(!m) return false;
    const k=m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase()); if(!(k in dataset)) return false; return m[2]==='^' ? String(dataset[k]).startsWith(m[3]) : true; });
  const t={dataset,closest:sel=>has(sel)?t:null}; const ev={target:t,_stop:false,stopImmediatePropagation(){this._stop=true;},stopPropagation(){this._stop=true;},preventDefault(){}}; (listeners.click||[]).slice().sort((a,b)=>Number(!!b.c)-Number(!!a.c)).forEach(l=>{if(!ev._stop)l.f(ev);}); };
run('WZ=null'); click({wzHit:'cat|electric'});
ok(run('WZ&&WZ.cat')==='electric'&&run('WZ.step')===1,'tile click opens wizard at item step');
run('WZ=null'); click({wzHit:'problem|appliances/ac/no-cooling'});
ok(run('WZ.cat')==='appliances'&&run('WZ.item')==='appliances/ac'&&run('WZ.problem')==='appliances/ac/no-cooling'&&run('WZ.step')===3,'common problem preselects problem');
run('WZ=null'); click({act:'newReq'});
ok(run('WZ')&&run('WZ.step')===0,'newReq opens wizard from start');

/* 9) سلامة قديمة: details/المفضلة ما زالت تعمل */
ok(run("typeof screens.details('electric')")==='string','legacy details screen still renders');
ok(run("screens.sections().includes('data-wz-hit')"),'sections tab tiles route to CAT');

/* 10) (removed 2026-11-14) the legacy Provider workspace no longer loads in the Customer app — see tests/unit/legacy-migration.test.js */
/* 11) C5 — مسودة الطلب تظهر على الرئيسية بعد العودة */
run("WZ=null; const __c=MP.db().customers.find(c=>c.phone==='01000000000'); MP.saveDraft(__c.id,{step:4,data:{cat:'appliances',item:'appliances/ac',desc:'مسودة من الرئيسية'}}); show('home')");
ok(view().includes('عندك طلب لم يكتمل')&&view().includes('data-act="wzResume"'),'home exposes saved draft resume action');
click({act:'wzResume'}); ok(run('WZ&&WZ.desc')==='مسودة من الرئيسية'&&view().includes('طلب خدمة'),'resume action restores draft and opens wizard');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
