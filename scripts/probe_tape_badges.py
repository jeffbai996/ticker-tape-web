#!/usr/bin/env python3
"""Render deterministic headlines and check tier colors through hover/focus."""
import sys
import time
from playwright.sync_api import sync_playwright

events = [
    {'id': 9001, 'type': 'news', 'headline': 'Sector headline', 'symbols': [], 'meta': {'thesis': 1}},
    {'id': 9002, 'type': 'news', 'headline': 'Priority headline', 'symbols': [], 'meta': {'thesis': 2}},
    {'id': 9003, 'type': 'news', 'headline': 'Watchlist headline', 'symbols': ['MSFT', 'AAPL'], 'meta': {'thesis': 2}},
]
for event in events:
    event.update(ts_event=time.time(), source='reuters', url='https://www.reuters.com/')

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--disable-gpu'])
    page = browser.new_page(viewport={'width': 1280, 'height': 900}, service_workers='block')
    page.add_init_script("localStorage.setItem('tape-wire-url', location.origin)")

    def route_api(route):
        if '/api/events?' in route.request.url:
            route.fulfill(json={'events': events}, headers={'Access-Control-Allow-Origin': '*'})
        else:
            route.abort()

    page.route('**/api/**', route_api)
    try:
        page.goto(sys.argv[1], wait_until='domcontentloaded')
        page.locator('[data-tape-tier]').first.wait_for(state='attached', timeout=8000)
        page.mouse.move(600, 400)
        for tier in ['T1', 'T2', 'T3']:
            badge = page.locator('[data-tape-tier]').filter(has_text=tier).first
            badge.wait_for(state='attached')
            colors = '(e)=>[getComputedStyle(e).color,getComputedStyle(e).backgroundColor]'
            before = badge.evaluate(colors)
            assert before[0] == 'rgb(0, 0, 0)', (tier, before)
            badge.evaluate("e=>e.parentElement.classList.add('tape-hot')")
            assert badge.evaluate(colors) == before, (tier, 'hover recolored badge')
            badge.evaluate("e=>{e.parentElement.classList.remove('tape-hot');e.parentElement.focus()}")
            assert badge.evaluate(colors) == before, (tier, 'focus recolored badge')
        print('T1/T2/T3 text and fills remain unchanged on tape hover and keyboard focus')
    finally:
        browser.close()
