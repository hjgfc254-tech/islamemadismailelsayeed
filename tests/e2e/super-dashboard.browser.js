/* Manual Chromium check for the admin owner dashboard (NOT part of `npm test`). Same setup as reports.browser.js. */
'use strict';
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8099';
let failed = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) failed++; };
const nf = (n) => new Intl.NumberFormat('ar-EG').format(n);
const kpiText = (page, id) => page.locator('[data-kpi="' + id + '"] .sd-v').innerText();
(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[1280, 800], [768, 900], [390, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage();
    const errors = [], external = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !/fonts\.(googleapis|gstatic)\.com|^data:/.test(u)) external.push(u); });
    await page.goto(base + '/apps/admin/index.html#/super-dashboard'); await page.waitForSelector('.sd .dash-kpis');
    console.log('--- ' + w);
    ok(await page.evaluate(() => getComputedStyle(document.body).direction) === 'rtl', 'RTL');
    ok(await page.locator('.sd .dash-kpi').count() === 8, '8 KPI cards');
    ok(/للقراءة فقط/.test(await page.locator('.sd .fin-banner').first().innerText()), 'demo / read-only banner');
    ok(await page.locator('.sd button, .sd input, .sd select, .sd form').count() === 0, 'no controls inside the page body');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow');
    // numbers equal the source pages' APIs
    const src = await page.evaluate(() => ({ o: HSAdminOrdersPage.counts(HSAdminOrdersPage._orders()).total, p: HSAdminProvidersPage.counts(HSAdminProvidersPage._providers()).approved,
      s: HSAdminSecurityPage.counts().openAlerts, q: HSAdminQuotesPage.counts(HSAdminQuotesPage._quotes()).awaiting, f: HSMoney.format(HSAdminFinanceDashboardPage.buildModel('30', 'all').totals.commission) }));
    ok(await kpiText(page, 'orders') === nf(src.o) && await kpiText(page, 'providers') === nf(src.p) && await kpiText(page, 'security') === nf(src.s) && await kpiText(page, 'quotes') === nf(src.q) && await kpiText(page, 'commission') === src.f, 'KPI values equal the source pages');
    ok(await page.locator('.sd-health').innerText().then((t) => /توجد تنبيهات حرجة/.test(t)), 'platform state says critical alerts exist (text, not colour only)');
    ok(await page.locator('.sd .dash-alert').first().getAttribute('class').then((c) => /is-danger/.test(c)), 'attention list starts with the most severe item');
    // module links: all enabled, none dead
    const links = await page.locator('#sd-h-mod ~ .dash-short a.dash-sc, .sd section[aria-labelledby="sd-h-mod"] a.dash-sc').count();
    ok(links === 21 && await page.locator('.sd .is-soon').count() === 0, '21 module links, none disabled');
    // follow an attention link
    await page.locator('.sd .dash-alert a.dash-link').first().click(); await page.waitForTimeout(300);
    ok(/#\/(security|complaints|settlements)$/.test(await page.evaluate(() => location.hash)) && await page.locator('.adm-main h1, h1').first().isVisible(), 'attention link opens the module page');
    // live: a simulated quote approval changes the dashboard after returning
    await page.goto(base + '/apps/admin/index.html#/quotes'); await page.waitForSelector('#qt-grid .hs-grid-search input');
    await page.fill('#qt-grid .hs-grid-search input', 'QT-DEMO-1013'); await page.waitForTimeout(400);
    await page.locator('#qt-grid tbody tr [data-act="open"]').first().click();
    await page.click('dialog [data-qt-act="approved"]'); await page.click('dialog [data-qt-confirm]'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.evaluate(() => { location.hash = '#/super-dashboard'; }); await page.waitForSelector('.sd .dash-kpis');
    ok(await kpiText(page, 'quotes') === nf(src.q - 1), 'a simulated approval on the quotes page lowers "quotes awaiting" here (state is read live)');
    // refresh action re-renders without errors
    await page.click('.adm-actions .adm-btn'); await page.waitForSelector('.sd .dash-kpis');
    ok(await page.locator('.sd .dash-kpi').count() === 8, 'refresh keeps the page intact');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow after navigation');
    ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    ok(external.length === 0, 'no external requests' + (external.length ? ': ' + external.join(', ') : ''));
    await ctx.close();
  }
  await browser.close();
  console.log(failed ? '\nFAILED: ' + failed : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})();
