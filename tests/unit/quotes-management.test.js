'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const Q=require(path.join(root,'apps/admin/pages/quotes-management.page.js'));
const O=require(path.join(root,'apps/admin/pages/orders-management.page.js'));
const G=require(path.join(root,'shared/components/data-grid.js'));
const fx=()=>Q.buildQuotes(), msg=(f,m)=>assert.throws(f,(e)=>e.message===m,m);
const byStatus=(s)=>fx().find(q=>Q.effective(q)===s);
test('quotes are derived from the orders fixtures: exactly the orders that reached the quote stage, same provider/amount/customer',()=>{
  const q=fx(),orders=O.buildFixtures();
  const expect=orders.filter(o=>Q.QUOTE_ORDER_STATUS[o.status]&&o.provider&&o.amount>0);
  assert.strictEqual(q.length,expect.length);assert(q.length>0);assert.deepStrictEqual(Q.validate(q,orders),[]);
  expect.forEach(o=>{const x=q.find(y=>y.orderNo===o.no);assert(x,'order '+o.no);assert.strictEqual(x.amount,o.amount);assert.strictEqual(x.provider,o.provider);assert.strictEqual(x.customer,o.customer);});
  Object.keys(Q.QUOTE_ORDER_STATUS).forEach(s=>assert(Object.prototype.hasOwnProperty.call(O.NEXT,s),'order status '+s+' must exist in the orders model'));
});
test('every demo state is reachable: awaiting, expired, approved, returned',()=>{
  ['submitted','expired','approved','returned'].forEach(s=>assert(byStatus(s),s));
});
test('validation catches duplicates, unknown order, mismatches, bad amount/dates, rejected without reason',()=>{
  const b=fx()[0],bad=(o)=>Q.validate([Object.assign({},b,o)]);
  assert(Q.validate([b,b]).some(x=>/duplicate/.test(x)));assert(bad({orderNo:999999}).some(x=>/unknown order/.test(x)));
  assert(bad({amount:b.amount+1}).some(x=>/amount differs/.test(x)));assert(bad({provider:'غير موجود'}).some(x=>/provider differs/.test(x)));assert(bad({customer:'x'}).some(x=>/customer differs/.test(x)));
  assert(bad({status:'zz'}).some(x=>/status/.test(x)));assert(bad({status:'expired'}).some(x=>/status/.test(x)));assert(bad({amount:0}).length>0);
  assert(bad({validUntil:'nope'}).some(x=>/date/.test(x)));assert(bad({validUntil:'2000-01-01'}).some(x=>/before submission/.test(x)));
  assert(bad({status:'rejected',decisionReason:''}).some(x=>/reason/.test(x)));
});
test('effective status: only a submitted quote past its validity day is expired',()=>{
  const q=byStatus('submitted'),day=Q.DEMO_NOW.slice(0,10);
  assert.strictEqual(Q.effective(Object.assign({},q,{validUntil:day})),'submitted');assert.strictEqual(Q.effective(Object.assign({},q,{validUntil:'2026-11-08'})),'expired');
  assert.strictEqual(Q.effective(Object.assign({},byStatus('approved'),{validUntil:'2020-01-01'})),'approved');
});
test('counts match a manual recount and approved amount equals the sum of approved quotes',()=>{
  const l=fx(),c=Q.counts(l);assert.strictEqual(c.total,l.length);assert.strictEqual(c.awaiting+c.expired+c.approved+c.returned+c.rejected,l.length);
  assert.strictEqual(c.approved,l.filter(q=>q.status==='approved').length);assert.strictEqual(c.approvedAmount,l.filter(q=>q.status==='approved').reduce((s,q)=>s+q.amount,0));
  assert.strictEqual(c.expired,l.filter(q=>Q.effective(q)==='expired').length);
});
test('decisions: allowed set, expired cannot be approved, reasons for return/reject, finality, immutability',()=>{
  const l=fx(),snap=JSON.stringify(l),sub=byStatus('submitted'),exp=byStatus('expired'),ret=byStatus('returned'),app=byStatus('approved');
  assert.deepStrictEqual(Q.allowedActions(sub),['approved','returned','rejected']);assert.deepStrictEqual(Q.allowedActions(exp),['returned','rejected']);
  assert.deepStrictEqual(Q.allowedActions(ret),['rejected']);assert.deepStrictEqual(Q.allowedActions(app),[]);
  msg(()=>Q.decide(l,[],exp.id,'approved'),'Quote expired');msg(()=>Q.decide(l,[],app.id,'rejected',{note:'سبب كافٍ'}),'Decision not allowed');msg(()=>Q.decide(l,[],ret.id,'approved'),'Decision not allowed');
  msg(()=>Q.decide(l,[],'zz','approved'),'Unknown quote');msg(()=>Q.decide(l,[],sub.id,'returned',{note:' '}),'Reason required');msg(()=>Q.decide(l,[],sub.id,'rejected',{note:'ab'}),'Reason required');msg(()=>Q.decide(l,[],sub.id,'rejected',{note:'x'.repeat(301)}),'Reason required');
  const a=Q.decide(l,[],sub.id,'approved');assert.strictEqual(a.quotes.find(q=>q.id===sub.id).status,'approved');assert.strictEqual(a.log.length,1);
  msg(()=>Q.decide(a.quotes,a.log,sub.id,'rejected',{note:'سبب كافٍ'}),'Decision not allowed');
  const r=Q.decide(l,[],ret.id,'rejected',{note:' سعر مرتفع '});assert.strictEqual(r.quotes.find(q=>q.id===ret.id).decisionReason,'سعر مرتفع');assert.deepStrictEqual(Q.validate(r.quotes),[]);
  assert.strictEqual(JSON.stringify(l),snap);
});
test('grid: search by reference/order/customer/provider and filters',()=>{
  const v=(st)=>G.computeView(fx().map(Q.toRow),Q.GRID_CFG,Object.assign({search:'',filters:{},sort:null,page:1,pageSize:50},st));
  const q=fx()[0];assert.strictEqual(v({search:q.ref}).matched,1);assert(v({search:'#'+q.orderNo}).matched>=1);assert.strictEqual(v({search:'zzzz'}).matched,0);
  assert.strictEqual(v({filters:{shown:'expired'}}).matched,Q.counts(fx()).expired);assert.strictEqual(v({filters:{provider:q.provider}}).matched,fx().filter(x=>x.provider===q.provider).length);
});
test('no real surface (notify/send/pay), no network or storage; depends on the orders page, not a copy of orders',()=>{
  const src=fs.readFileSync(path.join(root,'apps/admin/pages/quotes-management.page.js'),'utf8');
  for(const k of Object.keys(Q))assert.doesNotMatch(k,/^(send|notify|pay|charge|export|delete|persist)/i,k);
  assert.doesNotMatch(src,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|Blob\(|createObjectURL/);
  assert.match(src,/HSAdminOrdersPage/);assert.match(src,/لا تتغير حالة أي طلب/);assert.match(src,/STATUS: IMPLEMENTED \(DEMO\)/);
});
console.log('quotes-management.test.js: '+passed+' checks');
