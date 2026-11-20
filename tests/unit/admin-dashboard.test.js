'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const D=require(path.join(root,'apps/admin/pages/admin-dashboard.page.js'));
test('model has KPIs, tasks and alerts for every period',()=>{
  for(const p of D.PERIODS){const m=D.buildModel(p.id,{done:{},dismissed:{}});assert.strictEqual(m.kpis.length,6);assert(m.tasks.length>0&&m.alerts.length>0);m.kpis.forEach(k=>{assert(Number.isFinite(k.value));assert(Math.abs(k.detail.reduce((a,d)=>a+d.share,0)-1)<1e-9,k.id+' shares')})}
});
test('unknown period falls back to 30 days',()=>assert.strictEqual(D.buildModel('x',{done:{},dismissed:{}}).period,'30'));
test('dismissed alerts and done tasks are reflected',()=>{const m=D.buildModel('7',{done:{t1:true},dismissed:{a1:true}});assert(m.tasks.find(t=>t.id==='t1').done);assert(!m.alerts.some(a=>a.id==='a1'))});
test('complaints delta is good when it decreases (inverted metric)',()=>{const k=D.buildModel('7',{done:{},dismissed:{}}).kpis.find(k=>k.id==='complaints');assert(k.delta<0&&k.good)});
test('every shortcut/module target is a known admin page id',()=>{
  const ids=require(path.join(root,'apps/admin/admin-shell.js'))._internals.flatItems().map(i=>i.id).concat(Object.keys(require(path.join(root,'apps/admin/admin-shell.js'))._internals.HIDDEN_PAGES));   // finance / reports / owner board are reached from «الإحصائيات»
  const src=fs.readFileSync(path.join(root,'apps/admin/pages/admin-dashboard.page.js'),'utf8');
  for(const m of src.matchAll(/module: '([a-z-]+)'/g))assert(ids.includes(m[1]),m[1]);
  for(const m of src.matchAll(/\['([a-z-]+)', '[^']+', '[a-z-]+'\]/g))assert(ids.includes(m[1]),m[1]);
});
console.log(`\n${passed} passed`);
