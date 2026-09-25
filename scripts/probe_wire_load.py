"""Inspect the Wire route load and module errors without changing user data."""
import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch()
    page=browser.new_page(viewport={"width":1280,"height":900})
    page.on('pageerror',lambda e:print('PAGE ERROR:',str(e),flush=True))
    page.on('console',lambda m:print('CONSOLE:',m.text[:500],flush=True) if m.type=='error' else None)
    page.on('response',lambda r:print('FAILED:',r.status,r.url.split('?')[0],flush=True) if r.status>=400 else None)
    page.goto(sys.argv[1],wait_until='domcontentloaded')
    page.wait_for_timeout(12000)
    print(page.locator('main').inner_text()[:1500])
    page.screenshot(path='/tmp/ttw-wire-load.png')
    browser.close()
