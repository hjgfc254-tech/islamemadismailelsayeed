/**
 * Customer Orders page renderer.
 * Pure presentation: caller supplies the selected filter, fixture records and UI helpers.
 * The module never reads localStorage or mutates the customer application state.
 */
'use strict';
(function(root){
  const FILTERS=Object.freeze([
    {id:'active',label:'جارية'},
    {id:'completed',label:'مكتملة'},
    {id:'cancelled',label:'ملغاة'},
    {id:'all',label:'الكل'}
  ]);
  const render=(ctx={})=>{
    const {customer,orders,filter='active',head,demoBanner,offlineNotice,empty,buttonIcon,requestCard}=ctx;
    if(typeof head!=='function'||typeof demoBanner!=='function'||typeof offlineNotice!=='function'||typeof empty!=='function'||typeof buttonIcon!=='function'||typeof requestCard!=='function')
      throw new Error('HSCustomerOrdersPage: required renderer dependency missing');
    const all=(Array.isArray(orders)?orders:[]).slice().sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
    /* first server sync still running: placeholder cards instead of a misleading «no orders» */
    if(ctx.loading&&!all.length){
      return `<div class="screen">${head('طلباتي')}<div class="plist" aria-busy="true" aria-label="جارٍ تحميل طلباتك">${'<div class="sk-card"><span class="sk sk-line w60"></span><span class="sk sk-line w40"></span><span class="sk sk-line w80"></span></div>'.repeat(3)}</div></div>`;
    }
    if(!customer||!all.length){
      return `<div class="screen">${head('طلباتي')}${demoBanner()}${offlineNotice()}${empty('list','مفيش طلبات لسه','اختر خدمة من الرئيسية وأرسل طلبك')}<button class="cta" data-go="home">${buttonIcon('home')} اطلب خدمة</button></div>`;
    }
    const selected=FILTERS.some(x=>x.id===filter)?filter:'active';
    const groups={
      active:all.filter(x=>!['closed','cancelled','failed'].includes(x.status)),
      completed:all.filter(x=>x.status==='closed'),
      cancelled:all.filter(x=>['cancelled','failed'].includes(x.status)),
      all
    };
    const filterBar=`<div class="order-filter" role="group" aria-label="تصفية الطلبات">${FILTERS.map(({id,label})=>`<button type="button" data-order-filter="${id}" aria-pressed="${selected===id}" class="${selected===id?'on':''}">${label}<span>${groups[id].length}</span></button>`).join('')}</div>`;
    const items=groups[selected]||groups.active;
    const content=items.length?`<div class="plist">${items.map(x=>requestCard(x)).join('')}</div>`:empty('inbox','لا توجد طلبات في هذا القسم','ستظهر طلباتك هنا عند توفرها');
    return `<div class="screen">${head('طلباتي')}${demoBanner()}${offlineNotice()}${filterBar}<div class="orders-results" aria-live="polite">${content}</div></div>`;
  };
  root.HSCustomerOrdersPage=Object.freeze({render,FILTERS});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.HSCustomerOrdersPage;
})(typeof globalThis!=='undefined'?globalThis:this);
