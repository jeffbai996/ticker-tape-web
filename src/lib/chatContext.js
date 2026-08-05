// Per-turn chat context (CLI _build_volatile_context parity, web-friendly).
// Everything here is assembled from what the browser already has or can get
// cheaply: feed-cache quotes, the watchlist, persistent memories, mentioned-
// symbol news, and — on a wire-connected build only — the live book from the
// viewer's own fragwire /api/portfolio. Nothing personal ships in source;
// the portfolio block exists only when the user configured an endpoint.

import { getCached } from './feed.js'
import { getWatchlist } from './watchlist.js'
import { fetchNews } from './history.js'
import { memoriesForPrompt, MEMORY_PROMPT } from './chatMemory.js'
import { wireUrl } from './wire.js'

// ── portfolio snapshot, cached so chat turns don't hammer the gateway ──
let bookCache = { ts: 0, block: '' }
const BOOK_TTL = 60_000

async function portfolioBlock() {
  const base = wireUrl()
  if (!base) return ''
  if (Date.now() - bookCache.ts < BOOK_TTL) return bookCache.block
  try {
    const resp = await fetch(`${base.replace(/\/$/, '')}/api/portfolio`,
      { signal: AbortSignal.timeout(6_000) })
    const out = await resp.json()
    if (!out.ok || !out.positions?.length) throw new Error('no book')
    const lines = ['LIVE PORTFOLIO (from the connected wire; this IS the real book):']
    for (const p of out.positions) {
      lines.push(`  ${p.symbol}: ${p.shares} sh @ ${Number(p.avg_cost).toFixed(2)}`)
    }
    if (out.margin) {
      const m = out.margin
      const bits = Object.entries(m)
        .filter(([, v]) => v != null && typeof v !== 'object')
        .map(([k, v]) => `${k} ${typeof v === 'number' ? Math.round(v).toLocaleString() : v}`)
      if (bits.length) lines.push(`  margin: ${bits.join(' · ')}`)
    }
    bookCache = { ts: Date.now(), block: lines.join('\n') }
  } catch {
    bookCache = { ts: Date.now(), block: '' }
  }
  return bookCache.block
}

/** News for watchlist symbols the user just mentioned (CLI parity). */
async function mentionedNews(question, watchlist) {
  const watch = new Set(watchlist.map((s) => s.toUpperCase()))
  const mentioned = [...new Set(
    (question || '').toUpperCase().split(/[^A-Z0-9.^=-]+/).filter((w) => watch.has(w)),
  )].slice(0, 4)
  if (!mentioned.length) return ''
  const blocks = await Promise.all(mentioned.map(async (sym) => {
    try {
      const items = await fetchNews(sym)
      if (!items?.length) return ''
      return `${sym}: ` + items.slice(0, 3).map((n) => n.title).join(' | ')
    } catch { return '' }
  }))
  const got = blocks.filter(Boolean)
  return got.length ? 'RECENT NEWS for symbols just mentioned:\n' + got.join('\n') : ''
}

/**
 * Build the volatile context block appended to the system prompt each turn.
 * Async but cheap: quotes come from the feed cache, the book is TTL-cached,
 * only mentioned-symbol news may fetch (and it's TTL-cached too).
 */
export async function buildChatContext(question) {
  const watchlist = getWatchlist()
  const now = new Date()
  const parts = [
    `Current date/time: ${now.toLocaleString('en-US', {
      timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric',
      year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    })} ET`,
  ]

  const mem = memoriesForPrompt()
  if (mem) parts.push('', mem)
  parts.push('', MEMORY_PROMPT)

  parts.push('', `Watched symbols: ${watchlist.join(', ')}`)

  const quoted = watchlist
    .map((s) => ({ s, q: getCached(s)?.quote }))
    .filter((x) => x.q?.price)
  if (quoted.length) {
    parts.push('', 'Current quotes:')
    for (const { s, q } of quoted) {
      parts.push(`  ${s}: $${q.price.toFixed(2)} (${q.pct >= 0 ? '+' : ''}${q.pct.toFixed(2)}%)`)
    }
  }

  const [book, news] = await Promise.all([
    portfolioBlock(),
    mentionedNews(question, watchlist),
  ])
  if (book) parts.push('', book)
  if (news) parts.push('', news)

  return parts.join('\n')
}

// Raw JSON for UI surfaces (the chat launchpad's book cell) — same TTL idea
// as the prompt block but kept separate so a prompt-side failure doesn't
// blank the UI and vice versa.
let bookJsonCache = { ts: 0, data: null }

export async function fetchBookJson() {
  const base = wireUrl()
  if (!base) return null
  if (Date.now() - bookJsonCache.ts < BOOK_TTL) return bookJsonCache.data
  try {
    const resp = await fetch(`${base.replace(/\/$/, '')}/api/portfolio`,
      { signal: AbortSignal.timeout(6_000) })
    const out = await resp.json()
    bookJsonCache = { ts: Date.now(), data: out.ok ? out : null }
  } catch {
    bookJsonCache = { ts: Date.now(), data: null }
  }
  return bookJsonCache.data
}

/** Does this browser have a live book wired in (affects the base prompt)? */
export function hasLiveBook() {
  return !!wireUrl()
}
