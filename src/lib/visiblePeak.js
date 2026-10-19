import { fmtPrice } from './format.js'
import { chartFont } from './chartview.js'

export function peakInRange(bars, range) {
  if (!range || !bars?.length) return null
  const first = Math.max(0, Math.ceil(range.from))
  const last = Math.min(bars.length - 1, Math.floor(range.to))
  let peak = null
  for (let i = first; i <= last; i++) {
    const bar = bars[i]
    if (Number.isFinite(bar?.high) && (!peak || bar.high > peak.high)) peak = bar
  }
  return peak
}

// Render in the price pane's own coordinates. A DOM overlay outside
// .lwc-unzoom drifts under app zoom and misses price-scale-only redraws.
export function attachVisiblePeak(chart, series, _host, bars) {
  let rangeKey = null
  let peak = null
  const renderer = {
    draw(target) {
      const scale = chart.timeScale()
      const range = scale.getVisibleLogicalRange()
      const key = range ? `${Math.ceil(range.from)}:${Math.floor(range.to)}` : ''
      if (key !== rangeKey) {
        peak = peakInRange(bars, range)
        rangeKey = key
      }
      if (!peak) return
      const x = scale.timeToCoordinate(peak.time)
      const y = series.priceToCoordinate(peak.high)
      if (x == null || y == null) return
      target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
        if (x < 0 || x > mediaSize.width || y < 0 || y > mediaSize.height) return
        ctx.save()
        ctx.font = `500 ${chartFont(8)}px ${chart.options().layout.fontFamily}`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        const text = fmtPrice(peak.high)
        const width = ctx.measureText(text).width
        const step = chartFont(3)
        const leader = step * 4
        const left = x >= width + leader + 2
        if (!left && x + leader + width > mediaSize.width - 2) {
          ctx.restore()
          return
        }
        ctx.fillStyle = '#a6adb6'
        ctx.shadowColor = '#000'
        ctx.shadowBlur = 2
        ctx.fillText(text, left ? x - leader - width : x + leader, y)
        // The number baseline and leader end both land on the wick high.
        for (let i = 0; i < 4; i++) {
          ctx.beginPath()
          ctx.arc(x + (left ? -1 : 1) * i * step, y, chartFont(.5), 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      })
    },
  }
  const primitive = { paneViews: () => [{ zOrder: () => 'top', renderer: () => renderer }] }
  series.attachPrimitive(primitive)
  return () => series.detachPrimitive(primitive)
}
