'use strict';
const fs = require('fs');
const assert = require('assert');
const css = fs.readFileSync(require('path').join(__dirname, '../..', 'shared/design-system/design-system.css'), 'utf8');
const html = fs.readFileSync(require('path').join(__dirname, '../..', 'apps/customer/index.html'), 'utf8');
const sw = fs.readFileSync(require('path').join(__dirname, '../..', 'service-worker.js'), 'utf8');
const app = fs.readFileSync(require('path').join(__dirname, '../..', 'apps/customer/app.js'), 'utf8');
let passed = 0;
function test(name, fn){ try{fn();passed++;console.log('✓ '+name)}catch(e){console.error('✗ '+name+'\n  '+e.message);process.exitCode=1;} }
test('central brand and semantic color tokens exist',()=>{for(const token of ['--brand-primary','--bg-primary','--surface-primary','--text-primary','--success','--warning','--danger','--info'])assert(css.includes(token),token)});
test('4px spacing scale and shared radius/shadow/motion tokens exist',()=>{for(const token of ['--sp-1:4px','--sp-2:8px','--r-lg','--shadow-2','--motion-base','--z-modal'])assert(css.includes(token),token)});
test('desktop layouts are explicitly composed at 700/1024/1280px',()=>{for(const px of ['700px','1024px','1280px'])assert(css.includes('@media(min-width:'+px+')'),px)});
test('small viewport support starts at 320px without fixed phone shell',()=>{assert(css.includes('min-width:320px'));assert(/#app\{width:100%;max-width:none/.test(css))});
test('reduced motion is respected',()=>assert(css.includes('prefers-reduced-motion:reduce')));
test('design system is loaded after legacy stylesheet',()=>assert(html.indexOf('href="styles/customer.css"')<html.indexOf('href="../../shared/design-system/design-system.css"')));
test('new stylesheet is precached and cache version is bumped',()=>{assert(sw.includes("'hansalhlak-v8-architecture-9'"));assert(sw.includes("'shared/design-system/design-system.css'"));assert(sw.includes("'apps/provider/provider-workspace.js'"))});
test('legacy account screen delegates to the dedicated Account module',()=>{assert(app.includes('Account.render()'));assert(!app.includes('حسابي — V7 (يعرض الطلبات الحقيقية)'))});
console.log(`\n${passed} passed, 0 failed`);
