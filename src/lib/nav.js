// Top-level information architecture. Sub-tabs switch content within a section
// without a page reload; research intentionally uses its own routed page.

// The assistant runs on the operator's own Claude/agy subscription through
// fragwire, so it only exists in the private tailnet build — a public origin
// must not expose a subscription-backed endpoint (Jeff 2026-08-04).
const PRIVATE_BUILD = import.meta.env.VITE_PRIVATE === '1'

const CHAT_SECTION = { id: 'chat', label: 'AI Chat', subs: [] }

export const NAV = [
  { id: 'dashboard', label: 'Dashboard', subs: [] },
  { id: 'watchlists', label: 'Watchlists', subs: [] },
  { id: 'brief', label: 'Briefing', badge: 'AI', subs: [] },
  {
    id: 'markets',
    label: 'Markets',
    subs: [
      { id: 'movers', label: 'Movers' },
      { id: 'sectors', label: 'Sectors' },
      { id: 'heatmap', label: 'Heatmap' },
      { id: 'commodities', label: 'Commodities' },
      { id: 'earnings', label: 'Earnings' },
      { id: 'calendar', label: 'Calendar' },
    ],
  },
  { id: 'research', label: 'Research', subs: [] },
  {
    id: 'portfolio',
    label: 'Portfolio',
    badge: 'DEMO',
    subs: [
      { id: 'account', label: 'Account' },
      { id: 'sizing', label: 'Sizing' },
      { id: 'carry', label: 'Carry' },
      { id: 'cockpit', label: 'Cockpit' },
      { id: 'whatif', label: 'What-if' },
      { id: 'trades', label: 'Trades' },
      { id: 'timetravel', label: 'Time travel' },
      { id: 'thesis', label: 'Thesis' },
      { id: 'timeline', label: 'Timeline' },
      { id: 'backtest', label: 'Backtest' },
    ],
  },
  {
    id: 'screen',
    label: 'Screening',
    subs: [
      { id: 'compare', label: 'Compare' },
      { id: 'technicals', label: 'Technicals' },
      { id: 'correlation', label: 'Correlation' },
      { id: 'valuation', label: 'Valuation' },
    ],
  },
  { id: 'alerts', label: 'Alerts', subs: [] },
  { id: 'wire', label: 'Wire', badge: 'BYO', subs: [] },
]

if (PRIVATE_BUILD) NAV.push(CHAT_SECTION)

// The private build isn't a demo: the portfolio is real (fragwire fronts the
// gateway) and the wire is the operator's own — the showcase badges only
// make sense on the public origin.
if (PRIVATE_BUILD) for (const s of NAV) delete s.badge

export const IS_PRIVATE_BUILD = PRIVATE_BUILD

export const DEFAULT_SECTION = 'dashboard'

export function findSection(id) {
  return NAV.find((s) => s.id === id) || null
}
