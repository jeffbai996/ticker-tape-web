// Wire panel data layer — BYO endpoint. This site is public and static; it
// ships NO wire URL and NO symbols. A viewer points the panel at their own
// fragwire-compatible service (see its API.md: GET /api/events, SSE
// /api/stream, additive-only), and events render entirely client-side in
// their browser. Without an endpoint the panel runs on synthetic demo events.

const KEY = 'tape-wire-url'

export function wireUrl() {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
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

export async function fetchEvents(base, { sinceId = 0, limit = 100 } = {}) {
  const resp = await fetch(`${base}/api/events?since_id=${sinceId}&limit=${limit}`)
  if (!resp.ok) throw new Error(`wire ${resp.status}`)
  return resp.json()
}

// ── synthetic demo wire ── generic tickers only, obviously fake numbers.
const DEMO_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA']
const DEMO_SHAPES = [
  { type: 'earnings_release', headline: (s) => `${s} reports results (8-K 2.02)` },
  { type: 'filing', headline: (s) => `${s} files 8-K - Current report` },
  { type: 'headline', headline: (s) => `${s} announces expanded strategic partnership` },
  { type: 'macro_print', headline: () => 'CPI m/m +0.2% vs +0.3% expected (demo print)' },
  { type: 'fed_speech', headline: () => 'Fed speaker: policy remains data dependent' },
  { type: 'digest', headline: (s) => `${s} call digest: margins above guidance, raises FY outlook` },
]

// Deterministic-ish demo feed: id seeds the shape so re-renders are stable.
export function demoEvent(id, now = Date.now() / 1000) {
  const shape = DEMO_SHAPES[id % DEMO_SHAPES.length]
  const symbol = DEMO_SYMBOLS[id % DEMO_SYMBOLS.length]
  const macro = shape.type === 'macro_print' || shape.type === 'fed_speech'
  return {
    id,
    type: shape.type,
    symbols: macro ? [] : [symbol],
    headline: shape.headline(symbol),
    ts_event: now - (40 - (id % 40)) * 137,
    ts_seen: now - (40 - (id % 40)) * 137 + 2,
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
    .sort((a, b) => scoreEvent(b, watchset, now) - scoreEvent(a, watchset, now))
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
    NVDA: { change_pct: 2.6 }, GOOGL: { change_pct: 0.9 },
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
