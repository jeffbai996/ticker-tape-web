# Test suite diet

## Baseline recorded before test changes

Source: `defd1ee`, Node 22.23.3, lockfile dependencies, two CPU affinity slots and two Vitest workers. Every file is named explicitly to respect the collection guard. Dependencies and results use under 1 GB of the local data NVMe; no live service is used.

Command: `npm test -- <all 203 explicit test filenames> --maxWorkers=2 --reporter=json --outputFile=<result.json>` (with two-core CPU affinity).

| Run | Cases | Passed | Failed | Wall seconds |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1924 | 1924 | 0 | 158.40 |
| 2 | 1924 | 1924 | 0 | 135.46 |
| 3 | 1924 | 1924 | 0 | 134.86 |

Median baseline wall time: 135.46 seconds. The baseline measured every file. The previous scripts required explicit filenames and had no fast preset; the new full landing gate explicitly includes every file.

Failures or non-passing cases across the three consecutive runs:

- None observed.

## Twenty slowest tests

Maximum assertion duration across all three JSON reports. Worker and environment startup are additional costs reflected in wall time. These behaviors all remain in the full gate.

| Test | Max milliseconds | Why retained |
| --- | ---: | --- | --- |
| `test/lib/tools.test.js :: executeTool navigate sets the hash for plain views and research` | 3283.64 | Navigation and advertised command/shortcut behavior. |
| `test/lib/research_tabs.test.js :: research tab shortcuts sends every advertised key to the tab that advertises it` | 564.85 | Navigation and advertised command/shortcut behavior. |
| `test/lib/status_strip_drift.test.js :: index strip: stopping the drift hands the resting strip a clean node, not the belt with its stop styles on it` | 426.32 | Rendered UI behavior or persisted data/security contract. |
| `test/worker/crumb.test.js :: Yahoo crumb refresh (IN-0060) does not ask Yahoo again for a crumb right after a refused refresh` | 401.48 | Rendered UI behavior or persisted data/security contract. |
| `test/private_release.test.js :: family release admission rejects abbreviated or different source SHA before any validation or publish` | 369.60 | Immutable release admission, failure ordering and publication safety; fix regression. |
| `test/private_release.test.js :: tailnet release admission validates archived bytes in order before publishing and records provenance` | 325.81 | Immutable release admission, failure ordering and publication safety; fix regression. |
| `test/private_release.test.js :: tailnet release admission defaults build-only to validated output without a publish action` | 320.75 | Immutable release admission, failure ordering and publication safety; fix regression. |
| `test/private_release.test.js :: tailnet release admission rejects abbreviated or different source SHA before any validation or publish` | 296.01 | Immutable release admission, failure ordering and publication safety; fix regression. |
| `test/private_release.test.js :: family release admission validates archived bytes in order before publishing and records provenance` | 295.19 | Immutable release admission, failure ordering and publication safety; fix regression. |
| `test/lib/portfolio_header_actions.test.js :: portfolio heading book actions hides them in the public demo build` | 280.91 | Portfolio actions and public/private data boundary. |
| `test/private_release.test.js :: family release admission does not publish if probe fails` | 267.96 | Immutable release admission, failure ordering and publication safety; fix regression. |
| `test/private_release.test.js :: family release admission defaults build-only to validated output without a publish action` | 262.45 | Immutable release admission, failure ordering and publication safety; fix regression. |
| `test/private_release.test.js :: tailnet release admission does not publish if run build fails` | 255.69 | Immutable release admission, failure ordering and publication safety; fix regression. |
| `test/private_release.test.js :: tailnet release admission does not publish if focused-tests fails` | 254.69 | Immutable release admission, failure ordering and publication safety; fix regression. |
| `test/private_release.test.js :: tailnet release admission does not publish if probe fails` | 249.28 | Immutable release admission, failure ordering and publication safety; fix regression. |
| `test/private_release.test.js :: family release admission does not publish if run build fails` | 248.88 | Immutable release admission, failure ordering and publication safety; fix regression. |
| `test/lib/feed_focus_requests.test.js :: ten minutes of a live board — the request budget adds exactly one extra request per focused tick and no more` | 242.93 | Focused-feed request budget and subscription lifecycle. |
| `test/private_release.test.js :: family release admission requires the focused test runner instead of falling back to a full suite` | 238.02 | Immutable release admission, failure ordering and publication safety; fix regression. |
| `test/private_release.test.js :: family release admission does not publish if ci fails` | 236.78 | Immutable release admission, failure ordering and publication safety; fix regression. |
| `test/private_release.test.js :: tailnet release admission requires the focused test runner instead of falling back to a full suite` | 234.02 | Immutable release admission, failure ordering and publication safety; fix regression. |

## File classification and collected counts

All files are keep: retain financial calculations, signs, unknown values, currency, persistence, security and past-bug assertions. Source-contract files remain existing structural/fix guards; their coverage is distinct from exercising a rendered surface. This pass reduces unnecessary browser setup rather than deleting those checks. No parameter case is sampled. Support files in `test/helpers`, the worker harness and research source reader are keep.

| File | Before / after full | Class | Setup decision |
| --- | ---: | --- | --- |
| `test/compile.test.js` | 4 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/agent.test.js` | 9 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/ai_controls.test.js` | 4 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/ai_report_card.test.js` | 6 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/ai_report_markdown.test.js` | 4 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/aidials.test.js` | 11 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/alertDelivery.test.js` | 7 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/alert_prefill.test.js` | 2 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/alerts.test.js` | 24 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/archive.test.js` | 5 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/backtest.test.js` | 20 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/backtestData.test.js` | 8 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/badges.test.js` | 20 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/bookCards.test.js` | 6 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/bookSort.test.js` | 4 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/bookStats.test.js` | 23 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/briefing.test.js` | 14 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/broker_cards.test.js` | 5 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/broker_currency.test.js` | 25 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/broker_money.test.js` | 3 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/bs.test.js` | 6 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/cap_notices.test.js` | 8 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/cashLedger.test.js` | 23 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/cash_activity.test.js` | 3 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/catalysts.test.js` | 7 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/catgroups.test.js` | 12 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/chartDrawings.test.js` | 25 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/chartScale.test.js` | 16 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/chart_zoom.test.js` | 2 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/chartmath-hit.test.js` | 9 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/chartmath.test.js` | 10 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/chartsuite-drawings.test.js` | 9 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/chartview.test.js` | 2 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/chartview_drawings.test.js` | 15 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/chatClient.test.js` | 3 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/chatFooter.test.js` | 1 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/chatMetrics.test.js` | 3 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/chatTrace.test.js` | 1 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/chat_launchpad.test.js` | 10 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/chat_rail.test.js` | 1 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/chat_text_zoom.test.js` | 8 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/classification.test.js` | 5 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/cloudsave.test.js` | 11 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/cnData.test.js` | 8 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/cnEvents.test.js` | 6 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/cnFinancials.test.js` | 6 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/cnMarkets.test.js` | 4 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/commandbar.test.js` | 7 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/complete.test.js` | 10 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/console_store.test.js` | 5 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/contrast.test.js` | 3 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/cushion.test.js` | 2 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/dashboardLanding.test.js` | 5 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/dashboardRows.test.js` | 11 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/dashboard_row.test.js` | 7 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/dayPnl.test.js` | 9 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/demo.test.js` | 20 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/deviceIdentity.test.js` | 2 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/dialog.test.js` | 31 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/earnings.test.js` | 15 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/eventLinks.test.js` | 22 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/event_workspace.test.js` | 12 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/expmove.test.js` | 17 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/extendedHours.test.js` | 5 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/family_residue.test.js` | 6 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/feed.test.js` | 1 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/feedDerivedQuote.test.js` | 5 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/feedHealth.test.js` | 19 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/feedSymbols.test.js` | 4 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/feed_cadence.test.js` | 6 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/feed_focus.test.js` | 14 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/feed_focus_requests.test.js` | 9 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/feed_freshness.test.js` | 8 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/feed_indicator.test.js` | 7 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/feed_lifecycle.test.js` | 2 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/financial_contract.test.js` | 11 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/financials.test.js` | 5 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/format.test.js` | 26 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/fundamentals.test.js` | 12 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/fx.test.js` | 24 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/heldSymbols.test.js` | 3 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/history.test.js` | 11 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/i18n.test.js` | 14 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/i18n_interface.test.js` | 4 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/idleClock.test.js` | 12 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/idle_cpu.test.js` | 29 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/indicators.test.js` | 15 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/inview.test.js` | 17 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/lazy_chart.test.js` | 18 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/lazy_routes.test.js` | 18 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/lots.test.js` | 5 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/marketColors.test.js` | 6 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/marketState.test.js` | 19 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/marketVisuals.test.js` | 4 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/market_control_rail.test.js` | 1 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/market_deck.test.js` | 12 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/markets.test.js` | 24 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/markets_visual.test.js` | 3 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/marquee.test.js` | 5 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/mobile_search.test.js` | 3 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/mobile_typography.test.js` | 1 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/mobile_viewport.test.js` | 3 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/movers.test.js` | 4 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/myPortfolios.test.js` | 33 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/optionsIntel.test.js` | 28 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/options_ladder.test.js` | 6 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/overlay.test.js` | 10 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/overnightFill.test.js` | 5 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/pcache.test.js` | 7 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/performance.test.js` | 6 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/portfolio_accounts.test.js` | 7 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/portfolio_guard.test.js` | 6 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/portfolio_header_actions.test.js` | 3 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/portfolio_sync.test.js` | 9 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/portfolio_venue_groups.test.js` | 2 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/private_font_build.test.js` | 2 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/publicDemo.test.js` | 2 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/public_parity.test.js` | 5 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/pwa.test.js` | 5 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/quoteColumns.test.js` | 6 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/quoteRenderGate.test.js` | 3 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/railResize.test.js` | 4 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/railstats.test.js` | 12 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/reconcile.test.js` | 17 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/regress.test.js` | 4 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/research_header.test.js` | 4 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/research_pages.test.js` | 5 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/research_split.test.js` | 23 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/research_tabs.test.js` | 12 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/rich.test.js` | 5 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/rollclock.test.js` | 8 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/route.test.js` | 16 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/rowActivation.test.js` | 6 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/screenDefs.test.js` | 34 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/screens.test.js` | 5 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/scrollAnchor.test.js` | 15 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/search.test.js` | 8 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/securityTelemetry.test.js` | 3 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/shell_nav.test.js` | 13 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/sidebarWatchlist.test.js` | 2 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/sparks.test.js` | 26 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/stats.test.js` | 9 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/status_strip_drift.test.js` | 1 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/statusbar_clock.test.js` | 10 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/statusbar_mobile.test.js` | 7 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/symbolSearch.test.js` | 9 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/symbol_re.test.js` | 5 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/tape-loop.test.js` | 1 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/tape.test.js` | 7 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/tapeLists.test.js` | 5 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/tapeLocale.test.js` | 5 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/tape_remeasure.test.js` | 1 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/tapeworthy.test.js` | 9 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/thesis.test.js` | 26 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/thesis_contracts.test.js` | 3 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/thesis_view.test.js` | 8 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/thread_ui.test.js` | 2 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/threads.test.js` | 6 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/tickFlash.test.js` | 20 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/tools.test.js` | 11 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/tradeCsv.test.js` | 7 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/tradeTicket.test.js` | 5 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/trade_form.test.js` | 4 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/useClassifications.test.js` | 2 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/venueCodes.test.js` | 6 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/visibility.test.js` | 7 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/visiblePeak.test.js` | 1 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/vwap.test.js` | 4 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/watchlist.test.js` | 6 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/watchlist_card_navigation.test.js` | 4 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/watchlist_export.test.js` | 3 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/watchlist_sync.test.js` | 3 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/watchlists.test.js` | 4 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/watchorder.test.js` | 6 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/watchsort.test.js` | 7 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/widgets.test.js` | 9 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/wire.test.js` | 43 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/wireFetch.test.js` | 6 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/wire_audio.test.js` | 4 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/wire_layout.test.js` | 11 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/wire_mirror.test.js` | 27 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/wire_recovery.test.js` | 6 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/lib/wirechat.test.js` | 2 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/wirechat_tools.test.js` | 12 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/yahoo.test.js` | 32 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/yahooStream.test.js` | 6 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/lib/zhNames.test.js` | 20 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/private_release.test.js` | 18 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/probe_offline.test.js` | 1 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/test_architecture.test.js` | 15 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/test_scope.test.js` | 9 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/tv/css_compat.test.js` | 15 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/tv/keys.test.js` | 8 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/tv/polyfills.test.js` | 4 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/tv/spatial.test.js` | 13 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/worker/capdoc_history.test.js` | 8 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/worker/crumb.test.js` | 9 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/worker/portfolios.test.js` | 9 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/worker/reader.test.js` | 8 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/worker/security_log.test.js` | 8 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |
| `test/worker/watchlists.test.js` | 13 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/worker/wire.test.js` | 24 | keep | Use Node; tests and imported dependency graph do not require browser globals. |
| `test/worker/worker.test.js` | 12 | keep | Retain jsdom or the existing environment for DOM/storage/component behavior. |

## Fix history and planned scope

Reviewed `git log --format="%h %s" -- test` and per-file history. Every existing test name, assertion and parameter case remains; no replacement is needed. In particular the recent negative-price formatting, −100% day P&L, unknown cushion, previous-close, extended-move and session-calendar fixes stay unchanged. Relevant fix commits touching tests:

- `defd1ee fix: require focused test files in release checks`
- `563cbc3 fix: fmtPrice keeps the minus sign in the 100k-and-up K-notation branch (A31 F3)`
- `46ff7ab fix: dayPnlFromValue returns null on a −100% day instead of NaN/−Infinity (A31 F6)`
- `3e01f12 fix: unknown margin cushion renders muted, never the safe green, beside the runway bar (A31 F4)`
- `49827ee fix: chart-derived fallback quote keeps change/pct null when the previous close is unknown (A31 F5)`
- `9c01b38 fix: session chip tooltip is date-aware — names the next real session instead of phantom weekend edges (A31 F2)`
- `7f989f9 fix: dashboard row prints an unknown extended move as a dash, not a flat green ▲0.0% (A31 F1)`
- `d21a9ee fix(charts): crosshair follows the cursor under the desktop zoom`
- `7318e44 fix: render a bold-only line as a report heading`
- `d860c45 fix(worker): share one Yahoo session across isolates through KV`
- `a7644a2 fix(worker): back off and keep the old crumb when a refresh fails`
- `c2f5b2a fix: feed chip tolerates the slow weekend sweep cadence`
- `eeb8dfa fix: briefing flags carry their name; card no longer reads quotes`
- `81e818c fix: classify unmatched dashboard symbols from company metadata`
- `592c36e fix(worker): allow the www family origin`
- `0c765e2 fix: restore family sync, family deploy and portfolio backup`
- `10adef1 fix: withhold broker arithmetic when account currency is unavailable`
- `35b6411 fix(wire): default to chronological order and separate relevance`
- `4b9193c fix(wire): keep family mirror inside tt-web`
- `7ee889e fix(quotes): visibly mute stale extended-hours prices`
- `2456e97 fix(probe): isolate private browser gates from live services`
- `6436c66 fix(release): gate immutable private builds before publication`
- `0ee118e fix(accounting): retain short position signs across base FX`
- `c1dc1af fix(feed): release alert subscriptions and bound hover warming`
- `a16dbea fix(ci): gate public releases on the full test suite`
- `e9eb6c4 fix: load sparse wire categories`
- `be086a7 fix: the index strip went black after the drift glide finished`
- `a213cce fix: clear the family book the public origin still holds`
- `9a902a0 fix: stop shipping a proprietary font from a public repo`
- `3d36234 fix: keep the family capability out of the public bundle`
- `531df37 fix: preserve ticker tape motion on resize`
- `6915cc2 fix: trade form takes the input event; holdings rest in venue order`
- `e359e77 fix: HK industry from the F10 profile; P&L facts hold one row`
- `a80bdc8 fix: zh names resolve Yahoo share-class tickers (BRK-B)`
- `bc13cb7 fix: mainland industry from the company survey; pace HK lookups`
- `92ebb6c fix: iOS zoom floor on focus only; phone portfolio header rows`
- `b90ca79 fix: only real listings enter a book; cash accounts`
- `2bdeb5d fix: rail cards shrink-proof in sticky scroll column`
- `eb11ac8 fix: right cluster is one balanced group — tape gets the slack`
- `22365f6 fix: no tel-link on grouped prices; foreign quotes wear ccy marks`
- `a30ab47 fix: hair-space grouping; research header spells big prices`
- `63def1e fix: thin space is quote grammar only — account money keeps commas`
- `7b1e721 fix: keycap removed; big prices spell out from mid-width rows`
- `4df2111 fix: harden public worker boundaries`
- `38595b7 fix: keycap hugs zh placeholder, thicker centered slash`
- `462a315 fix: clock chip border reveals on hover only`
- `523d856 fix: console slash chip hugs the measured placeholder`
- `af8dd11 fix(dashboard): remove quote freshness dot`
- `8de8404 fix(markets): reserve range meter labels`
- `3592b3b fix(status): align and quiet the clock chip`
- `3040478 fix(research): restore numbered tab buttons`
- `7fcfd9a fix(chart): scrub extended-hours wick outliers`
- `4199ce2 fix: bound the unknown event kind reaching the badge`
- `60191a3 fix: stop both feed sweep timers when nothing is tracked`
- `fa1e262 fix(options): ATM IV reads one strike, not two off the smile`
- `f0e4679 fix(expmove): price the earnings straddle on one shared strike`
- `d78e1f5 fix(chart): overlays get a bounded vote on the price scale`
- `9189dd9 fix(wire): keep Fragwire-only reads off the public mirror`
- `dd6688d fix(routes): let a failed chunk fetch retry on re-entry`
- `b5a7ec3 fix(ui): reserve red/green for direction, guard a null IV delta`
- `c5ee8fe fix(i18n): make the feed-health tooltip translatable`
- `902c8cb fix(workspaces): anchor the popover on a class that exists`
- `8fc6a1f fix(options): one straddle implementation, one shared strike`
- `2aaf887 fix(portfolio): day P&L follows the session, pre-market is since last close`
- `7ad5866 fix(dashboard): quote columns share one x from 545px up`
- `bdb4411 fix(dashboard): phone ext-hours slot grows to content, no clipped %`
- `c7c4699 fix(research): descriptor return cell is labelled by the visible range`
- `d62404d fix(chart): scrub zero-volume bad-print bars from v8 history`
- `a20478a fix: archive delete is always visible, not hover-only`
- `3af1532 fix: keep chat transcript in place across text-size change`
- `a420988 fix: prioritize active watchlist quotes`
- `c61127d fix: square compact dashboard search`
- `f948b39 fix: lock mobile shell to viewport`
- `03a897a fix: stabilize mobile terminal layout`
- `d63c03e fix(chat): text-size control scales type, not the speech bubbles`
- `42513e7 fix: preserve quotes during mobile name reveal`
- `2d6f611 fix: improve compact dashboard readability`
- `1bc4a15 fix: restore company names on compact rows`
- `f79faf7 fix: tighten dashboard and watchlist interactions`
- `1ba24d1 fix: improve quote display responsiveness`
- `504d7f9 fix:improve-short-range-chart-and-row-spacing`
- `903468c fix: hide research company names at tight zooms`
- `c958cb0 fix: correct research axis and rail presentation`
- `4effadf fix: stabilize research header and chart controls`
- `d6e2b22 fix: repair research dividends and alert icon`
- `2d7f612 fix: preserve chart state and show market time`
- `445eac2 fix: make wire row hover unmistakable`
- `ea388d0 fix: keep wire rail content accessible`
- `dfaf545 fix: keep one wire article expanded`
- `9f3b35a fix: follow browser history navigation`
- `41f57a8 fix: keep chart interval controls together`
- `df9d87e fix: keep percentage changes visually quiet`
- `0a00998 fix: remove chart event markers`
- `3ba0cf2 fix: quiet overnight rows keep their live ON print`
- `3deb29f fix: reveal the company name from the ticker, not the empty space beside it`
- `7a9efa5 fix: board menu anchors to the toolbar on phones, sheet mode gone`
- `34c7a9a fix: silent caps now speak, full-list move no longer eats symbols`
- `41e0f86 fix: glass back to true centering, original markup`
- `bcd02ee fix: restore the svg magnifier, drop the css stand-in`
- `b73c20a fix(dashboard): surface selection controls`
- `d1ff535 fix: center watchlist toolbar icons`
- `c9c6568 fix(wire): restore sidebar zoom threshold`
- `1c876fc fix(wire): bound feed height when rail stacks`
- `7709357 fix(wire): adapt side rail to browser zoom`
- `8a3ca2e fix: show chat rail at desktop widths`
- `ba80d06 fix: make chat sessions reliable`
- `554e9ba fix: junk in the console stays put; tighter strip, louder tabs`
- `3ef7af0 fix: Both view merges legs like the broker card; ship Anthropic Sans`
- `a87c99d fix: markets fits phones; slim create form; 7d earnings stat`
- `fbcbd0a fix: tick flashes obey event time; wrapped quote line left-aligns`
- `9f2820f fix: mobile polish — inline names in open hours, aligned functions`
- `3540dcb fix: mid-zoom company names scroll on hover`
- `ebdf2c4 fix: identity column stops collapsing off screen`
- `1905e06 fix: meter columns hold their grid when data is missing`
- `21d8dd8 fix: oscillators start with the candles, not 34 bars in`
- `843e161 fix: K-notation for KRW-scale prices, columns stay fixed`
- `0c7b50e fix: name the overnight session at first paint, tap-to-reveal on touch`
- `a26ad89 fix: space out tape entries, balance the session label`
- `28c8c2a fix: tighten quote strips and label sessions`
- `3343b97 fix(dashboard): preserve extended-hours quote layout`
- `6b82e22 fix: expand compact company names`
- `19d1c14 fix(dashboard): merge desktop toolbar rows`
- `40c02b8 fix(shell): stabilize mobile ticker tape`
- `480f78d fix(dashboard): smooth live quote return layout`
- `94a0768 fix(dashboard): swap ticker for company name`
- `a70cfe1 fix(chat): preserve sessions and polish overview controls`
- `67741cb fix: show session-correct extended quote`
- `30263d4 fix: GOOG over GOOGL, AH price tick-flash`
- `c177212 fix: set Opus 5 to medium effort`
- `3631ad7 fix: render markdown in chat bubbles, quieter tool-call chips`
- `aed23a8 fix: round-trip gemini thought_signature on tool-call replay`

## Planned cleanup

Assign the Node environment explicitly to statically DOM-free files, retain jsdom for browser-dependent suites, and add bounded full/fast test commands that enumerate explicit file paths. The complete runner remains mandatory in the landing configuration. No production code, dependencies, assertions, snapshots or parameter lists are changed.

## Changes and results

- Merged cases: 0. Shrunk parameter cases: 0. Deleted cases: 0. All 1,924 full-suite test identities and bodies are unchanged.
- Eighty files gained only `// @vitest-environment node`; `compile.test.js` already used Node. Those 81 files do not require a DOM in either the tests or their imported dependency graph. The remaining 122 keep their browser environment.
- `npm run test:fast` runs the 81-file Node tier. The direct Vitest `npm test` entrypoint is retained for landing-tool compatibility. `npm test -- test/path.test.js` continues to select explicit files, using Vitest's own argument parser. The existing scope guard still validates the actual Vitest invocation.
- `npm run test:full` enumerates every current `*.test.js` file explicitly and is mandatory in `.cc-land.json`. New files join it automatically. Every run is bounded to two Vitest workers. No dependency was added, and no production code changed.
- A fresh browser environment per file was unnecessary setup for pure math and source checks. The complete suite is faster while the full gate retains every financial, currency, sign, unknown-value, security, persistence and fix regression. The fast tier contains all cases in its selected files, without sampling.

| Tier | Test files | Passed | Wall seconds |
| --- | ---: | ---: | ---: |
| after-full | 203 | 1924 | 99.39 |
| after-fast | 81 | 731 | 11.54 |

The before measurement covered all 203 files and 1,924 cases. Bare `npm test` continues to require explicit files; the recommended local command is `npm run test:fast`, the 731-case fast tier. The full gate remains 1,924 cases. No failure or flake was observed in the three baselines or the full/fast after measurements. No production bug was exposed, and no service was restarted. The twenty slowest behaviors listed above remain unchanged.

Full-case identity comparison uses a multiset, including duplicate display titles, and confirms all 1,924 cases remain. Source-history review confirms the existing test bodies are byte-for-byte unchanged.

The landing configuration invokes `node test/run-tests.mjs --full` directly so the landing selector retains the complete command. The previous bare `npm test` policy is also honored during this transition.

Final fast-preset verification (`npm run test:fast`) passed all 731 cases in 11.54 seconds wall time. The two-worker limit is also set in Vitest config so direct focused invocations stay bounded.

## Follow-up: full-case local VM execution

Fresh matched baseline at `02ce154`: all 1,924 tests passed in 44.63 seconds wall time with two fresh-process workers. An all-VM experiment took 12.09 seconds but was rejected: the font-build suite needs native Node module-loader registration, and the security-log suite needs native-realm WebCrypto. Their assertions are unchanged.

The local preset uses isolated VM workers for the remaining files and the original process pool for those two native suites. Each test file keeps a fresh VM/window; external dependency startup is reused. Vitest documents the performance and cross-realm tradeoffs at https://vitest.dev/guide/improving-performance . The shipping/landing full gate remains the original fresh-process run. The VM mode is an additional local feedback lane, not a replacement gate.

Follow-up coverage check: the VM group passed 1,914 cases with shuffled file order (seed 137), and the two native suites passed their 10 cases. A multiset comparison with the fresh-process baseline accounts for all 1,924 cases exactly once. Combined wall time was 13.25 seconds versus 44.63 seconds in the matched baseline. No test was omitted, deleted, sampled or weakened; no dependency or production code changed. The native shipping gate remains mandatory. The local preset must not replace it because VM workers share externalized dependency state and have different native API interop.

The actual `npm run test:local` preset also passed both phases (1,914 + 10 cases), with native isolation retained for the two compatibility suites.

## Follow-up: remove remaining browser startup from pure tests

Source `299be3c`. A fresh full baseline passed all 1,924 cases in **47.14
seconds wall time**. The earlier three-run baseline and fix-history survey
above still apply to these unchanged test bodies. The native threads-pool
experiment also passed every case, but took 48.55 seconds, so it was rejected.
The process pool, isolation, two-worker limit and complete landing gate stay.

Fifty more pure parsing, calculation, data and source-contract suites now use
Node instead of starting jsdom. The only test-file changes are environment
header lines; every body and assertion is byte-identical. Five candidates
(cloudsave, cnEvents, cnFinancials, fundamentals and history) need browser
storage through their imports and retain jsdom. Their assertions were not
relaxed to fit another environment. No application bug was exposed.

The complete suite remains 203 files / 1,924 cases. A shuffled full run (seed
137) passed every case in **33.52 seconds**, with exactly the same multiset of
case identities as the baseline. No money, FX, signs, missing-versus-zero,
security or fixed-bug case was deleted, merged, sampled or omitted. The full
process-based suite remains the gate; the VM local preset retains its two
native-process exceptions. The normal complete command also passed every case
in **35.11 seconds wall** (about 26% below the matched baseline). The all-case
local VM/native preset passed 1,914 plus 10 cases in **13.00 seconds**. The final
landing receipt is recorded in the task report.

The Node-only fast tier now selects 131 files / 1251 cases.

| File | Cases before / after | Class | Setup change |
| --- | ---: | --- | --- |
| `test/tv/css_compat.test.js` | 15 / 15 | keep | Pure test uses Node; no jsdom startup. |
| `test/worker/crumb.test.js` | 9 / 9 | keep | Pure test uses Node; no jsdom startup. |
| `test/worker/reader.test.js` | 8 / 8 | keep | Pure test uses Node; no jsdom startup. |
| `test/worker/security_log.test.js` | 8 / 8 | keep | Pure test uses Node; no jsdom startup. |
| `test/worker/worker.test.js` | 12 / 12 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/backtest.test.js` | 20 / 20 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/badges.test.js` | 20 / 20 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/chartDrawings.test.js` | 25 / 25 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/chartScale.test.js` | 16 / 16 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/chartview.test.js` | 2 / 2 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/chartview_drawings.test.js` | 15 / 15 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/chat_launchpad.test.js` | 10 / 10 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/classification.test.js` | 5 / 5 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/cnData.test.js` | 8 / 8 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/commandbar.test.js` | 7 / 7 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/console_store.test.js` | 5 / 5 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/dayPnl.test.js` | 9 / 9 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/deviceIdentity.test.js` | 2 / 2 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/earnings.test.js` | 15 / 15 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/eventLinks.test.js` | 22 / 22 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/feed.test.js` | 1 / 1 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/feedDerivedQuote.test.js` | 5 / 5 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/feedHealth.test.js` | 19 / 19 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/feed_cadence.test.js` | 6 / 6 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/feed_focus.test.js` | 14 / 14 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/financials.test.js` | 5 / 5 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/i18n_interface.test.js` | 4 / 4 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/idleClock.test.js` | 12 / 12 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/marketColors.test.js` | 6 / 6 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/market_deck.test.js` | 12 / 12 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/markets.test.js` | 24 / 24 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/marquee.test.js` | 5 / 5 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/portfolio_accounts.test.js` | 7 / 7 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/private_font_build.test.js` | 2 / 2 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/pwa.test.js` | 5 / 5 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/railResize.test.js` | 4 / 4 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/reconcile.test.js` | 17 / 17 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/research_pages.test.js` | 5 / 5 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/securityTelemetry.test.js` | 3 / 3 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/symbolSearch.test.js` | 9 / 9 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/tapeworthy.test.js` | 9 / 9 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/thesis.test.js` | 26 / 26 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/visibility.test.js` | 7 / 7 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/visiblePeak.test.js` | 1 / 1 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/watchlist_export.test.js` | 3 / 3 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/wireFetch.test.js` | 6 / 6 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/wirechat_tools.test.js` | 12 / 12 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/yahoo.test.js` | 32 / 32 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/yahooStream.test.js` | 6 / 6 | keep | Pure test uses Node; no jsdom startup. |
| `test/lib/zhNames.test.js` | 20 / 20 | keep | Pure test uses Node; no jsdom startup. |

All other classifications and counts above remain unchanged. No dependency,
production file, assertion, snapshot or case list changed.

## Deferred navigation and overlay effects

At `3abea99`, a focused run passes 21 cases: `test/lib/tools.test.js` has 11
cases and spends 3.29 s in test execution (3.28 s in navigation);
`test/lib/overlay.test.js` has 10 cases and spends 0.51 s. Both files are
**keep**. Navigation covers a real deferred URL change. Overlay covers focus
entry/return, keyboard and backdrop dismissal, scroll locking, labels and
motion preferences. Earlier bug coverage remains under the same names.

The planned test-only change uses Vitest timers to exercise the full navigation
delay, including its exact boundary, and Preact's existing `act` helper to flush
render/effect work. No new dependency, production edit, case deletion, merge or
shrinking is involved. The native complete-suite gate remains unchanged.

Focused native validation passes all 21 original cases. Measured test execution
falls from 3.80 s combined to 0.038 s (tools 3.288 -> 0.008 s; overlay
0.513 -> 0.030 s), excluding process startup. A shuffled native run also
passes. The navigation test now asserts the URL has not changed one millisecond
before each deadline and has changed exactly at it. Overlay assertions run
after the actual render/effect queue has drained, including unmount cleanup;
no effect, focus, keyboard, scroll-lock or reduced-motion assertion is dropped.
