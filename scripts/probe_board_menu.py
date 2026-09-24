#!/usr/bin/env python3
"""Check that the dashboard menu's two columns end on the same baseline."""

import argparse

from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--screenshot")
    args = parser.parse_args()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=["--disable-gpu"])
        try:
            for width in (390, 960, 1280):
                for chinese in (False, True):
                    page = browser.new_page(viewport={"width": width, "height": 900}, reduced_motion="reduce")
                    page.goto(args.url, wait_until="domcontentloaded")
                    if chinese:
                        page.locator("[data-status-locale]").click()
                    menu_button = page.locator("button:has(.board-burger)")
                    menu_button.click()
                    columns = page.locator(".board-menu-grid > div")
                    assert columns.count() == 2
                    def check_alignment():
                        bottoms = []
                        for index in (0, 1):
                            panel = columns.nth(index).locator(".board-menu-section").last
                            box = panel.bounding_box()
                            bottoms.append(box["y"] + box["height"])
                            assert panel.evaluate("el => el.scrollHeight <= el.clientHeight + 1"), (width, chinese, index)
                        assert abs(bottoms[0] - bottoms[1]) <= 1, (width, chinese, bottoms)

                    check_alignment()
                    if args.screenshot and width == 1280 and chinese:
                        page.screenshot(path=args.screenshot)
                    columns.nth(1).locator(".board-menu-section").first.locator("button").last.click()
                    check_alignment()
                    page.close()
            print("board menu columns aligned")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
