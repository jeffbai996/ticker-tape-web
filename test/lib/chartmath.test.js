import { describe, it, expect } from 'vitest'
import { smaSeries, emaSeries, rsiSeries, macdSeries, bollingerSeries,
         normalizedSeries } from '../../src/lib/chartmath.js'
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
