'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const B=require(path.join(root,'shared/components/status-badge.js'));
globalThis.HSStatusBadge=B;
globalThis.HSDialog=require(path.join(root,'shared/components/dialogs.js'));
const P=require(path.join(root,'apps/admin/pages/providers-management.page.js'));
const shell=require(path.join(root,'apps/admin/admin-shell.js'));
test('every status exists in the shared «provider» badge domain with the same label',()=>{Object.keys(P.STATUS).forEach(k=>{assert(B.known('provider',k),k);assert.strictEqual(B.label('provider',k),P.STATUS[k])})});
test('fixtures: unique ids, fake phones, all 4 statuses, only approved/suspended have jobs/rating and complete docs',()=>{
  const f=P.buildFixtures();assert.strictEqual(new Set(f.map(p=>p.id)).size,f.length);
  assert.strictEqual(new Set(f.map(p=>p.status)).size,4);
  f.forEach(p=>{assert(/^0100000\d{4}$/.test(p.phone));
    if(p.status==='approved'||p.status==='suspended'){assert(p.jobs>0&&p.rating>=1&&p.rating<=5);assert(P.docsComplete(p))}
    else{assert.strictEqual(p.jobs,0);assert.strictEqual(p.rating,null)}});
});
test('allowedNext: review moves only; unknown → none',()=>{
  assert.deepStrictEqual(P.allowedNext('pending').sort(),['approved','rejected']);assert.deepStrictEqual(P.allowedNext('approved'),['warned','suspended']);   /* «warned» = admin warning action (2nd one suspends), not a stored status */
  assert.deepStrictEqual(P.allowedNext('suspended'),['approved']);assert.deepStrictEqual(P.allowedNext('rejected'),['pending']);assert.deepStrictEqual(P.allowedNext('x'),[]);
});
test('setStatus is immutable and rejects invalid moves / unknown ids',()=>{
  const l=P.buildFixtures();const a=l.find(p=>p.status==='pending');const n=P.setStatus(l,a.id,'approved');
  assert.strictEqual(l.find(p=>p.id===a.id).status,'pending');assert.strictEqual(n.find(p=>p.id===a.id).status,'approved');
  assert.throws(()=>P.setStatus(l,a.id,'suspended'),RangeError);assert.throws(()=>P.setStatus(l,'zz','approved'),RangeError);
});
test('addNote trims, caps at 500, rejects empty / unknown',()=>{
  const l=P.buildFixtures();assert.throws(()=>P.addNote(l,l[0].id,' '),RangeError);assert.throws(()=>P.addNote(l,'zz','a'),RangeError);
  assert.strictEqual(P.addNote(l,l[0].id,' a ').find(p=>p.id===l[0].id).notes[0].text,'a');
  assert.strictEqual(P.addNote(l,l[0].id,'x'.repeat(800)).find(p=>p.id===l[0].id).notes[0].text.length,500);
});
test('counts add up to 24',()=>{const c=P.counts(P.buildFixtures());assert.strictEqual(c.approved+c.pending+c.suspended+c.rejected,c.total);assert.strictEqual(c.total,24)});
test('docsComplete reflects missing documents',()=>{assert(!P.docsComplete({docs:{id:true,skill:false,photo:true}}));assert(P.docsComplete({docs:{id:true,skill:true,photo:true}}))});
test('target is a known admin page and script order in admin index is correct',()=>{
  assert(shell._internals.findItem('providers'));
  const h=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
  ['data-grid.js','dialogs.js','status-badge.js','admin-shell.js'].forEach(s=>assert(h.indexOf(s)>-1&&h.indexOf(s)<h.indexOf('providers-management.page.js'),s));
});
console.log(`\n${passed} passed`);
