'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../../shared/utils/dates');
const E=require('../../shared/utils/errors');
const F=require('../../shared/utils/formatting');
const S=require('../../shared/utils/sanitization');
const V=require('../../shared/utils/validation');
const C=require('../../shared/config/app-config');
const R=require('../../shared/config/routes');
const FF=require('../../shared/config/feature-flags');
const O=require('../../shared/types/order.types');
const A=require('../../shared/types/account.types');
const P=require('../../shared/types/provider.types');
const PM=require('../../shared/types/permission.types');

test('date helpers reject invalid input and return stable ISO date',()=>{
 assert.equal(D.toDate('not-a-date'),null); assert.equal(D.toISODate('bad'),null);
 assert.equal(D.toISODate('2026-11-13T10:00:00Z'),'2026-11-13');
 assert.equal(D.compareDates('2026-01-02','2026-01-01'),1);
 assert.equal(D.addDays('2026-01-01',2).toISOString().slice(0,10),'2026-01-03');
 assert.equal(D.startOfDay('bad'),null);
});
test('date formatting is safe for missing and invalid values',()=>{
 assert.equal(D.formatDate(null),''); assert.equal(D.formatDateTime('bad'),'');
 assert.match(D.formatDate('2026-11-13'),/٢٠٢٦|2026/);
});
test('error normalization hides raw details and classifies retryable errors',()=>{
 assert.equal(E.normalizeError(new Error('secret')).message,E.DEFAULT_MESSAGE);
 assert.equal(E.normalizeError({status:503}).retryable,true);
 assert.equal(E.normalizeError({status:403}).kind,'authorization');
 assert.equal(E.normalizeError({name:'AbortError'}).kind,'cancelled');
 assert.equal(E.toError('x').message,'x');
});
test('formatters handle invalid values and locale-aware currency',()=>{
 assert.equal(F.number('x'),''); assert.equal(F.currency(null),'');
 assert.match(F.currency(125),/١٢٥|125/); assert.equal(F.phone('+20 (10) 123-45678'),'+201012345678');
 assert.equal(F.truncate('abcdef',4),'abc…');
});
test('sanitization escapes markup and removes control characters',()=>{
 assert.equal(S.escapeHTML(`<x a="b">`),'&lt;x a=&quot;b&quot;&gt;');
 assert.equal(S.cleanText('  a\u0000b  '),'ab');
 assert.equal(S.safeAttribute('a\nb'),'a b');
});
test('validation primitives cover required, email, phone and bounds',()=>{
 assert.ok(V.required('','الاسم')); assert.equal(V.required('اسم'),null);
 assert.equal(V.isEmail('a@b.com'),true); assert.equal(V.isEmail('no'),false);
 assert.equal(V.isEgyptianPhone('01012345678'),true);
 assert.equal(V.inRange(4,1,5),true); assert.equal(V.inRange('x',1,5),false);
 assert.deepEqual(V.validate('',{required:true}),['هذا الحقل مطلوب.']);
});
test('app config is frozen, typed and remains demo-only',()=>{
 const c=C.createConfig({locale:'en-US',demoMode:false,version:9,unknown:1});
 assert.equal(c.locale,'en-US'); assert.equal(c.demoMode,true); assert.equal(c.version,'8.0.0');
 assert.ok(Object.isFrozen(c)); assert.equal(c.unknown,undefined);
});
test('route registry resolves canonical identifiers without implying authorization',()=>{
 assert.equal(R.routeId('customer','orders'),'orders');
 assert.equal(R.hasRoute('provider','dashboard'),true);
 assert.equal(R.hasRoute('admin','unknown'),false);
});
test('feature flags accept booleans only and default unknown flags off',()=>{
 const f=FF.createFlags({customerSearchSuggestions:false,providerIndependentShell:'yes'});
 assert.equal(FF.enabled('customerSearchSuggestions',f),false);
 assert.equal(f.providerIndependentShell,false);
 assert.equal(FF.enabled('not-a-flag',f),false);
});
test('order contract validates id, known status and non-negative totals',()=>{
 assert.equal(O.validateOrder({id:'o1',status:'received',total:10}).valid,true);
 assert.equal(O.validateOrder({id:'',status:'made-up',total:-1}).valid,false);
});
test('account and provider contracts validate structural values',()=>{
 assert.equal(A.validateAccount({id:'a1',role:'customer',status:'active'}).valid,true);
 assert.equal(A.validateAccount({id:'a2',role:'root'}).valid,false);
 assert.equal(P.validateProvider({id:'p1',status:'approved',rating:4.5,services:[]}).valid,true);
 assert.equal(P.validateProvider({id:'p2',rating:8}).valid,false);
});
test('permission vocabulary is presentation-only and validates permission records',()=>{
 assert.equal(PM.validatePermission({key:'orders.view',label:'عرض الطلبات',action:'view',enabled:true}).valid,true);
 assert.equal(PM.validatePermission({key:'Bad Key',label:''}).valid,false);
});
