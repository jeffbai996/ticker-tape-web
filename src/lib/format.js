const DASH = '—'

// KRW/JPY-denominated listings print six-to-seven figure prices — cents on
// a ₩1,495,000 quote are noise that overflows fixed columns into the next
// field (SK hynix, Jeff 2026-08-06). Five figures and up drop the decimals.
const BIG_PRICE = 10_000

export function fmtPrice(v) {
  if (v == null || Number.isNaN(v)) return DASH
  const digits = Math.abs(v) >= BIG_PRICE ? 0 : 2
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/**
 * Price without the thousands separator — the dense rows and the watchlist
 * read as columns of digits, and a comma at four figures breaks the column
 * alignment for one row in ten (Jeff 2026-08-04). The nav bars keep commas.
 */
export function fmtPriceBare(v) {
  if (v == null || Number.isNaN(v)) return DASH
  if (Math.abs(v) >= BIG_PRICE) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return v.toFixed(2)
}

export function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return DASH
  return `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(2)}%`
}

export function fmtChange(v) {
  if (v == null || Number.isNaN(v)) return DASH
  const abs = Math.abs(v)
  if (abs >= BIG_PRICE) return `${v >= 0 ? '+' : '-'}${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  return `${v >= 0 ? '+' : '-'}${abs.toFixed(2)}`
}

/** Large money amounts: market cap, enterprise value, FCF. */
export function fmtBig(v) {
  if (v == null || Number.isNaN(v)) return DASH
  if (Math.abs(v) >= 1e12) return `${(v / 1e12).toFixed(2)}T`
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  return v.toLocaleString('en-US')
}

/** Plain ratios: P/E, PEG, beta. */
export function fmtRatio(v) {
  if (v == null || Number.isNaN(v)) return DASH
  return v.toFixed(2)
}

/** Fractions rendered as percent: margins (0.46 → "46.00%"). */
export function fmtFracPct(v) {
  if (v == null || Number.isNaN(v)) return DASH
  return `${(v * 100).toFixed(2)}%`
}

/** 0..1 position of v inside [lo, hi], clamped; null when the range is
 *  missing or degenerate (lo === hi would divide by zero). */
export function rangePos(lo, hi, v) {
  if (lo == null || hi == null || v == null || hi <= lo) return null
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
}

export function fmtVol(v) {
  if (v == null || Number.isNaN(v)) return DASH
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return String(v)
}
