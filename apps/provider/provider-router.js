/* Hash router for the isolated provider application. */
'use strict';
(function (root) {
  const ALLOWED = new Set(['home','new','accepted','progress','quote','schedule','done','cancelled','reviews','transactions','earnings','services','notifications','request','profile']);
  function parse(hash) { const raw=String(hash||'').replace(/^#\/?/,'').split('?')[0]; const [page='home',id='']=raw.split('/'); let decoded=''; try { decoded=decodeURIComponent(id); } catch {} return {page:ALLOWED.has(page)?page:'home',id:decoded}; }
  function navigate(page,id='') { const safe=ALLOWED.has(page)?page:'home'; root.location.hash='#/'+safe+(id?'/'+encodeURIComponent(id):''); }
  root.HSProviderRouter = Object.freeze({parse,navigate,allowed:ALLOWED});
})(globalThis);
