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
  customizable widget rail, market-session status, and measured quote columns
  (`src/lib/quoteColumns.js`) that keep every row's price box on one x.
- Feed observability: a shell `LIVE / RECOVERING / DELAYED` chip
  (`src/components/FeedIndicator.jsx`) over per-symbol source/freshness state
  (`src/lib/feedHealth.js`). A snapshot is never described as live — only a
  websocket print is.
- Named watchlists alongside the main list, with opt-in cloud reconciliation
  (`src/lib/cloudsave.js`): pull, merge locally, push against the revision that
  was read. The server never merges.
- Markets, per-symbol research, screening, browser alerts, and bilingual UI.
- Event workspace: a Markets → Calendar row opens in place into the full event —
  fields, plain-language description, prior/consensus/actual, public sector
  proxies and watched symbols it touches, and a distinct post-print state.
  `EventWorkspace` in `src/pages/markets.jsx`, joins in `src/lib/eventLinks.js`.
- Signal boards at `#/screen/signals`: saved screen definitions
  (`src/lib/screenDefs.js` — field · operator · value, AND-combined, ranked)
  rendered by `src/pages/screenBoard.jsx` through the dashboard's own row.
- Saved workspaces (`src/lib/workspaces.js`, `src/lib/workspaceState.js`): named
  board layouts switched from the toolbar control or the `ws` console verb, plus
  allowlisted preference export/import. Layout only — never quotes, positions,
  tokens, or endpoints.
- Options intelligence on research: expected move, IV term structure, put/call
  skew, volume-vs-open-interest outliers (`src/lib/expmove.js`,
  `src/lib/optionsIntel.js`), with expected-move bands on the price chart.
- Synthetic portfolio views for account, sizing, carry, cockpit, what-if,
  trades, thesis watcher, timeline, and backtest, with session-aware day P&L
  (`src/lib/dayPnl.js`): pre-market move before the open, session compounded
  with the extended print after the close.
- AI briefing, memo, and multi-model chat surfaces. Public and private builds
  ship the same information architecture; publicly the AI routes render inert
  previews badged PREVIEW and never call the model service, and the private
  tailnet build activates them through Fragwire and drops the showcase badges.
- Wire page with a synthetic public session, the public wire mirror, or an
  optional user-supplied Fragwire-compatible endpoint. The mirror is a
  sanitized headline snapshot pushed to the Worker (`worker/wire.js`,
  `/wire/*`) and read back read-only; the client runs it as MIRROR mode with
  the snapshot age on screen. The private build never falls back to it, and
  `wireServiceUrl()` keeps mirror-backed surfaces out of chat/save/alert paths.
- Routed pages are lazy-loaded behind `src/components/LazyPage.jsx`; the shell,
  dashboard, and command grammar stay eager. `npm run budget` fails the build if
  the entry chunk drifts back over budget.
- One shared overlay contract for every modal and drawer: pure rules in
  `src/lib/dialog.js`, Preact/DOM wiring in `src/components/Overlay.jsx` — role,
  label, focus entry/return, Escape, backdrop dismissal, scroll containment.
  Used by the palette, chat drawers, research rail, and ChartSuite.
- Responsive mobile navigation and PWA installation: a bottom tab bar, a
  spotlight-style inline search, and the command console as its own phone-only
  page (desktop keeps the floating panel).

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Preact (hooks, JSX via `@preact/preset-vite`) |
| Build | Vite 8 (Node 22 required) |
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
├── components/               shared UI components (Overlay, LazyPage, FeedIndicator…)
├── pages/                    routed product surfaces
│   └── research/             research subviews + hooks behind a thin router
├── lib/                      data clients and testable domain logic
└── styles/main.css           Tailwind import and design tokens
test/
├── lib/                      browser/domain tests
└── worker/                   Worker proxy, AI, and wire-mirror tests
worker/
├── worker.js                 request router and Yahoo proxy
├── chat.js                   AI model registry and provider adapters
├── wire.js                   public wire mirror: validated push, read-only serve
└── wrangler.toml             Cloudflare Worker configuration
scripts/
├── bundle_budget.sh          entry-chunk route budget (`npm run budget`)
├── probe_matrix.py           responsive matrix against a SERVED build
└── deploy_tailnet.sh         private build + tailnet deploy
docs/                         Fable design/feature handoff and run plans
public/                       static/PWA assets
```

## Routing

Routing is hash-based (`#/section/sub`) because GitHub Pages has no application
rewrites. The top-level registry is `src/lib/nav.js`; parsing lives in
`src/lib/route.js`.

Current nav sections are dashboard, watchlists, briefing, markets, demo
portfolio, screening (compare, technicals, correlation, valuation, dividends,
signals), alerts, wire, AI chat, and the phone-only console.
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

The public Worker has no `/chat` route; hiding a browser control or setting CORS
is not authorization for a paid endpoint. Public AI controls are deliberately
inert. The private build gets its live model registry,
chat streams, and report generation from Fragwire; stale saved selections fall
back to the first live registry entry. Browser-side tools remain read-only and
no route exposes trading capabilities.

The public family build uses `VITE_FAMILY_BUILD=1` as a presentation flag AND
bakes the family bearer into the bundle via `VITE_SYNC_CAPABILITY` (CI secret).
**This is an explicit owner decision (Jeff, 2026-08-21): zero-setup persistence
on any family device outweighs keeping the bearer out of a public bundle for a
family-grade book. Do not "fix" this again without his sign-off.** The value
never appears in source — CI secret + household vault (`ttw.family_sync_token`)
only. Transport stays hardened: Authorization bearer to the exact `/watchlists`
and `/portfolios` routes, never in a URL; each document is coordinated by a
Durable Object so revision check-and-write is serialized; KV is
migration/write-through backup. The Worker accepts only the off-Git
`FAMILY_SYNC_TOKEN` secret and returns 503 when it is not provisioned.

## Commands and Deployment

The build chain needs **Node 22** (Vite 8 + Tailwind v4); older Node fails the
install.

- `npm run dev` — local Vite server
- `npm run build` — production build to `dist/`
- `npm test` — Vitest suite
- `npm run budget` — build, then fail if the entry chunk is over budget
- `python3 scripts/probe_matrix.py <url>` — responsive checks on a served build
- `cd worker && npx wrangler deploy` — deploy the Worker

Pushing `main` triggers the GitHub Pages workflow. Worker changes require the
separate Wrangler deploy; pushing alone does not update the Worker.

## Reference Material

- `README.md` documents the current user-facing features and architecture.
- `docs/FABLE_DESIGN_FEATURE_HANDOFF.md` is the living design/feature audit with
  per-finding status; `docs/FABLE_RUN_3_PLAN.md` is the next pass's lane plan.
- The sibling `ticker-tape` repository is the private TUI and the source for
  financial behavior worth porting, but its private runtime data must never be
  copied here.
- The retired vanilla-JS v2 implementation remains available in git history
  when historical behavior is useful; it is not the current architecture.
