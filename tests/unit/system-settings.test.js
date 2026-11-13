'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const S=require(path.join(root,'apps/admin/pages/system-settings.page.js'));
const D=()=>S.defaults(), W=(o)=>Object.assign(D(),o);
const msg=(f,m)=>assert.throws(f,(e)=>e.message===m,m);
test('defaults are valid, every field has a unique key and a known group',()=>{
  assert.deepStrictEqual(S.validate(D()),{});assert.strictEqual(new Set(S.FIELDS.map(f=>f.key)).size,S.FIELDS.length);
  S.FIELDS.forEach(f=>assert(S.GROUPS[f.group],f.key));
});
test('validation: ranges, integers, required text, email, select, boolean',()=>{
  const bad=(o,k)=>assert(S.validate(W(o))[k],k+' should be invalid for '+JSON.stringify(o));
  bad({autoCancelHours:0},'autoCancelHours');bad({autoCancelHours:73},'autoCancelHours');bad({autoCancelHours:1.5},'autoCancelHours');bad({maxAttachmentMb:26},'maxAttachmentMb');
  bad({sessionTimeoutMin:4},'sessionTimeoutMin');bad({maxLoginAttempts:11},'maxLoginAttempts');bad({platformName:''},'platformName');bad({platformName:'ا'},'platformName');bad({platformName:'x'.repeat(61)},'platformName');
  bad({supportEmail:'nope'},'supportEmail');bad({supportEmail:'a b@x.y'},'supportEmail');bad({language:'fr'},'language');bad({timezone:'Mars/Base'},'timezone');bad({maintenance:'yes'},'maintenance');
  assert.deepStrictEqual(S.validate(W({autoCancelHours:1,maxAttachmentMb:25,sessionTimeoutMin:480})),{});
});
test('tax rate is validated only while tax is enabled',()=>{
  assert.deepStrictEqual(S.validate(W({taxEnabled:false,taxRatePct:99})),{});
  assert(S.validate(W({taxEnabled:true,taxRatePct:31})).taxRatePct);assert(S.validate(W({taxEnabled:true,taxRatePct:-1})).taxRatePct);
  assert.deepStrictEqual(S.validate(W({taxEnabled:true,taxRatePct:30})),{});
});
test('coerce: trims, rejects non-numeric/negative/huge ints, maps checkbox values',()=>{
  const f=(k)=>S.FIELDS.find(x=>x.key===k);
  assert.strictEqual(S.coerce(f('autoCancelHours'),' 12 '),12);assert.strictEqual(S.coerce(f('autoCancelHours'),'1e3'),undefined);assert.strictEqual(S.coerce(f('autoCancelHours'),'-5'),undefined);
  assert.strictEqual(S.coerce(f('autoCancelHours'),''),undefined);assert.strictEqual(S.coerce(f('autoCancelHours'),'12345'),undefined);
  assert.strictEqual(S.coerce(f('platformName'),'  اسم  '),'اسم');assert.strictEqual(S.coerce(f('maintenance'),true),true);assert.strictEqual(S.coerce(f('maintenance'),false),false);
  assert(S.validate(W({autoCancelHours:undefined})).autoCancelHours);
});
test('diff lists only real changes and hides a tax rate change while tax stays off',()=>{
  assert.deepStrictEqual(S.diff(D(),D()),[]);
  const d=S.diff(D(),W({autoCancelHours:48,maintenance:true}));assert.deepStrictEqual(d.map(x=>x.key),['autoCancelHours','maintenance']);
  assert.strictEqual(d[1].to,'مفعّل');assert.strictEqual(d[1].from,'معطّل');
  assert.deepStrictEqual(S.diff(D(),W({taxRatePct:20})),[]);assert.deepStrictEqual(S.diff(W({taxEnabled:true}),W({taxEnabled:true,taxRatePct:20})).map(x=>x.key),['taxRatePct']);
});
test('applyChange: needs valid values, a real change and a 3–300 char reason; immutable; logs the exact diff',()=>{
  S.resetState();const cur=D(),snap=JSON.stringify(cur);
  msg(()=>S.applyChange(cur,[],W({autoCancelHours:0}),{note:'سبب كافٍ'}),'Invalid values');msg(()=>S.applyChange(cur,[],D(),{note:'سبب كافٍ'}),'No changes');
  msg(()=>S.applyChange(cur,[],W({maxAttachmentMb:10}),{note:'  '}),'Reason required');msg(()=>S.applyChange(cur,[],W({maxAttachmentMb:10}),{note:'ab'}),'Reason required');msg(()=>S.applyChange(cur,[],W({maxAttachmentMb:10}),{note:'x'.repeat(301)}),'Reason required');
  const r=S.applyChange(cur,[],W({maxAttachmentMb:10}),{note:' رفع الحد '});
  assert.strictEqual(r.values.maxAttachmentMb,10);assert.strictEqual(r.log.length,1);assert.strictEqual(r.log[0].note,'رفع الحد');assert.deepStrictEqual(r.log[0].changes.map(x=>x.key),['maxAttachmentMb']);
  assert.strictEqual(JSON.stringify(cur),snap);assert.deepStrictEqual(S.validate(r.values),{});
  const back=S.applyChange(r.values,r.log,D(),{note:'استعادة الافتراضي'});assert.deepStrictEqual(back.values,D());assert.strictEqual(back.log.length,2);
});
test('no network, storage or real-effect surface; page states it is a demo',()=>{
  const src=fs.readFileSync(path.join(root,'apps/admin/pages/system-settings.page.js'),'utf8');
  for(const k of Object.keys(S))assert.doesNotMatch(k,/^(save|send|apply[A-Z]\w*Live|enable|enforce|persist|export|delete)/i,k);
  assert.doesNotMatch(src,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|Blob\(|createObjectURL/);
  assert.match(src,/لا يُحفظ شيء ولا يتأثر أي تطبيق/);assert.match(src,/STATUS: IMPLEMENTED \(DEMO\)/);
});
console.log('system-settings.test.js: '+passed+' checks');
