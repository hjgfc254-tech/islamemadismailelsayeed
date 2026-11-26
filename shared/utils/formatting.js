/** Shared locale-aware display formatters. Formatting only; no business calculations. */
'use strict';
const number=(value,options={})=>{
  const n=Number(value); if(value==null||value===''||!Number.isFinite(n))return '';
  return new Intl.NumberFormat(options.locale||'ar-EG-u-nu-latn',{maximumFractionDigits:options.maximumFractionDigits??2,...options}).format(n);
};
const currency=(value,options={})=>{
  const n=Number(value); if(value==null||value===''||!Number.isFinite(n))return '';
  return new Intl.NumberFormat(options.locale||'ar-EG-u-nu-latn',{style:'currency',currency:options.currency||'EGP',maximumFractionDigits:options.maximumFractionDigits??2}).format(n);
};
const percent=(value,options={})=>{
  const n=Number(value); if(value==null||value===''||!Number.isFinite(n))return '';
  return new Intl.NumberFormat(options.locale||'ar-EG-u-nu-latn',{style:'percent',maximumFractionDigits:options.maximumFractionDigits??1}).format(n);
};
const compact=(value,options={})=>{
  const n=Number(value); if(value==null||value===''||!Number.isFinite(n))return '';
  return new Intl.NumberFormat(options.locale||'ar-EG-u-nu-latn',{notation:'compact',maximumFractionDigits:options.maximumFractionDigits??1}).format(n);
};
const phone=(value)=>String(value??'').replace(/[^\d+]/g,'');
const truncate=(value,max=80)=>{const s=String(value??'');const n=Math.max(0,Math.trunc(Number(max)||0));return s.length>n?(n>1?s.slice(0,n-1)+'…':'…'):s;};
const api={number,currency,percent,compact,phone,truncate};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSFormatting=api;
