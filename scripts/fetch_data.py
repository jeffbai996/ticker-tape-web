"""Fetch market data using ticker-tape's data layer and write JSON files.

This script is run by GitHub Actions on a cron schedule. It clones the
ticker-tape repo and imports its data.py directly via sys.path injection,
so all the yfinance logic, caching, and fallback behavior is reused.

Environment variables:
    TICKER_TAPE_DIR: path to ticker-tape repo (default: /tmp/ticker-tape)
    WATCHLIST_SYMBOLS: JSON array of symbols (default: generic list)
    THESIS_BUCKETS: JSON dict of {name: [symbols]} (default: {})
"""

import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

# --- Path setup ---
TT_DIR = os.environ.get("TICKER_TAPE_DIR", "/tmp/ticker-tape")
sys.path.insert(0, TT_DIR)

# --- Monkey-patch config before importing data ---
import config  # noqa: E402

_symbols_raw = os.environ.get(
    "WATCHLIST_SYMBOLS", '["AAPL","MSFT","GOOG","AMZN","NVDA"]'
)
config.SYMBOLS = json.loads(_symbols_raw)

_buckets_raw = os.environ.get("THESIS_BUCKETS", "{}")
config.THESIS_BUCKETS = json.loads(_buckets_raw)

log.info("Symbols: %s", config.SYMBOLS)
log.info("Buckets: %s", list(config.THESIS_BUCKETS.keys()))

# --- Import data layer ---
import yfinance as yf  # noqa: E402
from data import (  # noqa: E402
    fetch_chart_data_batch,
    fetch_commodities,
    fetch_earnings,
    fetch_market_overview,
    fetch_news_batch,
    fetch_quotes,
    fetch_sector_performance,
    fetch_technicals_batch,
    market_holiday,
    market_state,
)
from econ_calendar import get_upcoming  # noqa: E402

# --- Output directory ---
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CHARTS_DIR = DATA_DIR / "charts"
LOOKUP_DIR = DATA_DIR / "lookup"
DATA_DIR.mkdir(exist_ok=True)
CHARTS_DIR.mkdir(exist_ok=True)
LOOKUP_DIR.mkdir(exist_ok=True)


def write_json(path: Path, obj: object) -> None:
    """Write JSON with compact formatting."""
    path.write_text(json.dumps(obj, default=str, ensure_ascii=False, indent=None))
    log.info("Wrote %s (%d bytes)", path.name, path.stat().st_size)


def fetch_ohlcv(symbol: str, period: str, interval: str) -> list[dict]:
    """Fetch OHLCV data in lightweight-charts format."""
    try:
        df = yf.Ticker(symbol).history(period=period, interval=interval)
        if df.empty:
            return []
        records = []
        for ts, row in df.iterrows():
            # lightweight-charts expects UTC timestamps in seconds
            t = int(ts.timestamp())
            records.append({
                "time": t,
                "open": round(row["Open"], 2),
                "high": round(row["High"], 2),
                "low": round(row["Low"], 2),
                "close": round(row["Close"], 2),
                "volume": int(row["Volume"]),
            })
        return records
    except Exception as e:
        log.warning("OHLCV fetch failed %s %s/%s: %s", symbol, period, interval, e)
        return []


TIMEFRAMES = [
    ("1d", "1d", "5m"),
    ("5d", "5d", "15m"),
    ("1mo", "1mo", "1d"),
    ("3mo", "3mo", "1d"),
    ("1y", "1y", "1d"),
    ("5y", "5y", "1wk"),
]


def main() -> None:
    symbols = config.SYMBOLS
    t0 = time.time()

    # 1. Meta
    state = market_state()
    holiday = market_holiday()
    meta = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "market_state": state,
        "holiday": holiday,
        "symbols": symbols,
        "buckets": config.THESIS_BUCKETS,
    }

    # 2. Quotes
    log.info("Fetching quotes...")
    quotes_list, ts_str = fetch_quotes(symbols)
    meta["quotes_timestamp"] = ts_str

    # Also fetch names from config
    try:
        from data import get_all_names
        meta["names"] = get_all_names()
    except Exception:
        meta["names"] = {}

    write_json(DATA_DIR / "meta.json", meta)
    write_json(DATA_DIR / "quotes.json", quotes_list)

    # 3. Technicals (parallel, heavy)
    log.info("Fetching technicals...")
    technicals = fetch_technicals_batch(symbols)
    # Convert any non-serializable values
    clean_tech = {}
    for sym, td in technicals.items():
        clean = {}
        for k, v in td.items():
            if isinstance(v, float) and (v != v):  # NaN check
                clean[k] = None
            elif isinstance(v, list):
                clean[k] = v
            elif isinstance(v, (int, float, str, bool, type(None))):
                clean[k] = v
            else:
                clean[k] = str(v)
        clean_tech[sym] = clean
    write_json(DATA_DIR / "technicals.json", clean_tech)

    # 4. Market overview
    log.info("Fetching market overview...")
    market = fetch_market_overview()
    write_json(DATA_DIR / "market.json", market)

    # 5. Sectors
    log.info("Fetching sectors...")
    sectors = fetch_sector_performance()
    write_json(DATA_DIR / "sectors.json", sectors)

    # 6. Earnings
    log.info("Fetching earnings...")
    earnings = fetch_earnings(symbols)
    write_json(DATA_DIR / "earnings.json", earnings)

    # 7. Commodities
    log.info("Fetching commodities...")
    commodities = fetch_commodities()
    write_json(DATA_DIR / "commodities.json", commodities)

    # 8. Economic calendar
    log.info("Fetching economic calendar...")
    econ = get_upcoming(12)
    write_json(DATA_DIR / "econ.json", econ)

    # 9. Sparklines (1mo daily closing prices)
    log.info("Fetching sparklines...")
    sparklines = fetch_chart_data_batch(symbols, period="1mo", interval="1d")
    write_json(DATA_DIR / "sparklines.json", sparklines)

    # 10. News
    log.info("Fetching news...")
    news = fetch_news_batch(symbols, count=5)
    write_json(DATA_DIR / "news.json", news)

    # 11. OHLCV charts (per-symbol, 6 timeframes)
    log.info("Fetching OHLCV charts...")
    def _fetch_chart(sym: str) -> tuple[str, dict]:
        chart_data = {}
        for label, period, interval in TIMEFRAMES:
            chart_data[label] = fetch_ohlcv(sym, period, interval)
        return sym, chart_data

    with ThreadPoolExecutor(max_workers=4) as pool:
        for sym, chart_data in pool.map(_fetch_chart, symbols):
            write_json(CHARTS_DIR / f"{sym}.json", chart_data)

    elapsed = time.time() - t0
    log.info("Done in %.1fs — %d symbols, %d data files", elapsed, len(symbols), 11 + len(symbols))


if __name__ == "__main__":
    main()
