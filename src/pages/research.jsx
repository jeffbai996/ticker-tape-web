// Research is a lane, not a file (design audit P1 — "four pages have become
// feature monoliths"). This shell owns routing, the sticky header rail, and
// composing the routed subview; every subview and its stateful controllers
// live in src/pages/research/*.
import { useState } from 'preact/hooks'
import { useFocusedSymbols, useQuotes } from '../hooks.js'
import { ChartSuite } from '../components/ChartSuite.jsx'
import { ResearchHeader } from './research/header.jsx'
import { Overview, SymbolPrompt } from './research/overview.jsx'
import { SymbolNewsView } from './research/news.jsx'
import { OptionsView } from './research/options.jsx'
import { EarningsView } from './research/earnings.jsx'
import { AnalystsView } from './research/analysts.jsx'
import { FinancialsView } from './research/financials.jsx'
import { OwnershipView } from './research/ownership.jsx'
import { FilingsView } from './research/filings.jsx'
import { ProfileView } from './research/profile.jsx'
import { DividendsView } from './research/dividends.jsx'
import { useResearchChart } from './research/useResearchChart.js'
import { useResearchKeys } from './research/useResearchKeys.js'

export function Research({ route }) {
  const symbol = route.sub
  useResearchKeys(symbol, route)
  const chart = useResearchChart(symbol)
  // Header quote comes from the live 1D feed — a multi-month chart fetch
  // reports change vs the range START (chartPreviousClose), not yesterday.
  const live = useQuotes(symbol ? [symbol] : [])
  // The open symbol IS the viewport here — no observer, nothing to measure.
  // Declaring it puts this one row in the first quote chunk, ahead of the
  // dashboard board still tracked behind this route, and on the fast sweep.
  useFocusedSymbols(symbol ? [symbol] : [])
  // the mobile rail's state lives above the no-symbol early return so the
  // hook order can't shift when the landing page renders instead
  const [railOpen, setRailOpen] = useState(false)

  if (!symbol) return <SymbolPrompt />

  const q = live[symbol]?.quote

  return (
    <div class="@container flex-1 p-3 select-text min-w-0">
      <ResearchHeader symbol={symbol} q={q} route={route} />

      {chart.err && (
        <div class="mx-1 mb-2 px-3 py-2 bg-surface-1 border border-down/40 rounded-lg font-mono text-[11px] text-down">
          {chart.err} — check the symbol or try again
        </div>
      )}

      {route.view === 'options' ? (
        <OptionsView symbol={symbol} />
      ) : route.view === 'intraday' ? (
        <ChartSuite symbol={symbol} />
      ) : route.view === 'earnings' ? (
        <EarningsView symbol={symbol} />
      ) : route.view === 'holders' || route.view === 'insider' || route.view === 'ownership' ? (
        <OwnershipView symbol={symbol} />
      ) : route.view === 'financials' ? (
        <FinancialsView symbol={symbol} />
      ) : route.view === 'filings' ? (
        <FilingsView symbol={symbol} />
      ) : route.view === 'wire' || route.view === 'news' ? (
        <SymbolNewsView symbol={symbol} name={q?.name} />
      ) : route.view === 'dividends' ? (
        <DividendsView symbol={symbol} />
      ) : route.view === 'profile' ? (
        <ProfileView symbol={symbol} />
      ) : route.view === 'analysts' ? (
        <AnalystsView symbol={symbol} />
      ) : (
        <Overview symbol={symbol} chart={chart} railOpen={railOpen} setRailOpen={setRailOpen} />
      )}
    </div>
  )
}
