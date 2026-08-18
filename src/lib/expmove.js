// What the options market is charging for the print.
//
// The implied move itself is priced by `expectedMove` in optionsIntel.js — one
// straddle implementation for the earnings card, the options panel and the
// chart bands. What lives here is the rest of the earnings-day arithmetic:
// which expiry actually spans the event, what this name has historically done
// on a print, and whether the gap between the two is rich or cheap.

/** The contract whose strike sits closest to spot. */
export function atmContract(contracts, spot) {
  if (!contracts?.length || !spot) return null
  return contracts.reduce((best, c) => (
    Math.abs(c.strike - spot) < Math.abs(best.strike - spot) ? c : best
  ))
}

/**
 * First expiry on or after the print — the contract that actually spans the
 * event. Expirations arrive as epoch seconds; returns one or null.
 */
export function expiryForEvent(expirations, eventMs) {
  if (!expirations?.length || !eventMs) return null
  const evSec = Math.floor(eventMs / 1000)
  const after = expirations.filter((e) => e >= evSec).sort((a, b) => a - b)
  return after.length ? after[0] : null
}

/**
 * Typical absolute reaction across past prints — the realized benchmark the
 * implied move gets measured against.
 */
export function typicalMovePct(events) {
  const moves = (events || [])
    .map((e) => e.priceMove)
    .filter((m) => m != null)
    .map(Math.abs)
  if (!moves.length) return null
  return moves.reduce((a, b) => a + b, 0) / moves.length
}

/**
 * Rich/cheap verdict: implied vs typical realized. `ratio` above 1 means the
 * market is charging more than this name has historically delivered.
 */
export function moveEdge(impliedPct, typicalPct) {
  if (impliedPct == null || !typicalPct) return null
  const ratio = impliedPct / typicalPct
  return {
    ratio,
    verdict: ratio >= 1.25 ? 'rich' : ratio <= 0.8 ? 'cheap' : 'fair',
  }
}
