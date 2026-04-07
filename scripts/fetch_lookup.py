"""Self-contained per-symbol fundamentals fetcher for ticker-tape-web.

Writes yf.Ticker(sym).info to public/data/lookup/{SYM}.json.
No dependency on the ticker-tape TUI repo.
"""

import json
import logging
import os
import time

import yfinance as yf

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SYMBOLS: list[str] = json.loads(os.environ.get("WATCHLIST_SYMBOLS", '["AAPL","MSFT","GOOG","AMZN","NVDA"]'))
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "data", "lookup")


def main() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    log.info("Fetching fundamentals for %d symbols", len(SYMBOLS))

    for sym in SYMBOLS:
        try:
            time.sleep(0.1)
            info = yf.Ticker(sym).info
            if not info:
                log.warning("No info for %s", sym)
                continue

            # Filter to JSON-serializable values only
            clean = {}
            for k, v in info.items():
                if isinstance(v, (str, int, float, bool, type(None))):
                    clean[k] = v
                elif isinstance(v, (list, dict)):
                    try:
                        json.dumps(v)
                        clean[k] = v
                    except (TypeError, ValueError):
                        pass

            path = os.path.join(DATA_DIR, f"{sym}.json")
            with open(path, "w") as f:
                json.dump(clean, f, separators=(",", ":"))
            log.info("Wrote %s", path)
        except Exception as e:
            log.warning("Failed for %s: %s", sym, e)

    log.info("Done.")


if __name__ == "__main__":
    main()
