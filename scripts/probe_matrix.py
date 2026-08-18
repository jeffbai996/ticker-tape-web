#!/usr/bin/env python3
"""Served-page responsive matrix — the checks the handoff doc asks for, run
against a LIVE build (default: the tailnet server on :8098) rather than
source strings.

    python3 scripts/probe_matrix.py [base_url] [--route '#/'] [--json]

Needs playwright + chromium (any venv that has them). Views: iPhone 390x844,
iPad portrait 834, iPad landscape 1194, desktop 1024, desktop 1376 (100% and
125% zoom emulated via viewport/1.25). Each view asserts:
  * no horizontal page scroll (documentElement.scrollWidth <= clientWidth)
  * the dashboard control toolbar stays on ONE row (all children share a top)
  * every dashboard row's quote cluster is fully painted (right edge inside
    the row's clip; the ext-hours slot's last glyph hits elementFromPoint)
  * every row's price box left edge is the same x (measured columns landed)
  * the bottom nav (phone) does not cover the last row's add-symbol control
  * no console errors / pageerrors during load
Headless caveat (2026-08-18): device_scale_factor≠1 or is_mobile=True
stalls the compositor (no rAF, screenshots hang). Geometry reads still work,
so phones are emulated by viewport only; rAF-dependent widths rely on the
timer fallback in src/lib/quoteColumns.js.
"""
from __future__ import annotations

import json
import sys
import time

VIEWS = [
    ("iphone-390", 390, 844), ("ipad-portrait-834", 834, 1112),
    ("ipad-landscape-1194", 1194, 834), ("desktop-1024", 1024, 800),
    ("desktop-1376", 1376, 900), ("desktop-1376@125", 1101, 720),
]

CHECKS_JS = """() => {
  const out = {};
  const de = document.documentElement;
  out.hscroll = de.scrollWidth - de.clientWidth;
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
  let clipped = 0, unpainted = 0; const priceX = new Set();
  for (const row of rows) {
    const rr = row.getBoundingClientRect();
    if (rr.top > innerHeight || rr.bottom < 0) continue;
    const cl = row.querySelector('.tui-quote-cluster'); if (!cl) continue;
    const kids = [...cl.children];
    const price = kids[0]; if (price) priceX.add(Math.round(price.getBoundingClientRect().left - rr.left));
    const clip = row.querySelector('.overflow-hidden') || row;
    const cb = clip.getBoundingClientRect(), eb = cl.getBoundingClientRect();
    if (eb.right > cb.right + 1) clipped++;
    const ext = kids[kids.length - 1];
    if (ext && ext.getAttribute('aria-hidden') !== 'true') {
      const r = ext.getBoundingClientRect();
      const hit = document.elementFromPoint(r.right - 2, r.top + r.height / 2);
      if (!(hit && ext.contains(hit))) unpainted++;
    }
  }
  out.clippedRows = clipped; out.unpaintedExt = unpainted; out.priceXValues = [...priceX].sort((a,b)=>a-b);
  const nav = document.querySelector('nav[aria-label], .bottom-nav, [data-bottom-nav]');
  const add = [...document.querySelectorAll('button, a')].find(e => /add symbol/i.test(e.textContent || ''));
  if (nav && add) {
    const nb = nav.getBoundingClientRect(), ab = add.getBoundingClientRect();
    out.addCoveredByNav = nb.top < ab.bottom && nb.top > 0 && ab.top < nb.top && ab.top > 0 ? 1 : 0;
  }
  return out;
}"""


def main() -> int:
    from playwright.sync_api import sync_playwright
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    base = args[0] if args else "http://127.0.0.1:8098/"
    route = "#/"
    for a in sys.argv[1:]:
        if a.startswith("--route"):
            route = a.split("=", 1)[1] if "=" in a else "#/"
    as_json = "--json" in sys.argv
    results, failures = [], []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--disable-gpu"])
        for name, w, h in VIEWS:
            page = b.new_page(viewport={"width": w, "height": h})
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text[:160]}") if m.type == "error" else None)
            page.set_default_timeout(20000)
            page.goto(base + route, wait_until="domcontentloaded")
            # only the board routes have rows to wait for; SSE pages (chat,
            # wire) never go idle, so give them a fixed settle instead
            if route in ("#/", "") or "watchlists" in route:
                for _ in range(60):
                    if page.evaluate("document.querySelectorAll('.tui-quote-cluster').length"):
                        break
                    time.sleep(0.5)
            time.sleep(2.5)
            r = page.evaluate(CHECKS_JS)
            r.update({"view": name, "width": w, "errors": errors[:5]})
            bad = []
            if r.get("hscroll", 0) > 0: bad.append(f"horizontal scroll {r['hscroll']}px")
            if r.get("toolbarRows", 1) > 1: bad.append(f"toolbar wrapped to {r['toolbarRows']} rows")
            if r.get("clippedRows"): bad.append(f"{r['clippedRows']} rows clipped")
            if r.get("unpaintedExt"): bad.append(f"{r['unpaintedExt']} ext prints not painted")
            if len(r.get("priceXValues", [])) > 1 and w >= 545: bad.append(f"price x varies {r['priceXValues']}")
            if r.get("addCoveredByNav"): bad.append("bottom nav covers add-symbol")
            if errors: bad.append(f"{len(errors)} console/page errors")
            r["failures"] = bad
            results.append(r)
            failures.extend(f"{name}: {x}" for x in bad)
            page.close()
        b.close()
    if as_json:
        print(json.dumps(results, indent=1))
    else:
        for r in results:
            status = "ok " if not r["failures"] else "FAIL"
            print(f"{status} {r['view']:<22} rows={r.get('rows')} hscroll={r.get('hscroll')} "
                  f"toolbarRows={r.get('toolbarRows')} priceX={r.get('priceXValues')} "
                  f"{'; '.join(r['failures'])}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
