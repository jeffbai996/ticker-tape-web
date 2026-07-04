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
