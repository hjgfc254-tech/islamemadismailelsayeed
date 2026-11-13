/* Manual Chromium check for the admin Reports page (NOT part of `npm test`).
 * Needs a globally available Playwright + Chromium (not a project dependency) and a static server at the project root:
 *   python3 -m http.server 8099   (from the project root)   then   node tests/e2e/reports.browser.js http://127.0.0.1:8099
 * Fonts from Google are blocked offline; the page falls back to system fonts. */
'use strict';
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8099';
const fs = require('fs'), path = require('path'), os = require('os');
let failed = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) failed++; };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[1280, 800], [768, 900], [390, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const reqs = []; page.on('request', (r) => { if (!r.url().startsWith(base) && !/fonts\.g/.test(r.url())) reqs.push(r.url()); });
    await page.goto(base + '/apps/admin/index.html#/reports'); await page.waitForSelector('.rep .rep-table');
    console.log('--- viewport ' + w + 'x' + h);
    ok(await page.locator('html').getAttribute('dir') === 'rtl', 'RTL document');
    ok(await page.locator('.rep-table tbody tr').count() === 4, 'default report: 4 category rows');
    ok(/١٢٬?٠?|ج\.م/.test(await page.locator('.rep-table tfoot').innerText()), 'totals row formatted with ج.م');
    ok(await page.locator('.rep-checks .is-bad').count() === 0 && await page.locator('.rep-checks .is-ok').count() >= 3, 'all reconciliation checks pass');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no page-level horizontal overflow (default)');
    // switch report + period
    await page.click('[data-report="discrepancies"]'); await page.waitForSelector('.rep-table');
    ok(await page.locator('.rep-table tbody tr').count() === 4, 'discrepancies @30d = 4 rows');
    await page.click('[data-period="7"]'); await page.waitForSelector('.rep-table');
    ok(await page.locator('.rep-table tbody tr').count() === 2, 'discrepancies @7d = 2 rows');
    ok(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-period')) === '7', 'focus stays on the period button after re-render');
    // empty state
    await page.selectOption('[data-category]', 'carpentry'); await page.waitForSelector('.rep-state');
    ok(/لا توجد بيانات/.test(await page.locator('#rep-result').innerText()), 'empty state shown (7d + carpentry)');
    ok(await page.locator('[data-rep-export]').isDisabled(), 'export disabled while empty');
    // fixed-basis report
    await page.selectOption('[data-category]', 'all'); await page.click('[data-report="provider-dues"]'); await page.waitForSelector('.rep-table');
    ok(await page.locator('[data-period]').first().isDisabled(), 'period buttons disabled for fixed-basis report');
    ok(await page.locator('.rep-table tbody tr').count() === 8, 'provider dues: 8 providers');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no page-level horizontal overflow (wide table)');
    // export
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-rep-export]')]);
    const f = path.join(os.tmpdir(), 'rep-' + w + '.csv'); await dl.saveAs(f);
    const csv = fs.readFileSync(f, 'utf8');
    ok(dl.suggestedFilename() === 'hansalehlak-demo-provider-dues-30d-all.csv', 'download file name');
    ok(csv.charCodeAt(0) === 0xFEFF && csv.includes('بيانات تجريبية') && csv.split('\r\n').length > 12, 'CSV has BOM, demo disclosure and rows');
    ok(/لم يُرسل/.test(await page.locator('#rep-msg').innerText()), 'success message says nothing was sent');
    ok(await page.locator('#rep-h-log ~ ul li').count() === 1, 'export log has 1 entry');
    // keyboard: tab reaches report buttons; Enter activates
    await page.focus('[data-report="finance-summary"]'); await page.keyboard.press('Enter'); await page.waitForSelector('.rep-table');
    ok(await page.locator('[data-report="finance-summary"]').getAttribute('aria-pressed') === 'true', 'keyboard Enter selects a report');
    // reset action
    await page.click('text=استعادة البيانات التجريبية'); await page.waitForSelector('.rep-table');
    ok(await page.locator('#rep-h-log ~ ul li').count() === 0, 'reset clears the export log');
    ok(reqs.length === 0, 'no external network requests (other than fonts)' + (reqs.length ? ': ' + reqs.join(',') : ''));
    ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join('|') : ''));
    await page.screenshot({ path: path.join(os.tmpdir(), 'reports-' + w + '.png'), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  console.log(failed ? '\nFAILED: ' + failed : '\nAll browser checks passed');
  process.exit(failed ? 1 : 0);
})();
