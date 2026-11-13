'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const B=require(path.join(root,'shared/components/status-badge.js'));
globalThis.HSStatusBadge=B;globalThis.HSDialog=require(path.join(root,'shared/components/dialogs.js'));
const S=require(path.join(root,'apps/admin/pages/services-management.page.js'));
const shell=require(path.join(root,'apps/admin/admin-shell.js'));
const ok={name:'خدمة جديدة',category:'كهرباء',description:''};
test('registers the «service» badge domain with every status',()=>{Object.keys(S.STATUS).forEach(k=>{assert(B.known('service',k),k);assert.strictEqual(B.label('service',k),S.STATUS[k].label)})});
test('fixtures: unique ids/names, orders 1..n contiguous, valid categories, all 3 statuses, drafts have no orders',()=>{
  const f=S.buildFixtures();assert.strictEqual(f.length,20);assert.strictEqual(new Set(f.map(s=>s.id)).size,20);assert.strictEqual(new Set(f.map(s=>s.name)).size,20);
  assert.deepStrictEqual(f.map(s=>s.order).sort((a,b)=>a-b),f.map((_,i)=>i+1));f.forEach(s=>{assert(S.CATEGORIES.includes(s.category));if(s.status==='draft')assert.strictEqual(s.orders,0)});
  assert.strictEqual(new Set(f.map(s=>s.status)).size,3);
});
test('validate: required, length, unique name (spacing/case-insensitive), category in list, description cap',()=>{
  const l=S.buildFixtures();assert(S.validate(ok,l).ok);
  assert(S.validate({...ok,name:'  '},l).errors.name);assert(S.validate({...ok,name:'ا'},l).errors.name);assert(S.validate({...ok,name:'x'.repeat(61)},l).errors.name);
  assert(S.validate({...ok,name:'تركيب   باب'},l).errors.name);assert(S.validate({...ok,name:l[0].name},l,l[0].id).ok);
  assert(S.validate({...ok,category:'x'},l).errors.category);assert(S.validate({...ok,description:'x'.repeat(201)},l).errors.description);
  assert.strictEqual(S.validate({name:null,category:null,description:null},l).ok,false);
});
test('createService: immutable, draft, last order, trimmed; invalid throws with field errors',()=>{
  const l=S.buildFixtures(),n=S.createService(l,{...ok,name:'  خدمة   جديدة '});assert.strictEqual(l.length,20);assert.strictEqual(n.length,21);
  const c=n[20];assert.strictEqual(c.status,'draft');assert.strictEqual(c.order,21);assert.strictEqual(c.name,'خدمة جديدة');assert(!l.some(s=>s.id===c.id));
  try{S.createService(l,{...ok,name:''});assert.fail('x')}catch(e){assert(e instanceof RangeError);assert(e.errors.name)}
});
test('updateService: immutable, keeps status/order, rejects duplicates and unknown ids',()=>{
  const l=S.buildFixtures(),a=l[0],n=S.updateService(l,a.id,{...ok,name:'اسم معدل'});assert.strictEqual(l[0].name,a.name);
  const u=n.find(s=>s.id===a.id);assert.strictEqual(u.name,'اسم معدل');assert.strictEqual(u.status,a.status);assert.strictEqual(u.order,a.order);
  assert.throws(()=>S.updateService(l,a.id,{...ok,name:l[1].name}),RangeError);assert.throws(()=>S.updateService(l,'zz',ok),RangeError);
});
test('setStatus: draft→active, active⇄inactive only; immutable',()=>{
  assert.deepStrictEqual(S.allowedNext('draft'),['active']);assert.deepStrictEqual(S.allowedNext('active'),['inactive']);assert.deepStrictEqual(S.allowedNext('inactive'),['active']);assert.deepStrictEqual(S.allowedNext('x'),[]);
  const l=S.buildFixtures(),d=l.find(s=>s.status==='draft'),n=S.setStatus(l,d.id,'active');assert.strictEqual(l.find(s=>s.id===d.id).status,'draft');assert.strictEqual(n.find(s=>s.id===d.id).status,'active');
  assert.throws(()=>S.setStatus(l,d.id,'inactive'),RangeError);assert.throws(()=>S.setStatus(l,'zz','active'),RangeError);
});
test('move: swaps with neighbour, keeps orders contiguous, throws at the ends / unknown',()=>{
  const l=S.buildFixtures(),s=S.sorted(l),n=S.move(l,s[3].id,-1),r=S.sorted(n);
  assert.strictEqual(r[2].id,s[3].id);assert.strictEqual(r[3].id,s[2].id);assert.deepStrictEqual(r.map(x=>x.order),r.map((_,i)=>i+1));assert.strictEqual(l.find(x=>x.id===s[3].id).order,4);
  assert.throws(()=>S.move(l,s[0].id,-1),RangeError);assert.throws(()=>S.move(l,s[19].id,1),RangeError);assert.throws(()=>S.move(l,'zz',1),RangeError);
});
test('counts add up',()=>{const c=S.counts(S.buildFixtures());assert.strictEqual(c.active+c.draft+c.inactive,c.total);assert.strictEqual(c.categories,5)});
test('target is a known admin page and script order in admin index is correct',()=>{
  assert(shell._internals.findItem('services'));const h=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
  ['data-grid.js','dialogs.js','status-badge.js','admin-shell.js'].forEach(s=>assert(h.indexOf(s)>-1&&h.indexOf(s)<h.indexOf('services-management.page.js'),s));
});
console.log(`\n${passed} passed`);
