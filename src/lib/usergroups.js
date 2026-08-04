// User-defined watchlist groups (CLI `group` parity). A group is a named set
// of symbols that renders as its own dashboard bucket, claiming its members
// away from the built-in BUCKETS. Persisted per browser, like the watchlist.

const KEY = 'user_groups_v1'
const NAME_RE = /^[\w-]{1,24}$/
const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/

const listeners = new Set()

export function onUserGroupsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** @returns {Record<string, string[]>} name → symbols, insertion-ordered. */
export function loadUserGroups() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
  } catch { /* corrupt state = no groups */ }
  return {}
}

function persist(groups) {
  try {
    localStorage.setItem(KEY, JSON.stringify(groups))
  } catch { /* best-effort */ }
  for (const fn of listeners) fn(groups)
}

/** Create or overwrite a group. Returns cleaned symbols, or null if invalid. */
export function saveUserGroup(name, symbols) {
  if (!NAME_RE.test(name || '')) return null
  const cleaned = [...new Set(
    (symbols || []).map((s) => (s || '').trim().toUpperCase()).filter((s) => SYMBOL_RE.test(s)),
  )]
  if (!cleaned.length) return null
  const groups = loadUserGroups()
  groups[name] = cleaned
  persist(groups)
  return cleaned
}

/** Delete a group. Returns true if it existed. */
export function removeUserGroup(name) {
  const groups = loadUserGroups()
  if (!(name in groups)) return false
  delete groups[name]
  persist(groups)
  return true
}
