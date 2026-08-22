/** A hand-built book's value line against the indices it competes with.
 *
 *  Inputs are the daily marks the overview files (see recordSnapshot) and
 *  benchmark bars from the history cache. Everything here is pure: dates in,
 *  aligned normalised series out, so the page only draws.
 */

/** ms or s epoch, or a date string → 'YYYY-MM-DD' in UTC (daily bars carry
 *  the session date; the reader's local date is close enough for a line). */
export function barDate(bar) {
  const raw = bar?.t ?? bar?.time ?? bar?.date
  if (raw == null) return null
  if (typeof raw === 'string') return raw.slice(0, 10)
  const ms = raw > 1e12 ? raw : raw * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

/** Every benchmark close carried forward onto the mark dates: a holiday on
 *  one exchange still has a value on the other's trading day. Dates before
 *  the first bar are null. */
export function alignToDates(bars, dates) {
  const byDate = new Map()
  for (const b of bars || []) {
    const d = barDate(b)
    const c = Number(b?.close ?? b?.c)
    if (d && Number.isFinite(c)) byDate.set(d, c)
  }
  const sorted = [...byDate.keys()].sort()
  const out = []
  let i = 0
  let last = null
  for (const d of dates) {
    while (i < sorted.length && sorted[i] <= d) { last = byDate.get(sorted[i]); i++ }
    out.push(last)
  }
  return out
}

/** First finite value = 100; nulls stay null. */
export function normalizeTo100(values) {
  const base = values.find((v) => v != null && Number.isFinite(v) && v > 0)
  if (base == null) return values.map(() => null)
  // four decimals: enough for a line, none of the 110.00000000000001 noise
  return values.map((v) => (v == null || !Number.isFinite(v) ? null : Math.round((v / base) * 1e6) / 1e4))
}

/** Return from the first finite value to the last, in percent. */
export function spanReturn(values) {
  const finite = values.filter((v) => v != null && Number.isFinite(v))
  if (finite.length < 2 || finite[0] <= 0) return null
  return ((finite[finite.length - 1] / finite[0]) - 1) * 100
}

/** The chart's data: the book's marks (one currency) plus each benchmark
 *  aligned to the same dates, all normalised to 100 at the first mark. */
export function buildPerformance(snapshots, benchmarks = []) {
  const marks = (snapshots || []).filter((s) => s && s.d && Number.isFinite(s.v))
  const dates = marks.map((s) => s.d)
  const book = marks.map((s) => s.v)
  const series = [
    { id: 'book', values: normalizeTo100(book), raw: book, ret: spanReturn(book) },
    ...benchmarks.map((b) => {
      const aligned = alignToDates(b.bars, dates)
      return { id: b.id, label: b.label, values: normalizeTo100(aligned), raw: aligned, ret: spanReturn(aligned) }
    }),
  ]
  return { dates, series }
}
