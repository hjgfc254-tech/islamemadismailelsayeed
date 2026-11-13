"""Manual/CI-capable Chromium behavior checks for Customer Bottom Sheet focus.
Usage: SHEET_TEST_WIDTH=390 /opt/pyvenv/bin/python tests/e2e/customer-sheet-focus.browser.py
No project dependency is added; uses the environment's Python Playwright install. Local assets are inlined into about:blank because browser navigation to local URLs is restricted.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import re
import os

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "apps/customer/index.html"
def inline_local_assets():
    html = INDEX.read_text(encoding="utf-8")
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/?>', lambda m: "<style>" + (INDEX.parent / m.group(1)).resolve().read_text(encoding="utf-8") + "</style>", html)
    html = re.sub(r'<script src="([^"]+)"></script>', lambda m: "<script>\n" + (INDEX.parent / m.group(1)).resolve().read_text(encoding="utf-8") + "\n</script>", html)
    return html

BASE = "about:blank"
checks = []
def check(condition, label):
    checks.append((bool(condition), label))
    print(("PASS " if condition else "FAIL ") + label)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox", "--allow-file-access-from-files", "--disable-web-security"])
    width = int(os.environ.get("SHEET_TEST_WIDTH", "390"))
    page = browser.new_page(viewport={"width": width, "height": 844 if width >= 390 else 640}, locale="ar-EG")
    page.add_init_script("sessionStorage.setItem('hs_intro_v1','1')")
    page.route("**/*googleapis.com/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.set_content(inline_local_assets(), wait_until="domcontentloaded")
    page.wait_for_selector("#view .screen")

    # Ordinary open: initial focus, semantic naming, and background isolation.
    opener = page.locator("[data-act=menu]").first
    opener.focus()
    opener.click()
    page.wait_for_timeout(400)
    check(page.locator("#sheet").evaluate("el => el.contains(document.activeElement)"), "initial focus moves inside the sheet")
    check(page.locator("#sheet").get_attribute("aria-labelledby") is not None, "dialog is labelled by its visible heading")
    check(page.locator("#view").evaluate("el => el.inert && el.getAttribute('aria-hidden') === 'true'"), "background content is inert and hidden from accessibility tree")
    check(page.locator("#tabbar").evaluate("el => el.inert"), "background navigation is inert")

    # Tab and Shift+Tab containment.
    for _ in range(40): page.keyboard.press("Tab")
    check(page.locator("#sheet").evaluate("el => el.contains(document.activeElement)"), "Tab remains contained in sheet")
    for _ in range(40): page.keyboard.press("Shift+Tab")
    check(page.locator("#sheet").evaluate("el => el.contains(document.activeElement)"), "Shift+Tab remains contained in sheet")
    page.evaluate("""() => { const xs=[...document.querySelectorAll('#sheet a[href],#sheet button:not([disabled]),#sheet input:not([disabled]):not([type=hidden]),#sheet select:not([disabled]),#sheet textarea:not([disabled]),#sheet iframe,#sheet [tabindex]:not([tabindex=\"-1\"])')].filter(e=>e.getClientRects().length && !e.closest('details:not([open])')); xs.at(-1)?.focus(); }""")
    page.keyboard.press("Tab")
    check(page.locator("#sheet").evaluate("el => el.contains(document.activeElement)"), "Tab wraps from the final control to the first")
    page.evaluate("""() => { const xs=[...document.querySelectorAll('#sheet a[href],#sheet button:not([disabled]),#sheet input:not([disabled]):not([type=hidden]),#sheet select:not([disabled]),#sheet textarea:not([disabled]),#sheet iframe,#sheet [tabindex]:not([tabindex=\"-1\"])')].filter(e=>e.getClientRects().length && !e.closest('details:not([open])')); xs[0]?.focus(); }""")
    page.keyboard.press("Shift+Tab")
    check(page.locator("#sheet").evaluate("el => el.contains(document.activeElement)"), "Shift+Tab wraps from the first control to the final")

    # Transition to another sheet content retains the original opener and focuses new content.
    page.locator("[data-act=slide][data-s=guide]").click()
    page.wait_for_timeout(100)
    check(page.locator("#sheet").evaluate("el => el.contains(document.activeElement)"), "focus remains inside after sheet content transition")
    check(page.locator("#sheet h4").count() == 1, "transitioned content retains a single accessible heading")
    page.keyboard.press("Escape")
    page.wait_for_timeout(50)
    check(opener.evaluate("el => document.activeElement === el"), "Escape closes and restores focus to original opener")
    check(not page.locator("#view").evaluate("el => el.inert || el.getAttribute('aria-hidden') === 'true'"), "background is restored after close")

    # Backdrop close and a multi-control form-like sheet.
    opener.click()
    page.evaluate("sheet('<h4>نموذج تجريبي</h4><form><label>الاسم<input id=\"sheet-name\"></label><button type=\"button\" id=\"sheet-a\">الأول</button><button type=\"button\" id=\"sheet-b\">الثاني</button></form>')")
    page.wait_for_timeout(50)
    check(page.locator("#sheet-name").evaluate("el => document.activeElement === el"), "form sheet focuses its first input")
    page.keyboard.press("Tab")
    check(page.locator("#sheet-a").evaluate("el => document.activeElement === el"), "Tab advances from form input to first button")
    page.keyboard.press("Tab")
    check(page.locator("#sheet-b").evaluate("el => document.activeElement === el"), "Tab advances across multiple buttons")
    page.keyboard.press("Tab")
    check(page.locator("#sheet-name").evaluate("el => document.activeElement === el"), "form controls wrap in the expected order")
    page.locator("#sheet-backdrop").click(position={"x": 3, "y": 3})
    page.wait_for_timeout(50)
    check(opener.evaluate("el => document.activeElement === el"), "backdrop close restores focus")

    # No interactive controls: heading receives focus.
    page.evaluate("sheet('<h4>محتوى للقراءة فقط</h4><p>نص</p>')")
    page.wait_for_timeout(50)
    check(page.locator("#sheet h4").evaluate("el => document.activeElement === el && el.tabIndex === -1"), "heading receives focus when no interactive control exists")
    page.keyboard.press("Escape")

    # Existing problem list → problem details is a nested content transition, not a new modal.
    page.locator("[data-act=menu]").click()
    page.locator("[data-act=slide][data-s=popular]").click()
    page.wait_for_timeout(100)
    problem = page.locator("#sheet [data-prob]").first
    if problem.count():
        problem.click()
        page.wait_for_timeout(50)
        check(page.locator("#sheet .sheet-back").count() == 1, "problem detail preserves the existing in-sheet back action")
        check(page.locator("#sheet").evaluate("el => el.contains(document.activeElement)"), "problem detail transition keeps focus inside sheet")
        page.locator("#sheet .sheet-back").click()
        check(page.locator("#sheet [data-prob]").count() > 0, "in-sheet back action restores the previous content")
        problem = page.locator("#sheet [data-prob]").first
        problem.click()
        page.wait_for_timeout(50)
        page.locator("#sheet .step").evaluate_all("xs => xs.forEach(x => x.click())")
        page.locator("#sheet [data-act=solved]").click()
        page.wait_for_timeout(50)
        check(opener.evaluate("el => document.activeElement === el"), "existing sheet action closes and restores the original opener")
    else:
        check(False, "problem list fixture available for nested transition")

    # Removed opener: safely fall back to the main content region.
    opener = page.locator("[data-act=menu]").first
    opener.click()
    page.evaluate("document.querySelector('[data-act=menu]').remove()")
    page.keyboard.press("Escape")
    page.wait_for_timeout(50)
    check(page.locator("#view").evaluate("el => document.activeElement === el"), "missing opener falls back to the main content region")

    # A route transition must focus the destination, not a stale opener in the old view.
    page.evaluate("document.getElementById('view').innerHTML='<button type=\"button\" data-act=\"menu\">القائمة</button>'")
    page.locator("[data-act=menu]").click()
    page.evaluate("closeSheet(true); document.getElementById('view').innerHTML='<section class=\"screen\"><h2>وجهة جديدة</h2></section>'")
    page.wait_for_timeout(50)
    check(page.locator("#view").evaluate("el => document.activeElement === el"), "route-style close focuses the destination view")

    check(not errors, "no uncaught browser JavaScript errors: " + " | ".join(errors))
    browser.close()

failed = [label for ok, label in checks if not ok]
print(f"\n{len(checks)-len(failed)}/{len(checks)} browser checks passed")
if failed: raise SystemExit(1)
