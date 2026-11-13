/**
 * Presentation-only permission vocabulary for demo Admin screens.
 * This is NOT authorization. Backend enforcement is mandatory for real permissions.
 */
'use strict';
const ACTIONS=Object.freeze(['view','create','update','delete','approve','export','manage']);
const validatePermission=v=>{
 const errors=[];
 if(!v||typeof v!=='object'||Array.isArray(v))return {valid:false,errors:['permission must be an object']};
 if(typeof v.key!=='string'||!/^[a-z][a-z0-9_.:-]*$/.test(v.key))errors.push('key is invalid');
 if(typeof v.label!=='string'||!v.label.trim())errors.push('label is required');
 if(v.action!=null&&!ACTIONS.includes(v.action))errors.push('action is invalid');
 if(v.enabled!=null&&typeof v.enabled!=='boolean')errors.push('enabled must be boolean');
 return {valid:errors.length===0,errors};
};
const api={ACTIONS,validatePermission};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSPermissionTypes=api;
