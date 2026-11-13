'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const B=require(path.join(root,'shared/components/status-badge.js'));
globalThis.HSStatusBadge=B;globalThis.HSDialog=require(path.join(root,'shared/components/dialogs.js'));
const C=require(path.join(root,'apps/admin/pages/categories-management.page.js'));
const shell=require(path.join(root,'apps/admin/admin-shell.js'));
const F=()=>C.buildFixtures();
test('registers the «category» badge domain with every status',()=>{Object.keys(C.STATUS).forEach(k=>{assert(B.known('category',k),k);assert.strictEqual(B.label('category',k),C.STATUS[k].label)})});
test('fixtures: unique ids, valid parents, no cycles, depth ≤ max, contiguous sibling orders, both statuses',()=>{
  const f=F();assert.strictEqual(new Set(f.map(c=>c.id)).size,f.length);
  f.forEach(c=>{if(c.parentId)assert(f.some(x=>x.id===c.parentId));assert(C.depthOf(f,c.id)<=C.MAX_DEPTH)});
  [null,...f.map(c=>c.id)].forEach(p=>{const s=C.siblings(f,p);assert.deepStrictEqual(s.map(c=>c.order),s.map((_,i)=>i+1))});
  assert.strictEqual(new Set(f.map(c=>c.status)).size,2);assert.strictEqual(C.flatten(f).length,f.length);
});
test('descendantIds / depthOf / height',()=>{
  const f=F();assert.deepStrictEqual(C.descendantIds(f,'k1').sort(),['k2','k3','k4']);assert.strictEqual(C.depthOf(f,'k3'),3);assert.strictEqual(C.height(f,'k1'),3);assert.strictEqual(C.height(f,'k8'),1);
});
test('validParents never offers itself, its descendants (cycle) or a parent that exceeds the depth limit',()=>{
  const f=F(),ids=(id)=>C.validParents(f,id).map(c=>c.id);
  const a=ids('k1');['k1','k2','k3','k4'].forEach(x=>assert(!a.includes(x)));assert.deepStrictEqual(a,[]);   // height 3: any parent would exceed the depth limit
  const b=ids('k5');assert(!b.includes('k2')&&!b.includes('k3'));   // k5 has height 2: under a level-2 node would be level 4... k2 depth2+2>3
  assert(!ids('k8').includes('k3'));assert(ids('k8').includes('k2'));  // height 1 fits under depth-2 node
  assert(!C.validParents(f,null).some(c=>c.id==='k3'));assert(C.validParents(f,null).some(c=>c.id==='k2'));
});
test('validate: name rules, unique among siblings only, cyclic/too-deep parent rejected',()=>{
  const f=F();assert(C.validate({name:'جديد',parentId:null},f).ok);
  assert(C.validate({name:' ',parentId:null},f).errors.name);assert(C.validate({name:'ا',parentId:null},f).errors.name);assert(C.validate({name:'x'.repeat(51),parentId:null},f).errors.name);
  assert(C.validate({name:'كهرباء',parentId:null},f).errors.name);assert(C.validate({name:'كهرباء',parentId:null},f,'k1').ok);assert(C.validate({name:'صيانة',parentId:'k1'},f).ok);
  assert(C.validate({name:'x1',parentId:'k3'},f).errors.parentId);assert(C.validate({name:'k1',parentId:'k2'},f,'k1').errors.parentId);assert(C.validate({name:'x',parentId:'zz'},f).errors.parentId);
});
test('createCategory: immutable, active, last among siblings, trimmed; invalid throws with field errors',()=>{
  const f=F(),n=C.createCategory(f,{name:'  تصنيف   جديد ',parentId:'k1'});assert.strictEqual(f.length,14);assert.strictEqual(n.length,15);
  const c=n[14];assert.strictEqual(c.status,'active');assert.strictEqual(c.order,3);assert.strictEqual(c.name,'تصنيف جديد');assert.strictEqual(c.services,0);
  try{C.createCategory(f,{name:'',parentId:null});assert.fail('x')}catch(e){assert(e instanceof RangeError&&e.errors.name)}
});
test('updateCategory: rename keeps place; moving re-parents to the end and renumbers the old siblings; cycle rejected',()=>{
  const f=F(),r=C.updateCategory(f,'k4',{name:'تمديدات جديدة',parentId:'k1'});assert.strictEqual(r.find(c=>c.id==='k4').order,2);assert.strictEqual(f.find(c=>c.id==='k4').name,'تمديدات');
  const m=C.updateCategory(f,'k2',{name:'إنارة',parentId:'k9'});assert.strictEqual(m.find(c=>c.id==='k2').parentId,'k9');assert.strictEqual(m.find(c=>c.id==='k2').order,3);
  assert.deepStrictEqual(C.siblings(m,'k1').map(c=>[c.id,c.order]),[['k4',1]]);
  assert.throws(()=>C.updateCategory(f,'k1',{name:'كهرباء',parentId:'k3'}),RangeError);assert.throws(()=>C.updateCategory(f,'k1',{name:'كهرباء',parentId:'k1'}),RangeError);assert.throws(()=>C.updateCategory(f,'zz',{name:'x',parentId:null}),RangeError);
});
test('setStatus: active⇄inactive only; immutable; unknown rejected',()=>{
  assert.deepStrictEqual(C.allowedNext('active'),['inactive']);assert.deepStrictEqual(C.allowedNext('inactive'),['active']);assert.deepStrictEqual(C.allowedNext('x'),[]);
  const f=F(),n=C.setStatus(f,'k1','inactive');assert.strictEqual(f[0].status,'active');assert.strictEqual(n[0].status,'inactive');assert.throws(()=>C.setStatus(f,'k1','active'),RangeError);assert.throws(()=>C.setStatus(f,'zz','active'),RangeError);
});
test('move: swaps with sibling only (never across parents); throws at the ends / unknown',()=>{
  const f=F(),n=C.move(f,'k4',-1);assert.deepStrictEqual(C.siblings(n,'k1').map(c=>c.id),['k4','k2']);assert.strictEqual(f.find(c=>c.id==='k4').order,2);
  assert.throws(()=>C.move(f,'k2',-1),RangeError);assert.throws(()=>C.move(f,'k4',1),RangeError);assert.throws(()=>C.move(f,'k3',1),RangeError);assert.throws(()=>C.move(f,'zz',1),RangeError);
});
test('counts add up',()=>{const c=C.counts(F());assert.strictEqual(c.active+c.inactive,c.total);assert.strictEqual(c.total,14);assert.strictEqual(c.roots,5);assert.strictEqual(c.depth,3)});
test('target is a known admin page; script order and tree styles are in place',()=>{
  assert(shell._internals.findItem('categories'));const h=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
  ['dialogs.js','status-badge.js','admin-shell.js'].forEach(s=>assert(h.indexOf(s)>-1&&h.indexOf(s)<h.indexOf('categories-management.page.js'),s));
  assert(fs.readFileSync(path.join(root,'apps/admin/styles/admin-components.css'),'utf8').includes('.cat-row'));
});
console.log(`\n${passed} passed`);
