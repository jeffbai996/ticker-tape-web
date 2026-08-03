// Indicator SERIES for the chart suite — indicators.js answers "what is RSI
// now", these answer "what was it at every bar". Same math (Wilder RSI,
// SMA-seeded EMA), emitted as {time, value} rows lightweight-charts eats.

export function smaSeries(bars, n) {
  const out = []
  let sum = 0
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close
    if (i >= n) sum -= bars[i - n].close
    if (i >= n - 1) out.push({ time: bars[i].time, value: sum / n })
  }
  return out
}

export function emaSeries(bars, n) {
  if (bars.length < n) return []
  const k = 2 / (n + 1)
  let e = bars.slice(0, n).reduce((a, b) => a + b.close, 0) / n
  const out = [{ time: bars[n - 1].time, value: e }]
  for (let i = n; i < bars.length; i++) {
    e = bars[i].close * k + e * (1 - k)
    out.push({ time: bars[i].time, value: e })
  }
  return out
}

export function rsiSeries(bars, n = 14) {
  if (bars.length < n + 1) return []
  let gain = 0
  let loss = 0
  for (let i = 1; i <= n; i++) {
    const d = bars[i].close - bars[i - 1].close
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgGain = gain / n
  let avgLoss = loss / n
  const point = (i) => ({
    time: bars[i].time,
    value: avgLoss === 0 ? (avgGain === 0 ? 50 : 100)
      : 100 - 100 / (1 + avgGain / avgLoss),
  })
  const out = [point(n)]
  for (let i = n + 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close
    avgGain = (avgGain * (n - 1) + Math.max(d, 0)) / n
    avgLoss = (avgLoss * (n - 1) + Math.max(-d, 0)) / n
    out.push(point(i))
  }
  return out
}

export function macdSeries(bars, fast = 12, slow = 26, signalN = 9) {
  if (bars.length < slow + signalN) return { macd: [], signal: [], hist: [] }
  const closes = bars.map((b) => b.close)
  const k = (n) => 2 / (n + 1)
  const emaArr = (vals, n) => {
    let e = vals.slice(0, n).reduce((a, b) => a + b, 0) / n
    const out = [e]
    for (let i = n; i < vals.length; i++) {
      e = vals[i] * k(n) + e * (1 - k(n))
      out.push(e)
    }
    return out
  }
  const fastS = emaArr(closes, fast)
  const slowS = emaArr(closes, slow)
  const offset = slow - fast
  const macdVals = slowS.map((s, i) => fastS[i + offset] - s)
  const sigVals = emaArr(macdVals, signalN)
  // macdVals[i] belongs to bar index slow - 1 + i
  const macd = macdVals.map((v, i) => ({ time: bars[slow - 1 + i].time, value: v }))
  const signal = sigVals.map((v, i) => ({
    time: bars[slow - 1 + signalN - 1 + i].time, value: v }))
  const bySig = new Map(signal.map((p) => [p.time, p.value]))
  const hist = macd
    .filter((p) => bySig.has(p.time))
    .map((p) => ({ time: p.time, value: p.value - bySig.get(p.time),
                   color: p.value - bySig.get(p.time) >= 0
                     ? 'rgba(63,185,80,.6)' : 'rgba(248,81,73,.6)' }))
  return { macd, signal, hist }
}

export function bollingerSeries(bars, n = 20, mult = 2) {
  const upper = []
  const mid = []
  const lower = []
  for (let i = n - 1; i < bars.length; i++) {
    const win = bars.slice(i - n + 1, i + 1).map((b) => b.close)
    const m = win.reduce((a, b) => a + b, 0) / n
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / n)
    const t = bars[i].time
    upper.push({ time: t, value: m + mult * sd })
    mid.push({ time: t, value: m })
    lower.push({ time: t, value: m - mult * sd })
  }
  return { upper, mid, lower }
}

/** Compare mode: % change vs the first close — koyfin's normalized frame. */
export function normalizedSeries(bars) {
  if (!bars.length) return []
  const base = bars[0].close
  return bars.map((b) => ({ time: b.time, value: (b.close / base - 1) * 100 }))
}
