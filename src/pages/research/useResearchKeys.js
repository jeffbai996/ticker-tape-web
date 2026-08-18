import { useEffect } from 'preact/hooks'
import { getWatchlist } from '../../lib/watchlist.js'
import { isTypingTarget } from '../../lib/keys.js'

/** Recent-symbols trail (used by the landing page) + the Bloomberg speed
 *  keys: tab numbers are commands (press 3, land on Options), [ and ] walk
 *  the watchlist without leaving whatever subview is open. */
export function useResearchKeys(symbol, route) {
  useEffect(() => {
    if (!symbol) return
    try {
      const cur = JSON.parse(localStorage.getItem('tape-recent-syms') || '[]')
        .filter((s) => s !== symbol.toUpperCase())
      cur.unshift(symbol.toUpperCase())
      localStorage.setItem('tape-recent-syms', JSON.stringify(cur.slice(0, 12)))
    } catch { /* storage unavailable */ }
  }, [symbol])

  useEffect(() => {
    if (!symbol) return
    // index = the key that reaches it: 1-9, then 0 for the tenth. The strip
    // has outgrown the digits, so the eleventh tab (dividends) takes "-", the
    // key sitting right past 0 on every layout — same one-press scheme, and
    // the tab prints "-)" so the hint still matches the keyboard.
    const VIEWS = [null, 'news', 'intraday', 'options', 'earnings',
                   'analysts', 'financials', 'ownership', 'filings', 'profile',
                   'dividends']
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement
          || e.target instanceof HTMLTextAreaElement
          || e.metaKey || e.ctrlKey || e.altKey) return
      // [ / ] walk the watchlist without leaving the subview you're reading —
      // cycling to the next name on the financials tab lands on financials
      if (e.key === '[' || e.key === ']') {
        if (isTypingTarget(e.target)) return
        const list = getWatchlist()
        if (!list.length) return
        const i = list.indexOf(symbol.toUpperCase())
        const next = i < 0
          ? (e.key === ']' ? list[0] : list[list.length - 1])
          : list[(i + (e.key === ']' ? 1 : -1) + list.length) % list.length]
        location.hash = `#/research/${next.toLowerCase()}${route.view ? '/' + route.view : ''}`
        return
      }
      if (e.key !== '-' && !/^[0-9]$/.test(e.key)) return
      const i = e.key === '-' ? 10 : e.key === '0' ? 9 : Number(e.key) - 1
      if (i >= VIEWS.length) return
      const v = VIEWS[i]
      location.hash = `#/research/${symbol.toLowerCase()}${v ? '/' + v : ''}`
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [symbol, route.view])
}
