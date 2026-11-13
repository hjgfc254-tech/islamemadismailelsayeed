/**
 * Explicit local UI feature flags. Defaults are conservative and never grant access.
 * Overrides are intended for local/demo presentation only, not security decisions.
 */
'use strict';
const DEFAULT_FLAGS=Object.freeze({
 customerSearchSuggestions:true,customerGuideCarousel:true,requestWizardAttachments:true,
 providerIndependentShell:false,adminIndependentAuth:false,experimentalNotifications:false
});
const createFlags=(overrides={})=>{
 const result={...DEFAULT_FLAGS};
 if(overrides&&typeof overrides==='object')Object.keys(DEFAULT_FLAGS).forEach(k=>{if(typeof overrides[k]==='boolean')result[k]=overrides[k];});
 return Object.freeze(result);
};
const current=createFlags(typeof globalThis!=='undefined'?globalThis.HS_FEATURE_OVERRIDES:null);
const enabled=(name,flags=current)=>Object.prototype.hasOwnProperty.call(flags,name)?flags[name]===true:false;
const api={DEFAULT_FLAGS,createFlags,enabled,current};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSFeatureFlags=api;
