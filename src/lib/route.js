import { NAV, DEFAULT_SECTION, findSection } from './nav.js'

// Hash routing (#/section/sub) rather than path routing: GitHub Pages has no
// server-side rewrites, so deep links on a path router would 404 at the CDN.

const SYMBOL_RE = /^[a-z0-9.^=-]{1,12}$/

export function parseHash(hash) {
  const parts = (hash || '')
    .replace(/^#\/?/, '')
    .toLowerCase()
    .split('/')
    .filter(Boolean)

  const section = findSection(parts[0]) ? parts[0] : DEFAULT_SECTION
  if (section !== parts[0]) return { section: DEFAULT_SECTION, sub: null }

  // Research's sub-path is a free-form ticker, not a registered tab.
  if (section === 'research') {
    const sym = parts[1] && SYMBOL_RE.test(parts[1]) ? parts[1].toUpperCase() : null
    return { section, sub: sym }
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
