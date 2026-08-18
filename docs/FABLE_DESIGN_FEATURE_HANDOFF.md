# Fable Design and Feature Pass Handoff

Audit date: 2026-08-17. Living document — statuses last reconciled against the
tree on **2026-08-18**, after the sweep lanes landed.

This file is no longer a one-shot brief. Findings and feature items carry a
status (**Done**, **Partial**, **Open**) plus a pointer to the module, route, or
test that settles the question. Anything still Partial or Open is scheduled in
[`FABLE_RUN_3_PLAN.md`](FABLE_RUN_3_PLAN.md), which is the executable plan for
the next pass.

## Outcome to design for

Ticker-tape-web should feel like an operator workstation that happens to fit in
Safari, not a collection of finance cards. The next pass should make the daily
loop faster:

1. notice what changed;
2. understand why it matters;
3. move from market context to a symbol, event, screen, or alert;
4. preserve that working state for the next session.

Feature usefulness outranks ornamental polish. Visual changes should improve
information hierarchy, density, scanning, or interaction certainty. Avoid a
generic rounded-card dashboard treatment.

## Non-negotiable product constraints

- This is a public repository. Never place real holdings, watchlists, thesis
  names, account values, private endpoints, or broker details in source,
  fixtures, screenshots, or prose.
- The public and private builds should share the same information architecture.
  Public AI and private-data surfaces may be visible previews, but they must be
  inert and plainly labeled. They must not quietly issue requests.
- Portfolio-shaped public data remains synthetic and visibly labeled
  `DEMO — NOT REAL POSITIONS`.
- No trading or order-entry controls in the browser.
- Do not increase quote-provider concurrency or reduce the 350 ms request
  spacing. Improve perceived speed by prioritizing visible work and deferring
  off-screen analytics.
- Verify interaction and layout work against the served page. Chat-thread tests
  must use a scratch Fragwire chat database; production threads are real data.

## Current product map

The shell contains the session/status row, feed-health chip, scrolling tape,
responsive side or bottom navigation, routed work area, and the `ticker>`
terminal. Routed pages load as separate chunks behind `components/LazyPage.jsx`;
the shell, dashboard, and command grammar stay eager. Major surfaces:

- Dashboard and named watchlists with streaming quotes, technical badges,
  selectable spark windows, sector grouping, selection actions, a widget rail,
  measured quote columns (`src/lib/quoteColumns.js`), per-row freshness markers,
  and a saved-workspaces toolbar control.
- Briefing with market context and private AI report generation.
- Markets: movers, sectors, heatmap, commodities, earnings, and calendar —
  where a calendar row now opens **in place** into an event workspace
  (`EventWorkspace` in `src/pages/markets.jsx`, domain logic in
  `src/lib/eventLinks.js`).
- Research, now a directory (`src/pages/research/`) behind a 72-line router:
  overview/chart, news, options (with expected-move intelligence), earnings,
  analysts, financials, dividends, ownership, filings, profile, and the
  Fragwire trail rail.
- Screening: compare, technicals, correlation, valuation, dividends, and
  **signals** (`#/screen/signals`) — saved screen definitions ranked into a
  board that reuses the dashboard row grammar.
- Synthetic portfolio: account, sizing, carry, cockpit, what-if, trades, time
  travel, thesis watcher, timeline, and backtest, with session-aware day P&L
  (`src/lib/dayPnl.js`).
- Alerts, custom watchlist management, and AI chat.
- Wire: a synthetic public session, the **public wire mirror** (a sanitized
  headline snapshot pushed to the Worker's `/wire/*` routes and read back in
  client MIRROR mode), or a user-supplied Fragwire-compatible endpoint. The
  private build never falls back to the mirror.
- Public/private parity: disabled AI previews publicly; active server-backed
  features on the tailnet build.

## Audit snapshot

Measured on 2026-08-18 with Node 22 (`v22.22.2` — the current build chain
requires it; older Node fails the Vite 8 / Tailwind v4 install).

| Metric | 2026-08-17 audit | 2026-08-18 |
|---|---|---|
| Tests | 942 passing | **1257 passing** across 121 files (`npx vitest run`) |
| Public bundle | ~732 kB single bundle | entry chunk **68.8 kB** (24.4 kB gzip); first-paint set (entry + preloads) **493 kB** raw / **171 kB** gzip; ~902 kB total JS emitted across all route chunks |
| Private bundle | ~806 kB single bundle | same entry chunk; ~903 kB total JS across chunks |
| Largest route chunks | — | `chartview` 165 kB, `research` 103 kB, `dashboard` 91 kB, `portfolio` 67 kB, `chat` 60 kB |
| Route budget | none | `npm run budget` (`scripts/bundle_budget.sh`), currently a 420 kB ceiling on the entry chunk |

The 420 kB entry ceiling has a lot of daylight under it now. It is a
regression tripwire, not a target; tighten it only alongside a lane that
deliberately moves work out of the shell.

### What is strong

- The product has a coherent operator vocabulary: amber for actions/context,
  red/green reserved for market direction, monospaced numeric data, and dense
  keyboard-first navigation.
- Domain logic is unusually well covered: market sessions, chart math,
  indicators, alerts, watchlists, public/private bundle boundaries, and most
  analytics have explicit tests.
- Mobile behavior is treated as a first-class workflow rather than a collapsed
  desktop afterthought. Recent contracts cover fixed viewport scale, preserved
  quote visibility, ticker-name reveal, fixed selection actions, and horizontal
  overflow controls.
- Named watchlists support create/rename/delete, export, cloud reconciliation,
  whole-list conflict resolution, and deletion tombstones.
- Public/private separation is deliberate and testable rather than a CSS hide.
  The mirror extends it: `worker/wire.js` re-validates every pushed event
  against a seven-field contract, so a private field cannot ride along.

### Findings to address

| Priority | Finding | Status | Where it landed / what remains |
|---|---|---|---|
| P0 | Live-data health is not observable enough | **Done (2026-08-18)** | `src/lib/feedHealth.js` states per-symbol source/age; `src/components/FeedIndicator.jsx` paints the shell `LIVE / RECOVERING / DELAYED` chip; a snapshot is never labeled live. Tests: `test/lib/feedHealth.test.js`, `feed_freshness.test.js`, `feed_indicator.test.js`. |
| P0 | Served UI regression coverage is thinner than unit coverage | **Partial** | `scripts/probe_matrix.py` runs the responsive matrix against a *served* build (Playwright + chromium). It is still a manual command — not wired into CI, so nothing fails a deploy. Run 3 lane (d). |
| P0 | Dependency chain needs an update pass | **Done (2026-08-18)** | Three high-severity findings cleared in `1886b08`; build chain moved to Node 22 in `9051444`. Re-run `npm audit --omit=dev` before the next release. |
| P1 | Initial route cost is too large | **Done (2026-08-18)** | `src/components/LazyPage.jsx` splits every routed page; shell + dashboard + command grammar stay eager. Guarded by `test/lib/lazy_routes.test.js` (source contract) and `npm run budget` (emitted bytes). |
| P1 | Four pages have become feature monoliths | **Partial** | `research.jsx` went 2.6K lines → a 72-line router over `src/pages/research/` (`research_split.test.js`). `dashboard.jsx` (~1863), `chat.jsx` (~1769), and `portfolio.jsx` (~1737) are untouched. Run 3 lane (a); research is the template. |
| P1 | Mobile sizing rules fight component geometry | **Partial** | `src/lib/quoteColumns.js` replaced fixed price/change/ext reservations with measured widths, so board rows stopped fighting the mobile floor. The semantic density tokens were not built: 22 distinct arbitrary `text-[Npx]` sizes remain across ~727 call sites. Run 3 lane (e). |
| P1 | Written design rules and implementation have drifted | **Partial** | `CLAUDE.md` now documents the *actual* operator language, including the explicit allowlist of gradient/shadow classes (`a5b6ccf`). The tokens/primitives that would make the rule enforceable rather than described are still open — Run 3 lanes (e) and (f). |
| P1 | Accessibility is inconsistent in complex overlays | **Done (2026-08-18)** | One contract: pure rules in `src/lib/dialog.js`, Preact/DOM wiring in `src/components/Overlay.jsx` — role, label, focus entry/return, Escape, backdrop dismissal, scroll containment. Adopted by Palette, the chat drawers, the research rail, and ChartSuite. Tests: `dialog.test.js`, `overlay.test.js`. |
| P2 | Persistence is fragmented | **Done (2026-08-18)** | `src/lib/workspaces.js` (schema + allowlisted `exportPreferences`/`importPreferences`), `src/lib/workspaceState.js` (binding), `src/components/WorkspacesControl.jsx` (toolbar), and the `ws` console verbs. Layout only — never quotes, positions, tokens, or endpoints. Test: `workspaces.test.js`. |
| P2 | Documentation is drifting | **Done (2026-08-18)** | README metrics and feature list corrected (`9848570`), CLAUDE.md operator surface corrected (`a5b6ccf`), and this pass. Hero/device captures still predate the design pass — reshoot after Run 3, not before. |

Coverage snapshot from the original audit: 68.01% statements, 63.06% branches,
72.23% functions, and 69.03% lines. The highest-risk exception was
`src/lib/feed.js` at roughly 13% statement coverage; the feed-observability work
added behavioral tests around it, but re-measure with
`npm run test:coverage` before changing reconnect, throttling, or merge
semantics again.

## Recommended feature pass

### 1. Event workspace — highest-value new workflow

**Done (2026-08-18)** — Markets → Calendar → an in-place workspace panel.
`EventWorkspace` in `src/pages/markets.jsx`; all joins (event kind, sector ETF
proxy, affected watchlist symbols, pre/post-print state) are pure functions in
`src/lib/eventLinks.js`. Tests: `event_workspace.test.js`, `eventLinks.test.js`.

Turn calendar entries into an actionable workspace rather than a date list.
Opening an event should show every available field, a plain-language
description, prior/consensus/actual where applicable, affected sectors and
watchlist symbols, related Fragwire stories, and alert controls. After release,
the same view should switch to surprise and first-market-reaction mode.

Acceptance signals:

- one tap from calendar to full metadata;
- pre-event and post-event states are visually distinct;
- related symbols come from configured/public mappings, never private source —
  `eventLinks.js` ships a constant of public instruments (index proxies,
  sector/theme ETFs, macro hedges); a company name enters only through an event
  the viewer put on their own calendar;
- event alert creation shows channel, cooldown, and delivery budget before arm.

### 2. Saved screens and ranked signal boards

**Done (2026-08-18)** — `#/screen/signals`. Definitions and evaluation in
`src/lib/screenDefs.js` (field · operator · value, AND-combined, with a rank
field and an explicit `MAX_PREDICATES`); the board is `src/pages/screenBoard.jsx`
and reuses the dashboard's `TuiRow`, so screen results and watchlists share one
row grammar. `open as watchlist` and `alert when entered` are wired through
`watchlists.js` / `alerts.js`. Test: `screenDefs.test.js`.

Deliberately not a query language. A saved screen explains why each symbol
matched and which inputs are stale or missing.

### 3. Options intelligence, not a larger chain table

**Done (2026-08-18)** — `src/lib/expmove.js` (ATM straddle, typical realized
move) and `src/lib/optionsIntel.js` (IV term structure, put/call skew,
volume-to-open-interest outliers) feed `src/pages/research/options.jsx`, with
expected-move bands drawn on `src/pages/research/overviewChart.jsx`. Tests:
`expmove.test.js`, `optionsIntel.test.js`, `options_ladder.test.js`.

The three questions it answers: what move is priced, where skew is concentrated,
what changed today. Activity is never called "unusual" without a stated
baseline.

### 4. Portfolio analytics on the private build

**Open** — Run 3 lane (c). `src/lib/dayPnl.js` landed as a precursor: day P&L
now follows the tape (pre-market move before the open, session compounded with
the extended print after the close) instead of the last completed session.
Contribution, drawdown, sector/factor exposure, rolling correlation, and
concentration under shocks are all unbuilt.

Use server-fetched position data only; keep the public version synthetic. The
cockpit should explain which positions drive a number instead of showing another
aggregate tile.

### 5. Wire clustering and event linkage

**Partial** — the distribution half shipped, the intelligence half did not.
Shipped: the public wire mirror (`worker/wire.js`, `/wire/public`,
`/wire/api/{events,updates,meta,today}`; client MIRROR mode in
`src/pages/wire.jsx` polling every 60 s against a ~5-minute push, with
`wireServiceUrl()` keeping mirror-backed surfaces out of chat/save/alert paths).
Tests: `wire_mirror.test.js`, `test/worker/wire.test.js`.

Still open (Run 3 lane (b)): collapse duplicate stories by entity/event, rank by
watchlist relevance, novelty, and source weight, retain a visible source count,
and link a cluster to the relevant symbol and calendar event. Summaries should
be optional, disclose the model lane, and prefer unmetered/private capacity
before metered APIs.

### 6. Saved workspaces

**Done (2026-08-18)** — `src/lib/workspaces.js` + `src/lib/workspaceState.js`,
driven from the `WorkspacesControl` toolbar popover and the `ws` console verbs
(`ws`, `ws NAME`, `ws save NAME`, `ws rm NAME`, `ws rename OLD / NEW`). A
workspace records active watchlist, group mode, spark shape/window, rail
widgets, market subview, and optional research symbol — layout switches the user
could have flipped by hand. Applying one never reloads and never disturbs the
feed. No quotes, positions, tokens, or endpoints cross the storage boundary;
both `normalizeLayout` and `importPreferences` work off explicit allowlists.

## Design pass targets

### Dashboard and watchlists

- Preserve tick-by-tick geometry: numeric changes may flash but must not resize
  rows, shift columns, or animate backgrounds.
- Give every quote an optional freshness/source affordance without adding a
  permanent verbose column. *(Shipped — per-row freshness marker.)*
- Keep all controls in one non-wrapping toolbar. The sector strip may scroll;
  control groups must not fall onto a second row. *(The workspaces control was
  built as a 26px popover control for exactly this reason.)*
- Retain the current mobile ticker interaction: first tap on the ticker identity
  reveals the name, second identity tap opens research, and one tap elsewhere
  on the row opens research directly while prices remain visible.
- Make saved-screen results and named watchlists use the same row grammar.
  *(Shipped — `screenBoard.jsx` renders `TuiRow`.)*

### Research

- Establish a stable header rail: identity can scroll, but regular price,
  percent change, and the active extended-hours print remain visible whenever
  possible. *(`src/pages/research/header.jsx`.)*
- Make the current section unmistakable without turning all ten research tabs
  into equal-weight pills.
- Convert the right rail into independently scrollable, reorderable modules on
  wide screens; stack them in task order on narrow screens.
  *(`src/pages/research/rail.jsx`, `useRailModules.js`.)*
- Use `NEWS FEED` for provider news and `FRAGWIRE` for event intelligence.
- Keep date axes range-aware: intraday shows exchange time; multi-day ranges
  show dates. Overlay toggles must be idempotent under repeated clicks.

### Wire

- One expanded article/cluster at a time across both Fragwire surfaces.
- The entire headline row needs a visible hover/focus state.
- On narrow or short viewports, allow the intelligence rail to scroll or move
  below the feed; never clip half its panels inside a fixed-height column.
- MIRROR state must be as legible as LIVE and DEMO, and must say how old the
  pushed snapshot is. *(Shipped; the shared token work is Run 3 lane (f).)*

### Terminal

- Keep the restored two-column help register on wide screens.
- Make command output copyable and keyboard navigable without losing the live
  page context behind it.
- Future command additions should update parsing, completion, help text, and a
  route/action test together. *(The `ws` verbs followed this.)*

### AI surfaces

- Use one shared model/effort control language across briefing, reports, and
  chat. Friendly labels may omit provider prefixes when the provider is already
  evident elsewhere.
- Chinese UI mode should set an explicit Chinese response instruction for
  report generation and chat; do not rely on the model inferring locale.
- Public controls remain visible but inert. Private generation must display
  model, effort, custom instructions, cancellation, and error/retry state.
- Do not fabricate reasoning text or zero-token metrics when a backend does not
  report them.

## Responsive verification matrix

Every Fable change should be checked on the served private and public builds:

| View | Required checks |
|---|---|
| 390x844 iPhone Safari | fixed 1x viewport, no focus zoom, readable data floor, bottom-nav clearance, ticker reveal/navigation, no toolbar wrap |
| iPad portrait | dashboard scan density, selection island, article expansion, drawers, chart gestures |
| iPad landscape | dashboard plus rail, research plus rail, terminal resize/help, no clipped controls |
| 1024px desktop | rail remains useful, tabs and quote header overflow correctly |
| 1376px desktop at 100/125% | right rail visibility, chart labels, full company-name thresholds, terminal two-column help |
| Public Pages build | same IA, working local/cloud-capability watchlists, synthetic wire, inert AI, no private URLs |

`scripts/probe_matrix.py` automates the geometry half of this table against a
**served** build rather than source strings:

```bash
python3 scripts/probe_matrix.py http://localhost:8098 [--route '#/'] [--json]
```

It walks iPhone 390, iPad portrait 834, iPad landscape 1194, desktop 1024, and
desktop 1376 at 100% and 125%, asserting no horizontal page scroll, a
single-row dashboard toolbar, fully painted quote clusters, one shared price-box
left edge (the measured columns actually landed), bottom-nav clearance, and no
console errors. It needs a venv with Playwright + chromium. Headless caveat:
`device_scale_factor != 1` or `is_mobile=True` stalls the compositor,
so phones are emulated by viewport only. It is not yet in CI — see Run 3 lane
(d).

## Next pass

The remaining Partial/Open items are ordered and scoped in
[`FABLE_RUN_3_PLAN.md`](FABLE_RUN_3_PLAN.md). Each lane there owns a disjoint
file set so lanes can run in parallel worktrees.

Each step should be independently shippable. Do not combine a visual system
rewrite, data-provider change, and new market feature in one release.

## Code map for the pass

- Shell/navigation: `src/app.jsx`, `src/lib/nav.js`, `src/lib/route.js`,
  `src/components/LazyPage.jsx`
- Design tokens/global responsive rules: `src/styles/main.css`
- Dashboard/watchlists: `src/pages/dashboard.jsx`, `src/pages/watchlists.jsx`,
  `src/lib/dashboardRows.js`, `src/lib/quoteColumns.js`
- Quote lifecycle: `src/hooks.js`, `src/lib/feed.js`,
  `src/lib/feedSymbols.js`, `src/lib/yahooStream.js`
- Feed observability: `src/lib/feedHealth.js`,
  `src/components/FeedIndicator.jsx`
- Research/chart: `src/pages/research.jsx` (router) over
  `src/pages/research/` (`header`, `overview`, `overviewChart`, `news`,
  `options`, `earnings`, `analysts`, `financials`, `dividends`, `ownership`,
  `filings`, `profile`, `rail`, `wireMini`, plus the `use*` hooks), and
  `src/components/ChartSuite.jsx`
- Options intelligence: `src/lib/expmove.js`, `src/lib/optionsIntel.js`
- Events: `src/lib/eventLinks.js`, `EventWorkspace` in `src/pages/markets.jsx`
- Screens/signals: `src/lib/screenDefs.js`, `src/pages/screenBoard.jsx`,
  `src/pages/screen.jsx`
- Wire: `src/pages/wire.jsx`, `src/lib/wire.js`, `worker/wire.js`
- Terminal: `src/components/CommandBar.jsx`, `src/lib/commands.js`,
  `src/lib/execute.js`, `src/lib/complete.js`
- AI: `src/pages/chat.jsx`, `src/pages/chatPreview.jsx`,
  `src/components/AiReport.jsx`
- Overlays: `src/lib/dialog.js`, `src/components/Overlay.jsx`
- Persistence: `src/lib/cloudsave.js`, `src/lib/watchlists.js`,
  `src/lib/workspaces.js`, `src/lib/workspaceState.js`,
  `src/components/WorkspacesControl.jsx`
- Portfolio math: `src/lib/dayPnl.js`, `src/lib/demo.js`
- Public/private contracts: `test/lib/public_parity.test.js`, build scripts,
  and `.github/workflows/deploy.yml`
- Tooling: `scripts/bundle_budget.sh` (`npm run budget`),
  `scripts/probe_matrix.py`, `scripts/deploy_tailnet.sh`

Tests live in `test/lib` (browser/domain) and `test/worker` (Worker proxy, AI,
wire mirror); the older top-level `tests/` directory was consolidated away and
the Vitest include glob is pinned.

## Definition of done

- The proposed feature shortens a real operator workflow and identifies its
  data source and stale/missing behavior.
- Public and private builds compile from the same source without leaking private
  capability details.
- Unit/domain tests define behavior before implementation.
- Served Playwright assertions cover the relevant desktop and mobile state.
- No row geometry changes on quote ticks, no unexpected wrapping, and no hidden
  fixed-height content.
- Documentation and screenshots describe the shipped behavior, not the plan.
