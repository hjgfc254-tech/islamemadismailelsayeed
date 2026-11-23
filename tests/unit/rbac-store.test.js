'use strict';
const path=require('path'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const R=require(path.join(root,'apps/admin/rbac-store.js'));
globalThis.HSStatusBadge=require(path.join(root,'shared/components/status-badge.js'));globalThis.HSDialog=require(path.join(root,'shared/components/dialogs.js'));
const W=require(path.join(root,'apps/admin/pages/workforce.page.js'));
const F=()=>({roles:R.buildRoles(),roster:R.buildRoster()});
const ok={name:'دور جديد',description:'',inherits:null,permissions:['orders.view']};
test('catalog: 18 modules × 4 actions = 72 unique known keys (6 modules added with the teams release: finance, marketing, pii, tech, alerts, tickets); keyLabel readable',()=>{assert.strictEqual(R.ALL_KEYS.length,72);assert.strictEqual(new Set(R.ALL_KEYS).size,72);assert(R.isKey('orders.view'));assert(!R.isKey('orders.fly'));assert.strictEqual(R.keyLabel('orders.view'),'الطلبات — عرض')});
test('roles fixtures: owner is a system role with everything; every direct key is known; inheritance targets exist; no cycles',()=>{
  const {roles}=F();assert.strictEqual(roles.length,8,'5 original roles + ops / content / tech presets');assert.deepStrictEqual(R.effective(roles,'owner'),R.ALL_KEYS);assert(roles.find(r=>r.id==='owner').system);
  roles.forEach(r=>{r.permissions.forEach(k=>assert(R.isKey(k),k));if(r.inherits)assert(R.roleById(roles,r.inherits));assert(R.chain(roles,r.id).length<=roles.length)});
});
test('role ids/names match the workforce page ROLES and the roster matches the workforce fixtures (so the demos agree)',()=>{
  const {roles,roster}=F();assert.deepStrictEqual(roles.map(r=>r.id).sort(),Object.keys(W.ROLES).sort());roles.forEach(r=>assert.strictEqual(r.name,W.ROLES[r.id]));
  const w=W.buildFixtures();assert.strictEqual(roster.length,w.length);roster.forEach((e,i)=>{['id','name','email','department','role','status'].forEach(k=>assert.strictEqual(e[k],w[i][k],k+' '+i))});
  assert.deepStrictEqual(R.DEPARTMENTS,W.DEPARTMENTS);
});
test('effective / inherited: moderator = support ∪ own; inherited excludes own-only keys',()=>{
  const {roles}=F(),mod=R.effective(roles,'moderator'),sup=R.effective(roles,'support');sup.forEach(k=>assert(mod.includes(k)));assert(mod.includes('reviews.decide'));assert(!sup.includes('reviews.decide'));
  assert.deepStrictEqual(R.inherited(roles,'moderator'),sup);assert.deepStrictEqual(R.inherited(roles,'support'),[]);assert.deepStrictEqual(R.effective(roles,'zz'),[]);
});
test('descendants / validParents: no cycles (a role can never inherit from itself or its own descendants)',()=>{
  const {roles}=F();assert.deepStrictEqual(R.descendants(roles,'support'),['moderator']);assert.deepStrictEqual(R.descendants(roles,'moderator'),[]);
  const vp=(id)=>R.validParents(roles,id).map(r=>r.id);assert(!vp('support').includes('support'));assert(!vp('support').includes('moderator'));assert(vp('support').includes('admin'));assert(vp('moderator').includes('support'));assert(!vp('moderator').includes('moderator'));assert.strictEqual(vp(null).length,8);
  const bad=[{id:'x',inherits:'y',permissions:[]},{id:'y',inherits:'x',permissions:[]}];assert(Array.isArray(R.effective(bad,'x')));assert(Array.isArray(R.descendants(bad,'x')));   // corrupt data must not hang
});
test('validateRole: name rules, unique name, description cap, inherit cycle, unknown permission',()=>{
  const {roles}=F();assert(R.validateRole(ok,roles).ok);
  assert(R.validateRole({...ok,name:' '},roles).errors.name);assert(R.validateRole({...ok,name:'ا'},roles).errors.name);assert(R.validateRole({...ok,name:'x'.repeat(41)},roles).errors.name);
  assert(R.validateRole({...ok,name:'مدير'},roles).errors.name);assert(R.validateRole({...ok,name:'مدير'},roles,'admin').ok);assert(R.validateRole({...ok,description:'x'.repeat(121)},roles).errors.description);
  assert(R.validateRole({...ok,name:'دعم فني',inherits:'moderator'},roles,'support').errors.inherits);assert(R.validateRole({...ok,inherits:'zz'},roles).errors.inherits);assert(R.validateRole({...ok,permissions:['a.b']},roles).errors.permissions);
  assert.strictEqual(R.validateRole({name:null,description:null,inherits:null,permissions:null},roles).ok,false);
});
test('grantViolations: only keys the acting role does not itself hold',()=>{
  const {roles}=F();assert.deepStrictEqual(R.grantViolations(roles,'owner',R.ALL_KEYS),[]);assert.deepStrictEqual(R.grantViolations(roles,'admin',['orders.view']),[]);
  assert.deepStrictEqual(R.grantViolations(roles,'admin',['roles.edit','orders.view']),['roles.edit']);assert.strictEqual(R.grantViolations(roles,'zz',['orders.view']).length,1);
});
test('impact: lists added/removed for the role AND roles inheriting from it, with employee counts; new role has none',()=>{
  const {roles,roster}=F(),sup=R.roleById(roles,'support');
  const none=R.impact(roles,roster,'support',{name:sup.name,description:sup.description,inherits:null,permissions:sup.permissions});assert.strictEqual(none.changed,false);assert.strictEqual(none.added+none.removed,0);
  const add=R.impact(roles,roster,'support',{name:sup.name,description:'',inherits:null,permissions:sup.permissions.concat(['services.edit'])});
  assert.deepStrictEqual(add.perRole.map(r=>r.id),['support','moderator']);assert(add.perRole.every(r=>r.added.includes('services.edit')&&r.removed.length===0));assert.strictEqual(add.employees,R.roleEmployees(roster,'support').length+R.roleEmployees(roster,'moderator').length);assert.strictEqual(add.added,2);
  const rem=R.impact(roles,roster,'support',{name:sup.name,description:'',inherits:null,permissions:sup.permissions.filter(k=>k!=='complaints.decide')});assert(rem.perRole.every(r=>r.removed.includes('complaints.decide')));
  const nw=R.impact(roles,roster,null,{...ok,permissions:['orders.view','orders.edit']});assert.strictEqual(nw.perRole.length,1);assert.strictEqual(nw.employees,0);assert.strictEqual(nw.added,2);
  assert.strictEqual(JSON.stringify(roles),JSON.stringify(R.buildRoles()));   // input untouched
});
test('createRole: immutable, new id, authority guard (admin cannot create a role holding roles.edit; owner can)',()=>{
  const {roles}=F(),n=R.createRole(roles,'admin',{...ok,permissions:['orders.view','orders.edit']});assert.strictEqual(roles.length,8);assert.strictEqual(n.length,9);assert(/^r\d+$/.test(n[8].id));assert(!n[8].system);
  try{R.createRole(roles,'admin',{...ok,permissions:['roles.edit']});assert.fail('x')}catch(e){assert(e instanceof RangeError&&e.errors.permissions&&/خارج سلطتك/.test(e.errors.permissions))}
  assert.strictEqual(R.createRole(roles,'owner',{...ok,permissions:['roles.edit']}).length,9);
  try{R.createRole(roles,'admin',{...ok,inherits:'owner',permissions:[]});assert.fail('x')}catch(e){assert(e.errors.permissions)}   // inheriting from owner would grant everything
  try{R.createRole(roles,'admin',{...ok,name:''});assert.fail('x')}catch(e){assert(e.errors.name)}
  const two=R.createRole(n,'admin',{...ok,name:'ثاني'});assert.notStrictEqual(two[9].id,n[8].id);
});
test('updateRole: system role locked; only NEW grants outside the actor\'s authority are blocked; removals and own-held grants are fine; cycles rejected',()=>{
  const {roles}=F(),sup=R.roleById(roles,'support');
  assert.throws(()=>R.updateRole(roles,'owner','owner',{...ok,name:'المالك'}),/System role/);assert.throws(()=>R.updateRole(roles,'admin','zz',ok),RangeError);
  const base={name:sup.name,description:sup.description,inherits:null};
  const good=R.updateRole(roles,'admin','support',{...base,permissions:sup.permissions.concat(['services.view'])});assert(R.effective(good,'support').includes('services.view'));assert(!R.roleById(roles,'support').permissions.includes('services.view'));
  assert.throws(()=>R.updateRole(roles,'admin','support',{...base,permissions:sup.permissions.concat(['roles.edit'])}),/Exceeds authority/);
  assert.strictEqual(R.updateRole(roles,'owner','support',{...base,permissions:sup.permissions.concat(['roles.edit'])}).length,8);
  assert.doesNotThrow(()=>R.updateRole(roles,'admin','support',{...base,permissions:[]}));   // removals are allowed
  assert.throws(()=>R.updateRole(roles,'admin','support',{...base,inherits:'moderator',permissions:sup.permissions}),RangeError);
});
test('employeeEffective / setOverrides: extra permissions, authority guard, no redundant grants, no-op rejected, immutable',()=>{
  const {roles,roster}=F(),emp=roster.find(e=>e.role==='finance'&&e.status==='active');
  const o1=R.setOverrides(roles,{},roster,'admin',emp.id,['services.edit']);assert.deepStrictEqual(o1[emp.id],['services.edit']);assert(R.employeeEffective(roles,o1,emp).includes('services.edit'));assert(!R.employeeEffective(roles,{},emp).includes('services.edit'));
  assert.throws(()=>R.setOverrides(roles,{},roster,'admin',emp.id,['roles.edit']),/Exceeds authority/);assert.throws(()=>R.setOverrides(roles,{},roster,'admin',emp.id,['orders.view']),/Redundant/);
  assert.throws(()=>R.setOverrides(roles,o1,roster,'admin',emp.id,['services.edit']),/No change/);assert.throws(()=>R.setOverrides(roles,{},roster,'admin','zz',['services.edit']),RangeError);assert.throws(()=>R.setOverrides(roles,{},roster,'admin',emp.id,['x.y']),/Invalid keys/);
  assert.deepStrictEqual(R.setOverrides(roles,o1,roster,'admin',emp.id,[])[emp.id],[]);   // removing is allowed
  assert.deepStrictEqual(R.setOverrides(roles,o1,roster,'support',emp.id,[])[emp.id],[]); // …even for an actor who could not grant it
});
test('changeEmployee: guards (target above authority, role above authority, last active owner), no-op, invalid, immutable',()=>{
  const {roles,roster}=F(),sup=roster.find(e=>e.role==='support'&&e.status==='active'),own=roster.find(e=>e.role==='owner');
  const n=R.changeEmployee(roles,roster,'admin',sup.id,{role:'finance',department:sup.department});assert.strictEqual(roster.find(e=>e.id===sup.id).role,'support');assert.strictEqual(n.find(e=>e.id===sup.id).role,'finance');
  assert.throws(()=>R.changeEmployee(roles,roster,'admin',sup.id,{role:'owner',department:sup.department}),/Exceeds authority/);
  assert.throws(()=>R.changeEmployee(roles,roster,'admin',own.id,{role:'admin',department:own.department}),/Target above authority/);
  assert.throws(()=>R.changeEmployee(roles,roster,'owner',own.id,{role:'admin',department:own.department}),/Last owner/);
  assert.strictEqual(R.changeEmployee(roles,roster,'owner',own.id,{role:'owner',department:'ops'}).find(e=>e.id===own.id).department,'ops');   // department change alone is fine
  assert.throws(()=>R.changeEmployee(roles,roster,'admin',sup.id,{role:sup.role,department:sup.department}),/No change/);assert.throws(()=>R.changeEmployee(roles,roster,'admin',sup.id,{role:'zz',department:'ops'}),RangeError);assert.throws(()=>R.changeEmployee(roles,roster,'admin','zz',{role:'finance',department:'ops'}),RangeError);
});
test('isLastActiveOwner / state / audit / reset',()=>{
  const {roster}=F();assert(R.isLastActiveOwner(roster,'e9001'));assert(!R.isLastActiveOwner(roster,'e9002'));
  R.reset();assert.strictEqual(R.state.actor,'admin');R.addAudit('role:support','تجربة','2026-11-01');R.state.actor='owner';R.addAudit('emp:e9001','أخرى','2026-11-02');
  assert.strictEqual(R.auditFor('role:support').length,1);assert.strictEqual(R.auditFor('role:support')[0].actor,'admin');assert.strictEqual(R.auditFor('emp:e9001')[0].actor,'owner');R.reset();assert.strictEqual(R.state.audit.length,0);assert.strictEqual(R.state.actor,'admin');
});
test('no real enforcement / send API is exposed',()=>{['enforce','authorize','can','check','grant','revoke','login'].forEach(k=>assert.strictEqual(R[k],undefined,k))});
console.log(`\n${passed} passed`);
