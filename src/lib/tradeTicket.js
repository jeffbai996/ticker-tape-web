/** The arithmetic behind the trade ticket (Gordon 2026-08-23: the entry
 *  form read as a bare row of boxes; a broker ticket shows what the trade
 *  costs and what the position becomes BEFORE the tap). Pure — the form
 *  renders these, tests pin them.
 */
import { holdingCurrency } from './fx.js'

/** qty × price + fee for a buy, − fee for a sell. Null until both numbers
 *  are real: a half-typed ticket must not show a wrong total. */
export function tradeEstimate({ side, qty, px, fee }) {
  const q = Number(qty)
  // an empty price box coerces to 0, which is a real price for nothing —
  // the ticket total must stay blank until a price is actually typed
  const p = String(px ?? '').trim() === '' ? NaN : Number(px)
  if (!(q > 0) || !(p >= 0)) return null
  const f = Number(fee) > 0 ? Number(fee) : 0
  return side === 'sell' ? q * p - f : q * p + f
}

/** What the book's row for `sym` becomes if this ticket is filed:
 *  {before, after, avgAfter}. avgAfter only when it is honestly computable
 *  (a buy onto a row whose cost is known, or a fresh buy). */
export function positionAfter(holdings, sym, { side, qty, px, fee }) {
  const q = Number(qty)
  if (!(q > 0)) return null
  const row = (holdings || []).find((h) => h.symbol === String(sym || '').toUpperCase())
  const before = row?.shares || 0
  const after = side === 'sell' ? Math.max(0, before - q) : before + q
  let avgAfter = null
  if (side !== 'sell' && Number(px) >= 0) {
    const f = Number(fee) > 0 ? Number(fee) : 0
    if (before === 0) avgAfter = (q * Number(px) + f) / q
    else if (row?.cost > 0) avgAfter = (before * row.cost + q * Number(px) + f) / (before + q)
  }
  return { before, after, avgAfter }
}

/** Mainland boards trade in 100-share lots; an off-lot quantity is almost
 *  always a typo. HK lot sizes vary per listing, so only A-shares warn. */
export function offLot(sym, qty) {
  const q = Number(qty)
  if (!(q > 0)) return false
  if (!/\.(SS|SZ)$/.test(String(sym || '').toUpperCase())) return false
  return q % 100 !== 0
}

/** The currency this symbol trades in — for the ticket's amount line. */
export function tradeCcy(sym, quote) {
  return holdingCurrency(String(sym || '').toUpperCase(), quote)
}
