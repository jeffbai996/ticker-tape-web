#!/usr/bin/env python3
"""Check the research AI card's empty and expanded border treatment."""

import argparse
import json

from playwright.sync_api import sync_playwright


def style(locator, prop):
    return locator.evaluate("(el, name) => getComputedStyle(el).getPropertyValue(name)", prop)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--screenshot")
    args = parser.parse_args()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=["--disable-gpu"])
        try:
            for width in (1280, 1440):
                page = browser.new_page(viewport={"width": width, "height": 900}, service_workers="block")
                page.add_init_script(f"localStorage.setItem('tape-wire-url', {json.dumps(args.url.rstrip('/'))})")
                page.route("**/api/chat/models", lambda route: route.fulfill(
                    status=200, content_type="application/json",
                    body='{"ok":true,"models":[{"key":"agy-sol","label":"GPT 6 Sol","efforts":["low","medium","high","ultra"]}]}',
                ))
                page.goto(f"{args.url.rstrip('/')}/#/research/qqq", wait_until="domcontentloaded")
                card = page.locator("[data-research-rail-modules] [data-ai-service-state]")
                card.wait_for()
                card.get_by_role("button", name="Report model").wait_for(timeout=5000)
                header = card.locator("header").first
                assert style(header, "border-bottom-width") == "0px"
                assert float(style(header, "border-bottom-left-radius").removesuffix("px")) > 0
                title = header.locator("h2").bounding_box()
                head = header.bounding_box()
                assert title["y"] >= head["y"] and title["y"] + title["height"] < head["y"] + head["height"]
                for control in header.locator("button").all():
                    box = control.bounding_box()
                    assert box["x"] >= head["x"] and box["x"] + box["width"] <= head["x"] + head["width"] + 1
                if args.screenshot and width == 1280:
                    page.screenshot(path=args.screenshot)
                card.get_by_role("button", name="Style & analysis").click()
                assert style(header, "border-bottom-width") != "0px"
                page.close()
            print("AI report card border probe passed")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
