"""Manual Chromium behavior checks for Customer Request Wizard accessibility.
Usage: /opt/pyvenv/bin/python tests/e2e/customer-request-wizard-accessibility.browser.py
No project dependency is added; project assets are inlined for this environment.
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

    page.evaluate("startRequest()")
    page.wait_for_selector("[data-wz-heading]")
    check(page.locator("[data-wz-heading]").evaluate("el => document.activeElement === el"), "each wizard entry focuses the current step heading")
    check(page.locator("[role=progressbar]").get_attribute("aria-valuenow") == "1", "progress exposes current step numerically")
    check(page.locator("[data-wz-cat]").first.get_attribute("aria-pressed") == "false", "category choices expose selected state")

    page.locator("[data-wz-cat]").first.click()
    page.wait_for_timeout(30)
    check(page.locator("[data-wz-heading]").evaluate("el => document.activeElement === el"), "step transition moves focus to the new step heading")
    page.locator('[data-act="wzNext"]').click()
    check(page.locator("#wz-validation-error").is_visible(), "missing item produces an announced inline validation message")
    check(page.locator("[data-wz-item]").first.evaluate("el => document.activeElement === el && el.getAttribute('aria-invalid') === 'true'"), "validation focuses and marks the first actionable item choice")
    check("wz-validation-error" in (page.locator("[data-wz-item]").first.get_attribute("aria-describedby") or ""), "invalid choice is programmatically associated with its error")

    page.locator("[data-wz-item]").first.click()
    page.locator('[data-act="wzNext"]').click()
    check(page.locator("[data-wz-prob]").first.count() > 0, "problem step renders selectable options")
    page.locator('[data-act="wzNext"]').click()
    check(page.locator("[data-wz-prob]").first.evaluate("el => document.activeElement === el && el.getAttribute('aria-invalid') === 'true'"), "missing problem focuses first problem choice")
    page.locator("[data-wz-prob]").first.click()
    page.locator('[data-act="wzNext"]').click()
    check(page.locator("[data-wz-heading]").evaluate("el => document.activeElement === el"), "step with dynamic questions is entered with predictable focus")

    # Required dynamic question and description validation.
    page.evaluate("startRequest('cars','cars/engine'); WZ.problem='cars/engine/strange-noise'; WZ.step=3; show('wizard')")
    required_q = page.locator('[data-q][required]').first
    check(required_q.count() == 1, "required dynamic question is marked required")
    page.locator('[data-act="wzNext"]').click()
    check(required_q.evaluate("el => document.activeElement === el && el.getAttribute('aria-invalid') === 'true'"), "missing dynamic answer focuses the required question")
    required_q.fill("تويوتا")
    page.evaluate("WZ.step=4; WZ.desc=''; show('wizard')")
    page.locator('[data-act="wzNext"]').click()
    check(page.locator('#wz-desc').evaluate("el => document.activeElement === el && el.getAttribute('aria-invalid') === 'true'"), "short problem description focuses its labelled textarea")

    # Directly enter the address step to exercise validation without fabricating the preceding user data.
    page.evaluate("WZ.step=6; WZ.address.gov=''; WZ.address.area=''; WZ.address.addr=''; show('wizard')")
    check(page.locator("label[for=wz-gov]").count() == 1, "required address select has an explicit label association")
    page.locator('[data-act="wzNext"]').click()
    check(page.locator("#wz-gov").evaluate("el => document.activeElement === el && el.getAttribute('aria-invalid') === 'true'"), "address validation focuses the first missing field")
    check("wz-validation-error" in (page.locator("#wz-gov").get_attribute("aria-describedby") or ""), "address field references the announced validation error")

    page.evaluate("WZ.step=7; WZ.schedule.flexible=false; WZ.schedule.date=''; WZ.schedule.period=''; show('wizard')")
    check(page.locator('[data-wz-date]').first.get_attribute('aria-pressed') == 'false', "date chips expose their pressed state")
    page.locator('[data-act="wzNext"]').click()
    check(page.locator('#wz-date-input').evaluate("el => document.activeElement === el && el.getAttribute('aria-invalid') === 'true'"), "missing preferred date focuses the date input")
    page.evaluate("WZ.schedule.date=new Date().toISOString().slice(0,10); show('wizard')")
    page.locator('[data-act="wzNext"]').click()
    check(page.locator('[data-wz-period]').first.evaluate("el => document.activeElement === el && el.getAttribute('aria-invalid') === 'true'"), "missing preferred period focuses the first period choice")

    page.evaluate("WZ.step=8; WZ.contact.name=''; WZ.contact.phone=''; WZ.contact.method='call'; show('wizard')")
    check(page.locator("label[for=wz-name]").count() == 1 and page.locator("label[for=wz-phone]").count() == 1, "contact fields have explicit label associations")
    page.locator('[data-act="wzNext"]').click()
    check(page.locator("#wz-name").evaluate("el => document.activeElement === el && el.getAttribute('aria-invalid') === 'true'"), "contact validation focuses the missing name field")

    page.locator("#wz-name").fill("عميل تجريبي")
    check(page.locator("#wz-validation-error").evaluate("el => el.hidden"), "editing a field clears stale validation feedback")
    page.evaluate("show('account')")
    check(page.locator("label[for=account-login-name]").count() == 1 and page.locator("label[for=account-login-phone]").count() == 1, "Customer login form labels are explicitly associated")

    check(not errors, "no uncaught browser JavaScript errors: " + " | ".join(errors))
    browser.close()

failed = [label for ok, label in checks if not ok]
print(f"\n{len(checks)-len(failed)}/{len(checks)} browser checks passed")
if failed:
    raise SystemExit(1)
