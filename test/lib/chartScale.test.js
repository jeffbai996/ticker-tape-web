/** Zooming into today must fit today's bars (Jeff 2026-08-18: "it stays
 *  squeezed because of the previous days data which is now out of view").
 *
 *  The squeeze is the moving averages: on a 2-day 1-minute chart the SMA200
 *  at today's open is an average of yesterday's much higher prices, so the
 *  price scale — which fits EVERY series in view — spans yesterday's level
 *  while the candles live in the bottom quarter. Overlays now get a bounded
 *  vote: they can stretch the scale past the price range by a fixed fraction
 *  and no further; past that they clip, the way a terminal's "scale price
 *  only" does.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  OVERLAY_STRETCH, clampOverlayRange, memoWindow, overlayAutoscale, windowPriceRange,
} from '../../src/lib/chartScale.js'

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')

const candles = [
  { time: 1, open: 100, high: 104, low: 99, close: 103 },
  { time: 2, open: 103, high: 108, low: 102, close: 107 },
  { time: 3, open: 107, high: 110, low: 101, close: 102 },
  { time: 4, open: 102, high: 106, low: 100, close: 105 },
]

describe('windowPriceRange — what the price series occupies on screen', () => {
  it('reads highs and lows across the visible logical window', () => {
    expect(windowPriceRange(candles, 1, 2)).toEqual({ min: 101, max: 110 })
  })

  it('rounds a fractional range outward and clamps it to the data', () => {
    // half a bar showing on each edge still counts as that bar
    expect(windowPriceRange(candles, 0.4, 2.2)).toEqual({ min: 99, max: 110 })
    expect(windowPriceRange(candles, -50, 999)).toEqual({ min: 99, max: 110 })
  })

  it('falls back to close/value for line and area data', () => {
    expect(windowPriceRange([{ time: 1, value: 10 }, { time: 2, value: 14 }], 0, 1))
      .toEqual({ min: 10, max: 14 })
    expect(windowPriceRange([{ time: 1, close: 10 }, { time: 2, close: 14 }], 0, 1))
      .toEqual({ min: 10, max: 14 })
  })

  it('is null when there is nothing to measure', () => {
    expect(windowPriceRange([], 0, 5)).toBeNull()
    expect(windowPriceRange(null, 0, 5)).toBeNull()
    expect(windowPriceRange(candles, 10, 20)).toBeNull()   // window past the data
    expect(windowPriceRange([{ time: 1, value: null }], 0, 1)).toBeNull()
  })
})

describe('clampOverlayRange — an overlay gets a bounded vote', () => {
  const window = { min: 100, max: 110 }        // span 10, stretch 0.2 → ±2

  it('leaves an overlay that already sits inside the price range alone', () => {
    expect(clampOverlayRange({ minValue: 102, maxValue: 108 }, window))
      .toEqual({ minValue: 102, maxValue: 108 })
  })

  it('clips a moving average anchored in yesterday to the allowance', () => {
    // the real case: SMA200 at 127 while today trades 100-110
    expect(clampOverlayRange({ minValue: 105, maxValue: 127 }, window))
      .toEqual({ minValue: 105, maxValue: 112 })
  })

  it('drops an overlay that is entirely outside the allowance', () => {
    expect(clampOverlayRange({ minValue: 126, maxValue: 127 }, window)).toBeNull()
    expect(clampOverlayRange({ minValue: 40, maxValue: 60 }, window)).toBeNull()
  })

  it('gives a flat price window a workable allowance instead of dividing by zero', () => {
    const flat = { min: 100, max: 100 }
    const out = clampOverlayRange({ minValue: 99, maxValue: 130 }, flat)
    expect(out.maxValue).toBeGreaterThan(100)
    expect(out.maxValue).toBeLessThan(101)     // a sliver, not yesterday's level
  })

  it('refuses to guess without a price window or an overlay range', () => {
    expect(clampOverlayRange({ minValue: 1, maxValue: 2 }, null)).toBeNull()
    expect(clampOverlayRange(null, window)).toBeNull()
  })

  it('keeps the stretch small enough that the bars still own the pane', () => {
    expect(OVERLAY_STRETCH).toBeGreaterThan(0)
    expect(OVERLAY_STRETCH).toBeLessThanOrEqual(0.25)
  })
})

describe('overlayAutoscale — the provider handed to lightweight-charts', () => {
  it('clamps the base range against the current price window', () => {
    const provider = overlayAutoscale(() => ({ min: 100, max: 110 }))
    const base = () => ({ priceRange: { minValue: 105, maxValue: 127 }, margins: { above: 4, below: 4 } })
    expect(provider(base)).toEqual({
      priceRange: { minValue: 105, maxValue: 112 }, margins: { above: 4, below: 4 },
    })
  })

  it('sits the overlay out when the window is unknown — never squeeze on a guess', () => {
    const provider = overlayAutoscale(() => null)
    expect(provider(() => ({ priceRange: { minValue: 1, maxValue: 2 } }))).toBeNull()
  })

  it('passes through an empty base and survives a throwing window reader', () => {
    expect(overlayAutoscale(() => ({ min: 1, max: 2 }))(() => null)).toBeNull()
    const boom = overlayAutoscale(() => { throw new Error('chart is gone') })
    expect(boom(() => ({ priceRange: { minValue: 1, maxValue: 2 } }))).toBeNull()
  })
})

describe('memoWindow — autoscale runs per frame, measuring must not', () => {
  it('recomputes only when the visible window moves', () => {
    const bars = candles.map((b) => ({ ...b }))
    const spy = vi.fn(windowPriceRange)
    const at = memoWindow(bars, spy)
    const first = at(0, 2)
    expect(at(0, 2)).toBe(first)              // same object, no recompute
    expect(spy).toHaveBeenCalledTimes(1)
    at(1, 3)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe('both charts wire the bounded overlay scale', () => {
  const suite = src('src/components/ChartSuite.jsx')
  const overview = src('src/pages/research/overviewChart.jsx')

  it('every price overlay carries the provider, and the price series never does', () => {
    for (const [name, code] of [['ChartSuite', suite], ['overviewChart', overview]]) {
      expect(code, name).toContain('overlayAutoscale')
      // one shared options object, spread into each overlay series
      expect(code.match(/\.\.\.overlayScale/g)?.length, name).toBeGreaterThanOrEqual(4)
      expect(code, name).not.toMatch(/CandlestickSeries, \{[^}]*overlayScale/s)
    }
  })

  it('the price scale auto-scales and FIT re-arms it after an axis drag', () => {
    for (const [name, code] of [['ChartSuite', suite], ['overviewChart', overview]]) {
      expect(code, name).toContain('autoScale: true')
      expect(code, name).toContain('axisDoubleClickReset')
      expect(code, name).toMatch(/fitContent\(\)[\s\S]{0,200}autoScale: true/)
    }
  })
})
