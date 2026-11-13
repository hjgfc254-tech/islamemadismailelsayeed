/** Runtime structural contracts for demo account profiles; not identity verification. */
'use strict';
const ROLES=Object.freeze(['customer','provider','admin','staff','guest']);
const STATUSES=Object.freeze(['active','pending','disabled','suspended']);
const validateAccount=v=>{
 const errors=[];
 if(!v||typeof v!=='object'||Array.isArray(v))return {valid:false,errors:['account must be an object']};
 if(typeof v.id!=='string'||!v.id.trim())errors.push('id is required');
 if(v.role!=null&&!ROLES.includes(v.role))errors.push('role is invalid');
 if(v.status!=null&&!STATUSES.includes(v.status))errors.push('status is invalid');
 if(v.email!=null&&typeof v.email!=='string')errors.push('email must be a string');
 if(v.phone!=null&&typeof v.phone!=='string')errors.push('phone must be a string');
 return {valid:errors.length===0,errors};
};
const api={ROLES,STATUSES,validateAccount};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSAccountTypes=api;
