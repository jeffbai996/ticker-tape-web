// Per-symbol badge row, straight from the TUI's watchlist line 2:
//   R60  27d  >50 >200  1.1xv  -2%H  +3%R
// RSI(14) · days to earnings · vs SMA50/200 · volume vs 20d avg ·
// % off 52w high · 20d return minus the benchmark's (RS vs QQQ).
// All computed from one 1Y daily chart per symbol.

import { sma, rsi } from './indicators.js'

export const RS_WINDOW = 20

/** Badges from daily closes/volumes; benchCloses may be null (RS omitted). */
export function techBadges({ closes, volumes }, benchCloses = null) {
  if (!closes?.length) return null
  const current = closes[closes.length - 1]

  const s50 = sma(closes, 50)
  const s200 = sma(closes, 200)

  let volRatio = null
  if (volumes?.length >= 21) {
    const prior = volumes.slice(-21, -1)
    const avg = prior.reduce((a, b) => a + b, 0) / prior.length
    const today = volumes[volumes.length - 1]
    if (avg > 0 && today > 0) volRatio = today / avg
  }

  const high52 = Math.max(...closes)
  const offHigh = high52 > 0 ? ((current - high52) / high52) * 100 : null

  let rs = null
  if (benchCloses?.length >= RS_WINDOW + 1 && closes.length >= RS_WINDOW + 1) {
    const ret = (current / closes[closes.length - 1 - RS_WINDOW] - 1) * 100
    const bench =
      (benchCloses[benchCloses.length - 1] / benchCloses[benchCloses.length - 1 - RS_WINDOW] - 1) * 100
    rs = ret - bench
  }

  return {
    rsi: rsi(closes),
    above50: s50 != null ? current > s50 : null,
    above200: s200 != null ? current > s200 : null,
    volRatio,
    offHigh,
    rs,
  }
}

/** Histogram spark: last n daily bars as {v: volume, up: closed green}. */
export function histoBars(bars, n = 40) {
  const tail = (bars || []).slice(-n)
  return tail.map((b, i) => {
    const prev = i > 0 ? tail[i - 1].close : b.open ?? b.close
    return { v: b.volume || 0, up: b.close >= prev }
  })
}
