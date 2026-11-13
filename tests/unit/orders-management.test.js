'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const O=require(path.join(root,'apps/admin/pages/orders-management.page.js'));
const B=require(path.join(root,'shared/components/status-badge.js'));
const shell=require(path.join(root,'apps/admin/admin-shell.js'));
test('every status used in the flow, groups and fixtures is a known «order» badge status',()=>{
  const keys=new Set(Object.keys(O.NEXT));Object.values(O.NEXT).forEach(a=>a.forEach(k=>keys.add(k)));O.GROUPS.forEach(g=>g.keys.forEach(k=>keys.add(k)));O.buildFixtures().forEach(o=>keys.add(o.status));
  keys.forEach(k=>assert(B.known('order',k),k));
});
test('groups partition all statuses exactly once',()=>{
  const all=O.GROUPS.flatMap(g=>g.keys);assert.strictEqual(new Set(all).size,all.length);
  Object.keys(O.NEXT).forEach(k=>assert(O.groupOf(k),k));
});
test('fixtures: unique ids, provider only after assignment, covers every status',()=>{
  const f=O.buildFixtures();assert.strictEqual(new Set(f.map(o=>o.id)).size,f.length);
  f.forEach(o=>{if(['received','searching'].includes(o.status))assert.strictEqual(o.provider,null)});
  assert.strictEqual(new Set(f.map(o=>o.status)).size,Object.keys(O.NEXT).length);
});
test('final statuses have no next; unknown status yields none',()=>{
  assert.deepStrictEqual(O.allowedNext('closed'),[]);assert.deepStrictEqual(O.allowedNext('cancelled'),[]);assert.deepStrictEqual(O.allowedNext('nope'),[]);
  assert.deepStrictEqual(O.allowedNext('completed'),['closed']);
});
test('applyTransition is immutable, appends history, and rejects invalid moves',()=>{
  const l=O.buildFixtures();const o=l.find(x=>x.status==='received');const n=O.applyTransition(l,o.id,'searching','t','2026-11-08T10:00:00');
  assert.strictEqual(l.find(x=>x.id===o.id).status,'received');
  const m=n.find(x=>x.id===o.id);assert.strictEqual(m.status,'searching');assert.strictEqual(m.history.length,o.history.length+1);
  assert.throws(()=>O.applyTransition(l,o.id,'completed'),RangeError);assert.throws(()=>O.applyTransition(l,'zzz','searching'),RangeError);
});
test('addNote trims, caps at 500 chars, rejects empty',()=>{
  const l=O.buildFixtures();assert.throws(()=>O.addNote(l,l[0].id,'   '),RangeError);
  assert.strictEqual(O.addNote(l,l[0].id,'  hi ').find(x=>x.id===l[0].id).notes[0].text,'hi');
  assert.strictEqual(O.addNote(l,l[0].id,'x'.repeat(900)).find(x=>x.id===l[0].id).notes[0].text.length,500);
});
test('counts sum to total',()=>{const c=O.counts(O.buildFixtures());assert.strictEqual(c.new+c.active+c.done+c.problem,c.total);assert.strictEqual(c.total,30)});
test('page targets a known admin page id and is loaded by admin/index.html after the shell',()=>{
  assert(shell._internals.findItem('orders'));
  const h=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
  assert(h.indexOf('admin-shell.js')<h.indexOf('orders-management.page.js'));
  assert(h.indexOf('data-grid.js')<h.indexOf('orders-management.page.js'));
});
console.log(`\n${passed} passed`);
