'use strict';
/* PHASE 5 TASK 03 — regression guards for defects found by the real-browser responsive sweep.
   Browser-level proof lives in tests/e2e/responsive-sweep.cdp.js (CDP runner, not part of npm test). */
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'../..');
const rd=p=>fs.readFileSync(path.join(root,p),'utf8');
const ds=rd('shared/design-system/design-system.css'),cust=rd('apps/customer/styles/customer.css'),adm=rd('apps/admin/styles/admin-components.css');
let passed=0;
const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
test('closed bottom sheet is hidden (not focusable) and revealed with .open',()=>{
  assert(/#sheet\{[^}]*visibility:hidden/.test(cust));
  assert(/\.open #sheet\{transform:none;visibility:visible/.test(cust));
});
test('#app clips instead of being a programmatically scrollable container',()=>{
  assert(/#app\{[^}]*overflow:hidden;overflow:clip/.test(ds));
});
test('admin badge text does not use overflow-wrap:anywhere (it collapses table columns to one letter)',()=>{
  assert(!/\.hs-badge-t\{[^}]*overflow-wrap:anywhere/.test(adm));
  assert(/\.hs-badge-t\{[^}]*overflow-wrap:break-word/.test(adm));
});
test('touch targets: chips, crumbs, carousel dots, section links have >=32px hit areas',()=>{
  assert(/\.chip\{min-height:36px\}/.test(cust));
  assert(/\.crumbs button\{min-height:36px\}/.test(cust));
  assert(/\.dots button::before\{[^}]*inset:-14px -12px/.test(cust));
  assert(/\.dash-link\{[^}]*padding:var\(--sp-2\) var\(--sp-3\)/.test(adm));
});
test('provider card header wraps instead of squeezing the title column',()=>{
  assert(/\.card2 \.top\{flex-wrap:wrap\}/.test(cust));
});
test('fmtDT never renders "Invalid Date" for empty/invalid input (flexible requests)',()=>{
  const m=/const fmtDT = [^\n]+/.exec(rd('apps/customer/pages/market-ui.page.js'));
  assert(m);
  const fmtDT=new Function(m[0].replace('const fmtDT = ','return ')+';')();
  assert.strictEqual(fmtDT(''),'');assert.strictEqual(fmtDT(undefined),'');assert.strictEqual(fmtDT('not-a-date'),'');
  assert(fmtDT('2026-11-11T10:00:00Z').length>3);
  /* the legacy provider card (portal-compat.js) was removed 2026-11-14; the standalone Provider app renders missing dates as «لم يحدد» */
  assert(/if\(!value\) return 'لم يحدد'/.test(rd('apps/provider/app.js')));
});
console.log(passed+' checks passed');
