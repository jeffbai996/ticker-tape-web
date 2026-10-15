// US equity market session state, ET-aware — the TUI status bar's
// pre/open/post/closed/holiday logic ported to the browser.

// NYSE full closures. Weekend holidays appear as their observed weekday
// (e.g. July 4 2026 is a Saturday → observed Friday 2026-07-03).
export const HOLIDAYS = {
  '2026-01-01': 'New Year', '2026-01-19': 'MLK Day', '2026-02-16': 'Presidents Day',
  '2026-04-03': 'Good Friday', '2026-05-25': 'Memorial Day', '2026-06-19': 'Juneteenth',
  '2026-07-03': 'Independence Day', '2026-09-07': 'Labor Day',
  '2026-11-26': 'Thanksgiving', '2026-12-25': 'Christmas',
  '2027-01-01': 'New Year', '2027-01-18': 'MLK Day', '2027-02-15': 'Presidents Day',
  '2027-03-26': 'Good Friday', '2027-05-31': 'Memorial Day', '2027-06-18': 'Juneteenth',
  '2027-07-05': 'Independence Day', '2027-09-06': 'Labor Day',
  '2027-11-25': 'Thanksgiving', '2027-12-24': 'Christmas',
}

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  weekday: 'short', hour12: false,
})

const DAY_NUM = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// The session edges a countdown may honestly promise ON the day it lands.
// All four can actually happen on a trading day; once 20:00 has passed there
// is nothing left today, so the answer switches to naming the next session.
const SESSION_EDGES = [
  [240, 'pre-market opens in {t}'],
  [570, 'session opens in {t}'],
  [960, 'session closes in {t}'],
  [1200, 'after-hours ends in {t}'],
]

// Calendar-day arithmetic on ET date strings (UTC noon keeps DST out of it).
const isoAddDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const isoDow = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay()

/** The next session edge the status chip may name, date-aware (A31 F2).
 *
 *  Same trading day before its last edge → {event, minutes}: a countdown to
 *  an edge that will actually happen today. Anywhere else — weekend, holiday,
 *  or after the 20:00 after-hours close — there is no session left today, so
 *  the answer names the NEXT real one: {day, time} (its pre-market open).
 *  The old walk read only the time of day and promised "session opens in 4h"
 *  on a Saturday; that is gone. */
export function nextSessionInfo(date = new Date()) {
  const { iso, day, hh, mm } = etParts(date)
  if (day >= 1 && day <= 5 && !HOLIDAYS[iso]) {
    const mins = hh * 60 + mm
    for (const [edge, event] of SESSION_EDGES) {
      if (mins < edge) return { event, minutes: edge - mins }
    }
  }
  let d = iso
  for (;;) {
    d = isoAddDays(d, 1)
    const dow = isoDow(d)
    if (dow >= 1 && dow <= 5 && !HOLIDAYS[d]) return { day: DOW_NAMES[dow], time: '04:00' }
  }
}

/** ET wall-clock fields for an instant: {iso, day (0=Sun), hh, mm}. */
export function etParts(date = new Date()) {
  const p = {}
  for (const { type, value } of ET_FMT.formatToParts(date)) p[type] = value
  return {
    iso: `${p.year}-${p.month}-${p.day}`,
    day: DAY_NUM[p.weekday],
    hh: Number(p.hour) % 24, // some ICU builds emit "24" at midnight
    mm: Number(p.minute),
  }
}

/**
 * Session state at an instant:
 * {state: 'pre'|'open'|'post'|'closed', holiday: string|null}.
 * Boundaries (ET): pre 04:00, open 09:30, post 16:00, closed 20:00.
 */
export function marketState(date = new Date()) {
  const { iso, day, hh, mm } = etParts(date)
  const holiday = day >= 1 && day <= 5 ? HOLIDAYS[iso] ?? null : null
  if (day === 0 || day === 6 || holiday) return { state: 'closed', holiday }
  const mins = hh * 60 + mm
  if (mins < 240) return { state: 'closed', holiday: null }
  if (mins < 570) return { state: 'pre', holiday: null }
  if (mins < 960) return { state: 'open', holiday: null }
  if (mins < 1200) return { state: 'post', holiday: null }
  return { state: 'closed', holiday: null }
}

/** Advance an intraday chart's session only at the 09:30 ET cash open.
 *  Pre-market keeps yesterday's completed line; post-market keeps today's.
 *  This transition is what lets a long-lived dashboard clear once per day
 *  without also blanking itself at the closing bell. */
export function rollCashSession(current, date = new Date()) {
  const parts = etParts(date)
  return marketState(date).state === 'open' ? parts.iso : current
}

/**
 * Blue Ocean's overnight equity session: Sunday 20:00 ET → Friday 20:00 ET,
 * i.e. the hours between the 20:00 after-hours close and the 04:00 pre-market
 * open. Yahoo's v7 batch has no overnight field — its postMarketPrice freezes
 * at the 20:00 print — so the clock, not the payload, is what tells us which
 * session a stale extended print belongs to.
 */
export function isOvernight(date = new Date()) {
  const { day, hh, mm } = etParts(date)
  const mins = hh * 60 + mm
  if (day === 6) return false                    // Saturday: shut all day
  if (day === 0) return mins >= 1200             // Sunday: reopens 20:00
  if (day === 5) return mins < 240               // Friday: closes at 20:00
  return mins >= 1200 || mins < 240
}
