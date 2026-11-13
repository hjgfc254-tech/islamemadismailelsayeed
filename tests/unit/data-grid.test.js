'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const G=require(path.join(root,'shared/components/data-grid.js'));
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const cols=[{key:'no',label:'رقم',type:'number'},{key:'name',label:'الاسم'},{key:'status',label:'الحالة',type:'status',statusDomain:'order'},{key:'at',label:'التاريخ',type:'date'}];
const rows=[
 {id:'a',no:10,name:'أحمد إبراهيم',status:'sent',at:'2026-11-01'},
 {id:'b',no:2,name:'احمد علي',status:'completed',at:'2026-11-05'},
 {id:'c',no:33,name:'منى',status:'sent',at:null},
 {id:'d',no:'',name:'Zed',status:'cancelled',at:'2026-10-20'}];
const cfg={columns:cols};
const st=(o)=>Object.assign({search:'',filters:{},sort:null,page:1,pageSize:10},o||{});

test('normalize unifies alef/yaa/taa-marbuta, strips tashkeel and Arabic-Indic digits',()=>{
  assert.strictEqual(G.normalize('أَحْمَد'),G.normalize('احمد'));
  assert.strictEqual(G.normalize('مدرسة'),G.normalize('مدرسه'));
  assert.strictEqual(G.normalize('على'),G.normalize('علي'));
  assert.strictEqual(G.normalize('١٢٣'),'123');
});
test('search matches normalised text across columns; empty search keeps all',()=>{
  assert.strictEqual(G.applyQuery(rows,cfg,st({search:'احمد'})).length,2);
  assert.strictEqual(G.applyQuery(rows,cfg,st({search:'zed'})).length,1);
  assert.strictEqual(G.applyQuery(rows,cfg,st({search:''})).length,4);
  assert.strictEqual(G.applyQuery(rows,cfg,st({search:'nothing-here'})).length,0);
});
test('filters combine with AND and with search',()=>{
  assert.strictEqual(G.applyQuery(rows,cfg,st({filters:{status:'sent'}})).length,2);
  assert.strictEqual(G.applyQuery(rows,cfg,st({filters:{status:'sent'},search:'منى'})).length,1);
  assert.strictEqual(G.applyQuery(rows,cfg,st({filters:{status:''}})).length,4);
});
test('numeric sort is numeric (not lexicographic); empty values always last in both directions',()=>{
  const asc=G.applyQuery(rows,cfg,st({sort:{key:'no',dir:'asc'}})).map(r=>r.id);
  const desc=G.applyQuery(rows,cfg,st({sort:{key:'no',dir:'desc'}})).map(r=>r.id);
  assert.deepStrictEqual(asc,['b','a','c','d']);assert.deepStrictEqual(desc,['c','a','b','d']);
});
test('date sort by timestamp, null date last; sort is stable for ties',()=>{
  assert.deepStrictEqual(G.applyQuery(rows,cfg,st({sort:{key:'at',dir:'asc'}})).map(r=>r.id),['d','a','b','c']);
  assert.deepStrictEqual(G.applyQuery(rows,cfg,st({sort:{key:'status',dir:'asc'}})).filter(r=>r.status==='sent').map(r=>r.id),['a','c']);
});
test('non-sortable or unknown sort key is ignored',()=>{
  const c2={columns:[{key:'name',label:'x',sortable:false}]};
  assert.deepStrictEqual(G.applyQuery(rows,c2,st({sort:{key:'name',dir:'desc'}})).map(r=>r.id),['a','b','c','d']);
  assert.strictEqual(G.applyQuery(rows,cfg,st({sort:{key:'zzz',dir:'asc'}})).length,4);
});
test('pagination: slices, clamps page, reports range and filtered flag',()=>{
  const many=Array.from({length:23},(_,i)=>({id:i,no:i,name:'n'+i,status:'sent'}));
  let v=G.computeView(many,cfg,st({pageSize:10,page:3}));assert.strictEqual(v.rows.length,3);assert.strictEqual(v.pages,3);assert.strictEqual(v.from,21);assert.strictEqual(v.to,23);
  v=G.computeView(many,cfg,st({pageSize:10,page:99}));assert.strictEqual(v.page,3);
  v=G.computeView(many,cfg,st({pageSize:10,page:-4}));assert.strictEqual(v.page,1);
  v=G.computeView([],cfg,st());assert.strictEqual(v.pages,1);assert.strictEqual(v.from,0);assert.strictEqual(v.filtered,false);
  v=G.computeView(many,cfg,st({search:'n1'}));assert.strictEqual(v.filtered,true);assert(v.matched<v.total);
});
test('search is applied before pagination (matches on later pages are found)',()=>{
  const many=Array.from({length:40},(_,i)=>({id:i,no:i,name:i===37?'هدف':'x'+i,status:'sent'}));
  assert.strictEqual(G.computeView(many,cfg,st({search:'هدف'})).rows[0].id,37);
});
test('create validates config (host, columns, duplicate keys)',()=>{
  assert.throws(()=>G.create(null,{columns:cols}),/required/);
  assert.throws(()=>G.create({},{columns:[]}),/required/);
  assert.throws(()=>G.create({},{columns:[{key:'a',label:'a'},{key:'a',label:'b'}]}),/duplicate/);
});
test('source: no dead controls, escaping, bare-name icon, tone/state CSS and script order',()=>{
  const src=read('shared/components/data-grid.js');
  assert(!/root\.ic\b/.test(src));assert(/filter\(\(a\) => a && typeof a\.onClick === 'function'/.test(src));
  assert(/data-g="retry"/.test(src)&&/typeof cfg\.onRetry === 'function'/.test(src));
  const css=read('apps/admin/styles/admin-components.css');
  ['.hs-grid-table','.hs-grid-pager','.hs-grid-sort','.hs-grid-wrap','.hs-grid-sortsel'].forEach(s=>assert(css.includes(s),s));
  assert(/@media \(max-width:767px\)\{\s*\.hs-grid-sortsel/.test(css));
  const html=read('apps/admin/index.html');
  const i=html.indexOf('components/data-grid.js"></script>');assert(i>html.indexOf('components/status-badge.js"></script>')&&i<html.indexOf('<script src="admin-shell.js">'));
});
console.log(`\n${passed} passed`);
