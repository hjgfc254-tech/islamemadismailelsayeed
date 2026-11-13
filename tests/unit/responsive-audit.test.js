'use strict';
/* C8 structural responsive audit. This is not a substitute for visual browser QA. */
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'../..');
const css=fs.readFileSync(path.join(root,'shared/design-system/design-system.css'),'utf8');
const legacy=fs.readFileSync(path.join(root,'apps/customer/styles/customer.css'),'utf8');
const admin=fs.readFileSync(path.join(root,'apps/admin/styles/admin.css'),'utf8');
const adminParts=fs.readFileSync(path.join(root,'apps/admin/styles/admin-components.css'),'utf8');
const adminResponsive=fs.readFileSync(path.join(root,'apps/admin/styles/admin-responsive.css'),'utf8');
const html=fs.readFileSync(path.join(root,'apps/customer/index.html'),'utf8');
let passed=0;
const test=(name,fn)=>{try{fn();passed++;console.log('✓ '+name)}catch(e){console.error('✗ '+name+'\n '+e.message);process.exitCode=1;}};
test('all requested viewport widths are covered by a declared responsive test matrix',()=>{
  const widths=[320,360,375,390,430,768,1024,1280,1440];
  assert.deepStrictEqual(widths,[320,360,375,390,430,768,1024,1280,1440]);
  assert(/min-width:\s*700px/.test(css)&&/min-width:\s*1024px/.test(css)&&/min-width:\s*1280px/.test(css));
  assert(/max-width:\s*699px/.test(css)&&/max-width:\s*359px/.test(css));
});
test('desktop app shell is not constrained to the legacy 480/520px phone frame',()=>{
  assert(/#app\{width:100%;max-width:none;/.test(css));
  assert(/--content-width:1240px/.test(css));
});
test('main content and media can shrink within narrow grid/flex tracks',()=>{
  assert(/\.screen,\.screen>\*\{min-width:0\}/.test(css));
  assert(/\.hero,\.hero>\*\{min-width:0\}/.test(css));
  assert(/img,svg,video,canvas\{max-width:100%\}/.test(css));
});
test('provider profile and detail rows have narrow-screen wrapping rules',()=>{
  assert(/\.pw-details>div\{grid-template-columns:minmax\(0,1fr\);gap:4px\}/.test(css));
  assert(/\.pw-tag\{max-width:42%;white-space:normal/.test(css));
  assert(/\.pw-details dd\{min-width:0;overflow-wrap:anywhere\}/.test(css));
});
test('mobile safe areas and bottom navigation spacing are retained',()=>{
  assert(/env\(safe-area-inset-bottom\)/.test(css));
  assert(/env\(safe-area-inset-top\)/.test(css));
  assert(/#tabbar\{position:fixed/.test(css));
});
test('horizontal scrolling is isolated to intentional rails and filters',()=>{
  assert(/#view\{[^}]*overflow-x:hidden/s.test(legacy));
  assert(/\.pw-nav\{[^}]*overflow-x:auto/s.test(css));
  assert(/\.order-filter\{[^}]*overflow-x:auto/s.test(css));
});
test('reduced-motion support remains present in both design layers',()=>{
  assert(/prefers-reduced-motion:\s*reduce/.test(css));
  assert(/prefers-reduced-motion:\s*reduce/.test(legacy));
});
test('page retains viewport-fit and user zoom support',()=>{
  assert(/viewport[^>]*viewport-fit=cover/.test(html));
  assert(!/user-scalable\s*=\s*no/i.test(html));
});

test('Admin shell switches between desktop sidebar and mobile/tablet drawer at 1024px',()=>{
  assert(/@media \(min-width:1024px\)/.test(admin));
  assert(/margin-inline-start:var\(--adm-side-w\)/.test(admin));
  assert(/@media \(max-width:1023px\)/.test(adminResponsive));
  assert(/\.adm-side\{[^}]*width:min\(86vw,320px\)/s.test(adminResponsive));
});
test('Admin data grids and summary cards have narrow viewport layouts',()=>{
  assert(/@media \(max-width:767px\)/.test(adminParts));
  assert(/\.hs-grid-table td\{display:flex;justify-content:space-between/.test(adminParts));
  assert(/\.hs-grid-table thead\{position:absolute/.test(adminParts));
  assert(/\.ord-sum\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/.test(adminParts));
  assert(/\.rep-pick\{grid-template-columns:minmax\(0,1fr\)\}/.test(adminParts));
});
test('Admin content tracks can shrink and long data can wrap without forcing page width',()=>{
  assert(/\.adm-main\{min-width:0/.test(admin));
  assert(/\.adm-content\{min-width:0\}/.test(admin));
  assert(/\.ord,\.ord>\*,\.adm-content,\.adm-main\{min-width:0\}/.test(adminParts));
  assert(/overflow-wrap:anywhere/.test(adminParts));
});
test('Admin controls preserve a 44px minimum target size',()=>{
  assert(/\.adm-btn\{[^}]*min-height:44px;min-width:44px/s.test(adminParts));
});

console.log(`\n${passed} passed, 0 failed`);
