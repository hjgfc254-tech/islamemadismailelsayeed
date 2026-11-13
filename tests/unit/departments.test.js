'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const B=require(path.join(root,'shared/components/status-badge.js'));
globalThis.HSStatusBadge=B;globalThis.HSDialog=require(path.join(root,'shared/components/dialogs.js'));globalThis.HSTree=require(path.join(root,'shared/utils/tree.js'));
const D=require(path.join(root,'apps/admin/pages/departments.page.js'));
const W=require(path.join(root,'apps/admin/pages/workforce.page.js'));
const shell=require(path.join(root,'apps/admin/admin-shell.js'));
const F=()=>D.buildFixtures(),R=D.ROSTER;
test('registers the «department» badge domain with every status',()=>{Object.keys(D.STATUS).forEach(k=>{assert(B.known('department',k),k);assert.strictEqual(B.label('department',k),D.STATUS[k].label)})});
test('fixtures: unique ids, valid parents, depth ≤ max, contiguous sibling orders, heads are ACTIVE members of their own department, both statuses',()=>{
  const f=F();assert.strictEqual(new Set(f.map(d=>d.id)).size,f.length);
  f.forEach(d=>{if(d.parentId)assert(f.some(x=>x.id===d.parentId));assert(HSTree.depthOf(f,d.id)<=D.MAX_DEPTH);if(d.headId)assert(D.activeMembers(R,d.id).some(e=>e.id===d.headId),d.id)});
  [null,...f.map(d=>d.id)].forEach(p=>{const s=HSTree.siblings(f,p);assert.deepStrictEqual(s.map(d=>d.order),s.map((_,i)=>i+1))});
  assert.strictEqual(new Set(f.map(d=>d.status)).size,2);
});
test('roster copy matches the workforce page fixtures (names, departments, statuses) so the two demos agree',()=>{
  const w=W.buildFixtures();assert.strictEqual(R.length,w.length);
  R.forEach((e,i)=>{assert.strictEqual(e.id,w[i].id);assert.strictEqual(e.name,w[i].name);assert.strictEqual(e.department,w[i].department);assert.strictEqual(e.status,w[i].status)});
  assert(F().filter(d=>!d.parentId).every(d=>W.DEPARTMENTS[d.id]===d.name));
});
test('members / activeMembers / headName',()=>{
  assert.strictEqual(D.members(R,'support').length,3);assert.strictEqual(D.activeMembers(R,'support').length,1);assert.strictEqual(D.headName(F(),R,'ops'),'ريم حامد');assert.strictEqual(D.headName(F(),R,'ops-field'),null);assert.strictEqual(D.headName(F(),R,'zz'),null);
});
test('validate: name rules, unique among siblings only, parent must not cycle or exceed depth, head must be an active member of that department',()=>{
  const f=F(),ok={name:'جديدة',parentId:null,headId:null};assert(D.validate(ok,f,R).ok);
  assert(D.validate({...ok,name:' '},f,R).errors.name);assert(D.validate({...ok,name:'ا'},f,R).errors.name);assert(D.validate({...ok,name:'x'.repeat(51)},f,R).errors.name);
  assert(D.validate({...ok,name:'العمليات'},f,R).errors.name);assert(D.validate({...ok,name:'العمليات'},f,R,'ops').ok);assert(D.validate({...ok,name:'العمليات',parentId:'finance'},f,R).ok);
  assert(D.validate({...ok,parentId:'ops-field-n'},f,R).errors.parentId);                 // would be level 4
  assert(D.validate({...ok,name:'العمليات',parentId:'ops-field'},f,R,'ops').errors.parentId);   // cycle: under its own child
  assert(D.validate({...ok,parentId:'zz'},f,R).errors.parentId);
  assert(D.validate({name:'العمليات',parentId:null,headId:'e9002'},f,R,'ops').ok);
  assert(D.validate({name:'العمليات',parentId:null,headId:'e9003'},f,R,'ops').errors.headId);   // other department
  assert(D.validate({name:'الدعم',parentId:null,headId:'e9006'},f,R,'support').errors.headId);  // invited, not active
  assert(D.validate({...ok,headId:'e9002'},f,R).errors.headId);                                  // new department has no members
  assert.strictEqual(D.validate({name:null,parentId:null,headId:null},f,R).ok,false);
});
test('createDepartment: immutable, active, no head, last among siblings, trimmed; invalid throws with field errors',()=>{
  const f=F(),n=D.createDepartment(f,R,{name:'  إدارة   جديدة ',parentId:'ops'});assert.strictEqual(f.length,9);assert.strictEqual(n.length,10);
  const c=n[9];assert.strictEqual(c.status,'active');assert.strictEqual(c.headId,null);assert.strictEqual(c.order,2);assert.strictEqual(c.name,'إدارة جديدة');assert(/^d\d+$/.test(c.id));assert(!f.some(d=>d.id===c.id));
  const n2=D.createDepartment(n,R,{name:'أخرى',parentId:null});assert.notStrictEqual(n2[10].id,c.id);
  try{D.createDepartment(f,R,{name:'',parentId:null});assert.fail('x')}catch(e){assert(e instanceof RangeError&&e.errors.name)}
});
test('updateDepartment: rename keeps place; assigning a valid head works; re-parenting goes last and renumbers the old siblings; cycles rejected',()=>{
  const f=F(),r=D.updateDepartment(f,R,'support',{name:'الدعم الفني',parentId:null,headId:'e9003'});assert.strictEqual(f.find(d=>d.id==='support').name,'الدعم');assert.strictEqual(r.find(d=>d.id==='support').order,3);
  const h=D.updateDepartment(f,R,'ops',{name:'العمليات',parentId:null,headId:null});assert.strictEqual(h.find(d=>d.id==='ops').headId,null);
  const m=D.updateDepartment(f,R,'ops-field',{name:'العمليات الميدانية',parentId:'support',headId:null});assert.strictEqual(m.find(d=>d.id==='ops-field').parentId,'support');assert.strictEqual(m.find(d=>d.id==='ops-field').order,2);
  assert.deepStrictEqual(HSTree.siblings(m,'ops').map(d=>d.order),[]);
  assert.throws(()=>D.updateDepartment(f,R,'ops',{name:'العمليات',parentId:'ops-field-n',headId:null}),RangeError);assert.throws(()=>D.updateDepartment(f,R,'zz',{name:'x',parentId:null,headId:null}),RangeError);
});
test('setStatus: active⇄inactive; cannot deactivate with an ACTIVE sub-department; cannot activate under an inactive parent; immutable',()=>{
  assert.deepStrictEqual(D.allowedNext('active'),['inactive']);assert.deepStrictEqual(D.allowedNext('inactive'),['active']);assert.deepStrictEqual(D.allowedNext('x'),[]);
  const f=F();assert.throws(()=>D.setStatus(f,'ops','inactive'),/Active children/);
  const a=D.setStatus(f,'ops-field-n','inactive'),b=D.setStatus(a,'ops-field','inactive'),c=D.setStatus(b,'ops','inactive');assert.strictEqual(f.find(d=>d.id==='ops').status,'active');assert.strictEqual(c.find(d=>d.id==='ops').status,'inactive');
  assert.throws(()=>D.setStatus(c,'ops-field','active'),/Parent inactive/);assert.strictEqual(D.setStatus(c,'ops','active').find(d=>d.id==='ops').status,'active');
  assert.throws(()=>D.setStatus(f,'ops','active'),RangeError);assert.throws(()=>D.setStatus(f,'zz','active'),RangeError);
  assert.strictEqual(D.setStatus(f,'support-l2','active').find(d=>d.id==='support-l2').status,'active');   // parent «الدعم» is active
});
test('counts: noHead counts only ACTIVE departments without a head',()=>{
  const c=D.counts(F(),R);assert.strictEqual(c.total,9);assert.strictEqual(c.employees,12);assert.strictEqual(c.depth,3);
  assert.strictEqual(c.noHead,F().filter(d=>d.status==='active'&&!d.headId).length);assert(c.noHead>0);
});
test('target is a known admin page; shared tree util loads before the page',()=>{
  assert(shell._internals.findItem('departments'));const h=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
  ['status-badge.js','dialogs.js','tree.js','admin-shell.js'].forEach(s=>assert(h.indexOf(s)>-1&&h.indexOf(s)<h.indexOf('departments.page.js'),s));
});
console.log(`\n${passed} passed`);
