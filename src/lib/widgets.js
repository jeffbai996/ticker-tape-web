// Dashboard widget layout — which panels the home view shows, in what order.
// Persisted per-browser; the dashboard renders whatever this list says.

const KEY = 'dash_widgets_v1'
const SYMBOL_RE = /^[A-Za-z0-9.^=-]{1,12}$/

export const WIDGET_TYPES = ['pulse', 'earnings', 'calendar', 'movers', 'chart']

export const DEFAULT_WIDGETS = [
  { id: 1, type: 'pulse' },
  { id: 2, type: 'earnings' },
  { id: 3, type: 'calendar' },
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
      return raw
    }
  } catch { /* fall through to defaults */ }
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
    if (!symbol || !SYMBOL_RE.test(symbol.trim())) return null
    w.symbol = symbol.trim().toUpperCase()
  }
  const widgets = [...load(), w]
  save(widgets)
  return w
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
