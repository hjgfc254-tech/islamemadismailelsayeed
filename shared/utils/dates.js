/**
 * Shared date helpers. Pure, locale-safe and timezone-explicit where possible.
 * No DOM, storage, network or global mutation.
 */
'use strict';
const isValidDate = value => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime());
};
const toDate = value => {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
};
const toISODate = value => { const d=toDate(value); return d ? d.toISOString().slice(0,10) : null; };
const formatDate = (value, options={}) => {
  const d=toDate(value); if(!d) return '';
  return new Intl.DateTimeFormat(options.locale || 'ar-EG-u-nu-latn', {
    day:'numeric', month:'short', year:'numeric', ...options
  }).format(d);
};
const formatDateTime = (value, options={}) => {
  const d=toDate(value); if(!d) return '';
  return new Intl.DateTimeFormat(options.locale || 'ar-EG-u-nu-latn', {
    day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit', ...options
  }).format(d);
};
const startOfDay = value => { const d=toDate(value); if(!d)return null; d.setHours(0,0,0,0); return d; };
const endOfDay = value => { const d=toDate(value); if(!d)return null; d.setHours(23,59,59,999); return d; };
const addDays = (value, amount) => { const d=toDate(value); if(!d || !Number.isFinite(Number(amount)))return null; d.setDate(d.getDate()+Math.trunc(Number(amount))); return d; };
const compareDates = (a,b) => { const x=toDate(a),y=toDate(b); return !x || !y ? null : Math.sign(x.getTime()-y.getTime()); };
const api={isValidDate,toDate,toISODate,formatDate,formatDateTime,startOfDay,endOfDay,addDays,compareDates};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSDates=api;
