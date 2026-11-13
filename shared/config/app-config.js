/**
 * Safe frontend runtime configuration. Values are public UI configuration only.
 * Never put secrets, credentials, or environment-specific private values here.
 */
'use strict';
const DEFAULTS=Object.freeze({
 appName:'هنصلحلك',version:'8.0.0',locale:'ar-EG',direction:'rtl',currency:'EGP',
 supportPhone:'',demoMode:true,storagePrefix:'hs-v8',dateLocale:'ar-EG'
});
const createConfig=(overrides={})=>{
 const input=overrides&&typeof overrides==='object'?overrides:{};
 const out={...DEFAULTS};
 for(const key of Object.keys(DEFAULTS)){
  if(input[key]!==undefined && typeof input[key]===typeof DEFAULTS[key])out[key]=input[key];
 }
 out.demoMode=true; // This frontend package is explicitly demo/local-only.
 return Object.freeze(out);
};
const config=createConfig(typeof globalThis!=='undefined'?globalThis.HS_PUBLIC_CONFIG:{});
const api={DEFAULTS,createConfig,config};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSAppConfig=api;
