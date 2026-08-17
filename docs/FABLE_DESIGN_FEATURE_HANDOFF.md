# Fable Design and Feature Pass Handoff

Audit date: 2026-08-17

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

The shell contains the session/status row, scrolling tape, responsive side or
bottom navigation, routed work area, and the `ticker>` terminal. Major surfaces:

- Dashboard and named watchlists with streaming quotes, technical badges,
  selectable spark windows, sector grouping, selection actions, and a widget
  rail.
- Briefing with market context and private AI report generation.
- Markets: movers, sectors, heatmap, commodities, earnings, and calendar.
- Research: overview/chart, news, options, earnings, analysts, financials,
  ownership, filings, profile, and Fragwire trail.
- Synthetic portfolio: account, sizing, carry, cockpit, what-if, trades, time
  travel, thesis watcher, timeline, and backtest.
- Screening, alerts, Fragwire, custom watchlist management, and AI chat.
- Public/private parity: disabled AI previews publicly; active server-backed
  features on the tailnet build.

## Audit snapshot

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

### Findings to address

| Priority | Finding | Evidence | Recommended response |
|---|---|---|---|
| P0 | Live-data health is not observable enough | The feed has stream, v7 recovery, v8 analytics, and overnight fill, but the UI mostly exposes one global freshness timestamp. | Add per-symbol source/freshness state and a compact `LIVE / RECOVERING / DELAYED` feed indicator with reconnect age. Never imply a quote is live when it is a snapshot. |
| P0 | Served UI regression coverage is thinner than unit coverage | 942 tests pass, but many layout tests assert source strings. Fresh served-device verification still depends on an attached browser. | Add a small Playwright matrix for 390x844, iPad portrait/landscape, 1024px, and 1376px at 100/125% zoom. Cover toolbar geometry, horizontal overflow, chart range labels, article expansion, and navigation back. |
| P0 | Dependency chain needs an update pass | `npm audit --omit=dev` reports three fixable high-severity findings involving Vite, PostCSS, and Nanoid. | Upgrade the locked build chain in its own commit, run both builds and all worker/browser tests, then repeat the audit. Treat these mainly as dev/build exposure, but do not leave them stale. |
| P1 | Initial route cost is too large | No dynamic imports. Current builds are roughly 732 KB public and 806 KB private before gzip; Vite warns above 500 KB. | Lazy-load routed pages and private-only AI implementation. Keep shell, dashboard first paint, and command grammar eager. Set a measured route budget rather than splitting every small module. |
| P1 | Four pages have become feature monoliths | `research.jsx` is about 2.6K lines; dashboard, chat, and portfolio are each about 1.7K–1.8K lines. | Split by routed subview and move stateful controllers into focused hooks. Do not create a generic component framework; extract only stable product concepts. |
| P1 | Mobile sizing rules fight component geometry | A global 16px form-control guard and global tiny-type floor recently stretched the dashboard search until it received an explicit height. | Replace arbitrary per-element heights with semantic density tokens: compact toolbar control, standard toolbar control, data row, panel header, and touch target. Keep 16px focus-safe inputs but constrain their boxes explicitly. |
| P1 | Written design rules and implementation have drifted | The guide says flat surfaces/no gradients or soft shadows, while toolbar controls currently use gradients and shadows. Many components carry one-off radii and font sizes. | Decide the actual operator language, update the guide, then encode it in a small set of tokens/primitives. Do not blindly remove working contrast before the replacement is tested. |
| P1 | Accessibility is inconsistent in complex overlays | Chat drawers use clickable backdrop `div`s without dialog semantics or a shared focus-trap contract. Keyboard behavior is implemented locally across surfaces. | Establish one modal/drawer contract: role, label, focus entry/return, Escape, backdrop dismissal, reduced motion, and scroll containment. |
| P2 | Persistence is fragmented | Watchlists have cloud sync, but many screen, chart, rail, console, and AI preferences use independent localStorage keys. | Add versioned workspace export/import and optionally sync non-sensitive layout preferences. Keep capability tokens and private endpoints out of exported files. |
| P2 | Documentation is drifting | README still advertises `500 passing`; current suite is 942 tests. Feature descriptions lag recent public/private parity and watchlist work. | Refresh README metrics and the hero/device captures after the design pass, not before it. |

Coverage snapshot from the audit: 68.01% statements, 63.06% branches,
72.23% functions, and 69.03% lines. The highest-risk exception is
`src/lib/feed.js` at roughly 13% statement coverage. Increase behavioral feed
coverage before changing reconnect, throttling, or merge semantics again.

## Recommended feature pass

### 1. Event workspace — highest-value new workflow

Turn calendar entries into an actionable workspace rather than a date list.
Opening an event should show every available field, a plain-language
description, prior/consensus/actual where applicable, affected sectors and
watchlist symbols, related Fragwire stories, and alert controls. After release,
the same view should switch to surprise and first-market-reaction mode.

Why first: calendar, quote, alert, watchlist, and wire data already exist. This
joins them into a daily decision surface without requiring a new provider.

Acceptance signals:

- one tap from calendar to full metadata;
- pre-event and post-event states are visually distinct;
- related symbols come from configured/public mappings, never private source;
- event alert creation shows channel, cooldown, and delivery budget before arm.

### 2. Saved screens and ranked signal boards

The existing feed already computes RSI, relative strength, volume ratio,
SMA50/200 position, distance from the 52-week high, and quote spread. Build a
screen composer around those exact fields, with saved definitions, rank order,
and `open as watchlist` / `alert when entered` actions.

Start with a compact predicate set rather than a query language. A saved screen
should explain why each symbol matched and which inputs are stale or missing.

### 3. Options intelligence, not a larger chain table

Add expected move for the selected expiry, IV term structure, put/call skew,
volume-to-open-interest outliers, and expected-move bands on the price chart.
The first pass should answer three questions: what move is priced, where skew
is concentrated, and what changed today. Avoid declaring activity "unusual"
without a documented baseline.

### 4. Portfolio analytics on the private build

Use server-fetched IBKR position data only; keep the public version synthetic.
Prioritize contribution, drawdown, sector/factor exposure, rolling correlation,
and concentration under common shocks. The cockpit should explain which
positions drive a number instead of showing another aggregate tile.

### 5. Wire clustering and event linkage

Collapse duplicate stories by entity/event, rank by watchlist relevance,
novelty, and source weight, and retain a visible source count. Link a cluster to
the relevant symbol and calendar event. Summaries should be optional, disclose
the model lane, and prefer unmetered/private capacity before metered APIs.

### 6. Saved workspaces

Support a small number of named layouts such as `opening`, `research`, and
`event day`: active watchlist, group mode, spark mode/window, right-rail
widgets, selected market subview, and optional research symbol. This is more
useful than adding more isolated preferences and makes the terminal feel like a
workstation. Do not persist transient quotes or private payloads.

## Design pass targets

### Dashboard and watchlists

- Preserve tick-by-tick geometry: numeric changes may flash but must not resize
  rows, shift columns, or animate backgrounds.
- Give every quote an optional freshness/source affordance without adding a
  permanent verbose column.
- Keep all controls in one non-wrapping toolbar. The sector strip may scroll;
  control groups must not fall onto a second row.
- Retain the current mobile ticker interaction: first tap on the ticker identity
  reveals the name, second identity tap opens research, and one tap elsewhere
  on the row opens research directly while prices remain visible.
- Make saved-screen results and named watchlists use the same row grammar.

### Research

- Establish a stable header rail: identity can scroll, but regular price,
  percent change, and the active extended-hours print remain visible whenever
  possible.
- Make the current section unmistakable without turning all ten research tabs
  into equal-weight pills.
- Convert the right rail into independently scrollable, reorderable modules on
  wide screens; stack them in task order on narrow screens.
- Use `NEWS FEED` for provider news and `FRAGWIRE` for event intelligence.
- Keep date axes range-aware: intraday shows exchange time; multi-day ranges
  show dates. Overlay toggles must be idempotent under repeated clicks.

### Wire

- One expanded article/cluster at a time across both Fragwire surfaces.
- The entire headline row needs a visible hover/focus state.
- On narrow or short viewports, allow the intelligence rail to scroll or move
  below the feed; never clip half its panels inside a fixed-height column.

### Terminal

- Keep the restored two-column help register on wide screens.
- Make command output copyable and keyboard navigable without losing the live
  page context behind it.
- Future command additions should update parsing, completion, help text, and a
  route/action test together.

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

For live-price verification, use at least one symbol unique to a named watchlist
and assert that two WebSocket prints update the rendered row without waiting for
the 30-second snapshot sweep. Also assert that navigating away unsubscribes that
list unless another mounted surface still consumes it.

## Suggested implementation order

1. Feed observability and served-browser regression matrix.
2. Semantic density/control tokens and modal contract.
3. Route-level lazy loading and page-module splits.
4. Event workspace.
5. Saved screens/ranked boards.
6. Options intelligence.
7. Portfolio analytics and wire clustering.
8. Saved workspaces and full preference export/import.

Each step should be independently shippable. Do not combine a visual system
rewrite, data-provider change, and new market feature in one release.

## Code map for the pass

- Shell/navigation: `src/app.jsx`, `src/lib/nav.js`, `src/lib/route.js`
- Design tokens/global responsive rules: `src/styles/main.css`
- Dashboard/watchlists: `src/pages/dashboard.jsx`, `src/pages/watchlists.jsx`
- Quote lifecycle: `src/hooks.js`, `src/lib/feed.js`,
  `src/lib/feedSymbols.js`, `src/lib/yahooStream.js`
- Research/chart: `src/pages/research.jsx`, `src/components/ChartSuite.jsx`
- Wire: `src/pages/wire.jsx`, `src/lib/wire.js`
- Terminal: `src/components/CommandBar.jsx`, `src/lib/commands.js`,
  `src/lib/execute.js`, `src/lib/complete.js`
- AI: `src/pages/chat.jsx`, `src/pages/chatPreview.jsx`,
  `src/components/AiReport.jsx`
- Persistence: `src/lib/cloudsave.js`, `src/lib/watchlists.js`
- Public/private contracts: `test/lib/public_parity.test.js`, build scripts,
  and `.github/workflows/deploy.yml`

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
