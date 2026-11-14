/**
 * Customer Home page renderer.
 * Pure presentation module: all state/data/actions arrive through explicit dependencies.
 * Does not access DOM, storage, network, or global application state.
 */
'use strict';
(function(root){
  const REQUIRED=['topbar','renderGreeting','renderDraftResume','ic','ART','renderQuickActions','renderActiveRequests','tiles','renderCommonProblems','renderRecentUsed','renderSavedAddresses','renderFavorites','discover','renderServiceAreas'];
  const render=(ctx={})=>{
    const missing=REQUIRED.filter(k=>ctx[k]===undefined || ctx[k]===null);
    if(missing.length) throw new Error('HSCustomerHomePage: missing dependencies: '+missing.join(', '));
    const {topbar,renderGreeting,renderDraftResume,ic,ART,renderQuickActions,renderActiveRequests,tiles,renderCommonProblems,renderRecentUsed,renderSavedAddresses,renderFavorites,discover,renderServiceAreas}=ctx;
    return `<div class="screen">${topbar()}
  ${renderGreeting()}
  ${renderDraftResume()}
  <section class="hero">
    <div class="txt"><h1>عندك مشكلة؟<br><span>هنوصلك بالمتخصص المناسب</span></h1><p>اطلب خدمتك بسهولة، وهنساعدك توصل لمقدم الخدمة المناسب.</p><button class="hero-cta" data-act="newReq">${ic('wrench')} اطلب خدمتك الآن</button></div>
    <div class="art">${ART.hero}</div>
  </section>
  <div class="search">
    <button class="cam" data-act="cam" aria-label="تصوير المشكلة لإرفاقها بطلبك">${ic('camera')}</button>
    <label class="field glass neon">${ic('search')}<input id="q" type="search" aria-label="ابحث عن فني أو خدمة" placeholder="بتدور على فني أو خدمة معينة؟" enterkeyhint="search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="home-sg"></label>
  </div>
  <div id="home-sg" class="hs-suggest home-sg" role="listbox" hidden></div>
  ${renderQuickActions()}
  ${renderActiveRequests()}
  <h2 class="sec-title" id="tilesT">${ic('grid')}اختر الخدمة</h2>
  ${tiles()}
  ${renderCommonProblems()}
  ${renderRecentUsed()}
  ${renderSavedAddresses()}
  ${renderFavorites()}
  ${discover()}
  ${renderServiceAreas()}
  <div class="join glass neon">${ic('user')}<div><b>عايز تقدم خدماتك؟</b><small>انضم كمقدم خدمة — التسجيل يُراجَع من الإدارة قبل استقبال الطلبات</small></div><a class="tag" href="../provider/index.html#/join">انضم كمقدم خدمة</a></div>
  </div>`;
  };
  root.HSCustomerHomePage=Object.freeze({render,dependencies:REQUIRED.slice()});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.HSCustomerHomePage;
})(typeof globalThis!=='undefined'?globalThis:this);
