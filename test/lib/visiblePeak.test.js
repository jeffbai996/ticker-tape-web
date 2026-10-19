// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { peakInRange, attachVisiblePeak } from '../../src/lib/visiblePeak.js'

const bars = [10, 40, 20, 35].map((high, time) => ({ time, high }))

describe('peak in the visible chart window', () => {
  it('changes with pan and excludes clipped edge bars', () => {
    expect(peakInRange(bars, { from: 0, to: 3 })).toBe(bars[1])
    expect(peakInRange(bars, { from: 1.2, to: 3 })).toBe(bars[3])
    expect(peakInRange(bars, { from: -9, to: 0.8 })).toBe(bars[0])
    expect(peakInRange(bars, { from: 4, to: 8 })).toBeNull()
  })
})


function peakHarness({ x = 100, y = 40, width = 300 } = {}) {
  let primitive
  const series = {
    priceToCoordinate: () => y,
    attachPrimitive: value => { primitive = value },
    detachPrimitive: value => { if (primitive === value) primitive = null },
  }
  const scale = { getVisibleLogicalRange: () => ({ from: 0, to: 3 }), timeToCoordinate: () => x }
  const chart = { timeScale: () => scale, options: () => ({ layout: { fontFamily: 'monospace' } }) }
  const texts = [], dots = []
  const ctx = {
    save() {}, restore() {}, beginPath() {}, fill() {},
    measureText: () => ({ width: 36 }),
    fillText: (...args) => texts.push(args),
    arc: (...args) => dots.push(args),
  }
  const detach = attachVisiblePeak(chart, series, null, bars)
  const paint = () => primitive.paneViews()[0].renderer().draw({
    useMediaCoordinateSpace: fn => fn({ context: ctx, mediaSize: { width, height: 150 } }),
  })
  return { paint, texts, dots, detach, series, get primitive() { return primitive } }
}

describe('visible peak annotation', () => {
  it('anchors the number baseline and four-dot leader to the candle high', () => {
    const h = peakHarness()
    h.paint()
    expect(h.texts[0][2]).toBe(40)
    expect(h.texts[0][1] + 36).toBeLessThan(100)
    expect(h.dots).toHaveLength(4)
    expect(h.dots.every(([x, y]) => x <= 100 && x > h.texts[0][1] + 36 && y === 40)).toBe(true)
  })

  it('places the label to the right at the left edge and keeps the leader at the high', () => {
    const h = peakHarness({ x: 3 })
    h.paint()
    expect(h.texts[0][1]).toBeGreaterThan(3)
    expect(h.dots.every(([x, y]) => x >= 3 && x < h.texts[0][1] && y === 40)).toBe(true)
  })

  it('uses fresh chart coordinates after a price-scale redraw', () => {
    const h = peakHarness()
    h.paint()
    h.series.priceToCoordinate = () => 70
    h.paint()
    expect(h.texts[1][2]).toBe(70)
  })

  it('does not paint outside the plot and removes the primitive on cleanup', () => {
    const h = peakHarness({ x: 310 })
    h.paint()
    expect(h.texts).toHaveLength(0)
    h.detach()
    expect(h.primitive).toBeNull()
  })
})
