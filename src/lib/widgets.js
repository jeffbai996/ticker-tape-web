// Dashboard widget layout — which panels the home view shows, in what order.
// Persisted per-browser; the dashboard renders whatever this list says.

import { SYMBOL_ANY_CASE_RE } from './symbols.js'

const KEY = 'dash_widgets_v1'
const MARKET_MIGRATION_KEY = 'dash_widgets_market_v1'

export const WIDGET_TYPES = ['pulse', 'markets', 'earnings', 'calendar', 'movers',
                             'heat', 'alerts', 'range', 'risk', 'chart']

export const DEFAULT_WIDGETS = [
  { id: 1, type: 'pulse' },
  { id: 2, type: 'markets' },
  { id: 3, type: 'earnings' },
  { id: 4, type: 'calendar' },
]

const listeners = new Set()
export function onWidgetsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (Array.isArray(raw) && raw.every((w) => WIDGET_TYPES.includes(w.type) && w.id != null)) {
      if (!localStorage.getItem(MARKET_MIGRATION_KEY)) {
        localStorage.setItem(MARKET_MIGRATION_KEY, '1')
        if (!raw.some((w) => w.type === 'markets')) {
          const migrated = [...raw, { id: Date.now(), type: 'markets' }]
          localStorage.setItem(KEY, JSON.stringify(migrated))
          return migrated
        }
      }
      return raw
    }
  } catch { /* fall through to defaults */ }
  try { localStorage.setItem(MARKET_MIGRATION_KEY, '1') } catch { /* best-effort */ }
  return DEFAULT_WIDGETS.map((w) => ({ ...w }))
}

function save(widgets) {
  try {
    localStorage.setItem(KEY, JSON.stringify(widgets))
  } catch { /* quota — layout just won't persist */ }
  for (const fn of listeners) fn(widgets)
}

export function getWidgets() {
  return load()
}

export function addWidget(type, symbol) {
  if (!WIDGET_TYPES.includes(type)) return null
  const w = { id: Date.now(), type }
  if (type === 'chart') {
    if (!symbol || !SYMBOL_ANY_CASE_RE.test(symbol.trim())) return null
    w.symbol = symbol.trim().toUpperCase()
  }
  const widgets = [...load(), w]
  save(widgets)
  return w
}

/** Replace the whole rail at once (saved workspaces apply a widget set, not a
 *  sequence of adds). Entries arrive without ids — a saved layout must not
 *  carry this browser's ids — so fresh ones are minted here. Junk is dropped
 *  rather than rejecting the whole list: a layout with one unknown widget is
 *  still worth applying. */
export function setWidgets(list) {
  const base = Date.now()
  const clean = (list || []).flatMap((w, i) => {
    if (!w || !WIDGET_TYPES.includes(w.type)) return []
    if (w.type === 'chart') {
      const symbol = String(w.symbol || '').trim()
      if (!SYMBOL_ANY_CASE_RE.test(symbol)) return []
      return [{ id: base + i, type: 'chart', symbol: symbol.toUpperCase() }]
    }
    return [{ id: base + i, type: w.type }]
  })
  // A deliberate replace is not the legacy rail the one-time 'markets'
  // migration exists for — mark it done so load() doesn't inject a widget
  // this call didn't ask for.
  try { localStorage.setItem(MARKET_MIGRATION_KEY, '1') } catch { /* best-effort */ }
  save(clean)
  return clean
}

export function removeWidget(id) {
  save(load().filter((w) => w.id !== id))
}

/** Move a widget one slot up (dir=-1) or down (dir=+1); clamps at edges. */
export function moveWidget(id, dir) {
  const widgets = load()
  const i = widgets.findIndex((w) => w.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= widgets.length) return
  ;[widgets[i], widgets[j]] = [widgets[j], widgets[i]]
  save(widgets)
}
