/** Trades → positions. FIFO lots per symbol: each buy opens a lot, each
 *  sell closes the oldest first and books realized P&L against that lot's
 *  cost (fees on both legs are part of the cost). Pure: a list of trades in,
 *  a map of positions out. Quantities and prices are in the trade's own
 *  currency — nothing here converts. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function sortTxns(txns) {
  return [...(txns || [])].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : String(a.id).localeCompare(String(b.id))))
}

/** @returns {Record<string, {qty, avgCost, costBasis, realized, fees, buys, sells, firstDate, lastDate, ccy}>} */
export function positionsFromTxns(txns) {
  const out = {}
  for (const t of sortTxns(txns)) {
    if (!t || !DATE_RE.test(t.d || '') || !(t.qty > 0)) continue
    const sym = String(t.sym || '').toUpperCase()
    const p = out[sym] || (out[sym] = { lots: [], qty: 0, avgCost: null, costBasis: 0, realized: 0, fees: 0, buys: 0, sells: 0, firstDate: t.d, lastDate: t.d, ccy: t.ccy || null })
    const fee = Number(t.fee) > 0 ? Number(t.fee) : 0
    p.fees += fee
    p.lastDate = t.d
    if (!p.ccy && t.ccy) p.ccy = t.ccy
    if (t.side === 'buy') {
      // the fee is paid to own these shares: it lives in the lot's cost
      p.lots.push({ qty: t.qty, cost: t.qty * t.px + fee })
      p.buys += 1
    } else if (t.side === 'sell') {
      let left = t.qty
      let proceeds = t.qty * t.px - fee
      let basis = 0
      while (left > 0 && p.lots.length) {
        const lot = p.lots[0]
        const take = Math.min(left, lot.qty)
        basis += (lot.cost / lot.qty) * take
        lot.qty -= take
        lot.cost -= (lot.cost / (lot.qty + take)) * take
        if (lot.qty <= 1e-9) p.lots.shift()
        left -= take
      }
      if (left > 0) {
        // selling what the ledger never bought: the proceeds still count,
        // against zero cost, and `oversold` says so — no negative lot invented
        p.oversold = (p.oversold || 0) + left
      }
      p.realized += proceeds - basis
      p.sells += 1
    }
  }
  for (const [sym, p] of Object.entries(out)) {
    p.qty = p.lots.reduce((s, l) => s + l.qty, 0)
    p.costBasis = p.lots.reduce((s, l) => s + l.cost, 0)
    p.avgCost = p.qty > 0 ? p.costBasis / p.qty : null
    p.qty = Math.round(p.qty * 1e6) / 1e6
    p.realized = Math.round(p.realized * 100) / 100
    p.costBasis = Math.round(p.costBasis * 100) / 100
    if (p.avgCost != null) p.avgCost = Math.round(p.avgCost * 1e4) / 1e4
    delete p.lots
    out[sym] = p
  }
  return out
}

/** Holdings as the ledger says they are: every symbol with trades gets its
 *  derived shares and average cost (a position sold to zero disappears);
 *  symbols the ledger never mentions keep their hand-entered row. */
export function applyLedger(holdings, txns) {
  const pos = positionsFromTxns(txns)
  const kept = (holdings || []).filter((h) => !(h.symbol in pos))
  const derived = Object.entries(pos)
    .filter(([, p]) => p.qty > 0)
    .map(([symbol, p]) => (p.avgCost != null && p.avgCost > 0
      ? { symbol, shares: p.qty, cost: p.avgCost }
      : { symbol, shares: p.qty }))
  return [...kept, ...derived]
}
