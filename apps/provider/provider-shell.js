/* Provider-only DOM shell; does not mount customer navigation or customer state. */
'use strict';
(function (root) {
  function mount() {
    const host=document.getElementById('provider-app');
    if(!host) throw new Error('Provider root #provider-app was not found');
    host.innerHTML=`<div class="pv-app"><header class="pv-topbar"><a class="pv-brand" href="#/home">هنصلحلك <span>مساحة مقدم الخدمة</span></a><div class="pv-top-actions">${globalThis.HSFirebaseConfig&&globalThis.HSFirebaseConfig.mode==='firebase'?'':'<span class="pv-demo">بيئة تجريبية</span>'}<button type="button" class="pv-icon-btn" data-pv-action="logout" hidden>خروج</button></div></header><main id="provider-view" class="pv-main" tabindex="-1"></main><nav id="provider-nav" class="pv-nav" aria-label="تنقل مقدم الخدمة" hidden></nav><div id="provider-toast" class="pv-toast" role="status" aria-live="polite"></div></div>`;
    return {host,view:host.querySelector('#provider-view'),nav:host.querySelector('#provider-nav'),toast:host.querySelector('#provider-toast')};
  }
  root.HSProviderShell=Object.freeze({mount});
})(globalThis);
