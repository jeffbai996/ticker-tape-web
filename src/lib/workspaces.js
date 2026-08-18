// Saved workspaces — a handful of named board layouts ("opening", "research",
// "event day") the terminal can snap between, plus the versioned export/import
// of layout preferences the design audit asked for (P2: "persistence is
// fragmented").
//
// Two hard rules shape this module:
//
//  1. A workspace is LAYOUT, never DATA. It records which watchlist the board
//     points at, how rows are grouped and sorted, which spark shape/window the
//     rows draw, which rail widgets are up, and optionally a market subview or
//     a research symbol. It never records quotes, positions, payloads, tokens
//     or endpoints — applying one must not disturb a live feed, it just moves
//     switches the user could have flipped by hand.
//  2. Everything crossing the storage boundary is re-validated. Saved state is
//     attacker-shaped input (another tab, a pasted import file), so both
//     normalizeLayout and importPreferences work off explicit allowlists and
//     drop anything they do not recognise rather than passing it through.
//
// Pure module: it owns its own localStorage keys and takes getters/setters
// from whichever surface calls it, so the dashboard, the command bar and the
// tests all drive the same code with different plumbing.

import { SYMBOL_ANY_CASE_RE } from './symbols.js'
import { WIDGET_TYPES } from './widgets.js'
import { isSparkType, isSparkWindow } from './sparks.js'
import { NAV } from './nav.js'

export const WORKSPACE_VERSION = 1
export const PREFERENCES_VERSION = 1
export const MAX_WORKSPACES = 12
export const MAX_LAYOUT_WIDGETS = 12

const KEY = 'workspaces_v1'
export const ACTIVE_KEY = 'workspace_active_v1'
const MAX_NAME = 32
const LIST_ID_RE = /^[a-z0-9-]{1,40}$/
const SORTS = ['manual', 'symbol', 'change', 'price', 'spread']
const VIEW_MODES = ['grouped', 'flat']
const MARKET_VIEWS = (NAV.find((s) => s.id === 'markets')?.subs || []).map((s) => s.id)

const listeners = new Set()

export function onWorkspacesChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function cleanWorkspaceName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME)
}

// ─── schema ────────────────────────────────────────────────────────────────

/** Every field a workspace may carry, with the only test that lets it in. */
const FIELDS = {
  listId: (v) => (v == null ? null : (typeof v === 'string' && LIST_ID_RE.test(v) ? v : null)),
  viewMode: (v) => (VIEW_MODES.includes(v) ? v : null),
  sort: (v) => (SORTS.includes(v) ? v : null),
  spark: (v) => (typeof v === 'string' && isSparkType(v) ? v : null),
  sparkWindow: (v) => (typeof v === 'string' && isSparkWindow(v) ? v : null),
  widgets: (v) => (Array.isArray(v) ? cleanWidgets(v) : null),
  marketView: (v) => (MARKET_VIEWS.includes(v) ? v : null),
  researchSymbol: (v) => (typeof v === 'string' && SYMBOL_ANY_CASE_RE.test(v.trim())
    ? v.trim().toUpperCase() : null),
}

function cleanWidgets(list) {
  const out = []
  for (const w of list) {
    if (!w || !WIDGET_TYPES.includes(w.type)) continue
    if (w.type === 'chart') {
      const sym = String(w.symbol || '').trim()
      if (!SYMBOL_ANY_CASE_RE.test(sym)) continue
      out.push({ type: 'chart', symbol: sym.toUpperCase() })
    } else {
      out.push({ type: w.type })
    }
    if (out.length >= MAX_LAYOUT_WIDGETS) break
  }
  return out
}

/** Keep only recognised, valid layout fields. Unknown keys are dropped, not
 *  copied — this is the gate that stops a tampered store or a pasted import
 *  from smuggling an endpoint or a token into applied state. */
export function normalizeLayout(raw) {
  const layout = {}
  if (!raw || typeof raw !== 'object') return layout
  for (const [field, check] of Object.entries(FIELDS)) {
    if (!Object.hasOwn(raw, field)) continue
    const value = check(raw[field])
    if (value != null) layout[field] = value
  }
  return layout
}

/**
 * Snapshot the live layout. `getters` is a bag of zero-arg functions named for
 * the schema fields; a missing (or throwing) getter simply leaves that field
 * out, so a surface only reports the state it actually owns.
 */
export function captureWorkspace(getters = {}, name = '') {
  const raw = {}
  for (const field of Object.keys(FIELDS)) {
    const get = getters[field]
    if (typeof get !== 'function') continue
    try { raw[field] = get() } catch { /* surface not mounted — skip the field */ }
  }
  return {
    v: WORKSPACE_VERSION,
    name: cleanWorkspaceName(name),
    capturedAt: Date.now(),
    layout: normalizeLayout(raw),
  }
}

/** Setter names, in the order they are applied. */
const SETTERS = {
  listId: 'setListId',
  viewMode: 'setViewMode',
  sort: 'setSort',
  spark: 'setSpark',
  sparkWindow: 'setSparkWindow',
  widgets: 'setWidgets',
  marketView: 'setMarketView',
  researchSymbol: 'setResearchSymbol',
}

/**
 * Apply a workspace through the setters a surface hands in. Returns the field
 * names that were actually applied. Nothing here reloads or refetches: every
 * setter is the same one the corresponding control calls, so live quotes keep
 * streaming underneath.
 */
export function applyWorkspace(ws, setters = {}) {
  const layout = normalizeLayout(ws?.layout)
  const applied = []
  // A board workspace naming no list IS the main board — normalizeLayout drops
  // the null, so without an explicit reset the landing preference from wherever
  // the user happened to be survives the apply, and `#/` resolves straight back
  // to it (resolveDashboardLanding). It also keeps the per-list sort key the
  // setters write in step with the one the getters read.
  const fields = { ...layout }
  if (ws && !fields.researchSymbol && !fields.marketView && !Object.hasOwn(fields, 'listId')) {
    fields.listId = null
  }
  for (const [field, setterName] of Object.entries(SETTERS)) {
    if (!Object.hasOwn(fields, field)) continue
    const set = setters[setterName]
    if (typeof set !== 'function') continue
    set(fields[field])
    applied.push(field)
  }
  if (typeof setters.navigate === 'function') setters.navigate(workspaceHash(layout))
  return applied
}

/** Where applying this workspace lands you: the research page it names, else
 *  the market subview it names, else its board. */
export function workspaceHash(layout) {
  const clean = normalizeLayout(layout)
  if (clean.researchSymbol) return `#/research/${clean.researchSymbol.toLowerCase()}`
  if (clean.marketView) return `#/markets/${clean.marketView}`
  if (clean.listId) return `#/watchlists/${clean.listId}`
  return '#/'
}

// ─── store ─────────────────────────────────────────────────────────────────

function read() {
  let raw = null
  try { raw = JSON.parse(localStorage.getItem(KEY)) } catch { return [] }
  if (!Array.isArray(raw)) return []
  const names = new Set()
  return raw.flatMap((item) => {
    const name = cleanWorkspaceName(item?.name)
    const dedupe = name.toLowerCase()
    if (!name || names.has(dedupe)) return []
    names.add(dedupe)
    return [{
      v: WORKSPACE_VERSION,
      name,
      capturedAt: Number.isFinite(item?.capturedAt) ? item.capturedAt : 0,
      layout: normalizeLayout(item?.layout),
    }]
  }).slice(-MAX_WORKSPACES)
}

function write(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* quota — best effort */ }
  for (const fn of listeners) fn(items)
  return items
}

export function listWorkspaces() {
  return read()
}

export function findWorkspace(name) {
  const want = cleanWorkspaceName(name).toLowerCase()
  return read().find((ws) => ws.name.toLowerCase() === want) || null
}

/** Create or overwrite by name. Returns the stored workspace, or null. */
export function saveWorkspace(name, layout) {
  const clean = cleanWorkspaceName(name)
  if (!clean) return null
  const ws = {
    v: WORKSPACE_VERSION,
    name: clean,
    capturedAt: Date.now(),
    layout: normalizeLayout(layout),
  }
  const rest = read().filter((item) => item.name.toLowerCase() !== clean.toLowerCase())
  write([...rest, ws].slice(-MAX_WORKSPACES))
  return ws
}

export function deleteWorkspace(name) {
  const want = cleanWorkspaceName(name).toLowerCase()
  const items = read()
  const rest = items.filter((ws) => ws.name.toLowerCase() !== want)
  if (rest.length === items.length) return false
  write(rest)
  if (rawActive()?.toLowerCase() === want) setActiveWorkspace(null)
  return true
}

export function renameWorkspace(from, to) {
  const want = cleanWorkspaceName(from).toLowerCase()
  const next = cleanWorkspaceName(to)
  if (!next) return false
  const items = read()
  const target = items.find((ws) => ws.name.toLowerCase() === want)
  if (!target) return false
  const collision = items.some((ws) => ws !== target && ws.name.toLowerCase() === next.toLowerCase())
  if (collision) return false
  write(items.map((ws) => (ws === target ? { ...ws, name: next } : ws)))
  if (rawActive()?.toLowerCase() === want) setActiveWorkspace(next)
  return true
}

/** Which workspace the board is currently showing, by name. */
function rawActive() {
  try { return cleanWorkspaceName(localStorage.getItem(ACTIVE_KEY)) || null } catch { return null }
}

export function getActiveWorkspace() {
  const name = rawActive()
  if (!name) return null
  // a workspace deleted in another tab is not "active" anywhere
  return findWorkspace(name) ? name : null
}

export function setActiveWorkspace(name) {
  try {
    if (name == null) localStorage.removeItem(ACTIVE_KEY)
    else localStorage.setItem(ACTIVE_KEY, cleanWorkspaceName(name))
  } catch { /* best-effort */ }
}

// ─── presentation helpers (pure, so the popover stays a dumb renderer) ──────

/** "megacaps · sectors · DAY sparks · 3 widgets" — one mono line per row. */
export function summarizeLayout(layout, { listName } = {}) {
  const clean = normalizeLayout(layout)
  const parts = [listName || 'main board']
  if (clean.viewMode) parts.push(clean.viewMode === 'grouped' ? 'sectors' : 'all')
  if (clean.spark) parts.push(clean.spark === 'off' ? 'no sparks' : `${clean.sparkWindow || ''} sparks`.trim())
  if (clean.widgets) parts.push(`${clean.widgets.length} widget${clean.widgets.length === 1 ? '' : 's'}`)
  // A workspace with a watchlist already names its board via listName; the
  // market/research destination only earns a spot here when it's the thing
  // that would actually be navigated to (see workspaceHash's precedence).
  if (!clean.listId) {
    if (clean.researchSymbol) parts.push(clean.researchSymbol)
    else if (clean.marketView) parts.push(clean.marketView)
  }
  return parts.join(' · ')
}

export function capturedAgo(ts, now = Date.now()) {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const secs = Math.max(0, Math.round((now - ts) / 1000))
  if (secs < 45) return 'just now'
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`
  return `${Math.round(secs / 86400)}d ago`
}

// ─── preference export / import ────────────────────────────────────────────

// The allowlist IS the privacy boundary. Every entry is a layout or display
// preference that means nothing outside this browser. Endpoint, capability and
// token keys (`proxy_url`, `watchlist_sync_cap_v1`, `tape-wire-url`) are
// deliberately absent and can never be added by an import: an unknown key is
// rejected, not written.
export const EXPORT_KEYS = [
  'workspaces_v1',
  'dashboard_view_mode_v1',
  'dashboard_spark_v1',
  'dashboard_spark_window_v1',
  'dashboard_sort_v1',
  'dashboard_landing_v1',
  'dash_widgets_v1',
  'dash_groups_v1',
  'watch_sort',
  'locale_v1',
  'console_h',
  'rail_pulse_min',
  'research_overview_range_v1',
  'tape-clock-tz',
]

// Sorts are stored per named list (`dashboard_sort_v1:<id>`), so the allowlist
// needs one prefix rule alongside the exact names. Each prefix must extend a
// key already on the list — a prefix is a narrowing, never a new surface.
export const EXPORT_KEY_PREFIXES = ['dashboard_sort_v1:']

export function isExportableKey(key) {
  if (typeof key !== 'string') return false
  if (EXPORT_KEYS.includes(key)) return true
  return EXPORT_KEY_PREFIXES.some((p) => key.startsWith(p) && key.length > p.length)
}

/** A versioned, portable blob of this browser's layout preferences. */
export function exportPreferences(storage = localStorage) {
  const keys = {}
  const names = []
  try {
    for (let i = 0; i < storage.length; i++) {
      const name = storage.key(i)
      if (typeof name === 'string') names.push(name)
    }
  } catch { /* no storage — export an empty set rather than throwing */ }
  for (const key of names) {
    if (!isExportableKey(key)) continue
    let value = null
    try { value = storage.getItem(key) } catch { continue }
    if (typeof value === 'string') keys[key] = value
  }
  return { v: PREFERENCES_VERSION, exportedAt: Date.now(), keys }
}

/**
 * Restore a blob produced by exportPreferences. Validates the schema version,
 * then each key against the allowlist; anything unknown is reported in
 * `rejected` and never touches storage.
 */
export function importPreferences(blob, storage = localStorage) {
  const imported = []
  const rejected = []
  if (!blob || typeof blob !== 'object' || Array.isArray(blob)) {
    return { imported, rejected, error: 'not a preferences file' }
  }
  if (blob.v !== PREFERENCES_VERSION) {
    return { imported, rejected, error: `unsupported preferences version ${blob.v}` }
  }
  const keys = blob.keys
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
    return { imported, rejected, error: 'no preference keys' }
  }
  // Object.keys, not for…in: an inherited or __proto__ entry is not data.
  for (const key of Object.keys(keys)) {
    const value = keys[key]
    if (!isExportableKey(key) || typeof value !== 'string') {
      rejected.push(key)
      continue
    }
    try {
      storage.setItem(key, value)
      imported.push(key)
    } catch { rejected.push(key) }
  }
  return { imported, rejected, error: null }
}
