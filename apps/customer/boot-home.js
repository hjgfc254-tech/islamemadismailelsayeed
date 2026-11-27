/* boot (after #view): the home boot screen (navy band + hero photo) painted before the app scripts. Moved out of
   index.html so the page carries no inline code (CSP). Must run right after the #view element. */
/* LCP (perf runner: Home LCP was the hero photo painted only after ~45 scripts): on the Home route the boot screen
     already shows the navy header band and the hero photo (preloaded above); the first render replaces it with the
     same picture, so the page looks finished from the first paint. */
  (function(){try{if(location.hash&&!/^#\/?(home)?$/.test(location.hash))return;if(localStorage.getItem('hs_onboard_v1')===null||innerWidth>=1024)return;var v=document.getElementById('view');if(!v)return;
    v.innerHTML='<div class="boot-home" aria-hidden="true" style="margin:calc(-1*(env(safe-area-inset-top) + 8px)) calc(-1*var(--pad,16px)) 0;background:#0B1F3A">'
      +'<div style="height:clamp(58px,17vw,72px)"></div>'
      +'<div style="position:relative;height:330px;overflow:hidden"><img src="../../assets/brand/hero-tech-v3.jpg" alt="" width="900" height="1115" fetchpriority="high" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:78% 20%">'
      +'<div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(11,31,58,.94) 0%,rgba(11,31,58,.78) 38%,rgba(11,31,58,.25) 62%,rgba(11,31,58,0) 80%)"></div></div></div>'
      +'<p role="status" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">جاري التحميل…</p>';}catch(e){}})();
