// Keep the viewport attached to real bars. lightweight-charts otherwise lets
// wheel zoom and drag create arbitrary empty logical bars beyond both edges.
export function boundedTimeScale(timeVisible = false) {
  return {
    borderColor: 'rgba(255,255,255,0.10)',
    timeVisible,
    rightOffset: 0,
    minBarSpacing: 0.5,
    fixLeftEdge: true,
    fixRightEdge: true,
    lockVisibleTimeRangeOnResize: true,
  }
}

const HANDLE_R = 3.5

/**
 * Two data points -> pixel endpoints, or null if either can't be placed.
 *
 * Null is the honest answer whenever a coordinate is missing: a trendline
 * anchored to bars outside the loaded window (switch 6M -> 1D and the older
 * endpoint is simply gone) must disappear rather than be clamped to the edge,
 * where it would draw a line the user never drew. Wrapped in try/catch because
 * the series API throws once the chart it belonged to has been disposed.
 */
export function projectSegment(points, series, timeScale) {
  if (!series || !timeScale || !Array.isArray(points) || points.length < 2) return null
  try {
    const x1 = timeScale.timeToCoordinate(points[0].time)
    const x2 = timeScale.timeToCoordinate(points[1].time)
    const y1 = series.priceToCoordinate(points[0].price)
    const y2 = series.priceToCoordinate(points[1].price)
    if (x1 == null || x2 == null || y1 == null || y2 == null) return null
    return { x1, y1, x2, y2 }
  } catch {
    return null
  }
}

/**
 * A lightweight-charts v5 series primitive drawing one straight segment.
 *
 * Primitives (not a DOM overlay) because the installed 5.1.0 exposes
 * `series.attachPrimitive`: the library then re-runs `paneViews()` on every
 * scroll, zoom and resize itself, so re-projection is free and the line can
 * never lag the candles by a frame the way a DOM overlay does.
 */
export function trendlinePrimitive({ points, color = '#22d3ee', width = 1.5 } = {}) {
  let series = null
  let timeScale = null
  let selected = false
  let requestUpdate = null

  const geometry = () => projectSegment(points, series, timeScale)

  const renderer = () => {
    const g = geometry()
    if (!g) return null
    return {
      // Media space: same units as priceToCoordinate returns, so no manual
      // devicePixelRatio maths.
      draw: (target) => target.useMediaCoordinateSpace(({ context: ctx }) => {
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = selected ? width + 1 : width
        ctx.beginPath()
        ctx.moveTo(g.x1, g.y1)
        ctx.lineTo(g.x2, g.y2)
        ctx.stroke()
        if (selected) {
          ctx.fillStyle = color
          for (const [x, y] of [[g.x1, g.y1], [g.x2, g.y2]]) {
            ctx.beginPath()
            ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        ctx.restore()
      }),
    }
  }

  const view = { zOrder: () => 'top', renderer }
  // Same array instance every call — the library caches pane views by reference.
  const views = [view]

  return {
    // ---- ISeriesPrimitive surface
    attached(param) {
      series = param.series
      timeScale = param.chart.timeScale()
      requestUpdate = param.requestUpdate
    },
    detached() {
      series = null
      timeScale = null
      requestUpdate = null
    },
    paneViews: () => views,
    updateAllViews() { /* geometry is derived on read, nothing to cache */ },

    // ---- host-side extras
    geometry,
    setSelected(v) {
      selected = !!v
      requestUpdate?.()
    },
  }
}
