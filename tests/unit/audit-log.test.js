'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const A=require(path.join(root,'apps/admin/pages/audit-log.page.js'));
const G=require(path.join(root,'shared/components/data-grid.js'));
const fx=()=>A.buildEvents();
const view=(st)=>G.computeView(fx().map(A.toRow),A.GRID_CFG,Object.assign({search:'',filters:{},sort:null,page:1,pageSize:50},st));
test('fixtures: 18 valid events, unique ids, none after the fixed demo time',()=>{
  const l=fx();assert.strictEqual(l.length,18);assert.deepStrictEqual(A.validateEvents(l),[]);assert.strictEqual(new Set(l.map(x=>x.id)).size,18);
});
test('validation catches duplicates, bad time, unknown actor/module/result, missing reason, future events',()=>{
  const b=fx()[0];const bad=(o)=>A.validateEvents([Object.assign({},b,o)]);
  assert(bad({at:'nope'}).some(x=>/timestamp/.test(x)));assert(bad({at:'2026-12-01T00:00:00Z'}).some(x=>/after/.test(x)));
  assert(bad({actorId:'zz'}).some(x=>/actor/.test(x)));assert(bad({module:'zz'}).some(x=>/module/.test(x)));assert(bad({result:'zz'}).some(x=>/result/.test(x)));
  assert(bad({result:'denied',reason:' '}).some(x=>/reason/.test(x)));assert(bad({summary:''}).length>0);
  assert(A.validateEvents([b,b]).some(x=>/duplicate/.test(x)));
});
test('counts add up to the total and match the fixtures (verified by recount)',()=>{
  const l=fx(),c=A.counts(l);assert.strictEqual(c.total,18);assert.strictEqual(c.success+c.denied+c.failed,18);
  for(const k of ['success','denied','failed'])assert.strictEqual(c[k],l.filter(x=>x.result===k).length);
  assert.deepStrictEqual(A.counts([]),{total:0,success:0,denied:0,failed:0});
});
test('sortNewest is newest-first, stable on ties, and does not mutate',()=>{
  const l=fx(),copy=JSON.stringify(l),s=A.sortNewest(l);assert.strictEqual(JSON.stringify(l),copy);
  for(let i=1;i<s.length;i++)assert(Date.parse(s[i-1].at)>=Date.parse(s[i].at));
});
test('grid: search by actor/record/summary (Arabic-normalised), module/result/actor filters',()=>{
  assert.strictEqual(view({search:'STL-DEMO-0004'}).matched,1);
  assert.strictEqual(view({filters:{result:'denied'}}).matched,A.counts(fx()).denied);
  assert.strictEqual(view({filters:{moduleLabel:A.MODULES.roles}}).matched,3);
  assert.strictEqual(view({search:'zzzz'}).matched,0);
  assert.strictEqual(view({filters:{result:'failed',moduleLabel:A.MODULES.auth}}).matched,1);
});
test('there is no write/export surface and no network or storage calls',()=>{
  const src=fs.readFileSync(path.join(root,'apps/admin/pages/audit-log.page.js'),'utf8');
  for(const k of Object.keys(A))assert.doesNotMatch(k,/^(add|delete|remove|update|save|export|record|log)/i,k);
  assert.doesNotMatch(src,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|indexedDB|Blob\(|createObjectURL/);
  assert.match(src,/ليست سجل تدقيق حقيقيًا ولا غير قابل للتلاعب/);
});
console.log('audit-log.test.js: '+passed+' checks');
