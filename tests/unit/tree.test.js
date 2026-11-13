'use strict';
const path=require('path'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const T=require(path.join(root,'shared/utils/tree.js'));
//  a ─ b ─ c ─ d      a ─ g      e ─ f
const L=()=>[{id:'a',parentId:null,order:1,name:'A'},{id:'b',parentId:'a',order:1,name:'B'},{id:'c',parentId:'b',order:1,name:'C'},{id:'d',parentId:'c',order:1,name:'D'},{id:'e',parentId:null,order:2,name:'E'},{id:'f',parentId:'e',order:1,name:'F'},{id:'g',parentId:'a',order:2,name:'G'}];
const ids=(l,id,m)=>T.validParents(l,id,m).map(x=>x.id).sort();
test('byId / siblings (ordered; root = null or undefined)',()=>{
  const l=L();assert.strictEqual(T.byId(l,'c').name,'C');assert.strictEqual(T.byId(l,'zz'),null);
  assert.deepStrictEqual(T.siblings(l,null).map(x=>x.id),['a','e']);assert.deepStrictEqual(T.siblings(l,undefined).map(x=>x.id),['a','e']);assert.deepStrictEqual(T.siblings(l,'a').map(x=>x.id),['b','g']);
  assert.deepStrictEqual(T.siblings(l.map(x=>x.id==='b'?{...x,order:5}:x),'a').map(x=>x.id),['g','b']);
});
test('descendantIds / depthOf / height / pathOf',()=>{
  const l=L();assert.deepStrictEqual(T.descendantIds(l,'a').sort(),['b','c','d','g']);assert.deepStrictEqual(T.descendantIds(l,'d'),[]);
  assert.strictEqual(T.depthOf(l,'a'),1);assert.strictEqual(T.depthOf(l,'d'),4);assert.strictEqual(T.depthOf(l,'zz'),0);
  assert.strictEqual(T.height(l,'a'),4);assert.strictEqual(T.height(l,'b'),3);assert.strictEqual(T.height(l,'g'),1);
  assert.deepStrictEqual(T.pathOf(l,'c'),['A','B','C']);assert.deepStrictEqual(T.pathOf(l,'c','id'),['a','b','c']);
});
test('validParents: never itself or its descendants (cycle); the moved subtree height counts against the depth limit',()=>{
  const l=L();
  assert.deepStrictEqual(ids(l,'b',4),['a','e']);          // b: height 3 → only parents of depth 1 (a is its current parent)
  assert.deepStrictEqual(ids(l,'g',3),['a','b','e','f']);  // c,d too deep (4); g itself excluded
  assert.deepStrictEqual(ids(l,null,3),['a','b','e','f','g']);   // new item (height 1): parents of depth ≤ 2
  assert.deepStrictEqual(ids(l,'a',4),[]);                 // height 4 → nothing fits under maxDepth 4
  ['a','b','c','d'].forEach(x=>assert(!ids(l,'a',9).includes(x)));   // a can never go under itself or its own subtree
});
test('flatten: depth-first with levels, siblings by order',()=>{
  const f=T.flatten(L());assert.deepStrictEqual(f.map(x=>x.id),['a','b','c','d','g','e','f']);assert.deepStrictEqual(f.map(x=>x.level),[1,2,3,4,2,1,2]);
});
test('never mutates its input',()=>{const l=L(),s=JSON.stringify(l);T.siblings(l,'a');T.descendantIds(l,'a');T.validParents(l,'b',4);T.flatten(l);assert.strictEqual(JSON.stringify(l),s)});
test('corrupt data (a parent cycle) does not hang',()=>{
  const bad=[{id:'x',parentId:'y',order:1},{id:'y',parentId:'x',order:1}];
  assert(T.depthOf(bad,'x')>0);assert(Array.isArray(T.descendantIds(bad,'x')));assert(T.height(bad,'x')>=1);assert(Array.isArray(T.pathOf(bad,'x')));assert(Array.isArray(T.validParents(bad,'x',3)));
});
console.log(`\n${passed} passed`);
