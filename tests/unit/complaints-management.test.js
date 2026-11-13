'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const B=require(path.join(root,'shared/components/status-badge.js'));
globalThis.HSStatusBadge=B;globalThis.HSDialog=require(path.join(root,'shared/components/dialogs.js'));
const C=require(path.join(root,'apps/admin/pages/complaints-management.page.js'));
const shell=require(path.join(root,'apps/admin/admin-shell.js'));
const F=()=>C.buildFixtures();
test('registers «complaint» and «priority» badge domains with every key',()=>{
  Object.keys(C.STATUS).forEach(k=>{assert(B.known('complaint',k),k);assert.strictEqual(B.label('complaint',k),C.STATUS[k].label)});
  Object.keys(C.PRIORITY).forEach(k=>{assert(B.known('priority',k),k);assert.strictEqual(B.label('priority',k),C.PRIORITY[k].label)});
});
test('fixtures: 24 unique, valid type/priority/status, known assignee or none, log starts with receipt, all statuses+priorities present',()=>{
  const f=F();assert.strictEqual(f.length,24);assert.strictEqual(new Set(f.map(c=>c.id)).size,24);
  f.forEach(c=>{assert(C.TYPES.includes(c.type));assert(C.PRIORITY[c.priority]);assert(C.STATUS[c.status]);assert(c.assignee===null||C.STAFF.some(s=>s.id===c.assignee));assert.strictEqual(c.log[0].kind,'open')});
  assert.strictEqual(new Set(f.map(c=>c.status)).size,4);assert.strictEqual(new Set(f.map(c=>c.priority)).size,4);
});
test('allowedNext: new→review/dismissed, review→resolved/dismissed, resolved/dismissed→review (reopen); unknown → none',()=>{
  assert.deepStrictEqual(C.allowedNext('new').sort(),['dismissed','review']);assert.deepStrictEqual(C.allowedNext('review').sort(),['dismissed','resolved']);
  assert.deepStrictEqual(C.allowedNext('resolved'),['review']);assert.deepStrictEqual(C.allowedNext('dismissed'),['review']);assert.deepStrictEqual(C.allowedNext('x'),[]);
});
test('setStatus: immutable, appends a log entry, rejects invalid moves / unknown ids',()=>{
  const l=F(),a=l.find(c=>c.status==='new'),n=C.setStatus(l,a.id,'review','2026-11-01');
  assert.strictEqual(l.find(c=>c.id===a.id).status,'new');assert.strictEqual(l.find(c=>c.id===a.id).log.length,1);
  const u=n.find(c=>c.id===a.id);assert.strictEqual(u.status,'review');assert.strictEqual(u.log.length,2);assert.strictEqual(u.log[1].kind,'status');assert.strictEqual(u.log[1].at,'2026-11-01');
  assert.throws(()=>C.setStatus(l,a.id,'resolved'),RangeError);assert.throws(()=>C.setStatus(l,'zz','review'),RangeError);
});
test('classify: validates type/priority, rejects no-op, immutable, logs',()=>{
  const l=F(),c=l[0],other=C.TYPES.find(t=>t!==c.type),n=C.classify(l,c.id,other,'urgent');
  assert.strictEqual(l[0].type,c.type);assert.strictEqual(n[0].type,other);assert.strictEqual(n[0].priority,'urgent');assert.strictEqual(n[0].log.length,2);
  assert.throws(()=>C.classify(l,c.id,c.type,c.priority),/No change/);assert.throws(()=>C.classify(l,c.id,'x','low'),RangeError);assert.throws(()=>C.classify(l,c.id,c.type,'x'),RangeError);assert.throws(()=>C.classify(l,'zz',c.type,'low'),RangeError);
});
test('assign: known staff or unassign, rejects unknown/no-op, immutable, logs with the staff name',()=>{
  const l=F(),c=l.find(x=>x.assignee===null),n=C.assign(l,c.id,'u2');
  assert.strictEqual(l.find(x=>x.id===c.id).assignee,null);const u=n.find(x=>x.id===c.id);assert.strictEqual(u.assignee,'u2');assert(u.log[u.log.length-1].text.includes(C.staffName('u2')));
  const un=C.assign(n,c.id,'');assert.strictEqual(un.find(x=>x.id===c.id).assignee,null);
  assert.throws(()=>C.assign(l,c.id,''),/No change/);assert.throws(()=>C.assign(l,c.id,'u9'),RangeError);assert.throws(()=>C.assign(l,'zz','u1'),RangeError);
});
test('addNote trims, caps at 500, rejects empty / unknown; stored as a log entry',()=>{
  const l=F();assert.throws(()=>C.addNote(l,l[0].id,' '),/Empty note/);assert.throws(()=>C.addNote(l,'zz','a'),RangeError);
  const n=C.addNote(l,l[0].id,' a ');assert.strictEqual(n[0].log[n[0].log.length-1].kind,'note');assert.strictEqual(n[0].log[n[0].log.length-1].text,'a');
  assert.strictEqual(C.addNote(l,l[0].id,'x'.repeat(800))[0].log[1].text.length,500);
});
test('counts: open high/urgent only count unresolved complaints; parts add up',()=>{
  const f=F(),c=C.counts(f);assert.strictEqual(c.total,24);
  assert.strictEqual(c.hot,f.filter(x=>(x.status==='new'||x.status==='review')&&(x.priority==='high'||x.priority==='urgent')).length);
  assert(c.new+c.review+c.resolved<=c.total);
});
test('target is a known admin page; script order is correct',()=>{
  assert(shell._internals.findItem('complaints'));const h=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
  ['data-grid.js','dialogs.js','status-badge.js','admin-shell.js'].forEach(s=>assert(h.indexOf(s)>-1&&h.indexOf(s)<h.indexOf('complaints-management.page.js'),s));
});
console.log(`\n${passed} passed`);
