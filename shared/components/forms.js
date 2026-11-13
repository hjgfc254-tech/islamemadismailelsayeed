/**
 * Shared accessible form-field markup. Does not own form state or submit behavior.
 * `controlHtml` is a caller-supplied trusted HTML control; all text attributes are escaped.
 */
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const idSafe=s=>String(s??'field').replace(/[^a-zA-Z0-9_-]/g,'-');
const field=(options={})=>{
 const o=options||{},id=idSafe(o.id||'field'),label=esc(o.label||''),hint=o.hint?`${id}-hint`:null,error=o.error?`${id}-error`:null;
 const described=[hint,error].filter(Boolean).join(' ');
 const required=o.required===true;
 const attrs=` id="${id}"${required?' required aria-required="true"':''}${described?` aria-describedby="${described}"`:''}${error?' aria-invalid="true"':''}`;
 const control=String(o.controlHtml||`<input type="text"${attrs}>`).replace(/\{\{FIELD_ATTRS\}\}/g,attrs);
 return `<div class="hs-form-field${error?' has-error':''}">${label?`<label for="${id}">${label}${required?' <span aria-hidden="true">*</span>':''}</label>`:''}${control}${hint?`<small id="${hint}" class="hs-form-hint">${esc(o.hint)}</small>`:''}${error?`<small id="${error}" class="hs-form-error" role="alert">${esc(o.error)}</small>`:''}</div>`;
};
const input=(options={})=>{
 const o=options||{},type=['text','email','tel','number','password','search','date'].includes(o.type)?o.type:'text';
 const id=idSafe(o.id||'field');
 return field({...o,controlHtml:`<input type="${type}" id="${id}" name="${esc(o.name||id)}"${o.value!=null?` value="${esc(o.value)}"`:''}${o.placeholder?` placeholder="${esc(o.placeholder)}"`:''}{{FIELD_ATTRS}}>`});
};
const api={field,input};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSForms=api;
