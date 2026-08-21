// Event workspace domain logic: what a calendar entry IS, what it touches, and
// what happened after it printed.
//
// The mapping below is deliberately a shipped constant of PUBLIC instruments —
// index proxies, sector/theme ETFs, macro hedges. A company name only ever
// enters through the event the viewer themselves put on the calendar (a user
// catalyst, or an earnings row carrying its own symbol), so this file can never
// become a statement about anybody's book.
//
// Everything here is pure: the workspace fetches, this decides.

import { BUCKETS } from './symbols.js'

/** Bucket → sector proxy. Buckets are the repo's existing public rosters, so a
 *  symbol-bearing event gets a sector line without a second membership table. */
export const SECTOR_ETF = {
  Megacaps: 'XLK',
  Semis: 'SMH',
  'Software & AI': 'IGV',
  'Consumer & Media': 'XLY',
  Financials: 'XLF',
  Health: 'XLV',
  Staples: 'XLP',
  'Energy & Industrials': 'XLE',
  'ETFs & Macro': 'SPY',
}

/** The sector proxy for a symbol; SPY when the symbol is outside every roster —
 *  a broad proxy is honest about knowing nothing, an invented sector is not. */
export function sectorEtfFor(symbol) {
  const sym = String(symbol || '').toUpperCase()
  const bucket = BUCKETS.find((b) => b.symbols.includes(sym))
  return (bucket && SECTOR_ETF[bucket.name]) || 'SPY'
}

const BROAD = [
  { symbol: 'SPY', why: 'the broad tape' },
  { symbol: 'QQQ', why: 'long-duration growth' },
  { symbol: '^VIX', why: 'how much move is being paid for' },
]

const RATES = [
  { symbol: 'TLT', why: 'long duration prices the rate path' },
  { symbol: '^TNX', why: 'the 10-year yield itself' },
  { symbol: 'XLF', why: 'banks trade the curve' },
  { symbol: 'XLRE', why: 'property is a rates instrument' },
  { symbol: 'XHB', why: 'homebuilders trade the mortgage rate' },
]

/** Keyed by event kind. `plain` says what it is, `matters` says why anyone
 *  cares — both short on purpose: this is a strip above a numbers row, not an
 *  explainer page. Both strings are LABELS keys, so both translate. */
export const EVENT_LINKS = {
  FOMC: {
    plain: 'The Federal Reserve sets the policy rate and explains its thinking.',
    detail: "Eight scheduled meetings a year; the decision lands at 2:00pm ET with the statement, and the chair's press conference at 2:30 usually moves markets more than the print itself. Watch the dot plot at quarterly meetings and the statement's language on the balance sheet and inflation progress — single-word edits are the signal. Positioning into the meeting matters as much as the outcome: a hawkish cut or a dovish hold routinely reverses the first move within the hour.",
    matters: 'The rate path reprices every other asset, so the statement moves more than the decision.',
    sectors: ['Rates', 'Financials', 'Gold'],
    symbols: [
      { symbol: 'TLT', why: 'long duration prices the rate path' },
      { symbol: 'GLD', why: 'gold trades real rates and the dollar' },
      { symbol: 'XLF', why: 'banks trade the curve' },
      { symbol: 'SPY', why: 'the broad tape' },
      { symbol: '^VIX', why: 'how much move is being paid for' },
    ],
  },
  MINS: {
    plain: 'The written record of the last Fed meeting, three weeks after it.',
    detail: 'Released three weeks after each meeting at 2:00pm ET. The market already knows the decision — what it is pricing here is the DISTRIBUTION of views: how many members leaned the other way, what would change their minds, and any staff talk about the balance sheet or financial conditions. A market that read the meeting as dovish can reprice hard on minutes that show the hold was contested.',
    matters: 'It shows how split the committee was, which is what the next decision hangs on.',
    sectors: ['Rates', 'Financials'],
    symbols: RATES.slice(0, 3).concat([{ symbol: 'SPY', why: 'the broad tape' }]),
  },
  CPI: {
    plain: 'How fast consumer prices rose last month, headline and core.',
    detail: "8:30am ET, roughly mid-month, covering the prior month. Core (ex food and energy) sets the tone; the month-over-month figure to two decimals is what the tape trades — an 0.2 vs 0.3 miss is a real move in rates. Shelter is a third of core and lags real-time rents by about a year, so watch supercore (services ex-shelter) for where the Fed's attention actually is. Bonds react in the first second; equities sort out the growth-vs-rates read over the morning.",
    matters: 'Inflation sets the rate path, so a surprise here moves bonds before it moves stocks.',
    sectors: ['Rates', 'Financials', 'Real Estate', 'Homebuilders'],
    symbols: RATES.concat([{ symbol: 'GLD', why: 'gold trades real rates and the dollar' }]),
  },
  PCE: {
    plain: 'The inflation gauge the Fed actually targets, with income and spending.',
    detail: "8:30am ET near month-end. This is the index the Fed's 2% target refers to — CPI gets the headlines, PCE settles the argument. Weights differ from CPI (less shelter, more healthcare) so the two can diverge for months at a time; most of the surprise is usually forecastable from CPI and PPI components already in hand, which is why the market reaction is often smaller unless the composition shifts.",
    matters: 'Same signal as CPI but on the Fed own measure, so it settles arguments CPI started.',
    sectors: ['Rates', 'Financials', 'Real Estate'],
    symbols: RATES.slice(0, 4),
  },
  PPI: {
    plain: 'Prices producers received last month — inflation one step upstream.',
    detail: '8:30am ET, usually the day after or before CPI. Producer prices sit one step upstream of consumer prices, and several PPI components (healthcare, airfares, portfolio management fees) feed DIRECTLY into the PCE calculation — desks re-mark their PCE forecasts within minutes of this print. A hot PPI after a cool CPI takes back some of the rally more often than not.',
    matters: 'Producer prices lead consumer prices and feed several components of the Fed gauge.',
    sectors: ['Rates', 'Industrials', 'Materials'],
    symbols: [
      { symbol: 'TLT', why: 'long duration prices the rate path' },
      { symbol: 'XLI', why: 'industrial margins live on input costs' },
      { symbol: 'XLB', why: 'materials sit at the top of the cost chain' },
      { symbol: 'SPY', why: 'the broad tape' },
    ],
  },
  NFP: {
    plain: 'The monthly jobs report: payrolls, unemployment, wages, and revisions.',
    detail: "First Friday of the month, 8:30am ET. Three numbers matter, in order: the payroll count vs consensus, the two prior months' revisions (which have been running large), and average hourly earnings for the inflation read. The unemployment rate comes from a different survey and can disagree with payrolls outright. This is the highest-volatility scheduled print outside CPI — spreads widen into it and the first move frequently retraces.",
    matters: 'It is the cleanest read on growth, and wages feed straight back into the inflation debate.',
    sectors: ['Broad market', 'Small caps', 'Rates'],
    symbols: [
      { symbol: 'SPY', why: 'the broad tape' },
      { symbol: 'QQQ', why: 'long-duration growth' },
      { symbol: 'IWM', why: 'small caps carry domestic growth' },
      { symbol: 'TLT', why: 'long duration prices the rate path' },
    ],
  },
  GDP: {
    plain: 'The first official estimate of last quarter economic growth.',
    detail: '8:30am ET; each quarter gets three passes — advance, second, final — and the advance estimate moves markets most despite being built on incomplete data. Look under the hood: final sales to private domestic purchasers strips inventories and trade noise and is the better read on underlying demand. A headline beat built on inventory build is routinely faded.',
    matters: 'Backward looking, but it settles whether the slowdown argument has any data behind it.',
    sectors: ['Broad market', 'Cyclicals', 'Rates'],
    symbols: [
      { symbol: 'SPY', why: 'the broad tape' },
      { symbol: 'IWM', why: 'small caps carry domestic growth' },
      { symbol: 'XLI', why: 'industrial margins live on input costs' },
      { symbol: 'TLT', why: 'long duration prices the rate path' },
    ],
  },
  RET: {
    plain: 'What consumers spent at retailers last month, including the control group.',
    detail: '8:30am ET, mid-month. The control group (ex autos, gas, building materials, food service) feeds straight into the consumption line of GDP models — that is the number the desks care about, not the headline. Retail sales are nominal: in a disinflating tape a flat print can still mean rising real volumes.',
    matters: 'Consumption is most of the economy, so the control group feeds the GDP tracking estimates.',
    sectors: ['Consumer', 'Retail', 'Broad market'],
    symbols: [
      { symbol: 'XRT', why: 'retail is the direct read' },
      { symbol: 'XLY', why: 'discretionary spending shows up here first' },
      { symbol: 'XLP', why: 'staples are the defensive side of the same trade' },
      { symbol: 'SPY', why: 'the broad tape' },
    ],
  },
  ISM: {
    plain: 'A survey of US manufacturing: orders, employment, prices, production.',
    detail: '10:00am ET, first business day of the month. A diffusion index — 50 is the growth line, direction of travel beats the level. New orders is the forward-looking component; the prices-paid subindex doubles as an inflation early warning and can move bonds on its own. Manufacturing is a small slice of GDP but an outsized share of earnings revisions, which is why the tape cares.',
    matters: 'Survey data turns before hard data, so it is an early read on the cycle.',
    sectors: ['Industrials', 'Materials', 'Transport'],
    symbols: [
      { symbol: 'XLI', why: 'industrial margins live on input costs' },
      { symbol: 'XLB', why: 'materials sit at the top of the cost chain' },
      { symbol: 'IYT', why: 'freight moves with real goods demand' },
      { symbol: 'SPY', why: 'the broad tape' },
    ],
  },
  ISMS: {
    plain: 'The same survey for services — the far larger half of the economy.',
    detail: '10:00am ET a couple of days after the manufacturing print. Services is most of the economy, so this one matters more for the growth picture even though it gets less attention. The employment subindex previews payrolls, and prices-paid here is the service-inflation read the Fed actually worries about.',
    matters: 'Services inflation is the sticky part, so its prices component gets read as a rates signal.',
    sectors: ['Services', 'Consumer', 'Rates'],
    symbols: [
      { symbol: 'XLY', why: 'discretionary spending shows up here first' },
      { symbol: 'XLC', why: 'services demand runs through media and telecom' },
      { symbol: 'TLT', why: 'long duration prices the rate path' },
      { symbol: 'SPY', why: 'the broad tape' },
    ],
  },
  UMCH: {
    plain: 'A consumer survey: current conditions, expectations, inflation expectations.',
    detail: 'Preliminary mid-month, final at month-end, 10:00am ET. The headline sentiment level is mostly noise for markets — the reason this print moves anything is the INFLATION EXPECTATIONS series, which the Fed cites by name. A jump in 5-10 year expectations is a hawkish print regardless of what sentiment did.',
    matters: 'The Fed watches whether households still believe inflation comes back down.',
    sectors: ['Consumer', 'Rates'],
    symbols: [
      { symbol: 'XLY', why: 'discretionary spending shows up here first' },
      { symbol: 'XRT', why: 'retail is the direct read' },
      { symbol: 'TLT', why: 'long duration prices the rate path' },
    ],
  },
  OPEX: {
    plain: 'Quarterly expiry of index futures, index options, and single-stock options.',
    detail: 'Third Friday of the month; quarterly (quad witching) expirations in March, June, September and December are the big ones. Index options, single-stock options and futures all roll at once — volumes spike, dealer hedging flows dominate the tape into the close, and pinning around big strikes is common. Direction signals from an expiration day are unreliable by construction.',
    matters: 'Dealer hedges unwind into the close, so volume and pinning matter more than news that day.',
    sectors: ['Broad market', 'Volatility'],
    symbols: [
      { symbol: 'SPY', why: 'the broad tape' },
      { symbol: 'QQQ', why: 'long-duration growth' },
      { symbol: 'IWM', why: 'small caps carry domestic growth' },
      { symbol: '^VIX', why: 'how much move is being paid for' },
    ],
  },
  FED: {
    plain: 'A central-bank symposium watched for policy signals from the speakers.',
    detail: 'Scheduled Fed-speak between meetings: speeches, testimony, panels. Weight the speaker — the chair, vice chair and NY Fed president move markets; regional presidents mostly matter when they are voters saying something off-script. During the pre-meeting blackout window this quiets entirely, which itself is information.',
    matters: 'No release, but the framing of the speeches has moved the rate path before.',
    sectors: ['Rates', 'Gold', 'Broad market'],
    symbols: [
      { symbol: 'TLT', why: 'long duration prices the rate path' },
      { symbol: 'GLD', why: 'gold trades real rates and the dollar' },
      { symbol: 'UUP', why: 'the dollar is the first thing policy moves' },
      { symbol: 'SPY', why: 'the broad tape' },
    ],
  },
  ERN: {
    plain: 'A company reports the quarter and guides the next one.',
    detail: "Earnings land before the open or after the close; the stock's first move prints in the extended session where depth is thin, so the gap can overstate the day. Guidance beats the quarter: a beat with a cut guide sells off, a miss with a raised guide often rallies. The call is where the real information leaks — margins, inventory, and next quarter's tone.",
    matters: 'Guidance sets the multiple; the peer group reprices with it whether it reported or not.',
    sectors: ['Single name', 'Sector peers'],
    symbols: [
      { symbol: 'SPY', why: 'the broad tape' },
      { symbol: 'QQQ', why: 'long-duration growth' },
    ],
  },
  PRODUCT: {
    plain: 'A product or launch date you put on the calendar yourself.',
    detail: 'Product launches trade on preorders, pricing, and supply-chain follow-through rather than the event itself. The first-day move is sentiment; the durable move shows up when channel checks and component orders confirm or deny the demand story.',
    matters: 'Dated company events move the name first and the peer group second.',
    sectors: ['Single name', 'Sector peers'],
    symbols: [{ symbol: 'SPY', why: 'the broad tape' }],
  },
  CONF: {
    plain: 'A conference or investor day you put on the calendar yourself.',
    detail: 'Conference presentations and investor days move a single name on product, roadmap, or margin detail — and occasionally a whole sector when a bellwether talks supply or demand. The reaction window is minutes around the speaking slot, not the day.',
    matters: 'Dated company events move the name first and the peer group second.',
    sectors: ['Single name', 'Sector peers'],
    symbols: [{ symbol: 'SPY', why: 'the broad tape' }],
  },
  CAPEX: {
    plain: 'A spending or capacity date you put on the calendar yourself.',
    detail: 'Capex announcements reprice the SUPPLIERS faster than the company spending the money. Watch who the named beneficiaries are and whether the spend is incremental or a reallocation of an existing budget.',
    matters: 'Capex dates move the suppliers as much as the buyer.',
    sectors: ['Single name', 'Suppliers'],
    symbols: [
      { symbol: 'SPY', why: 'the broad tape' },
      { symbol: 'XLI', why: 'industrial margins live on input costs' },
    ],
  },
  POLICY: {
    plain: 'A policy, ruling, or regulatory date you put on the calendar yourself.',
    detail: 'Policy and regulatory events reprice discount rates and addressable markets rather than earnings. First reactions routinely overshoot because the legal text lags the headline — the durable move waits for the details.',
    matters: 'Policy dates reprice a whole sector at once rather than one name.',
    sectors: ['Policy-sensitive sectors', 'Rates'],
    symbols: [
      { symbol: 'SPY', why: 'the broad tape' },
      { symbol: 'TLT', why: 'long duration prices the rate path' },
    ],
  },
  MACRO: {
    plain: 'A macro date you put on the calendar yourself.',
    matters: 'Macro dates move the index complex and the rate path together.',
    sectors: ['Broad market', 'Rates'],
    symbols: BROAD.concat([{ symbol: 'TLT', why: 'long duration prices the rate path' }]),
  },
  OTHER: {
    plain: 'A dated event with no shipped description.',
    matters: 'Unmapped, so the workspace watches the broad tape rather than guessing a sector.',
    sectors: ['Broad market'],
    symbols: BROAD,
  },
}

/** The badge is a fixed terminal mark, not a text field. An unmapped kind is
 *  still shown verbatim — the calendar knows about catalysts this table does
 *  not — but a calendar row is remote input, so what reaches the DOM is
 *  bounded: uppercase alphanumerics only, `MAX_KIND_CHARS` of them. */
export const MAX_KIND_CHARS = 12

/** Normalized kind for an event row. A known kind maps to its workspace entry;
 *  an unknown one is passed through sanitized (and still resolves to OTHER for
 *  the narrative) rather than disappearing — an unmapped catalyst still
 *  deserves a workspace. Junk with no printable kind falls to OTHER. */
export function eventKind(event) {
  const raw = String(event?.type || '').toUpperCase()
  if (!raw) return 'OTHER'
  if (raw === 'EARN' || raw === 'EARNINGS') return 'ERN'
  if (Object.hasOwn(EVENT_LINKS, raw)) return raw
  return raw.replace(/[^A-Z0-9]+/g, '').slice(0, MAX_KIND_CHARS) || 'OTHER'
}

function entryFor(event) {
  const kind = eventKind(event)
  return EVENT_LINKS[kind] || EVENT_LINKS.OTHER
}

/** Plain-language pair for the workspace eyebrow. An event carrying its own
 *  description wins — the calendar source knows more than a static table. */
export function eventNarrative(event) {
  const entry = entryFor(event)
  return {
    plain: event?.description || entry.plain,
    detail: entry.detail || '',
    matters: entry.matters,
    sectors: entry.sectors,
  }
}

/** The instruments to watch for an event, most direct first. A symbol-bearing
 *  event leads with itself, then its sector proxy, then the kind mapping. */
export function eventLinkedSymbols(event) {
  const entry = entryFor(event)
  const out = []
  const seen = new Set()
  const push = (symbol, why) => {
    const sym = String(symbol || '').toUpperCase()
    if (!sym || sym === 'MACRO' || seen.has(sym)) return
    seen.add(sym)
    out.push({ symbol: sym, why })
  }
  const own = String(event?.symbol || '').toUpperCase()
  if (own && own !== 'MACRO') {
    push(own, 'the name the event is about')
    push(sectorEtfFor(own), 'its sector proxy reprices with it')
  }
  for (const link of entry.symbols) push(link.symbol, link.why)
  return out
}

// ── numbers ───────────────────────────────────────────────────────────────

/** A number out of whatever the source carried, or null. Never a guess: a
 *  string with no digits, an object, or a blank comes back null so the strip
 *  can print an honest em dash. */
export function parseNumeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const match = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) ? n : null
}

const PRIOR_KEYS = ['prior', 'previous', 'prev', 'last']
const CONSENSUS_KEYS = ['consensus', 'estimate', 'forecast', 'expected']
const ACTUAL_KEYS = ['actual', 'reported', 'result']

function pick(event, keys) {
  const bags = [event, event?.numbers, event?.metadata, event?.meta]
  for (const bag of bags) {
    if (!bag || typeof bag !== 'object') continue
    for (const key of keys) {
      if (bag[key] == null) continue
      const n = parseNumeric(bag[key])
      if (n != null) return { value: n, raw: bag[key] }
    }
  }
  return { value: null, raw: null }
}

/** prior · consensus · actual, from the fields the event already carries.
 *  Absent stays null: the workspace prints "—" rather than inventing a print. */
export function eventNumbers(event) {
  const prior = pick(event, PRIOR_KEYS)
  const consensus = pick(event, CONSENSUS_KEYS)
  const actual = pick(event, ACTUAL_KEYS)
  const raw = [actual.raw, consensus.raw, prior.raw].find((v) => typeof v === 'string')
  const unit = raw && raw.includes('%') ? '%' : ''
  return {
    prior: prior.value, consensus: consensus.value, actual: actual.value, unit,
  }
}

/** The surprise, or null when either half is missing. */
export function eventSurprise({ consensus, actual } = {}) {
  if (consensus == null || actual == null) return null
  const delta = Number((actual - consensus).toFixed(6))
  const pct = consensus === 0 ? null : (delta / Math.abs(consensus)) * 100
  let direction = 'inline'
  if (delta > 0) direction = 'above'
  else if (delta < 0) direction = 'below'
  return { delta, pct, direction }
}

// ── clock ─────────────────────────────────────────────────────────────────

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
})

/** ET offset in minutes for a calendar date (-240 in summer, -300 in winter).
 *  Probed at noon UTC, which is mid-morning ET on every date and therefore
 *  never lands inside a DST transition hour. */
export function etOffsetMinutes(dateIso) {
  const probe = new Date(`${dateIso}T12:00:00Z`)
  const [h, m] = ET_FMT.format(probe).split(':').map(Number)
  return ((h % 24) * 60 + m) - 720
}

/** 09:30 ET — what "All session" and "Schedule varies" get pinned to, flagged
 *  inexact so the workspace can say the countdown is to the open, not a print. */
const DEFAULT_CLOCK = '09:30'
const LIVE_WINDOW_MINUTES = 90
export const LIVE_WINDOW_MS = LIVE_WINDOW_MINUTES * 60_000

/** Release instant for an event, from its date plus a source time label. */
export function eventClock(event, timeLabel = '') {
  const date = String(event?.date || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { at: null, exact: false, label: timeLabel }
  const match = String(timeLabel).match(/(\d{1,2}):(\d{2})/)
  const clock = match ? `${match[1].padStart(2, '0')}:${match[2]}` : DEFAULT_CLOCK
  const at = Date.parse(`${date}T${clock}:00Z`) - etOffsetMinutes(date) * 60_000
  return { at: Number.isFinite(at) ? at : null, exact: !!match, label: timeLabel }
}

/** pre → live (the release and the 90 minutes after it) → post. */
export function eventPhase(at, now = Date.now()) {
  if (at == null) return 'pre'
  if (now < at) return 'pre'
  return now < at + LIVE_WINDOW_MS ? 'live' : 'post'
}

const pad = (n) => String(n).padStart(2, '0')

/** Fixed-width countdown: `01:02:03`, or `2d 01:02:03` past a day out. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000))
  const days = Math.floor(total / 86_400)
  const clock = `${pad(Math.floor((total % 86_400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
  return days ? `${days}d ${clock}` : clock
}

// ── reaction ──────────────────────────────────────────────────────────────

/**
 * First market reaction: for each linked symbol, the move from the last print
 * before the release to the latest print after it.
 *
 * `bars` is {SYM: [{time (epoch seconds), close}]}, `quotes` is the feed shape.
 * A symbol with prints on only one side of the timestamp reports nothing from
 * bars — a "reaction" measured entirely before the event is a lie — and falls
 * back to the plain session move, labelled as such.
 */
export function eventReaction(links, { bars = {}, quotes = {}, at = null } = {}) {
  const rows = (links || []).map((link) => {
    const series = bars[link.symbol] || []
    let base = null
    let last = null
    let source = null

    if (at != null && series.length) {
      const atSec = at / 1000
      let before = null
      let after = null
      for (const bar of series) {
        if (bar?.close == null) continue
        if (bar.time <= atSec) before = bar
        else after = bar
      }
      if (before && after) {
        base = before.close
        last = after.close
        source = 'bars'
      }
    }

    if (source == null) {
      const q = quotes[link.symbol]
      if (q?.price != null && q?.prevClose) {
        base = q.prevClose
        last = q.price
        source = 'session'
      }
    }

    const change = source ? last - base : null
    return {
      ...link,
      base: source ? base : null,
      last: source ? last : null,
      change,
      pct: source && base ? (change / base) * 100 : null,
      source,
    }
  })
  return { at, rows, ready: rows.some((r) => r.pct != null) }
}

// ── alert plan ────────────────────────────────────────────────────────────

/**
 * What arming an event alert would actually do — channel, cooldown, hourly
 * budget — computed BEFORE the arm button is pressed. A configured channel that
 * is no longer offered by the service degrades to browser-only rather than
 * promising a delivery that would 400.
 */
export function eventAlertPlan({
  symbol = '', price = null, delivery = {}, destinations = [],
} = {}) {
  const max = Number(delivery.maxPerHour)
  const maxPerHour = Number.isInteger(max) ? Math.max(1, Math.min(60, max)) : 6
  const dest = delivery.enabled === true && delivery.destination
    ? (destinations || []).find((d) => d.key === delivery.destination)
    : null
  const level = parseNumeric(price)
  return {
    symbol: String(symbol || '').toUpperCase(),
    channel: dest ? dest.label : 'browser only',
    channelKind: dest ? 'discord' : 'browser',
    maxPerHour,
    cooldownMinutes: Math.round(60 / maxPerHour),
    budget: `${maxPerHour}/hour`,
    suggested: level ? { operator: '>', value: Number((level * 1.02).toFixed(2)) } : null,
    ready: !!symbol,
  }
}
