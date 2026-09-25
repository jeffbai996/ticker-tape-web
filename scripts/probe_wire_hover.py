"""Exercise actual Wire hover/focus states against a private demo build."""
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright
from probe_gate import serve

parser = argparse.ArgumentParser()
parser.add_argument('--dist', required=True)
args = parser.parse_args()
server, base = serve(Path(args.dist), '/')
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base)
                   else route.abort())
        page.goto(base + '#/wire', wait_until='domcontentloaded')
        page.get_by_role('button', name='headlines', exact=True).click()
        row = page.locator('[data-wire-row]').first
        head = row.locator('[data-wire-headline]')
        head.wait_for()
        style = '(e) => ({bg:getComputedStyle(e).backgroundColor, transition:getComputedStyle(e).transitionDuration, cursor:getComputedStyle(e).cursor})'
        rest = row.evaluate(style)
        head.hover()
        page.wait_for_function('document.documentElement.hasAttribute("data-pointer-hover")')
        assert head.evaluate(style)['bg'] == 'rgba(231, 236, 243, 0.035)'
        assert head.evaluate(style)['transition'] == '0s'
        assert row.evaluate(style)['bg'] == rest['bg']
        head.click()
        page.wait_for_function('document.querySelector("[data-wire-headline]").getAttribute("aria-expanded") === "true"')
        body = row.locator('h3').first
        body.hover()
        page.wait_for_timeout(150)  # Existing expansion transition; hover itself is instant.
        assert row.evaluate(style)['bg'] == 'rgb(0, 0, 0)'
        assert row.evaluate(style)['cursor'] != 'pointer'
        assert head.evaluate(style)['bg'] == 'rgba(0, 0, 0, 0)'
        # Focusing an article action must not light up its ancestor container.
        row.get_by_role('button', name='Open article').focus()
        assert row.evaluate(style)['bg'] == 'rgb(0, 0, 0)'
        page.screenshot(path='/tmp/ttw-wire-body-hover.png')
        head.focus()
        page.keyboard.press('Enter')
        page.wait_for_function('document.querySelector("[data-wire-headline]").getAttribute("aria-expanded") === "false"')
        assert head.evaluate(style)['bg'] == 'rgba(231, 236, 243, 0.05)'
        # Fresh-event backgrounds are not replaced by headline hover.
        row.evaluate('(e) => { e.setAttribute("data-wire-hot", "true"); e.style.transition="none"; e.style.backgroundColor="rgb(245, 158, 11)" }')
        head.evaluate('(e) => e.blur()')
        head.hover()
        assert head.evaluate(style)['bg'] == 'rgba(0, 0, 0, 0)'
        assert row.evaluate(style)['bg'] == 'rgb(245, 158, 11)'
        assert not errors, errors
        browser.close()
        print('PASS: faint headline hover; unchanged article body; keyboard focus/toggle; preserved event flash')
finally:
    server.shutdown()
