// What the options market is charging for the print.
//
// The ATM straddle is the cleanest read available from a public chain: buy the
// call and the put at the strike nearest spot, and what you paid is roughly
// what the market thinks the move is worth. Compare it to what the stock has
// actually done on past prints and you get the only number that matters on
// earnings day — is this event priced rich or cheap.

/** Mid price, falling back to last when a side of the book is missing. */
export function mid(c) {
  if (!c) return null
  if (c.bid != null && c.ask != null && c.ask > 0 && c.bid > 0) return (c.bid + c.ask) / 2
  return c.last != null && c.last > 0 ? c.last : null
}

/** The contract whose strike sits closest to spot. */
export function atmContract(contracts, spot) {
  if (!contracts?.length || !spot) return null
  return contracts.reduce((best, c) => (
    Math.abs(c.strike - spot) < Math.abs(best.strike - spot) ? c : best
  ))
}

/**
 * Straddle-implied move as a percent of spot, or null when the chain is too
 * thin to price one honestly (no ATM pair, or a side with no market).
 */
export function expectedMovePct({ spot, calls, puts }) {
  if (!spot) return null
  const call = atmContract(calls, spot)
  const put = atmContract(puts, spot)
  if (!call || !put) return null
  const cm = mid(call)
  const pm = mid(put)
  if (cm == null || pm == null) return null
  return ((cm + pm) / spot) * 100
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
