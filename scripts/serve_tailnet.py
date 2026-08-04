"""Static server for dist-tailnet with no-cache on HTML.

Vite hashes every asset, so index.html is the only cache-dangerous file —
python http.server's heuristic caching let browsers hold a stale index (and
with it, yesterday's bundle). HTML revalidates every load; hashed assets
cache forever.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        if self.path.endswith((".html", "/")) or "." not in self.path.rsplit("/", 1)[-1]:
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8098
    directory = sys.argv[2] if len(sys.argv) > 2 else "dist-tailnet"
    ThreadingHTTPServer(("127.0.0.1", port),
                        partial(Handler, directory=directory)).serve_forever()
