#!/usr/bin/env python3
"""Idle-cost probe — what a route costs when nobody is touching it.

    python3 scripts/probe_idle.py [base_url] [--routes='#/,#/markets'] \
                                  [--idle=20] [--settle=6] [--runs=2] \
                                  [--hidden] [--json]

Loads each route in a fresh page, lets it settle, zeroes every counter, then
sits perfectly still for `--idle` seconds and reports what the page did anyway:

  longtasks        PerformanceObserver('longtask') count + total ms
  layout/style     CDP Performance deltas: LayoutCount, RecalcStyleCount and
                   their durations (this is the "layout thrash" number)
  script/task ms   CDP ScriptDuration / TaskDuration deltas — main-thread CPU
  raf/s            app-scheduled requestAnimationFrame callbacks that actually
                   fired, per second (CSS animations do NOT appear here; they
                   run on the compositor)
  timers/s         setTimeout + setInterval callbacks that fired, per second
  net/min          network requests issued during the idle window
  listeners        live JS event listeners at the end of the window — a gauge,
                   not a delta; it is how per-cell `visibilitychange`
                   subscriptions show up
  heap MB          JS heap at the end of the window

`--hidden` re-runs the idle window with the page reporting itself as a
backgrounded tab: `document.hidden` is overridden to true and one
`visibilitychange` is dispatched, right after the counters are zeroed. That is
a simulation of the tab being buried, not the real thing — headless Chrome
will not background a page on request, and this deliberately does NOT emulate
the browser's own timer throttling or animation suspension. What it measures
is the work the APPLICATION still chooses to schedule when it has been told
nobody is looking, which is the number a timer-hygiene pass moves.

Needs playwright + chromium. Any venv with them works, e.g.
    <some-venv>/bin/python scripts/probe_idle.py

Headless caveat (2026-08-18, same as probe_matrix.py): device_scale_factor != 1
or is_mobile=True stalls the compositor on this box — no animation frames are
produced at all, so every rAF-derived number becomes a lie. Launch with
args=["--disable-gpu"], keep device_scale_factor at 1, and never set is_mobile.

Numbers are a comparison instrument, not an absolute: run BEFORE and AFTER
against the same served build, same machine, same load. Live market data makes
net/min vary between runs, so repeat with --runs if a delta looks marginal.
"""
from __future__ import annotations

import json
import statistics
import sys
import time

DEFAULT_BASE = "http://127.0.0.1:8098/"
DEFAULT_ROUTES = ["#/", "#/markets", "#/wire", "#/screen"]

# Installed before any page script runs, so wrappers see every scheduled
# callback. Counters are zeroed by __idleProbe.reset() once the page settles.
INIT_JS = r"""
(() => {
  const state = { raf: 0, timer: 0, longtasks: 0, longMs: 0, longMax: 0 };
  window.__idleProbe = state;

  const rawRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => rawRaf((t) => { state.raf++; return fn(t); });

  const rawTimeout = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...rest) => (typeof fn === 'function'
    ? rawTimeout((...a) => { state.timer++; return fn(...a); }, ms, ...rest)
    : rawTimeout(fn, ms, ...rest));

  const rawInterval = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...rest) => (typeof fn === 'function'
    ? rawInterval((...a) => { state.timer++; return fn(...a); }, ms, ...rest)
    : rawInterval(fn, ms, ...rest));

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        state.longtasks++;
        state.longMs += e.duration;
        if (e.duration > state.longMax) state.longMax = e.duration;
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* longtask unsupported: the counts stay 0 rather than throwing */ }

  state.reset = () => {
    state.raf = 0; state.timer = 0;
    state.longtasks = 0; state.longMs = 0; state.longMax = 0;
  };
})();
"""

# CDP counters worth differencing across the idle window. Everything else in
# Performance.getMetrics is either a gauge or a constant here.
DELTA_METRICS = [
    "LayoutCount", "RecalcStyleCount",
    "LayoutDuration", "RecalcStyleDuration",
    "ScriptDuration", "TaskDuration",
]


def _metrics(cdp) -> dict[str, float]:
    return {m["name"]: m["value"] for m in cdp.send("Performance.getMetrics")["metrics"]}


# Tell the page it has been backgrounded. Chromium will not actually hide a
# headless page, so the visibility API is overridden and the event fired by
# hand; see the --hidden note in the module docstring for what that does and
# does not prove.
GO_HIDDEN_JS = r"""() => {
  Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true });
  Object.defineProperty(Document.prototype, 'visibilityState', { get: () => 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}"""


def probe_route(browser, base: str, route: str, idle: float, settle: float,
                hidden: bool = False) -> dict:
    page = browser.new_page(viewport={"width": 1376, "height": 900},
                            device_scale_factor=1)
    page.add_init_script(INIT_JS)
    requests: list[float] = []
    errors: list[str] = []
    page.on("request", lambda _r: requests.append(time.monotonic()))
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"[:200]))
    page.on("console",
            lambda m: errors.append(f"console.error: {m.text[:160]}")
            if m.type == "error" else None)
    page.set_default_timeout(30000)
    page.goto(base + route, wait_until="domcontentloaded")

    # SSE/streaming routes never reach network idle, so settle on a fixed wait.
    time.sleep(settle)

    cdp = page.context.new_cdp_session(page)
    cdp.send("Performance.enable")
    before = _metrics(cdp)
    page.evaluate("window.__idleProbe.reset()")
    if hidden:
        page.evaluate(GO_HIDDEN_JS)
    mark = time.monotonic()

    # Nothing touches the page for the whole window: no input, no evaluate, no
    # screenshot. Anything the page does here, it chose to do on its own.
    time.sleep(idle)

    elapsed = time.monotonic() - mark
    after = _metrics(cdp)
    counters = page.evaluate(
        "({raf: __idleProbe.raf, timer: __idleProbe.timer,"
        " longtasks: __idleProbe.longtasks, longMs: __idleProbe.longMs,"
        " longMax: __idleProbe.longMax,"
        " heap: (performance.memory && performance.memory.usedJSHeapSize) || 0})")
    net = sum(1 for t in requests if t >= mark)
    delta = {k: after.get(k, 0) - before.get(k, 0) for k in DELTA_METRICS}

    out = {
        "route": route,
        "hidden": 1 if hidden else 0,
        "seconds": round(elapsed, 2),
        "longtasks": counters["longtasks"],
        "longtask_ms": round(counters["longMs"], 1),
        "longtask_max_ms": round(counters["longMax"], 1),
        "layouts": round(delta["LayoutCount"]),
        "layout_ms": round(delta["LayoutDuration"] * 1000, 1),
        "recalcs": round(delta["RecalcStyleCount"]),
        "recalc_ms": round(delta["RecalcStyleDuration"] * 1000, 1),
        "script_ms": round(delta["ScriptDuration"] * 1000, 1),
        "task_ms": round(delta["TaskDuration"] * 1000, 1),
        "raf_per_s": round(counters["raf"] / elapsed, 2),
        "timers_per_s": round(counters["timer"] / elapsed, 2),
        "net_per_min": round(net * 60 / elapsed, 1),
        "listeners": round(after.get("JSEventListeners", 0)),
        "heap_mb": round(counters["heap"] / 1048576, 2),
        "errors": errors[:5],
    }
    page.close()
    return out


def main() -> int:
    from playwright.sync_api import sync_playwright

    argv = sys.argv[1:]
    positional = [a for a in argv if not a.startswith("--")]
    base = positional[0] if positional else DEFAULT_BASE
    routes = DEFAULT_ROUTES
    idle, settle, runs = 20.0, 6.0, 1
    for a in argv:
        if a.startswith("--routes="):
            routes = [r.strip() for r in a.split("=", 1)[1].split(",") if r.strip()]
        elif a.startswith("--idle="):
            idle = float(a.split("=", 1)[1])
        elif a.startswith("--settle="):
            settle = float(a.split("=", 1)[1])
        elif a.startswith("--runs="):
            runs = int(a.split("=", 1)[1])
    as_json = "--json" in argv
    hidden = "--hidden" in argv

    results: list[dict] = []
    with sync_playwright() as p:
        # --disable-gpu is load-bearing here: see the headless caveat above.
        browser = p.chromium.launch(args=["--disable-gpu"])
        for route in routes:
            takes = [probe_route(browser, base, route, idle, settle, hidden)
                     for _ in range(runs)]
            if runs == 1:
                results.append(takes[0])
                continue
            merged = {"route": route, "runs": runs,
                      "errors": takes[0]["errors"]}
            for key in takes[0]:
                if key in ("route", "errors"):
                    continue
                merged[key] = round(statistics.median(t[key] for t in takes), 2)
            results.append(merged)
        browser.close()

    if as_json:
        print(json.dumps(results, indent=1))
    else:
        print(f"{base}  idle={idle}s settle={settle}s runs={runs}"
              f"{' HIDDEN(simulated)' if hidden else ''}")
        head = (f"{'route':<12}{'long':>5}{'longms':>8}{'lay':>6}{'layms':>8}"
                f"{'recalc':>8}{'recms':>8}{'scriptms':>10}{'taskms':>8}"
                f"{'raf/s':>7}{'tmr/s':>7}{'net/m':>7}{'listen':>8}{'heapMB':>8}")
        print(head)
        print("-" * len(head))
        for r in results:
            print(f"{r['route']:<12}{r['longtasks']:>5}{r['longtask_ms']:>8}"
                  f"{r['layouts']:>6}{r['layout_ms']:>8}{r['recalcs']:>8}"
                  f"{r['recalc_ms']:>8}{r['script_ms']:>10}{r['task_ms']:>8}"
                  f"{r['raf_per_s']:>7}{r['timers_per_s']:>7}"
                  f"{r['net_per_min']:>7}{r['listeners']:>8}{r['heap_mb']:>8}")
            for e in r["errors"]:
                print(f"    ! {e}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
