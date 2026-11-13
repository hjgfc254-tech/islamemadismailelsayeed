/**
 * Normalize arbitrary failures into a stable, safe UI error shape.
 * Never exposes stack traces or raw server payloads by default.
 */
'use strict';
const DEFAULT_MESSAGE='حدث خطأ غير متوقع. حاول مرة أخرى.';
const normalizeError=(input, options={})=>{
  const fallback=options.fallback || DEFAULT_MESSAGE;
  if(input && typeof input==='object' && input.name==='AbortError')
    return {code:'ABORTED',message:options.abortMessage || 'تم إلغاء العملية.',retryable:false,kind:'cancelled'};
  const status=Number(input && (input.status || input.statusCode));
  const code=String(input && input.code || (Number.isFinite(status)&&status ? `HTTP_${status}` : 'UNKNOWN'));
  const known=options.messages && options.messages[code];
  const message=known || (options.exposeMessage && input && typeof input.message==='string' ? input.message : fallback);
  return {code,message,retryable:!!(input && input.retryable) || status===408 || status===429 || status>=500,kind:status===401||status===403?'authorization':'error'};
};
const isAbortError=e=>!!e && (e.name==='AbortError'||e.code==='ABORT_ERR');
const toError=(value, fallback=DEFAULT_MESSAGE)=>{
  if(value instanceof Error)return value;
  const e=new Error(typeof value==='string'&&value.trim()?value:fallback);
  if(value&&typeof value==='object'&&value.code)e.code=String(value.code);
  return e;
};
const api={DEFAULT_MESSAGE,normalizeError,isAbortError,toError};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSErrors=api;
