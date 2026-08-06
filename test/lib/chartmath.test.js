import { describe, it, expect } from 'vitest'
import { smaSeries, emaSeries, rsiSeries, macdSeries, bollingerSeries,
         normalizedSeries, warmedBars, trimToWindow } from '../../src/lib/chartmath.js'
import { rsi, macd, bollinger } from '../../src/lib/indicators.js'

const bars = Array.from({ length: 60 }, (_, i) => ({
  time: 1000 + i, close: 100 + Math.sin(i / 4) * 8 + i * 0.3,
}))
const closes = bars.map((b) => b.close)

describe('chartmath series agree with indicators.js latest values', () => {
  it('sma', () => {
    const s = smaSeries(bars, 20)
    expect(s[s.length - 1].value).toBeCloseTo(
      closes.slice(-20).reduce((a, b) => a + b, 0) / 20)
    expect(s[0].time).toBe(bars[19].time)
  })
  it('rsi (Wilder) matches at the tail', () => {
    const s = rsiSeries(bars, 14)
    expect(s[s.length - 1].value).toBeCloseTo(rsi(closes, 14))
  })
  it('macd matches at the tail', () => {
    const s = macdSeries(bars)
    const ref = macd(closes)
    expect(s.macd[s.macd.length - 1].value).toBeCloseTo(ref.macd)
    expect(s.signal[s.signal.length - 1].value).toBeCloseTo(ref.signal)
    expect(s.hist[s.hist.length - 1].value).toBeCloseTo(ref.hist)
  })
  it('bollinger matches at the tail', () => {
    const s = bollingerSeries(bars, 20, 2)
    const ref = bollinger(closes, 20, 2)
    expect(s.upper[s.upper.length - 1].value).toBeCloseTo(ref.upper)
    expect(s.lower[s.lower.length - 1].value).toBeCloseTo(ref.lower)
  })
  it('normalized starts at 0%', () => {
    const s = normalizedSeries(bars)
    expect(s[0].value).toBe(0)
    expect(s[s.length - 1].value).toBeCloseTo(
      (closes[closes.length - 1] / closes[0] - 1) * 100)
  })
  it('ema seeds with sma', () => {
    const s = emaSeries(bars, 21)
    expect(s[0].time).toBe(bars[20].time)
    const tail = bars.slice(0, 21).reduce((a, b) => a + b.close, 0) / 21
    expect(s[0].value).toBeCloseTo(tail)
  })
})

describe('warm-up padding', () => {
  const bar = (time, close) => ({ time, close, open: close, high: close, low: close })
  const win = Array.from({ length: 40 }, (_, i) => bar(1000 + i, 100 + i))
  const pad = Array.from({ length: 80 }, (_, i) => bar(960 + i, 60 + i))

  it('keeps only pad bars older than the window', () => {
    const merged = warmedBars(win, pad)
    expect(merged.length).toBe(40 + 40)
    expect(merged[0].time).toBe(960)
    expect(merged[40].time).toBe(1000)
    const times = merged.map((b) => b.time)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(new Set(times).size).toBe(times.length)
  })

  it('passes through when there is no usable pad', () => {
    expect(warmedBars(win, [])).toBe(win)
    expect(warmedBars(win, win)).toBe(win)
  })

  it('lets RSI start on the window\'s very first bar', () => {
    const cold = trimToWindow(rsiSeries(win, 14), win)
    const warm = trimToWindow(rsiSeries(warmedBars(win, pad), 14), win)
    expect(cold[0].time).toBeGreaterThan(win[0].time)
    expect(warm[0].time).toBe(win[0].time)
    expect(warm[warm.length - 1].time).toBe(win[win.length - 1].time)
  })

  it('lets MACD start on the window\'s very first bar', () => {
    const warm = trimToWindow(macdSeries(warmedBars(win, pad)).macd, win)
    expect(warm[0].time).toBe(win[0].time)
  })
})
