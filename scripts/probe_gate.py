#!/usr/bin/env python3
"""Deploy gate: serve the built `dist/` and run the responsive matrix against
the exact bytes that are about to ship.

    npm run probe                      # serves dist/, gates the default routes
    npm run probe -- --offline         # same, with every off-origin host refused
    python3 scripts/probe_gate.py --dist dist --routes '#/,#/markets'

Why a server and not file://: the build ships under a base path
(`/ticker-tape-web/`), hash routing needs a real origin, and module scripts do
not load off file://. The base path is read out of the built index.html, so
the public build and the `--base=/` build both serve correctly.

Non-flaky by construction:
  * live quotes are optional — see probe_matrix.py; row-dependent checks skip
    with a note when the board is empty, everything geometric stays hard
  * one bounded retry of the WHOLE probe; the second attempt is the verdict,
    and the first attempt's failures are still printed and kept in the JSON
  * a hard per-view timeout (--timeout), so a wedged page cannot hang the job

Exit 0 clean, 1 a check regressed (block the deploy), 2 the probe could not
run twice in a row.
"""
from __future__ import annotations

import json
import re
import socket
import sys
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import probe_matrix  # noqa: E402  (path shim above)

DEFAULT_ROUTES = ["#/", "#/markets", "#/portfolio", "#/screen"]
BASE_IN_HTML = re.compile(r'(?:src|href)="(/[^"]*?/)assets/')


def detect_base_path(dist: Path) -> str:
    """The base the build was compiled for, straight out of its index.html."""
    html = (dist / "index.html").read_text(encoding="utf-8")
    m = BASE_IN_HTML.search(html)
    return m.group(1) if m else "/"


class MountedHandler(SimpleHTTPRequestHandler):
    """Serve `dist` at the build's base path, with HTML revalidated.

    Vite hashes every asset, so index.html is the only cache-dangerous file —
    and a stale index in the probe browser would grade yesterday's bundle.
    """

    mount = "/"

    def translate_path(self, path: str) -> str:
        if self.mount != "/" and path.startswith(self.mount):
            path = "/" + path[len(self.mount):]
        return super().translate_path(path)

    def end_headers(self) -> None:
        leaf = self.path.rsplit("/", 1)[-1]
        if self.path.endswith((".html", "/")) or "." not in leaf:
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        super().end_headers()

    def log_message(self, *args) -> None:  # keep the CI log about the probe
        pass


def serve(dist: Path, mount: str) -> tuple[ThreadingHTTPServer, str]:
    handler = type("Handler", (MountedHandler,), {"mount": mount})
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), partial(handler, directory=str(dist)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    port = httpd.socket.getsockname()[1]
    return httpd, f"http://127.0.0.1:{port}{mount}"


def wait_ready(base: str, timeout: float = 10.0) -> bool:
    host, port = "127.0.0.1", int(base.split(":")[2].split("/")[0])
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except OSError:
            time.sleep(0.2)
    return False


def _opt(argv: list[str], name: str, default: str | None = None) -> str | None:
    return probe_matrix._opt(argv, name) or default


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    repo = Path(__file__).resolve().parent.parent
    dist = Path(_opt(argv, "dist", "dist")).expanduser()
    if not dist.is_absolute():
        dist = repo / dist
    routes_opt = _opt(argv, "routes")
    routes = ([r.strip() for r in routes_opt.split(",") if r.strip()]
              if routes_opt else DEFAULT_ROUTES)
    attempts = int(_opt(argv, "attempts", "2"))
    timeout = float(_opt(argv, "timeout", "90"))
    settle = float(_opt(argv, "settle", "2.5"))
    json_out = _opt(argv, "json-out")
    offline = "--offline" in argv

    if not (dist / "index.html").exists():
        print(f"probe_gate: no build at {dist}/index.html — run `npm run build` first",
              file=sys.stderr)
        return 2

    mount = detect_base_path(dist)
    httpd, base = serve(dist, mount)
    print(f"probe_gate: serving {dist} at {base}")
    if not wait_ready(base):
        print("probe_gate: local server never accepted a connection", file=sys.stderr)
        return 2
    print(f"probe_gate: routes {', '.join(routes)} × {len(probe_matrix.VIEWS)} views"
          f"{' (offline: off-origin hosts refused)' if offline else ''}")

    log: list[dict] = []
    failures: list[str] = []
    broke: list[str] = []
    results: list[dict] = []
    try:
        for attempt in range(1, attempts + 1):
            started = time.monotonic()
            results = probe_matrix.run_matrix(base, routes, timeout=timeout,
                                              settle=settle, offline=offline)
            failures, broke = probe_matrix.verdict(results)
            took = round(time.monotonic() - started, 1)
            print(f"\n=== attempt {attempt}/{attempts} — {took}s, "
                  f"{len(failures)} failure(s), {len(broke)} probe error(s)")
            probe_matrix.print_table(results)
            log.append({"attempt": attempt, "seconds": took, "failures": failures,
                        "probeErrors": broke, "results": results})
            if not failures and not broke:
                break
            if attempt < attempts:
                # One bounded retry. A regression is deterministic and comes
                # back; a provider stall or a wedged page does not.
                print("probe_gate: retrying once before failing the build")
                time.sleep(3)
    finally:
        httpd.shutdown()

    if json_out:
        Path(json_out).write_text(json.dumps(
            {"base": base, "routes": routes, "offline": offline,
             "passed": not failures and not broke, "attempts": log}, indent=1),
            encoding="utf-8")
        print(f"\nprobe_gate: wrote {json_out}")

    skipped = sum(len(r.get("skipped", [])) for r in results)
    if skipped:
        print(f"probe_gate: {skipped} row-dependent check(s) skipped — the board "
              f"had no quotes (market data is not a gate)")
    if broke:
        print("\nprobe_gate: FAILED — the probe could not complete:", file=sys.stderr)
        for b in broke:
            print(f"  {b}", file=sys.stderr)
        return 2
    if failures:
        print("\nprobe_gate: FAILED — responsive regressions block the deploy:",
              file=sys.stderr)
        for f in failures:
            print(f"  {f}", file=sys.stderr)
        return 1
    print("\nprobe_gate: PASS — matrix clean, safe to publish")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
