"""Verify market quote hierarchy at narrow and wide rail widths, offline."""
import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch()
    page=browser.new_page(viewport={"width":1280,"height":900})
    page.route("**/*",lambda r: r.continue_() if r.request.url.startswith("http://127.0.0.1:") and "/api/" not in r.request.url else r.abort())
    page.goto(sys.argv[1],wait_until="domcontentloaded")
    row=page.locator('.market-deck-row').first
    row.wait_for()
    # Deterministic display fixtures; no live market data is fetched.
    row.locator('.market-deck-level').evaluate("e=>e.textContent='7 704.13'")
    row.locator('.market-deck-change').evaluate("e=>e.textContent='−0.02%'")
    for width in (190,240,340):
        page.locator('aside.rail').evaluate("(e,w)=>{e.style.cssText=`position:fixed;left:20px;top:100px;width:${w}px;max-height:700px;overflow:auto;z-index:100`;}",width)
        level=row.locator('.market-deck-level')
        change=row.locator('.market-deck-change')
        name=row.locator('.market-deck-name')
        box=level.bounding_box(); pct=change.bounding_box()
        assert box['x']+box['width'] <= pct['x']+1
        assert abs(box['y']+box['height']-pct['y']-pct['height']) < 6
        font=lambda el:el.evaluate("e=>parseFloat(getComputedStyle(e).fontSize)")
        assert font(level)>font(name) and font(level)>font(change)
        assert level.evaluate("e=>getComputedStyle(e).color") != name.evaluate("e=>getComputedStyle(e).color")
        assert row.evaluate("e=>e.scrollWidth<=e.clientWidth")
        row.locator('..').screenshot(path=f'/tmp/market-hierarchy-{width}.png')
    browser.close()
    print('PASS: hierarchy and aligned price/change at 190, 240 and 340px rail widths')
