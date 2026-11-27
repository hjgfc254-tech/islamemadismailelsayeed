/* boot (head): hero photo preload on the home route + the once-per-session intro check. Moved out of index.html so
   the page carries no inline code (CSP). Runs synchronously in <head>. */
/* الافتتاحية السينمائية: مرة واحدة لكل جلسة. الفحص مبكر لمنع أي وميض عند الدخول الداخلي المتكرر. */
/* LCP: the home hero photo is rendered by JS after ~45 scripts; preloading it on the home route lets it download in parallel. */
(function(){try{if(!location.hash||/^#\/?(home)?$/.test(location.hash)){var h=document.createElement('link');h.rel='preload';h.as='image';h.href='../../assets/brand/'+'hero-tech-v3.jpg';   /* first visit: the onboarding photo covers the hero */h.setAttribute('fetchpriority','high');document.head.appendChild(h);}}catch(e){}})();
(function(){try{var d=document.documentElement;if(sessionStorage.getItem('hs_intro_v1')){d.classList.add('no-intro');}else{sessionStorage.setItem('hs_intro_v1','1');['brand/hsl-mark.svg','brand/hsl-word.png'].forEach(function(n){var l=document.createElement('link');l.rel='preload';l.as='image';l.href='../../assets/'+n;document.head.appendChild(l);});}}catch(e){}})();
