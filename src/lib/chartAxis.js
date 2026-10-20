/** Axis helpers for the chat's inline charts: round value steps and short
 *  date labels, so an axis reads 80 / 100 / 120 rather than 73.0 / 100.4. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const decimals = (step) => (step >= 1 ? 0 : Math.ceil(-Math.log10(step) - 1e-9))
const round = (v, digits) => Number(v.toFixed(digits))

/** A value scale on steps of 1, 2 or 5 times a power of ten. Of the steps
 *  that give about `target` intervals, the one that wastes least room wins. */
export function niceScale(min, max, target = 4) {
  let lo = Math.min(min, max), hi = Math.max(min, max)
  if (!(hi > lo)) { const pad = Math.abs(lo) * 0.01 || 1; lo -= pad; hi += pad }
  const base = 10 ** Math.floor(Math.log10((hi - lo) / target))
  let best = null
  for (const mag of [base / 10, base, base * 10]) {
    for (const m of [1, 2, 5]) {
      const step = round(m * mag, 12)
      const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step
      const count = Math.round((b - a) / step)
      const score = [Math.abs(count - target), (lo - a) + (b - hi)]
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) best = { step, a, b, count, score }
    }
  }
  const digits = decimals(best.step)
  const ticks = Array.from({ length: best.count + 1 }, (_, k) => round(best.a + k * best.step, digits))
  return { lo: ticks[0], hi: ticks[ticks.length - 1], step: best.step, ticks, digits }
}

const parts = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return { y, m, d } }

/** "Jul 20" / "7月20日". */
export function shortDate(iso, locale = 'en') {
  const { m, d } = parts(iso)
  return locale === 'zh' ? `${m}月${d}日` : `${MONTHS[m - 1]} ${d}`
}

function monthLabel(iso, withYear, locale) {
  const { y, m } = parts(iso)
  if (locale === 'zh') return withYear ? `${y}年${m}月` : `${m}月`
  return withYear ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1]
}

/** Tick positions for a run of ISO dates. Spans over about six weeks are
 *  labelled at the first session of each month; shorter ones get evenly
 *  spaced short dates. */
export function dateTicks(dates = [], { locale = 'en', max } = {}) {
  const n = dates.length
  if (!n) return []
  const spanDays = (Date.parse(dates[n - 1]) - Date.parse(dates[0])) / 86400000
  if (spanDays > 45) {
    let ticks = []
    for (let i = 1; i < n; i++) {
      const prev = parts(dates[i - 1]), cur = parts(dates[i])
      if (cur.m !== prev.m) ticks.push({ index: i, label: monthLabel(dates[i], cur.y !== prev.y, locale) })
    }
    const limit = max || 6
    if (ticks.length > limit) {
      const every = Math.ceil(ticks.length / limit)
      ticks = ticks.filter((t, k) => k % every === 0 || /\d{4}/.test(t.label))
    }
    return ticks
  }
  const count = Math.min(max || 4, n)
  const idx = count === 1 ? [0] : [...new Set(Array.from({ length: count }, (_, k) => Math.round((k * (n - 1)) / (count - 1))))]
  return idx.map((index) => ({ index, label: shortDate(dates[index], locale) }))
}
