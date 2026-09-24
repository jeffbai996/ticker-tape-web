#!/usr/bin/env python3
"""Verify tape movement, stalled-animation recovery, and original brand effects."""
import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--disable-gpu'])
    page = browser.new_page(viewport={'width': 1280, 'height': 900}, reduced_motion='no-preference')
    try:
        page.goto(sys.argv[1], wait_until='domcontentloaded')
        belt = page.locator('.tape-scroll-ready')
        belt.wait_for()
        page.wait_for_timeout(1000)
        before = belt.evaluate('e=>getComputedStyle(e).transform')
        page.wait_for_timeout(600)
        assert before != belt.evaluate('e=>getComputedStyle(e).transform'), 'tape is stationary'
        belt.evaluate('e=>e.getAnimations()[0].pause()')
        page.wait_for_function("document.querySelector('.tape-scroll').getAnimations()[0].playState === 'running'", timeout=5000)
        box = belt.bounding_box()
        page.mouse.move(600, box['y'] + box['height'] / 2)
        hot = page.locator('.tape-hot').first
        hot.wait_for()
        assert hot.evaluate('e=>getComputedStyle(e).backgroundColor') == 'rgba(245, 158, 11, 0.22)'
        page.locator('.brand-morph').hover(force=True)
        page.wait_for_timeout(80)
        assert page.locator('.brand-word').evaluate('e=>e.getAnimations().length') > 0, 'wordmark does not animate'
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_function("getComputedStyle(document.querySelector('.tape-scroll')).animationPlayState === 'paused'")
        page.wait_for_timeout(2500)
        assert belt.evaluate('e=>e.getAnimations()[0].playState') == 'paused', 'recovery ignored reduced motion'
        page.emulate_media(reduced_motion='no-preference')
        page.wait_for_function("document.querySelector('.tape-scroll').getAnimations()[0].playState === 'running'")
        print('Tape movement, recovery, amber highlight, wordmark, and reduced-motion checks passed')
    finally:
        browser.close()
