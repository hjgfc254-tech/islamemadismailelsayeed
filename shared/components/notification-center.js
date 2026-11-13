/**
 * Presentation-only notification list for supplied local/demo items.
 * Actions are rendered only when a matching callback is supplied.
 */
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const render=(items=[],options={})=>{
 const list=Array.isArray(items)?items:[];
 const unread=list.filter(n=>!n.read).length;
 const rows=list.map(n=>`<li class="hs-notification${n.read?' is-read':' is-unread'}" data-id="${esc(n.id)}"><div class="hs-notification__body"><strong>${esc(n.title||'إشعار')}</strong><p>${esc(n.message||'')}</p>${n.createdAt?`<time datetime="${esc(n.createdAt)}">${esc(options.formatDate?options.formatDate(n.createdAt):n.createdAt)}</time>`:''}</div>${!n.read&&typeof options.onMarkRead==='function'?`<button type="button" data-notification-read="${esc(n.id)}">تحديد كمقروء</button>`:''}</li>`).join('');
 return `<section class="hs-notification-center" aria-label="${esc(options.label||'مركز الإشعارات')}"><header><h2>${esc(options.title||'الإشعارات')}</h2><span aria-label="${unread} غير مقروء">${unread}</span></header>${list.length?`<ul>${rows}</ul>`:`<p role="status">${esc(options.emptyText||'لا توجد إشعارات حاليًا.')}</p>`}</section>`;
};
const bind=(root,options={})=>{
 if(!root||typeof root.addEventListener!=='function')return ()=>{};
 const handler=e=>{const b=e.target&&e.target.closest&&e.target.closest('[data-notification-read]');if(!b||!root.contains(b))return;const id=b.getAttribute('data-notification-read');if(typeof options.onMarkRead==='function')options.onMarkRead(id);};
 root.addEventListener('click',handler);return ()=>root.removeEventListener('click',handler);
};
const api={render,bind};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSNotificationCenter=api;
