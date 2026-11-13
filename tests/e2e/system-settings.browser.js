/* Manual Chromium check for the admin system-settings page (NOT part of `npm test`). Same setup as reports.browser.js. */
'use strict';
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8099';
let failed = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) failed++; };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[1280, 800], [768, 900], [390, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage();
    const errors = [], external = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !/fonts\.(googleapis|gstatic)\.com|^data:/.test(u)) external.push(u); });
    await page.goto(base + '/apps/admin/index.html#/settings'); await page.waitForSelector('#set-form');
    console.log('--- ' + w);
    ok(await page.locator('.fin-banner').innerText().then((t) => /لا يُحفظ شيء ولا يتأثر أي تطبيق/.test(t)), 'demo/no-effect banner');
    ok(await page.locator('.set-grp').count() === 4, 'four setting groups');
    ok(await page.evaluate(() => getComputedStyle(document.body).direction) === 'rtl', 'RTL');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow');
    // no changes
    await page.click('#set-form button[type=submit]');
    ok(/لا توجد تغييرات/.test(await page.locator('#set-result').innerText()) && await page.locator('dialog[open]').count() === 0, 'submit without changes opens no dialog');
    // invalid value
    await page.fill('#set-autoCancelHours', '500'); await page.click('#set-form button[type=submit]');
    ok(await page.locator('#set-autoCancelHours-e').isVisible() && await page.locator('#set-autoCancelHours').getAttribute('aria-invalid') === 'true', 'out-of-range value shows an error and aria-invalid');
    ok(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'set-autoCancelHours', 'focus moves to the invalid field');
    // valid change -> review -> reason
    await page.fill('#set-autoCancelHours', '48'); await page.click('#set-form button[type=submit]');
    ok(await page.locator('dialog[open]').count() === 1 && /48|٤٨/.test(await page.locator('dialog').innerText()), 'review dialog lists the change');
    await page.click('dialog [data-set-confirm]');
    ok(await page.locator('dialog #ord-err').isVisible(), 'confirm without a reason is rejected');
    await page.fill('#set-note', 'تعديل مهلة الإلغاء'); await page.click('dialog [data-set-confirm]');
    ok(await page.locator('dialog[open]').count() === 0 && /محاكاة فقط/.test(await page.locator('#set-result').innerText()), 'confirmed save closes the dialog and shows the simulated result');
    ok(await page.locator('#set-log li').count() === 1, 'local change log has one entry');
    ok(await page.inputValue('#set-autoCancelHours') === '48', 'form keeps the saved value');
    // Escape cancels review and returns focus
    await page.fill('#set-maxAttachmentMb', '10'); await page.click('#set-form button[type=submit]'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(await page.locator('dialog[open]').count() === 0 && await page.locator('#set-log li').count() === 1, 'Escape cancels the review without saving');
    ok(await page.evaluate(() => document.activeElement && document.activeElement.type) === 'submit', 'focus returns to the submit button');
    // defaults
    await page.click('[data-set-defaults]'); ok(await page.inputValue('#set-autoCancelHours') === '24', 'restore defaults loads defaults into the form only');
    ok(await page.locator('#set-log li').count() === 1, 'restore does not save by itself');
    // Enter submits
    await page.fill('#set-maxAttachmentMb', '8'); await page.press('#set-maxAttachmentMb', 'Enter');
    ok(await page.locator('dialog[open]').count() === 1, 'Enter in a text field opens the review once'); await page.keyboard.press('Escape');
    ok(errors.length === 0, 'no JS errors ' + errors.join('|'));
    ok(external.length === 0, 'no external requests ' + external.join('|'));
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow after interaction');
    await ctx.close();
  }
  await browser.close(); console.log(failed ? 'FAILED ' + failed : 'All browser checks passed'); process.exit(failed ? 1 : 0);
})();
