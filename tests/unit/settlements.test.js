'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const S=require(path.join(root,'apps/admin/pages/settlements.page.js'));
const F=require(path.join(root,'apps/admin/pages/finance-dashboard.page.js'));
const G=require(path.join(root,'shared/components/data-grid.js'));
const M=require(path.join(root,'shared/utils/money.js'));
const fx=()=>S.buildFixtures();
const err=(fn)=>{try{fn()}catch(e){return e}throw new Error('expected throw')};
const byStatus=(l,s)=>l.filter(x=>x.status===s);
const view=(rows,st)=>G.computeView(rows.map(S.toRow),S.GRID_CFG,Object.assign({search:'',filters:{},sort:null,page:1,pageSize:50},st));

test('fixtures: valid, unique ids/refs, demo reference format',()=>{
  const l=fx();assert.strictEqual(l.length,16);assert.deepStrictEqual(S.validateSettlements(l),[]);
  assert.strictEqual(new Set(l.map(x=>x.ref)).size,16);assert(l.every(x=>/^STL-DEMO-\d{4}$/.test(x.ref)));
});
test('fixtures: totals tie to the finance dashboard 30-day demo figures',()=>{
  const m=F.buildModel('30','all'),t=S.totals(fx());
  assert.strictEqual(t.settled,m.totals.settled);assert.strictEqual(t.outstanding,m.totals.pendingDues);assert.strictEqual(t.total,m.totals.providerNet);
  for(const r of m.rows){const c=fx().filter(x=>x.category===r.id);assert.strictEqual(S.totals(c).settled,r.settled,r.id);assert.strictEqual(S.totals(c).outstanding,r.pendingDues,r.id);}
});
test('totals: total = settled + outstanding; on-hold is a subset of outstanding; discrepancy count/amount',()=>{
  const l=fx(),t=S.totals(l);assert.strictEqual(t.total,t.settled+t.outstanding);assert(t.onHold>0&&t.onHold<=t.outstanding);
  assert.strictEqual(t.onHold,byStatus(l,'on_hold').reduce((a,x)=>a+x.amount,0));
  assert.strictEqual(t.discrepancyCount,2);assert.strictEqual(t.discrepancyAmount,1700);
  assert.deepStrictEqual(S.totals([]),{total:0,settled:0,outstanding:0,onHold:0,discrepancyCount:0,discrepancyAmount:0});
});
test('provider dues: per-provider sums equal the global totals',()=>{
  const l=fx(),p=S.byProvider(l);assert.strictEqual(p.length,8);
  for(const k of ['total','settled','outstanding','onHold'])assert.strictEqual(p.reduce((a,x)=>a+x[k],0),S.totals(l)[k],k);
  p.forEach(x=>assert.strictEqual(x.total,x.settled+x.outstanding));
});
test('status consistency: counts add up; every status known; hold/discrepancy invariants',()=>{
  const l=fx(),c=S.counts(l);assert.strictEqual(c.total,16);assert.strictEqual(Object.keys(S.STATUS).reduce((a,k)=>a+c[k],0),16);
  assert.deepStrictEqual([c.completed,c.pending,c.in_review,c.on_hold,c.approved],[8,3,2,2,1]);
  byStatus(l,'on_hold').forEach(x=>assert(x.hold&&x.hold.reason.length>=S.REASON_MIN));
  l.filter(x=>x.status!=='on_hold').forEach(x=>assert.strictEqual(x.hold,null));
  byStatus(l,'completed').forEach(x=>assert(x.settledOn&&!S.hasOpenDiscrepancy(x)));
  byStatus(l,'approved').forEach(x=>assert(!S.hasOpenDiscrepancy(x)));
});
test('validateSettlements: catches inconsistent data',()=>{
  const l=fx(),bad=(i,o)=>S.validateSettlements(l.map((x,k)=>(k===i?{...x,...o}:x)));
  assert(bad(0,{amount:0}).length);assert(bad(0,{amount:12.5}).length);assert(bad(0,{status:'zzz'}).length);assert(bad(0,{ref:'X-1'}).length);
  assert(bad(0,{periodFrom:'2026-12-01'}).length);assert(bad(0,{settledOn:null}).length);
  assert(bad(1,{hold:{reason:'سبب'},status:'pending'}).length);assert(bad(1,{status:'on_hold',hold:null}).length);
  assert(bad(0,{discrepancy:{amount:5,reason:'x',reviewed:false}}).length);
  assert(S.validateSettlements([l[0],{...l[1],id:l[0].id}]).some(m=>m.includes('duplicate id')));
});
test('transitions: only the documented flow is allowed',()=>{
  const all=Object.keys(S.STATUS);
  for(const a of all)for(const b of all)assert.strictEqual(S.canTransition(a,b),(S.FLOW[a]||[]).includes(b),a+'>'+b);
  assert(S.canTransition('pending','in_review')&&S.canTransition('in_review','approved')&&S.canTransition('approved','completed')&&S.canTransition('on_hold','in_review'));
  assert(!S.canTransition('pending','completed')&&!S.canTransition('pending','approved')&&!S.canTransition('completed','pending')&&!S.canTransition('on_hold','approved')&&!S.canTransition('x','pending'));
  assert.deepStrictEqual(S.FLOW.completed,[]);
});
test('transition: refuses invalid moves and unknown ids/statuses',()=>{
  const l=fx(),e=(id,to,n)=>err(()=>S.transition(l,[],id,to,{note:n||'سبب كافٍ'})).message;
  const done=byStatus(l,'completed')[0],pend=byStatus(l,'pending')[0];
  assert.strictEqual(e(done.id,'completed'),'Transition not allowed');assert.strictEqual(e(done.id,'pending'),'Transition not allowed');
  assert.strictEqual(e(pend.id,'completed'),'Transition not allowed');assert.strictEqual(e(pend.id,'approved'),'Transition not allowed');
  assert.strictEqual(e('zz','approved'),'Unknown settlement');assert.strictEqual(e(pend.id,'paid'),'Unknown status');
});
test('transition: hold requires a trimmed reason of 3+ chars (capped at 300) and stores it',()=>{
  const l=fx(),p=byStatus(l,'pending')[0];
  assert.strictEqual(err(()=>S.transition(l,[],p.id,'on_hold',{note:'  ab '})).message,'Reason required');
  assert.strictEqual(err(()=>S.transition(l,[],p.id,'on_hold')).message,'Reason required');
  const r=S.transition(l,[],p.id,'on_hold',{note:'  بانتظار مستند  '},'2026-11-09T10:00:00Z');
  const n=r.settlements.find(x=>x.id===p.id);assert.strictEqual(n.status,'on_hold');assert.strictEqual(n.hold.reason,'بانتظار مستند');
  assert.strictEqual(S.transition(l,[],p.id,'on_hold',{note:'x'.repeat(400)}).log[0].note.length,300);
  const back=S.transition(r.settlements,r.log,p.id,'in_review',{});assert.strictEqual(back.settlements.find(x=>x.id===p.id).hold,null);
});
test('transition: full path pending → review → approved → completed; completion sets the demo date only',()=>{
  let l=fx(),lg=[];const id=byStatus(l,'pending').find(x=>!x.discrepancy).id;
  for(const to of ['in_review','approved','completed']){const r=S.transition(l,lg,id,to,{});l=r.settlements;lg=r.log;}
  const s=l.find(x=>x.id===id);assert.strictEqual(s.status,'completed');assert.strictEqual(s.settledOn,S.DEMO_TODAY);assert.strictEqual(lg.length,3);
  assert.strictEqual(err(()=>S.transition(l,lg,id,'completed',{})).message,'Transition not allowed'); // no duplicate completion
});
test('open discrepancy blocks approval until reviewed with a reason; review does not change amount/status',()=>{
  let l=fx(),lg=[];const s=byStatus(l,'in_review').find(x=>S.hasOpenDiscrepancy(x));
  assert.deepStrictEqual(S.allowedActions(s),['on_hold']);
  assert.strictEqual(err(()=>S.transition(l,lg,s.id,'approved',{})).message,'Open discrepancy');
  assert.strictEqual(err(()=>S.reviewDiscrepancy(l,lg,s.id,{note:'a'})).message,'Reason required');
  assert.strictEqual(err(()=>S.reviewDiscrepancy(l,lg,'zz',{note:'سبب كافٍ'})).message,'Unknown settlement');
  const r=S.reviewDiscrepancy(l,lg,s.id,{note:'تمت المطابقة يدويًا'});const n=r.settlements.find(x=>x.id===s.id);
  assert(n.discrepancy.reviewed&&n.status===s.status&&n.amount===s.amount);assert.strictEqual(r.log[0].action,'مراجعة الاختلاف');
  assert.strictEqual(err(()=>S.reviewDiscrepancy(r.settlements,r.log,s.id,{note:'مرة ثانية'})).message,'No open discrepancy');
  assert(S.allowedActions(n).includes('approved'));assert.strictEqual(S.transition(r.settlements,r.log,s.id,'approved',{}).settlements.find(x=>x.id===s.id).status,'approved');
});
test('immutability: operations never mutate the original data or log',()=>{
  const l=fx(),j=JSON.stringify(l),lg=[{at:'x'}],jl=JSON.stringify(lg);
  const p=byStatus(l,'pending').find(x=>!x.discrepancy).id,d=byStatus(l,'in_review').find(x=>x.discrepancy).id;
  const r1=S.transition(l,lg,p,'on_hold',{note:'سبب كافٍ'}),r2=S.reviewDiscrepancy(l,lg,d,{note:'سبب كافٍ'});
  assert.strictEqual(JSON.stringify(l),j);assert.strictEqual(JSON.stringify(lg),jl);
  assert.notStrictEqual(r1.settlements,l);assert.notStrictEqual(r1.log,lg);assert.strictEqual(r1.settlements.length,l.length);assert.strictEqual(r2.log.length,2);
  const r3=S.transition(l,lg,byStatus(l,'approved')[0].id,'completed',{});assert.strictEqual(JSON.stringify(l),j);
  assert.deepStrictEqual(S.validateSettlements(r3.settlements),[]);
});
test('totals stay consistent after every allowed simulated action',()=>{
  let l=fx(),lg=[];const a=S.totals(l);
  const ap=byStatus(l,'approved')[0];const r=S.transition(l,lg,ap.id,'completed',{});l=r.settlements;
  const t=S.totals(l);assert.strictEqual(t.total,a.total);assert.strictEqual(t.settled,a.settled+ap.amount);assert.strictEqual(t.outstanding,a.outstanding-ap.amount);
  const h=S.transition(l,r.log,byStatus(l,'pending')[0].id,'on_hold',{note:'سبب كافٍ'}).settlements;assert.strictEqual(S.totals(h).total,a.total);assert(S.totals(h).onHold>a.onHold);
});
test('log: entries record action, from/to, note, simulated flag, and ref',()=>{
  const l=fx(),p=byStatus(l,'pending')[0],r=S.transition(l,[],p.id,'in_review',{note:' ملاحظة '},'2026-11-09T10:00:00Z'),e=r.log[0];
  assert.deepStrictEqual([e.settlementId,e.ref,e.from,e.to,e.note,e.simulated,e.at],[p.id,p.ref,'pending','in_review','ملاحظة',true,'2026-11-09T10:00:00Z']);
  assert.strictEqual(e.action,S.ACTION_LABEL.in_review);
});
test('search / filters / sort (via HSDataGrid.computeView over the page columns)',()=>{
  const l=fx();
  assert.strictEqual(view(l,{}).matched,16);
  assert.strictEqual(view(l,{search:'STL-DEMO-0003'}).matched,1);assert.strictEqual(view(l,{search:'stl-demo-0003'}).matched,1);
  assert.strictEqual(view(l,{search:'سباكة'}).matched,4);assert.strictEqual(view(l,{search:'zzzz'}).matched,0);
  assert.strictEqual(view(l,{search:'بيانات استلام'}).matched,1); // hold reason is searchable
  assert.strictEqual(view(l,{filters:{status:'completed'}}).matched,8);assert.strictEqual(view(l,{filters:{status:'on_hold'}}).matched,2);
  assert.strictEqual(view(l,{filters:{diffState:'open'}}).matched,2);assert.strictEqual(view(l,{filters:{diffState:'none'}}).matched,14);
  assert.strictEqual(view(l,{filters:{categoryLabel:'كهرباء',status:'completed'}}).matched,2);
  assert.strictEqual(view(l,{filters:{provider:'مزوّد نجارة تجريبي (أ)'}}).matched,2);
  const asc=view(l,{sort:{key:'amount',dir:'asc'}}).rows.map(r=>r.amount),desc=view(l,{sort:{key:'amount',dir:'desc'}}).rows.map(r=>r.amount);
  assert.deepStrictEqual(asc,asc.slice().sort((a,b)=>a-b));assert.deepStrictEqual(desc,asc.slice().reverse());
  const d=view(l,{sort:{key:'dateKey',dir:'asc'}}).rows.map(r=>r.dateKey);assert.deepStrictEqual(d,d.slice().sort());
  assert.strictEqual(view(l,{pageSize:10}).pages,2);
});
test('filter options only reference statuses/badges that exist; status badge domain registered',()=>{
  S.FLOW&&Object.keys(S.FLOW).forEach(k=>assert(S.STATUS[k],k));Object.values(S.FLOW).flat().forEach(k=>assert(S.STATUS[k],k));
  assert(S.GRID_CFG.filters.find(f=>f.key==='status').options.length===Object.keys(S.STATUS).length);
  assert(S.GRID_CFG.columns.every(c=>c.type!=='status'||c.statusDomain==='settlement'));
});
test('HSMoney is the only formatter: amounts/rates use HSMoney, no local formatter',()=>{
  const src=fs.readFileSync(path.join(root,'apps/admin/pages/settlements.page.js'),'utf8');
  assert(src.includes('M.format(')&&src.includes('M.number('));
  assert(!/toLocaleString|Intl\.NumberFormat|toFixed\(/.test(src),'no ad-hoc number formatting');
  assert(!/function\s+(format|fmt|money)\w*\s*\(/.test(src));
  const r=S.toRow(fx()[0]);assert.strictEqual(typeof r.periodText,'string');
  const col=S.COLUMNS.find(c=>c.key==='amount');assert.strictEqual(col.format({amount:1500}),M.format(1500));
});
test('no API performs a real money transfer; wording never claims money moved',()=>{
  assert(!Object.keys(S).some(k=>/pay|transfer|send|execute|disburse|remit|delete|remove|fetch|post/i.test(k)),Object.keys(S).join());
  const src=fs.readFileSync(path.join(root,'apps/admin/pages/settlements.page.js'),'utf8');
  assert(!/\b(fetch|XMLHttpRequest|WebSocket|firebase|firestore|localStorage|sessionStorage)\b/i.test(src));
  assert(!/(^|[^ي])تم (تحويل|صرف|دفع)|حُوِّل|صُرف/.test(src)); // «لا يتم تحويل» (negation) is allowed
  assert(src.includes('لا يتم تحويل أي مبلغ')&&src.includes('بيانات تجريبية محلية')&&src.includes('محاكاة'));
  for(const k of Object.keys(S.STATUS))assert(!/مدفوع|محوّل|تم التحويل/.test(S.STATUS[k].label),k);
  assert(S.STATUS.completed.label.includes('محاكاة')&&S.STATUS.approved.label.includes('محاكاة'));
  Object.values(S.ACTION_LABEL).filter(l=>/اعتماد|مكتملة/.test(l)).forEach(l=>assert(l.includes('محاكاة'),l));
});
test('registration: NAV id exists, page registered, script order (after finance, commissions and shared deps)',()=>{
  const src=fs.readFileSync(path.join(root,'apps/admin/pages/settlements.page.js'),'utf8');
  assert(src.includes("registerPage('settlements'")&&src.includes('STATUS: IMPLEMENTED (DEMO)')&&!src.includes('PLACEHOLDER'));
  assert(require(path.join(root,'apps/admin/admin-shell.js'))._internals.flatItems().some(i=>i.id==='settlements'));
  const h=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8'),at=(f)=>h.indexOf(f);
  assert(at('pages/settlements.page.js')>0&&h.split('pages/settlements.page.js').length===2);
  for(const f of ['admin-shell.js','shared/icons/icon-registry.js','shared/components/status-badge.js','shared/components/data-grid.js','shared/components/dialogs.js','shared/utils/money.js','pages/finance-dashboard.page.js','pages/commissions.page.js'])assert(at(f)>=0&&at(f)<at('pages/settlements.page.js'),f);
});
test('browser-style load: registers itself on a shell stub with a render function',()=>{
  const reg={};global.HSAdminShell={registerPage:(id,d)=>{reg[id]=d}};
  delete require.cache[require.resolve(path.join(root,'apps/admin/pages/settlements.page.js'))];require(path.join(root,'apps/admin/pages/settlements.page.js'));
  delete global.HSAdminShell;
  assert(reg.settlements&&typeof reg.settlements.render==='function'&&reg.settlements.title==='التسويات'&&reg.settlements.actions.every(a=>typeof a.onClick==='function'));
  assert(/لا يتم تحويل أي أموال/.test(reg.settlements.description));
});
console.log(`\n${passed} passed`);
