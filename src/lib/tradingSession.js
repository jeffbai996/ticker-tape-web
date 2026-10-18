// Saved portfolio marks are calendar dates; a "previous trading day"
// comparison needs sessions. A weekend capture prices Friday's close, so it
// belongs to Friday's session. Exchange holidays are not modeled: books mix
// venues with different calendars, and a holiday capture simply repeats the
// prior close.

const DAY = 86400000
const stamp = (d) => Date.parse(`${d}T00:00:00Z`)
const iso = (t) => new Date(t).toISOString().slice(0, 10)

export function tradingSession(d) {
  const t = stamp(d)
  const weekday = new Date(t).getUTCDay()
  return weekday === 6 ? iso(t - DAY) : weekday === 0 ? iso(t - 2 * DAY) : d
}

export function previousTradingSession(d) {
  const t = stamp(tradingSession(d))
  return iso(t - (new Date(t).getUTCDay() === 1 ? 3 : 1) * DAY)
}

/** The latest mark from a session before `date`'s session, and whether that
 *  mark is the immediately preceding trading day. `marks` sorted by date. */
export function sessionBaseline(marks, date) {
  const session = tradingSession(date)
  let base = null
  for (const m of marks) {
    if (tradingSession(m.d) >= session) break
    base = m
  }
  return { base, adjacent: !!base && tradingSession(base.d) === previousTradingSession(date) }
}
