// Briefing + memo assembly — the CLI's assemble_briefing() ported to run on
// the feed cache. Pure functions: callers pass quotes in, text comes out.
// The rendered text doubles as the AI synthesis prompt body, so everything
// the model sees is also what the user sees.

import { pulseStats } from './pulse.js'

const MAX_MOVERS = 5
const EARNINGS_HORIZON_DAYS = 14

/** Build briefing sections from live feed data. All inputs optional-safe. */
export function assembleBriefing({ watchlist = [], quotes = {}, indices = [], indexQuotes = {}, earnDays = {}, econEvents = [] }) {
  const valid = watchlist
    .map((s) => quotes[s]?.quote)
    .filter((q) => q && q.price > 0 && q.pct != null)

  const byPct = [...valid].sort((a, b) => b.pct - a.pct)
  const movers = {
    gainers: byPct.filter((q) => q.pct > 0).slice(0, MAX_MOVERS)
      .map((q) => ({ symbol: q.symbol, pct: q.pct, price: q.price })),
    losers: byPct.filter((q) => q.pct < 0).reverse().slice(0, MAX_MOVERS)
      .map((q) => ({ symbol: q.symbol, pct: q.pct, price: q.price })),
  }

  const macro = indices
    .map(({ symbol, label }) => {
      const q = indexQuotes[symbol]?.quote
      return q ? { label, price: q.price, pct: q.pct } : null
    })
    .filter(Boolean)

  const earnings = Object.entries(earnDays)
    .filter(([, d]) => d != null && d <= EARNINGS_HORIZON_DAYS)
    .map(([symbol, days]) => ({ symbol, days }))
    .sort((a, b) => a.days - b.days)

  // Technical extremes — the setups worth a sentence in a morning note.
  const techNotes = []
  for (const s of watchlist) {
    const t = quotes[s]?.tech
    if (!t) continue
    const notes = []
    if (t.rsi != null && (t.rsi >= 70 || t.rsi <= 30)) notes.push(`RSI ${Math.round(t.rsi)}`)
    if (t.volRatio != null && t.volRatio >= 2) notes.push(`${t.volRatio.toFixed(1)}x avg volume`)
    if (t.offHigh != null && t.offHigh <= -15) notes.push(`${Math.round(t.offHigh)}% off 52w high`)
    if (notes.length) techNotes.push({ symbol: s, notes })
  }

  return {
    macro,
    movers,
    pulse: pulseStats(valid),
    earnings,
    techNotes,
    calendar: econEvents.slice(0, 5),
  }
}

const pctStr = (p) => `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`

/** Render sections as the plain-text block shown to the user AND fed to AI. */
export function renderBriefing(s) {
  const lines = []

  if (s.macro.length) {
    lines.push('MACRO')
    for (const m of s.macro) lines.push(`  ${m.label} ${m.price.toFixed(2)} ${pctStr(m.pct)}`)
    lines.push('')
  }

  if (s.pulse) {
    lines.push('WATCHLIST PULSE')
    lines.push(`  advancers/decliners ${s.pulse.adv}/${s.pulse.dec} · avg ${pctStr(s.pulse.avg)} · >2% movers ${s.pulse.movers}/${s.pulse.total}`)
    lines.push('')
  }

  const fmtMover = (m) => `  ${m.symbol} ${pctStr(m.pct)} (${m.price.toFixed(2)})`
  if (s.movers.gainers.length) {
    lines.push('TOP GAINERS')
    s.movers.gainers.forEach((m) => lines.push(fmtMover(m)))
  }
  if (s.movers.losers.length) {
    lines.push('TOP LOSERS')
    s.movers.losers.forEach((m) => lines.push(fmtMover(m)))
  }
  if (s.movers.gainers.length || s.movers.losers.length) lines.push('')

  if (s.techNotes.length) {
    lines.push('TECHNICAL FLAGS')
    for (const n of s.techNotes) lines.push(`  ${n.symbol}: ${n.notes.join(', ')}`)
    lines.push('')
  }

  if (s.earnings.length) {
    lines.push('EARNINGS AHEAD')
    for (const e of s.earnings) {
      lines.push(`  ${e.symbol} reports in ${e.days}d`)
    }
    lines.push('')
  }

  if (s.calendar.length) {
    lines.push('MACRO CALENDAR')
    for (const e of s.calendar) lines.push(`  ${e.type} — ${e.label} in ${e.days}d`)
  }

  return lines.join('\n').trim()
}

export const BRIEFING_SYSTEM =
  'You are a trading briefing assistant inside ticker-tape-web, a public demo ' +
  'market dashboard. You have no access to personal, account, or portfolio ' +
  'data — only the market data provided. Be direct, specific, and actionable. ' +
  'No hedging, no disclaimers.'

export function briefingPrompt(briefingText) {
  return (
    `Here is my market briefing data:\n\n${briefingText}\n\n` +
    'Give me the 3 most important things to know right now, plus any notable ' +
    'setups worth watching. Be direct and specific. Use short sections.'
  )
}

/** One-click research memo prompt from whatever data the page has loaded. */
export function memoPrompt(symbol, { quote, tech, analysts, earnings, earnDays } = {}) {
  const facts = [`Symbol: ${symbol}`]
  if (quote?.price != null) facts.push(`Price: ${quote.price.toFixed(2)} (${pctStr(quote.pct ?? 0)} today)`)
  if (tech) {
    const t = []
    if (tech.rsi != null) t.push(`RSI ${Math.round(tech.rsi)}`)
    if (tech.above50 != null) t.push(`${tech.above50 ? 'above' : 'below'} 50dma`)
    if (tech.above200 != null) t.push(`${tech.above200 ? 'above' : 'below'} 200dma`)
    if (tech.volRatio != null) t.push(`${tech.volRatio.toFixed(1)}x avg volume`)
    if (tech.offHigh != null) t.push(`${Math.round(tech.offHigh)}% off 52w high`)
    if (tech.rs != null) t.push(`20d RS vs QQQ ${tech.rs >= 0 ? '+' : ''}${Math.round(tech.rs)}pp`)
    if (t.length) facts.push(`Technicals: ${t.join(', ')}`)
  }
  if (earnDays != null) facts.push(`Next earnings: in ${earnDays}d`)
  if (earnings?.beatRate != null) {
    facts.push(`Earnings history: beat rate ${Math.round(earnings.beatRate * 100)}%` +
      (earnings.avgReaction != null ? `, avg post-print reaction ${pctStr(earnings.avgReaction)}` : ''))
  }
  if (analysts?.mean != null) {
    facts.push(`Analyst price target: mean ${analysts.mean}` +
      (analysts.high != null ? ` (range ${analysts.low}–${analysts.high})` : ''))
  }
  return (
    `Write a concise research memo on ${symbol} using these facts:\n\n` +
    facts.map((f) => `- ${f}`).join('\n') +
    '\n\nStructure: current setup (2-3 sentences), bull case, bear case, ' +
    'what to watch next. Ground every claim in the facts above or clearly ' +
    'label it as general knowledge. Keep it under 300 words.'
  )
}
