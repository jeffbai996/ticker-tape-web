// Geometry for the board's spark column. Every shape is derived from the same
// cached 1Y daily bars the histogram and badges already use, so switching type
// costs nothing at the network — it's the same data read a different way
// (Jeff 2026-08-07: "different kinds of sparklines in the sparkline area").
//
// All helpers are pure and work in fractions of the viewBox they're handed,
// so the component can stay a dumb renderer.

/** What the board menu offers. `id` is what lands in localStorage. */
export const SPARK_TYPES = [
  { id: 'vol', label: 'Volume' },
  { id: 'line', label: 'Price line' },
  { id: 'area', label: 'Price area' },
  { id: 'chg', label: 'Daily change' },
  { id: 'range', label: 'Daily range' },
  { id: 'off', label: 'Off' },
]

export const DEFAULT_SPARK = 'vol'

export function isSparkType(id) {
  return SPARK_TYPES.some((t) => t.id === id)
}

const closes = (bars) => bars.map((b) => b.c).filter((v) => v != null)

/** Close-line points for an `w`×`h` viewBox, plus the window's direction.
 *  A flat series draws down the middle rather than collapsing onto the floor.
 *  Null when there aren't two closes to join. */
export function linePoints(bars, w = 130, h = 20, pad = 1) {
  const cs = closes(bars || [])
  if (cs.length < 2) return null
  const min = Math.min(...cs)
  const max = Math.max(...cs)
  const span = max - min
  const usable = h - pad * 2
  const y = (c) => (span === 0 ? pad + usable / 2 : pad + (1 - (c - min) / span) * usable)
  const step = w / (cs.length - 1)
  return {
    points: cs.map((c, i) => `${(i * step).toFixed(2)},${y(c).toFixed(2)}`).join(' '),
    up: cs[cs.length - 1] >= cs[0],
    // where the window opened — the line crossing it is the whole read
    baseline: y(cs[0]),
  }
}

/** Close-over-close returns as fractions of the window's biggest move, so the
 *  tallest bar always touches the frame and small-cap noise doesn't flatten a
 *  megacap's comb. */
export function changeBars(bars) {
  const cs = closes(bars || [])
  if (cs.length < 2) return []
  const pcts = cs.slice(1).map((c, i) => (cs[i] === 0 ? 0 : ((c - cs[i]) / cs[i]) * 100))
  const peak = Math.max(...pcts.map((p) => Math.abs(p)), 0.0001)
  return pcts.map((pct) => ({ pct, up: pct >= 0, frac: Math.abs(pct) / peak }))
}

/** Each session's high-low as a 0..1 slice of the window's full range — the
 *  volatility read the volume histogram can't give you. */
export function rangeBars(bars) {
  const usable = (bars || []).filter((b) => b.h != null && b.l != null)
  if (!usable.length) return []
  const min = Math.min(...usable.map((b) => b.l))
  const max = Math.max(...usable.map((b) => b.h))
  const span = max - min
  return usable.map((b) => ({
    lo: span === 0 ? 0.5 : (b.l - min) / span,
    hi: span === 0 ? 0.5 : (b.h - min) / span,
    up: b.up !== false,
  }))
}
