import { useState } from 'preact/hooks'

const ORDER_KEY = 'research_rail_order_v1'
// task order: synthesize (report) → confirm technicals → confirm valuation →
// catch up on news. New users see this order; reordering only ever moves
// away from it.
const DEFAULT_ORDER = ['report', 'technicals', 'fundamentals', 'news']

function loadOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || 'null')
    if (Array.isArray(saved) && DEFAULT_ORDER.every((m) => saved.includes(m)) && saved.length === DEFAULT_ORDER.length) {
      return saved
    }
  } catch { /* corrupt — fall through to the default */ }
  return DEFAULT_ORDER
}

/** Right-rail module order, persisted once the user reorders it. */
export function useRailModules() {
  const [order, setOrder] = useState(loadOrder)
  const move = (id, dir) => {
    setOrder((cur) => {
      const i = cur.indexOf(id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= cur.length) return cur
      const next = [...cur]
      ;[next[i], next[j]] = [next[j], next[i]]
      try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)) } catch { /* best-effort */ }
      return next
    })
  }
  return { order, move }
}
