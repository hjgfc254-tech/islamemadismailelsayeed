'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const C=require(path.join(root,'apps/admin/pages/commissions.page.js'));
const M=require(path.join(root,'shared/utils/money.js'));
const F=require(path.join(root,'apps/admin/pages/finance-dashboard.page.js'));
const fx=()=>C.buildFixtures();
const ok={name:'قاعدة جديدة',category:'carpentry',rate:11,from:'2026-12-01',to:null,enabled:true};
const err=(fn)=>{try{fn()}catch(e){return e}throw new Error('expected throw')};
test('HSMoney: rounding, percent, isRate',()=>{
  assert.strictEqual(M.applyRate(1000,12.5),125);assert.strictEqual(M.applyRate(280000,12),33600);assert.strictEqual(M.applyRate(0,10),0);
  assert(M.isRate(12.25,30)&&!M.isRate(12.255,30)&&!M.isRate(31,30)&&!M.isRate(-1)&&!M.isRate(NaN)&&!M.isRate('5'));
  assert(M.format(1500).endsWith('ج.م'));assert(M.percent(12).endsWith('٪'));
});
test('fixtures: statuses on the fixed demo date',()=>{
  const s=Object.fromEntries(fx().map(r=>[r.id,C.statusOf(r,C.DEMO_TODAY)]));
  assert.deepStrictEqual(s,{r1:'active',r2:'active',r3:'active',r4:'scheduled',r5:'expired',r6:'disabled'});
  assert.deepStrictEqual(C.counts(fx()),{total:6,active:3,scheduled:1,expired:1,disabled:1});
});
test('fixtures: no overlapping enabled rules of the same scope',()=>{
  const l=fx();for(const r of l)assert.deepStrictEqual(C.validate(l.filter(x=>x.id!==r.id),r,r.id),{},r.id);
});
test('effective rate: category rule wins, default fills gaps, disabled/expired ignored',()=>{
  const l=fx(),e=(c,d)=>{const r=C.effective(l,c,d);return r&&r.rate};
  assert.strictEqual(e('electric','2026-11-09'),12);assert.strictEqual(e('carpentry','2026-11-09'),10);assert.strictEqual(e('other','2026-11-09'),10);
  assert.strictEqual(e('plumbing','2026-12-15'),8);assert.strictEqual(e('plumbing','2026-11-30'),12);assert.strictEqual(e('carpentry','2026-03-01'),9);
});
test('current table matches the finance dashboard demo commission rates',()=>{
  const t=C.currentTable(fx());for(const c of F.CATEGORIES)assert.strictEqual(t.find(x=>x.id===c.id).rate*1,c.rate*100,c.id);
});
test('validate: name, scope, rate, dates, range order',()=>{
  const l=fx(),v=(o)=>C.validate(l,Object.assign({},ok,o));
  assert.deepStrictEqual(v({}),{});
  assert(v({name:' a '}).name);assert(v({name:'عمولة الكهرباء'}).name);assert(v({name:'  عمولة الكهرباء '}).name);
  assert(v({category:'zzz'}).category);assert(v({rate:NaN}).rate);assert(v({rate:30.01}).rate);assert(v({rate:-1}).rate);assert(v({rate:5.123}).rate);
  assert(v({from:'2026-02-30'}).from);assert(v({from:''}).from);assert(v({to:'2026-11-30'}).to);assert(v({to:'bad'}).to);
});
test('validate: overlapping enabled rule of same scope is rejected; disabled draft or other scope is fine',()=>{
  const l=fx();
  assert(C.validate(l,{...ok,category:'plumbing',from:'2026-11-01'}).from.includes('تتداخل'));
  assert(C.validate(l,{...ok,category:'plumbing',from:'2026-11-01',enabled:false}).from===undefined);
  assert(C.validate(l,{...ok,category:'all',from:'2027-01-01'}).from.includes('تتداخل'));
  assert.deepStrictEqual(C.validate(l,{...l[3],to:'2027-03-31'},'r4'),{});
});
test('impact: raising electric from 12 to 15 changes only electric by the exact amount',()=>{
  const l=fx(),im=C.impact(l,{...l[1],rate:15},'r2');
  assert(im.hasEffect);const e=im.rows.find(r=>r.id==='electric');
  assert.strictEqual(e.before,12);assert.strictEqual(e.after,15);assert.strictEqual(e.delta,M.applyRate(280000,3));
  assert.strictEqual(im.totalDelta,e.delta);assert.strictEqual(im.commissionAfter-im.commissionBefore,im.totalDelta);
  im.rows.filter(r=>r.id!=='electric').forEach(r=>assert.strictEqual(r.delta,0));
});
test('impact: scheduled rule is evaluated on its start date; a rule fully in the past has no effect',()=>{
  const l=fx();const s=C.impact(l,{...l[3],rate:6},'r4');assert.strictEqual(s.when,'2026-12-01');assert.strictEqual(s.rows.find(r=>r.id==='plumbing').after,6);
  const p=C.impact(l,{...l[4],rate:20},'r5');assert.strictEqual(p.hasEffect,false);
  const n=C.impact(l,{...ok,category:'all',rate:10,from:'2026-12-01'},null);assert.strictEqual(n.hasEffect,false);
});
test('impact: does not mutate the rules',()=>{const l=fx(),j=JSON.stringify(l);C.impact(l,{...l[1],rate:15},'r2');assert.strictEqual(JSON.stringify(l),j)});
test('save: reason required (trimmed), validation first, no-change refused, immutable, audit recorded',()=>{
  const l=fx(),j=JSON.stringify(l);
  assert.strictEqual(err(()=>C.save(l,[],{...l[1],rate:15},'r2','  ab ')).message,'Reason required');
  assert.strictEqual(err(()=>C.save(l,[],{...l[1],rate:99},'r2','سبب كافٍ')).message,'Validation');
  assert.strictEqual(err(()=>C.save(l,[],{...l[1]},'r2','سبب كافٍ')).message,'No change');
  assert.strictEqual(err(()=>C.save(l,[],{...l[1]},'zz','سبب كافٍ')).message,'Unknown rule');
  const r=C.save(l,[],{...l[1],rate:15},'r2','  رفع النسبة تجريبيًا ','2026-11-09T10:00:00Z');
  assert.strictEqual(JSON.stringify(l),j);assert.strictEqual(r.rules.find(x=>x.id==='r2').rate,15);
  assert.strictEqual(r.audit.length,1);assert.strictEqual(r.audit[0].reason,'رفع النسبة تجريبيًا');assert(r.audit[0].changes.length===1&&r.audit[0].changes[0].includes('النسبة'));
});
test('save: create assigns the next id, trims name, logs «إنشاء»; reason is capped at 300',()=>{
  const r=C.save(fx(),[],{...ok,name:'  قاعدة نجارة جديدة  '},null,'x'.repeat(400));
  assert.strictEqual(r.id,'r7');assert.strictEqual(r.rules.length,7);assert.strictEqual(r.rules[6].name,'قاعدة نجارة جديدة');
  assert.strictEqual(r.audit[0].action,'إنشاء');assert.strictEqual(r.audit[0].reason.length,300);
});
test('save: a mutation never makes two enabled rules of one scope overlap',()=>{
  let l=fx(),a=[];const r=C.save(l,a,{...ok,category:'plumbing',from:'2027-03-01'},null,'سبب كافٍ');
  const en=r.rules.filter(x=>x.enabled&&x.category==='plumbing');
  for(const x of en)for(const y of en)if(x!==y)assert(!(x.from<=(y.to||'9999')&&y.from<=(x.to||'9999')),x.id+y.id);
});
test('no real-operation API; demo notice present; script order and NAV id',()=>{
  assert(!Object.keys(C).some(k=>/pay|transfer|apply|send|execute|delete|remove/i.test(k)));
  const src=fs.readFileSync(path.join(root,'apps/admin/pages/commissions.page.js'),'utf8');
  assert(src.includes('بيانات تجريبية محلية')&&src.includes("registerPage('commissions'"));
  const h=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
  for(const f of ['shared/utils/money.js','pages/finance-dashboard.page.js','shared/components/dialogs.js','shared/components/data-grid.js'])assert(h.indexOf(f)<h.indexOf('pages/commissions.page.js'),f);
  assert(require(path.join(root,'apps/admin/admin-shell.js'))._internals.flatItems().some(i=>i.id==='commissions'));
});
console.log(`\n${passed} passed`);
