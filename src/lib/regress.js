// Beta/correlation vs a benchmark, from the daily closes the app already
// fetches. Pure math — the rail feeds it two bar arrays.

/** Same-day return pairs [stock, bench] from two daily bar series. Only
 *  consecutive shared sessions count — a gap on either side drops the pair,
 *  because a 2-day move regressed against a 1-day move poisons beta. */
export function alignedReturns(stockBars, benchBars) {
  const bench = new Map((benchBars || []).map((b) => [b.t, b.c]))
  const out = []
  for (let i = 1; i < (stockBars || []).length; i += 1) {
    const cur = stockBars[i]
    const prev = stockBars[i - 1]
    const bCur = bench.get(cur.t)
    const bPrev = bench.get(prev.t)
    if (bCur == null || bPrev == null || !prev.c || !bPrev) continue
    out.push([cur.c / prev.c - 1, bCur / bPrev - 1])
  }
  return out
}

/** {beta, corr, upCapture, downCapture, n} or null when unregressable. */
export function regressStats(pairs) {
  if (!pairs || pairs.length < 2) return null
  const n = pairs.length
  const meanS = pairs.reduce((a, p) => a + p[0], 0) / n
  const meanB = pairs.reduce((a, p) => a + p[1], 0) / n
  let cov = 0
  let varB = 0
  let varS = 0
  for (const [s, b] of pairs) {
    cov += (s - meanS) * (b - meanB)
    varB += (b - meanB) ** 2
    varS += (s - meanS) ** 2
  }
  if (!varB) return null
  const beta = cov / varB
  const corr = varS ? cov / Math.sqrt(varB * varS) : 0

  const capture = (filter) => {
    const subset = pairs.filter(filter)
    const bench = subset.reduce((a, p) => a + p[1], 0)
    if (!bench) return null
    return (subset.reduce((a, p) => a + p[0], 0) / bench) * 100
  }
  return {
    beta, corr, n,
    upCapture: capture((p) => p[1] > 0),
    downCapture: capture((p) => p[1] < 0),
  }
}
