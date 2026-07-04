// Session VWAP series from intraday bars: cumulative Σ(typical·vol) / Σvol.

export function vwapSeries(bars) {
  let pv = 0
  let vol = 0
  const out = []
  for (const b of bars || []) {
    const v = b.volume || 0
    if (v > 0) {
      const typical = (b.high + b.low + b.close) / 3
      pv += typical * v
      vol += v
    }
    out.push({ time: b.time, value: vol > 0 ? pv / vol : (b.high + b.low + b.close) / 3 })
  }
  return out
}
