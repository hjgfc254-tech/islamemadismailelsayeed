/* اختبارات ui-kit.js (V8-C2) بمحاكاة Node: node tests/ui-kit.test.js */
const fs=require('fs'),vm=require('vm'),path=require('path');
const dir=path.join(__dirname,'../..');
let pass=0,fail=0; const ok=(c,m)=>{ if(c)pass++; else {fail++; console.log('FAIL:',m);} };
const body={kids:[],appendChild(n){this.kids.push(n);}};
const listeners={};
const mk=()=>{ const n={className:'',innerHTML:'',removed:false,l:{},focused:false,
  addEventListener(t,f){this.l[t]=f;}, remove(){this.removed=true;body.kids=body.kids.filter(k=>k!==this);},
  querySelector(sel){ return {focus:()=>{n.focused=true;}}; } }; return n; };
const toastEl={dataset:{}};
const toasts=[];
const ctx={console,setTimeout:(f)=>0,
  esc:s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
  ic:n=>`<i class="i ${n}"></i>`, toast:m=>toasts.push(m),
  document:{createElement:mk,body,activeElement:null,getElementById:id=>id==='toast'?toastEl:null,
    addEventListener:(t,f)=>{listeners[t]=f;},removeEventListener:(t)=>{delete listeners[t];}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir,'shared/components/ui-kit.js'),'utf8').replace(/^'use strict';/m,'')+';this.UIK=UIK',ctx);
const U=ctx.UIK;
ok(U.loading().includes('is-loading')&&U.loading('x').includes('>x<'),'loading');
ok(U.loading('<b>').includes('&lt;b&gt;'),'loading escapes text');
ok((U.skeleton(3,'row').match(/skel-row/g)||[]).length===3,'skeleton count');
ok(U.skeleton(0).includes('skel-card'),'skeleton min 1');
ok(U.empty('list','فارغ','وصف').includes('فارغ')&&U.empty('list','فارغ','وصف').includes('<small>وصف</small>'),'empty');
ok(!U.empty('list','فارغ').includes('<small>'),'empty without sub');
ok(U.error('خطأ').includes('role="alert"')&&!U.error('خطأ').includes('button'),'error without retry has no button');
ok(U.error('خطأ','retry').includes('data-act="retry"'),'error with retry');
ok(U.success('check','تم').includes('need ok'),'success');
ok(U.offline().includes('is-offline'),'offline');
U.toastKind('تم','ok'); ok(toasts.pop()==='تم'&&toastEl.dataset.kind==='ok','toast kind set');
(async()=>{
  const p=U.confirmDialog({title:'حذف',message:'متأكد؟',okText:'احذف',danger:true});
  const dlg=body.kids[0]; ok(!!dlg&&dlg.innerHTML.includes('احذف')&&dlg.innerHTML.includes('danger'),'dialog rendered');
  dlg.l.click({target:{closest:()=>({dataset:{uik:'yes'}})}});
  ok(await p===true,'confirm resolves true'); ok(dlg.removed&&body.kids.length===0,'dialog removed');
  const p2=U.confirmDialog({}); const d2=body.kids[0];
  listeners.keydown({key:'Escape',stopPropagation(){}});
  ok(await p2===false,'Escape resolves false'); ok(d2.removed,'dialog removed on Escape');
  const p3=U.confirmDialog({}); const p4=U.confirmDialog({});
  ok(await p3===false,'second dialog cancels the first'); ok(body.kids.length===1,'only one dialog open');
  body.kids[0].l.click({target:{closest:()=>({dataset:{uik:'no'}})}}); ok(await p4===false,'cancel resolves false');
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})();
