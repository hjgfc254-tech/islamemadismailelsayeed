/* Manual Chromium check for the admin quotes page (NOT part of `npm test`). Same setup as reports.browser.js. */
'use strict';
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8099';
let failed = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) failed++; };
const open = async (page, ref) => { await page.fill('#qt-grid .hs-grid-search input', ref); await page.waitForTimeout(400); await page.locator('#qt-grid tbody tr [data-act="open"]').first().click(); };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[1280, 800], [768, 900], [390, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage();
    const errors = [], external = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !/fonts\.(googleapis|gstatic)\.com|^data:/.test(u)) external.push(u); });
    await page.goto(base + '/apps/admin/index.html#/quotes'); await page.waitForSelector('#qt-grid .hs-grid-search input');
    console.log('--- ' + w);
    ok(await page.locator('.qt .ord-stat').count() === 5, 'summary shows 5 counters');
    ok(await page.locator('.fin-banner').innerText().then((t) => /لا تتغير حالة أي طلب/.test(t)), 'demo/no-effect banner');
    ok(await page.evaluate(() => getComputedStyle(document.body).direction) === 'rtl', 'RTL');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow');
    ok(await page.locator('#qt-grid tbody tr').count() === 9, 'grid lists the 9 derived quotes');
    // expired quote cannot be approved
    await open(page, 'QT-DEMO-1026');
    ok(await page.locator('dialog [data-qt-act="approved"]').count() === 0 && await page.locator('dialog [data-qt-act="rejected"]').count() === 1, 'expired quote offers no approve action');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-act')) === 'open', 'Escape returns focus to the row action');
    // reject needs a reason
    await open(page, 'QT-DEMO-1013');
    await page.click('dialog [data-qt-act="rejected"]'); await page.click('dialog [data-qt-confirm]');
    ok(await page.locator('dialog #ord-err').isVisible(), 'reject without a reason is rejected');
    await page.click('dialog [data-qt-back]');
    ok(await page.locator('dialog [data-qt-act="approved"]').count() === 1, 'back returns to the details with actions');
    // approve (no reason needed) updates counters and log
    const awaiting = await page.locator('.qt .ord-stat b').nth(1).innerText();
    await page.click('dialog [data-qt-act="approved"]'); await page.click('dialog [data-qt-confirm]');
    ok(/محاكاة فقط/.test(await page.locator('#qt-result').innerText()), 'approval shows the simulated result');
    ok(await page.locator('dialog .ord-tl li').count() === 1 && await page.locator('dialog [data-qt-act]').count() === 0, 'decision logged and approved is final');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(await page.locator('.qt .ord-stat b').nth(1).innerText() !== awaiting, 'awaiting counter changed');
    // filter by status
    await page.fill('#qt-grid .hs-grid-search input', ''); await page.waitForTimeout(300);
    ok(await page.locator('#qt-grid tbody tr').count() === 9, 'quotes stay listed after a decision');
    ok(errors.length === 0, 'no JS errors ' + errors.join('|'));
    ok(external.length === 0, 'no external requests ' + external.join('|'));
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow after interaction');
    await ctx.close();
  }
  await browser.close(); console.log(failed ? 'FAILED ' + failed : 'All browser checks passed'); process.exit(failed ? 1 : 0);
})();
