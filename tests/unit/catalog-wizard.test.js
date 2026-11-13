/* اختبارات منطق الكتالوج والنموذج بمحاكاة Node (بلا متصفح): node tests/catalog-wizard.test.js */
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=path.join(__dirname,'../..'); const mem={};
const listeners={click:[],submit:[],input:[]}; const toasts=[]; let hist=0;
const el={value:'',dataset:{},innerHTML:''};
const ctx={ console, setInterval(){}, setTimeout(){}, clearTimeout(){}, clearInterval(){}, localStorage:{getItem:k=>mem[k]||null,setItem:(k,v)=>mem[k]=v},
  document:{ addEventListener:(t,f,c)=>(listeners[t]=listeners[t]||[]).push({f,c}), getElementById:i=>fields[i]||null, querySelectorAll:s=>s==='[data-q]'?Object.values(qfields):[], createElement:()=>({}) },
  window:{ addEventListener(){} }, history:{pushState(){hist++},back(){}}, navigator:{}, Image:function(){}, URL:{},
  esc:s=>String(s==null?'':s), store:{get:(k,d)=>mem['s_'+k]?JSON.parse(mem['s_'+k]):d,set:(k,v)=>mem['s_'+k]=JSON.stringify(v)},
  toast:m=>toasts.push(m), closeSheet(){}, show(n,a){ ctx.__last=ctx.screens[n](a); }, head:t=>t, ART:{}, ic:()=>'', icp:()=>'', icSec:x=>x, icItem:()=>'', icProb:()=>'', icStatus:()=>'', starsHtml:()=>'', renderTabs(){},
  state:{stack:[],tab:'home'}, DEMO_NOTE:'demo', demoBanner:()=>'', fmtDT:s=>s, MPx:null, PENDING_PHOTO:null, pick(){}, shrink(){}, screens:{}, WZ:null };
const fields={}, qfields={};
vm.createContext(ctx);
for(const f of ['services/local-catalog.js','services/local-market-store.js']) vm.runInContext(fs.readFileSync(path.join(dir,f),'utf8').replace(/^'use strict';/m,''),ctx,{filename:f});
vm.runInContext(fs.readFileSync(path.join(dir,'apps/customer/pages/request-wizard.page.js'),'utf8').replace(/^'use strict';/m,''),ctx,{filename:'apps/customer/pages/request-wizard.page.js'});
const run=c=>vm.runInContext(c,ctx);
let pass=0, fail=0; const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.log('FAIL:',m);} };
const click=attrs=>{ const dataset={}; for(const [k,v] of Object.entries(attrs)) dataset[k]=v;
  const t={dataset,closest:()=>t,matches:sel=>String(sel).split(',').some(x=>{const m=/\[data-([a-z-]+)\]/.exec(x);return !!m&&(m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase()) in dataset);})}; listeners.click.filter(l=>l.c).forEach(l=>l.f({target:t,stopImmediatePropagation(){},preventDefault(){}})); };
const wz=()=>run('WZ');
const setf=o=>{ for(const k in fields) delete fields[k]; for(const [k,v] of Object.entries(o)) fields[k]={value:v}; };
const setq=o=>{ for(const k in qfields) delete qfields[k]; for(const [k,v] of Object.entries(o)) qfields[k]={value:v,dataset:{q:k}}; };

/* 1) البنية */
run("globalThis.CATX=CAT");
ok(run('CAT.categories().length')===7,'7 categories');
ok(run('CAT.db().problems.every(p=>/^[a-z0-9\\-\\/]+$/.test(p.id))'),'ids ascii only');
ok(run("CAT.problems('appliances/fridge').map(p=>p.name).join()")!==run("CAT.problems('appliances/washer-auto').map(p=>p.name).join()"),'fridge != washer problems');
ok(!run("CAT.problems('appliances/fridge').some(p=>p.name.includes('الغسالة'))"),'no washer problems on fridge');
ok(!run("CAT.problems('appliances/ac').some(p=>p.name.includes('الثلاجة'))"),'no fridge problems on AC');
ok(run("CAT.items('appliances').length")===12,'12 appliance items (incl. other)');
ok(run("CAT.problems('cleaning/apartments').length")>3,'cleaning problems');

/* 2) المسارات الإلزامية */
const journeys=[
 ['appliances','appliances/washer-auto','appliances/washer-auto/motor-failure'],
 ['appliances','appliances/fridge','appliances/fridge/no-cooling'],
 ['electric','electric/dist-board','electric/dist-board/breaker-trips'],
 ['plumbing','plumbing/faucets','plumbing/faucets/leak'],
 ['cars','cars/engine','cars/engine/strange-noise'],
 ['cleaning','cleaning/post-finishing','cleaning/post-finishing/full']];
for(const [c,i,p] of journeys){
  run('startRequest()'); click({wzCat:c}); ok(wz().step===1&&wz().cat===c,'cat step '+c);
  click({wzItem:i}); ok(wz().step===2&&wz().item===i,'item '+i);
  click({wzProb:p}); ok(wz().step===3&&wz().problem===p,'problem '+p);
  const qs=run(`CAT.questionsFor('${i}','${p}')`);
  if(c==='cars') { click({act:'wzNext'}); ok(wz().step===3&&String(toasts.pop()).startsWith('أجب عن'),'car make required'); }
  setq(c==='cars'?{make:'تويوتا كورولا 2018'}:{}); click({act:'wzNext'}); ok(wz().step===4,'to description '+c);
  setf({'wz-desc':'وصف المشكلة بالتفصيل','wz-note':''}); click({act:'wzNext'}); ok(wz().step===5,'to attachments '+c);
  click({act:'wzNext'}); ok(wz().step===6,'to location '+c);
  click({act:'wzNext'}); ok(wz().step===6&&toasts.pop()==='اختر المحافظة','gov required');
  setf({'wz-gov':'القاهرة','wz-area':'مدينة نصر','wz-addr':'شارع عباس العقاد 12'}); click({act:'wzNext'}); ok(wz().step===7,'to schedule');
  run("WZ.schedule.flexible=true"); click({act:'wzNext'}); ok(wz().step===8,'to contact');
  setf({'wz-name':'عميل تجريبي','wz-phone':'01012345678'}); run("WZ.contact.name='عميل تجريبي';WZ.contact.phone='01012345678'"); click({act:'wzNext'}); ok(wz().step===9,'to review');
  ok(run('screens.wizard()').includes('تأكيد وإرسال'),'review screen');
  click({act:'wzSubmit'}); ok(wz().step===10&&wz().done,'submitted '+p);
  const r=run('MP.reqs()[0]'); ok(r&&r.itemId===i&&r.problemId===p&&r.cat===c&&r.catName&&r.itemName&&r.problemName,'request stores cat/item/problem '+p);
  ok(r.status!=='received','request moved');
}
/* 3) إعادة الضبط عند تغيير الاختيار */
run('startRequest()'); click({wzCat:'appliances'}); click({wzItem:'appliances/washer-auto'}); click({wzProb:'appliances/washer-auto/leakage'});
setf({'wz-desc':'تسريب مياه من أسفل الغسالة'}); setq({since:'النهاردة',pattern:'مستمر'}); click({act:'wzNext'});
click({wzEdit:'1'}); ok(wz().step===1,'edit to item step');
click({wzItem:'appliances/fridge'}); ok(wz().problem===''&&Object.keys(wz().answers).length===0,'item change resets problem + answers');
ok(wz().desc.includes('تسريب'),'description kept after item change');
click({wzProb:'appliances/fridge/leak'}); ok(wz().problem==='appliances/fridge/leak','fridge leak ok');
click({wzEdit:'0'}); click({wzCat:'plumbing'}); ok(wz().item===''&&wz().problem==='','cat change resets item+problem');
click({wzCat:'plumbing'}); click({wzItem:'plumbing/faucets'});
click({wzCat:'cars'}); ok(run("CAT.valid({cat:'cars',item:'plumbing/faucets',problem:''}).item")==='','stale item invalid');
/* same-cat re-click keeps selection */
run('startRequest()'); click({wzCat:'electric'}); click({wzItem:'electric/lighting'}); click({wzProb:'electric/lighting/flicker'}); click({wzEdit:'0'}); click({wzCat:'electric'});
ok(wz().item==='electric/lighting'&&wz().problem==='electric/lighting/flicker','same category keeps selections');
/* 4) غير معروف */
run('startRequest("appliances","appliances/ac")'); ok(wz().step===2,'start at problems from item'); click({wzUnknown:''}); ok(wz().unknown&&wz().step===3,'unknown path');
setf({'wz-desc':''}); click({act:'wzNext'}); ok(wz().step===4,'unknown does not need description');
/* 5) الأسئلة الديناميكية */
const qA=run("CAT.questionsFor('cleaning/apartments','').map(q=>q.id)"), qW=run("CAT.questionsFor('appliances/washer-auto','').map(q=>q.id)");
ok(qA.includes('area')&&!qA.includes('pattern'),'cleaning questions no fault questions'); ok(qW.includes('pattern')&&qW.includes('brand'),'washer fault+appliance questions');
/* 6) بحث وإدارة */
ok(run("CAT.search('ثلاجة').some(x=>x.type==='item')"),'search item'); ok(run("CAT.search('لا تعصر').some(x=>x.type==='problem')"),'search problem');
run("CAT.setActive('item','appliances/fridge',false)"); ok(!run("CAT.items('appliances').some(i=>i.id==='appliances/fridge')"),'disabled item hidden from customers');
ok(run("CAT.items('appliances',true).some(i=>i.id==='appliances/fridge')"),'admin still sees disabled item');
run("CAT.setActive('item','appliances/fridge',true)");
run("CAT.upsert('item',{id:'appliances/tv',cat:'appliances',name:'تلفزيون',specialty:'appliances.tv',kind:'fault'})"); run("CAT.upsert('problem',{id:'appliances/tv/no-picture',item:'appliances/tv',cat:'appliances',name:'لا توجد صورة'})");
ok(run("CAT.problems('appliances/tv').length")===1,'admin add item/problem reflected');
/* 7) C5 — التحقق الصحيح واستعادة المسودة */
run("WZ=wzNew('appliances','appliances/ac')");
run("WZ.step=8; WZ.contact.name='عميل'; WZ.contact.phone='01012345678'; WZ.contact.method='call'");
ok(run('wzCheckStep(8)')==='', 'Egyptian mobile valid');
run("WZ.contact.phone='01912345678'"); ok(run('wzCheckStep(8)')!=='', 'reject invalid Egyptian mobile prefix');
run("WZ.contact.phone='+201012345678'"); ok(run('wzCheckStep(8)')==='', 'international Egyptian mobile accepted');
run("WZ=wzNew('appliances','appliances/ac'); WZ.step=5; WZ.problem='appliances/ac/no-cooling'; CAT.problem(WZ.problem).attachments.photos='required'");
ok(run('wzCheckStep(5)').includes('صورة واحدة'), 'required image validation is applied on attachment step');
run("WZ.attachmentMeta=[{id:'img1',kind:'image'}]"); ok(run('wzCheckStep(5)')==='', 'required image accepted when attached');
run("store.set('user',{name:'مسودة',phone:'01012345678'}); MP.customerFor('مسودة','01012345678'); globalThis.me=()=>MP.db().customers.find(c=>c.phone==='01012345678'); WZ=wzNew('appliances','appliances/ac'); WZ.desc='مسودة محفوظة'; wzSaveDraft(); WZ=null");
ok(run("screens.wizard().includes('data-act=\"wzResume\"')"), 'resume draft action is offered');
click({act:'wzResume'}); ok(wz()&&wz().desc==='مسودة محفوظة', 'saved draft restores into wizard');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
