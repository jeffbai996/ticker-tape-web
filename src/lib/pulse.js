// Pulse panel: breadth stats over the live watchlist, mirroring the TUI's
// left-rail Pulse block. Pure — takes the quote list, returns the numbers.

export function pulseStats(quotes) {
  const pcts = quotes.filter((q) => q?.pct != null)
  if (!pcts.length) return null

  const sorted = [...pcts].sort((a, b) => b.pct - a.pct)
  const adv = pcts.filter((q) => q.pct >= 0).length
  const dec = pcts.length - adv
  const avg = pcts.reduce((s, q) => s + q.pct, 0) / pcts.length
  const hi = sorted[0]
  const lo = sorted[sorted.length - 1]

  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 ? sorted[mid].pct : (sorted[mid - 1].pct + sorted[mid].pct) / 2

  const variance = pcts.reduce((s, q) => s + (q.pct - avg) ** 2, 0) / pcts.length

  const ext = quotes.filter((q) => q?.extPct != null)
  const extAdv = ext.filter((q) => q.extPct >= 0).length

  return {
    adv,
    dec,
    avg,
    hi: { symbol: hi.symbol, pct: hi.pct },
    lo: { symbol: lo.symbol, pct: lo.pct },
    spread: hi.pct - lo.pct,
    stress: pcts.filter((q) => q.pct <= -3).length,
    extAdv,
    extDec: ext.length - extAdv,
    median,
    greenPct: (adv / pcts.length) * 100,
    sigma: Math.sqrt(variance),
    movers: pcts.filter((q) => Math.abs(q.pct) > 2).length,
    flat: pcts.filter((q) => Math.abs(q.pct) < 1).length,
    total: pcts.length,
  }
}
