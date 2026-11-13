'use strict';
const path=require('path'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const D=require(path.join(root,'shared/components/dialogs.js'));
const mkBtn=(sel)=>({focused:0,isConnected:true,disabled:false,hidden:false,getAttribute(){return null},focus(){this.focused++},matches:(s)=>s===sel,closest(){return this}});
const mkDlg=(withNative=true)=>{const L={};const d={open:false,_f:null,addEventListener(t,f){L[t]=f},removeAttribute(){d.open=false},setAttribute(){d.open=true},
  querySelector(s){return d._q&&d._q[s]||null},querySelectorAll(){return d._focusables||[]},contains(el){return (d._focusables||[]).includes(el)},focus(){d.focused=(d.focused||0)+1},fire(t,e){L[t]&&L[t](e)}};
  if(withNative){d.showModal=()=>{d.open=true};d.close=()=>{d.open=false;L.close&&L.close()}}return d};
test('open focuses the close button; close returns focus to the opener and calls onClose',()=>{
  const dlg=mkDlg(),x=mkBtn('[c]'),op=mkBtn('');dlg._q={'[c]':x};let closed=0;
  const d=D.attach(dlg,{closeSelector:'[c]',onClose:()=>closed++});d.open(op);assert(dlg.open&&d.isOpen());assert.strictEqual(x.focused,1);
  d.close();assert(!dlg.open);assert.strictEqual(op.focused,1);assert.strictEqual(closed,1);
});
test('backdrop click and close-button click close; other buttons go to onClick handler',()=>{
  const dlg=mkDlg(),x=mkBtn('[c]'),o=mkBtn('[zz]'),seen=[];const d=D.attach(dlg,{closeSelector:'[c]'});d.onClick((b)=>seen.push(b));
  d.open(mkBtn(''));dlg.fire('click',{target:o});assert.deepStrictEqual(seen,[o]);assert(dlg.open);
  dlg.fire('click',{target:x});assert(!dlg.open);d.open(mkBtn(''));dlg.fire('click',{target:dlg});assert(!dlg.open);
});
test('uses fallbackFocus when the opener is gone; works without native showModal/close',()=>{
  const dlg=mkDlg(false),op=mkBtn('');op.isConnected=false;const fb=mkBtn('');let closed=0;
  const d=D.attach(dlg,{fallbackFocus:()=>fb,onClose:()=>closed++});d.open(op);assert(dlg.open);d.close();
  assert(!dlg.open);assert.strictEqual(fb.focused,1);assert.strictEqual(op.focused,0);assert.strictEqual(closed,1);
});
test('close on a closed dialog is a no-op',()=>{const dlg=mkDlg();let c=0;const d=D.attach(dlg,{onClose:()=>c++});d.close();assert.strictEqual(c,0)});
console.log(`\n${passed} passed`);

test('attribute-only dialog fallback traps Tab at both ends and closes on Escape',()=>{
  const dlg=mkDlg(false),first=mkBtn(''),last=mkBtn('');dlg._focusables=[first,last];
  const previous=global.document;global.document={activeElement:first};
  const d=D.attach(dlg);d.open(mkBtn(''));
  let prevented=0;dlg.fire('keydown',{key:'Tab',shiftKey:true,preventDefault(){prevented++}});
  assert.strictEqual(last.focused,1);
  global.document.activeElement=last;dlg.fire('keydown',{key:'Tab',shiftKey:false,preventDefault(){prevented++}});
  assert.strictEqual(first.focused,1);assert.strictEqual(prevented,2);
  dlg.fire('keydown',{key:'Escape',preventDefault(){prevented++}});assert(!dlg.open);
  if(previous===undefined)delete global.document;else global.document=previous;
});
