// Chat tool registry: JSON-Schema defs sent to the worker, and the
// client-side executors backing them. Everything executes in the browser
// against data paths the app already uses (feed cache, Yahoo via the proxy,
// localStorage watchlist/alerts) — the worker never runs a tool, so tools add
// no new attack surface and no personal data: this is the same public market
// data and per-browser state the UI shows.

import { getCached, proxyBase } from './feed.js'
import { quoteFromV7 } from './yahoo.js'
import { fetchHistory } from './history.js'
import { sma, rsi } from './indicators.js'
import { techBadges } from './badges.js'
import { fetchEarningsDate } from './fundamentals.js'
import { fetchEarningsHistory, earningsSummary } from './earnings.js'
import { getWatchlist, watch, unwatch } from './watchlist.js'
import { addAlert, conditionText } from './alerts.js'
import { pulseStats } from './pulse.js'
import { ECON_EVENTS } from './markets.js'
import { loadCatalysts, addCatalyst, mergedEvents, CATALYST_TYPES } from './catalysts.js'
import { addMemory, editMemory, removeMemory } from './chatMemory.js'
import { addJournalEntry, searchJournal, loadJournal } from './journal.js'
import { wireServiceUrl } from './wire.js'
import { SYMBOL_ANY_CASE_RE } from './symbols.js'

const MAX_SYMBOLS = 15
const MAX_RESULT_CHARS = 4000
const QUOTE_FRESH_MS = 90_000

// v7 batch quotes need crumb auth → always the Worker, never the dev proxy.
function crumbBase() {
  if (import.meta.env.VITE_DATA_PROXY) return import.meta.env.VITE_DATA_PROXY
  const saved = localStorage.getItem('proxy_url')
  if (saved) return saved.replace(/\/$/, '')
  return 'https://yf-proxy.2phakhvpgh.workers.dev'
}

const round2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100)

const slimQuote = (q) => ({
  symbol: q.symbol,
  name: q.name,
  price: round2(q.price),
  change: round2(q.change),
  changePct: round2(q.pct),
  dayHigh: round2(q.dayHigh),
  dayLow: round2(q.dayLow),
  volume: q.volume ?? null,
  ...(q.extPrice != null ? { extHours: { label: q.extLabel, price: round2(q.extPrice), pct: round2(q.extPct) } } : {}),
})

/** Validate + upcase a symbol list arg. Exported for tests. */
export function cleanSymbols(symbols) {
  if (!Array.isArray(symbols)) return null
  const out = symbols
    .filter((s) => typeof s === 'string' && SYMBOL_ANY_CASE_RE.test(s.trim()))
    .map((s) => s.trim().toUpperCase())
  return out.length ? [...new Set(out)].slice(0, MAX_SYMBOLS) : null
}

async function fetchQuoteBatch(symbols) {
  const url = `${crumbBase()}/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}`
  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!resp.ok) throw new Error(`quotes: HTTP ${resp.status}`)
  const data = await resp.json()
  // not bare .map(quoteFromV7): map's index arg would land in the clock param
  return (data?.quoteResponse?.result || []).map((row) => quoteFromV7(row))
}

// --- executors ---------------------------------------------------------

async function getQuotes({ symbols }) {
  const syms = cleanSymbols(symbols)
  if (!syms) return { error: 'symbols must be a non-empty array of tickers' }

  const out = []
  const misses = []
  for (const s of syms) {
    const hit = getCached(s)
    if (hit?.quote && Date.now() - hit.ts < QUOTE_FRESH_MS) out.push(slimQuote(hit.quote))
    else misses.push(s)
  }
  if (misses.length) {
    const fetched = await fetchQuoteBatch(misses)
    out.push(...fetched.map(slimQuote))
    const got = new Set(fetched.map((q) => q.symbol))
    for (const s of misses) {
      if (!got.has(s)) out.push({ symbol: s, error: 'no data (unknown symbol?)' })
    }
  }
  return { quotes: out }
}

async function getTechnicals({ symbol }) {
  const syms = cleanSymbols([symbol])
  if (!syms) return { error: 'symbol required' }
  const sym = syms[0]

  const { bars } = await fetchHistory(sym, '1Y')
  if (!bars?.length) return { error: `no history for ${sym}` }
  const closes = bars.map((b) => b.close)
  const volumes = bars.map((b) => b.volume || 0)
  const price = closes[closes.length - 1]
  const b = techBadges({ closes, volumes }) || {}

  return {
    symbol: sym,
    price: round2(price),
    rsi14: round2(rsi(closes)),
    sma50: round2(sma(closes, 50)),
    sma200: round2(sma(closes, 200)),
    aboveSma50: b.above50,
    aboveSma200: b.above200,
    volumeVs20dAvg: round2(b.volRatio),
    pctOff52wHigh: round2(b.offHigh),
    return1M: closes.length > 21 ? round2((price / closes[closes.length - 22] - 1) * 100) : null,
    return3M: closes.length > 63 ? round2((price / closes[closes.length - 64] - 1) * 100) : null,
  }
}

async function getEarnings({ symbol }) {
  const syms = cleanSymbols([symbol])
  if (!syms) return { error: 'symbol required' }
  const sym = syms[0]

  const [next, quarters] = await Promise.all([
    fetchEarningsDate(sym).catch(() => null),
    fetchEarningsHistory(sym).catch(() => []),
  ])
  const s = earningsSummary(quarters)
  return {
    symbol: sym,
    nextReport: next?.date ? new Date(next.date).toISOString().slice(0, 10) : null,
    epsEstimate: next?.epsEstimate ?? null,
    lastQuarters: quarters.slice(0, 4).map((q) => ({
      quarterEnd: new Date(q.quarter).toISOString().slice(0, 10),
      epsEstimate: q.epsEstimate,
      epsActual: q.epsActual,
      surprisePct: q.surprisePct != null ? round2(q.surprisePct * 100) : null,
    })),
    beatRate: s.beatRate != null ? round2(s.beatRate * 100) : null,
    beatStreak: s.beatStreak,
  }
}

async function getMarketPulse() {
  const wl = getWatchlist()
  let quotes = wl.map((s) => getCached(s)?.quote).filter(Boolean)
  // Cold cache (chat opened directly): price the watchlist in one batch.
  if (quotes.length < wl.length / 2) quotes = await fetchQuoteBatch(wl)

  const stats = pulseStats(quotes)
  if (!stats) return { error: 'no quote data yet — try again in a few seconds' }
  const movers = [...quotes]
    .filter((q) => q?.pct != null)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 5)
    .map((q) => ({ symbol: q.symbol, changePct: round2(q.pct) }))
  return {
    watchlistSize: stats.total,
    advancers: stats.adv,
    decliners: stats.dec,
    avgChangePct: round2(stats.avg),
    medianChangePct: round2(stats.median),
    best: { symbol: stats.hi.symbol, changePct: round2(stats.hi.pct) },
    worst: { symbol: stats.lo.symbol, changePct: round2(stats.lo.pct) },
    downMoreThan3Pct: stats.stress,
    topMovers: movers,
  }
}

function getWatchlistTool() {
  return { watchlist: getWatchlist() }
}

function watchTool({ symbol }) {
  const syms = cleanSymbols([symbol])
  if (!syms) return { error: 'symbol required' }
  const next = watch(syms[0])
  return next
    ? { ok: true, watching: syms[0] }
    : { error: `${syms[0]} already watched or list full` }
}

function unwatchTool({ symbol }) {
  const syms = cleanSymbols([symbol])
  if (!syms) return { error: 'symbol required' }
  const next = unwatch(syms[0])
  return next ? { ok: true, removed: syms[0] } : { error: `${syms[0]} is not on the watchlist` }
}

function setAlertTool({ symbol, type = 'price', operator, value }) {
  const syms = cleanSymbols([symbol])
  if (!syms) return { error: 'symbol required' }
  try {
    const alert = addAlert({ symbol: syms[0], type, operator, value })
    return { ok: true, armed: conditionText(alert) }
  } catch (err) {
    return { error: String(err.message || err) }
  }
}

function getCalendarTool() {
  const today = new Date().toISOString().slice(0, 10)
  const events = mergedEvents(ECON_EVENTS, loadCatalysts(), today, 60)
  return {
    events: events.map((e) => ({
      date: e.date,
      inDays: e.days,
      type: e.type,
      label: e.label,
      ...(e.user ? { userCatalyst: true } : {}),
    })),
  }
}

function addCatalystTool({ date, symbol, type, label }) {
  try {
    const c = addCatalyst({ date, symbol, type: type || 'other', label })
    return { ok: true, catalyst: c }
  } catch (err) {
    return { error: String(err.message || err) }
  }
}

const NAV_VIEWS = {
  dashboard: '#/',
  markets: '#/markets',
  sectors: '#/markets/sectors',
  heatmap: '#/markets/heatmap',
  movers: '#/markets/movers',
  earnings: '#/markets/earnings',
  calendar: '#/markets/calendar',
  screen: '#/screen',
  alerts: '#/alerts',
  portfolio: '#/portfolio',
  briefing: '#/brief',
  research: null, // needs a symbol
}
const RESEARCH_SUBS = new Set(['chart', 'intraday', 'options', 'earnings', 'insider', 'analysts', 'news'])

/** Grace period between the answer rendering and the route changing. */
export const NAV_DELAY_MS = 1600

function navigateTool({ view, symbol, sub }) {
  if (!(view in NAV_VIEWS)) {
    return { error: `unknown view — one of: ${Object.keys(NAV_VIEWS).join(', ')}` }
  }
  let hash = NAV_VIEWS[view]
  if (view === 'research') {
    const syms = cleanSymbols([symbol])
    if (!syms) return { error: 'research needs a symbol' }
    const s = sub && RESEARCH_SUBS.has(sub) && sub !== 'chart' && sub !== 'news' ? `/${sub}` : ''
    hash = `#/research/${syms[0].toLowerCase()}${s}`
  }
  // Let the assistant's sentence land before the page changes under the
  // reader — an instant jump reads as the app glitching (Jeff 2026-08-04).
  setTimeout(() => { location.hash = hash }, NAV_DELAY_MS)
  return { ok: true, navigatedTo: hash }
}

// --- registry -----------------------------------------------------------

const sym = { type: 'string', description: 'Ticker symbol, e.g. NVDA' }

export const TOOL_DEFS = [
  {
    name: 'wire_search',
    description: 'Search the connected news wire: q = full-text search over the archive (headlines+bodies), or symbol = the latest wire events for one ticker. Returns headlines with timestamps and types.',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'full-text query (omit when using symbol)' },
        symbol: { type: 'string', description: 'ticker to pull recent wire events for' },
      },
    },
  },
  {
    name: 'get_quotes',
    description: 'Live quotes (price, day change, extended hours) for up to 15 symbols.',
    parameters: {
      type: 'object',
      properties: { symbols: { type: 'array', items: { type: 'string' }, description: 'Ticker symbols' } },
      required: ['symbols'],
    },
  },
  {
    name: 'get_technicals',
    description: 'Technical snapshot for one symbol: RSI(14), SMA50/200, volume vs 20d avg, % off 52w high, 1M/3M returns.',
    parameters: { type: 'object', properties: { symbol: sym }, required: ['symbol'] },
  },
  {
    name: 'get_earnings',
    description: 'Next earnings date + recent quarterly EPS surprises and beat rate for one symbol.',
    parameters: { type: 'object', properties: { symbol: sym }, required: ['symbol'] },
  },
  {
    name: 'get_market_pulse',
    description: "Breadth across the user's watchlist: advancers/decliners, average and median move, best/worst, top movers.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_watchlist',
    description: "The user's current watchlist symbols.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'watch',
    description: "Add a symbol to the user's watchlist.",
    parameters: { type: 'object', properties: { symbol: sym }, required: ['symbol'] },
  },
  {
    name: 'unwatch',
    description: "Remove a symbol from the user's watchlist.",
    parameters: { type: 'object', properties: { symbol: sym }, required: ['symbol'] },
  },
  {
    name: 'set_alert',
    description: 'Arm a real alert. type: price (default), rsi, sma_cross (value = SMA window, e.g. 50), or volume (value = ratio vs 20d avg).',
    parameters: {
      type: 'object',
      properties: {
        symbol: sym,
        type: { type: 'string', enum: ['price', 'rsi', 'sma_cross', 'volume'] },
        operator: { type: 'string', enum: ['>', '<'] },
        value: { type: 'number' },
      },
      required: ['symbol', 'operator', 'value'],
    },
  },
  {
    name: 'get_calendar',
    description: 'Upcoming market calendar (next 60 days): FOMC/CPI/NFP/GDP/PCE plus user-added catalysts.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'add_catalyst',
    description: 'Add a user catalyst to the calendar (product event, conference, policy date, capex day…).',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        symbol: { type: 'string', description: 'Ticker, omit for macro events' },
        type: { type: 'string', enum: CATALYST_TYPES },
        label: { type: 'string', description: 'Short event name' },
      },
      required: ['date', 'label'],
    },
  },
  {
    name: 'memory_add',
    description: 'Persist a fact across conversations. ONLY when the user explicitly asks to remember something.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The fact to remember' } },
      required: ['text'],
    },
  },
  {
    name: 'memory_edit',
    description: 'Rewrite a persistent memory by id. ONLY when the user explicitly asks to update it.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Memory id' },
        text: { type: 'string', description: 'The replacement text' },
      },
      required: ['id', 'text'],
    },
  },
  {
    name: 'memory_delete',
    description: 'Delete a persistent memory by id. ONLY when the user explicitly asks to forget it.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Memory id' } },
      required: ['id'],
    },
  },
  {
    name: 'journal_add',
    description: "Append an entry to the user's trade journal (their own decisions/rationale log). ONLY when the user asks to journal something.",
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The journal entry' } },
      required: ['text'],
    },
  },
  {
    name: 'journal_search',
    description: 'Search the trade journal by text or ticker; empty query returns the most recent entries. Use when the user asks what they wrote or thought earlier.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search term or ticker; omit for recent' } },
    },
  },
  {
    name: 'navigate',
    description: 'Jump the app to a view. view: dashboard, markets, sectors, heatmap, movers, earnings, calendar, screen, alerts, portfolio, briefing, or research (needs symbol; optional sub: chart, intraday, options, earnings, insider, analysts).',
    parameters: {
      type: 'object',
      properties: {
        view: { type: 'string' },
        symbol: { type: 'string', description: 'For view=research' },
        sub: { type: 'string', description: 'Research sub-view' },
      },
      required: ['view'],
    },
  },
]

const EXECUTORS = {
  wire_search: async ({ q, symbol }) => {
    const base = wireServiceUrl()
    if (!base) return { error: 'no wire connected in this browser' }
    const b = base.replace(/\/$/, '')
    const url = q
      ? `${b}/api/search?q=${encodeURIComponent(q)}`
      : symbol
        ? `${b}/api/events?symbols=${encodeURIComponent(String(symbol).toUpperCase())}&newest=1&limit=12`
        : null
    if (!url) return { error: 'pass q or symbol' }
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    const out = await resp.json()
    if (!out.ok) return { error: out.error || 'wire search failed' }
    const events = (out.events || []).slice(-15).map((e) => ({
      when: new Date(e.ts_event * 1000).toISOString().slice(0, 16).replace('T', ' '),
      type: e.type,
      symbols: e.symbols || [],
      headline: e.headline,
      ...(e.body ? { body: String(e.body).slice(0, 200) } : {}),
    }))
    return { count: events.length, events }
  },

  get_quotes: getQuotes,
  get_technicals: getTechnicals,
  get_earnings: getEarnings,
  get_market_pulse: getMarketPulse,
  get_watchlist: getWatchlistTool,
  watch: watchTool,
  unwatch: unwatchTool,
  set_alert: setAlertTool,
  get_calendar: getCalendarTool,
  add_catalyst: addCatalystTool,
  memory_add: ({ text }) => {
    const m = addMemory(text)
    return m ? { ok: true, id: m.id } : { error: 'empty memory' }
  },
  memory_edit: ({ id, text }) => (editMemory(id, text)
    ? { ok: true, updated: id }
    : { error: `no memory #${id} (or empty text)` }),
  memory_delete: ({ id }) => (removeMemory(id)
    ? { ok: true, deleted: id }
    : { error: `no memory #${id}` }),
  journal_add: ({ text }) => {
    const e = addJournalEntry(text)
    return e ? { ok: true, id: e.id, symbols: e.symbols } : { error: 'empty entry' }
  },
  journal_search: ({ query }) => {
    const hits = (query ? searchJournal(query) : loadJournal().slice(-8))
      .slice(-8)
      .map((e) => ({ id: e.id, date: new Date(e.ts).toISOString().slice(0, 10),
                     symbols: e.symbols, text: e.text.slice(0, 400) }))
    return { count: hits.length, entries: hits }
  },
  navigate: navigateTool,
}

// Short human verbs for the chat's tool chips — "quotes AAPL, TSLA" reads
// better than get_quotes({"symbols":…}).
const TOOL_VERBS = {
  get_quotes: 'quotes',
  get_technicals: 'technicals',
  get_earnings: 'earnings',
  get_market_pulse: 'market pulse',
  get_watchlist: 'watchlist',
  watch: 'watch',
  unwatch: 'unwatch',
  set_alert: 'alert',
  get_calendar: 'calendar',
  add_catalyst: 'catalyst',
  memory_add: 'remember',
  memory_edit: 'revise memory',
  memory_delete: 'forget',
  journal_add: 'journal',
  journal_search: 'journal search',
  navigate: 'open',
}

/** What the assistant is DOING, in the present tense — the trace says
 *  "Reading quotes AAPL" while it happens rather than naming the endpoint
 *  (Jeff 2026-08-07: "like Searching, Reading, Browsing"). */
const TOOL_GERUNDS = {
  get_quotes: 'Reading quotes',
  get_technicals: 'Reading technicals',
  get_earnings: 'Reading earnings',
  get_market_pulse: 'Reading the tape',
  get_watchlist: 'Reading the watchlist',
  watch: 'Adding to the watchlist',
  unwatch: 'Removing from the watchlist',
  set_alert: 'Arming an alert',
  get_calendar: 'Reading the calendar',
  add_catalyst: 'Adding a catalyst',
  memory_add: 'Remembering',
  memory_edit: 'Revising a memory',
  memory_delete: 'Forgetting',
  journal_add: 'Writing to the journal',
  journal_search: 'Searching the journal',
  navigate: 'Opening',
}

function toolArg(tc) {
  const a = tc.args || {}
  return a.symbols?.join?.(', ') ?? a.symbol ?? a.view ?? a.label ?? ''
}

/** Human-readable chip label for a tool call. Exported for the UI. */
export function toolLabel(tc) {
  const arg = toolArg(tc)
  const verb = TOOL_VERBS[tc.name] || tc.name
  return arg ? `${verb} ${arg}` : verb
}

/** Same call, phrased as the work in progress. */
export function toolRunLabel(tc) {
  const arg = toolArg(tc)
  const verb = TOOL_GERUNDS[tc.name] || TOOL_VERBS[tc.name] || tc.name
  return arg ? `${verb} ${arg}` : verb
}

/**
 * Execute one tool call; always resolves to a JSON string (errors included —
 * the model reads them and self-corrects). Exported for tests.
 */
export async function executeTool(name, args) {
  const fn = EXECUTORS[name]
  if (!fn) return JSON.stringify({ error: `unknown tool: ${name}` })
  try {
    const result = await fn(args || {})
    const s = JSON.stringify(result)
    return s.length > MAX_RESULT_CHARS ? s.slice(0, MAX_RESULT_CHARS) + '…(truncated)' : s
  } catch (err) {
    return JSON.stringify({ error: String(err?.message || err) })
  }
}
