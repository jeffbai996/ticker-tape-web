import { NAV, DEFAULT_SECTION, findSection } from './nav.js'

// Hash routing (#/section/sub) rather than path routing: GitHub Pages has no
// server-side rewrites, so deep links on a path router would 404 at the CDN.

const SYMBOL_RE = /^[a-z0-9.^=-]{1,12}$/
const WATCHLIST_RE = /^[a-z0-9-]{1,40}$/

export function parseHash(hash) {
  const parts = (hash || '')
    .replace(/^#\/?/, '')
    .toLowerCase()
    .split('/')
    .filter(Boolean)

  // The first watchlists release nested the feature beneath Dashboard. Keep
  // those saved/deep links working while exposing the canonical top-level IA.
  if (parts[0] === 'dashboard' && parts[1]) {
    if (parts[1] === 'watchlists') return { section: 'watchlists', sub: null }
    if (WATCHLIST_RE.test(parts[1])) return { section: 'watchlists', sub: parts[1] }
  }

  // Research routes by deep link only — it has no NAV entry (the landing
  // page just mirrored the per-ticker tabs, Jeff 2026-08-10), so it must be
  // recognized before the NAV-membership gate.
  if (parts[0] === 'research') {
    const sym = parts[1] && SYMBOL_RE.test(parts[1]) ? parts[1].toUpperCase() : null
    const view = sym && ['options', 'intraday', 'insider', 'earnings', 'analysts', 'holders', 'filings', 'profile', 'wire', 'news', 'dividends', 'financials', 'ownership'].includes(parts[2]) ? parts[2] : null
    return { section: 'research', sub: sym, view }
  }

  const section = findSection(parts[0]) ? parts[0] : DEFAULT_SECTION
  if (section !== parts[0]) return { section: DEFAULT_SECTION, sub: null }

  // Saved watchlist ids are data, so they cannot be enumerated in static NAV.
  if (section === 'watchlists') {
    const sub = parts[1] && WATCHLIST_RE.test(parts[1]) ? parts[1] : null
    return { section, sub }
  }

  // A tape headline links straight at its story: #/wire/<event id>. The wire
  // has no registered subs, so the id would otherwise be dropped on the floor.
  if (section === 'wire') {
    return { section, sub: /^\d{1,12}$/.test(parts[1] || '') ? parts[1] : null }
  }

  const subs = findSection(section)?.subs || []
  const sub = subs.some((s) => s.id === parts[1]) ? parts[1] : null
  return { section, sub }
}

export function hrefFor(section, sub) {
  if (section === DEFAULT_SECTION && !sub) return '#/'
  return sub ? `#/${section}/${sub}` : `#/${section}`
}

export { NAV, DEFAULT_SECTION }
