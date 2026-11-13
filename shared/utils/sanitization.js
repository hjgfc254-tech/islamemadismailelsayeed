/**
 * Safe text helpers for HTML-string renderers. Prefer textContent for DOM updates.
 * These helpers do not sanitize arbitrary HTML and must not be used as an HTML allow-list.
 */
'use strict';
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stripControlCharacters=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'');
const cleanText=(value,{maxLength=10000,trim=true}={})=>{
  let s=stripControlCharacters(value);
  if(trim)s=s.trim();
  const max=Math.max(0,Math.trunc(Number(maxLength)||0));
  return s.length>max?s.slice(0,max):s;
};
const safeAttribute=value=>escapeHTML(stripControlCharacters(value).replace(/[\r\n\t]/g,' '));
const api={escapeHTML,stripControlCharacters,cleanText,safeAttribute};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSSanitization=api;
