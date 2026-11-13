'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const B=require(path.join(root,'shared/components/status-badge.js'));
globalThis.HSStatusBadge=B;globalThis.HSDialog=require(path.join(root,'shared/components/dialogs.js'));
const W=require(path.join(root,'apps/admin/pages/workforce.page.js'));
const shell=require(path.join(root,'apps/admin/admin-shell.js'));
const F=()=>W.buildFixtures(),ok={name:'موظف جديد',email:'new@example.test',department:'ops',role:'support'};
test('registers the «employee» badge domain with every status',()=>{Object.keys(W.STATUS).forEach(k=>{assert(B.known('employee',k),k);assert.strictEqual(B.label('employee',k),W.STATUS[k].label)})});
test('fixtures: 12 unique ids/emails (all @example.test), valid dept/role, all 3 statuses, exactly one ACTIVE owner, log starts with creation',()=>{
  const f=F();assert.strictEqual(f.length,12);assert.strictEqual(new Set(f.map(e=>e.id)).size,12);assert.strictEqual(new Set(f.map(e=>e.email)).size,12);
  f.forEach(e=>{assert(/@example\.test$/.test(e.email));assert(W.DEPARTMENTS[e.department]);assert(W.ROLES[e.role]);assert.strictEqual(e.log[0].kind,'create')});
  assert.strictEqual(new Set(f.map(e=>e.status)).size,3);assert.strictEqual(f.filter(e=>e.role==='owner'&&e.status==='active').length,1);
});
test('validate: required, lengths, email format + uniqueness (case-insensitive), department/role from lists',()=>{
  const l=F();assert(W.validate(ok,l).ok);
  assert(W.validate({...ok,name:' '},l).errors.name);assert(W.validate({...ok,name:'ا'},l).errors.name);assert(W.validate({...ok,name:'x'.repeat(61)},l).errors.name);
  ['','abc','a@b','a b@c.de','@x.test'].forEach(x=>assert(W.validate({...ok,email:x},l).errors.email,x));
  assert(W.validate({...ok,email:l[0].email.toUpperCase()},l).errors.email);assert(W.validate({...ok,email:l[0].email},l,l[0].id).errors.email===undefined);
  assert(W.validate({...ok,department:'x'},l).errors.department);assert(W.validate({...ok,role:''},l).errors.role);assert.strictEqual(W.validate({name:null,email:null,department:null,role:null},l).ok,false);
  assert.strictEqual(W.validate({...ok,email:'  New@Example.TEST '},l).value.email,'new@example.test');
});
test('createEmployee: immutable, invited, creation log, trimmed; invalid throws with field errors',()=>{
  const l=F(),n=W.createEmployee(l,{...ok,name:'  موظف   جديد '},'2026-11-02T10:00:00Z');assert.strictEqual(l.length,12);assert.strictEqual(n.length,13);
  const c=n[12];assert.strictEqual(c.status,'invited');assert.strictEqual(c.name,'موظف جديد');assert.strictEqual(c.created,'2026-11-02');assert.strictEqual(c.log.length,1);assert(c.log[0].text.includes('لم تُرسل'));assert(!l.some(e=>e.id===c.id));
  try{W.createEmployee(l,{...ok,email:'bad'});assert.fail('x')}catch(e){assert(e instanceof RangeError&&e.errors.email)}
});
test('updateEmployee: immutable, logs only what changed, rejects no-op / duplicates / unknown ids',()=>{
  const l=F(),a=l[2],n=W.updateEmployee(l,a.id,{name:a.name,email:a.email,department:'ops',role:a.role},'2026-11-03');
  assert.strictEqual(l[2].department,a.department);const u=n[2];assert.strictEqual(u.department,'ops');assert.strictEqual(u.log.length,2);assert(u.log[1].text.includes('الإدارة'));assert(!u.log[1].text.includes('الدور'));
  assert.throws(()=>W.updateEmployee(l,a.id,{name:a.name,email:a.email,department:a.department,role:a.role}),/No change/);
  assert.throws(()=>W.updateEmployee(l,a.id,{...ok,email:l[3].email}),RangeError);assert.throws(()=>W.updateEmployee(l,'zz',ok),RangeError);
});
test('last ACTIVE owner: role cannot change and account cannot be disabled; allowed once another active owner exists',()=>{
  const l=F(),o=l.find(e=>e.role==='owner');assert(W.isLastActiveOwner(l,o.id));
  try{W.updateEmployee(l,o.id,{name:o.name,email:o.email,department:o.department,role:'admin'});assert.fail('x')}catch(e){assert(e.errors&&e.errors.role)}
  assert.throws(()=>W.setStatus(l,o.id,'disabled'),/Last owner/);
  const two=W.updateEmployee(l,l.find(e=>e.id!==o.id&&e.status==='active').id,{name:'x y',email:'o2@example.test',department:'exec',role:'owner'});
  assert(!W.isLastActiveOwner(two,o.id));assert.strictEqual(W.setStatus(two,o.id,'disabled').find(e=>e.id===o.id).status,'disabled');
});
test('setStatus: invited→active, active⇄disabled only; immutable; logs',()=>{
  assert.deepStrictEqual(W.allowedNext('invited'),['active']);assert.deepStrictEqual(W.allowedNext('active'),['disabled']);assert.deepStrictEqual(W.allowedNext('disabled'),['active']);assert.deepStrictEqual(W.allowedNext('x'),[]);
  const l=F(),i=l.find(e=>e.status==='invited'),n=W.setStatus(l,i.id,'active','2026-11-04');assert.strictEqual(l.find(e=>e.id===i.id).status,'invited');const u=n.find(e=>e.id===i.id);assert.strictEqual(u.status,'active');assert.strictEqual(u.log[u.log.length-1].kind,'status');
  assert.throws(()=>W.setStatus(l,i.id,'disabled'),RangeError);assert.throws(()=>W.setStatus(l,'zz','active'),RangeError);
});
test('resendInvite: only for invited, logs a simulated entry, immutable',()=>{
  const l=F(),i=l.find(e=>e.status==='invited'),a=l.find(e=>e.status==='active'),n=W.resendInvite(l,i.id);
  assert.strictEqual(l.find(e=>e.id===i.id).log.length,1);assert.strictEqual(n.find(e=>e.id===i.id).log.length,2);assert(n.find(e=>e.id===i.id).log[1].text.includes('لم تُرسل'));
  assert.throws(()=>W.resendInvite(l,a.id),/Not invited/);assert.throws(()=>W.resendInvite(l,'zz'),RangeError);
});
test('counts add up',()=>{const c=W.counts(F());assert.strictEqual(c.active+c.invited+c.disabled,c.total);assert.strictEqual(c.total,12);assert.strictEqual(c.departments,5)});
test('module exposes no real send/permission API',()=>{['send','sendInvite','grant','revoke','authorize'].forEach(k=>assert.strictEqual(W[k],undefined,k))});
test('target is a known admin page; script order is correct',()=>{
  assert(shell._internals.findItem('workforce'));const h=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
  ['data-grid.js','dialogs.js','status-badge.js','admin-shell.js'].forEach(s=>assert(h.indexOf(s)>-1&&h.indexOf(s)<h.indexOf('workforce.page.js'),s));
});
console.log(`\n${passed} passed`);
