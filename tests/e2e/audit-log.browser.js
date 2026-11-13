/* Manual Chromium check for the admin audit-log page (NOT part of `npm test`). Same setup as reports.browser.js. */
'use strict';
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8099';
let failed = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) failed++; };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[1280, 800], [768, 900], [390, 800]]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/apps/admin/index.html#/audit'); await page.waitForSelector('.hs-grid-search input');
    console.log('--- ' + w);
    ok(await page.locator('.ord-stat').count() === 4, 'summary shows 4 counters');
    ok(await page.locator('.fin-banner').innerText().then((t) => /ليست سجل تدقيق حقيقيًا/.test(t)), 'demo/not-tamper-proof banner');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow');
    await page.fill('.hs-grid-search input', 'STL-DEMO-0004'); await page.waitForTimeout(400);
    ok(await page.locator('tbody tr').count() === 1, 'search narrows to 1 row');
    await page.locator('tbody tr [data-act="open"]').first().click();
    ok(await page.locator('dialog[open]').count() === 1 && /تفاصيل الحدث/.test(await page.locator('dialog').innerText()), 'details dialog opens');
    ok(await page.locator('dialog button:has-text("حفظ"), dialog button:has-text("حذف"), dialog button:has-text("تصدير")').count() === 0, 'no write/export buttons');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(await page.locator('dialog[open]').count() === 0, 'Escape closes the dialog');
    ok(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-act')) === 'open', 'focus returns to the row action');
    ok(errors.length === 0, 'no JS errors' + errors.join('|'));
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no overflow after interaction');
  }
  await browser.close(); console.log(failed ? 'FAILED ' + failed : 'All browser checks passed'); process.exit(failed ? 1 : 0);
})();
