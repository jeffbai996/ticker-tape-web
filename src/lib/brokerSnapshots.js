// Daily NLV marks for a broker account, so the shared Trend card has a history
// on the IBKR page too. Same mark shape as myPortfolios snapshots: one per
// local date, the day's last reading wins. Per device, like the family page.
const KEY = 'broker_nlv_marks_v1'
const MAX = 400
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch { return {} }
}

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function brokerSnapshots(account) {
  const marks = load()[account]
  return Array.isArray(marks) ? marks : []
}

/** File today's NLV for `account`. Returns the mark written, or null. */
export function recordBrokerSnapshot(account, value, ccy, date = localDate()) {
  if (!account || !Number.isFinite(value) || value < 0 || typeof ccy !== 'string' || !/^[A-Z]{3}$/.test(ccy) || !DATE_RE.test(date)) return null
  const all = load()
  const marks = Array.isArray(all[account]) ? all[account] : []
  const mark = { d: date, v: Math.round(value * 100) / 100, c: ccy }
  const last = marks[marks.length - 1]
  if (last && last.d === date) {
    if (last.c === ccy && Math.abs(last.v - mark.v) < 0.005) return null
    marks[marks.length - 1] = mark
  } else if (last && last.d > date) {
    return null
  } else {
    marks.push(mark)
  }
  all[account] = marks.slice(-MAX)
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { return null }
  return mark
}
