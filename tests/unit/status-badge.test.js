'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const B=require(path.join(root,'shared/components/status-badge.js'));
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('order labels match STATUS_LABEL in local-market-store (FLOW + ALT_STATUS)',()=>{
  const src=read('services/local-market-store.js');
  const pairs=[...src.matchAll(/^\s*\['([a-z]+)','([^']+)'\]/gm)].map(m=>[m[1],m[2]]);
  assert(pairs.length>=13,'found '+pairs.length);
  pairs.forEach(([k,l])=>assert.strictEqual(B.label('order',k),l,k));
  assert.deepStrictEqual(B.keys('order').sort(),pairs.map(p=>p[0]).sort());
});
test('provider/quote/collection labels match legacy portal wording',()=>{
  assert.strictEqual(B.label('provider','pending'),'قيد المراجعة');
  assert.strictEqual(B.label('provider','suspended'),'معلّق');
  assert.strictEqual(B.label('quote','pending'),'بانتظار العميل');
  assert.strictEqual(B.label('collection','settled'),'تمت التسوية');
});
test('every status has non-empty label, valid tone, and renders text (not colour only)',()=>{
  B.domains().forEach(d=>B.keys(d).forEach(k=>{
    assert(B.label(d,k).trim(),d+'.'+k);assert(B.TONES.includes(B.tone(d,k)),d+'.'+k);
    const h=B.render(d,k);assert(h.includes('hs-badge-t">'+B.label(d,k)+'<'),d+'.'+k);assert(h.includes('hs-badge--'+B.tone(d,k)));
  }));
});
test('failure/cancel are danger, completion is success, quote approval needed is warning',()=>{
  assert.strictEqual(B.tone('order','failed'),'danger');assert.strictEqual(B.tone('order','cancelled'),'danger');
  assert.strictEqual(B.tone('order','completed'),'success');assert.strictEqual(B.tone('order','quote'),'warning');
});
test('unknown key/domain/null never throws and renders a neutral labelled badge',()=>{
  for(const [d,k] of [['order','zzz'],['nope','x'],['order',null],[undefined,undefined],['order','__proto__'],['order','constructor'],[{},[]]]){
    const h=B.render(d,k);assert(h.includes('hs-badge--neutral'),String(k));assert(h.includes('is-unknown'));assert(h.includes('>'+B.UNKNOWN_LABEL+'<'));
  }
  assert.strictEqual(B.known('order','__proto__'),false);
});
test('HTML in key/label/title is escaped',()=>{
  const h=B.render('order','<img src=x onerror=1>',{});assert(!h.includes('<img'));assert(h.includes('&lt;img'));
  const h2=B.render('order','sent',{label:'<b>x</b>',title:'"q"'});assert(!h2.includes('<b>'));assert(h2.includes('&lt;b&gt;'));assert(h2.includes('&quot;q&quot;'));
});
test('opts: size sm, icon off, custom label; icon renders only when ic() exists',()=>{
  assert(B.render('order','sent',{size:'sm'}).includes('hs-badge--sm'));
  global.ic=(n)=>'<svg data-n="'+n+'"></svg>';
  assert(B.render('order','sent').includes('data-n="st-sent"'));
  assert(!B.render('order','sent',{icon:false}).includes('<svg'));
  assert(B.render('order','sent',{label:'مخصص'}).includes('>مخصص<'));
  delete global.ic;assert(!B.render('order','sent').includes('<svg'));
});
test('register: adds a domain, validates input, never overwrites',()=>{
  B.register('demo-x',{on:{label:'يعمل',tone:'success'}});
  assert.strictEqual(B.label('demo-x','on'),'يعمل');
  assert.throws(()=>B.register('demo-x',{}),/already exists/);
  assert.throws(()=>B.register('order',{}),/already exists/);
  assert.throws(()=>B.register('Bad Id',{}),/invalid domain/);
  assert.throws(()=>B.register('demo-y',{a:{label:'',tone:'info'}}),/label required/);
  assert.throws(()=>B.register('demo-z',{a:{label:'x',tone:'pink'}}),/invalid tone/);
  assert(!B.domains().includes('demo-y')&&!B.domains().includes('demo-z'));
});
test('every icon name used exists in the icon registry; CSS defines every tone; admin index loads the script before the shell',()=>{
  const reg=read('shared/icons/icon-registry.js');
  const used=new Set();B.domains().filter(d=>d!=='demo-x').forEach(d=>B.keys(d).forEach(k=>{const m=B.render(d,k);}));
  const src=read('shared/components/status-badge.js');
  [...src.matchAll(/icon: '([a-z-]+)'/g)].forEach(m=>used.add(m[1]));
  used.forEach(n=>assert(new RegExp("X\\('"+n+"'|['\"]?"+n+"['\"]?\\s*:").test(reg),'icon '+n));
  const css=read('apps/admin/styles/admin-components.css');
  B.TONES.filter(t=>t!=='neutral').forEach(t=>assert(css.includes('.hs-badge--'+t+'{'),t));
  const html=read('apps/admin/index.html');
  assert(html.indexOf('components/status-badge.js"></script>')>0&&html.indexOf('components/status-badge.js"></script>')<html.indexOf('<script src="admin-shell.js">'));
});
test('icon is resolved by bare name (ic is a top-level const in browsers, not window.ic)',()=>{
  const src=read('shared/components/status-badge.js');assert(!/root\.ic\b/.test(src));assert(/typeof ic === 'function'/.test(src));
});
console.log(`\n${passed} passed`);
