// Wire panel data layer — optional viewer-supplied endpoint. This site is public and static; it
// ships NO wire URL and NO symbols. A viewer points the panel at their own
// fragwire-compatible service (see its API.md: GET /api/events, SSE
// /api/stream, additive-only), and events render entirely client-side in
// their browser. Without an endpoint the panel runs on synthetic demo events.

import { IS_PRIVATE_BUILD } from './nav.js'

const KEY = 'tape-wire-url'

export function wireUrl() {
  // Private tailnet build: ALWAYS derive from the host already serving this
  // page. The build has no connect UI, so a localStorage override can only be
  // a leftover from an older scheme — and a stale one silently killed every
  // wire surface on that device ("fragwire headlines do not appear", Jeff
  // 2026-08-10). Purge it so nothing else trips on it either.
  if (IS_PRIVATE_BUILD && typeof location !== 'undefined'
      && location.hostname.endsWith('.ts.net')) {
    try { localStorage.removeItem(KEY) } catch { /* private mode */ }
    return `https://${location.hostname}:${WIRE_UI_PORT}`
  }
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return saved
  } catch { /* fall through to the build default */ }
  return ''
}

export function setWireUrl(url) {
  const clean = String(url || '').trim().replace(/\/+$/, '')
  if (clean && !/^https?:\/\//.test(clean)) throw new Error('http(s) URL required')
  try {
    if (clean) localStorage.setItem(KEY, clean)
    else localStorage.removeItem(KEY)
  } catch { /* private mode: panel just stays in demo */ }
  return clean
}

// Port fragwire's own UI answers on. Only ever combined with the host the page
// is ALREADY being served from, so no internal hostname lives in this repo.
const WIRE_UI_PORT = 8459

/** Where the wire's own board lives, for a "open the source" link.
 *  Prefers the configured endpoint's origin — that IS the viewer's fragwire,
 *  whoever they are. The private tailnet build falls back to the wire port on
 *  the same tailnet host serving this page; the public build gets nothing,
 *  because a public origin has no business advertising someone's tailnet. */
export function fragwireHome() {
  const ep = wireUrl()
  if (ep) {
    try {
      return new URL(ep).origin
    } catch { /* malformed endpoint — fall through to the host guess */ }
  }
  if (!IS_PRIVATE_BUILD) return ''
  const host = typeof location === 'undefined' ? '' : location.hostname
  return host.endsWith('.ts.net') ? `https://${host}:${WIRE_UI_PORT}` : ''
}

// `newest` takes the TAIL of the archive. Without it a since_id=0 backfill
// returns the OLDEST rows in the store — the board opened on ancient events
// and a link to a fresh story landed on nothing (Jeff 2026-08-05).
export async function fetchEvents(base, { sinceId = 0, limit = 100, newest = false } = {}) {
  const resp = await fetch(
    `${base}/api/events?since_id=${sinceId}&limit=${limit}${newest ? '&newest=1' : ''}`)
  if (!resp.ok) throw new Error(`wire ${resp.status}`)
  return resp.json()
}

// ── demo wire ─────────────────────────────────────────────────────────────
// A written session rather than a template generator. The old version cycled
// six shapes over six tickers, so every sixth row repeated with a new symbol —
// it read as filler and made the page look unfinished.
//
// These are invented but internally consistent: the AAPL beat develops across
// three rows (release -> call digest -> reaction), the CPI print lines up with
// the Fed speaker after it. Generic large-caps on purpose — this page is
// public, so it must never echo a real book.
//
// Every row carries `demo: true`; the UI badges off that, so nothing here can
// be mistaken for a live print.
const DEMO_FEED = [
  { type: 'earnings_release', symbols: ['AAPL'], mins: 4,
    headline: 'AAPL Q3 EPS $2.31 vs $2.10 est · revenue $99.2B vs $96.4B est' },
  { type: 'digest', symbols: ['AAPL'], mins: 9,
    headline: 'AAPL call digest: services margin 74.1%, FY guide raised to $412-418B' },
  { type: 'headline', symbols: ['AAPL'], mins: 17,
    headline: 'Apple lifted to Buy at three desks after services beat' },
  { type: 'macro_print', symbols: [], mins: 26,
    headline: 'CPI m/m +0.2% vs +0.3% est · core +0.19%, third cool print' },
  { type: 'fed_speech', symbols: [], mins: 34,
    headline: 'Fed: "disinflation broadening, but we are not done" — no cut signalled' },
  { type: 'headline', symbols: ['NVDA'], mins: 41,
    headline: 'NVDA said to have secured additional CoWoS capacity for 2027' },
  { type: 'filing', symbols: ['MSFT'], mins: 52,
    headline: 'MSFT files 8-K — $60B buyback authorisation, dividend +10%' },
  { type: 'earnings_release', symbols: ['GOOG'], mins: 63,
    headline: 'GOOG Q3 EPS $2.87 vs $2.71 est · cloud revenue +31% y/y' },
  { type: 'digest', symbols: ['GOOG'], mins: 68,
    headline: 'GOOG call digest: capex guide raised to $93B, "demand exceeds supply"' },
  { type: 'headline', symbols: ['AMD', 'NVDA'], mins: 77,
    headline: 'AMD MI400 sampling ahead of schedule; NVDA unmoved on the print' },
  { type: 'macro_print', symbols: [], mins: 88,
    headline: 'Initial claims 214k vs 220k est · 4-week average lowest since March' },
  { type: 'filing', symbols: ['TSLA'], mins: 96,
    headline: 'TSLA files 8-K — CFO transition effective Q1, no change to guidance' },
  { type: 'headline', symbols: ['XOM'], mins: 108,
    headline: 'XOM in advanced talks for Permian bolt-on, said to be ~$4B' },
  { type: 'earnings_release', symbols: ['JPM'], mins: 121,
    headline: 'JPM Q3 EPS $4.92 vs $4.61 est · NII guide raised, credit costs flat' },
  { type: 'fed_speech', symbols: [], mins: 134,
    headline: 'Fed speaker: balance-sheet runoff to slow "in coming months"' },
  { type: 'headline', symbols: ['LLY'], mins: 147,
    headline: 'LLY obesity trial hits primary endpoint at 52 weeks' },
  { type: 'digest', symbols: ['JPM'], mins: 156,
    headline: 'JPM call digest: buyback pace steady, reserve build "precautionary"' },
  { type: 'macro_print', symbols: [], mins: 172,
    headline: 'Retail sales +0.4% m/m vs +0.2% est · control group +0.6%' },
  { type: 'headline', symbols: ['META'], mins: 188,
    headline: 'META said to be trimming Reality Labs headcount, refocus on ads AI' },
  { type: 'filing', symbols: ['WMT'], mins: 204,
    headline: 'WMT files 8-K — completes $2.3B logistics acquisition' },
]

/** One demo row. `id` indexes the written feed and wraps, so an infinite
 *  scroll keeps working without repeating the same sentence back-to-back the
 *  way the old template generator did. */
export function demoEvent(id, now = Date.now() / 1000) {
  const row = DEMO_FEED[(id - 1) % DEMO_FEED.length]
  // Rows older than one pass through the feed get pushed further back, so a
  // long scroll reads as history rather than the same timestamps repeating.
  const cycle = Math.floor((id - 1) / DEMO_FEED.length)
  const ago = (row.mins + cycle * 240) * 60
  return {
    id,
    type: row.type,
    symbols: row.symbols,
    headline: row.headline,
    ts_event: now - ago,
    ts_seen: now - ago + 2,
    url: '',
    demo: true,
  }
}

export function demoBackfill(count = 40, now = Date.now() / 1000) {
  return Array.from({ length: count }, (_, i) => demoEvent(i + 1, now))
}

export const TYPE_CODE = {
  earnings_release: 'ERN', filing: 'FIL', headline: 'NWS',
  fed_speech: 'FED', fed_headline: 'FED', macro_print: 'ECO',
  transcript_chunk: 'LIV', digest: 'DIG', live_call: 'LIV',
}

export async function fetchToday(base) {
  const resp = await fetch(`${base}/api/today`)
  if (!resp.ok) throw new Error(`wire ${resp.status}`)
  return resp.json()
}

export async function fetchQuotes(base) {
  const resp = await fetch(`${base}/api/quotes`)
  if (!resp.ok) throw new Error(`wire ${resp.status}`)
  return resp.json()
}

export async function fetchMeta(base) {
  const resp = await fetch(`${base}/api/meta`)
  if (!resp.ok) throw new Error(`wire ${resp.status}`)
  return resp.json()
}

// ── priority scorer (ported from the fragwire board): what it is × whether
// it's a watched name × freshness decay, ~25h half-life.
// Source credibility, fragwire's ladder verbatim: real wires and papers rank,
// SEO content mills sink. Matched on the article domain or the "— Source"
// suffix aggregators append to headlines. Unlisted sources ride at 1.0.
const SRC_CRED = [
  [/reuters|wsj\.com|bloomberg|ft\.com|apnews|federalreserve\.gov|sec\.gov/i, 1.3],
  [/cnbc|marketwatch|barrons|economist|asia\.nikkei|trendforce/i, 1.15],
  [/benzinga|businessinsider|yahoo|investing\.com|seekingalpha|fortune|axios/i, 1.0],
  [/thestreet|fool\.com|motley fool|zacks|investorplace|tipranks|gurufocus|insider monkey|247wallst|barchart/i, 0.45],
  [/simplywall|stocktwits|benzinga insights|quiver ?quant|marketbeat|defense world|americanbankingnews/i, 0.15],
]

export function srcCred(ev) {
  const hay = `${ev.url || ''} ${ev.headline || ''}`
  for (const [re, mult] of SRC_CRED) if (re.test(hay)) return mult
  return 1
}

// ── zh twins for fragwire's own output ────────────────────────────────────
// Briefs/wraps carry a server-side translation in meta (body_zh/headline_zh);
// templated machine messages (price moves) translate client-side because
// they're formulaic. External headlines stay in their source language.
const PX_MOVE = /^(\S+) ([+-][\d.]+%) on the day \(crossed ([+-][\d.]+%)\)$/
export function evHeadline(ev, locale) {
  if (locale !== 'zh') return ev.headline
  const zh = (ev.meta || {}).headline_zh
  if (zh) return zh
  const m = PX_MOVE.exec(ev.headline || '')
  if (m) return `${m[1]} 当日${m[2]}（越过${m[3]}）`
  return ev.headline
}
export function evBody(ev, locale) {
  if (locale !== 'zh') return ev.body
  return (ev.meta || {}).body_zh || ev.body
}

export const TYPE_WEIGHT = {
  earnings_release: 100, macro_print: 85, fed_headline: 75, fed_speech: 70,
  live_call: 90, digest: 60, filing: 55, headline: 40, transcript_chunk: 12,
}

export function scoreEvent(ev, watchset, now = Date.now() / 1000) {
  const base = TYPE_WEIGHT[ev.type] ?? 30
  const wl = (ev.symbols || []).some((s) => watchset.has(s)) ? 1.5 : 1
  const ageH = Math.max(0, now - ev.ts_event) / 3600
  return base * wl * Math.exp(-ageH / 36)
}

// TOP mode collapses live-transcript chatter to the newest chunk per session.
export function rankEvents(events, watchset, now = Date.now() / 1000) {
  const newestChunk = new Map()
  for (const ev of events) {
    if (ev.type !== 'transcript_chunk') continue
    const sid = ev.meta && ev.meta.session_id
    const cur = newestChunk.get(sid)
    if (!cur || ev.id > cur.id) newestChunk.set(sid, ev)
  }
  return events
    .filter((ev) => ev.type !== 'transcript_chunk'
      || newestChunk.get(ev.meta && ev.meta.session_id) === ev)
    .slice()
    .sort((a, b) => (b.is_live ? 1 : 0) - (a.is_live ? 1 : 0)
      || scoreEvent(b, watchset, now) - scoreEvent(a, watchset, now))
}

// ── synthetic rail data for demo mode ──
export function demoToday(now = Date.now() / 1000) {
  return {
    calendar: [
      { id: 1, ts: now + 3.2 * 3600, symbol: 'AAPL', kind: 'earnings',
        label: 'AAPL earnings (demo · cons EPS $2.10, rev $96.4B)' },
    ],
    upcoming: [
      { id: 2, ts: now + 5 * 86400, symbol: '', kind: 'macro', label: 'Employment report (demo)' },
      { id: 3, ts: now + 9 * 86400, symbol: 'MSFT', kind: 'earnings', label: 'MSFT earnings (demo)' },
      { id: 4, ts: now + 13 * 86400, symbol: '', kind: 'fed', label: 'FOMC statement (demo)' },
    ],
    captured: { headline: 24, filing: 6, earnings_release: 2, digest: 5, transcript_chunk: 61 },
    sessions: [
      { id: 1, symbol: 'AAPL', status: 'capturing', label: 'AAPL earnings call (demo)' },
      { id: 2, symbol: 'TSLA', status: 'done', label: 'TSLA call replay (demo)' },
    ],
  }
}

export function demoQuotes() {
  return {
    AAPL: { change_pct: 1.2 }, MSFT: { change_pct: -0.4 },
    NVDA: { change_pct: 2.6 }, GOOG: { change_pct: 0.9 },
    AMZN: { change_pct: -1.8 }, TSLA: { change_pct: 3.5 },
  }
}

// ── session cards: a call is ONE line item, not a chunk every 20s. All of a
// session's transcript_chunk + digest events fold into one synthetic
// `live_call` row that updates as audio lands; expand for digests + the
// transcript tail. The wire API stays granular — this is presentation.
export function collapseSessions(events, now = Date.now() / 1000) {
  const bySession = new Map()
  const rest = []
  for (const ev of events) {
    const sid = ev.meta && ev.meta.session_id
    if (sid != null && (ev.type === 'transcript_chunk' || ev.type === 'digest')) {
      if (!bySession.has(sid)) bySession.set(sid, [])
      bySession.get(sid).push(ev)
    } else {
      rest.push(ev)
    }
  }
  for (const [sid, evs] of bySession) {
    const chunks = evs.filter((e) => e.type === 'transcript_chunk')
    const digests = evs.filter((e) => e.type === 'digest').sort((a, b) => a.id - b.id)
    const latest = evs.reduce((a, b) => (b.id > a.id ? b : a))
    const label = evs.map((e) => e.meta && e.meta.label).find(Boolean) || ''
    const latestChunk = chunks.length ? chunks.reduce((a, b) => (b.id > a.id ? b : a)) : null
    const live = latest.ts_seen > now - 120
    rest.push({
      is_live: live,
      id: latest.id, type: 'live_call', symbols: latest.symbols,
      ts_event: latest.ts_event, ts_seen: latest.ts_seen, url: '',
      headline: `${(latest.symbols || [])[0] || ''} call${label ? ' · ' + label : ''}`
        + `${live ? ' · LIVE' : ''} — ${chunks.length} chunks · ${digests.length} digests`
        + (latestChunk ? ` · latest: ${(latestChunk.body || '').slice(0, 60)}` : ''),
      live_call: { sid, digests, tail: chunks.slice(-4) },
      meta: { session_id: sid },
    })
  }
  return rest
}

// ── story clustering: the same story from N outlets is ONE row. Headlines
// normalize to significant-token sets; Jaccard >= 0.5 within a 48h window
// joins a cluster. The face of the cluster is the highest-tier source.
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and',
  'as', 'at', 'its', 'is', 'are', 'up', 'with', 'after', 'over', 'from',
  'by', 'says', 'say', 'said', 'new', 'reuters', 'bloomberg', 'wsj'])
export function storyTokens(headline) {
  return new Set((headline || '').toLowerCase()
    .replace(/[-—–]\s*[a-z0-9 .]+$/i, '')       // trailing "— Source" credit
    .replace(/[^a-z0-9$% ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w)))
}

const SRC_RANK = [
  [/reuters|wsj\.com|bloomberg|ft\.com|apnews/i, 5],
  [/cnbc|marketwatch|barrons|bbc|guardian/i, 4],
  [/benzinga|businessinsider|yahoo|investing\.com|seekingalpha|fortune/i, 3],
]
function srcRank(ev) {
  const hay = `${ev.url || ''} ${ev.headline || ''}`
  for (const [re, n] of SRC_RANK) if (re.test(hay)) return n
  return 1
}

export function clusterStories(events, now = Date.now() / 1000) {
  const headlines = []
  const rest = []
  for (const ev of events) {
    (ev.type === 'headline' ? headlines : rest).push(ev)
  }
  const clusters = []          // [{tokens, members}]
  for (const ev of headlines) {
    const toks = storyTokens(ev.headline)
    let home = null
    if (toks.size >= 3) {
      for (const c of clusters) {
        if (Math.abs(c.members[0].ts_event - ev.ts_event) > 48 * 3600) continue
        let inter = 0
        for (const w of toks) if (c.tokens.has(w)) inter += 1
        // overlap coefficient (∩ / min size): robust to the cluster's token
        // set growing as members join, unlike Jaccard
        const denom = Math.min(c.tokens.size, toks.size)
        if (denom > 0 && inter / denom >= 0.6) { home = c; break }
      }
    }
    if (home) {
      home.members.push(ev)
      for (const w of toks) home.tokens.add(w)
    } else {
      clusters.push({ tokens: new Set(toks), members: [ev] })
    }
  }
  for (const c of clusters) {
    if (c.members.length === 1) {
      rest.push(c.members[0])
      continue
    }
    // ties go to a DIRECT link over an aggregator redirect
    const direct = (e) => (/news\.google\./.test(e.url || '') ? 0 : 1)
    const face = c.members.slice().sort((a, b) =>
      srcRank(b) - srcRank(a) || direct(b) - direct(a) || b.id - a.id)[0]
    const latest = c.members.reduce((a, b) => (b.id > a.id ? b : a))
    rest.push({
      ...face,
      id: latest.id,
      ts_event: latest.ts_event, ts_seen: latest.ts_seen,
      story_cluster: {
        count: c.members.length,
        members: c.members.slice().sort((a, b) => b.id - a.id),
      },
    })
  }
  return rest
}

/**
 * Headlines worth interrupting a quote belt for: recent, and either flagged
 * thesis-critical by the wire's own triage or a price move it decided to
 * announce. Deliberately strict — the tape is glanceable only while it stays
 * mostly quotes.
 */
// Typed events earn a slot without a triage score: they arrive pre-classified
// (an 8-K is an 8-K), and their category is what makes the tape badge worth
// reading instead of stamping NEWS on everything.
const TAPE_TYPES = new Set(['price_move', 'earnings_release', 'filing',
                            'fed_headline', 'fed_speech', 'macro_print'])

export function tapeworthy(events, { now = Date.now() / 1000, maxAgeH = 6, limit = 6 } = {}) {
  return (events || [])
    .filter((e) => {
      if (!e.headline) return false
      if ((now - (e.ts_event || 0)) / 3600 > maxAgeH) return false
      // content mills never ride the banner — the wire list still carries
      // them with their red pip, but the belt is for real sources only
      // (Jeff 2026-08-09)
      if (srcCred(e) < 1) return false
      if (TAPE_TYPES.has(e.type)) return true
      return ((e.meta || {}).thesis || 0) >= 2
    })
    .sort((a, b) => (b.ts_event || 0) - (a.ts_event || 0))
    .slice(0, limit)
}
