# ticker-tape-web

Static web dashboard for market data — deployed on GitHub Pages, data refreshed via GitHub Actions every 5 minutes. No backend, no IBKR, no server to maintain.

## Architecture

```
GitHub Actions (cron, every 5 min on weekdays)
  scripts/fetch_data.py       ← yfinance: quotes, indices, sectors, earnings, charts
  scripts/fetch_lookup.py     ← per-symbol fundamentals (runs less frequently)
  ↓ commits data/*.json to main branch
  ↓ triggers GitHub Pages rebuild

GitHub Pages (public, static)
  Serves HTML/CSS/JS + data/*.json
  JS reads /data/*.json (cache-busted with ?t= param)
  AI chat calls Anthropic/Google/OpenAI APIs directly from browser
  API keys stored in localStorage (never committed)
```

## Repo Structure

```
ticker-tape-web/
├── .github/
│   └── workflows/
│       ├── fetch-data.yml      ← cron: every 5 min weekdays, hourly weekends
│       └── deploy.yml          ← deploy to gh-pages on push to main
├── scripts/
│   ├── fetch_data.py           ← bulk quotes, indices, sectors, earnings → data/
│   ├── fetch_lookup.py         ← per-symbol fundamentals → data/lookup/
│   └── requirements.txt        ← yfinance, pandas (no Flask)
├── data/
│   ├── quotes.json             ← watchlist: price, change, volume, ext hours
│   ├── market.json             ← indices + sector ETFs with % change
│   ├── earnings.json           ← upcoming earnings for watched symbols
│   ├── charts/                 ← {SYMBOL}.json — OHLCV arrays by timeframe
│   ├── lookup/                 ← {SYMBOL}.json — fundamentals, technicals
│   └── meta.json               ← fetch timestamp, market state
├── index.html                  ← app shell + router
├── css/
│   └── style.css               ← dark theme, green/red, responsive grid
├── js/
│   ├── app.js                  ← router, data loader, page dispatch
│   ├── pages/
│   │   ├── dashboard.js        ← quotes table, market status
│   │   ├── market.js           ← indices strip + sector heatmap
│   │   ├── charts.js           ← lightweight-charts rendering
│   │   ├── earnings.js         ← earnings calendar
│   │   ├── lookup.js           ← single-stock deep dive
│   │   └── chat.js             ← AI chat panel
│   └── config.js               ← reads localStorage keys, API base config
└── config.example.json         ← default symbols list (generic tickers)
```

## Data Pipeline

**Poll rate:** `*/5 9-21 * * 1-5` (every 5 min, Mon–Fri 9AM–9PM UTC, covers ET market + extended hours). Hourly on weekends for index moves.

**Symbols:** Stored as GitHub Secret `WATCHLIST_SYMBOLS` (JSON array) — never in committed source. Frontend reads symbols from loaded `data/quotes.json` (derived from whatever was fetched). User can add custom symbols via localStorage override.

**Data files committed to main branch.** Git history grows but delta-compression keeps it small for JSON. If it gets large, squash the data commits periodically.

**fetch_data.py responsibilities:**
- Bulk quotes via `yf.download()` with per-symbol `.fast_info` fallback
- Market indices: ES=F, NQ=F, ^VIX, GC=F, CL=F, ^GSPC, ^IXIC, ^HSI, ^DJI
- Sector ETFs: XLK, XLF, XLE, XLV, XLY, XLC, XLI, XLB, XLU, XLRE
- Earnings: per-symbol calendar dict from `.info`
- Chart OHLCV: per-symbol `.history()` for 1D/5D/1M/3M/1Y/5Y
- Writes `data/meta.json` with UTC timestamp and market open/closed state

**fetch_lookup.py:** runs every 30 min (separate workflow). Per-symbol `.info` for fundamentals — slower, heavier.

## Pages

| Route (hash-based) | What it shows |
|--------------------|---------------|
| `#/` | Watchlist quotes table: price, change %, volume, ext hours. Market status badge. Last updated. |
| `#/market` | Index ticker strip + sector ETF heatmap (green/red intensity by % change) |
| `#/charts/SYMBOL` | Candlestick + volume bars. Toggle: 1D / 5D / 1M / 3M / 1Y / 5Y |
| `#/earnings` | Upcoming earnings: symbol, date, days until, EPS estimate |
| `#/lookup/SYMBOL` | Price, valuation (P/E, P/S, EV), margins, financials, technicals (RSI, SMA) |
| `#/chat` | AI chat with market context injected from loaded data |

No server-side routing — hash-based SPA routing, no 404s from GitHub Pages.

## AI Chat

Direct browser API calls. No proxy, no backend.

| Model | Provider | Key location |
|-------|----------|-------------|
| Claude Haiku | Anthropic | localStorage |
| Claude Sonnet | Anthropic | localStorage |
| Gemini Flash | Google | localStorage |
| Gemini Pro | Google | localStorage |
| GPT-4o mini | OpenAI | localStorage |

**First visit:** if no API key found, show key setup modal. Keys stored via `localStorage.setItem('anthropic_key', ...)`. Never committed.

**Context injection:** on every chat message, prepend to system prompt:
- Current quotes snapshot (from loaded `data/quotes.json`)
- Market state (open/closed/pre/post from `data/meta.json`)
- Current page/symbol if on charts or lookup

**Web search:** Tavily API key also in localStorage. If missing, web search is disabled for that session.

**Streaming:** use `fetch()` with `ReadableStream` for all providers. Native browser streaming, no library needed.

**No memory system, no journal** for v1 — chat history is in-page only (sessionStorage).

## Frontend Stack

- Vanilla JS — no framework, no build step, no npm
- Bootstrap 5 via CDN — responsive grid
- `lightweight-charts` via CDN — TradingView open-source charting
- Dark theme: `#0d0d0d` bg, `#00c853` positive, `#ff1744` negative, `#ffab00` warning
- Hash router in `app.js` — listens to `hashchange`, dispatches to page modules
- Data loader: `fetch('/data/quotes.json?t=' + Date.now())` on every page nav

## Config

No `config.json` committed. Symbols are injected at Actions time via GitHub Secret. Frontend reads from data files — it doesn't need to know the symbol list in advance.

`localStorage` keys used:
- `anthropic_key` — Anthropic API key
- `google_key` — Google AI API key
- `openai_key` — OpenAI API key
- `tavily_key` — Tavily search API key

## GitHub Pages Setup

- Source: `gh-pages` branch (deployed by `deploy.yml` using JamesIves/github-pages-deploy-action)
- Custom domain: `fictional-project.org` → CNAME in repo
- HTTPS enforced

`fetch-data.yml` commits updated `data/` to `main`, which triggers `deploy.yml` to redeploy `gh-pages`. Two-workflow chain.

## Implementation Order

1. **scripts/fetch_data.py** — verify yfinance bulk fetch, write data/*.json locally
2. **fetch-data.yml** — Actions workflow, WATCHLIST_SYMBOLS secret, commit + push
3. **index.html + css/style.css** — app shell, dark theme, nav
4. **js/app.js** — hash router, data loader, page dispatch skeleton
5. **js/pages/dashboard.js** — quotes table from data/quotes.json
6. **js/pages/market.js** — heatmap from data/market.json
7. **js/pages/charts.js** — lightweight-charts, OHLCV from data/charts/
8. **js/pages/earnings.js** — earnings table
9. **js/pages/lookup.js** — fundamentals from data/lookup/
10. **js/pages/chat.js** — AI chat, streaming, context injection, key setup modal
11. **deploy.yml** — GitHub Pages deploy workflow
12. **CNAME** — point fictional-project.org subdomain or path

## Key Constraints

- No Flask, no Python at runtime — only at data-fetch time in Actions
- No IBKR, no portfolio data — pure market data
- No personal tickers in committed source — symbols via GitHub Secret only
- Data staleness: 5 min during market hours. Always show last-updated timestamp.
- `lightweight-charts` and Bootstrap via CDN — no build step, no npm
