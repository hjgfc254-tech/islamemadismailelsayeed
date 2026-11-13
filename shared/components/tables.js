/**
 * Semantic responsive table renderer for trusted in-memory rows.
 * Column `render` may return trusted HTML; otherwise values are escaped.
 */
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const render=(columns,rows,options={})=>{
 if(!Array.isArray(columns)||!columns.length)throw new Error('HSTables.render: columns are required');
 const data=Array.isArray(rows)?rows:[];
 const head=columns.map(c=>`<th scope="col"${c.align?` class="is-${esc(c.align)}"`:''}>${esc(c.label||c.key||'')}</th>`).join('');
 const body=data.map((row,i)=>`<tr>${columns.map(c=>`<td data-label="${esc(c.label||c.key||'')}"${c.align?` class="is-${esc(c.align)}"`:''}>${typeof c.render==='function'?String(c.render(row,i)??''):esc(row&&row[c.key])}</td>`).join('')}</tr>`).join('');
 const empty=options.emptyText||'لا توجد بيانات لعرضها.';
 return `<div class="hs-table-wrap" role="region"${options.caption?` aria-label="${esc(options.caption)}"`:''} tabindex="0"><table class="hs-table"><thead><tr>${head}</tr></thead><tbody>${body||`<tr><td colspan="${columns.length}">${esc(empty)}</td></tr>`}</tbody></table></div>`;
};
const api={render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSTables=api;
