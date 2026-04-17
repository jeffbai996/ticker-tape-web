# ticker-tape-web

Modern web dashboard for market data — Bloomberg-inspired dark theme, built with Vite + Tailwind CSS v4. Deployed on GitHub Pages with data refreshed via GitHub Actions every 5 minutes during market hours.

Personal project. See [LICENSE](LICENSE).

## Architecture

```
GitHub Actions (cron, every 5 min weekdays)
  scripts/fetch_data.py        <- yfinance: quotes, indices, sectors, earnings, charts
  scripts/fetch_lookup.py      <- per-symbol fundamentals
  -> commits public/data/*.json to main
  -> triggers deploy workflow

Deploy workflow (on push to main)
  npm ci && npm run build      <- Vite builds src/ -> dist/
  dist/ deployed to GitHub Pages

Browser
  Loads dist/data/*.json with cache-busting
  AI chat calls Anthropic/Google/OpenAI directly from browser
  API keys stored in localStorage (never committed)
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Build | Vite 8 |
| CSS | Tailwind CSS v4 (CSS-first, `@tailwindcss/vite` plugin) |
| JS | Vanilla ES6+ modules (no framework) |
| Charts | lightweight-charts (TradingView) |
| Fonts | Inter (UI) + JetBrains Mono (data) |
| Deploy | GitHub Pages via Actions |
| Proxy | Cloudflare Worker (`worker/`) for Yahoo Finance CORS |

## Commands

```bash
npm install
npm run dev        # Vite dev server with hot reload
npm run build      # Production build to dist/
npm run preview    # Preview production build
npm test           # Vitest
```

## Pages

Hash-based SPA router. 21 pages covering dashboard, market overview, candlestick charts, fundamentals, technicals (SMA/RSI/MACD/BB/ATR/RS), sectors, earnings, news, heatmap, intraday, comparison, correlation, valuation, calendar, commodities, dividends, short interest, ratings.

## Design System

- Background `zinc-950`, surface `zinc-900`, border `zinc-800`
- Text: `zinc-50` primary, `zinc-400` secondary, `zinc-500` muted
- Accent: `amber-500` (Bloomberg orange)
- Positive/negative: `green-500` / `red-500`
- Data font uses `tabular-nums` for alignment

## Constraints

- No personal tickers in committed source — symbols injected via GitHub Secret
- No broker or portfolio data — pure market data
- API keys live in localStorage, never committed
- Data is up to 5 min stale during market hours; pages always show timestamps
- Base path `/ticker-tape-web/` (see `vite.config.js`)

## Repo Layout

```
ticker-tape-web/
├── .github/workflows/   # fetch-data.yml + deploy.yml
├── scripts/             # Python fetchers (yfinance)
├── worker/              # Cloudflare Worker (CORS proxy)
├── public/data/         # JSON data (populated by Actions)
├── src/
│   ├── main.js, router.js, state.js
│   ├── layout/          # shell, sidebar, status-bar, command-palette, settings
│   ├── pages/           # 21 page modules
│   ├── chat/            # AI chat panel + providers + memory
│   ├── lib/             # data, format, alerts, watchlist, journal, storage
│   └── styles/main.css
├── index.html
├── vite.config.js
└── package.json
```

See [CLAUDE.md](CLAUDE.md) for deeper architectural notes.
