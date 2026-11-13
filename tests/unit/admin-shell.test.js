'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const shell=require(path.join(root,'apps/admin/admin-shell.js'));
const I=shell._internals;
test('navigation covers every documented admin page except hidden sub-pages',()=>{
  const ids=I.flatItems().map(i=>i.id);
  const pageFiles=fs.readdirSync(path.join(root,'apps/admin/pages')).map(f=>f.replace('.page.js',''));
  const map={'admin-dashboard':'dashboard','finance-dashboard':'finance','system-settings':'settings','audit-log':'audit','providers-management':'providers','customers-management':'customers','orders-management':'orders','quotes-management':'quotes','services-management':'services','categories-management':'categories','complaints-management':'complaints','reviews-management':'reviews','notifications-management':'notifications'};
  for(const f of pageFiles){ if(I.HIDDEN_PAGES[f]) continue; const id=map[f]||f; assert(ids.includes(id),'missing nav item for '+f+' ('+id+')'); }
  assert.strictEqual(new Set(ids).size,ids.length,'duplicate nav ids');
});
test('parseHash resolves routes and falls back to the dashboard',()=>{
  assert.strictEqual(I.parseHash('#/orders'),'orders');
  assert.strictEqual(I.parseHash('#/orders/123'),'orders');
  assert.strictEqual(I.parseHash(''),shell.DEFAULT_ROUTE);
  assert.strictEqual(I.parseHash('#/<script>'),shell.DEFAULT_ROUTE);
});
test('breadcrumbs: group, page and hidden sub-page parent',()=>{
  const b=I.breadcrumbsFor('orders');assert.deepStrictEqual(b.map(x=>x.label),['الإدارة','العمليات','الطلبات']);
  const e=I.breadcrumbsFor('employee-details');assert.deepStrictEqual(e.map(x=>x.label),['الإدارة','الفريق والصلاحيات','فريق العمل','تفاصيل الموظف']);
  assert.strictEqual(e[2].id,'workforce');
  assert.strictEqual(I.breadcrumbsFor('nope').length,2);
});
test('esc neutralises markup',()=>{assert.strictEqual(I.esc('<a onclick="x">&\''),'&lt;a onclick=&quot;x&quot;&gt;&amp;&#39;')});
test('registerPage validates input and rejects unknown ids',()=>{
  assert.throws(()=>shell.registerPage('orders',{title:'x'}),TypeError);
  assert.throws(()=>shell.registerPage('not-a-page',{title:'x',render(){}}),RangeError);
});
test('admin entry resolves its local assets and exposes a mount point',()=>{
  const html=fs.readFileSync(path.join(root,'apps/admin/index.html'),'utf8');
  for(const m of html.matchAll(/<(?:script[^>]+src|link[^>]+href)=["']([^"']+)["']/g)){ if(/^https?:/.test(m[1])) continue; assert(fs.existsSync(path.resolve(root,'apps/admin',m[1])),m[1]); }
  assert(html.includes('data-admin-shell'));
  const ids=[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(x=>x[1]);assert.strictEqual(new Set(ids).size,ids.length);
});
console.log(`\n${passed} passed`);
