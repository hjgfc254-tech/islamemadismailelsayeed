"""Manual Chromium behavior checks for the Customer home search combobox.
Usage: /opt/pyvenv/bin/python tests/e2e/customer-search-keyboard.browser.py
Uses the environment Playwright install; no project dependency is added.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "apps/customer/index.html"

def inline_local_assets():
    html = INDEX.read_text(encoding="utf-8")
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/?>', lambda m: "<style>" + (INDEX.parent / m.group(1)).resolve().read_text(encoding="utf-8") + "</style>", html)
    html = re.sub(r'<script src="([^"]+)"></script>', lambda m: "<script>\n" + (INDEX.parent / m.group(1)).resolve().read_text(encoding="utf-8") + "\n</script>", html)
    return html

checks = []
def check(condition, label):
    checks.append((bool(condition), label))
    print(("PASS " if condition else "FAIL ") + label)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox", "--allow-file-access-from-files", "--disable-web-security"])
    page = browser.new_page(viewport={"width": 390, "height": 844}, locale="ar-EG")
    page.add_init_script("sessionStorage.setItem('hs_intro_v1','1')")
    page.route("**/*googleapis.com/**", lambda route: route.abort())
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.set_content(inline_local_assets(), wait_until="domcontentloaded")
    page.wait_for_selector("#view .screen")

    # Carousel tabs expose a real panel relationship and roving keyboard focus.
    tabs = page.locator("#dots [role=tab]")
    check(tabs.count() > 1, "guide carousel exposes multiple tabs")
    check(all(page.locator("#" + (tabs.nth(i).get_attribute("aria-controls") or "missing")).count() == 1 for i in range(tabs.count())), "each carousel tab controls an existing slide")
    check(tabs.first.get_attribute("tabindex") == "0" and tabs.nth(1).get_attribute("tabindex") == "-1", "carousel tabs use roving tabindex")
    tabs.first.focus()
    page.keyboard.press("End")
    check(tabs.last.evaluate("el => document.activeElement === el"), "End moves focus to the final carousel tab")

    q = page.locator("#q")
    sg = page.locator("#home-sg")
    check(q.get_attribute("aria-label") == "ابحث عن فني أو خدمة", "home search has a programmatic accessible name")
    check(q.get_attribute("aria-autocomplete") == "list" and q.get_attribute("aria-controls") == "home-sg", "combobox declares list autocomplete and its popup")

    q.fill("غسالة")
    page.wait_for_timeout(140)
    check(q.get_attribute("aria-expanded") == "true" and not sg.evaluate("el => el.hidden"), "typing opens suggestions and updates expanded state")
    count = sg.locator('[role="option"]').count()
    check(count > 0, "suggestion popup exposes options")
    check(sg.locator('[role="option"]').first.get_attribute("tabindex") == "-1", "options stay out of the page Tab sequence")

    q.press("ArrowDown")
    active_id = q.get_attribute("aria-activedescendant")
    check(bool(active_id) and page.locator("#" + active_id).get_attribute("aria-selected") == "true", "ArrowDown selects and announces the active option")
    first_id = active_id
    q.press("ArrowDown")
    second_id = q.get_attribute("aria-activedescendant")
    check(second_id != first_id and page.locator("#" + second_id).get_attribute("aria-selected") == "true", "repeated ArrowDown advances active option")
    q.press("ArrowUp")
    check(q.get_attribute("aria-activedescendant") == first_id, "ArrowUp moves to the previous option")
    q.press("Enter")
    page.wait_for_timeout(120)
    check(not page.locator("#q").count(), "Enter activates the highlighted suggestion instead of submitting raw search")
    check(page.locator("#view .screen").count() == 1, "suggestion activation keeps the Customer view rendered")

    # Return home and verify Escape clears the popup state without submitting.
    page.evaluate("go('home')")
    # Carousel tabs expose a real panel relationship and roving keyboard focus.
    tabs = page.locator("#dots [role=tab]")
    check(tabs.count() > 1, "guide carousel exposes multiple tabs")
    check(all(page.locator("#" + (tabs.nth(i).get_attribute("aria-controls") or "missing")).count() == 1 for i in range(tabs.count())), "each carousel tab controls an existing slide")
    check(tabs.first.get_attribute("tabindex") == "0" and tabs.nth(1).get_attribute("tabindex") == "-1", "carousel tabs use roving tabindex")
    tabs.first.focus()
    page.keyboard.press("End")
    check(tabs.last.evaluate("el => document.activeElement === el"), "End moves focus to the final carousel tab")

    q = page.locator("#q")
    sg = page.locator("#home-sg")
    q.fill("غسالة")
    page.wait_for_timeout(140)
    q.press("ArrowDown")
    q.press("Escape")
    check(sg.evaluate("el => el.hidden") and q.get_attribute("aria-expanded") == "false", "Escape closes suggestions and resets expanded state")
    check(q.get_attribute("aria-activedescendant") is None, "Escape clears active descendant")

    # Blank input must not leave a stale listbox state.
    q.fill("")
    page.wait_for_timeout(140)
    check(sg.evaluate("el => el.hidden") and q.get_attribute("aria-expanded") == "false", "clearing the query closes and empties suggestions")
    # The dedicated Search screen is a separate flow from the home combobox.
    page.evaluate("show('search')")
    page.wait_for_selector("#hs-q")
    search_input = page.locator("#hs-q")
    results = page.locator("#hs-results")
    check(search_input.get_attribute("aria-label") == "ابحث عن جهاز أو مشكلة أو خدمة", "dedicated search field has an accessible name")
    search_input.fill("غسالة")
    page.wait_for_timeout(180)
    options = results.locator('[role="listbox"] [role="option"]')
    check(options.count() > 0, "dedicated search results expose listbox options")
    search_input.press("ArrowDown")
    active_id = search_input.get_attribute("aria-activedescendant")
    check(bool(active_id) and page.locator("#" + active_id).get_attribute("aria-selected") == "true", "dedicated search ArrowDown announces the active result")
    search_input.press("ArrowDown")
    check(search_input.get_attribute("aria-activedescendant") != active_id, "dedicated search ArrowDown advances through results")
    search_input.press("Escape")
    check(search_input.get_attribute("aria-activedescendant") is None, "dedicated search Escape clears active result")
    search_input.press("ArrowDown")
    search_input.press("Enter")
    page.wait_for_timeout(100)
    check("اطلب خدمة" in page.locator("#view").inner_text(), "Enter activates the highlighted dedicated search result and preserves its existing detail-page flow")

    check(not errors, "no uncaught browser JavaScript errors: " + " | ".join(errors))
    browser.close()

failed = [label for ok, label in checks if not ok]
print(f"\n{len(checks)-len(failed)}/{len(checks)} browser checks passed")
if failed:
    raise SystemExit(1)
