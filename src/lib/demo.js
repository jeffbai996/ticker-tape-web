// Synthetic demo portfolio — THE RULE applies (see CLAUDE.md).
//
// Positions are fixed, generic, and obviously fake (~$50K book, ~1x); only
// the PRICES are live, so P&L/weights/risk move like a real book without a
// single real number in them. Mirrors the CLI's demo_data.py stance:
// "Nothing here may reference a real portfolio." Don't improve realism.

export const DEMO_ACCOUNT_ID = 'U1234567'
export const DEMO_CASH = 3200
export const DEMO_MARGIN_RATE = 5.5 // %, demo broker rate for carry math
const MAINTENANCE_PCT = 0.25 // flat 25% maintenance margin — demo simplification

// (symbol, shares, avgCost) — one position per sector, sized ~$5-6K each
// at mid-2026 prices so gross + cash lands near $50K unlevered.
export const DEMO_POSITIONS = [
  { symbol: 'AAPL', shares: 20, avgCost: 265 },
  { symbol: 'NVDA', shares: 30, avgCost: 165 },
  { symbol: 'JPM', shares: 18, avgCost: 290 },
  { symbol: 'LLY', shares: 5, avgCost: 1050 },
  { symbol: 'XOM', shares: 40, avgCost: 120 },
  { symbol: 'WMT', shares: 50, avgCost: 95 },
  { symbol: 'GLD', shares: 15, avgCost: 350 },
  { symbol: 'SPY', shares: 8, avgCost: 680 },
]

// Static demo betas for the stress grid — indicative, not estimated.
export const DEMO_BETAS = {
  AAPL: 1.2, NVDA: 1.8, JPM: 1.1, LLY: 0.4, XOM: 0.6, WMT: 0.5, GLD: 0.1, SPY: 1.0,
}

/** Per-position derived row; price-dependent fields null without a quote. */
export function positionRows(positions, priceMap) {
  const rows = positions.map((p) => {
    const q = priceMap[p.symbol]
    if (!q?.price) {
      return { ...p, price: null, mktValue: null, dayPnl: null, dayPct: null,
        unrealPnl: null, unrealPct: null, weight: null }
    }
    const mktValue = q.price * p.shares
    const costBasis = p.avgCost * p.shares
    return {
      ...p,
      price: q.price,
      mktValue,
      dayPnl: (q.change ?? 0) * p.shares,
      dayPct: q.pct ?? null,
      unrealPnl: mktValue - costBasis,
      unrealPct: costBasis > 0 ? ((mktValue - costBasis) / costBasis) * 100 : null,
      weight: null, // filled below once gross is known
    }
  })
  const gross = rows.reduce((s, r) => s + (r.mktValue ?? 0), 0)
  for (const r of rows) {
    if (r.mktValue != null && gross > 0) r.weight = (r.mktValue / gross) * 100
  }
  return rows
}

/** Account-level stats. Null NLV/leverage until every position has a price. */
export function accountSummary(positions, priceMap, cash = DEMO_CASH) {
  const rows = positionRows(positions, priceMap)
  const complete = rows.every((r) => r.mktValue != null)
  const gross = rows.reduce((s, r) => s + (r.mktValue ?? 0), 0)
  const nlv = complete ? cash + gross : null
  const maintenance = gross * MAINTENANCE_PCT
  return {
    accountId: DEMO_ACCOUNT_ID,
    cash,
    gross: complete ? gross : null,
    nlv,
    leverage: nlv ? gross / nlv : null,
    maintenance: complete ? maintenance : null,
    excessLiq: nlv != null ? nlv - maintenance : null,
    cushionPct: nlv ? ((nlv - maintenance) / nlv) * 100 : null,
    dayPnl: complete ? rows.reduce((s, r) => s + (r.dayPnl ?? 0), 0) : null,
    unrealPnl: complete ? rows.reduce((s, r) => s + (r.unrealPnl ?? 0), 0) : null,
  }
}

/** Shares needed to bring a symbol to a target % of NLV. */
export function sizeForWeight({ nlv, price, targetPct, currentShares = 0 }) {
  if (!nlv || !price || nlv <= 0 || price <= 0) return null
  const targetValue = (targetPct / 100) * nlv
  const targetShares = Math.round(targetValue / price)
  return {
    targetShares,
    delta: targetShares - currentShares,
    cost: (targetShares - currentShares) * price,
    targetValue,
  }
}

/** Margin-loan carry at a hypothetical leverage. Unlevered → all zeros. */
export function carryAt({ nlv, targetLeverage, ratePct = DEMO_MARGIN_RATE }) {
  const borrow = Math.max(0, (targetLeverage - 1) * (nlv || 0))
  const perYear = borrow * (ratePct / 100)
  return { borrow, perYear, perMonth: perYear / 12, perDay: perYear / 365 }
}

/** Beta-weighted P&L for a set of market shocks (in %). */
export function stressGrid(positions, priceMap, betas = DEMO_BETAS, moves = [-20, -10, -5, 5, 10]) {
  const rows = positionRows(positions, priceMap)
  return moves.map((move) => {
    const pnl = rows.reduce((s, r) => {
      if (r.mktValue == null) return s
      return s + r.mktValue * (move / 100) * (betas[r.symbol] ?? 1)
    }, 0)
    return { move, pnl }
  })
}

// mulberry32 — tiny deterministic PRNG; Math.random would repaint the
// timeline on every render.
function mulberry32(seed) {
  let a = 0
  for (let i = 0; i < seed.length; i++) a = (a * 31 + seed.charCodeAt(i)) >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY_S = 86_400

/** Seeded daily NLV walk ending exactly at endNlv (unix-second times). */
export function nlvWalk(seed, days, endNlv) {
  const rand = mulberry32(seed)
  // Build a forward walk, then rescale so the last point hits endNlv.
  const raw = [1]
  for (let i = 1; i < days; i++) {
    const step = (rand() - 0.48) * 0.018 // slight upward drift, ~±0.9% daily
    raw.push(Math.max(0.2, raw[i - 1] * (1 + step)))
  }
  const scale = endNlv / raw[raw.length - 1]
  const today = Math.floor(Date.now() / 1000 / DAY_S) * DAY_S
  return raw.map((v, i) => ({
    time: today - (days - 1 - i) * DAY_S,
    value: v * scale,
  }))
}
