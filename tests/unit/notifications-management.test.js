'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const B=require(path.join(root,'shared/components/status-badge.js'));
globalThis.HSStatusBadge=B;globalThis.HSDialog=require(path.join(root,'shared/components/dialogs.js'));
const N=require(path.join(root,'apps/admin/pages/notifications-management.page.js'));
const shell=require(path.join(root,'apps/admin/admin-shell.js'));
const ok={name:'قالب جديد',channel:'app',audience:'customers',title:'عنوان',body:'مرحبًا {{name}}'};
test('registers «notification» and «delivery» badge domains with every key',()=>{
  Object.keys(N.STATUS).forEach(k=>{assert(B.known('notification',k),k);assert.strictEqual(B.label('notification',k),N.STATUS[k].label)});
  Object.keys(N.DELIVERY).forEach(k=>{assert(B.known('delivery',k),k);assert.strictEqual(B.label('delivery',k),N.DELIVERY[k].label)});
});
test('template fixtures: unique ids/names, valid channel/audience, only known placeholders, all 3 statuses',()=>{
  const f=N.buildTemplates();assert.strictEqual(new Set(f.map(t=>t.id)).size,f.length);assert.strictEqual(new Set(f.map(t=>t.name)).size,f.length);
  f.forEach(t=>{assert(N.CHANNELS[t.channel]);assert(N.AUDIENCES[t.audience]);assert.deepStrictEqual(N.unknownPlaceholders(t.title+' '+t.body),[]);assert(t.body.length<=N.LIMITS.body)});
  assert.strictEqual(new Set(f.map(t=>t.status)).size,3);
});
test('log fixtures: counts consistent (delivered+failed=recipients), covers all 3 delivery statuses',()=>{
  const l=N.buildLog();assert.strictEqual(l.length,16);l.forEach(r=>{assert.strictEqual(r.delivered+r.failed,r.recipients);assert(r.delivered>=0&&r.failed>=0)});
  assert.strictEqual(new Set(l.map(N.deliveryStatus)).size,3);
});
test('deliveryStatus and rate',()=>{
  assert.strictEqual(N.deliveryStatus({recipients:10,delivered:10}),'delivered');assert.strictEqual(N.deliveryStatus({recipients:10,delivered:0}),'failed');assert.strictEqual(N.deliveryStatus({recipients:10,delivered:7}),'partial');
  assert.strictEqual(N.rate([{recipients:10,delivered:5},{recipients:10,delivered:10}]),75);assert.strictEqual(N.rate([]),null);
});
test('unknownPlaceholders / renderPreview: known replaced by samples, unknown kept as typed, plain text',()=>{
  assert.deepStrictEqual(N.unknownPlaceholders('{{name}} {{ x }} {{order_no}} {{y}}'),['x','y']);
  assert.strictEqual(N.renderPreview('مرحبًا {{name}} طلب {{ order_no }}'),'مرحبًا أحمد طلب 1024');assert.strictEqual(N.renderPreview('{{zz}}'),'{{zz}}');assert.strictEqual(N.renderPreview(null),'');
  assert.strictEqual(N.renderPreview('<b>{{name}}</b>'),'<b>أحمد</b>');   // not escaped here — the page escapes at render time
});
test('validate: required, lengths, unique name, channel/audience from lists, unknown placeholders rejected',()=>{
  const l=N.buildTemplates();assert(N.validate(ok,l).ok);
  assert(N.validate({...ok,name:' '},l).errors.name);assert(N.validate({...ok,name:'ا'},l).errors.name);assert(N.validate({...ok,name:l[0].name},l).errors.name);assert(N.validate({...ok,name:l[0].name},l,l[0].id).ok);
  assert(N.validate({...ok,channel:'x'},l).errors.channel);assert(N.validate({...ok,audience:''},l).errors.audience);
  assert(N.validate({...ok,title:''},l).errors.title);assert(N.validate({...ok,title:'x'.repeat(61)},l).errors.title);assert(N.validate({...ok,body:''},l).errors.body);assert(N.validate({...ok,body:'x'.repeat(201)},l).errors.body);
  assert(/zz/.test(N.validate({...ok,body:'{{zz}}'},l).errors.body));assert(/q/.test(N.validate({...ok,title:'{{q}}'},l).errors.title));
  assert.strictEqual(N.validate({name:null,channel:null,audience:null,title:null,body:null},l).ok,false);
});
test('createTemplate: immutable, draft, trimmed; invalid throws with field errors',()=>{
  const l=N.buildTemplates(),n=N.createTemplate(l,{...ok,name:'  قالب   جديد '});assert.strictEqual(l.length,10);assert.strictEqual(n.length,11);assert.strictEqual(n[10].status,'draft');assert.strictEqual(n[10].name,'قالب جديد');assert(!l.some(t=>t.id===n[10].id));
  try{N.createTemplate(l,{...ok,name:''});assert.fail('x')}catch(e){assert(e instanceof RangeError&&e.errors.name)}
});
test('updateTemplate: immutable, keeps status; rejects duplicates and unknown ids',()=>{
  const l=N.buildTemplates(),a=l[0],n=N.updateTemplate(l,a.id,{...ok,name:'اسم معدل'});assert.strictEqual(l[0].name,a.name);assert.strictEqual(n[0].name,'اسم معدل');assert.strictEqual(n[0].status,a.status);
  assert.throws(()=>N.updateTemplate(l,a.id,{...ok,name:l[1].name}),RangeError);assert.throws(()=>N.updateTemplate(l,'zz',ok),RangeError);
});
test('setStatus: draft→active, active⇄disabled only; immutable',()=>{
  assert.deepStrictEqual(N.allowedNext('draft'),['active']);assert.deepStrictEqual(N.allowedNext('active'),['disabled']);assert.deepStrictEqual(N.allowedNext('disabled'),['active']);assert.deepStrictEqual(N.allowedNext('x'),[]);
  const l=N.buildTemplates(),d=l.find(t=>t.status==='draft'),n=N.setStatus(l,d.id,'active');assert.strictEqual(l.find(t=>t.id===d.id).status,'draft');assert.strictEqual(n.find(t=>t.id===d.id).status,'active');
  assert.throws(()=>N.setStatus(l,d.id,'disabled'),RangeError);assert.throws(()=>N.setStatus(l,'zz','active'),RangeError);
});
test('counts',()=>{const c=N.counts(N.buildTemplates(),N.buildLog());assert.strictEqual(c.templates,10);assert.strictEqual(c.logs,16);assert(c.rate>0&&c.rate<=100);assert.strictEqual(c.active+c.draft<=c.templates,true)});
test('module exposes no send/schedule capability',()=>{['send','schedule','sendNow','dispatch'].forEach(k=>assert.strictEqual(N[k],undefined,k))});
test('target is a known admin page; script order is correct',()=>{
  assert(shell._internals.findItem('notifications'));const h=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
  ['data-grid.js','dialogs.js','status-badge.js','admin-shell.js'].forEach(s=>assert(h.indexOf(s)>-1&&h.indexOf(s)<h.indexOf('notifications-management.page.js'),s));
});
console.log(`\n${passed} passed`);
