/* اختبارات C4 — البحث الذكي + صفحات الاكتشاف: node tests/discover.test.js */
const fs=require('fs'),vm=require('vm'),path=require('path');
const dir=path.join(__dirname,'../..');
let pass=0,fail=0; const ok=(c,m)=>{ if(c)pass++; else {fail++; console.log('FAIL:',m);} };
const mem={}, listeners={};
const mkEl=()=>({innerHTML:'',value:'',hidden:false,dataset:{},style:{},scrollTop:0,inert:false,children:[],
  classList:{add(){},remove(){},toggle(){},contains:()=>false},addEventListener(){},removeEventListener(){},setAttribute(){},appendChild(){},remove(){},focus(){},click(){},scrollIntoView(){},
  querySelector:()=>null,querySelectorAll:()=>[],closest:()=>null,getBoundingClientRect:()=>({width:300,height:300})});
const els={}; const getEl=id=>els[id]||(els[id]=mkEl());
const pushed=[];
const doc={readyState:'loading',hidden:false,body:mkEl(),documentElement:Object.assign(mkEl(),{classList:{add(){},remove(){},contains:()=>true}}),
  querySelector:s=>getEl(s),getElementById:i=>getEl('#'+i),createElement:mkEl,createDocumentFragment:mkEl,querySelectorAll:()=>[],
  addEventListener:(t,f)=>(listeners[t]=listeners[t]||[]).push({f}),removeEventListener(){}};
const ctx={console,setTimeout:()=>0,clearTimeout(){},setInterval(){return 0},clearInterval(){},
  localStorage:{getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>mem[k]=String(v),removeItem:k=>delete mem[k]},
  sessionStorage:{getItem:()=>'1',setItem(){}},document:doc,window:{addEventListener:(t,f)=>(listeners['w:'+t]=listeners['w:'+t]||[]).push({f})},
  history:{pushState(s){pushed.push(s)},replaceState(){},back(){}},navigator:{},location:{protocol:'file:'},
  matchMedia:()=>({matches:false}),innerWidth:390,innerHeight:800,Image:function(){},URL:{},File:function(){},Blob:function(){},
  requestAnimationFrame:()=>0,indexedDB:undefined,Event:function(){}};
ctx.globalThis=ctx; vm.createContext(ctx);
const load=f=>vm.runInContext(fs.readFileSync(path.join(dir,f),'utf8').replace(/^'use strict';/m,''),ctx,{filename:f});
const run=c=>vm.runInContext(c,ctx);
['shared/icons/icon-registry.js','shared/config/legacy-data.js','services/local-catalog.js','services/local-market-store.js','apps/customer/pages/home.page.js','apps/customer/app.js','shared/components/ui-kit.js','apps/customer/pages/order-details.page.js','apps/customer/pages/market-ui.page.js','apps/customer/pages/request-wizard.page.js','apps/customer/pages/search.page.js','apps/customer/pages/discover.page.js','apps/customer/pages/addresses.page.js'].forEach(load);
(listeners.DOMContentLoaded||[]).forEach(l=>l.f());
const view=()=>els['#view'].innerHTML;
const Q=q=>run(`HS_SEARCH.query(${JSON.stringify(q)})`);

/* 1) اختبار القبول: «الغسالة مش بتصرف مياه» */
let r=Q('الغسالة مش بتصرف مياه');
ok(r.total>=3,'acceptance: results found');
ok(r.groups.problem.length>=3&&r.groups.problem.every(p=>/تصرف/.test(p.name)),'acceptance: all are drain problems');
ok(r.groups.problem.every(p=>/غسالة/.test(p.path)),'acceptance: all under washers');
ok(r.groups.problem.some(p=>p.item==='appliances/washer-auto'),'acceptance: includes automatic washer');
ok(r.order[0]==='problem'&&!r.partial,'acceptance: problems first, full match');
ok(r.groups.problem[0].cov===1,'acceptance: coverage 1');

/* 2) أشكال كتابة وعامية */
ok(Q('غساله مش بتعصر').groups.problem.some(p=>p.item==='appliances/washer-auto'&&/تعصر/.test(p.name)),'colloquial: washer spin');
ok(Q('التكييف مش بيبرد').groups.problem.some(p=>p.item==='appliances/ac'),'colloquial: ac not cooling');
ok(Q('مكيف').groups.item.some(i=>i.id==='appliances/ac'),'synonym: مكيف → تكييف');
ok(Q('نجار').groups.cat.some(c=>c.id==='carpentry'),'prefix/plural: نجار → نجارة');
ok(Q('سباكة').groups.cat[0].id==='plumbing','single word: category first');
ok(Q('غسالة').order[0]==='item','device-only query lists devices first');
ok(Q('غسالة').groups.item.some(i=>i.id==='appliances/washer-auto'),'device query finds washer');

/* 3) تصحيح إملائي + اقتراح */
r=Q('غسالة مش بتصرف مياة');
ok(r.total>0,'ta marbuta variant (مياة) still finds results');
r=Q('تكيف مش بيبرد');
ok(r.fuzzy&&r.didYouMean.includes('تكييف')&&r.groups.problem.some(p=>p.item==='appliances/ac'),'typo: تكيف → تكييف with did-you-mean');
ok(Q('تكيف مش بيبرد').didYouMean==='تكييف بيبرد','did-you-mean keeps known colloquial words unchanged');
r=Q('غسالة بلاي ستيشن');
ok(r.total===0,'no result for unrelated words');

/* 4) حالة «لا نتائج»: اقتراحات بديلة */
let html=run(`HS_SEARCH.renderResults('غسالة بلاي ستيشن')`);
ok(html.includes('مفيش نتائج')&&html.includes('تصفّح الأقسام'),'empty state: message + categories');
ok(html.includes('نتائج قريبة لكلمة «غسالة»'),'empty state: related results for a matching word');
ok((html.match(/data-hs-hit="cat\|/g)||[]).length>=7,'empty state: all categories offered');
ok(html.includes('data-hs-generic'),'empty state: generic request');
html=run(`HS_SEARCH.renderResults('xyz')`);
ok(html.includes('مفيش نتائج')&&!html.includes('نتائج قريبة'),'empty state for gibberish (no related)');
ok(!run(`HS_SEARCH.renderResults('<img onerror=1>')`).includes('<img'),'empty state escapes HTML');
ok(Q('').total===0&&Q('   ').total===0,'blank query safe');
html=run(`HS_SEARCH.renderResults('الغسالة مش بتصرف مياه')`);
ok(html.includes('data-hs-hit="problem|appliances/washer-auto/no-drain"'),'results render problem rows');
ok(run(`HS_SEARCH.suggest('غسالة مش بتصرف',8)`).length>=3,'suggest works with natural sentence');

/* 5) فتح النتيجة → صفحة (وليس الويزارد مباشرة) */
const stackBefore=run('state.stack.length');
ok(run(`HS_SEARCH.openResult('problem|appliances/washer-auto/no-drain')`)===true,'openResult(problem) handled');
ok(run('state.stack[state.stack.length-1]')==='disc:problem:appliances/washer-auto/no-drain','problem page pushed on back stack');
ok(run('state.stack.length')===stackBefore+1,'one stack entry');
ok(view().includes('لا تصرف المياه')&&view().includes('data-disc-order="problem|appliances/washer-auto/no-drain"'),'problem page shows name + order CTA');
ok(run('WZ')===null||run('WZ')===undefined||run('WZ.step')!==3,'wizard not started by merely opening the page');

/* 6) محتوى صفحة المشكلة */
ok(view().includes('data-disc="cat|appliances"')&&view().includes('data-disc="item|appliances/washer-auto"'),'breadcrumb links to category + device');
ok(view().includes('خطوات الحصول على الخدمة')&&view().includes('جهّز قبل الطلب'),'steps + info-needed sections');
ok(view().includes('أسئلة سنسألك عنها'),'diagnostic questions preview');
ok(view().includes('مشكلات أخرى في')&&view().includes('data-disc="problem|'),'sibling problems navigable');
ok(view().includes('خدمات مرتبطة'),'related services');
ok(view().includes('data-disc="item|appliances/washer-auto"'),'link back to device');
ok(view().includes('تنبيهات أمان')||!run(`CAT.safetyFor('appliances/washer-auto','appliances/washer-auto/no-drain').length`),'safety box when safety exists');

/* 7) صفحة الجهاز والقسم */
run(`HS_DISCOVER.open('item','appliances/washer-auto')`);
ok(view().includes('المشكلات الشائعة')&&view().includes('data-disc="problem|appliances/washer-auto/no-drain"'),'device page lists problems → problem page');
ok(view().includes('data-disc-order="item|appliances/washer-auto"'),'device page order CTA');
ok(view().includes('مش لاقي مشكلتي'),'device page has not-found-my-problem path');
ok(!view().includes('مشكلة أخرى</span>'),'"other" placeholder problem not listed as a normal row');
ok(view().includes('خدمات مرتبطة في'),'device page related devices');
run(`HS_DISCOVER.open('cat','appliances')`);
ok(view().includes('اختر الجهاز أو نوع العمل')&&view().includes('data-disc="item|appliances/washer-auto"'),'category page lists devices');
ok(view().includes('data-dev="appliances"'),'category page keeps link to legacy DIY tips');
ok(view().includes('تنبيهات أمان'),'category page shows category safety');
ok((view().match(/data-disc="item\|/g)||[]).length===run(`CAT.items('appliances').length`),'category page lists every active device');
for(const c of run(`CAT.categories().map(c=>c.id)`)){ run(`HS_DISCOVER.open('cat','${c}')`); ok(view().includes('data-disc-order="cat|'+c+'"'),'category page renders: '+c); }

/* 8) كل صفحات الكتالوج تُرسم بلا أخطاء وبدون undefined */
let bad=0,n=0;
for(const [k,id] of run(`CAT.categories().flatMap(c=>[['cat',c.id]].concat(CAT.items(c.id).flatMap(i=>[['item',i.id]].concat(CAT.problems(i.id).map(p=>['problem',p.id])))))`)){
  n++; try{ const h=run(`HS_DISCOVER.render(${JSON.stringify(k)},${JSON.stringify(id)})`); if(/undefined|NaN|\[object/.test(h)||!h.includes('class="screen"')) bad++; }catch(e){ bad++; console.log('render error',k,id,e.message); }
}
ok(n>400&&bad===0,`all ${n} catalog pages render cleanly (bad=${bad})`);

/* 9) الطلب من الصفحة يفتح الويزارد على الخطوة الصحيحة */
run(`HS_DISCOVER.order('problem','appliances/washer-auto/no-drain')`);
ok(run('WZ.item')==='appliances/washer-auto'&&run('WZ.problem')==='appliances/washer-auto/no-drain'&&run('WZ.step')===3,'order(problem): wizard at questions step');
ok(JSON.stringify(run('WZ.hist'))==='[2]','order(problem): back returns to problem step');
ok(run('state.stack.slice(-2).join()')==='wizard,wizard','order(problem): back-stack mirrors wizard steps');
ok(view().includes('class="form"')||view().includes('wz-'),'order(problem): wizard re-rendered at that step');
run(`HS_DISCOVER.order('item','appliances/washer-auto')`);
ok(run('WZ.step')===2&&run('WZ.problem')==='','order(item): wizard at problem-choice step');
run(`HS_DISCOVER.order('cat','plumbing')`);
ok(run('WZ.step')===1&&run('WZ.cat')==='plumbing','order(cat): wizard at device-choice step');
ok(run(`HS_DISCOVER.order('problem','nope')`)===false&&run(`HS_DISCOVER.open('item','nope')`)===false,'invalid ids rejected');

/* 10) صفحة غير موجودة (كتالوج تغيّر) ← رسالة خطأ لا استثناء */
ok(run(`HS_DISCOVER.render('problem','gone')`).includes('لم تعد متاحة'),'missing entity renders an error state');

/* 11) النقرات: data-disc / data-disc-order عبر المستمع العام */
const clickers=(listeners.click||[]).map(l=>l.f);
const fire=(attr,val)=>{ const el={dataset:{}}; const m=attr==='disc'?'disc':'discOrder'; el.dataset[m]=val;
  const ev={target:{closest:s=>(s.includes('data-disc-order')===(attr==='order')&&s.includes(attr==='order'?'data-disc-order':'data-disc'))&&!(attr==='disc'&&s.includes('data-disc-order'))?el:null},preventDefault(){}};
  clickers.forEach(f=>{ try{f(ev)}catch(e){} }); };
run('WZ=null'); fire('disc','item|plumbing/sinks');
ok(run('state.stack[state.stack.length-1]')==='disc:item:plumbing/sinks','click data-disc opens the page');
fire('order','problem|appliances/washer-auto/no-drain');
ok(run('WZ&&WZ.step')===3,'click data-disc-order starts wizard');

/* 12) زر الرجوع (popstate) يعيد رسم صفحة الاكتشاف السابقة */
run(`WZ=null; state.stack=[]; HS_DISCOVER.open('cat','electric'); HS_DISCOVER.open('item',CAT.items('electric')[0].id)`);
ok(view().includes('المشكلات الشائعة'),'item page shown');
(listeners['w:popstate']||[]).forEach(l=>l.f());
ok(view().includes('اختر الجهاز أو نوع العمل')&&view().includes('data-disc-order="cat|electric"'),'popstate returns to category page');
(listeners['w:popstate']||[]).forEach(l=>l.f());
ok(run('state.stack.length')===0,'popstate to empty stack leaves discovery');

/* 13) سجل البحث عند اختيار نتيجة */
run(`MP.customerFor('سارة','01011112222'); store.set('user',{name:'سارة',phone:'01011112222'})`);
const before=run(`MP.recentSearches((me()||{}).id||'',30).length`);
ok(typeof before==='number','search history API available');

console.log(`C4 discover: ${pass} passed / ${fail} failed`);
process.exit(fail?1:0);
