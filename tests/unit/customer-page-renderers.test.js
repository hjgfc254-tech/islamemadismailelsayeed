'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Home=require('../../apps/customer/pages/home.page');
const Orders=require('../../apps/customer/pages/orders.page');
const Details=require('../../apps/customer/pages/order-details.page');
const detailsContext=(request,overrides={})=>{
 const MP={
  get:(collection,id)=>collection==='serviceRequests'&&request.id===id?request:null,
  providerOf:()=>null,activeAssignment:()=>null,db:()=>({reviews:[]}),
  currentQuote:()=>null,catName:()=> 'أجهزة منزلية',
  getReview:()=>null
 };
 return {
  id:request.id,MP,head:(t)=>`<h1>${t}</h1>`,demoBanner:()=>'<aside>DEMO</aside>',
  uiOfflineIfNeeded:()=>'',uiEmpty:(i,t)=>`<p>${t}</p>`,esc:s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
  ic:n=>`<i>${n}</i>`,icStatus:s=>s,STATUS_LABEL:{searching:'جارٍ البحث',closed:'مغلق',completed:'مكتمل',cancelled:'ملغي',failed:'فشل'},
  money:n=>`${n} ج.م`,fmtDT:s=>String(s||''),statusTimeline:()=>'<ol class="tl"><li>history</li></ol>',
  uiSuccess:(i,t)=>`<p>${t}</p>`,starsHtml:n=>`${n} نجوم`,
  ...overrides
 };
};
test('order details renderer handles a missing request without crashing',()=>{
 const req={id:'missing'};
 const ctx=detailsContext(req,{MP:{get:()=>null}});
 const html=Details.render(ctx);
 assert.match(html,/الطلب غير موجود/);
});
test('order details renderer shows tracking state, provider search and customer actions only',()=>{
 const req={id:'r1',no:12,status:'searching',cat:'appliances',catName:'أجهزة',serviceName:'غسالة',gov:'الجيزة',area:'العجوزة',addr:'شارع 1',desc:'لا تعمل',createdAt:'2026-11-12'};
 const html=Details.render(detailsContext(req));
 assert.match(html,/متابعة الطلب #12/);assert.match(html,/جارٍ البحث عن مقدم خدمة/);
 assert.match(html,/مسار الطلب/);assert.match(html,/history/);assert.match(html,/لا تعمل/);
 assert.match(html,/data-act="viewMatches"/);assert.match(html,/data-act="cancelReq"/);
 assert.match(html,/data-act="complain"/);
 // No provider-side controls for the customer (simAdvance/simQuote removed 2026-11-14).
 assert.doesNotMatch(html,/data-act="sim(Advance|Quote)"/);assert.match(html,/يحدّث مقدم الخدمة حالة الطلب من تطبيقه/);
});
test('order details renderer exposes rating only after local completion and closed status',()=>{
 const req={id:'r2',no:13,status:'closed',cat:'electric',serviceName:'كهرباء',gov:'القاهرة',area:'المعادي'};
 const html=Details.render(detailsContext(req));
 assert.match(html,/data-act="rate"/);assert.doesNotMatch(html,/data-act="cancelReq"/);
 assert.doesNotMatch(html,/data-act="simAdvance"/);
});

const homeContext=()=>{
 const calls=[];
 const fn=name=>(...args)=>{calls.push([name,...args]);return `<i data-part="${name}"></i>`;};
 return {calls,ctx:{
  topbar:fn('topbar'),renderGreeting:fn('greeting'),renderDraftResume:fn('draft'),
  ic:name=>`<svg data-icon="${name}"></svg>`,ART:{hero:'<svg data-hero="art"></svg>'},
  renderQuickActions:fn('quick'),renderActiveRequests:fn('active'),tiles:fn('tiles'),
  renderCommonProblems:fn('problems'),renderRecentUsed:fn('recent'),renderSavedAddresses:fn('addresses'),
  renderFavorites:fn('favorites'),discover:fn('discover'),renderServiceAreas:fn('areas')
 }};
};
const orderContext=(overrides={})=>({
 customer:{id:'c1'},orders:[],filter:'active',
 head:title=>`<h1>${title}</h1>`,demoBanner:()=>'<aside>DEMO</aside>',
 offlineNotice:()=>'<aside>ONLINE</aside>',empty:(i,t,s)=>`<p data-empty="${i}">${t}|${s}</p>`,
 buttonIcon:n=>`<b>${n}</b>`,requestCard:r=>`<article data-order="${r.id}">${r.id}</article>`,
 ...overrides
});
test('home renderer composes all home sections in stable order',()=>{
 const {ctx,calls}=homeContext(); const html=Home.render(ctx);
 for(const marker of ['data-part="topbar"','data-part="greeting"','data-part="draft"','data-hero="art"','id="q"','id="home-sg"','data-part="quick"','data-part="active"','data-part="tiles"','data-part="problems"','data-part="recent"','data-part="addresses"','data-part="favorites"','data-part="discover"','data-part="areas"','href="../provider/index.html#/join"']) assert.ok(html.includes(marker),marker);
 assert.deepEqual(calls.map(x=>x[0]),['topbar','greeting','draft','quick','active','tiles','problems','recent','addresses','favorites','discover','areas']);
});
test('home renderer rejects incomplete dependency contracts',()=>assert.throws(()=>Home.render({topbar(){}}),/missing dependencies/));
test('orders page renders demo empty state and call to action for signed-out customers',()=>{
 const html=Orders.render(orderContext({customer:null}));
 assert.match(html,/طلباتي/);assert.match(html,/DEMO/);assert.match(html,/مفيش طلبات لسه/);assert.match(html,/data-go="home"/);
});
test('orders page groups statuses and preserves selected filter state',()=>{
 const orders=[{id:'active-1',status:'accepted',createdAt:'2026-11-12'},{id:'done-1',status:'closed',createdAt:'2026-11-10'},{id:'cancel-1',status:'cancelled',createdAt:'2026-11-11'},{id:'failed-1',status:'failed',createdAt:'2026-11-09'}];
 const html=Orders.render(orderContext({orders,filter:'completed'}));
 assert.match(html,/data-order-filter="completed" aria-pressed="true"/);assert.match(html,/data-order="done-1"/);assert.doesNotMatch(html,/data-order="active-1"/);
 for(const id of ['active','cancelled','all']) assert.match(html,new RegExp(`data-order-filter="${id}"`));
});
test('orders page defaults invalid filter and renders empty selected group',()=>{
 const html=Orders.render(orderContext({orders:[{id:'done',status:'closed'}],filter:'unknown'}));
 assert.match(html,/data-order-filter="active" aria-pressed="true"/);assert.match(html,/لا توجد طلبات في هذا القسم/);
});
test('orders page sorts newest first',()=>{
 const seen=[]; const ctx=orderContext({orders:[{id:'old',status:'accepted',createdAt:'2026-01-01'},{id:'new',status:'accepted',createdAt:'2026-02-01'}],requestCard:r=>(seen.push(r.id),`<i>${r.id}</i>`)});
 Orders.render(ctx);assert.deepEqual(seen,['new','old']);
});
