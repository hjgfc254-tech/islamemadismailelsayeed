/* Manual Chromium check for the admin security page (NOT part of `npm test`). Same setup as reports.browser.js. */
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
    await page.goto(base + '/apps/admin/index.html#/security'); await page.waitForSelector('#sec-grid-a .hs-grid-search input');
    console.log('--- ' + w);
    ok(await page.locator('.sec .ord-stat').count() === 4, 'summary shows 4 counters');
    ok(await page.locator('.fin-banner').innerText().then((t) => /لا إنفاذ أمني حقيقي/.test(t)), 'demo/no-enforcement banner');
    ok(await page.evaluate(() => document.documentElement.dir) === 'rtl' || await page.evaluate(() => getComputedStyle(document.body).direction) === 'rtl', 'RTL');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow');
    // tabs
    await page.click('#sec-tab-s'); ok(await page.locator('#sec-p-s').isVisible() && !(await page.locator('#sec-p-a').isVisible()), 'sessions tab shows, alerts hides');
    await page.click('#sec-tab-l'); ok(await page.locator('#sec-p-l tbody tr').count() === 8, 'login attempts tab lists 8 rows');
    await page.locator('#sec-p-l tbody tr [data-act="open"]').first().click();
    ok(await page.locator('dialog[open] button:has-text("إنهاء"), dialog[open] button:has-text("حظر"), dialog[open] button:has-text("قفل")').count() === 0, 'login details are read-only (no action buttons)');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-act')) === 'open', 'focus returns to the row action');
    // alert workflow: escalate needs a reason
    await page.click('#sec-tab-a');
    const before = await page.locator('.sec .ord-stat b').first().innerText();
    await page.locator('#sec-p-a tbody tr [data-act="open"]').first().click();
    await page.click('dialog [data-sec-act="escalated"]');
    await page.click('dialog [data-sec-confirm]');
    ok(await page.locator('dialog #ord-err').isVisible(), 'escalate without a reason is rejected');
    await page.fill('#sec-note', 'طلب مراجعة من المالك'); await page.click('dialog [data-sec-confirm]');
    ok(/محاكاة فقط/.test(await page.locator('#sec-result').innerText()), 'confirmed simulated action shows the result message');
    ok(await page.locator('dialog .ord-tl li').count() === 1, 'local log has one entry');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(await page.locator('.sec .ord-stat b').first().innerText() === before ? false : true, 'open-alert counter changed after escalation');
    // sessions: current session cannot be ended; another can
    await page.click('#sec-tab-s'); await page.fill('#sec-grid-s .hs-grid-search input', 'Windows'); await page.waitForTimeout(400);
    await page.locator('#sec-p-s tbody tr [data-act="open"]').first().click();
    ok(await page.locator('dialog [data-sec-act="revoke"]').count() === 0, 'current session has no end action');
    await page.keyboard.press('Escape'); await page.fill('#sec-grid-s .hs-grid-search input', 'iPhone'); await page.waitForTimeout(400);
    await page.locator('#sec-p-s tbody tr [data-act="open"]').first().click();
    await page.click('dialog [data-sec-act="revoke"]'); await page.fill('#sec-note', 'جهاز مشبوه'); await page.click('dialog [data-sec-confirm]');
    ok(/أُنهيت|محاكاة/.test(await page.locator('dialog').innerText()), 'session end is simulated and recorded');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(errors.length === 0, 'no JS errors ' + errors.join('|'));
    ok(external.length === 0, 'no external requests ' + external.join('|'));
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow after interaction');
    await ctx.close();
  }
  await browser.close(); console.log(failed ? 'FAILED ' + failed : 'All browser checks passed'); process.exit(failed ? 1 : 0);
})();
