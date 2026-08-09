/**
 * Launchpad quick actions — the prompt pills on chat's home screen.
 *
 * Pure logic, so it lives here rather than in the page: the pad's floor (it
 * must still look built when the market is shut) is a property worth pinning
 * in a test, and the page component cannot be imported by one.
 */
import { t as tt, tl } from './i18n.js'

// The live branches above all key off market activity — a print today, a 3%
// mover, an RSI extreme. On a closed weekend none of them fire, so the tail IS
// the pad, and four entries left it looking half-built (Jeff 2026-08-09). It
// now carries enough to fill the 12 slots on the deadest Sunday.
const SUGGESTIONS = [
  { key: 'chat.action_moving', k: 'mkt' },
  { key: 'chat.action_technical', k: 'mkt', needsSymbol: true },
  { key: 'chat.action_calendar', k: 'macro' },
  { key: 'chat.action_week_ahead', k: 'macro' },
  { key: 'chat.action_sector', k: 'mkt' },
  { key: 'chat.action_compare', k: 'idea', needsSymbol: true },
  { key: 'chat.action_thesis_check', k: 'idea', needsSymbol: true },
  { key: 'chat.action_valuation', k: 'idea', needsSymbol: true },
  { key: 'chat.action_rates', k: 'macro' },
  { key: 'chat.action_last_week', k: 'idea' },
  { key: 'chat.action_bear_case', k: 'idea', needsSymbol: true },
  { key: 'chat.action_research', k: 'app', needsSymbol: true },
  { key: 'chat.action_watchlist_review', k: 'app' },
  { key: 'chat.action_explain', k: 'app' },
]

/**
 * Launchpad quick actions, computed from live data so the pad stays current:
 * an earnings print today suggests its own summary, a big mover suggests its
 * own "why", the next macro event suggests its own read, the journal suggests
 * its own recall. Typed (mkt / book / app) so the chips can wear their lane.
 */
export function dynamicActions({ watchlist, quotes, earnDays, nextEvent, book, journal }) {
  const acts = []
  const push = (t, k) => { if (!acts.some((a) => a.t === t)) acts.push({ t, k }) }

  const reporting = watchlist.filter((s) => earnDays[s] === 0).slice(0, 2)
  for (const s of reporting) push(tt('chat.action_earnings_summary', { symbol: s }), 'earn')
  const soon = watchlist.filter((s) => earnDays[s] > 0 && earnDays[s] <= 3)
    .sort((a, b) => earnDays[a] - earnDays[b])[0]
  if (soon) push(tt('chat.action_earnings_preview', { symbol: soon, days: earnDays[soon] }), 'earn')

  const movers = watchlist
    .map((s) => ({ s, pct: quotes[s]?.quote?.pct, price: quotes[s]?.quote?.price }))
    .filter((x) => x.pct != null && Math.abs(x.pct) >= 3)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
  for (const m of movers.slice(0, 2)) {
    push(tt('chat.action_mover', {
      symbol: m.s, direction: tl(m.pct > 0 ? 'up' : 'down'), pct: Math.abs(m.pct).toFixed(1),
    }), 'mkt')
  }

  if (nextEvent && nextEvent.days <= 7) {
    push(tt('chat.action_event', {
      event: tl(nextEvent.rawLabel || nextEvent.label),
      when: nextEvent.days === 0 ? tl('today') : tt('common.days', { days: nextEvent.days }),
      target: tl(book ? 'my book' : 'the market'),
    }), book ? 'book' : 'macro')
  }

  if (book) {
    push(tt('chat.action_book_position'), 'book')
    push(tt('chat.action_book_risk'), 'book')
  }

  // a live alert suggestion off the top mover — the arm tool is real
  const top = movers[0]
  if (top?.price) {
    const lvl = top.pct > 0
      ? Math.ceil((top.price * 1.03) / 5) * 5
      : Math.floor((top.price * 0.97) / 5) * 5
    push(tt('chat.action_alert', { symbol: top.s, level: lvl }), 'app')
  }

  // Anomalies off the badges the feed already computes for every symbol. These
  // rank above the generic prompts because they name the thing that is
  // genuinely unusual right now, which is what you'd actually want to ask.
  const badge = (s) => quotes[s]?.tech || null
  const overnight = watchlist
    .map((s) => ({ s, pct: quotes[s]?.quote?.extPct }))
    .filter((x) => x.pct != null && Math.abs(x.pct) >= 1.5)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0]
  if (overnight) {
    push(tt('chat.action_overnight', {
      symbol: overnight.s, pct: overnight.pct.toFixed(1),
    }), 'mkt')
  }

  const spike = watchlist
    .map((s) => ({ s, r: badge(s)?.volRatio }))
    .filter((x) => x.r != null && x.r >= 2)
    .sort((a, b) => b.r - a.r)[0]
  if (spike) push(tt('chat.action_vol_spike', { symbol: spike.s, mult: spike.r.toFixed(1) }), 'mkt')

  const stretched = watchlist
    .map((s) => ({ s, rsi: badge(s)?.rsi }))
    .filter((x) => x.rsi != null && (x.rsi >= 70 || x.rsi <= 30))
    .sort((a, b) => Math.abs(b.rsi - 50) - Math.abs(a.rsi - 50))[0]
  if (stretched) push(tt('chat.action_stretched', { symbol: stretched.s, rsi: Math.round(stretched.rsi) }), 'mkt')

  const leader = watchlist
    .map((s) => ({ s, rs: badge(s)?.rs }))
    .filter((x) => x.rs != null && Math.abs(x.rs) >= 5)
    .sort((a, b) => Math.abs(b.rs) - Math.abs(a.rs))[0]
  if (leader) push(tt('chat.action_rs', { symbol: leader.s, pct: leader.rs.toFixed(1) }), 'mkt')

  const nearHigh = watchlist
    .map((s) => ({ s, off: badge(s)?.offHigh }))
    .filter((x) => x.off != null && x.off <= 3)
    .sort((a, b) => a.off - b.off)[0]
  if (nearHigh) push(tt('chat.action_near_high', { symbol: nearHigh.s, pct: nearHigh.off.toFixed(1) }), 'mkt')

  push(tt('chat.action_strongest'), 'mkt')

  // journal recall — only when there is a journal to recall from
  const lastTagged = [...(journal || [])].reverse().find((e) => e.symbols?.length)
  if (lastTagged) push(tt('chat.action_journal', { symbol: lastTagged.symbols[0] }), 'app')

  push(tt('chat.action_heatmap'), 'app')
  // The generic tail. Symbol-bearing ones borrow a name from the watchlist so
  // the pad never asks about a ticker the reader does not follow.
  const anySymbol = watchlist[0] || null
  for (const s of SUGGESTIONS) {
    if (s.needsSymbol && !anySymbol) continue
    push(tt(s.key, s.needsSymbol ? { symbol: anySymbol } : undefined), s.k)
  }
  // The FULL pool, uncapped. The pad shows a window onto it (visibleActions),
  // which is what gives refresh somewhere to go and the lane filter something
  // to filter.
  return acts
}


/** How many pills the pad shows at once. */
export const PAD_SIZE = 12

/**
 * The lanes a prompt can belong to. `dot` is a tailwind background so the
 * filter chip and the pill agree on colour without a second lookup. Red is
 * deliberately absent apart from earnings urgency — in a P&L-coloured app a
 * red dot on "compare peers" reads as a loss, not a category.
 */
export const LANES = [
  { k: 'mkt', label: 'markets', dot: 'bg-accent' },
  { k: 'earn', label: 'earnings', dot: 'bg-imminent' },
  { k: 'macro', label: 'macro', dot: 'bg-accent-2' },
  { k: 'idea', label: 'ideas', dot: 'bg-accent/50' },
  { k: 'book', label: 'book', dot: 'bg-up' },
  { k: 'app', label: 'app', dot: 'bg-muted' },
]

/** Lanes actually represented in a pool, in LANES order — so the filter row
 *  never offers a category that would come back empty. */
export function activeLanes(pool) {
  const present = new Set(pool.map((a) => a.k))
  return LANES.filter((l) => present.has(l.k))
}

/**
 * The window of the pool the pad is currently showing.
 *
 * Rotates rather than reshuffling: refresh walks forward through the pool a
 * page at a time and wraps, so every prompt is reachable and the same tap
 * twice never lands you back where you started. Rotation also keeps this a
 * pure function of (pool, lane, page) — no Math.random, so a test can pin it.
 */
export function visibleActions(pool, { lane = null, page = 0, size = PAD_SIZE } = {}) {
  const pick = lane ? pool.filter((a) => a.k === lane) : pool
  if (pick.length <= size) return pick
  const start = (((page * size) % pick.length) + pick.length) % pick.length
  return [...pick.slice(start), ...pick.slice(0, start)].slice(0, size)
}

/** Whether a refresh would actually change anything. */
export function canRefresh(pool, { lane = null, size = PAD_SIZE } = {}) {
  return (lane ? pool.filter((a) => a.k === lane) : pool).length > size
}
