// User-defined forward catalysts (CLI catalyst-store parity): product events,
// conferences, policy dates, capex days — merged into the economic calendar
// with the same countdown semantics. Per-browser localStorage, like the
// watchlist and alerts; nothing here ships in the build.

const KEY = 'catalysts_v1'
const MAX = 100
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/

export const CATALYST_TYPES = ['product', 'conf', 'policy', 'capex', 'macro', 'other']

const listeners = new Set()

export function onCatalystsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function loadCatalysts() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch { /* best-effort */ }
  for (const fn of listeners) fn(list)
}

/** Add a catalyst. symbol optional (macro events); type defaults to 'other'. */
export function addCatalyst({ date, symbol, type = 'other', label }) {
  if (!DATE_RE.test(date || '') || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error('date must be YYYY-MM-DD')
  }
  const lbl = (label || '').trim()
  if (!lbl) throw new Error('label required')
  if (!CATALYST_TYPES.includes(type)) {
    throw new Error(`type must be one of: ${CATALYST_TYPES.join(', ')}`)
  }
  let sym = (symbol || '').trim().toUpperCase()
  if (sym && !SYMBOL_RE.test(sym)) throw new Error(`bad symbol: ${symbol}`)
  if (!sym) sym = 'MACRO'

  const list = loadCatalysts()
  if (list.length >= MAX) throw new Error(`catalyst list full (${MAX})`)
  const cat = {
    id: Math.max(0, ...list.map((c) => c.id)) + 1,
    date,
    symbol: sym,
    type,
    label: lbl.slice(0, 120),
  }
  save([...list, cat])
  return cat
}

export function removeCatalyst(id) {
  const list = loadCatalysts()
  const next = list.filter((c) => c.id !== id)
  if (next.length === list.length) return false
  save(next)
  return true
}

/**
 * Merge econ calendar events with user catalysts into one upcoming list,
 * soonest first. Econ entries keep their {date,type,label}; catalyst entries
 * add {id, symbol, user:true} so the UI can chip the symbol and offer remove.
 */
export function mergedEvents(econEvents, catalysts, today, horizonDays = 90) {
  const days = (date) =>
    Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86_400_000)
  const all = [
    ...econEvents.map((e) => ({ ...e, days: days(e.date) })),
    ...catalysts.map((c) => ({
      id: c.id,
      date: c.date,
      type: c.type.toUpperCase(),
      label: c.symbol === 'MACRO' ? c.label : `${c.symbol} — ${c.label}`,
      rawLabel: c.label,
      symbol: c.symbol,
      user: true,
      days: days(c.date),
    })),
  ]
  return all
    .filter((e) => e.days >= 0 && e.days <= horizonDays)
    .sort((a, b) => a.days - b.days)
}
