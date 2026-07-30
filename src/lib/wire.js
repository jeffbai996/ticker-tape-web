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
  transcript_chunk: 'LIV', digest: 'DIG',
}
