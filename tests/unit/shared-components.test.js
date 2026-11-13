'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const B=require('../../shared/components/buttons');
const F=require('../../shared/components/forms');
const T=require('../../shared/components/tables');
const N=require('../../shared/components/notification-center');

test('button renderer escapes content and disables while loading',()=>{
 const html=B.render('<حفظ>',{loading:true,variant:'danger',type:'submit'});
 assert.match(html,/&lt;حفظ&gt;/);assert.match(html,/disabled/);assert.match(html,/aria-busy="true"/);
 assert.match(html,/hs-button--danger/);
});
test('form fields connect label, hint and error accessibly',()=>{
 const html=F.input({id:'email',label:'البريد',type:'email',required:true,hint:'اكتب بريدك',error:'غير صحيح',value:'a@b'});
 assert.match(html,/for="email"/);assert.match(html,/aria-describedby="email-hint email-error"/);
 assert.match(html,/aria-invalid="true"/);assert.match(html,/role="alert"/);
 assert.match(html,/type="email"/);
});
test('table renderer escapes values and renders accessible empty state',()=>{
 const html=T.render([{key:'name',label:'الاسم'}],[{name:'<script>'}]);
 assert.match(html,/&lt;script&gt;/);assert.match(html,/scope="col"/);
 assert.match(T.render([{key:'name',label:'الاسم'}],[]),/لا توجد بيانات/);
});
test('notification center escapes untrusted text and only renders action with handler',()=>{
 const items=[{id:'n1',title:'<تنبيه>',message:'نص',read:false}];
 const inert=N.render(items);
 assert.match(inert,/&lt;تنبيه&gt;/);assert.doesNotMatch(inert,/data-notification-read/);
 const active=N.render(items,{onMarkRead(){}});
 assert.match(active,/data-notification-read="n1"/);
 assert.match(N.render([]),/role="status"/);
});
