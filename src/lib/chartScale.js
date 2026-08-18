/** Who gets to stretch the price scale.
 *
 *  lightweight-charts fits the price scale to every series in view. On a
 *  2-day 1-minute chart that includes the moving averages, and an SMA200 at
 *  today's open is an average of YESTERDAY's prices — so after a -5% day the
 *  scale spans yesterday's level and today's candles are squeezed into the
 *  bottom quarter of the pane, no matter how far you zoom in (Jeff
 *  2026-08-18: "it stays squeezed because of the previous days data which is
 *  now out of view").
 *
 *  A terminal's answer is "scale price chart only" — indicators clip. That
 *  fixes the squeeze but throws away the thing an MA is for: seeing where
 *  price sits relative to it. So overlays keep a BOUNDED vote: they may
 *  stretch the scale past the visible price range by OVERLAY_STRETCH of that
 *  range and no further. An MA drifting toward price stays visible and pulls
 *  the scale a little; one anchored 7% away clips at the edge instead of
 *  flattening the bars.
 *
 *  Everything here is pure so the numbers are reviewable; the chart
 *  components only supply "what does the price series occupy right now".
 */

/** Fraction of the visible price span an overlay may add to each side. */
export const OVERLAY_STRETCH = 0.2

/** A flat window (one bar, or a halted name) has no span to scale by; give it
 *  a sliver so the allowance stays finite instead of admitting everything. */
const FLAT_SPAN_FRACTION = 0.002

function priceOf(bar) {
  if (!bar) return null
  const high = bar.high ?? bar.value ?? bar.close
  const low = bar.low ?? bar.value ?? bar.close
  if (typeof high !== 'number' || typeof low !== 'number') return null
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null
  return { high, low }
}

/** Min/max of the price series across a visible LOGICAL range (fractional
 *  indices, as lightweight-charts reports them). Rounds outward — a half-shown
 *  bar is on screen — and clamps to the data. Null when nothing is measurable. */
export function windowPriceRange(bars, from, to) {
  if (!Array.isArray(bars) || !bars.length) return null
  const lo = Math.max(0, Math.floor(Math.min(from, to)))
  const hi = Math.min(bars.length - 1, Math.ceil(Math.max(from, to)))
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) return null
  let min = Infinity
  let max = -Infinity
  for (let i = lo; i <= hi; i++) {
    const p = priceOf(bars[i])
    if (!p) continue
    if (p.low < min) min = p.low
    if (p.high > max) max = p.high
  }
  return min === Infinity ? null : { min, max }
}

/** Trim an overlay's own range to what the price window allows. Returns null
 *  when the overlay lies entirely outside the allowance — the caller then
 *  leaves it out of the autoscale altogether. */
export function clampOverlayRange(range, window, stretch = OVERLAY_STRETCH) {
  if (!range || !window) return null
  const { minValue, maxValue } = range
  if (typeof minValue !== 'number' || typeof maxValue !== 'number') return null
  const span = Math.max(window.max - window.min,
                        Math.abs(window.max) * FLAT_SPAN_FRACTION)
  const floor = window.min - span * stretch
  const ceiling = window.max + span * stretch
  const lo = Math.max(minValue, floor)
  const hi = Math.min(maxValue, ceiling)
  return hi > lo ? { minValue: lo, maxValue: hi } : null
}

/** The `autoscaleInfoProvider` an overlay series hands to lightweight-charts.
 *  `getWindow()` returns the price series' current on-screen range, or null
 *  while that is unknowable (first paint, chart torn down) — in which case the
 *  overlay sits the vote out rather than squeezing the bars on a guess. */
export function overlayAutoscale(getWindow, stretch = OVERLAY_STRETCH) {
  return (baseImplementation) => {
    let base = null
    try {
      base = baseImplementation?.()
    } catch { return null }
    if (!base?.priceRange) return null
    let window = null
    try {
      window = getWindow?.()
    } catch { return null }
    const priceRange = clampOverlayRange(base.priceRange, window, stretch)
    return priceRange ? { ...base, priceRange } : null
  }
}

/** Autoscale runs on every frame of a pinch; measuring the window must not.
 *  One-entry memo keyed on the logical range — the window only changes when
 *  the user actually moves the chart. */
export function memoWindow(bars, measure = windowPriceRange) {
  let key = null
  let value = null
  return (from, to) => {
    const next = `${from}:${to}`
    if (next !== key) {
      key = next
      value = measure(bars, from, to)
    }
    return value
  }
}
