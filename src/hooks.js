import { useEffect, useState } from 'preact/hooks'
import { track, subscribe, getCached } from './lib/feed.js'

/** Live quotes for a symbol list; re-renders as each symbol's data lands. */
export function useQuotes(symbols) {
  const [, bump] = useState(0)

  useEffect(() => {
    track(symbols)
    const wanted = new Set(symbols)
    return subscribe((symbol) => {
      if (wanted.has(symbol)) bump((n) => n + 1)
    })
  }, [symbols.join(',')])

  const out = {}
  for (const s of symbols) out[s] = getCached(s)
  return out
}
