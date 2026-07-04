# ticker-tape-web v3

Public showcase dashboard — a browser-native rebuild of the ticker-tape TUI's feature surface. Preact + Vite + Tailwind v4, deployed on GitHub Pages. Rebuild in progress per HANDOFF_SPEC (2026-07-03); phases below.

## THE RULE (read before touching anything)

**This repo is PUBLIC. No real account data, real positions, real NLV/margin numbers, thesis names, or the owner's actual held tickers may ever appear in source, tests, fixtures, committed JSON, code comments, or runtime API responses — even transiently, even as an example.** Portfolio-shaped features (positions, sizing, carry, cockpit, timeline) run on **synthetic demo data only**, clearly labeled "DEMO — NOT REAL POSITIONS" in the UI. Public market data on generic tickers (AAPL/MSFT/NVDA/GOOGL/AMZN/TSLA/SPY/QQQ class) is fine — the market isn't the leak, positions in it are.

Corollaries:
- No live broker calls of any kind, client or Worker side. No broker credentials anywhere.
- No trade execution UI, not even decorative.
- API keys never in localStorage or any browser storage. AI chat goes through the Cloudflare Worker proxy (Phase 3), keys as Worker secrets.
- No GitHub Secrets carrying real symbol lists into the build. The pipeline's symbol set is hardcoded generic in `scripts/`.
- Demo account stays obviously fake: round $50K NLV, 1.0x leverage. Don't "improve realism."

## Build Phases

- **Phase 0 (done):** Preact shell, hash router, Operator design tokens, placeholder pages, Pages deploy.
- **Phase 1 (done):** public-safe pages on live client-side Yahoo data — dashboard, markets (overview/sectors/heatmap/commodities/earnings/econ calendar), research (candles, technicals, fundamentals, news, options chain w/ BS delta, intraday VWAP, insider, earnings impact), screening (screen/compare/correlation/valuation), alerts (price/RSI/SMA-cross/volume), Ctrl+K command palette, i18n (en/zh-CN).
- **Phase 2:** demo-portfolio generator + Portfolio section (positions, sizing, carry, cockpit, timeline).
- **Phase 3:** AI chat via Worker proxy (rate-limited, spend-capped).
- **Phase 4:** interaction polish — research drawer, drag-resize, crosshair sync, mobile.
- **Phase 5 (optional):** live-push quotes for in-view symbols.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Preact (hooks, JSX via @preact/preset-vite) |
| Build | Vite 8 |
| CSS | Tailwind CSS v4 (CSS-first config, tokens in `src/styles/main.css`) |
| Charts | lightweight-charts (TradingView) |
| Fonts | Plus Jakarta Sans (UI) + IBM Plex Mono (data, tabular-nums) |
| Tests | Vitest + jsdom (pure logic in `src/lib/` — that's the layer to test) |
| Deploy | GitHub Pages via Actions (`deploy.yml`, push to main) |

## Design System — Operator language

Operator pitch-black surfaces + Bloomberg amber accent. Flat, hairline borders. Tokens live in `@theme` in `src/styles/main.css`; use the Tailwind classes, don't hardcode hex in components.

- **Surfaces:** `surface-0` #050609 (canvas) → `surface-1` #0b0d11 (rails/cards) → `surface-2` #12141a (hover) → `surface-3` #1a1d24 (active/popover)
- **Text:** `ink` #e7ecf3, `ink-2` #a6adb6, `muted` #79828d
- **Borders:** `line` (white 10%), `line-2` (white 14%), 1px always
- **Accent:** `accent` #f59e0b (Bloomberg amber — the one color allowed to pop), `accent-soft` wash for active nav
- **P&L / live:** `up` #3fb950, `down` #f85149 — reserved for semantics, never decoration
- **No glows, no gradients, no soft shadows.** Radii 10–16px.
- Dark-only for now.

## Repo Structure

```
src/
├── main.jsx                <- entry, mounts App
├── app.jsx                 <- shell: StatusBar / Sidebar / routed Page
├── lib/                    <- pure logic, tested (route.js, nav.js, ...)
├── components/             <- shell components (StatusBar, Sidebar, Placeholder)
├── pages/                  <- one module per section
└── styles/main.css         <- Tailwind import + @theme tokens
scripts/                    <- legacy yfinance tooling (unused by the app)
worker/                     <- Cloudflare Worker: Yahoo CORS proxy, later AI chat proxy
test/lib/                   <- Vitest specs for src/lib
```

## Routing

Hash-based (`#/section/sub`) because GitHub Pages has no rewrites. Sections: `dashboard` (`#/`), `markets` (+sectors/heatmap/commodities/earnings/calendar), `research` (`#/research/SYM/{intraday|options|earnings|insider}`), `portfolio` (demo), `screen` (+compare/correlation/valuation), `alerts`, `chat`. Registry in `src/lib/nav.js`; parsing in `src/lib/route.js` (tested).

## Data path

No cron, no committed JSON — the browser fetches Yahoo live. v8 chart + v1 search go through a plain CORS proxy (dev: Vite's `/yf` proxy, zero setup; prod: the `worker/` Cloudflare Worker). v7 options + v10 quoteSummary + the earnings-calendar POST (`/v1/finance/visualization`) need Yahoo's cookie/crumb dance and ALWAYS go through the Worker, even in dev. Persistent stale-while-revalidate caches in localStorage (`src/lib/pcache.js`) make reloads ~free. Day-change must come from the 1D feed — a multi-range chart fetch reports change vs the range start. Persist epoch ms, never Date objects.

## Commands

- `npm run dev` — dev server · `npm run build` — production build · `npm test` — Vitest
- Base path: `/ticker-tape-web/` (vite.config.js)

## Reference material (not in this repo)

- The TUI (`ticker-tape` repo) is the feature source. Its `demo_data.py` is the demo-data pattern to port: deterministic, minute-bucket seeded, "Nothing here may reference a real portfolio."
- v2's vanilla-JS implementation is in git history before the `chore: tear down v2 app for v3 rebuild` commit — formatters, alert engine, and journal logic there are worth porting with their tests.
