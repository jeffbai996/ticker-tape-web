// Technical indicators as pure functions over close arrays (oldest → newest).
// All return null when there isn't enough history — callers render a dash.

export function sma(values, n) {
  if (!values || values.length < n) return null
  const window = values.slice(-n)
  return window.reduce((a, b) => a + b, 0) / n
}

export function ema(values, n) {
  if (!values || values.length < n) return null
  const k = 2 / (n + 1)
  // Seed with the SMA of the first n values, then roll forward.
  let e = values.slice(0, n).reduce((a, b) => a + b, 0) / n
  for (let i = n; i < values.length; i++) e = values[i] * k + e * (1 - k)
  return e
}

export function rsi(closes, n = 14) {
  if (!closes || closes.length < n + 1) return null
  let gain = 0
  let loss = 0
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgGain = gain / n
  let avgLoss = loss / n
  // Wilder smoothing over the remainder of the series.
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (n - 1) + Math.max(d, 0)) / n
    avgLoss = (avgLoss * (n - 1) + Math.max(-d, 0)) / n
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

function emaSeries(values, n) {
  const k = 2 / (n + 1)
  const out = []
  let e = values.slice(0, n).reduce((a, b) => a + b, 0) / n
  out.push(e)
  for (let i = n; i < values.length; i++) {
    e = values[i] * k + e * (1 - k)
    out.push(e)
  }
  return out
}

export function macd(closes, fast = 12, slow = 26, signalN = 9) {
  if (!closes || closes.length < slow + signalN) return null
  const fastS = emaSeries(closes, fast)
  const slowS = emaSeries(closes, slow)
  // Align: slow series starts (slow - fast) steps later in close-index terms.
  const offset = slow - fast
  const macdLine = slowS.map((s, i) => fastS[i + offset] - s)
  const signalS = emaSeries(macdLine, signalN)
  const m = macdLine[macdLine.length - 1]
  const s = signalS[signalS.length - 1]
  return { macd: m, signal: s, hist: m - s }
}

export function bollinger(closes, n = 20, mult = 2) {
  if (!closes || closes.length < n) return null
  const window = closes.slice(-n)
  const mid = window.reduce((a, b) => a + b, 0) / n
  const variance = window.reduce((a, b) => a + (b - mid) ** 2, 0) / n
  const sd = Math.sqrt(variance)
  return { mid, upper: mid + mult * sd, lower: mid - mult * sd }
}
