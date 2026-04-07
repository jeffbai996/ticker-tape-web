"""Fetch per-symbol fundamentals (slower, run less frequently).

Writes data/lookup/{SYMBOL}.json for each watchlist symbol.
"""

import json
import logging
import os
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

TT_DIR = os.environ.get("TICKER_TAPE_DIR", "/tmp/ticker-tape")
sys.path.insert(0, TT_DIR)

import config  # noqa: E402

config.SYMBOLS = json.loads(
    os.environ.get("WATCHLIST_SYMBOLS", '["AAPL","MSFT","GOOG","AMZN","NVDA"]')
)

from data import fetch_stock_info  # noqa: E402

LOOKUP_DIR = Path(__file__).resolve().parent.parent / "public" / "data" / "lookup"
LOOKUP_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    for sym in config.SYMBOLS:
        log.info("Fetching lookup: %s", sym)
        try:
            info = fetch_stock_info(sym)
            if info:
                # Filter to serializable values
                clean = {}
                for k, v in info.items():
                    if isinstance(v, (int, float, str, bool, type(None))):
                        clean[k] = v
                    elif isinstance(v, list):
                        clean[k] = v
                out = LOOKUP_DIR / f"{sym}.json"
                out.write_text(json.dumps(clean, default=str, ensure_ascii=False))
                log.info("  %s: %d fields", sym, len(clean))
            else:
                log.warning("  %s: no data", sym)
        except Exception as e:
            log.warning("  %s failed: %s", sym, e)


if __name__ == "__main__":
    main()
