#!/usr/bin/env python3
"""Verify semantic shell hovers and persisted dashboard spark choices."""
import sys
from playwright.sync_api import sync_playwright, expect


def style(target, prop):
    return target.evaluate('(e,p)=>getComputedStyle(e)[p]', prop)


with sync_playwright() as p:
    browser = p.chromium.launch(args=['--disable-gpu'])
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.add_init_script("localStorage.setItem('locale_v1','en')")
    try:
        page.goto(sys.argv[1], wait_until='domcontentloaded')
        session = page.locator('[data-status-session]')
        session.wait_for()
        before = style(session, 'backgroundColor')
        session.hover()
        assert style(session, 'borderColor') == style(session, 'color')
        assert style(session, 'backgroundColor') != before
        locale = page.locator('[data-status-locale]')
        locale.hover()
        assert style(locale, 'borderColor') == 'rgba(231, 236, 243, 0.45)'
        assert style(locale, 'backgroundColor') == 'rgba(231, 236, 243, 0.1)'

        for selector in ('.hl-row', '.tape-scroll [data-tape-item]'):
            target = page.locator(selector).first
            # Each belt clips its offscreen copies; use a point inside its viewport.
            box = target.bounding_box()
            x = max(350, box['x'] + 8) if selector == '.hl-row' else 600
            page.mouse.move(x, box['y'] + box['height'] / 2)
            hot = page.locator('.tape-hot').first
            hot.wait_for()
            assert style(hot, 'backgroundColor') == 'rgba(245, 158, 11, 0.22)'
            assert style(hot, 'boxShadow') == 'rgba(245, 158, 11, 0.85) 0px 0px 0px 1px inset'
            assert style(hot, 'lineHeight') == '14px'
            assert style(hot, 'padding') == '1px 2px'

        # Ensure drift uses pointer tracking rather than a latched :hover item.
        session.click()
        page.locator('.strip-drift').wait_for()
        page.mouse.move(500, session.bounding_box()['y'] + 8)
        page.wait_for_timeout(700)
        hot = page.locator('.hl-row.tape-hot')
        hot.wait_for()
        box = hot.bounding_box()
        assert box['x'] <= 500 <= box['x'] + box['width']

        def menu():
            page.locator('button:has(.board-burger)').click()
            return page.locator('.board-menu-grid > div').nth(1).locator('section').first

        panel = menu()
        # All shapes, including Off, must survive a full document reload.
        shapes = ['area', 'line', 'base', 'vol', 'chg', 'range', 'off']
        for index, shape in enumerate(shapes):
            panel.locator('button').nth(index).click()
            assert page.evaluate("localStorage.getItem('dashboard_spark_v1')") == shape
            page.reload(wait_until='domcontentloaded')
            panel = menu()
            expect(panel.locator('button').nth(index)).to_have_attribute('aria-pressed', 'true')

        panel.locator('button').nth(1).click()
        for window in ['DAY', '1M', '3M', '6M', '1Y']:
            panel.get_by_role('button', name=window, exact=True).click()
            assert page.evaluate("localStorage.getItem('dashboard_spark_window_v1')") == window
            page.reload(wait_until='domcontentloaded')
            panel = menu()
            expect(panel.get_by_role('button', name=window, exact=True)).to_have_attribute('aria-pressed', 'true')
            expect(panel.locator('button').nth(1)).to_have_attribute('aria-pressed', 'true')

        # Off must not erase the horizon when charts are re-enabled.
        panel.locator('button').nth(6).click()
        page.evaluate("location.hash = '#/settings'")
        page.locator('.settings-page').wait_for()
        page.evaluate("location.hash = '#/'")
        panel = menu()
        expect(panel.locator('button').nth(6)).to_have_attribute('aria-pressed', 'true')
        panel.locator('button').nth(1).click()
        expect(panel.get_by_role('button', name='1Y', exact=True)).to_have_attribute('aria-pressed', 'true')
        print('Semantic pill hovers, tight amber tape targets, drifting pointer tracking, and all spark choices passed')
    finally:
        browser.close()
