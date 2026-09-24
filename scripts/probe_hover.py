#!/usr/bin/env python3
"""Check the desktop terminal's pointer highlights and rail geometry."""

import argparse

from playwright.sync_api import sync_playwright


def style(locator, property_name):
    return locator.evaluate("(el, prop) => getComputedStyle(el).getPropertyValue(prop)", property_name)


def center(box):
    return box["x"] + box["width"] / 2


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--width", type=int, default=1440)
    parser.add_argument("--rail-width", type=int, help="override the saved dashboard rail width")
    parser.add_argument("--touch", action="store_true", help="emulate a touch-capable desktop with a mouse")
    parser.add_argument("--screenshot", help="save the initial desktop layout for visual review")
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=["--disable-gpu"])
        page = browser.new_page(viewport={"width": args.width, "height": 900}, has_touch=args.touch)
        try:
            if args.rail_width:
                page.add_init_script(f"localStorage.setItem('ttw-dashboard-rail-width', '{args.rail_width}')")
            page.goto(args.url, wait_until="domcontentloaded")
            page.locator("[data-status-clock]").wait_for()
            page.locator("[data-dashboard-rail-resize]").wait_for()
            if args.screenshot:
                page.screenshot(path=args.screenshot)
            for selector in (
                "[data-status-session]",
                "[data-status-clock]",
                "[data-status-locale]",
                ".terminal-navigation a",
                '[data-row-link="ticker-overview"]',
            ):
                target = page.locator(selector).first
                target.wait_for()
                before = style(target, "background-image")
                target.hover()
                after = style(target, "background-image")
                assert before == "none" and "linear-gradient" in after, (selector, before, after)

            tape = page.locator(".tape-scroll").first.bounding_box()
            page.mouse.move(args.width / 2, tape["y"] + tape["height"] / 2)
            hot = page.locator("[data-tape-item].tape-hot").first
            hot.wait_for()
            assert style(hot, "background-color") != "rgba(0, 0, 0, 0)"

            nav = page.locator("nav.terminal-sidebar")
            resize = page.locator("[data-sidebar-resize]")
            grip = resize.locator("span")
            nav_box, grip_box = nav.bounding_box(), grip.bounding_box()
            assert abs(center(grip_box) - (nav_box["x"] + nav_box["width"])) < 2
            assert abs(float(style(grip, "height").removesuffix("px")) - 48) < 0.1
            before = style(grip, "background-color")
            resize.hover(position={"x": resize.bounding_box()["width"] / 2, "y": 450})
            after = style(grip, "background-color")
            assert before != after, (before, after)

            price = page.locator(".rail .price-grouped").first
            price.wait_for()
            assert style(price, "display") != "none", "equity-index level hidden at 230px rail"
            price_box = price.bounding_box()
            percent_x = price.evaluate("el => el.nextElementSibling.getBoundingClientRect().left")
            assert price_box["x"] + price_box["width"] <= percent_x + 1
            levels = page.locator(".market-deck-level")
            assert levels.count() == 20
            assert all(style(levels.nth(i), "display") != "none" for i in range(levels.count()))
            assert max(levels.nth(i).bounding_box()["x"] for i in range(levels.count())) - min(
                levels.nth(i).bounding_box()["x"] for i in range(levels.count())) < 1
            rail_right = page.locator("aside.rail").bounding_box()["x"] + page.locator("aside.rail").bounding_box()["width"]
            assert all(levels.nth(i).bounding_box()["x"] + levels.nth(i).bounding_box()["width"] <= rail_right
                       for i in range(levels.count()))

            left_hide = page.locator("[data-sidebar-hide]")
            assert left_hide.is_visible()
            assert left_hide.bounding_box()["x"] + left_hide.bounding_box()["width"] <= nav_box["x"] + nav_box["width"]
            assert style(left_hide, "border-radius") == "6px"
            left_hide.click()
            left_show = page.locator("[data-sidebar-show]")
            assert left_show.is_visible()
            left_show.click()
            assert left_hide.is_visible()

            rail = page.locator("aside.rail")
            rail_box = rail.bounding_box()
            right_resize = page.locator("[data-dashboard-rail-resize]")
            assert abs(center(right_resize.bounding_box()) - rail_box["x"]) < 2
            right_grip = right_resize.locator("span")
            assert abs(float(style(right_grip, "height").removesuffix("px")) - 48) < 0.1
            right_grip_box = right_grip.bounding_box()
            assert abs(right_grip_box["y"] - grip_box["y"]) < 30
            grip_before = style(right_grip, "background-color")
            right_resize.hover(position={"x": right_resize.bounding_box()["width"] / 2, "y": 450})
            assert style(right_grip, "background-color") != grip_before
            page.locator("main").first.evaluate("el => el.scrollTop = 500")
            assert abs(right_grip.bounding_box()["y"] - right_grip_box["y"]) < 30
            page.locator("main").first.evaluate("el => el.scrollTop = 0")
            grip_at = right_grip.bounding_box()
            page.mouse.move(center(grip_at), grip_at["y"] + grip_at["height"] / 2)
            page.mouse.down()
            page.mouse.move(center(grip_at) - 40, grip_at["y"] + grip_at["height"] / 2)
            page.mouse.up()
            assert rail.bounding_box()["width"] >= rail_box["width"] + 35
            rail_box = rail.bounding_box()
            right_resize.focus()
            right_resize.press("ArrowLeft")
            assert rail.bounding_box()["width"] > rail_box["width"]
            right_resize.press("Home")
            right_show = page.locator("[data-dashboard-rail-show]")
            assert right_show.is_visible()
            assert right_show.bounding_box()["y"] < 200
            right_show.click()
            assert right_resize.is_visible()
            print("hover and rail probe passed")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
