'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const F=require(path.join(root,'apps/admin/pages/finance-dashboard.page.js'));
const S=()=>({reviewed:{}});
const T=(p,c)=>F.buildModel(p,c,S()).totals;
test('model builds for every period and category with finite whole-number money',()=>{
  for(const p of F.PERIODS)for(const c of ['all'].concat(F.CATEGORIES.map(x=>x.id))){
    const m=F.buildModel(p.id,c,S());assert.strictEqual(m.kpis.length,6);
    for(const k of ['gmv','commission','collected','uncollected','providerNet','settled','pendingDues','discrepancyAmount'])assert(Number.isInteger(m.totals[k])&&m.totals[k]>=0,p.id+c+k);
  }
});
test('accounting invariants hold: commission = collected + uncollected; provider net = settled + pending; gmv = commission + net',()=>{
  for(const p of F.PERIODS){const t=T(p.id,'all');
    assert.strictEqual(t.commission,t.collected+t.uncollected);
    assert.strictEqual(t.providerNet,t.settled+t.pendingDues);
    assert.strictEqual(t.gmv,t.commission+t.providerNet);}
});
test('«all» totals equal the sum of the single-category totals',()=>{
  for(const p of F.PERIODS)for(const k of ['gmv','commission','collected','pendingDues']){
    assert.strictEqual(T(p.id,'all')[k],F.CATEGORIES.reduce((a,c)=>a+T(p.id,c.id)[k],0),p.id+k);}
});
test('longer periods never show smaller totals',()=>{assert(T('7','all').gmv<T('30','all').gmv&&T('30','all').gmv<T('90','all').gmv)});
test('KPI breakdown amounts sum to the KPI value (shares sum to 1 when value>0)',()=>{
  for(const p of F.PERIODS){const m=F.buildModel(p.id,'all',S());m.kpis.forEach(k=>{
    assert.strictEqual(k.detail.reduce((a,d)=>a+d.amount,0),k.value,k.id);
    if(k.value>0)assert(Math.abs(k.detail.reduce((a,d)=>a+d.share,0)-1)<1e-9,k.id)})}
});
test('unknown period falls back to 30 days and unknown category to all',()=>{const m=F.buildModel('x','zzz',S());assert.strictEqual(m.period,'30');assert.strictEqual(m.category,'all')});
test('discrepancies are filtered by period age and category',()=>{
  const n=(p,c)=>F.buildModel(p,c,S()).discrepancies.length;
  assert(n('7','all')<n('30','all')&&n('30','all')<n('90','all'));
  assert.strictEqual(n('90','all'),F.DISCREPANCIES.length);
  assert.strictEqual(n('7','carpentry'),0);
});
test('local review mark removes a discrepancy from the open amount and count only',()=>{
  const a=F.buildModel('90','all',S());const b=F.buildModel('90','all',{reviewed:{d1:true}});
  assert.strictEqual(b.discrepancies.length,a.discrepancies.length);
  assert.strictEqual(b.totals.discrepancyCount,a.totals.discrepancyCount-1);
  assert.strictEqual(b.totals.discrepancyAmount,a.totals.discrepancyAmount-150);
  assert.strictEqual(b.discrepancies.find(d=>d.id==='d1').status,'reviewed');
  assert.strictEqual(b.totals.gmv,a.totals.gmv);
});
test('discrepancy diff is recorded minus expected',()=>{F.buildModel('90','all',S()).discrepancies.forEach(d=>assert.strictEqual(d.diff,d.recorded-d.expected))});
test('no real-operation API is exposed and UI text says data is demo',()=>{
  assert(!Object.keys(F).some(k=>/pay|transfer|settle|send|execute|approve/i.test(k)));
  const src=fs.readFileSync(path.join(root,'apps/admin/pages/finance-dashboard.page.js'),'utf8');
  assert(src.includes('بيانات تجريبية محلية')&&src.includes('لا يتم تنفيذ أي دفع'));
});
test('registers page id «finance» which exists in the shell NAV; every module link target is a known page',()=>{
  const ids=require(path.join(root,'apps/admin/admin-shell.js'))._internals.flatItems().map(i=>i.id);
  const src=fs.readFileSync(path.join(root,'apps/admin/pages/finance-dashboard.page.js'),'utf8');
  assert(ids.includes('finance'));assert(src.includes("registerPage('finance'"));
  for(const m of src.matchAll(/'(?:reports|commissions|settlements)'/g))assert(ids.includes(m[0].slice(1,-1)),m[0]);
});
test('index.html loads the page after admin-shell.js',()=>{
  const h=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
  assert(h.indexOf('admin-shell.js')<h.indexOf('pages/finance-dashboard.page.js'));
});
console.log(`\n${passed} passed`);
