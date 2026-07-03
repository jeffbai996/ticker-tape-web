import { NAV, DEFAULT_SECTION, findSection } from './nav.js'

// Hash routing (#/section/sub) rather than path routing: GitHub Pages has no
// server-side rewrites, so deep links on a path router would 404 at the CDN.

export function parseHash(hash) {
  const parts = (hash || '')
    .replace(/^#\/?/, '')
    .toLowerCase()
    .split('/')
    .filter(Boolean)

  const section = findSection(parts[0]) ? parts[0] : DEFAULT_SECTION
  const subs = findSection(section)?.subs || []
  const sub = subs.some((s) => s.id === parts[1]) ? parts[1] : null

  // An unknown section swallows whatever came after it.
  return section === parts[0] ? { section, sub } : { section: DEFAULT_SECTION, sub: null }
}

export function hrefFor(section, sub) {
  if (section === DEFAULT_SECTION && !sub) return '#/'
  return sub ? `#/${section}/${sub}` : `#/${section}`
}

export { NAV, DEFAULT_SECTION }
