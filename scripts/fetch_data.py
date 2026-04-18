"""Self-contained market data fetcher for ticker-tape-web.

No dependency on the ticker-tape TUI repo. Uses yfinance + pandas + numpy directly.
Outputs JSON files to public/data/ for the static web dashboard.
"""

import json
import logging
import os
import time as _time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import yfinance as yf

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

ET = ZoneInfo("America/New_York")
RS_BENCHMARK = "QQQ"

# ── Symbols from env ────────────────────────────────────────
_sym_raw = os.environ.get("WATCHLIST_SYMBOLS", "").strip()
SYMBOLS: list[str] = json.loads(_sym_raw) if _sym_raw else ["AAPL", "MSFT", "GOOG", "AMZN", "NVDA"]
_buck_raw = os.environ.get("THESIS_BUCKETS", "").strip()
BUCKETS: dict[str, list[str]] = json.loads(_buck_raw) if _buck_raw else {}
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "data")

# ── Sector ETFs ─────────────────────────────────────────────
SECTOR_ETFS = {
    "XLK": "Technology", "SMH": "Semiconductors", "XLF": "Financials",
    "XLE": "Energy", "XLV": "Healthcare", "XLI": "Industrials",
    "XLY": "Cons. Disc.", "XLP": "Cons. Staples", "XLU": "Utilities",
    "XLRE": "Real Estate", "XLB": "Materials", "XLC": "Comm. Svcs",
}

# ── Market overview groups ──────────────────────────────────
MARKET_GROUPS = {
    "US Equity": {
        "^GSPC": "S&P 500", "^IXIC": "Nasdaq Comp", "^DJI": "Dow Jones",
        "^RUT": "Russell 2000", "^NDX": "Nasdaq 100", "^SOX": "Semis (SOX)",
    },
    "US Futures": {
        "ES=F": "S&P 500 Fut", "NQ=F": "Nasdaq Fut",
        "YM=F": "Dow Fut", "RTY=F": "Russell Fut",
    },
    "Europe": {
        "^FTSE": "FTSE 100", "^GDAXI": "DAX",
        "^FCHI": "CAC 40", "^STOXX50E": "Euro Stoxx 50",
    },
    "Asia-Pacific": {
        "^N225": "Nikkei 225", "^HSI": "Hang Seng",
        "000001.SS": "Shanghai Comp", "^KS11": "KOSPI", "^AXJO": "ASX 200",
    },
    "Americas": {
        "^GSPTSE": "TSX Comp", "^BVSP": "Bovespa", "^MXX": "Mexico IPC",
    },
    "Rates & Vol": {
        "^VIX": "VIX", "^TNX": "10Y Yield",
        "^FVX": "5Y Yield", "^TYX": "30Y Yield",
    },
    "FX": {
        "DX-Y.NYB": "DXY", "EURUSD=X": "EUR/USD", "GBPUSD=X": "GBP/USD",
        "USDJPY=X": "USD/JPY", "USDCNH=X": "USD/CNH", "USDCAD=X": "USD/CAD",
    },
    "Key Commodities": {
        "GC=F": "Gold", "CL=F": "WTI Crude", "NG=F": "Nat Gas", "HG=F": "Copper",
    },
    "Crypto": {
        "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum",
    },
}

# ── Commodity groups ────────────────────────────────────────
COMMODITY_GROUPS = {
    "Energy": [
        ("CL=F", "WTI Crude Oil", "$/bbl"), ("BZ=F", "Brent Crude", "$/bbl"),
        ("NG=F", "Natural Gas", "$/MMBtu"), ("HO=F", "Heating Oil", "$/gal"),
        ("RB=F", "RBOB Gasoline", "$/gal"),
    ],
    "Metals": [
        ("GC=F", "Gold", "$/oz"), ("SI=F", "Silver", "$/oz"),
        ("HG=F", "Copper", "$/lb"), ("PL=F", "Platinum", "$/oz"),
        ("PA=F", "Palladium", "$/oz"),
    ],
    "Grains": [
        ("ZW=F", "Wheat", "¢/bu"), ("ZC=F", "Corn", "¢/bu"),
        ("ZS=F", "Soybeans", "¢/bu"),
    ],
    "Softs": [
        ("CC=F", "Cocoa", "$/ton"), ("KC=F", "Coffee", "¢/lb"),
        ("CT=F", "Cotton", "¢/lb"), ("SB=F", "Sugar #11", "¢/lb"),
    ],
    "Livestock": [
        ("LE=F", "Live Cattle", "¢/lb"), ("GF=F", "Feeder Cattle", "¢/lb"),
        ("HE=F", "Lean Hogs", "¢/lb"),
    ],
    "Crypto": [
        ("BTC-USD", "Bitcoin", "USD"), ("ETH-USD", "Ethereum", "USD"),
    ],
}

# ── 2026 economic calendar ──────────────────────────────────
ECON_EVENTS = [
    {"date": "2026-01-28", "type": "FOMC", "key": "econ.fomc"},
    {"date": "2026-03-18", "type": "FOMC", "key": "econ.fomc"},
    {"date": "2026-05-06", "type": "FOMC", "key": "econ.fomc"},
    {"date": "2026-06-17", "type": "FOMC", "key": "econ.fomc"},
    {"date": "2026-07-29", "type": "FOMC", "key": "econ.fomc"},
    {"date": "2026-09-16", "type": "FOMC", "key": "econ.fomc"},
    {"date": "2026-11-04", "type": "FOMC", "key": "econ.fomc"},
    {"date": "2026-12-16", "type": "FOMC", "key": "econ.fomc"},
    {"date": "2026-01-14", "type": "CPI", "key": "econ.cpi"},
    {"date": "2026-02-11", "type": "CPI", "key": "econ.cpi"},
    {"date": "2026-03-11", "type": "CPI", "key": "econ.cpi"},
    {"date": "2026-04-14", "type": "CPI", "key": "econ.cpi"},
    {"date": "2026-05-12", "type": "CPI", "key": "econ.cpi"},
    {"date": "2026-06-10", "type": "CPI", "key": "econ.cpi"},
    {"date": "2026-07-14", "type": "CPI", "key": "econ.cpi"},
    {"date": "2026-08-12", "type": "CPI", "key": "econ.cpi"},
    {"date": "2026-09-11", "type": "CPI", "key": "econ.cpi"},
    {"date": "2026-10-13", "type": "CPI", "key": "econ.cpi"},
    {"date": "2026-11-12", "type": "CPI", "key": "econ.cpi"},
    {"date": "2026-12-10", "type": "CPI", "key": "econ.cpi"},
    {"date": "2026-01-09", "type": "NFP", "key": "econ.nfp"},
    {"date": "2026-02-06", "type": "NFP", "key": "econ.nfp"},
    {"date": "2026-03-06", "type": "NFP", "key": "econ.nfp"},
    {"date": "2026-04-03", "type": "NFP", "key": "econ.nfp"},
    {"date": "2026-05-08", "type": "NFP", "key": "econ.nfp"},
    {"date": "2026-06-05", "type": "NFP", "key": "econ.nfp"},
    {"date": "2026-07-02", "type": "NFP", "key": "econ.nfp"},
    {"date": "2026-08-07", "type": "NFP", "key": "econ.nfp"},
    {"date": "2026-09-04", "type": "NFP", "key": "econ.nfp"},
    {"date": "2026-10-02", "type": "NFP", "key": "econ.nfp"},
    {"date": "2026-11-06", "type": "NFP", "key": "econ.nfp"},
    {"date": "2026-12-04", "type": "NFP", "key": "econ.nfp"},
    {"date": "2026-01-29", "type": "GDP", "key": "econ.gdp"},
    {"date": "2026-04-29", "type": "GDP", "key": "econ.gdp"},
    {"date": "2026-07-30", "type": "GDP", "key": "econ.gdp"},
    {"date": "2026-10-29", "type": "GDP", "key": "econ.gdp"},
    {"date": "2026-01-30", "type": "PCE", "key": "econ.pce"},
    {"date": "2026-02-27", "type": "PCE", "key": "econ.pce"},
    {"date": "2026-03-27", "type": "PCE", "key": "econ.pce"},
    {"date": "2026-04-30", "type": "PCE", "key": "econ.pce"},
    {"date": "2026-05-29", "type": "PCE", "key": "econ.pce"},
    {"date": "2026-06-26", "type": "PCE", "key": "econ.pce"},
    {"date": "2026-07-31", "type": "PCE", "key": "econ.pce"},
    {"date": "2026-08-28", "type": "PCE", "key": "econ.pce"},
    {"date": "2026-09-25", "type": "PCE", "key": "econ.pce"},
    {"date": "2026-10-30", "type": "PCE", "key": "econ.pce"},
    {"date": "2026-11-25", "type": "PCE", "key": "econ.pce"},
    {"date": "2026-12-23", "type": "PCE", "key": "econ.pce"},
]


# ── Helpers ─────────────────────────────────────────────────

def _nyse_holidays(year: int) -> dict[date, str]:
    """Compute NYSE market holidays for a given year."""
    from calendar import MONDAY, SATURDAY, SUNDAY

    def _nth_weekday(y: int, month: int, n: int, dow: int) -> date:
        d = date(y, month, 1)
        count = 0
        while True:
            if d.weekday() == dow:
                count += 1
                if count == n:
                    return d
            d += timedelta(days=1)

    def _observed(d: date) -> date:
        if d.weekday() == SATURDAY:
            return d - timedelta(days=1)
        if d.weekday() == SUNDAY:
            return d + timedelta(days=1)
        return d

    def _easter(y: int) -> date:
        a = y % 19
        b, c = divmod(y, 100)
        d, e = divmod(b, 4)
        f = (b + 8) // 25
        g = (b - f + 1) // 3
        h = (19 * a + b - d - g + 15) % 30
        i, k = divmod(c, 4)
        el = (32 + 2 * e + 2 * i - h - k) % 7
        m = (a + 11 * h + 22 * el) // 451
        month = (h + el - 7 * m + 114) // 31
        day = ((h + el - 7 * m + 114) % 31) + 1
        return date(y, month, day)

    def _last_weekday(y: int, month: int, dow: int) -> date:
        d = date(y, month, 28)
        while d.month == month:
            d += timedelta(days=1)
        d -= timedelta(days=1)
        while d.weekday() != dow:
            d -= timedelta(days=1)
        return d

    holidays = {}
    holidays[_observed(date(year, 1, 1))] = "New Year's"
    holidays[_observed(date(year, 6, 19))] = "Juneteenth"
    holidays[_observed(date(year, 7, 4))] = "Independence Day"
    holidays[_observed(date(year, 12, 25))] = "Christmas"
    holidays[_nth_weekday(year, 1, 3, MONDAY)] = "MLK Day"
    holidays[_nth_weekday(year, 2, 3, MONDAY)] = "Presidents' Day"
    holidays[_last_weekday(year, 5, MONDAY)] = "Memorial Day"
    holidays[_nth_weekday(year, 9, 1, MONDAY)] = "Labor Day"
    holidays[_nth_weekday(year, 11, 4, 3)] = "Thanksgiving"
    holidays[_easter(year) - timedelta(days=2)] = "Good Friday"
    return holidays


def market_holiday() -> str | None:
    today = datetime.now(ET).date()
    return _nyse_holidays(today.year).get(today)


def market_state() -> str:
    now = datetime.now(ET)
    if now.weekday() >= 5:
        return "closed"
    if now.date() in _nyse_holidays(now.year):
        return "closed"
    t = now.time()
    if t < time(4, 0):
        return "closed"
    if t < time(9, 30):
        return "pre"
    if t < time(16, 0):
        return "open"
    if t < time(20, 0):
        return "post"
    return "closed"


def _write(filename: str, data) -> None:
    """Write JSON to DATA_DIR."""
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w") as f:
        json.dump(data, f, separators=(",", ":"), default=str)
    log.info("Wrote %s", path)


def _safe_float(val) -> float | None:
    """Convert numpy/pandas types to Python float, None on failure."""
    if val is None:
        return None
    try:
        v = float(val)
        if np.isnan(v) or np.isinf(v):
            return None
        return v
    except (TypeError, ValueError):
        return None


def bulk_prices(symbols: list[str]) -> dict[str, tuple[float, float]]:
    """Fetch (price, prev_close) for multiple symbols via yf.download()."""
    if not symbols:
        return {}
    result = {}
    try:
        df = yf.download(" ".join(symbols), period="2d", progress=False)
        if df is None or df.empty:
            return result
        multi = isinstance(df.columns, pd.MultiIndex)
        for sym in symbols:
            try:
                close = df[("Close", sym)] if multi else df["Close"]
                vals = close.dropna()
                if len(vals) >= 2:
                    result[sym] = (float(vals.iloc[-1]), float(vals.iloc[-2]))
                elif len(vals) == 1:
                    result[sym] = (float(vals.iloc[0]), float(vals.iloc[0]))
            except (KeyError, IndexError):
                pass
    except Exception as e:
        log.warning("bulk_prices failed: %s", e)
    return result


# ── Data fetchers ───────────────────────────────────────────

def fetch_quotes(symbols: list[str]) -> tuple[list[dict], str]:
    """Fetch quotes with extended hours data."""
    quotes = []
    state = market_state()
    bp = bulk_prices(symbols)

    # Fetch .info for ext hours + names + missing symbols
    need_ext = state in ("pre", "post", "closed")
    syms_to_info = symbols if need_ext else [s for s in symbols if s not in bp]
    info_data: dict[str, dict] = {}

    if syms_to_info:
        def _get_info(sym: str) -> tuple[str, dict]:
            try:
                _time.sleep(0.1)
                return sym, yf.Ticker(sym).info
            except Exception:
                return sym, {}

        with ThreadPoolExecutor(max_workers=6) as pool:
            for sym, info in pool.map(_get_info, syms_to_info):
                if info:
                    info_data[sym] = info

    names = {}
    for sym in symbols:
        pm = bp.get(sym)
        info = info_data.get(sym, {})

        if pm:
            price, prev = pm
        elif info.get("regularMarketPrice"):
            price = info["regularMarketPrice"]
            prev = info.get("regularMarketPreviousClose", price) or price
        else:
            price, prev = 0.0, 0.0

        change = price - prev if prev else 0
        pct = (change / prev) * 100 if prev else 0
        q = {"symbol": sym, "price": price, "change": change, "pct": pct}

        # Extended hours
        pre_price = info.get("preMarketPrice")
        post_price = info.get("postMarketPrice")
        if state == "pre" and pre_price and price:
            q["ext_price"] = pre_price
            q["ext_change"] = pre_price - price
            q["ext_pct"] = (q["ext_change"] / price) * 100
            q["ext_label"] = "PRE"
        elif state in ("post", "closed") and post_price and price:
            q["ext_price"] = post_price
            q["ext_change"] = post_price - price
            q["ext_pct"] = (q["ext_change"] / price) * 100
            q["ext_label"] = "AH"

        short_name = info.get("shortName")
        if short_name:
            names[sym] = short_name

        quotes.append(q)

    state_labels = {"pre": "Pre-Market", "open": "Market Open", "post": "After Hours", "closed": "Closed"}
    now = datetime.now(ET)
    timestamp = f"{now.strftime('%H:%M ET')} | {state_labels[state]}"
    return quotes, timestamp, names


def fetch_technicals(symbol: str, bench_hist=None) -> dict | None:
    """Calculate technical indicators from 1y daily history."""
    try:
        _time.sleep(0.1)
        t = yf.Ticker(symbol)
        hist = t.history(period="1y", interval="1d", timeout=10)
        if hist.empty or len(hist) < 20:
            return None

        close = hist["Close"]
        volume = hist["Volume"]
        current = float(close.iloc[-1])

        sma_20 = _safe_float(close.rolling(20).mean().iloc[-1]) if len(close) >= 20 else None
        sma_50 = _safe_float(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else None
        sma_200 = _safe_float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else None

        # RSI 14 — Wilder's smoothing
        delta = close.diff()
        gain = delta.where(delta > 0, 0).ewm(alpha=1/14, adjust=False).mean()
        loss = (-delta.where(delta < 0, 0)).ewm(alpha=1/14, adjust=False).mean()
        rs = gain / loss
        rsi = _safe_float((100 - (100 / (1 + rs))).iloc[-1]) if len(close) >= 15 else None

        # Volume
        avg_vol_20 = _safe_float(volume.rolling(20).mean().iloc[-1]) if len(volume) >= 20 else None
        current_vol = str(int(volume.iloc[-1])) if len(volume) > 0 else "0"
        vol_ratio = float(volume.iloc[-1]) / avg_vol_20 if avg_vol_20 and avg_vol_20 > 0 else None

        # 52w range
        high_52w = _safe_float(close.max())
        low_52w = _safe_float(close.min())
        off_high = ((current - high_52w) / high_52w) * 100 if high_52w else None
        off_low = ((current - low_52w) / low_52w) * 100 if low_52w else None

        # MACD (12, 26, 9)
        macd = macd_sig = macd_histogram = macd_crossover = None
        if len(close) >= 26:
            ema_12 = close.ewm(span=12, adjust=False).mean()
            ema_26 = close.ewm(span=26, adjust=False).mean()
            macd_line = ema_12 - ema_26
            macd = _safe_float(macd_line.iloc[-1])
            if len(close) >= 35:
                signal_line = macd_line.ewm(span=9, adjust=False).mean()
                macd_sig = _safe_float(signal_line.iloc[-1])
                hist_line = macd_line - signal_line
                macd_histogram = _safe_float(hist_line.iloc[-1])
                if len(hist_line) >= 2:
                    prev_h, curr_h = float(hist_line.iloc[-2]), float(hist_line.iloc[-1])
                    if prev_h < 0 and curr_h >= 0:
                        macd_crossover = "bullish"
                    elif prev_h > 0 and curr_h <= 0:
                        macd_crossover = "bearish"

        # Bollinger Bands (20, 2)
        bb_upper = bb_lower = bb_width = bb_pct_b = None
        if len(close) >= 20:
            bb_sma = close.rolling(20).mean()
            bb_std = close.rolling(20).std()
            bb_upper = _safe_float((bb_sma + 2 * bb_std).iloc[-1])
            bb_lower = _safe_float((bb_sma - 2 * bb_std).iloc[-1])
            mid = _safe_float(bb_sma.iloc[-1])
            if mid and mid > 0:
                bb_width = ((bb_upper - bb_lower) / mid) * 100
            spread = bb_upper - bb_lower if bb_upper and bb_lower else 0
            if spread > 0:
                bb_pct_b = (current - bb_lower) / spread

        # ATR (14) — Wilder's smoothing
        atr = atr_pct = None
        high_col = hist["High"]
        low_col = hist["Low"]
        prev_close = close.shift(1)
        tr = pd.concat([
            high_col - low_col,
            (high_col - prev_close).abs(),
            (low_col - prev_close).abs(),
        ], axis=1).max(axis=1)
        if len(tr) >= 15:
            atr = _safe_float(tr.ewm(alpha=1/14, adjust=False).mean().iloc[-1])
            if atr and current > 0:
                atr_pct = (atr / current) * 100

        # Relative strength vs QQQ (20d)
        rs_vs_bench = None
        try:
            if len(close) >= 20 and bench_hist is not None and len(bench_hist) >= 20:
                stock_ret = (current / float(close.iloc[-20]) - 1) * 100
                bench_ret = (float(bench_hist["Close"].iloc[-1]) / float(bench_hist["Close"].iloc[-20]) - 1) * 100
                rs_vs_bench = stock_ret - bench_ret
        except Exception:
            pass

        # Trend signals
        trend_signals = []
        if sma_50 and sma_200:
            trend_signals.append("Golden Cross" if sma_50 > sma_200 else "Death Cross")
        if sma_20:
            trend_signals.append("Above 20d" if current > sma_20 else "Below 20d")
        if sma_50:
            trend_signals.append("Above 50d" if current > sma_50 else "Below 50d")

        return {
            "current": current, "sma_20": sma_20, "sma_50": sma_50, "sma_200": sma_200,
            "rsi": rsi, "avg_vol_20": avg_vol_20, "current_vol": current_vol, "vol_ratio": vol_ratio,
            "high_52w": high_52w, "low_52w": low_52w, "off_high": off_high, "off_low": off_low,
            "trend_signals": trend_signals,
            "macd": macd, "macd_signal": macd_sig, "macd_histogram": macd_histogram,
            "macd_crossover": macd_crossover,
            "bb_upper": bb_upper, "bb_lower": bb_lower, "bb_width": bb_width, "bb_pct_b": bb_pct_b,
            "atr": atr, "atr_pct": atr_pct, "rs_vs_bench": rs_vs_bench,
        }
    except Exception as e:
        log.warning("technicals failed for %s: %s", symbol, e)
        return None


def fetch_technicals_batch(symbols: list[str]) -> dict[str, dict]:
    """Fetch technicals for all symbols in parallel, sharing benchmark history."""
    # Pre-fetch benchmark once
    bench_hist = None
    try:
        bench_hist = yf.Ticker(RS_BENCHMARK).history(period="1mo", interval="1d")
    except Exception:
        pass

    results = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(fetch_technicals, sym, bench_hist): sym for sym in symbols}
        for fut in as_completed(futs, timeout=30):
            sym = futs[fut]
            try:
                ta = fut.result(timeout=1)
                if ta:
                    results[sym] = ta
            except Exception:
                log.warning("technicals timeout for %s", sym)
    return results


def fetch_market_overview() -> dict[str, list[dict]]:
    """Fetch macro market indicators grouped by category."""
    all_syms = [sym for symbols in MARKET_GROUPS.values() for sym in symbols]
    futures_syms = [s for s in all_syms if s.endswith("=F")]
    other_syms = [s for s in all_syms if not s.endswith("=F")]

    bp = bulk_prices(other_syms) if other_syms else {}

    # Parallel fast_info for futures (bulk is unreliable for these)
    def _fetch_future(sym: str) -> tuple[str, tuple[float, float] | None]:
        try:
            _time.sleep(0.1)
            fi = yf.Ticker(sym).fast_info
            if fi.last_price and fi.previous_close:
                return sym, (float(fi.last_price), float(fi.previous_close))
        except Exception:
            pass
        return sym, None

    if futures_syms:
        with ThreadPoolExecutor(max_workers=6) as pool:
            for sym, result in pool.map(_fetch_future, futures_syms):
                if result:
                    bp[sym] = result

    # Fill gaps
    for sym in all_syms:
        if sym not in bp:
            try:
                fi = yf.Ticker(sym).fast_info
                if fi.last_price and fi.previous_close:
                    bp[sym] = (float(fi.last_price), float(fi.previous_close))
            except Exception:
                pass

    grouped = {}
    for group_name, symbols in MARKET_GROUPS.items():
        items = []
        for sym, name in symbols.items():
            pm = bp.get(sym)
            if pm:
                price, prev = pm
                change = price - prev
                pct = (change / prev) * 100 if prev else 0
                items.append({"symbol": sym, "name": name, "price": price, "change": change, "pct": pct})
            else:
                items.append({"symbol": sym, "name": name, "price": 0.0, "change": 0.0, "pct": 0.0})
        grouped[group_name] = items
    return grouped


def fetch_sectors() -> list[dict]:
    """Fetch sector ETF performance."""
    syms = list(SECTOR_ETFS.keys())
    bp = bulk_prices(syms)
    for sym in syms:
        if sym not in bp:
            try:
                fi = yf.Ticker(sym).fast_info
                if fi.last_price and fi.previous_close:
                    bp[sym] = (fi.last_price, fi.previous_close)
            except Exception:
                pass
    results = []
    for sym, name in SECTOR_ETFS.items():
        pm = bp.get(sym)
        if pm:
            price, prev = pm
            change = price - prev
            pct = (change / prev) * 100 if prev else 0
            results.append({"symbol": sym, "name": name, "price": price, "change": change, "pct": pct})
        else:
            results.append({"symbol": sym, "name": name, "price": 0.0, "change": 0.0, "pct": 0.0})
    results.sort(key=lambda x: x["pct"], reverse=True)
    return results


def fetch_earnings(symbols: list[str]) -> list[dict]:
    """Fetch next earnings date for each symbol."""
    import io, contextlib
    today = date.today()

    def _to_date(raw) -> date | None:
        if isinstance(raw, datetime):
            return raw.date()
        if isinstance(raw, date):
            return raw
        if hasattr(raw, "to_pydatetime"):
            return raw.to_pydatetime().date()
        if hasattr(raw, "date"):
            return raw.date()
        return None

    def _fetch_one(sym: str) -> dict:
        try:
            _time.sleep(0.1)
            with contextlib.redirect_stderr(io.StringIO()):
                cal = yf.Ticker(sym).calendar
            dates = []
            if isinstance(cal, dict):
                dates = cal.get("Earnings Date", [])
            elif hasattr(cal, "loc"):
                try:
                    dates = list(cal.loc["Earnings Date"])
                except (KeyError, TypeError):
                    pass
            if dates:
                d = _to_date(dates[0])
                if d:
                    eps_est = None
                    if isinstance(cal, dict):
                        est = cal.get("EPS Estimate")
                        if est is not None:
                            try:
                                eps_est = float(est)
                            except (TypeError, ValueError):
                                pass
                    return {"symbol": sym, "date": str(d), "days_until": (d - today).days, "eps_est": eps_est}
        except Exception:
            pass
        return {"symbol": sym, "date": "N/A", "days_until": None, "eps_est": None}

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(_fetch_one, symbols))
    return results


def fetch_commodities() -> dict[str, list[dict]]:
    """Fetch commodity futures prices."""
    all_items = [(sym, name, unit) for items in COMMODITY_GROUPS.values() for sym, name, unit in items]

    def _fetch_one(item: tuple[str, str, str]) -> dict:
        sym, name, unit = item
        try:
            _time.sleep(0.1)
            fi = yf.Ticker(sym).fast_info
            price = fi.last_price
            prev = fi.previous_close
            if price and prev and prev > 0:
                change = price - prev
                pct = (change / prev) * 100
                return {"symbol": sym, "name": name, "unit": unit, "price": price, "change": change, "pct": pct}
        except Exception:
            pass
        return {"symbol": sym, "name": name, "unit": unit, "price": 0.0, "change": 0.0, "pct": 0.0}

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(_fetch_one, all_items))

    idx = 0
    grouped = {}
    for group_name, items in COMMODITY_GROUPS.items():
        grouped[group_name] = results[idx:idx + len(items)]
        idx += len(items)
    return grouped


def fetch_econ() -> list[dict]:
    """Return next 12 upcoming economic events with days_until."""
    today = date.today()
    upcoming = []
    for ev in ECON_EVENTS:
        d = date.fromisoformat(ev["date"])
        days = (d - today).days
        if days >= 0:
            upcoming.append({**ev, "days_until": days, "date_obj": str(d)})
    upcoming.sort(key=lambda e: e["days_until"])
    return upcoming[:12]


def fetch_sparklines(symbols: list[str]) -> dict[str, list[float]]:
    """Fetch 1 month of daily closes for sparkline charts."""
    result = {}
    try:
        df = yf.download(" ".join(symbols), period="1mo", interval="1d", progress=False)
        if df is None or df.empty:
            return result
        multi = isinstance(df.columns, pd.MultiIndex)
        for sym in symbols:
            try:
                close = df[("Close", sym)] if multi else df["Close"]
                vals = close.dropna().tolist()
                if vals:
                    result[sym] = [float(v) for v in vals]
            except (KeyError, IndexError):
                pass
    except Exception as e:
        log.warning("sparklines failed: %s", e)
    return result


def fetch_news(symbols: list[str]) -> dict[str, list[dict]]:
    """Fetch news headlines for each symbol."""
    result = {}

    def _fetch_one(sym: str) -> tuple[str, list[dict]]:
        try:
            _time.sleep(0.1)
            t = yf.Ticker(sym)
            raw = t.news or []
            items = []
            for item in raw[:5]:
                content = item.get("content", item)
                title = content.get("title", "")

                publisher = ""
                provider = content.get("provider")
                if isinstance(provider, dict):
                    publisher = provider.get("displayName", "")
                else:
                    publisher = content.get("publisher", "")

                link = ""
                canonical = content.get("canonicalUrl")
                if isinstance(canonical, dict):
                    link = canonical.get("url", "")
                else:
                    link = content.get("link", "")

                age_str = ""
                dt = None
                pub_date = content.get("pubDate")
                pub_time = content.get("providerPublishTime")
                if pub_date and isinstance(pub_date, str):
                    try:
                        dt = datetime.fromisoformat(pub_date.replace("Z", "+00:00"))
                    except ValueError:
                        pass
                elif pub_time:
                    dt = datetime.fromtimestamp(pub_time, tz=timezone.utc)

                if dt:
                    age = datetime.now(timezone.utc) - dt
                    if age.days > 0:
                        age_str = f"{age.days}d ago"
                    elif age.seconds >= 3600:
                        age_str = f"{age.seconds // 3600}h ago"
                    else:
                        age_str = f"{age.seconds // 60}m ago"

                items.append({
                    "title": title,
                    "publisher": publisher,
                    "link": link,
                    "age": age_str,
                    "timestamp": str(dt) if dt else None,
                })
            return sym, items
        except Exception:
            return sym, []

    with ThreadPoolExecutor(max_workers=4) as pool:
        for sym, items in pool.map(_fetch_one, symbols):
            result[sym] = items
    return result


# Impact data ages slowly (new row only after earnings). Skip per-symbol refresh
# unless the JSON is older than this threshold.
IMPACT_TTL_SECONDS = 6 * 60 * 60


def _impact_is_fresh(symbol: str) -> bool:
    path = os.path.join(DATA_DIR, "impact", f"{symbol}.json")
    if not os.path.exists(path):
        return False
    age = _time.time() - os.path.getmtime(path)
    return age < IMPACT_TTL_SECONDS


def _price_move_pct(hist, earn_date) -> float | None:
    """Close on/before earn_date vs next bar close, as percent."""
    if hist is None or len(hist) < 2:
        return None
    dates_list = [d.date() if hasattr(d, "date") else d for d in hist.index]
    before_idx = None
    after_idx = None
    for i, d in enumerate(dates_list):
        if d <= earn_date:
            before_idx = i
        elif before_idx is not None and after_idx is None:
            after_idx = i
            break
    if before_idx is None or after_idx is None:
        return None
    close_before = hist["Close"].iloc[before_idx]
    close_after = hist["Close"].iloc[after_idx]
    if close_before == 0:
        return None
    return ((close_after - close_before) / close_before) * 100


def _price_move_n_day(hist, earn_date, days: int) -> float | None:
    """Close on/before earn_date vs close ~days bars later."""
    if hist is None or len(hist) < 2:
        return None
    dates_list = [d.date() if hasattr(d, "date") else d for d in hist.index]
    before_idx = None
    for i, d in enumerate(dates_list):
        if d <= earn_date:
            before_idx = i
        else:
            break
    if before_idx is None:
        return None
    target_idx = min(before_idx + days, len(hist) - 1)
    if target_idx == before_idx:
        return None
    close_before = hist["Close"].iloc[before_idx]
    close_after = hist["Close"].iloc[target_idx]
    if close_before == 0:
        return None
    return ((close_after - close_before) / close_before) * 100


def fetch_impact(symbol: str, limit: int = 12) -> dict | None:
    """Earnings-move history for one symbol: past EPS surprises + 1d/5d price moves.

    Ported from ticker-tape/data.py:1101. Writes peers reaction from BUCKETS.
    """
    try:
        t = yf.Ticker(symbol)
        df = t.get_earnings_dates(limit=20)
        if df is None or df.empty:
            return None

        # One history pull covers every earnings date in the window.
        try:
            full_hist = t.history(period="5y", interval="1d")
        except Exception:
            full_hist = None

        # Peer set from BUCKETS
        sym_upper = symbol.upper()
        peer_syms: list[str] = []
        for bucket in BUCKETS.values():
            if sym_upper in bucket:
                peer_syms = [s for s in bucket if s != sym_upper]
                break
        peer_hists: dict[str, "pd.DataFrame"] = {}
        for peer in peer_syms[:6]:  # cap peer chain length
            try:
                peer_hists[peer] = yf.Ticker(peer).history(period="5y", interval="1d")
            except Exception:
                peer_hists[peer] = None  # type: ignore[assignment]

        today = date.today()
        events: list[dict] = []
        for idx, row in df.iterrows():
            dt = idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else idx
            earn_date = dt.date() if hasattr(dt, "date") else dt
            if earn_date >= today:
                continue
            reported = row.get("Reported EPS")
            if reported is None or (isinstance(reported, float) and np.isnan(reported)):
                continue

            eps_est = row.get("EPS Estimate")
            surprise = row.get("Surprise(%)")

            move_1d = _price_move_pct(full_hist, earn_date)
            move_5d = _price_move_n_day(full_hist, earn_date, 5)

            peers = []
            for peer, ph in peer_hists.items():
                pm = _price_move_pct(ph, earn_date)
                if pm is not None:
                    peers.append({"sym": peer, "move": round(pm, 3)})

            events.append({
                "date": str(earn_date),
                "eps_est": _safe_float(eps_est),
                "eps_actual": _safe_float(reported),
                "surprise_pct": _safe_float(surprise),
                "move_1d": round(move_1d, 3) if move_1d is not None else None,
                "move_5d": round(move_5d, 3) if move_5d is not None else None,
                "peers": peers,
            })

            if len(events) >= limit:
                break

        if not events:
            return None

        # Summary (most recent first in events, streak counted from top)
        beat_streak = 0
        for ev in events:
            if ev.get("surprise_pct") is not None and ev["surprise_pct"] > 0:
                beat_streak += 1
            else:
                break
        surprises = [ev["surprise_pct"] for ev in events if ev.get("surprise_pct") is not None]
        moves = [ev["move_1d"] for ev in events if ev.get("move_1d") is not None]
        total = len(surprises)
        beats = sum(1 for s in surprises if s > 0)

        return {
            "symbol": sym_upper,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "events": events,
            "summary": {
                "beat_streak": beat_streak,
                "beat_rate": round(beats / total, 3) if total else None,
                "beats": beats,
                "total": total,
                "avg_surprise": round(sum(surprises) / len(surprises), 3) if surprises else None,
                "avg_abs_move": round(sum(abs(m) for m in moves) / len(moves), 3) if moves else None,
                "avg_move": round(sum(moves) / len(moves), 3) if moves else None,
            },
        }
    except Exception as e:
        log.warning("fetch_impact failed for %s: %s", symbol, e)
        return None


def fetch_impact_batch(symbols: list[str]) -> dict[str, dict]:
    """Fetch impact for any symbol whose cached JSON is older than the TTL."""
    os.makedirs(os.path.join(DATA_DIR, "impact"), exist_ok=True)
    stale = [s for s in symbols if not _impact_is_fresh(s)]
    if not stale:
        log.info("Impact cache fresh for all %d symbols — skipping", len(symbols))
        return {}
    log.info("Refreshing impact for %d stale symbols: %s", len(stale), stale)
    results: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(fetch_impact, s): s for s in stale}
        for fut in as_completed(futures):
            sym = futures[fut]
            try:
                data = fut.result()
                if data:
                    results[sym] = data
            except Exception as e:
                log.warning("fetch_impact future failed for %s: %s", sym, e)
    return results


def fetch_charts(symbols: list[str]) -> dict[str, dict]:
    """Fetch OHLCV chart data for 6 timeframes per symbol."""
    timeframes = [
        ("1d", "5m"), ("5d", "15m"), ("1mo", "1d"),
        ("3mo", "1d"), ("1y", "1d"), ("5y", "1wk"),
    ]

    def _fetch_one(sym: str) -> tuple[str, dict]:
        chart_data = {}
        for period, interval in timeframes:
            try:
                _time.sleep(0.1)
                hist = yf.Ticker(sym).history(period=period, interval=interval, timeout=10)
                if hist.empty:
                    chart_data[period] = []
                    continue
                bars = []
                for ts, row in hist.iterrows():
                    bars.append({
                        "time": int(ts.timestamp()),
                        "open": round(float(row["Open"]), 2),
                        "high": round(float(row["High"]), 2),
                        "low": round(float(row["Low"]), 2),
                        "close": round(float(row["Close"]), 2),
                        "volume": int(row["Volume"]),
                    })
                chart_data[period] = bars
            except Exception:
                chart_data[period] = []
        return sym, chart_data

    results = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for sym, data in pool.map(_fetch_one, symbols):
            results[sym] = data
    return results


# ── Main ────────────────────────────────────────────────────

def main() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, "charts"), exist_ok=True)
    log.info("Fetching data for %d symbols: %s", len(SYMBOLS), SYMBOLS)

    # Quotes + names
    log.info("Fetching quotes...")
    quotes, quotes_ts, names = fetch_quotes(SYMBOLS)
    _write("quotes.json", quotes)

    # Meta
    state = market_state()
    holiday = market_holiday()
    meta = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "market_state": state,
        "holiday": holiday,
        "symbols": SYMBOLS,
        "buckets": BUCKETS,
        "quotes_timestamp": quotes_ts,
        "names": names,
    }
    _write("meta.json", meta)

    # Technicals
    log.info("Fetching technicals...")
    technicals = fetch_technicals_batch(SYMBOLS)
    _write("technicals.json", technicals)

    # Market overview
    log.info("Fetching market overview...")
    market = fetch_market_overview()
    _write("market.json", market)

    # Sectors
    log.info("Fetching sectors...")
    sectors = fetch_sectors()
    _write("sectors.json", sectors)

    # Earnings
    log.info("Fetching earnings...")
    earnings = fetch_earnings(SYMBOLS)
    _write("earnings.json", earnings)

    # Commodities
    log.info("Fetching commodities...")
    commodities = fetch_commodities()
    _write("commodities.json", commodities)

    # Econ calendar
    log.info("Computing econ calendar...")
    econ = fetch_econ()
    _write("econ.json", econ)

    # Sparklines
    log.info("Fetching sparklines...")
    sparklines = fetch_sparklines(SYMBOLS)
    _write("sparklines.json", sparklines)

    # News
    log.info("Fetching news...")
    news = fetch_news(SYMBOLS)
    _write("news.json", news)

    # Charts
    log.info("Fetching charts...")
    charts = fetch_charts(SYMBOLS)
    for sym, data in charts.items():
        _write(f"charts/{sym}.json", data)

    # Impact (earnings-move history) — 6h TTL skip-if-fresh.
    log.info("Fetching impact (earnings history)...")
    impacts = fetch_impact_batch(SYMBOLS)
    for sym, data in impacts.items():
        _write(f"impact/{sym}.json", data)

    log.info("Done. All data written to %s", DATA_DIR)


if __name__ == "__main__":
    main()
