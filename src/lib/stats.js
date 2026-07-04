// Cross-symbol statistics for the Screening section — pure functions.

export function dailyReturns(closes) {
  const out = []
  for (let i = 1; i < closes.length; i++) out.push(closes[i] / closes[i - 1] - 1)
  return out
}

export function pearson(xs, ys) {
  const n = Math.min(xs?.length ?? 0, ys?.length ?? 0)
  if (n < 2) return null
  const x = xs.slice(-n)
  const y = ys.slice(-n)
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my)
    dx += (x[i] - mx) ** 2
    dy += (y[i] - my) ** 2
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

/** Rebase closes to percent change from the first value. */
export function normalize(closes) {
  if (!closes?.length) return []
  const base = closes[0]
  return closes.map((c) => (c / base - 1) * 100)
}
