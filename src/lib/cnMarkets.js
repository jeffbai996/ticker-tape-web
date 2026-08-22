/** What a Hong Kong / mainland holder needs at a glance, as pure functions:
 *  which venue a symbol trades on, whether that venue is open right now
 *  (and when it next opens), A-share limit-up / limit-down flags, and how
 *  much of today's move is really the currency moving under a CNY-denominated
 *  book. No fetches here; the page feeds quotes in. */

export function venueOfSymbol(symbol) {
  const s = String(symbol || '').toUpperCase()
  if (s.endsWith('.HK')) return 'HK'
  if (s.endsWith('.SS') || s.endsWith('.SZ')) return 'CN'
  if (/\.(TO|V|NE)$/.test(s)) return 'CA'
  if (/\.(T|KS|KQ|TW|TWO|L|PA|AS|DE|F|MI|MC|SW|ST|CO|SI|AX|NS|BO|SA)$/.test(s)) return 'OTHER'
  return 'US'
}

export const VENUE_LABEL = { HK: 'Hong Kong', CN: 'A-shares', US: 'US', CA: 'Canada', OTHER: 'Other' }

// session tables in the venue's own clock; [open, close] pairs, HH:MM
const SESSIONS = {
  HK: { tz: 'Asia/Hong_Kong', blocks: [['09:30', '12:00'], ['13:00', '16:00']] },
  CN: { tz: 'Asia/Shanghai', blocks: [['09:30', '11:30'], ['13:00', '15:00']] },
  US: { tz: 'America/New_York', blocks: [['09:30', '16:00']] },
  CA: { tz: 'America/Toronto', blocks: [['09:30', '16:00']] },
}

function localParts(now, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' })
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]))
  const hm = `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
  return { weekday: parts.weekday, hm }
}

/** {state: 'open'|'lunch'|'pre'|'closed', venue, hm} for a venue at `now`.
 *  Weekend and holiday-agnostic beyond Sat/Sun: a closed exchange prints no
 *  fresh quote anyway, so the day figure says the same thing. */
export function marketSession(venue, now = new Date()) {
  const def = SESSIONS[venue]
  if (!def) return { venue, state: 'closed', hm: '' }
  const { weekday, hm } = localParts(now, def.tz)
  if (weekday === 'Sat' || weekday === 'Sun') return { venue, state: 'closed', hm, weekend: true }
  const [firstOpen] = def.blocks[0]
  const [, lastClose] = def.blocks[def.blocks.length - 1]
  if (hm < firstOpen) return { venue, state: 'pre', hm, opensAt: firstOpen }
  if (hm >= lastClose) return { venue, state: 'closed', hm }
  for (const [o, c] of def.blocks) if (hm >= o && hm < c) return { venue, state: 'open', hm }
  return { venue, state: 'lunch', hm, opensAt: def.blocks[1]?.[0] }
}

/** A-share daily limits by board: 20% for STAR (688) and ChiNext (300/301),
 *  10% for the main boards. 'up' / 'down' when the day move is at the limit
 *  (within 0.15pt — quotes round), else null. HK has no limits. */
export function limitFlag(symbol, pct) {
  const s = String(symbol || '').toUpperCase()
  if (pct == null || !Number.isFinite(pct) || venueOfSymbol(s) !== 'CN') return null
  const code = s.slice(0, 6)
  const limit = /^(688|689|300|301)/.test(code) ? 20 : 10
  if (pct >= limit - 0.15) return 'up'
  if (pct <= -limit + 0.15) return 'down'
  return null
}

/** Value and day P&L per venue, display currency, biggest first. */
export function venueDayBreakdown(rows) {
  const by = new Map()
  for (const r of rows || []) {
    if (!r || r.valueDisplay == null || r.kind === 'cash') continue
    const v = venueOfSymbol(r.symbol)
    const b = by.get(v) || { venue: v, value: 0, dayPnl: 0, hasDay: false, names: 0 }
    b.value += r.valueDisplay
    if (r.dayPnlDisplay != null) { b.dayPnl += r.dayPnlDisplay; b.hasDay = true }
    b.names += 1
    by.set(v, b)
  }
  const total = [...by.values()].reduce((s, b) => s + b.value, 0)
  return [...by.values()].map((b) => ({
    ...b, weightPct: total > 0 ? (b.value / total) * 100 : null,
    dayPct: b.hasDay && b.value - b.dayPnl > 0 ? (b.dayPnl / (b.value - b.dayPnl)) * 100 : null,
  })).sort((a, b) => b.value - a.value)
}

/** How much of today's book move is the currency: for each holding whose
 *  listing currency differs from the display currency, its value × today's
 *  move in (listingCcy→displayCcy). `fxPct` maps ccy → today's % change of
 *  that currency against the display currency (positive = holding currency
 *  strengthened). Returns {total, byCcy} in display currency. */
export function fxImpact(rows, fxPct, displayCcy) {
  const byCcy = {}
  let total = 0
  for (const r of rows || []) {
    if (!r || r.valueDisplay == null || r.kind === 'cash' || r.ccy === displayCcy) continue
    const pct = fxPct?.[r.ccy]
    if (pct == null || !Number.isFinite(pct)) continue
    const impact = r.valueDisplay - r.valueDisplay / (1 + pct / 100)
    byCcy[r.ccy] = (byCcy[r.ccy] || 0) + impact
    total += impact
  }
  return { total, byCcy }
}

/** Today's % move of each currency against the display currency, from the
 *  <CCY>USD=X quotes the book already streams: cross = ccyUSD / displayUSD. */
export function fxDayPct(fxLive, ccys, displayCcy) {
  const pctOf = (ccy) => (ccy === 'USD' ? 0 : fxLive?.[`${ccy}USD=X`]?.quote?.pct)
  const dPct = pctOf(displayCcy)
  const out = {}
  for (const ccy of ccys || []) {
    if (ccy === displayCcy) continue
    const p = pctOf(ccy)
    if (p == null || dPct == null) continue
    out[ccy] = ((1 + p / 100) / (1 + dPct / 100) - 1) * 100
  }
  return out
}
