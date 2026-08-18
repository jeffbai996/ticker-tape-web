/** "Day" P&L that follows the tape, not the calendar.
 *
 *  Yahoo's regular-session `pct` describes the LAST COMPLETED session until
 *  the next open — so at 05:30 ET the portfolio page still said +5.8% from
 *  Monday while pre-market was red (Jeff 2026-08-18: "showing previous days
 *  P/L, im in the red now"). The broker's day P&L is "since the last close,
 *  marked at the latest print", so:
 *    PM (a new session day, before the open) → the pre-market move vs the
 *      last regular close — that IS the day so far.
 *    AH / ON (after today's close)           → today's session compounded
 *      with the extended move — still today.
 *    no extended print                        → the regular session move.
 *  Pure; returns a percent (or null when nothing prices the day).
 */
export function sessionDayPct(q) {
  if (!q) return null
  const ext = q.extPct
  const reg = q.pct
  if (q.extLabel === 'PM' && ext != null && q.extPrice != null) return ext
  if ((q.extLabel === 'AH' || q.extLabel === 'ON') && ext != null && q.extPrice != null) {
    if (reg == null) return ext
    return ((1 + reg / 100) * (1 + ext / 100) - 1) * 100
  }
  return reg ?? null
}

/** Money on the move: the value that was at risk since the last close is
 *  today's value discounted by the move, not today's value itself. */
export function dayPnlFromValue(mktValue, dayPct) {
  if (mktValue == null || dayPct == null) return null
  const base = mktValue / (1 + dayPct / 100)
  return mktValue - base
}
