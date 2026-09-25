"""Local admin browser regression. Requires Playwright and its browser binaries.

Run against a localhost process using a disposable demo database:
    python scripts/admin_ui_regression.py --browser both
Never use production credentials or a production database for this check.
"""
import argparse
import asyncio
import json
from pathlib import Path
from urllib.parse import urlparse

WIDTHS = [320, 360, 375, 390, 414, 768, 1024, 1440]
VIEWS = ['overview', 'stats', 'server', 'security']

# Check boxes themselves, not just document.scrollWidth, which overflow:hidden
# could hide. Internal, explicit data-table scrolling is the only exception.
GEOMETRY = """() => {
    const width = document.documentElement.clientWidth;
    const selectors = '.content,main,.page,.grid,.card,.card-head,.kpi,.tile,.toolbar,.segmented,.chart,.group-table,.gt-row,.audit-row,.kv,.login-card,.code-form,.topbar,.tabbar';
    const failures = [];
    for (const el of document.querySelectorAll(selectors)) {
        if (!el.getClientRects().length) continue;
        const r = el.getBoundingClientRect();
        if (r.left < -1 || r.right > width + 1 || el.scrollWidth > el.clientWidth + 1)
            failures.push({element: el.className || el.tagName, left:r.left, right:r.right, client:el.clientWidth, scroll:el.scrollWidth});
    }
    for (const el of [document.documentElement, document.body]) {
        if (['hidden','clip'].includes(getComputedStyle(el).overflowX))
            failures.push({element:el.tagName, problem:'Root overflow masking'});
    }
    if (document.documentElement.scrollWidth > width + 1)
        failures.push({problem:'Document overflow',width,scroll:document.documentElement.scrollWidth});
    return failures;
}"""


async def settle(page):
    await page.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')


async def check_layout(page, report, label):
    await settle(page)
    failures = await page.evaluate(GEOMETRY)
    report['checks'].append({'case': label, 'failures': failures})
    assert not failures, f'{label}: {json.dumps(failures, ensure_ascii=False)}'


async def run_engine(playwright, engine_name, base, output):
    report = {'browser': engine_name, 'checks': [], 'errors': []}
    engine = getattr(playwright, engine_name)
    browser = await engine.launch()
    try:
        context = await browser.new_context(
            viewport={'width': 390, 'height': 844},
            device_scale_factor=2, has_touch=True, service_workers='block',
        )
        page = await context.new_page()
        def on_page_error(e):
            if 'ResizeObserver loop' in str(e): return
            report['errors'].append(str(e))
        page.on('pageerror', on_page_error)
        def on_console(m):
            if m.type == 'error':
                text = m.text
                if 'ResizeObserver loop' in text: return
                if 'Refused to apply a stylesheet' in text and 'Content Security Policy' in text: return
                report['errors'].append(text)
        page.on('console', on_console)
        await page.goto(base + '/admin/', wait_until='domcontentloaded')
        await page.locator('#login').wait_for(state='visible')
        # A 401 /me response is normal before authentication, not a UI failure.
        report['errors'].clear()
        for width in WIDTHS[:5]:
            await page.set_viewport_size({'width': width, 'height': 844})
            await check_layout(page, report, f'login/{width}')
        await page.locator('#dev-buttons button').first.click()
        await page.locator('#app').wait_for(state='visible')
        for width in WIDTHS:
            await page.set_viewport_size({'width': width, 'height': 844})
            for view in VIEWS:
                nav = '.tabbar' if width <= 860 else '.side-nav'
                await page.locator(f'{nav} [data-view="{view}"]').click()
                await page.wait_for_function('view => { const p = document.getElementById("page-"+view); return !p.hidden && p.querySelector(".card") && !p.querySelector(".error-card") && !p.hasAttribute("aria-busy"); }', arg=view)
                await check_layout(page, report, f'{view}/{width}')
                if width in [320, 390, 1440]:
                    await page.screenshot(path=str(output / f'{engine_name}-{view}-{width}.png'), full_page=True)
                if view == 'security':
                    await page.evaluate('''() => {
                        const name = document.querySelector('#page-security .kv dd');
                        if (name) name.textContent = 'ДужеДовгеІмяБезПробілів'.repeat(12);
                        const ip = document.querySelector('#page-security .audit-row .mono');
                        if (ip) ip.textContent = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
                    }''')
                    await check_layout(page, report, f'long-content/{width}')
                if view == 'stats':
                    chart = page.locator('#page-stats .chart').first
                    svg = chart.locator('svg').first
                    box = await svg.bounding_box()
                    await page.mouse.move(box['x'] + box['width'] - 24, box['y'] + 90)
                    await check_layout(page, report, f'tooltip/{width}')
                    tip = chart.locator('.chart-tip')
                    if await tip.is_visible():
                        tip_box = await tip.bounding_box()
                        assert tip_box['x'] >= 0 and tip_box['x'] + tip_box['width'] <= width + 1
                    await chart.locator('summary').click()
                    await check_layout(page, report, f'expanded-values/{width}')
                    assert await chart.locator('tbody tr').count() > 0
                    await chart.locator('summary').click()
                    for label in ['Сьогодні', 'Весь час', '14 днів']:
                        await page.locator('#page-stats .toolbar button').filter(has_text=label).click()
                        await page.wait_for_function('() => !document.getElementById("page-stats").hasAttribute("aria-busy")')
                        await check_layout(page, report, f'range-{label}/{width}')
        # Keyboard focus must be visibly outlined, not merely exist.
        await page.locator('#refresh-btn').focus()
        await page.keyboard.press('Tab')
        focus = await page.evaluate('''() => {
            const el = document.activeElement, s = getComputedStyle(el);
            return {tag:el.tagName, visible:el.matches(':focus-visible'), width:parseFloat(s.outlineWidth), style:s.outlineStyle};
        }''')
        assert focus['visible'] and focus['width'] >= 2 and focus['style'] != 'none', focus
        await context.close()
        assert not report['errors'], report['errors']
        return report
    finally:
        (output / f'{engine_name}-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        await browser.close()


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:8000')
    parser.add_argument('--browser', choices=['chromium', 'webkit', 'both'], default='both')
    parser.add_argument('--output', default='test-results/admin-v3')
    args = parser.parse_args()
    parsed = urlparse(args.base_url)
    if parsed.hostname not in {'127.0.0.1', 'localhost', '::1'} or parsed.scheme != 'http':
        raise SystemExit('Only a local HTTP demo server is allowed.')
    from playwright.async_api import async_playwright
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    names = ['chromium', 'webkit'] if args.browser == 'both' else [args.browser]
    async with async_playwright() as playwright:
        for name in names:
            result = await run_engine(playwright, name, args.base_url.rstrip('/'), output)
            print(name, 'PASS:', len(result['checks']), 'layout cases')


if __name__ == '__main__':
    asyncio.run(main())

