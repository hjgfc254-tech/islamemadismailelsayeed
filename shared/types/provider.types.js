/** Runtime contracts for local/demo provider profiles; approval is display data only. */
'use strict';
const STATUSES=Object.freeze(['pending','approved','suspended','rejected']);
const validateProvider=v=>{
 const errors=[];
 if(!v||typeof v!=='object'||Array.isArray(v))return {valid:false,errors:['provider must be an object']};
 if(typeof v.id!=='string'||!v.id.trim())errors.push('id is required');
 if(v.status!=null&&!STATUSES.includes(v.status))errors.push('status is invalid');
 if(v.name!=null&&typeof v.name!=='string')errors.push('name must be a string');
 if(v.services!=null&&!Array.isArray(v.services))errors.push('services must be an array');
 if(v.rating!=null&&(!Number.isFinite(Number(v.rating))||Number(v.rating)<0||Number(v.rating)>5))errors.push('rating must be between 0 and 5');
 return {valid:errors.length===0,errors};
};
const api={STATUSES,validateProvider};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSProviderTypes=api;
