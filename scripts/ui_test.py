import asyncio
from playwright.async_api import async_playwright
import json

async def main():
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            context = await browser.new_context()
            page = await context.new_page()

            results = {"errors": [], "widths_ok": {}, "tab_focus_ok": False}

            page.on("console", lambda msg: results["errors"].append(f"CONSOLE [{msg.type}]: {msg.text}") if msg.type == "error" else None)
            page.on("pageerror", lambda err: results["errors"].append(f"PAGE ERROR: {err.message}"))

            # Test main page
            print("Testing Main Page...")
            await page.goto("http://127.0.0.1:8000/")
            await page.wait_for_timeout(3000)
            
            # Test Admin page
            print("Testing Admin Page...")
            await page.goto("http://127.0.0.1:8000/admin/")
            await page.wait_for_timeout(3000)
            
            try:
                # Assuming button is in #dev-buttons
                await page.wait_for_selector("#dev-buttons button", timeout=3000)
                await page.locator("#dev-buttons button").first.click()
                await page.wait_for_timeout(2000)
            except Exception as e:
                results["errors"].append(f"Could not click dev login: {str(e)}")

            # Iterate over widths
            widths = [320, 375, 390, 768, 1024, 1440]
            for w in widths:
                await page.set_viewport_size({"width": w, "height": 800})
                await page.wait_for_timeout(1000)
                
                scroll_width = await page.evaluate("document.documentElement.scrollWidth")
                inner_width = await page.evaluate("window.innerWidth")
                ok = scroll_width <= inner_width
                results["widths_ok"][w] = ok
                if not ok:
                    results["errors"].append(f"Width {w} has scrollWidth {scroll_width} > innerWidth {inner_width}")

                if w == 375:
                    await page.screenshot(path="C:\\Users\\odd\\.gemini\\antigravity-ide\\brain\\98b681c2-aa39-40fe-ae60-ac3de65af7a0\\scratch\\admin_375.png")
                if w == 1440:
                    await page.screenshot(path="C:\\Users\\odd\\.gemini\\antigravity-ide\\brain\\98b681c2-aa39-40fe-ae60-ac3de65af7a0\\scratch\\admin_1440.png")

            # Check Tab focus
            await page.keyboard.press("Tab")
            active_element = await page.evaluate("document.activeElement.tagName")
            if active_element:
                results["tab_focus_ok"] = True

            print("RESULTS:", json.dumps(results, indent=2))
            await browser.close()
    except Exception as e:
        print("FATAL ERROR:", str(e))

if __name__ == "__main__":
    asyncio.run(main())

