# ticker-tape-web

Public Bloomberg-style market terminal: Preact + Vite + Tailwind v4 on GitHub
Pages, backed by a Cloudflare Worker for Yahoo Finance and AI provider access.
The browser app, demo portfolio, AI surfaces, mobile layout, and worker are all
shipped; this is the operating guide for the current application, not a build
roadmap.

## THE RULE (read before touching anything)

**This repo is PUBLIC. No real account data, real positions, real NLV/margin
numbers, thesis names, or the owner's actual held tickers may ever appear in
source, tests, fixtures, committed JSON, code comments, or runtime API responses
— even transiently, even as an example.** Portfolio-shaped features run only on
synthetic demo data and must remain clearly labeled "DEMO — NOT REAL POSITIONS"
in the UI. Public market data on generic tickers such as AAPL, MSFT, GOOGL,
AMZN, TSLA, SPY, and QQQ is fine.

Corollaries:

- No broker calls or broker credentials, client-side or Worker-side.
- No trade-execution UI, including decorative controls.
- API keys never enter browser storage or browser-served build variables. AI
  requests go through the Cloudflare Worker; provider keys are Worker secrets.
- No GitHub Secrets carrying private symbol lists into the build.
- Keep the demo account obviously synthetic. Do not make it resemble a real
  portfolio in the name of realism.

## Current Product Surface

- Dashboard with batched quotes, badge analytics, volume sparks, command bar,
  customizable widget rail, and market-session status.
- Markets, per-symbol research, screening, browser alerts, and bilingual UI.
- Synthetic portfolio views for account, sizing, carry, cockpit, timeline, and
  backtest.
- AI briefing, memo generation, and multi-model chat through the Worker.
- Wire page for user-supplied live audio/transcript streams.
- Responsive mobile navigation and PWA installation.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Preact (hooks, JSX via `@preact/preset-vite`) |
| Build | Vite 8 |
| CSS | Tailwind CSS v4 (CSS-first config, tokens in `src/styles/main.css`) |
| Charts | lightweight-charts (TradingView) |
| Fonts | Plus Jakarta Sans (UI) + IBM Plex Mono (data, tabular-nums) |
| Tests | Vitest + jsdom |
| Static deploy | GitHub Pages via Actions (`.github/workflows/deploy.yml`) |
| Data and AI proxy | Cloudflare Worker (`worker/`) |

## Design System — Operator language

Operator pitch-black surfaces + Bloomberg amber accent. Flat, hairline borders.
Tokens live in `@theme` in `src/styles/main.css`; use the Tailwind classes rather
than hardcoding hex values in components.

- **Surfaces:** `surface-0` #050609 (canvas) → `surface-1` #0b0d11
  (rails/cards) → `surface-2` #12141a (hover) → `surface-3` #1a1d24
  (active/popover)
- **Text:** `ink` #e7ecf3, `ink-2` #a6adb6, `muted` #79828d
- **Borders:** `line` (white 10%), `line-2` (white 14%), 1px always
- **Accent:** `accent` #f59e0b; reserve `up` #3fb950 and `down` #f85149
  for market semantics
- No glows, gradients, or soft shadows. Dark-only. Radii 10–16px.

## Repo Structure

```text
.github/workflows/deploy.yml  GitHub Pages build and deploy
src/
├── main.jsx                  entry point
├── app.jsx                   application shell
├── components/               shared UI components
├── pages/                    routed product surfaces
├── lib/                      data clients and testable domain logic
└── styles/main.css           Tailwind import and design tokens
test/
├── lib/                      browser/domain tests
└── worker/                   Worker proxy and AI tests
worker/
├── worker.js                 request router and Yahoo proxy
├── chat.js                   AI model registry and provider adapters
└── wrangler.toml             Cloudflare Worker configuration
public/                       static/PWA assets
```

## Routing

Routing is hash-based (`#/section/sub`) because GitHub Pages has no application
rewrites. The top-level registry is `src/lib/nav.js`; parsing lives in
`src/lib/route.js`.

Current sections are dashboard, briefing, markets, research, demo portfolio,
screening, alerts, wire, and AI chat.

## Data and AI Paths

The browser fetches live public market data; there is no cron or committed
market-data snapshot. A v7 batch request paints the quote list, then per-symbol
chart requests fill longer-history analytics. Requests that need Yahoo's
cookie/crumb flow go through the Worker. Persistent stale-while-revalidate
caches live in localStorage via `src/lib/pcache.js`. Persist epoch milliseconds,
not `Date` objects. Derive day change from the 1D feed, not a multi-range chart.

The Worker exposes Yahoo proxy routes plus `/chat`, `/chat/models`, and
`/chat/spend`. It normalizes Anthropic, Gemini, and OpenAI streams, holds provider
keys as secrets, rate-limits requests, and enforces the daily spend cap in KV.
The browser may execute approved read-only tools against data it already owns;
the Worker does not execute tools or expose trading capabilities.

The model registry in `worker/chat.js` is the single source of truth. The chat
page must fetch `/chat/models`; stale saved selections fall back to the first
live registry entry.

## Commands and Deployment

- `npm run dev` — local Vite server
- `npm run build` — production build to `dist/`
- `npm test` — Vitest suite
- `cd worker && npx wrangler deploy` — deploy the Worker

Pushing `main` triggers the GitHub Pages workflow. Worker changes require the
separate Wrangler deploy; pushing alone does not update the Worker.

## Reference Material

- `README.md` documents the current user-facing features and architecture.
- The sibling `ticker-tape` repository is the private TUI and the source for
  financial behavior worth porting, but its private runtime data must never be
  copied here.
- The retired vanilla-JS v2 implementation remains available in git history
  when historical behavior is useful; it is not the current architecture.
