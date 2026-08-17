# ticker-tape-web

![Demo](https://img.shields.io/badge/demo-live-3fb950?style=flat-square)
![Frontend](https://img.shields.io/badge/frontend-Preact-673ab8?style=flat-square)
![Styling](https://img.shields.io/badge/styling-Tailwind_v4-38bdf8?style=flat-square)
![Build](https://img.shields.io/badge/build-Vite-f59e0b?style=flat-square)
![Data](https://img.shields.io/badge/data-live%2C_client--side-208cff?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-installable-0f766e?style=flat-square)
![Tests](https://img.shields.io/badge/tests-500_passing-3fb950?style=flat-square)

A Bloomberg-style market terminal in the browser — the web rebuild of a private CLI TUI. Preact + Vite + Tailwind v4, deployed on GitHub Pages, all data fetched live client-side through a Cloudflare Worker proxy.

![ticker-tape dashboard](docs/images/hero.jpeg)

<sub><em>The dashboard mid-session: streaming quotes with overnight prints, per-symbol technical badges, day/52-week ranges, and the pulse / global markets / earnings rail.</em></sub>

**Live:** https://jeffbai996.github.io/ticker-tape-web/

Personal project. See [LICENSE](LICENSE).

## Features

- **TUI dashboard** — ticker-by-ticker streaming prints with terminal tick flashes, after-hours quotes, volume histogram sparks, and a badge row per symbol: RSI(14), days-to-earnings, SMA50/200 flags, volume vs 20d average, % off 52-week high, 20d relative strength vs QQQ
- **Customizable widget rail** — add / remove / reorder panels (pulse, earnings, macro calendar, movers, mini charts) on the home view; layout persists per browser
- **`ticker>` command line** — the CLI grammar in the footer, with a drop-up output console and ↑/↓ history: `NVDA`, `ta AMD`, `intra TSM`, `vs AAPL MSFT`, `alert SPY > 700`, `w SHOP`, `b`, `h`
- **Status bar** — PRE / OPEN / POST / CLOSED / HOLIDAY session chip (ET, holiday-aware), global index strip that swaps to ES/NQ futures outside regular hours, VIX threshold colors, ET clock with connectivity dot
- **Research** — candlestick charts (1D–5Y) with SMA/Bollinger/VWAP overlays, options chain with BS delta, earnings history + surprise impact, analyst ratings + price targets, insider activity, news
- **Markets** — movers, sectors, heatmap, commodities, earnings week, 2026 macro calendar (FOMC/CPI/NFP/GDP/PCE)
- **Screening** — multi-symbol compare, correlation matrix, valuation grid on any tickers
- **Alerts** — price + technical (RSI / SMA cross / volume) alerts evaluated in-browser, with browser notifications
- **AI surfaces** — the public demo shows the **Briefing** / report controls and multi-model chat workspace as disabled previews; the private tailnet build activates them through its server-side router
- **Demo portfolio** — clearly-marked synthetic positions exercising the position/risk/sizing/carry views
- **i18n** — EN / 中文 toggle, PWA-installable, mobile layout with bottom tab bar

## Architecture

```
Browser (GitHub Pages, static)
  src/lib/feed.js       Yahoo WebSocket streams individual price ticks; v7
                        snapshots recover gaps and v8 fills badges + sparks
  src/lib/*             all analytics computed client-side (pure functions)
        │
        ▼
Cloudflare Worker (worker/)
  /v1 /v7 /v8 /v10 /ws  Yahoo Finance proxy; handles the cookie+crumb dance
                        (single-flight refresh, survives 401 stampedes)
  /chat                 Guarded AI streaming route retained in the Worker.
                        The public browser bundle does not call it; keys stay
                        server-side and the public AI surfaces remain inert.
```

No cron, no committed data, no API keys in the browser — everything is fetched live and computed on the client.

## Tech Stack

| Layer | Choice |
|-------|--------|
| UI | Preact + hash router |
| Build | Vite 8 |
| CSS | Tailwind CSS v4 (`@theme` tokens, CSS-first) |
| Charts | lightweight-charts (TradingView) + hand-rolled SVG sparks |
| Tests | Vitest (jsdom) |
| Fonts | Plus Jakarta Sans (UI) + IBM Plex Mono (data) |
| Deploy | GitHub Pages via Actions |
| Public data proxy | Cloudflare Worker (`worker/`) |
| Private AI router | Fragwire on the tailnet build |

## Commands

```bash
npm install
npm run dev        # Vite dev server
npm run build      # production build to dist/
npm test           # Vitest
```

Worker: `cd worker && npx wrangler deploy` (needs Cloudflare credentials).

## Constraints

- **No personal data.** This is a public showcase: no real positions, accounts, or portfolio-derived symbols anywhere in source, tests, or fixtures. The portfolio section is a labeled synthetic demo.
- API keys never touch the browser. Public AI controls are previews only; the private build calls its server-side router.
- Yahoo data quirks are handled explicitly (crumb auth, ^TNX change fields, patchy earnings-calendar coverage) rather than papered over.

## Repo Layout

```
ticker-tape-web/
├── .github/workflows/deploy.yml
├── worker/              # Cloudflare Worker: Yahoo proxy + AI chat proxy
├── src/
│   ├── app.jsx          # shell: status bar, tape, sidebar, command bar
│   ├── pages/           # dashboard, brief, markets, research, screen, portfolio, alerts, chat
│   ├── components/      # StatusBar, Tape, CommandBar, AiReport, Histo, Palette…
│   └── lib/             # feed, yahoo, badges, pulse, briefing, widgets, alerts, i18n…
├── test/                # Vitest suites (lib + worker)
└── vite.config.js
```
