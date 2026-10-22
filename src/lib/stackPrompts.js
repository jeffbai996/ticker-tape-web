/** Suggestions fitted to the user's own books and names. Each prompt fires
 *  only when the data behind it is present, carries its parameters, and is
 *  tagged with a depth: 1 basic, 2 analyst, 3 professional. */
import { holdingCurrency } from './fx.js'

function market(symbol) {
  const suffix = String(symbol).split('.')[1]?.toUpperCase()
  return suffix === 'HK' ? 'hk' : suffix === 'SS' || suffix === 'SZ' ? 'cn' : 'us'
}

/** Most common value; ties go to whichever appears first. */
function dominant(values) {
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1)
  let best = null
  for (const [v, n] of counts) if (best == null || n > counts.get(best)) best = v
  return best
}

const priceOf = (quotes, symbol) => quotes[symbol]?.quote?.price || null

/** Prompts built from the saved books themselves. */
export function bookPrompts({ books = [], quotes = {}, earnDays = {} }) {
  const out = []
  const add = (name, lvl, params) => out.push({ name, k: 'book', lvl, params })
  // Every book prompt names its book; an unnamed one would read "undefined".
  const held = books.filter((b) => b.name && b.positions?.length)
  if (!held.length) return out

  for (const book of held) {
    const ps = book.positions
    const ccys = [...new Set(ps.map((p) => p.currency || holdingCurrency(p.symbol)))]

    // Weight needs every position priced and one currency, or it is a guess.
    if (ccys.length === 1 && ps.length >= 2 && ps.every((p) => priceOf(quotes, p.symbol))) {
      const values = ps.map((p) => ({ symbol: p.symbol, v: p.shares * priceOf(quotes, p.symbol) }))
      const total = values.reduce((a, b) => a + b.v, 0)
      const top = values.sort((a, b) => b.v - a.v)[0]
      if (total > 0) add('book_top', 3, { symbol: top.symbol, book: book.name, pct: String(Math.round((top.v / total) * 100)) })
    }

    const vsCost = ps.map((p) => {
      const price = priceOf(quotes, p.symbol)
      return price && p.avg_cost > 0 ? { symbol: p.symbol, pct: (price / p.avg_cost - 1) * 100 } : null
    }).filter(Boolean)
    const worst = [...vsCost].sort((a, b) => a.pct - b.pct)[0]
    if (worst && worst.pct <= -15) add('book_underwater', 3, { symbol: worst.symbol, book: book.name, pct: String(Math.round(-worst.pct)) })
    const best = [...vsCost].sort((a, b) => b.pct - a.pct)[0]
    if (best && best.pct >= 40) add('book_winner', 3, { symbol: best.symbol, book: book.name, pct: String(Math.round(best.pct)) })

    const reporting = ps.map((p) => p.symbol).filter((s) => earnDays[s] > 0 && earnDays[s] <= 14)
      .sort((a, b) => earnDays[a] - earnDays[b])[0]
    if (reporting) add('book_earnings', 3, { symbol: reporting, book: book.name, days: earnDays[reporting] })

    if (ps.length >= 4) add('book_correlation', 3, { book: book.name })
    if (ccys.length >= 2) add('book_currency_mix', 3, { book: book.name, ccys: ccys.join(' / ') })
    add(`book_stress_${dominant(ps.map((p) => market(p.symbol)))}`, 3, { book: book.name })
    if (ps.length >= 3) add('book_catalysts', 2, { book: book.name })
    if (ps.length >= 3) add('book_income', 2, { book: book.name })
    add('book_hedge', 3, { book: book.name })
  }

  const counts = new Map()
  for (const book of held) for (const s of new Set(book.positions.map((p) => p.symbol))) counts.set(s, (counts.get(s) || 0) + 1)
  const shared = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0]
  if (shared) add('book_overlap', 3, { symbol: shared[0], n: shared[1] })

  const hk = held.find((b) => b.positions.some((p) => market(p.symbol) === 'hk'))
  if (hk) add('book_hk_flows', 3, { book: hk.name })
  const cn = held.find((b) => b.positions.some((p) => market(p.symbol) === 'cn'))
  if (cn) add('book_cn_policy', 3, { book: cn.name })

  if (held.length >= 2) {
    const [a, b] = [...held].sort((x, y) => y.positions.length - x.positions.length)
    add('book_compare', 3, { book: a.name, other: b.name })
  }
  add('book_rates', 2)
  // Specific findings first; questions any book could ask follow.
  const rank = (p) => { const i = BOOK_ORDER.indexOf(p.name.replace(/_(us|hk|cn)$/, '')); return i < 0 ? BOOK_ORDER.length : i }
  return out.sort((a, b) => rank(a) - rank(b))
}

const BOOK_ORDER = ['book_overlap', 'book_underwater', 'book_earnings', 'book_top', 'book_winner', 'book_compare',
  'book_currency_mix', 'book_hk_flows', 'book_cn_policy', 'book_stress', 'book_correlation', 'book_hedge',
  'book_catalysts', 'book_income', 'book_rates']

/** Analyst-level questions on the user's own names, held names first. Each
 *  edition starts the rotation one name further along. */
const STACK = [
  ['priced_in', 'idea', 3], ['variant_view', 'idea', 3], ['supply_chain', 'idea', 3],
  ['crowding', 'mkt', 3], ['options_implied', 'mkt', 3], ['revisions', 'earn', 2],
  ['capital_allocation', 'idea', 2], ['moat', 'idea', 2], ['guidance_track', 'earn', 3],
]
export function stackPrompts({ held = [], watchlist = [], edition = 0 }) {
  const names = [...new Set([...held, ...watchlist])]
  if (!names.length) return []
  return STACK.map(([name, k, lvl], i) => ({ name, k, lvl, params: { symbol: names[(edition + i) % names.length] } }))
}

/** Questions about the market as a whole that a practitioner would ask. */
export const PRACTITIONER = [
  ['regime', 'mkt', 3], ['positioning', 'mkt', 3], ['liquidity', 'macro', 3],
  ['real_rates', 'macro', 3], ['credit', 'macro', 3], ['earnings_season', 'earn', 2],
]
