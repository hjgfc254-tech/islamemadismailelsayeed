/** Small pure validation primitives. Feature-specific rules remain in feature modules. */
'use strict';
const isPresent=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
const required=(v,label='هذا الحقل')=>isPresent(v)?null:`${label} مطلوب.`;
const minLength=(v,min)=>!isPresent(v)||String(v).trim().length>=min?null:`يجب ألا يقل عن ${min} أحرف.`;
const maxLength=(v,max)=>!isPresent(v)||String(v).length<=max?null:`يجب ألا يزيد عن ${max} حرفًا.`;
const isEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(String(v??'').trim());
const isEgyptianPhone=v=>/^(?:\+?20|0)?1[0125]\d{8}$/.test(String(v??'').replace(/[\s()-]/g,''));
const isFiniteNumber=v=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v));
const inRange=(v,min,max)=>isFiniteNumber(v)&&Number(v)>=min&&Number(v)<=max;
const oneOf=(v,allowed)=>Array.isArray(allowed)&&allowed.includes(v);
const validate=(value,rules={})=>{
 const errors=[];
 if(rules.required){const e=required(value,rules.label);if(e)errors.push(e);}
 if(isPresent(value)){
  if(rules.minLength!=null){const e=minLength(value,rules.minLength);if(e)errors.push(e);}
  if(rules.maxLength!=null){const e=maxLength(value,rules.maxLength);if(e)errors.push(e);}
  if(rules.email&&!isEmail(value))errors.push('أدخل بريدًا إلكترونيًا صحيحًا.');
  if(rules.phone&&!isEgyptianPhone(value))errors.push('أدخل رقم هاتف مصريًا صحيحًا.');
  if(rules.pattern && !(rules.pattern instanceof RegExp ? rules.pattern : new RegExp(rules.pattern)).test(String(value)))errors.push(rules.patternMessage||'صيغة القيمة غير صحيحة.');
  if(rules.enum && !oneOf(value,rules.enum))errors.push('اختر قيمة من الخيارات المتاحة.');
 }
 return errors;
};
const api={isPresent,required,minLength,maxLength,isEmail,isEgyptianPhone,isFiniteNumber,inRange,oneOf,validate};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSValidation=api;
