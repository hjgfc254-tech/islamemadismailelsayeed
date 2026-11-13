/**
 * Runtime contracts for local/demo order records (not a database schema).
 * Validation is intentionally structural; workflow transitions remain in domain modules.
 */
'use strict';
const STATUSES=Object.freeze(['received','searching','sent','accepted','scheduled','enroute','arrived','started','quote','completed','closed','cancelled','failed']);
const isRecord=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const validateOrder=v=>{
 const errors=[];
 if(!isRecord(v))return {valid:false,errors:['order must be an object']};
 if(typeof v.id!=='string'||!v.id.trim())errors.push('id is required');
 if(typeof v.status!=='string'||!STATUSES.includes(v.status))errors.push('status is invalid');
 if(v.total!=null&&(!Number.isFinite(Number(v.total))||Number(v.total)<0))errors.push('total must be a non-negative number');
 if(v.createdAt!=null&&!Number.isFinite(new Date(v.createdAt).getTime()))errors.push('createdAt must be a valid date');
 return {valid:errors.length===0,errors};
};
const api={STATUSES,validateOrder,isOrder:isRecord};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSOrderTypes=api;
