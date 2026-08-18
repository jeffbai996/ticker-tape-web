// Options intelligence: answers to the three questions a chain table alone
// can't — what move is priced, where the market's fear/greed skew sits, and
// what actually moved since the last time this name was looked at. Pure
// functions over the chain shape fetchOptions() already returns
// ({ spot, expiration, expirations, calls, puts }), so they're cheap to unit
// test with synthetic data and easy to reuse from the ladder or a summary
// strip.

import { atmContract, expiryForEvent, mid, moveEdge, typicalMovePct } from './expmove.js'
import { bsDelta } from './bs.js'

export { atmContract, expiryForEvent, mid, moveEdge, typicalMovePct }

/** Years-to-expiry off epoch-seconds, floored so a same-day expiry still
 *  prices (bsDelta divides by sqrt(t)). */
export function yearsTo(expirationSec, nowMs = Date.now()) {
  if (!expirationSec) return null
  return Math.max((expirationSec * 1000 - nowMs) / (365 * 86_400_000), 1 / 365)
}

/**
 * Straddle mid for one contract. A one-sided book (0 × ask, normal after
 * hours) is still a real market and mids to half the ask; only an entirely
 * empty book falls back to the last print, and a non-positive number is not a
 * price. Wider than expmove.js's `mid`, which the earnings card keeps for its
 * own stricter contract.
 */
export function contractMid(c) {
  if (c?.bid != null && c?.ask != null && (c.bid > 0 || c.ask > 0)) return (c.bid + c.ask) / 2
  return c?.last > 0 ? c.last : null
}

/**
 * ATM straddle price/pct for one chain — the single implementation behind the
 * options panel, the chart's expected-move bands and the session diff.
 *
 * The strike is chosen from the strikes quoted on BOTH sides: picking the
 * nearest call and the nearest put independently lands on two different
 * strikes whenever a chain's sides are not symmetric, and summing those two
 * premiums prices a strangle while calling it a straddle.
 */
export function expectedMove(chain) {
  if (chain?.spot == null || !chain.calls?.length || !chain.puts?.length) return null
  const puts = new Map(chain.puts.map((p) => [p.strike, p]))
  let call = null
  for (const c of chain.calls) {
    if (!puts.has(c.strike)) continue
    if (call == null || Math.abs(c.strike - chain.spot) < Math.abs(call.strike - chain.spot)) call = c
  }
  if (!call) return null
  const cm = contractMid(call)
  const pm = contractMid(puts.get(call.strike))
  if (cm == null || pm == null) return null
  const price = cm + pm
  return {
    strike: call.strike,
    price,
    pct: (price / chain.spot) * 100,
    dollars: price,
  }
}

/** ATM IV: average of the nearest call and put IV at the ATM strike. Yahoo
 *  ships per-contract IV, not a model-free VIX-style number — averaging the
 *  two sides of the same strike is the simplest honest read. */
export function atmIv(chain) {
  if (chain?.spot == null) return null
  const call = atmContract(chain.calls, chain.spot)
  const put = atmContract(chain.puts, chain.spot)
  const ivs = [call?.iv, put?.iv].filter((v) => v != null && v > 0)
  if (!ivs.length) return null
  return ivs.reduce((a, b) => a + b, 0) / ivs.length
}

/**
 * IV term structure across expiries: one ATM-IV point per chain, sorted by
 * days-to-expiry. `front`/`back` compare the nearest and farthest points so
 * callers can label contango ("back > front", calm-then-event pricing) vs
 * backwardation ("front > back", stress priced into the near date) without
 * re-deriving it.
 */
export function ivTermStructure(chains, nowMs = Date.now()) {
  const points = (chains || [])
    .map((c) => {
      const iv = atmIv(c)
      if (iv == null || !c.expiration) return null
      const dte = Math.max(0, Math.round((c.expiration * 1000 - nowMs) / 86_400_000))
      return { expiration: c.expiration, dte, atmIv: iv }
    })
    .filter(Boolean)
    .sort((a, b) => a.dte - b.dte)
  if (points.length < 2) return { points, shape: null }
  const front = points[0]
  const back = points[points.length - 1]
  const shape = back.atmIv > front.atmIv * 1.02 ? 'contango'
    : back.atmIv < front.atmIv * 0.98 ? 'backwardation'
    : 'flat'
  return { points, front, back, shape }
}

/**
 * 25-delta-ish put/call skew for one expiry: the IV gap between the ~25-delta
 * put and the ~25-delta call, positive when downside protection is bid over
 * upside (the usual equity shape). Delta comes from bsDelta (Black-Scholes on
 * each contract's own quoted IV) — a proxy for the exchange-quoted greek, not
 * the greek itself. When no contract has IV to price a delta from (a very
 * thin chain), this falls back to a strikes-±-expected-move proxy: the call
 * struck near spot + the ATM straddle's implied move and the put struck near
 * spot - that same move, which is roughly where a 25-delta contract sits on
 * a name pricing an average-sized event.
 */
export function skew25Delta(chain, { t } = {}) {
  if (!chain?.spot || !chain.calls?.length || !chain.puts?.length) return null
  const years = t ?? yearsTo(chain.expiration)
  const nearestDelta = (contracts, type, target) => {
    let best = null
    let bestDist = Infinity
    for (const c of contracts) {
      if (c.iv == null || c.iv <= 0) continue
      const d = bsDelta({ spot: chain.spot, strike: c.strike, t: years, iv: c.iv, type })
      if (d == null) continue
      const dist = Math.abs(Math.abs(d) - target)
      if (dist < bestDist) { bestDist = dist; best = c }
    }
    return best
  }
  let call = nearestDelta(chain.calls, 'call', 0.25)
  let put = nearestDelta(chain.puts, 'put', 0.25)
  let method = 'delta'
  if (!call || !put) {
    // thin chain, no priceable delta anywhere — fall back to the
    // expected-move strike band documented above
    const em = expectedMove(chain)
    const band = em?.dollars ?? chain.spot * 0.05
    const nearestStrike = (contracts, target) => contracts.reduce((best, c) => (
      best == null || Math.abs(c.strike - target) < Math.abs(best.strike - target) ? c : best
    ), null)
    call = call || nearestStrike(chain.calls, chain.spot + band)
    put = put || nearestStrike(chain.puts, chain.spot - band)
    method = 'strike-band'
  }
  if (!call?.iv || !put?.iv) return null
  return {
    method,
    callStrike: call.strike,
    putStrike: put.strike,
    callIv: call.iv,
    putIv: put.iv,
    skew: put.iv - call.iv,
  }
}

/**
 * Volume/OI outliers with an explicit, documented baseline: at least
 * `minVolume` contracts traded AND (open interest is zero — brand new
 * interest — or volume is at least `minRatio`× open interest). Never call
 * something "unusual" without the number that made it so.
 */
export function volumeOiOutliers(chain, { minRatio = 3, minVolume = 500 } = {}) {
  const scan = (contracts, side) => (contracts || [])
    .filter((c) => (c.volume || 0) >= minVolume && ((c.oi || 0) === 0 || c.volume / c.oi >= minRatio))
    .map((c) => ({
      side, strike: c.strike, volume: c.volume, oi: c.oi || 0,
      ratio: c.oi ? c.volume / c.oi : null,
    }))
  return [...scan(chain?.calls, 'call'), ...scan(chain?.puts, 'put')]
    .sort((a, b) => (b.ratio ?? Infinity) - (a.ratio ?? Infinity) || b.volume - a.volume)
}

/** Chain-wide volume/OI totals — the summed inputs the outlier scan and the
 *  session diff both want. */
export function chainTotals(chain) {
  const sum = (contracts, key) => (contracts || []).reduce((a, c) => a + (c[key] || 0), 0)
  return {
    volume: sum(chain?.calls, 'volume') + sum(chain?.puts, 'volume'),
    oi: sum(chain?.calls, 'oi') + sum(chain?.puts, 'oi'),
  }
}

/**
 * "What changed today": expected move, ATM IV, and volume/OI totals now vs
 * the last chain this browser had cached for the same symbol+expiry. Returns
 * null when there's nothing to diff against — callers show "no prior session
 * cached" rather than inventing a zero.
 */
export function diffSession(curr, prev) {
  if (!curr || !prev) return null
  const currEm = expectedMove(curr)
  const prevEm = expectedMove(prev)
  const currIv = atmIv(curr)
  const prevIv = atmIv(prev)
  const currTot = chainTotals(curr)
  const prevTot = chainTotals(prev)
  return {
    movePctDelta: currEm != null && prevEm != null ? currEm.pct - prevEm.pct : null,
    ivDelta: currIv != null && prevIv != null ? currIv - prevIv : null,
    volumeDelta: currTot.volume - prevTot.volume,
    oiDelta: currTot.oi - prevTot.oi,
  }
}
