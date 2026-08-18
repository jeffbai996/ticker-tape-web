# ticker-tape-web

Public Bloomberg-style market terminal: Preact + Vite + Tailwind v4 on GitHub
Pages, backed by a Cloudflare Worker for Yahoo Finance data. The browser app,
demo portfolio, disabled public AI previews, mobile layout, and worker are all
shipped; the private tailnet build activates AI through Fragwire. This is the
operating guide for the current application, not a build roadmap.

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
- API keys never enter browser storage or browser-served build variables. The
  public build does not issue AI requests; private AI stays behind Fragwire.
- No GitHub Secrets carrying private symbol lists into the build.
- Keep the demo account obviously synthetic. Do not make it resemble a real
  portfolio in the name of realism.

## Current Product Surface

- Dashboard with ticker-by-ticker streaming quotes, badge analytics, volume sparks, command bar,
  customizable widget rail, and market-session status.
- Named watchlists alongside the main list, with opt-in cloud reconciliation
  (`src/lib/cloudsave.js`): pull, merge locally, push against the revision that
  was read. The server never merges.
- Markets, per-symbol research, screening, browser alerts, and bilingual UI.
- Synthetic portfolio views for account, sizing, carry, cockpit, what-if,
  trades, thesis watcher, timeline, and backtest.
- AI briefing, memo, and multi-model chat surfaces. Public and private builds
  ship the same information architecture; publicly the AI routes render inert
  previews badged PREVIEW and never call the model service, and the private
  tailnet build activates them through Fragwire and drops the showcase badges.
- Wire page with a synthetic public session and optional user-supplied
  Fragwire-compatible endpoint.
- Responsive mobile navigation and PWA installation: a bottom tab bar, a
  spotlight-style inline search, and the command console as its own phone-only
  page (desktop keeps the floating panel).

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
| Public data proxy | Cloudflare Worker (`worker/`) |
| Private AI runtime | Fragwire router on the tailnet build |

## Design System — Operator language

Operator pitch-black surfaces + Bloomberg amber accent. Flat data surfaces,
hairline borders.
Tokens live in `@theme` in `src/styles/main.css`; use the Tailwind classes rather
than hardcoding hex values in components.

- **Surfaces:** `surface-0` #050609 (canvas) → `surface-1` #0b0d11
  (rails/cards) → `surface-2` #12141a (hover) → `surface-3` #1a1d24
  (active/popover)
- **Text:** `ink` #e7ecf3, `ink-2` #a6adb6, `muted` #79828d
- **Borders:** `line` (white 10%), `line-2` (white 14%), 1px always
- **Accent:** `accent` #f59e0b; reserve `up` #3fb950 and `down` #f85149
  for market semantics
- Dark-only. Cards, rails, and popovers use radii 10–16px; inline chips and
  row highlights drop to 1–3px so they read as terminal marks, not pills.

**Flat data, tactile controls.** Data surfaces — tables, rows, cards, badges,
the tape — stay flat: background token plus a 1px border, no gradient, no drop
shadow. Decoration is spent only where a control has to be found by hand or a
row has to be found by eye:

- `.board-control` / `.board-control:hover` — board toolbar controls carry a
  faint vertical gradient plus an inset top highlight and a 1px drop shadow, so
  the burger, search pill, and sort control read as pressable without becoming
  a second amber accent. They are promoted to their own compositing layer
  (`translateZ(0)`) because the low-alpha dither re-rolls on repaint and
  shimmers otherwise.
- `.board-search:focus` — inset highlight plus a soft amber ring at 12% instead
  of a hard focus border.
- `.wl-row:hover`, `.hl-row:hover` / `.tape-hot` — amber wash with an inset
  edge (3px bar, or a 1px ring on the tape chip) marking the hovered row.
- `.markets-page tr.is-now` — accent hairline plus a short gradient fade
  underneath, so the "you are here" row separates from the hairline separators
  already in the table.
- `.board-drop-line` and `.tape-hot` glows, and the `.mq.is-clipped` /
  `.chat-think` mask gradients, are motion and overflow affordances rather than
  surface styling.
- `.chat-assistant-bubble` — one tight, nearly black drop shadow to lift the
  bubble off the transcript.

Anything outside that list should be flat. Prefer an existing token or one of
these classes over a new gradient or shadow.

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

Current nav sections are dashboard, watchlists, briefing, markets, demo
portfolio, screening, alerts, wire, AI chat, and the phone-only console.
Research has no nav entry — every entry point (search, palette, terminal, tape)
deep-links straight to `#/research/<symbol>`, which still routes.

## Data and AI Paths

The browser fetches live public market data; there is no cron or committed
market-data snapshot. Yahoo's WebSocket streams individual price ticks, a v7
batch request provides first paint and reconnect fallback, then per-symbol chart
requests fill longer-history analytics. Requests that need Yahoo's cookie/crumb
flow go through the Worker. Persistent stale-while-revalidate caches live in
localStorage via `src/lib/pcache.js`. Persist epoch milliseconds, not `Date`
objects. Derive day change from the live quote, not a multi-range chart.

The Worker retains guarded `/chat`, `/chat/models`, and `/chat/spend` routes,
but the public browser bundle does not reference or call them. Public AI
controls are deliberately inert. The private build gets its live model registry,
chat streams, and report generation from Fragwire; stale saved selections fall
back to the first live registry entry. Browser-side tools remain read-only and
no route exposes trading capabilities.

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
