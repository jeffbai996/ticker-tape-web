# Fable Run 3 — Execution Plan

Written 2026-08-18, after the Run 2 sweep lanes landed. This document is
self-contained: a fresh session should be able to execute it without the
conversation that produced it. Status of everything referenced here lives in
[`FABLE_DESIGN_FEATURE_HANDOFF.md`](FABLE_DESIGN_FEATURE_HANDOFF.md).

## Goal

Run 2 added surfaces. Run 3 pays down what those surfaces made expensive, and
finishes the two feature items that were left Open.

Concretely, by the end of the run:

1. No routed page is a 1.7K+ line monolith.
2. The wire is intelligence, not a firehose — duplicates collapse, clusters
   point at a symbol and a calendar event.
3. The private build has portfolio analytics that explain *which position*
   drives a number.
4. The responsive matrix fails a deploy instead of waiting for someone to run
   a script.
5. Type sizes and state pills come from a named vocabulary instead of 22
   arbitrary pixel values and per-surface class maps.

## Constraints (read before writing any code)

These are not negotiable and they are the reason a lane gets rejected.

- **This repository is public.** No real holdings, watchlists, thesis names,
  account values, private endpoints, or broker details in source, tests,
  fixtures, screenshots, commit messages, or prose. Portfolio-shaped public
  data stays synthetic and visibly labeled `DEMO — NOT REAL POSITIONS`. Public
  market data on generic tickers (AAPL, MSFT, GOOGL, AMZN, TSLA, SPY, QQQ) is
  fine.
- **Public and private builds share one information architecture.** Private
  features may be visible previews publicly, but they must be inert, plainly
  labeled, and must never issue a request.
- **No trading or order-entry controls**, not even decorative ones.
- **No broker calls or credentials in the browser or the Worker.** Private
  position data reaches the private build through its own server-side router,
  never from client code committed here.
- **Do not increase quote-provider concurrency or reduce the 350 ms request
  spacing.** Win perceived speed by prioritizing visible work.
- **Tests define behavior before implementation.** Every lane below lists the
  tests to write first.
- **Node 22** (`v22.22.2`) for the build chain. Vite 8 + Tailwind
  v4 will not install cleanly on older Node.
- **Design language:** flat data surfaces, tactile controls, amber accent, with
  up/down green and red reserved for market direction. The allowlist of classes
  permitted to carry a gradient or shadow is in `CLAUDE.md` — do not add to it
  without updating that list in the same commit.
- **Verify against the served page**, not source strings, for anything
  geometric.

## Working model

Lanes are ordered by dependency, not by importance. Lanes (a)–(f) own disjoint
file sets so they can run in **parallel git worktrees** off `main` and merge
independently. Where two lanes must touch the same file, that file is named in
the "shared, coordinate" row and the touch should be a one-line import or class
swap, landed by whichever lane merges first.

Before starting a lane:

```bash
export PATH=$HOME/.nvm/versions/node/v22.22.2/bin:$PATH
git worktree add ../ttw-lanes/<lane> -b sweep/<lane> main
npx vitest run          # baseline: 1257 passing / 121 files
npm run build && npm run budget
```

Before merging a lane: `npx vitest run`, `npm run build`, `npm run budget`, and
for anything visual, `python3 scripts/probe_matrix.py <served-url>`.

Commits: conventional, under 72 characters, no AI attribution anywhere.

---

## Lane (a) — Page-monolith splits

**Why now.** `research.jsx` went from ~2.6K lines to a 72-line router over
`src/pages/research/` in Run 2, and every subsequent research change got
cheaper and better-tested for it. Three pages are still monoliths and they are
the three that Run 3's other lanes need to edit: `dashboard.jsx` (~1863),
`chat.jsx` (~1769), `portfolio.jsx` (~1737). Splitting them first is what makes
lanes (c), (e), and (f) small diffs instead of merge hazards.

**The template is `src/pages/research/`.** Copy its shape, not a new
abstraction:

- the page file becomes a router: route parsing, shared data fetch, subview
  dispatch, nothing else;
- each routed subview is its own file in `src/pages/<page>/`;
- stateful controllers become `use*.js` hooks in the same directory
  (`useResearchChart.js`, `useRailModules.js`, `useResearchKeys.js` are the
  precedent);
- genuinely shared bits go in a `shared.jsx` in that directory, not in
  `src/components/`.

Do **not** build a generic page framework. Extract only stable product
concepts. If a helper is used once, leave it where it is.

**Split guidance per page:**

- `dashboard.jsx` → `src/pages/dashboard/`: the board itself, `TuiRow` (already
  imported by `screenBoard.jsx` — export it from a dedicated module so the
  import stops reaching into a page), the toolbar/controls row, the widget
  rail, sector grouping, and the selection island. Keep the eager-load
  boundary: dashboard is first paint, so its chunk must not start pulling in
  route-only code.
- `chat.jsx` → `src/pages/chat/`: transcript, composer, thread rail, model and
  effort controls, drawers (already on the shared `Overlay` contract).
- `portfolio.jsx` → `src/pages/portfolio/`: one file per subview (account,
  sizing, carry, cockpit, what-if, trades, time travel, thesis, timeline,
  backtest) behind a router. This is the direct precondition for lane (c).

**Done looks like.** Each of the three page files is a router under ~150 lines;
no subview file exceeds ~400 lines; `npx vitest run` is green with no test
rewritten to chase a moved symbol beyond its import path; `npm run budget`
unchanged; the dashboard's first-paint chunk has not grown.

**Tests to write first.** A `dashboard_split.test.js`, `chat_split.test.js`, and
`portfolio_split.test.js` modeled on `test/lib/research_split.test.js`: assert
the router file imports each subview, that every subview module exists and
exports its component, and that no subview imports a sibling subview. Then run
the existing suites (`dashboard_row.test.js`, `chat_rail.test.js`,
`portfolio_accounts.test.js`, `thesis_view.test.js`, …) unchanged as the real
behavioral net.

**Risk.** This is the lane most likely to break something silently, because it
is a pure refactor with a large surface. Mitigations: move code without editing
it in the same commit (mechanical move first, cleanup second); land one page
per commit; watch for `screenBoard.jsx`'s `import { TuiRow } from './dashboard.jsx'`
and any other cross-page import before deleting the old file.

**Files owned:** `src/pages/dashboard.jsx`, `src/pages/chat.jsx`,
`src/pages/portfolio.jsx`, new `src/pages/{dashboard,chat,portfolio}/**`,
`test/lib/*_split.test.js`.
**Shared, coordinate:** `src/pages/screenBoard.jsx` (one import line),
`src/pages/index.jsx` / `LazyPage` registrations.

---

## Lane (b) — Wire clustering and event linkage

**Why now.** The wire's distribution problem is solved — the public mirror
ships sanitized headlines through `worker/wire.js` and the client reads them in
MIRROR mode. What is left is the reason the feature existed: the same story
arrives from six sources and the reader has to notice that by hand. Clustering
is also what makes the event workspace from Run 2 pay off, because a cluster is
the thing that should hang off a calendar entry.

**Scope.**

1. **Dedupe by entity/event.** A cluster key derived from extracted entities
   (symbol/ticker mentions, issuer names already present in the payload) plus
   an event kind, over a bounded time window. Headline text similarity is a
   tiebreaker, not the primary key — near-identical wire copy is common and
   genuinely distinct follow-ups share phrasing.
2. **Rank by novelty, source weight, and watchlist relevance.** Novelty is the
   age of the *first* member of the cluster, not the newest — a story on its
   ninth rewrite is not news. Source weight is a shipped constant table of
   public outlets; keep it in the module, documented, not tuned invisibly.
3. **Visible source count.** Every cluster row shows how many sources and lets
   the reader expand to the member list with links. A cluster of one must look
   like a single story, not a collapsed group.
4. **Link cluster → symbol and → calendar event.** Reuse `src/lib/eventLinks.js`
   for the event side; it already maps event kinds to public sector proxies and
   to symbol-bearing calendar entries. A cluster that resolves to a symbol gets
   a deep link to `#/research/<sym>`; one that resolves to a calendar event
   opens the Markets event workspace.
5. **Summaries are optional and disclosed.** Off by default. When on, the UI
   names the model lane, and unmetered/private capacity is tried before any
   metered API. The public build never generates a summary.

**Done looks like.** On both the mirror and a Fragwire endpoint, a day's feed
collapses to materially fewer rows with an accurate source count on each; one
expanded cluster at a time; clicking through lands on the right symbol or event;
no cluster ever merges two stories about different companies; summaries are off
until explicitly enabled and always carry their lane label.

**Tests to write first.** `test/lib/wireCluster.test.js` over synthetic events:
identical story from N sources collapses to one cluster with count N; two
same-sector stories about different issuers stay separate; a follow-up outside
the window starts a new cluster; ranking puts a fresh two-source story above a
stale six-source one; cluster→symbol and cluster→event resolution given the
`eventLinks` map; source-weight table is total (an unknown source gets a
defined default, not `undefined`). Then a `wire_cluster_ui.test.js` for
one-expanded-at-a-time and the source-count affordance.

**Risk.** Over-merging is the failure that destroys trust — a reader who sees
two different companies in one cluster stops believing the count. Bias the
clusterer toward *under*-merging and make the threshold a documented constant.
Second risk: the mirror payload is a deliberately thin seven-field contract, so
clustering must degrade gracefully when entity hints are absent rather than
falling back to headline-text similarity alone.

**Files owned:** new `src/lib/wireCluster.js`, `src/pages/wire.jsx` (and its
components), `src/lib/wire.js`, `test/lib/wireCluster.test.js`,
`test/lib/wire_cluster_ui.test.js`.
**Shared, coordinate:** `src/lib/eventLinks.js` (read-only; add exports only),
`src/pages/research/wireMini.jsx`.

---

## Lane (c) — Portfolio analytics, private build only

**Why now.** This is the last Open item from the original feature pass, and
lane (a) makes it tractable by turning `portfolio.jsx` into a directory. It is
also the highest-value private feature: the public demo exercises the views, the
private build is where they answer a real question.

**Hard boundary.** Positions come from the private build's server-side fetch.
The public build keeps rendering the same views against `src/lib/demo.js`
synthetic data with the `DEMO — NOT REAL POSITIONS` label. No broker call, no
credential, no account identifier, and no real symbol list enters this
repository — not in source, not in a fixture, not in a test, not in a comment.
Every analytic below must be a **pure function over a positions array** in
`src/lib/`, tested with synthetic positions, so the private/public difference is
only where the array came from.

**Analytics, in order:**

1. **Contribution** — each position's share of the period's P&L, in currency and
   in basis points of starting value. Must reconcile: contributions sum to the
   total.
2. **Drawdown** — peak-to-trough on the account curve, with the current
   drawdown, its start date, and the depth of the worst one in the window.
3. **Sector / factor exposure** — sector from the existing public bucket map;
   factor exposure kept honest and simple (beta to a chosen benchmark, plus
   size/momentum proxies computed from price history already available). Label
   proxies as proxies.
4. **Rolling correlation** — pairwise, over a selectable window, plus each
   position's correlation to the book excluding itself (the number that
   actually tells you if a position is diversifying).
5. **Concentration under shocks** — apply a set of named, documented shock
   scenarios and show the resulting P&L *decomposed by position*, not as one
   number.

**The cockpit rule:** every aggregate tile must be expandable into the
positions that drive it, ranked by contribution to that specific number. If a
number cannot explain itself, it does not ship.

**Done looks like.** On the private build, each analytic renders from
server-fetched positions and names its inputs, its window, and its stale/missing
behavior; on the public build the same views render from synthetic data and are
labeled; `public_parity.test.js` still passes; a grep for broker/account terms
in the diff finds nothing.

**Tests to write first.** `test/lib/portfolioAnalytics.test.js` with synthetic
positions: contributions sum to total P&L; a zero-share position contributes
zero and does not divide by zero; drawdown of a monotonically rising curve is
zero; correlation of a series with itself is 1 and with a constant series is
`null` not `NaN`; shock decomposition sums to the aggregate; every function
returns `null` (not a fabricated zero) when a required input is missing. Extend
`public_parity.test.js` to assert the public bundle reaches no private data
path.

**Risk.** The repo-safety risk is the one that matters: a "just for testing"
fixture with real symbols is a permanent leak once committed. Use the generic
ticker set. Secondary risk is analytics that quietly lie on partial data —
hence the explicit `null`-not-zero contract in the tests.

**Files owned:** new `src/lib/portfolioAnalytics.js` (and siblings),
`src/pages/portfolio/**` (after lane (a) merges), `src/lib/demo.js`,
`test/lib/portfolioAnalytics.test.js`.
**Shared, coordinate:** `test/lib/public_parity.test.js`, `src/lib/dayPnl.js`
(read-only).

---

## Lane (d) — Served Playwright matrix in CI

**Why now.** `scripts/probe_matrix.py` already encodes the responsive matrix and
already catches real regressions — it just requires a human to remember. Every
other lane in this run changes layout. Wiring it into the deploy job is what
converts the other five lanes from "probably fine" to verified.

**Scope.**

1. In the GitHub Actions deploy job, after `npm run build`, **serve `dist/`**
   (any static server; the built public base path is `/ticker-tape-web/`, so
   serve accordingly or build with `--base=/` for the probe step) and run the
   matrix against the served URL.
2. Either invoke `scripts/probe_matrix.py` (install Playwright + chromium in
   the job) or port it to JS so the job stays on the Node toolchain already
   present. Porting is preferred if the Python install cost dominates; the
   checks are ~40 lines of `page.evaluate`. If ported, keep the Python script
   working for local use and have both read one shared list of views/checks.
3. **Fail the deploy on regression.** A failed probe must block the Pages
   publish, not just annotate it.
4. Emit the `--json` output as a job artifact so a failure is diagnosable
   without re-running locally.
5. Add `npm run budget` to the same job if it is not already there — bundle
   regressions and layout regressions should fail at the same gate.

**Known headless caveat** (carry it into CI, it is documented in the script):
`device_scale_factor != 1` or `is_mobile=True` stalls the compositor — no rAF,
screenshots hang. Phones are emulated by viewport only, and rAF-dependent widths
rely on the timer fallback in `src/lib/quoteColumns.js`. Do not "fix" this by
enabling mobile emulation.

**Done looks like.** A pull request that reintroduces a wrapping dashboard
toolbar, a horizontal page scroll at 390px, or a misaligned price column fails
CI with a named view and check; the deploy does not publish; the JSON artifact
names the offending view.

**Tests to write first.** The lane's own test is a deliberate regression: add a
temporary commit that wraps the toolbar or restores a fixed price-box width,
confirm the job fails on the right check, then revert. Also unit-test the check
list itself if ported to JS (`test/lib/probe_matrix.test.js`: every view has a
width/height, every check has a name and a message).

**Risk.** Flaky CI is worse than no CI — a matrix that fails at random gets
disabled within a week. Budget for it: fixed viewport sizes, no network beyond
the local server (the app fetches live quotes, so the probe route must tolerate
an empty/failed feed — assert *geometry*, never data), generous but bounded
waits, and a documented retry-once policy before the job is declared failing.

**Files owned:** `.github/workflows/deploy.yml`, `scripts/probe_matrix.py`,
new `scripts/probe_matrix.mjs` (if ported), `test/lib/probe_matrix.test.js`.
**Shared, coordinate:** `package.json` scripts block.

---

## Lane (e) — Design-token consolidation for type sizes

**Why now.** There are 22 distinct arbitrary `text-[Npx]` values across ~727
call sites, from `text-[6.5px]` to `text-[30px]`, including half-pixel steps.
That is not a scale, it is a history. It is also the direct cause of the
original P1 finding: the global mobile 16px form-control guard and tiny-type
floor fight per-element pixel values, which is how the dashboard search box
ended up needing an explicit height. Fixing the vocabulary is a precondition for
ever trusting the mobile floor.

**Scope.** Define a small set of **semantic density tokens** in `@theme` in
`src/styles/main.css` and migrate call sites to them:

- `compact control` — dense toolbar controls, chips, inline marks
- `standard control` — normal buttons, tabs, menu items
- `data row` — table and board row numerics (monospaced, tabular-nums)
- `panel header` — section and panel titles, uppercase micro-labels
- `touch target` — anything that must clear the mobile hit-size floor

Rules:

- Do the migration **with the mobile floor in mind**: keep 16px focus-safe
  inputs on iOS, but constrain their boxes explicitly rather than letting font
  size drive height. A token that a media query overrides on narrow screens is
  fine; a per-element pixel override is not.
- Migrate mechanically and in batches by token, verifying each batch on the
  served matrix. Do not redesign while migrating.
- Genuinely one-off display type (a hero number, `text-[clamp(20px,4vw,32px)]`)
  may stay arbitrary — but each survivor needs a comment saying why.
- Update the design-language section of `CLAUDE.md` in the same run so the
  written rule and the tokens agree.

**Done looks like.** The distinct arbitrary px-valued `text-[...]` count is in
single digits and every survivor is annotated; the five tokens cover every
routine case; `python3 scripts/probe_matrix.py` is clean at all six views; no
row geometry changed on the dashboard, screen board, or watchlists; the mobile
typography tests still pass.

**Tests to write first.** `test/lib/density_tokens.test.js`: the token set is
defined in `main.css`; a bounded allowlist of files may use arbitrary text
sizes and everything outside it must not (this is the ratchet that stops
regression). Keep `mobile_typography.test.js` and `mobile_viewport.test.js`
green throughout — they are the existing contract for the floor.

**Risk.** A pure-visual mass edit with 700+ touch points is where "it looked
fine on my screen" ships a regression. Mitigation is the batch-and-probe rhythm
above, plus landing this lane *after* lane (d) so CI catches what the eye
misses. If (d) is not merged yet, run the probe manually after every batch.

**Files owned:** `src/styles/main.css`, the class-attribute edits across
`src/components/**` and `src/pages/**`, `CLAUDE.md` design section,
`test/lib/density_tokens.test.js`.
**Shared, coordinate:** heavy overlap with lane (a) — schedule (e) to start
after (a) merges, or restrict (e) to files (a) is not moving.

---

## Lane (f) — Semantic tokens for state pills

**Why now.** Run 2 added three new machine states to the UI vocabulary —
`MIRROR` on the wire, `RECOVERING` and `DELAYED` on the feed — on top of the
existing `LIVE` and `DEMO`. They currently live in three separate class maps:
`STATE_CLASS` in `FeedIndicator.jsx`, an inline `{live, mirror, connecting,
demo, error}` map in `wire.jsx`, and the `TONES` map in `StatusPill.jsx`. Three
maps for one concept means the wire's "live" and the feed's "live" can drift
apart, and a user cannot learn one color rule.

**Scope.**

1. One vocabulary, one module. Extend `src/components/StatusPill.jsx` (or a
   sibling `src/lib/stateTokens.js` for the pure mapping) to own the full state
   set: `LIVE`, `MIRROR`, `DEMO`, `PREVIEW`, `RECOVERING`, `DELAYED`, plus the
   existing thesis tones (`FIRED`, `CLEAR`, `WARN`).
2. Keep the existing semantic rule, which is already correct and must not be
   broken: **amber carries feed/connection state; green `up` and red `down` are
   reserved for market direction.** A limping feed must never be mistakable for
   a falling tape. `LIVE` is the one green-adjacent case and only where it
   cannot be read as a price.
3. Migrate `FeedIndicator.jsx`, `wire.jsx`, the nav `PREVIEW` / `DEMO` badges,
   and the thesis watcher onto it.
4. State severity should be ordinal and documented: `LIVE` < `MIRROR` <
   `RECOVERING` < `DELAYED`, so a surface showing two states can pick the
   louder one without inventing a rule locally.
5. Every state pill needs a `title` explaining what it means and, where
   applicable, an age (the mirror already prints snapshot age; the feed chip
   prints reconnect age — keep both).

**Done looks like.** Grepping for a state name finds one class map; the shell
chip, wire header, nav badges, and thesis pills all read from it; a screenshot
of any two surfaces shows the same state rendered identically; no state pill
uses `up`/`down` in a way that could be mistaken for direction.

**Tests to write first.** `test/lib/stateTokens.test.js`: every state in the set
has a tone, a label, and a severity; severity ordering is as documented;
`RECOVERING` and `DELAYED` never map to a direction color; the map is total (an
unknown state falls back to `muted`, not `undefined`). Then assert in
`feed_indicator.test.js` and a `wire_state.test.js` that both surfaces render
from the shared map rather than a local literal.

**Risk.** Low, but the one thing to protect is the amber-not-red rule. A
"delayed feed should be red, it's bad" instinct is exactly the change that makes
a stale feed look like a selloff. If the loudness is insufficient, use weight
and a border, not hue.

**Files owned:** `src/components/StatusPill.jsx`, new `src/lib/stateTokens.js`,
`src/components/FeedIndicator.jsx`, the state-pill blocks in `src/pages/wire.jsx`,
`test/lib/stateTokens.test.js`, `test/lib/wire_state.test.js`.
**Shared, coordinate:** `src/lib/nav.js` badges, and lane (e) for the pill's
own type size.

---

## Merge order and parallelism

- **(a)** and **(d)** can start immediately and in parallel; they share nothing.
- **(b)** is independent of (a) — the wire page is not one of the three
  monoliths — so it can run in parallel from day one.
- **(c)** waits on (a)'s portfolio split.
- **(f)** is small and independent; run it any time.
- **(e)** should merge last, after (a) has finished moving files and (d) is
  catching layout regressions.

A lane is not done until `npx vitest run` is green, `npm run build` succeeds,
`npm run budget` passes, and — for (a), (e), (f) — the served probe matrix is
clean at all six views.
