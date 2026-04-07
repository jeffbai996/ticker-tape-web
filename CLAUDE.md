# ticker-tape-web v2

Modern web dashboard for market data — Bloomberg-inspired dark theme, built with Vite + Tailwind CSS v4. Deployed on GitHub Pages, data refreshed via GitHub Actions every 5 minutes.

## Architecture

```
GitHub Actions (cron, every 5 min on weekdays)
  scripts/fetch_data.py       <- yfinance: quotes, indices, sectors, earnings, charts
  scripts/fetch_lookup.py     <- per-symbol fundamentals (runs less frequently)
  -> commits public/data/*.json to main branch
  -> triggers deploy workflow

Deploy workflow (on push to main)
  npm ci && npm run build     <- Vite builds src/ -> dist/
  dist/ deployed to GitHub Pages

Browser (pull)
  Loads dist/data/*.json with cache-busting
  AI chat calls Anthropic/Google/OpenAI APIs directly from browser
  API keys stored in localStorage (never committed)
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Build | Vite 8 |
| CSS | Tailwind CSS v4 (CSS-first config, @tailwindcss/vite plugin) |
| JS | Vanilla ES6+ modules (no framework) |
| Charts | lightweight-charts (TradingView) |
| Fonts | Inter (UI) + JetBrains Mono (data) |
| Deploy | GitHub Pages via Actions |

## Repo Structure

```
ticker-tape-web/
├── .github/workflows/
│   ├── fetch-data.yml          <- cron: every 5 min weekdays, hourly weekends
│   └── deploy.yml              <- npm build + deploy dist/ to Pages
├── scripts/
│   ├── fetch_data.py           <- bulk quotes, indices, technicals -> public/data/
│   ├── fetch_lookup.py         <- per-symbol fundamentals -> public/data/lookup/
│   └── requirements.txt
├── worker/                     <- Cloudflare Worker (Yahoo Finance CORS proxy)
├── public/data/                <- JSON data files (populated by Actions)
│   ├── quotes.json, market.json, technicals.json, sparklines.json
│   ├── earnings.json, sectors.json, news.json, commodities.json, econ.json
│   ├── charts/{SYMBOL}.json    <- OHLCV by timeframe
│   └── lookup/{SYMBOL}.json    <- Fundamentals
├── src/
│   ├── main.js                 <- Entry point
│   ├── router.js               <- Hash-based SPA router
│   ├── state.js                <- Simple reactive state (EventTarget)
│   ├── layout/
│   │   ├── shell.js            <- App shell (sidebar + main + chat)
│   │   ├── sidebar.js          <- Nav + watchlist + pulse
│   │   ├── status-bar.js       <- Scrolling indices + market state + clock
│   │   ├── command-palette.js  <- Cmd+K fuzzy search
│   │   └── settings-modal.js   <- API keys + preferences
│   ├── pages/ (21 modules)
│   │   ├── dashboard.js        <- Thesis card grid (landing page)
│   │   ├── market.js           <- Indices + breadth + sentiment
│   │   ├── chart.js            <- Candlestick (lightweight-charts)
│   │   ├── lookup.js           <- Fundamentals deep dive
│   │   ├── technicals.js       <- SMA/RSI/MACD/BB/ATR/RS
│   │   ├── sectors.js, earnings.js, news.js, heatmap.js
│   │   ├── intraday.js, comparison.js, correlation.js, valuation.js
│   │   ├── calendar.js, commodities.js
│   │   ├── dividends.js, short.js, ratings.js
│   │   ├── insider.js, impact.js, options.js (placeholders)
│   │   └── index.js            <- Page registry
│   ├── chat/
│   │   ├── panel.js            <- Chat UI + streaming
│   │   ├── providers.js        <- Anthropic/Google/OpenAI streaming
│   │   ├── markdown.js         <- MD -> HTML renderer
│   │   └── memory.js           <- Persistent memories (localStorage)
│   ├── lib/
│   │   ├── data.js             <- Fetch + cache data/*.json
│   │   ├── format.js           <- Price, %, cap, sparkline formatters
│   │   ├── alerts.js           <- Price alert engine
│   │   ├── watchlist.js        <- Symbol list + groups
│   │   ├── journal.js          <- Trade journal
│   │   └── storage.js          <- localStorage wrapper
│   └── styles/
│       └── main.css            <- Tailwind imports + custom theme
├── index.html                  <- Vite entry
├── vite.config.js              <- Vite config (base path, Tailwind plugin)
└── package.json
```

## Design System

- **Background:** zinc-950 (#09090b)
- **Surface (cards):** zinc-900 (#18181b), class: `card`
- **Border:** zinc-800 (#27272a)
- **Text:** zinc-50 primary, zinc-400 secondary, zinc-500 muted
- **Accent:** amber-500 (#f59e0b) — Bloomberg orange
- **Positive/Negative:** green-500 / red-500
- **Data font:** JetBrains Mono with tabular-nums
- **UI font:** Inter

## Pages & Routes

| Route | Page | Data Source |
|-------|------|-------------|
| `#/` or `#/dashboard` | Dashboard (thesis cards) | quotes, sparklines, technicals, earnings |
| `#/market` | Market overview | market.json |
| `#/chart/SYM` | Candlestick chart | charts/SYM.json |
| `#/lookup/SYM` | Fundamentals | lookup/SYM.json |
| `#/technicals/SYM` | Technical analysis | technicals.json |
| `#/sectors` | Sector heatmap | sectors.json |
| `#/earnings` | Earnings calendar | earnings.json |
| `#/news` or `#/news/SYM` | Headlines | news.json |
| `#/heatmap` | Performance grid | quotes.json |
| `#/commodities` | Futures prices | commodities.json |
| `#/calendar` | Econ events | econ.json |
| `#/comparison` | Multi-symbol | sparklines.json |
| `#/correlation` | Correlation matrix | correlation.json |
| `#/valuation` | Valuation table | lookup/*.json |
| `#/intraday/SYM` | 5-min bars | charts/SYM.json |
| `#/dividends/SYM` | Dividend info | lookup/SYM.json |
| `#/short/SYM` | Short interest | lookup/SYM.json |
| `#/ratings/SYM` | Analyst consensus | lookup/SYM.json |

## Commands

- `npm run dev` — Vite dev server with hot reload
- `npm run build` — Production build to dist/
- `npm run preview` — Preview production build

## Key Constraints

- No personal tickers in committed source — symbols via GitHub Secret only
- No IBKR, no portfolio data — pure market data
- API keys in localStorage, never committed
- Data staleness: 5 min during market hours. Always show timestamps.
- Base path: `/ticker-tape-web/` (configured in vite.config.js)
