// Binds the pure workspace schema (workspaces.js) to this app's live board
// state. Two consumers need the same binding — the `ws` console verb, which
// runs with no dashboard mounted, and the toolbar control, which runs with one
// — so the localStorage key names and the widget store live here once instead
// of being retyped on either side.
//
// Applying never reloads: it writes the same preference keys the board's own
// controls write, replaces the widget rail through its store (which notifies
// the dashboard), moves the hash, and fires `tape:workspace` so a mounted
// dashboard can pull the new values into component state mid-session. Quotes
// are untouched by all of it.

import { getWidgets, setWidgets } from './widgets.js'
import { parseHash } from './route.js'
import { rememberDashboardLanding } from './dashboardLanding.js'
import { applyWorkspace, captureWorkspace, setActiveWorkspace } from './workspaces.js'

export const WORKSPACE_EVENT = 'tape:workspace'

const VIEW_MODE_KEY = 'dashboard_view_mode_v1'
const SPARK_KEY = 'dashboard_spark_v1'
const SPARK_WINDOW_KEY = 'dashboard_spark_window_v1'
const LANDING_KEY = 'dashboard_landing_v1'

/** Sort is remembered per list, exactly as the dashboard does it. */
export function sortKey(listId) {
  return listId ? `dashboard_sort_v1:${listId}` : 'dashboard_sort_v1'
}

const get = (key) => {
  try { return localStorage.getItem(key) } catch { return null }
}
const set = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* quota — layout just won't persist */ }
}

/** Where the board is pointed right now, read from storage and the hash so it
 *  works whether or not the dashboard is mounted. */
export function boardGetters(overrides = {}) {
  const route = () => parseHash(typeof location === 'undefined' ? '' : location.hash)
  const listId = () => {
    const parsed = route()
    if (parsed.section === 'watchlists' && parsed.sub) return parsed.sub
    const landing = get(LANDING_KEY)
    return landing && landing !== 'main' ? landing : null
  }
  return {
    listId,
    viewMode: () => get(VIEW_MODE_KEY),
    sort: () => get(sortKey(listId())),
    spark: () => get(SPARK_KEY),
    sparkWindow: () => get(SPARK_WINDOW_KEY),
    widgets: () => getWidgets(),
    marketView: () => (route().section === 'markets' ? route().sub : null),
    researchSymbol: () => (route().section === 'research' ? route().sub : null),
    ...overrides,
  }
}

/**
 * Persisting setters. `live` lets a mounted surface add its component setters
 * (setSpark, setViewMode…) so state moves without waiting for a remount; the
 * persisted write still happens because these run first.
 */
export function boardSetters(live = {}) {
  let pendingList = null
  return {
    setListId: (id) => { pendingList = id; rememberDashboardLanding(id); live.setListId?.(id) },
    setViewMode: (mode) => { set(VIEW_MODE_KEY, mode); live.setViewMode?.(mode) },
    setSort: (value) => { set(sortKey(pendingList), value); live.setSort?.(value) },
    setSpark: (type) => { set(SPARK_KEY, type); live.setSpark?.(type) },
    setSparkWindow: (id) => { set(SPARK_WINDOW_KEY, id); live.setSparkWindow?.(id) },
    setWidgets: (list) => { setWidgets(list); live.setWidgets?.(list) },
    navigate: live.navigate || ((hash) => {
      if (typeof location !== 'undefined' && location.hash !== hash) location.hash = hash
    }),
  }
}

/** Snapshot the live board under a name. `overrides` lets a mounted surface
 *  hand in the component state it's showing right now (props beat the
 *  persisted copy by one render — see boardGetters). */
export function captureBoard(name, overrides = {}) {
  return captureWorkspace(boardGetters(overrides), name)
}

/** Apply a saved workspace to the running app. Returns the applied fields. */
export function applyToBoard(ws, live = {}) {
  const applied = applyWorkspace(ws, boardSetters(live))
  setActiveWorkspace(ws?.name || null)
  try {
    dispatchEvent(new CustomEvent(WORKSPACE_EVENT, { detail: ws }))
  } catch { /* no window (node) — the persisted keys still landed */ }
  return applied
}
