// Dashboard category groups — which sections are folded and what order they
// sit in. Same shape as widgets.js: persisted per-browser, listeners notify
// the view. The group *membership* stays derived from BUCKETS; only the
// presentation preferences live here.

const KEY = 'dash_groups_v1'

const listeners = new Set()
export function onGroupsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const EMPTY = { collapsed: [], order: [] }

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (raw && Array.isArray(raw.collapsed) && Array.isArray(raw.order)) return raw
  } catch { /* corrupt state falls back to defaults */ }
  return { ...EMPTY }
}

function save(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch { /* quota — preferences just won't persist */ }
  for (const fn of listeners) fn(prefs)
}

export function getGroupPrefs() {
  return load()
}

export function isCollapsed(name, prefs = load()) {
  return prefs.collapsed.includes(name)
}

export function toggleCollapsed(name) {
  const prefs = load()
  const collapsed = prefs.collapsed.includes(name)
    ? prefs.collapsed.filter((n) => n !== name)
    : [...prefs.collapsed, name]
  save({ ...prefs, collapsed })
}

/**
 * Pure: apply a saved order to the derived group list. Names present in the
 * order come first in that sequence; anything the order doesn't mention (a
 * new bucket, a renamed one) keeps its natural position at the end rather
 * than disappearing.
 */
export function orderGroups(groups, order = []) {
  const known = groups.filter((g) => order.includes(g.name))
  known.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
  return [...known, ...groups.filter((g) => !order.includes(g.name))]
}

/**
 * Move a group one slot up (dir=-1) or down (dir=+1). Seeds the saved order
 * from the currently-rendered names, so the first drag on a virgin profile
 * moves relative to what the user actually sees.
 */
export function moveGroup(name, dir, names) {
  const prefs = load()
  const order = prefs.order.length ? [...prefs.order] : [...names]
  for (const n of names) if (!order.includes(n)) order.push(n)
  const i = order.indexOf(name)
  const j = i + dir
  if (i < 0 || j < 0 || j >= order.length) return
  ;[order[i], order[j]] = [order[j], order[i]]
  save({ ...prefs, order })
}
