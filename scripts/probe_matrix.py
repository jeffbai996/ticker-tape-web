#!/usr/bin/env python3
"""Served-page responsive matrix — the checks the handoff doc asks for, run
against a LIVE build (default: the local static server on :8098) rather than
source strings.

    python3 scripts/probe_matrix.py [base_url] [--route '#/'] [--json]
    python3 scripts/probe_matrix.py [base_url] --routes '#/,#/markets' \
            [--json-out=FILE] [--timeout=90] [--settle=2.5] [--offline] [--quiet]

Needs playwright + chromium (any venv that has them). Views: iPhone 390x844,
iPad portrait 834, iPad landscape 1194, desktop 1024, desktop 1376 (100% and
125% zoom emulated via viewport/1.25). Each view asserts:
  * no horizontal page scroll (documentElement.scrollWidth <= clientWidth)
  * the route painted something at all (element count over a floor)
  * the dashboard control toolbar stays on ONE row (all children share a top)
  * every dashboard row's quote cluster is fully painted (right edge inside
    the row's clip; the ext-hours slot's last glyph hits elementFromPoint)
  * every row's price box left edge is the same x (measured columns landed)
  * the bottom nav (phone) does not cover the last row's add-symbol control
  * no console errors / pageerrors during load

Live quotes are NOT a precondition. Anything that needs painted rows (quote
clip, ext-hours paint, price-column alignment) is SKIPPED with a printed note
when the board came up empty, so a market-data outage cannot turn the matrix
red; geometry, overflow, toolbar rows and console errors are asserted either
way. Console errors raised by an off-origin host (the data worker, the font
CDN, the quote websocket) are recorded as provider noise rather than failures
— only errors from the served build itself are.

Exit codes: 0 clean, 1 a check regressed, 2 the probe itself could not run
(browser launch, navigation timeout) — the caller decides whether to retry.

Headless caveat (2026-08-18): device_scale_factor≠1 or is_mobile=True
stalls the compositor (no rAF, screenshots hang). Geometry reads still work,
so phones are emulated by viewport only; rAF-dependent widths rely on the
timer fallback in src/lib/quoteColumns.js.
"""
from __future__ import annotations

import json
import re
import sys
import time
from urllib.parse import urlsplit

DEFAULT_BASE = "http://127.0.0.1:8098/"

VIEWS = [
    ("iphone-390", 390, 844), ("ipad-portrait-834", 834, 1112),
    ("ipad-landscape-1194", 1194, 834), ("desktop-1024", 1024, 800),
    ("desktop-1376", 1376, 900), ("desktop-1376@125", 1101, 720),
]

# A route that renders fewer elements than this never got past the shell —
# a broken lazy chunk white-screens instead of failing a geometry check, and
# every check below would pass vacuously on a blank page.
MIN_NODES = 150

# Console text that means "a network fetch failed", as opposed to "the app
# threw". Paired with an off-origin URL it is a provider hiccup, not a
# regression; the same text against the served build itself is a broken asset.
NETWORK_NOISE = re.compile(
    r"failed to load resource|net::err|err_(?:connection|name|timed|failed|aborted)"
    r"|websocket connection to|fetch api cannot load|status of [45]\d\d"
    r"|load failed|networkerror", re.I)

URL_IN_TEXT = re.compile(r"https?://[^\s'\"()]+", re.I)

CHECKS_JS = """() => {
  const out = {};
  const de = document.documentElement;
  out.hscroll = de.scrollWidth - de.clientWidth;
  out.nodes = document.querySelectorAll('*').length;
  const ctl = document.querySelector('.dashboard-controls');
  if (ctl) {
    // a wrap puts a control a full control-height lower; ±2px is box noise
    const tops = [...ctl.children].filter(k => getComputedStyle(k).display !== 'none')
      .map(k => k.getBoundingClientRect().top).sort((a, b) => a - b);
    let rows = tops.length ? 1 : 0;
    for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > 12) rows++;
    out.toolbarRows = rows;
  }
  const rows = [...document.querySelectorAll('.tui-row')];
  out.rows = rows.length;
  // Bottom chrome (the ticker> console, the phone nav) sits OVER the board by
  // design — fixed on some breakpoints, sticky in a flex shell on others — so
  // a row behind it is scrolled-past, not clipped. Find the floor by asking
  // the page what actually paints at the bottom edge rather than by position.
  let floor = innerHeight;
  for (const x of [innerWidth * 0.25, innerWidth * 0.5, innerWidth * 0.75]) {
    let el = document.elementFromPoint(x, innerHeight - 2);
    while (el && el !== document.body) {
      const r = el.getBoundingClientRect();
      // full-width band pinned to the bottom edge = chrome, not board content
      if (r.width > innerWidth * 0.9 && r.bottom >= innerHeight - 2
          && r.top > innerHeight * 0.5 && !el.closest('.tui-row')) {
        floor = Math.min(floor, r.top);
        break;
      }
      el = el.parentElement;
    }
  }
  out.floor = Math.round(floor);
  let clipped = 0, unpainted = 0, priced = 0, clusters = 0;
  const priceX = new Set();
  for (const row of rows) {
    const rr = row.getBoundingClientRect();
    if (rr.top > floor || rr.bottom < 0) continue;
    const cl = row.querySelector('.tui-quote-cluster'); if (!cl) continue;
    clusters++;
    const kids = [...cl.children];
    const price = kids[0];
    if (price) {
      priceX.add(Math.round(price.getBoundingClientRect().left - rr.left));
      // a quote that arrived prints digits; an empty board prints an em dash
      if (/[0-9]/.test(price.textContent || '')) priced++;
    }
    const clip = row.querySelector('.overflow-hidden') || row;
    const cb = clip.getBoundingClientRect(), eb = cl.getBoundingClientRect();
    if (eb.right > cb.right + 1) clipped++;
    const ext = kids[kids.length - 1];
    if (ext && ext.getAttribute('aria-hidden') !== 'true') {
      const r = ext.getBoundingClientRect();
      if (r.bottom <= floor) {
        const hit = document.elementFromPoint(r.right - 2, r.top + r.height / 2);
        if (!(hit && ext.contains(hit))) unpainted++;
      }
    }
  }
  out.clippedRows = clipped; out.unpaintedExt = unpainted;
  out.clusters = clusters; out.pricedRows = priced;
  out.priceXValues = [...priceX].sort((a, b) => a - b);
  const nav = document.querySelector('nav[aria-label], .bottom-nav, [data-bottom-nav]');
  const add = [...document.querySelectorAll('button, a')].find(e => /add symbol/i.test(e.textContent || ''));
  if (nav && add) {
    const nb = nav.getBoundingClientRect(), ab = add.getBoundingClientRect();
    out.addCoveredByNav = nb.top < ab.bottom && nb.top > 0 && ab.top < nb.top && ab.top > 0 ? 1 : 0;
  }
  return out;
}"""


def origin_of(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def classify_error(kind: str, text: str, url: str, origin: str) -> str:
    """'hard' (the build's own fault) or 'noise' (someone else's network)."""
    if kind == "pageerror":
        return "hard"
    if url and not url.startswith(origin):
        return "noise"
    if NETWORK_NOISE.search(text):
        # message-level fallback: the location is the app bundle that issued
        # the request, but the URL that failed is somebody else's host
        for found in URL_IN_TEXT.findall(text):
            if not found.startswith(origin):
                return "noise"
    return "hard"


def board_route(route: str) -> bool:
    """Routes that paint quote rows and are worth waiting on for data."""
    return route in ("#/", "#", "") or "watchlists" in route


def _grade(r: dict, width: int) -> tuple[list[str], list[str]]:
    """Return (failures, skipped). Data-dependent checks skip on an empty board."""
    failures, skipped = [], []
    if r.get("hscroll", 0) > 0:
        failures.append(f"horizontal scroll {r['hscroll']}px")
    if r.get("nodes", 0) < MIN_NODES:
        failures.append(f"route painted {r.get('nodes', 0)} elements (< {MIN_NODES})")
    if r.get("toolbarRows", 1) > 1:
        failures.append(f"toolbar wrapped to {r['toolbarRows']} rows")
    if r.get("addCoveredByNav"):
        failures.append("bottom nav covers add-symbol")
    if r.get("hardErrors"):
        failures.append(f"{len(r['hardErrors'])} console/page errors")

    has_rows = bool(r.get("clusters"))
    has_data = bool(r.get("pricedRows"))
    if not has_rows:
        # not a board route at all — nothing to skip, nothing to assert
        return failures, skipped
    if not has_data:
        skipped.append("quote-cell paint + price-column alignment (board has no quotes)")
        return failures, skipped
    if r.get("clippedRows"):
        failures.append(f"{r['clippedRows']} rows clipped")
    if r.get("unpaintedExt"):
        failures.append(f"{r['unpaintedExt']} ext prints not painted")
    if len(r.get("priceXValues", [])) > 1 and width >= 545:
        failures.append(f"price x varies {r['priceXValues']}")
    return failures, skipped


def probe_view(browser, base: str, route: str, view: tuple[str, int, int],
               timeout: float, settle: float, offline: bool) -> dict:
    """One route at one viewport. Raises nothing the caller cannot classify:
    a navigation failure comes back as record['probeError']."""
    name, w, h = view
    origin = origin_of(base)
    deadline = time.monotonic() + timeout
    started = time.monotonic()
    page = browser.new_page(viewport={"width": w, "height": h})
    errors: list[dict] = []
    page.on("pageerror", lambda e: errors.append(
        {"kind": "pageerror", "text": str(e)[:200], "url": ""}))
    page.on("console", lambda m: errors.append(
        {"kind": "console." + m.type, "text": m.text[:200],
         "url": (m.location or {}).get("url", "")}) if m.type == "error" else None)
    if offline:
        # Proves the gate survives a dead data provider: everything that is
        # not the build under test is refused.
        page.route("**/*", lambda r: r.continue_() if r.request.url.startswith(origin)
                   else r.abort())
    page.set_default_timeout(max(2000, int(min(20.0, timeout) * 1000)))
    record: dict = {"route": route, "view": name, "width": w, "height": h}
    try:
        page.goto(base + route, wait_until="domcontentloaded",
                  timeout=max(2000, int(min(30.0, timeout) * 1000)))
        # only the board routes have rows to wait for; SSE pages (chat, wire)
        # never go idle, so give them a fixed settle instead
        if board_route(route):
            while time.monotonic() < deadline - settle:
                if page.evaluate("document.querySelectorAll('.tui-quote-cluster').length"):
                    break
                time.sleep(0.5)
        time.sleep(min(settle, max(0.5, deadline - time.monotonic())))
        r = page.evaluate(CHECKS_JS)
        record.update(r)
        hard = [e for e in errors if classify_error(e["kind"], e["text"], e["url"], origin) == "hard"]
        record["hardErrors"] = [f"{e['kind']}: {e['text']}" for e in hard][:5]
        record["noise"] = [f"{e['kind']}: {e['text']}" for e in errors if e not in hard][:5]
        failures, skipped = _grade(record, w)
        if failures and time.monotonic() < deadline - 1.5:
            # One re-read before calling it: measured columns and lazy widgets
            # settle asynchronously, and a width read mid-update is not a
            # regression. A real overflow is still there 1.5s later.
            time.sleep(1.5)
            record.update(page.evaluate(CHECKS_JS))
            hard = [e for e in errors if classify_error(e["kind"], e["text"], e["url"], origin) == "hard"]
            record["hardErrors"] = [f"{e['kind']}: {e['text']}" for e in hard][:5]
            record["noise"] = [f"{e['kind']}: {e['text']}" for e in errors if e not in hard][:5]
            record["recheck"] = 1
            failures, skipped = _grade(record, w)
        record["failures"] = failures
        record["skipped"] = skipped
    except Exception as exc:  # playwright timeouts, target crashes
        record["probeError"] = f"{type(exc).__name__}: {exc}".replace("\n", " ")[:200]
        record.setdefault("failures", [])
        record.setdefault("skipped", [])
        record.setdefault("hardErrors", [])
        record.setdefault("noise", [])
    finally:
        record["ms"] = round((time.monotonic() - started) * 1000)
        page.close()
    return record


def run_matrix(base: str, routes: list[str], views=VIEWS, timeout: float = 90.0,
               settle: float = 2.5, offline: bool = False) -> list[dict]:
    """Every route × every view. Importable so the CI gate does not shell out."""
    from playwright.sync_api import sync_playwright

    if not base.endswith("/"):
        base += "/"
    results: list[dict] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu"])
        try:
            for route in routes:
                for view in views:
                    results.append(probe_view(browser, base, route, view,
                                              timeout, settle, offline))
        finally:
            browser.close()
    return results


def verdict(results: list[dict]) -> tuple[list[str], list[str]]:
    """(failures, probe_errors) — the second list is 'the probe broke', not
    'the build broke', which is the difference between exit 1 and exit 2."""
    failures, broke = [], []
    for r in results:
        tag = f"{r['route']} {r['view']}"
        failures.extend(f"{tag}: {x}" for x in r.get("failures", []))
        if r.get("probeError"):
            broke.append(f"{tag}: {r['probeError']}")
    return failures, broke


def print_table(results: list[dict], stream=sys.stdout) -> None:
    head = (f"{'':<4} {'route':<14}{'view':<22}{'rows':>5}{'quotes':>7}"
            f"{'hscroll':>8}{'tbRows':>7}  priceX")
    print(head, file=stream)
    print("-" * len(head), file=stream)
    for r in results:
        if r.get("probeError"):
            status = "ERR "
        elif r.get("failures"):
            status = "FAIL"
        elif r.get("skipped"):
            status = "skip"
        else:
            status = "ok  "
        print(f"{status} {r['route']:<14}{r['view']:<22}{str(r.get('rows', '-')):>5}"
              f"{str(r.get('pricedRows', '-')):>7}{str(r.get('hscroll', '-')):>8}"
              f"{str(r.get('toolbarRows', '-')):>7}  {r.get('priceXValues', [])}",
              file=stream)
        for x in r.get("failures", []):
            print(f"       ! {x}", file=stream)
        for x in r.get("skipped", []):
            print(f"       ~ skipped: {x}", file=stream)
        if r.get("probeError"):
            print(f"       ! probe error: {r['probeError']}", file=stream)
        for x in r.get("noise", []):
            print(f"       . provider noise (not a failure): {x}", file=stream)


def _opt(argv: list[str], name: str) -> str | None:
    """Accept both `--name=value` and `--name value`."""
    for i, a in enumerate(argv):
        if a == f"--{name}" and i + 1 < len(argv) and not argv[i + 1].startswith("--"):
            return argv[i + 1]
        if a.startswith(f"--{name}="):
            return a.split("=", 1)[1]
    return None


def parse_args(argv: list[str]) -> dict:
    consumed: set[int] = set()
    for i, a in enumerate(argv):
        if a.startswith("--"):
            consumed.add(i)
            if "=" not in a and i + 1 < len(argv) and not argv[i + 1].startswith("--"):
                consumed.add(i + 1)
    positional = [a for i, a in enumerate(argv) if i not in consumed]
    routes_opt = _opt(argv, "routes")
    route_opt = _opt(argv, "route")
    if routes_opt:
        routes = [r.strip() for r in routes_opt.split(",") if r.strip()]
    elif route_opt:
        routes = [route_opt]
    else:
        routes = ["#/"]
    return {
        "base": positional[0] if positional else DEFAULT_BASE,
        "routes": routes,
        "timeout": float(_opt(argv, "timeout") or 90),
        "settle": float(_opt(argv, "settle") or 2.5),
        "json_out": _opt(argv, "json-out"),
        "as_json": "--json" in argv,
        "offline": "--offline" in argv,
        "quiet": "--quiet" in argv,
    }


def main(argv: list[str] | None = None) -> int:
    opts = parse_args(list(sys.argv[1:] if argv is None else argv))
    results = run_matrix(opts["base"], opts["routes"], timeout=opts["timeout"],
                         settle=opts["settle"], offline=opts["offline"])
    failures, broke = verdict(results)
    if opts["as_json"]:
        print(json.dumps(results, indent=1))
    elif not opts["quiet"]:
        print_table(results)
    if opts["json_out"]:
        with open(opts["json_out"], "w", encoding="utf-8") as fh:
            json.dump(results, fh, indent=1)
    if broke:
        return 2
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
