// Information architecture: six top-level sections (HANDOFF_SPEC §3).
// Sub-tabs switch content within a section without a page reload.
// Research is a slide-over drawer in the final design (Phase 4); it gets a
// plain page slot until the drawer pattern lands.

export const NAV = [
  { id: 'dashboard', label: 'Dashboard', subs: [] },
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
      { id: 'timeline', label: 'Timeline' },
    ],
  },
  {
    id: 'screen',
    label: 'Screening',
    subs: [
      { id: 'compare', label: 'Compare' },
      { id: 'correlation', label: 'Correlation' },
      { id: 'valuation', label: 'Valuation' },
    ],
  },
  { id: 'alerts', label: 'Alerts', subs: [] },
  { id: 'chat', label: 'AI Chat', subs: [] },
]

export const DEFAULT_SECTION = 'dashboard'

export function findSection(id) {
  return NAV.find((s) => s.id === id) || null
}
