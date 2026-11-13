/**
 * Shared semantic button renderer. Presentation only; callers own actions and state.
 * API: HSButtons.render(label, options) -> HTML string.
 */
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const VARIANTS=['primary','secondary','danger','ghost'];
const SIZES=['sm','md','lg'];
const render=(label,options={})=>{
 const o=options||{},variant=VARIANTS.includes(o.variant)?o.variant:'primary',size=SIZES.includes(o.size)?o.size:'md';
 const type=['button','submit','reset'].includes(o.type)?o.type:'button';
 const disabled=o.disabled===true||o.loading===true;
 const text=esc(label);
 const aria=o.accessibleLabel?` aria-label="${esc(o.accessibleLabel)}"`:'';
 const title=o.title?` title="${esc(o.title)}"`:'';
 const icon=o.icon?`<span class="hs-button__icon" aria-hidden="true">${esc(o.icon)}</span>`:'';
 return `<button type="${type}" class="hs-button hs-button--${variant} hs-button--${size}"${disabled?' disabled':''}${o.loading?' aria-busy="true"':''}${aria}${title}>${icon}<span class="hs-button__label">${text}</span>${o.loading?'<span class="hs-button__loading" aria-hidden="true"></span>':''}</button>`;
};
const api={render,VARIANTS,SIZES};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSButtons=api;
