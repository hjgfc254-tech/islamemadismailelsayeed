'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const B=require(path.join(root,'shared/components/status-badge.js'));
globalThis.HSStatusBadge=B;globalThis.HSDialog=require(path.join(root,'shared/components/dialogs.js'));
const R=require(path.join(root,'apps/admin/pages/reviews-management.page.js'));
const shell=require(path.join(root,'apps/admin/admin-shell.js'));
const F=()=>R.buildFixtures();
test('registers the «review» badge domain with every status',()=>{Object.keys(R.STATUS).forEach(k=>{assert(B.known('review',k),k);assert.strictEqual(B.label('review',k),R.STATUS[k].label)})});
test('fixtures: 24 unique, ratings 1–5, all 3 statuses, non-published have a report, hidden reports resolved, published none',()=>{
  const f=F();assert.strictEqual(f.length,24);assert.strictEqual(new Set(f.map(r=>r.id)).size,24);assert.strictEqual(new Set(f.map(r=>r.status)).size,3);
  f.forEach(r=>{assert(r.rating>=1&&r.rating<=5);if(r.status==='published')assert.strictEqual(r.report,null);else assert(r.report&&R.REASONS.includes(r.report.reason));if(r.status==='hidden')assert(r.report.resolved);if(r.status==='flagged')assert(!r.report.resolved);assert(!/<|>/.test(r.text))});
});
test('allowedNext: flagged→published/hidden, published→hidden, hidden→published; unknown → none',()=>{
  assert.deepStrictEqual(R.allowedNext('flagged').sort(),['hidden','published']);assert.deepStrictEqual(R.allowedNext('published'),['hidden']);assert.deepStrictEqual(R.allowedNext('hidden'),['published']);assert.deepStrictEqual(R.allowedNext('x'),[]);
});
test('decide requires a trimmed reason of ≥3 chars and records it in the log; immutable',()=>{
  const l=F(),a=l.find(r=>r.status==='flagged');
  ['',' ','ab',null,undefined].forEach(x=>assert.throws(()=>R.decide(l,a.id,'hidden',x),/Reason required/));
  const n=R.decide(l,a.id,'hidden','  مخالفة واضحة  ','2026-11-01'),u=n.find(r=>r.id===a.id);
  assert.strictEqual(l.find(r=>r.id===a.id).status,'flagged');assert.strictEqual(l.find(r=>r.id===a.id).log.length,0);
  assert.strictEqual(u.status,'hidden');assert.strictEqual(u.log.length,1);assert.strictEqual(u.log[0].kind,'decision');assert(u.log[0].text.includes('مخالفة واضحة'));assert(u.log[0].text.includes('إخفاء'));assert.strictEqual(u.log[0].at,'2026-11-01');
  assert.strictEqual(u.report.resolved,true);assert.strictEqual(a.report.resolved,false);
});
test('decide wording differs: keep (flagged→published) vs restore (hidden→published); invalid moves / unknown ids throw',()=>{
  const l=F(),fl=l.find(r=>r.status==='flagged'),hi=l.find(r=>r.status==='hidden'),pu=l.find(r=>r.status==='published');
  assert(R.decide(l,fl.id,'published','سبب صحيح').find(r=>r.id===fl.id).log[0].text.includes('إبقاء'));
  const rl=R.decide(l,hi.id,'published','سبب صحيح').find(r=>r.id===hi.id);assert(rl.log[rl.log.length-1].text.includes('إعادة نشر'));
  assert.throws(()=>R.decide(l,pu.id,'flagged','سبب صحيح'),RangeError);assert.throws(()=>R.decide(l,hi.id,'hidden','سبب صحيح'),RangeError);assert.throws(()=>R.decide(l,'zz','hidden','سبب صحيح'),RangeError);
});
test('reason is capped at 300 chars in the log',()=>{const l=F(),a=l.find(r=>r.status==='published'),u=R.decide(l,a.id,'hidden','س'.repeat(500)).find(r=>r.id===a.id);assert(u.log[0].text.length<=300+60)});
test('addNote trims, caps at 500, rejects empty / unknown',()=>{
  const l=F();assert.throws(()=>R.addNote(l,l[0].id,' '),/Empty note/);assert.throws(()=>R.addNote(l,'zz','a'),RangeError);
  const n=R.addNote(l,l[0].id,' a ');assert.strictEqual(n[0].log[n[0].log.length-1].text,'a');assert.strictEqual(R.addNote(l,l[0].id,'x'.repeat(800))[0].log.slice(-1)[0].text.length,500);
});
test('counts: average covers published only (1 decimal); null when none published',()=>{
  const f=F(),c=R.counts(f),pub=f.filter(r=>r.status==='published');
  assert.strictEqual(c.total,24);assert.strictEqual(c.published+c.flagged+c.hidden,24);assert.strictEqual(c.average,Math.round(pub.reduce((a,r)=>a+r.rating,0)/pub.length*10)/10);
  assert.strictEqual(R.counts([{status:'hidden',rating:5}]).average,null);assert.strictEqual(R.counts([]).total,0);
});
test('target is a known admin page; script order is correct',()=>{
  assert(shell._internals.findItem('reviews'));const h=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
  ['data-grid.js','dialogs.js','status-badge.js','admin-shell.js'].forEach(s=>assert(h.indexOf(s)>-1&&h.indexOf(s)<h.indexOf('reviews-management.page.js'),s));
});
console.log(`\n${passed} passed`);
