'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
globalThis.HSStatusBadge=require(path.join(root,'shared/components/status-badge.js'));globalThis.HSDialog=require(path.join(root,'shared/components/dialogs.js'));
const R=require(path.join(root,'apps/admin/rbac-store.js'));
const Roles=require(path.join(root,'apps/admin/pages/roles.page.js'));
const Perm=require(path.join(root,'apps/admin/pages/permissions.page.js'));
const Emp=require(path.join(root,'apps/admin/pages/employee-details.page.js'));
const shell=require(path.join(root,'apps/admin/admin-shell.js'));
const html=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
test('roles page rows: one row per role with type, inheritance name, employee count and effective permission count',()=>{
  R.reset();const rows=Roles.rows();assert.strictEqual(rows.length,8,'5 original + ops / content / tech presets');const m=rows.find(r=>r.id==='moderator');assert.strictEqual(m.inheritsName,'دعم فني');assert.strictEqual(m.typeName,'مخصص');assert.strictEqual(m.employees,2);assert.strictEqual(m.perms,R.effective(R.state.roles,'moderator').length);
  const o=rows.find(r=>r.id==='owner');assert.strictEqual(o.typeName,'نظام');assert.strictEqual(o.perms,72,'18 modules x 4 actions');assert.strictEqual(rows.reduce((a,r)=>a+r.employees,0),12);assert.strictEqual(rows.find(r=>r.id==='support').inheritsName,'بدون');
});
test('permissions matrix: one row per module, one column per role, modules/actions labels present, owner column lists all four actions',()=>{
  R.reset();const h=Perm.matrixHtml();assert.strictEqual((h.match(/<tr>/g)||[]).length,1+Object.keys(R.MODULES).length);assert.strictEqual((h.match(/scope="col"/g)||[]).length,1+R.state.roles.length);
  Object.values(R.MODULES).forEach(l=>assert(h.includes(l),l));assert(h.includes('عرض، إضافة، تعديل، قرار/تغيير حالة'));assert(h.includes('scope="row"'));assert(h.includes('<caption>'));
});
test('permissions matrix reflects role edits made through the shared store (single source of truth)',()=>{
  R.reset();const before=Perm.matrixHtml();R.state.roles=R.updateRole(R.state.roles,'owner','support',{name:'دعم فني',description:'',inherits:null,permissions:R.roleById(R.state.roles,'support').permissions.concat(['services.view'])});
  assert.notStrictEqual(Perm.matrixHtml(),before);R.reset();assert.strictEqual(Perm.matrixHtml(),before);
});
test('employee-details parseId: only #/employee-details/<id> yields an id',()=>{
  assert.strictEqual(Emp.parseId('#/employee-details/e9002'),'e9002');assert.strictEqual(Emp.parseId('#employee-details/e9002'),'e9002');assert.strictEqual(Emp.parseId('#/employee-details/e9002/'),'e9002');
  ['#/employee-details','#/workforce/e9002','#/employee-details/<x>','',null,undefined,'#/employee-details/a b'].forEach(x=>assert.strictEqual(Emp.parseId(x),null,String(x)));
});
test('all three pages are registered admin pages (employee-details as a hidden child of workforce) and shell routing accepts the id suffix',()=>{
  assert(shell._internals.findItem('roles'));assert(shell._internals.findItem('permissions'));assert.strictEqual(shell._internals.HIDDEN_PAGES['employee-details'].parent,'workforce');
  assert.strictEqual(shell._internals.parseHash('#/employee-details/e9002'),'employee-details');
});
test('script order: shell + store + tree-free pages; store loads before every page that uses it',()=>{
  ['rbac-store.js'].forEach(s=>['roles.page.js','permissions.page.js','employee-details.page.js'].forEach(p=>assert(html.indexOf(s)>-1&&html.indexOf(s)<html.indexOf(p),s+' before '+p)));
  ['data-grid.js','dialogs.js','status-badge.js'].forEach(s=>assert(html.indexOf(s)<html.indexOf('roles.page.js'),s));
});
test('styles used by the pages exist (rl-fs, rl-chk, rl-table, rl-scroll)',()=>{const css=fs.readFileSync(path.join(root,'apps/admin/styles/admin-components.css'),'utf8');['.rl-fs','.rl-chk','.rl-table','.rl-scroll'].forEach(c=>assert(css.includes(c),c))});
test('pages expose no enforcement API',()=>{[Roles,Perm,Emp].forEach(m=>['enforce','authorize','can','grant','revoke'].forEach(k=>assert.strictEqual(m[k],undefined,k)))});
console.log(`\n${passed} passed`);
