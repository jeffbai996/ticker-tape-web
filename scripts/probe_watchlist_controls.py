#!/usr/bin/env python3
"""Verify row removal is available through Select, not an incidental hover."""
import argparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('url')
parser.add_argument('--expect-symbol')
args = parser.parse_args()

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--disable-gpu'])
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.add_init_script("localStorage.setItem('locale_v1','en')")
    try:
        page.goto(args.url, wait_until='domcontentloaded')
        row = page.locator('[data-row-symbol]').first
        row.wait_for()
        if args.expect_symbol:
            page.locator(f'[data-row-symbol="{args.expect_symbol}"]').wait_for()
        row.hover()
        assert page.locator('.tui-row-remove').count() == 0
        assert row.get_by_role('button', name='unwatch', exact=False).count() == 0
        page.locator('[data-select-trigger]').click()
        toolbar = page.locator('[data-select-actions]')
        remove = toolbar.get_by_role('button', name='remove', exact=True)
        expect(remove).to_be_disabled()
        row.click()
        expect(remove).to_be_enabled()
        assert '#/research/' not in page.url
        # Do not remove data from a live watchlist during verification.
        toolbar.get_by_role('button', name='done', exact=True).click()
        expect(toolbar).to_have_count(0)
        print('No row-hover removal star; Select still exposes deliberate removal without navigating')
    finally:
        browser.close()
