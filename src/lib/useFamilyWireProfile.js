import { useEffect, useMemo, useState } from 'preact/hooks'
import { useQuotes, useWatchlist, useZhNames } from '../hooks.js'
import { loadPortfolios, onPortfoliosChange } from './myPortfolios.js'
import { useClassifications } from './useClassifications.js'
import { zhName } from './zhNames.js'
import { BUCKETS } from './symbols.js'
import { selectNewsPortfolios } from './familyWireRelevance.js'

export function useFamilyWireProfile(enabled) {
  const [books, setBooks] = useState(() => enabled ? loadPortfolios() : [])
  const watchlist = useWatchlist()
  useEffect(() => enabled ? onPortfoliosChange(setBooks) : undefined, [enabled])
  const chosen = selectNewsPortfolios(books, import.meta.env.VITE_NEWS_PORTFOLIO_IDS || '',
    localStorage.getItem('my_portfolio_sel_v1') || '')
  const held = [...new Set(chosen.flatMap(book => book.holdings.map(h => h.symbol)))]
  // The built-in showcase list is not evidence of this reader's interests.
  const watched = enabled && localStorage.getItem('watchlist_v1') ? watchlist : []
  const symbols = enabled ? [...new Set([...held, ...watched])] : []
  const key = symbols.join(',')
  useZhNames(symbols)
  const quotes = useQuotes(symbols)
  const categories = useClassifications(symbols)
  const nameKey = symbols.map(s => [quotes[s]?.quote?.name, zhName(s), zhName(s, { traditional:true })].join('|')).join(';')
  return useMemo(() => {
    if (!enabled) return null
    const describe = symbol => ({ symbol,
      names:[quotes[symbol]?.quote?.name, zhName(symbol), zhName(symbol, { traditional:true })].filter(Boolean),
      category:categories[symbol] || BUCKETS.find(b => b.symbols.includes(symbol))?.name,
    })
    return { holdings:held.map(describe), watched:watched.map(describe) }
  }, [enabled, key, held.join(','), watched.join(','), nameKey, categories])
}
