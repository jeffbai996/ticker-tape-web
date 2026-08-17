/**
 * Quote consumers are scoped to mounted UI surfaces. The newest surface is
 * ordered first so a just-opened custom watchlist leads the stream request,
 * while persistent consumers (alerts) remain subscribed behind it.
 */
export function createFeedSymbolRegistry() {
  const consumers = new Map()
  const persistent = new Set()
  let nextId = 1

  const clean = (symbols) => [...new Set((symbols || []).filter(Boolean))]

  return {
    retain(symbols) {
      const id = nextId++
      consumers.set(id, clean(symbols))
      let active = true
      return () => {
        if (!active) return
        active = false
        consumers.delete(id)
      }
    },

    persist(symbols) {
      for (const symbol of clean(symbols)) persistent.add(symbol)
    },

    values() {
      const out = []
      const seen = new Set()
      const active = [...consumers.values()].reverse()
      for (const symbols of active) {
        for (const symbol of symbols) {
          if (seen.has(symbol)) continue
          seen.add(symbol)
          out.push(symbol)
        }
      }
      for (const symbol of persistent) {
        if (seen.has(symbol)) continue
        seen.add(symbol)
        out.push(symbol)
      }
      return out
    },
  }
}
