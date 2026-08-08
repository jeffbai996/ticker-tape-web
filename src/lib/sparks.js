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

/** How far back the spark looks, in trading sessions (Jeff 2026-08-07). The
 *  feed already caches a year of dailies, so every window is a free slice. */
export const SPARK_WINDOWS = [
  { id: '1M', sessions: 21 },
  { id: '3M', sessions: 63 },
  { id: '6M', sessions: 126 },
  { id: '1Y', sessions: 252 },
]

export const DEFAULT_WINDOW = '3M'

/** Bar-shaped sparks stop reading below ~2px a bar, so a long window buckets
 *  into weeks instead of drawing 252 hairlines into 168px. */
export const MAX_DRAWN_BARS = 60

export function isSparkType(id) {
  return SPARK_TYPES.some((t) => t.id === id)
}

export function isSparkWindow(id) {
  return SPARK_WINDOWS.some((w) => w.id === id)
}

/** The tail of the cached series for a window id; unknown ids fall back to the
 *  default rather than showing everything. */
export function sparkWindow(bars, id = DEFAULT_WINDOW) {
  const win = SPARK_WINDOWS.find((w) => w.id === id)
    || SPARK_WINDOWS.find((w) => w.id === DEFAULT_WINDOW)
  return (bars || []).slice(-win.sessions)
}

/** Aggregate consecutive sessions into at most `maxBars` buckets: volume sums,
 *  the range spans the bucket, and direction compares bucket close to the one
 *  before it — the same read a weekly bar gives you. */
export function bucketBars(bars, maxBars = MAX_DRAWN_BARS) {
  const src = bars || []
  if (src.length <= maxBars) return src
  const size = Math.ceil(src.length / maxBars)
  const out = []
  for (let i = 0; i < src.length; i += size) {
    const slice = src.slice(i, i + size)
    const highs = slice.map((b) => b.h).filter((v) => v != null)
    const lows = slice.map((b) => b.l).filter((v) => v != null)
    const close = slice[slice.length - 1].c ?? null
    const prev = out.length ? out[out.length - 1].c : slice[0].c
    out.push({
      // `n` lets a consumer read the MEAN instead of the sum. The final
      // bucket usually holds fewer sessions than the rest, so a summed bar
      // renders artificially short there — which is what made thin-volume
      // series (metals) look spiky rather than merely uneven.
      n: slice.length,
      v: slice.reduce((sum, b) => sum + (b.v || 0), 0),
      c: close,
      h: highs.length ? Math.max(...highs) : close,
      l: lows.length ? Math.min(...lows) : close,
      up: close != null && prev != null ? close >= prev : true,
    })
  }
  return out
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
