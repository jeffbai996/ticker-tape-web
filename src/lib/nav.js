// Top-level information architecture. Sub-tabs switch content within a section
// without a page reload; research intentionally uses its own routed page.

// The assistant runtime stays private, but the public demo keeps the surface
// in the information architecture so it does not present a cut-down product.
// Its route renders an inert preview and never calls the model service.
const PRIVATE_BUILD = import.meta.env.VITE_PRIVATE === '1'
// The family instance is a working tool for a person who
// never asked for AI copy — the briefing section is dropped whole there
// (Jeff 2026-08-20).
const FAMILY_BUILD = import.meta.env.VITE_FAMILY_BUILD === '1'

const CHAT_SECTION = {
  id: 'chat', label: 'AI Chat', subs: [],
  ...(PRIVATE_BUILD ? {} : { badge: 'PREVIEW' }),
}

export const NAV = [
  { id: 'dashboard', label: 'Dashboard', subs: [] },
  { id: 'watchlists', label: 'Watchlists', subs: [] },
  { id: 'brief', label: 'Briefing', badge: 'AI', subs: [] },
  {
    id: 'markets',
    label: 'Markets',
    landingLabel: 'Indices',
    subs: [
      { id: 'commodities', label: 'Commodities' },
      { id: 'movers', label: 'Movers' },
      { id: 'sectors', label: 'Sectors' },
      { id: 'heatmap', label: 'Heatmap' },
      { id: 'earnings', label: 'Earnings' },
      { id: 'calendar', label: 'Calendar' },
    ],
  },
  // 'research' dropped from the nav (Jeff 2026-08-10): the landing page
  // only mirrored the per-ticker tabs — every real entry point (search,
  // palette, terminal, tape) deep-links straight to #/research/<sym>,
  // which still routes fine without a sidebar item.
  {
    id: 'portfolio',
    label: 'Portfolio',
    badge: 'DEMO',
    subs: [
      { id: 'mine', label: 'My Portfolios' },
      { id: 'holdings', label: 'Holdings' },
      { id: 'ledger', label: 'Ledger' },
      { id: 'events', label: 'Events' },
      { id: 'performance', label: 'Performance' },
      { id: 'news', label: 'News' },
      { id: 'account', label: 'Account' },
      { id: 'sizing', label: 'Sizing' },
      { id: 'carry', label: 'Carry' },
      { id: 'cockpit', label: 'Cockpit' },
      { id: 'whatif', label: 'What-if' },
      { id: 'trades', label: 'Trades' },
      { id: 'timetravel', label: 'Time travel' },
      { id: 'thesis', label: 'Thesis Watcher' },
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
      { id: 'dividends', label: 'Dividends' },
      { id: 'signals', label: 'Signals' },
    ],
  },
  { id: 'alerts', label: 'Alerts', subs: [] },
  { id: 'wire', label: 'Wire', badge: 'DEMO', subs: [] },
  CHAT_SECTION,
  // phone-only: the console as its own page in the chin (desktop has the
  // floating panel). Sidebar/desktop nav skips `phoneOnly` entries.
  { id: 'console', label: '>_', subs: [], phoneOnly: true }
]

// The private build isn't a demo: the portfolio is real (fragwire fronts the
// gateway) and the wire is the operator's own — the showcase badges only
// make sense on the public origin.
if (PRIVATE_BUILD) for (const s of NAV) delete s.badge
if (PRIVATE_BUILD) {
  // the broker book IS the portfolio here; the hand-built pages that only
  // mean something with a manual book (table, ledger, 净值) step aside —
  // 我的组合 still reaches them, and 分红财报 / 新闻 read the broker book
  // (Jeff 2026-08-22: "bunch of these new features don't work on our copy")
  const portfolio = NAV.find((s) => s.id === 'portfolio')
  portfolio.subs = portfolio.subs.filter((sub) => !['holdings', 'ledger', 'performance'].includes(sub.id))
}
if (FAMILY_BUILD) NAV.splice(NAV.findIndex((s) => s.id === 'brief'), 1)
if (FAMILY_BUILD) {
  // no brokerage will ever be wired here — the broker-book tabs (account,
  // sizing, carry, cockpit…) would all render a synthetic book that only
  // confuses (Jeff 2026-08-20)
  const portfolio = NAV.find((s) => s.id === 'portfolio')
  // the hand-built books are the whole portfolio here, split into pages
  // (Jeff 2026-08-22: "split the manual demo portfolio section into pages
  // again, like a news page that grabs news relating to his tickers")
  // the section landing IS the overview (nav adds the landing entry
  // itself — a 'mine' sub here rendered a second "overview", Jeff 2026-08-22)
  portfolio.subs = [
    { id: 'holdings', label: 'Holdings' },
    { id: 'ledger', label: 'Trades' },
    { id: 'events', label: 'Events' },
    { id: 'performance', label: 'Performance' },
    { id: 'news', label: 'News' },
  ]
  delete portfolio.badge
}

export const IS_PRIVATE_BUILD = PRIVATE_BUILD
export const IS_FAMILY_BUILD = FAMILY_BUILD

export const DEFAULT_SECTION = 'dashboard'

export function findSection(id) {
  return NAV.find((s) => s.id === id) || null
}
