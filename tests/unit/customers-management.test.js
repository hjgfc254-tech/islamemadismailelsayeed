'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const B=require(path.join(root,'shared/components/status-badge.js'));
globalThis.HSStatusBadge=B;
const C=require(path.join(root,'apps/admin/pages/customers-management.page.js'));
const shell=require(path.join(root,'apps/admin/admin-shell.js'));
test('registers the «customer» badge domain with every status',()=>{Object.keys(C.STATUS).forEach(k=>{assert(B.known('customer',k),k);assert.strictEqual(B.label('customer',k),C.STATUS[k].label)})});
test('fixtures: unique ids, fake phones, all statuses present, inactive customers have ≤1 order',()=>{
  const f=C.buildFixtures();assert.strictEqual(new Set(f.map(c=>c.id)).size,f.length);
  f.forEach(c=>{assert(/^0100000\d{4}$/.test(c.phone));if(c.status==='inactive')assert(c.orders<=1)});
  assert.strictEqual(new Set(f.map(c=>c.status)).size,3);
});
test('allowedNext: suspend/reactivate only; unknown → none',()=>{
  assert.deepStrictEqual(C.allowedNext('active'),['suspended']);assert.deepStrictEqual(C.allowedNext('inactive'),['suspended']);
  assert.deepStrictEqual(C.allowedNext('suspended'),['active']);assert.deepStrictEqual(C.allowedNext('x'),[]);
});
test('setStatus is immutable and rejects invalid moves',()=>{
  const l=C.buildFixtures();const a=l.find(c=>c.status==='active');const n=C.setStatus(l,a.id,'suspended');
  assert.strictEqual(l.find(c=>c.id===a.id).status,'active');assert.strictEqual(n.find(c=>c.id===a.id).status,'suspended');
  assert.throws(()=>C.setStatus(l,a.id,'active'),RangeError);assert.throws(()=>C.setStatus(l,'zz','suspended'),RangeError);
});
test('addNote trims, caps at 500, rejects empty',()=>{
  const l=C.buildFixtures();assert.throws(()=>C.addNote(l,l[0].id,' '),RangeError);
  assert.strictEqual(C.addNote(l,l[0].id,' a ').find(c=>c.id===l[0].id).notes[0].text,'a');
  assert.strictEqual(C.addNote(l,l[0].id,'x'.repeat(800)).find(c=>c.id===l[0].id).notes[0].text.length,500);
});
test('counts add up',()=>{const c=C.counts(C.buildFixtures());assert.strictEqual(c.active+c.inactive+c.suspended,c.total);assert.strictEqual(c.total,24)});
test('target is a known admin page and script order in admin index is correct',()=>{
  assert(shell._internals.findItem('customers'));
  const h=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
  assert(h.indexOf('data-grid.js')<h.indexOf('customers-management.page.js'));assert(h.indexOf('admin-shell.js')<h.indexOf('customers-management.page.js'));
});
console.log(`\n${passed} passed`);
