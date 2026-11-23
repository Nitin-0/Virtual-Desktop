"""Smoke-test AINCRAD OS against the production build."""
import os
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), "..", "dist")
PORT = 4173


def main() -> None:
    handler = partial(SimpleHTTPRequestHandler, directory=os.path.abspath(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    failures: list[str] = []

    def check(name: str, cond: bool, detail: str = "") -> None:
        if cond:
            print(f"PASS {name}")
        else:
            failures.append(f"{name} {detail}")
            print(f"FAIL {name} {detail}")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1360, "height": 820})
        page.goto(f"http://127.0.0.1:{PORT}/?fast=1", wait_until="networkidle")
        page.wait_for_selector('[data-testid="desktop"]', timeout=15000)
        check("desktop", page.locator('[data-testid="desktop"]').count() == 1)

        # First run: create an account (fresh browser profile has none).
        page.wait_for_selector('[data-testid="auth-signup"]', timeout=10000)
        page.fill('[data-testid="auth-username"]', "tester")
        page.fill('[data-testid="auth-password"]', "pass1234")
        page.fill('[data-testid="auth-confirm"]', "pass1234")
        page.click('[data-testid="auth-submit"]')
        page.wait_for_selector('[data-testid="auth-screen"]', state="detached")
        check("signed up", page.locator('[data-testid="auth-screen"]').count() == 0)
        check("clock", page.locator('[data-testid="taskbar-clock"]').inner_text().strip() != "")

        page.click('[data-testid="start-button"]')
        page.wait_for_selector('[data-testid="start-menu"]')
        page.fill('[data-testid="start-search"]', "inv")
        page.click('[data-testid="launch-inventory"]')
        page.wait_for_selector('[data-testid="window-inventory"]')
        check("inventory open", page.locator('[data-testid="window-inventory"]').is_visible())
        check("banner", "not your Windows" in page.locator(".inv-banner").inner_text())

        page.click('[data-testid="inv-new-folder"]')
        page.wait_for_selector('[data-testid="dialog-input"]')
        page.fill('[data-testid="dialog-input"]', "Alpha")
        page.click('[data-testid="dialog-confirm"]')
        page.wait_for_selector('[data-testid="inv-item-Alpha"]')
        check("folder created", page.locator('[data-testid="inv-item-Alpha"]').count() == 1)

        page.click('[data-testid="start-button"]')
        page.fill('[data-testid="start-search"]', "term")
        page.click('[data-testid="launch-terminal"]')
        page.wait_for_selector('[data-testid="terminal-input"]')
        term = page.locator('[data-testid="window-terminal"] [data-testid="terminal-input"]')
        term.fill("ls")
        term.press("Enter")
        page.wait_for_timeout(300)
        output = page.locator('[data-testid="window-terminal"] [data-testid="terminal-output"]').inner_text()
        check("terminal sees folder", "Alpha/" in output, output)

        term.fill("mkdir Beta")
        term.press("Enter")
        page.wait_for_selector('[data-testid="inv-item-Beta"]', timeout=5000)
        check("terminal mkdir visible in inventory", page.locator('[data-testid="inv-item-Beta"]').count() == 1)

        term.fill("write Note.txt hello\\nworld")
        term.press("Enter")
        page.wait_for_timeout(250)
        term.fill("cat Note.txt")
        term.press("Enter")
        page.wait_for_timeout(250)
        output = page.locator('[data-testid="window-terminal"] [data-testid="terminal-output"]').inner_text()
        check("write and cat", "hello\nworld" in output, output[-400:])

        term.fill("rm -r /Home")
        term.press("Enter")
        page.wait_for_timeout(250)
        output = page.locator('[data-testid="window-terminal"] [data-testid="terminal-output"]').inner_text()
        check("protected error", "protected" in output.lower(), output[-300:])

        page.click('[data-testid="task-terminal"]')
        page.wait_for_timeout(200)
        page.screenshot(path="screenshot-desktop.png")
        page.dblclick('[data-testid="inv-item-Note.txt"]')
        page.wait_for_selector('[data-testid="editor-area"]')
        editor = page.locator('[data-testid="editor-area"]')
        check("editor opened file", "hello" in editor.input_value())
        editor.fill("persisted line")
        page.wait_for_function(
            """() => document.querySelector('[data-testid="editor-status"]')?.textContent?.includes('Saving')""",
            timeout=3000,
        )
        page.wait_for_function(
            """() => document.querySelector('[data-testid="editor-status"]')?.textContent === 'Saved'""",
            timeout=4000,
        )

        page.click('[data-testid="start-button"]')
        page.fill('[data-testid="start-search"]', "set")
        page.click('[data-testid="launch-settings"]')
        page.wait_for_selector('[data-testid="theme-twilight"]')
        page.click('[data-testid="theme-twilight"]')
        check("theme applied", page.locator('[data-testid="os-root"]').get_attribute("data-theme") == "twilight")

        page.reload(wait_until="networkidle")
        page.wait_for_selector('[data-testid="desktop"]', timeout=15000)
        check("theme persisted", page.locator('[data-testid="os-root"]').get_attribute("data-theme") == "twilight")

        page.click('[data-testid="start-button"]')
        page.fill('[data-testid="start-search"]', "inv")
        page.click('[data-testid="launch-inventory"]')
        page.wait_for_selector('[data-testid="inv-item-Alpha"]')
        page.dblclick('[data-testid="inv-item-Note.txt"]')
        page.wait_for_selector('[data-testid="editor-area"]')
        page.wait_for_function(
            """() => document.querySelector('[data-testid="editor-area"]')?.value?.includes('persisted')""",
            timeout=5000,
        )
        value = page.locator('[data-testid="editor-area"]').input_value()
        check("file persisted", value == "persisted line", repr(value))

        page.click('[data-testid="taskbar-clock"]')
        page.wait_for_selector('[data-testid="window-system"]')
        sys_text = page.locator('[data-testid="window-system"]').inner_text()
        check("system honest", "not Windows" in sys_text and "not reported" in sys_text.lower() or "Not reported" in sys_text or "browser" in sys_text.lower())

        # window controls
        page.click('[data-testid="close-system"]')
        page.wait_for_timeout(200)
        check("window closed", page.locator('[data-testid="window-system"]').count() == 0)

        browser.close()
    server.shutdown()
    if failures:
        raise SystemExit(f"{len(failures)} failure(s):\n" + "\n".join(failures))
    print("ALL PASSED")


if __name__ == "__main__":
    main()
