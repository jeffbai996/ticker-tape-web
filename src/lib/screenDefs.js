// Saved screen DEFINITIONS: a compact predicate set over the technicals the
// feed already computes (badges.js) plus the live quote, AND-combined, with a
// rank field. Deliberately not a query language — field · operator · value is
// the whole grammar, which is why it can be typed on a phone and explained
// back to the user word for word.
//
// Separate from screens.js on purpose: that store holds named SYMBOL LISTS for
// the compare/valuation sheets and keeps working untouched. This one holds the
// rules. Different shape, different key, different lifetime.

import { quoteSpread } from './dashboardRows.js'

const KEY = 'screen_defs_v1'
export const SCREEN_DEFS_VERSION = 1
export const MAX_DEFS = 20
export const MAX_PREDICATES = 6

const num1 = (v) => v.toFixed(1)

/**
 * The screenable surface. `pick` reads one row of the dashboard's own data
 * shape ({symbol, quote, tech}) so a screen can never drift from what the
 * board shows: same fields, same units, same nulls.
 * kind 'number' takes > / < / between; kind 'side' is the SMA position, which
 * is a boolean and takes above / below.
 */
export const SCREEN_FIELDS = [
  { id: 'rsi', label: 'RSI', kind: 'number', unit: '', fmt: num1, pick: (r) => r.tech?.rsi },
  { id: 'rs', label: 'RS', kind: 'number', unit: 'pp', fmt: num1, pick: (r) => r.tech?.rs },
  { id: 'volRatio', label: 'vol', kind: 'number', unit: 'x', fmt: num1, pick: (r) => r.tech?.volRatio },
  { id: 'offHigh', label: 'off high', kind: 'number', unit: '%', fmt: (v) => v.toFixed(0), pick: (r) => r.tech?.offHigh },
  { id: 'sma50', label: 'SMA50', kind: 'side', unit: '', fmt: null, pick: (r) => r.tech?.above50 },
  { id: 'sma200', label: 'SMA200', kind: 'side', unit: '', fmt: null, pick: (r) => r.tech?.above200 },
  { id: 'price', label: 'price', kind: 'number', unit: '', fmt: (v) => v.toFixed(2), pick: (r) => r.quote?.price },
  { id: 'pct', label: 'day %', kind: 'number', unit: '%', fmt: (v) => v.toFixed(2), pick: (r) => r.quote?.pct },
  { id: 'spread', label: 'spread', kind: 'number', unit: '', fmt: (v) => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)), pick: (r) => quoteSpread(r.quote) },
]

const FIELD_BY_ID = new Map(SCREEN_FIELDS.map((f) => [f.id, f]))

export function screenField(id) {
  return FIELD_BY_ID.get(id) || null
}

export const NUMBER_OPS = ['>', '<', 'between']
export const SIDE_OPS = ['above', 'below']

export function opsForField(id) {
  const field = screenField(id)
  if (!field) return []
  return field.kind === 'side' ? SIDE_OPS : NUMBER_OPS
}

export const DEFAULT_RANK = 'rsi'

// The universe a screen runs over is always the user's OWN lists — the main
// board plus any named watchlist. There is no hosted symbol set to opt into,
// which is the point: nothing about what is screened leaves the browser.
export const BOARD_SOURCE = 'board'
export const MAX_UNIVERSE = 120

/**
 * @param {object} def normalized definition (its `sources`)
 * @param {string[]} board the main watchlist
 * @param {Array<{id: string, symbols: string[]}>} lists named watchlists
 */
export function screenUniverse(def, board = [], lists = []) {
  const byId = new Map((lists || []).map((l) => [l.id, l.symbols || []]))
  const out = []
  const seen = new Set()
  for (const source of def?.sources || [BOARD_SOURCE]) {
    for (const symbol of source === BOARD_SOURCE ? board || [] : byId.get(source) || []) {
      if (seen.has(symbol)) continue
      seen.add(symbol)
      out.push(symbol)
    }
  }
  return out.slice(0, MAX_UNIVERSE)
}

function slug(name) {
  return String(name || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'screen'
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 32)
}

/** Number('') is 0, which would turn an empty input box into the rule
 *  "RSI < 0" — a screen that quietly matches nothing. Empty is not a number. */
function toNumber(value) {
  if (value == null || String(value).trim() === '') return NaN
  return Number(value)
}

/** A predicate survives normalization only if it is fully answerable: known
 *  field, legal operator for that field's kind, and finite numbers where the
 *  operator needs them. Half-typed rows are dropped rather than persisted as
 *  a rule that silently matches everything. */
export function normalizePredicate(raw) {
  const field = screenField(raw?.field)
  if (!field) return null
  const op = String(raw?.op || '')
  if (!opsForField(field.id).includes(op)) return null
  if (field.kind === 'side') return { field: field.id, op, value: null, value2: null }
  const value = toNumber(raw?.value)
  if (!Number.isFinite(value)) return null
  if (op === 'between') {
    const value2 = toNumber(raw?.value2)
    if (!Number.isFinite(value2)) return null
    // stored low→high so the explanation reads the way it was meant
    return { field: field.id, op, value: Math.min(value, value2), value2: Math.max(value, value2) }
  }
  return { field: field.id, op, value, value2: null }
}

export function normalizeDef(raw) {
  const name = cleanName(raw?.name)
  if (!name) return null
  const given = /^[a-z0-9-]{1,40}$/.test(String(raw?.id || ''))
  const id = given ? raw.id : slug(name)
  const predicates = (Array.isArray(raw?.predicates) ? raw.predicates : [])
    .map(normalizePredicate)
    .filter(Boolean)
    .slice(0, MAX_PREDICATES)
  const rankBy = screenField(raw?.rankBy) ? raw.rankBy : DEFAULT_RANK
  const sources = [...new Set((Array.isArray(raw?.sources) ? raw.sources : [BOARD_SOURCE])
    .map((s) => String(s || ''))
    .filter((s) => s === BOARD_SOURCE || /^[a-z0-9-]{1,40}$/.test(s)))]
  return {
    id,
    name,
    predicates,
    sources: sources.length ? sources.slice(0, 12) : [BOARD_SOURCE],
    rankBy,
    rankDir: raw?.rankDir === 'asc' ? 'asc' : 'desc',
    updated: Number.isFinite(Number(raw?.updated)) ? Number(raw.updated) : 0,
  }
}

export function newScreenDef(name = 'new screen') {
  return normalizeDef({ name, predicates: [], rankBy: DEFAULT_RANK, rankDir: 'desc' })
}

/** Envelope reader. v0 (a bare array) is accepted and lifted, because the
 *  first shipped shape of anything is always the one without a version. */
export function migrateScreenDefs(raw) {
  const list = Array.isArray(raw) ? raw
    : Array.isArray(raw?.defs) && Number(raw.version) <= SCREEN_DEFS_VERSION ? raw.defs
      : []
  const seen = new Set()
  return list.map(normalizeDef).filter((def) => {
    if (!def || seen.has(def.id)) return false
    seen.add(def.id)
    return true
  }).slice(0, MAX_DEFS)
}

export function loadScreenDefs() {
  try {
    return migrateScreenDefs(JSON.parse(localStorage.getItem(KEY)))
  } catch { return [] }
}

function persist(defs) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: SCREEN_DEFS_VERSION, defs }))
  } catch { /* quota — definitions are best-effort */ }
  return defs
}

/** Upsert by id, or by a fresh unique id derived from the name. */
export function saveScreenDef(raw, now = Date.now()) {
  const def = normalizeDef(raw)
  if (!def) return null
  const defs = loadScreenDefs()
  // Only an explicit id updates in place. A save that carries just a name is a
  // NEW screen, even when its slug collides with one already stored —
  // otherwise "MOMO" would silently overwrite "momo".
  const hasId = /^[a-z0-9-]{1,40}$/.test(String(raw?.id || ''))
  const index = hasId ? defs.findIndex((item) => item.id === def.id) : -1
  const stamped = { ...def, updated: now }
  if (index >= 0) {
    defs[index] = stamped
  } else {
    if (defs.length >= MAX_DEFS) return null
    let id = def.id
    let n = 2
    while (defs.some((item) => item.id === id)) id = `${def.id}-${n++}`
    stamped.id = id
    defs.push(stamped)
  }
  persist(defs)
  return stamped
}

export function deleteScreenDef(id) {
  const defs = loadScreenDefs()
  const next = defs.filter((item) => item.id !== id)
  if (next.length === defs.length) return false
  persist(next)
  return true
}

// ── explanation ───────────────────────────────────────────────────────────

const OP_TEXT = { '>': '>', '<': '<', between: '–', above: '>', below: '<' }

function fmtValue(field, v) {
  if (v == null) return '—'
  return `${field.fmt ? field.fmt(v) : String(v)}${field.unit}`
}

/** "RSI < 30", "vol 1.5x–3.0x", "above SMA200". `label` lets the UI swap in a
 *  translated field name without the store knowing about i18n. */
export function describePredicate(p, label = (id, en) => en) {
  const field = screenField(p?.field)
  if (!field) return ''
  const name = label(field.id, field.label)
  if (field.kind === 'side') return `${p.op} ${name}`
  if (p.op === 'between') return `${name} ${fmtValue(field, p.value)}${OP_TEXT.between}${fmtValue(field, p.value2)}`
  return `${name} ${p.op} ${fmtValue(field, p.value)}`
}

/** The pass line for one row: "RSI 28.4 < 30". */
function explain(p, field, actual, label) {
  const name = label(field.id, field.label)
  if (field.kind === 'side') {
    return `${name} ${actual ? label('above', 'above') : label('below', 'below')}`
  }
  if (p.op === 'between') {
    return `${name} ${fmtValue(field, actual)} in ${fmtValue(field, p.value)}${OP_TEXT.between}${fmtValue(field, p.value2)}`
  }
  return `${name} ${fmtValue(field, actual)} ${p.op} ${fmtValue(field, p.value)}`
}

function passes(p, field, actual) {
  if (field.kind === 'side') return p.op === 'above' ? actual === true : actual === false
  if (p.op === '>') return actual > p.value
  if (p.op === '<') return actual < p.value
  return actual >= p.value && actual <= p.value2
}

const STATUS_ORDER = { match: 0, pending: 1, miss: 2 }

/**
 * Evaluate one screen over dashboard-shaped rows.
 *
 * @param {Array<{symbol: string, quote?: object, tech?: object}>} rows
 * @param {object} def normalized screen definition
 * @param {{labels?: (id: string, en: string) => string}} [options]
 * @returns {Array<{symbol, status, matched, why: string[], missing: string[],
 *                  failed: string[], rank: number|null}>}
 *
 * A row whose inputs have not landed is NOT dropped. It comes back as
 * `pending` with the missing field names, because "no RSI yet" and "RSI 62"
 * are different answers and a screener that conflates them is lying.
 */
export function evaluateScreen(rows, def, { labels = (id, en) => en } = {}) {
  const preds = (def?.predicates || []).map((p) => ({ p, field: screenField(p.field) })).filter((x) => x.field)
  const rank = screenField(def?.rankBy)
  const dir = def?.rankDir === 'asc' ? 1 : -1

  const results = (rows || []).map((row) => {
    const why = []
    const missing = []
    const failed = []
    for (const { p, field } of preds) {
      const actual = field.pick(row) ?? null
      if (actual == null) {
        missing.push(labels(field.id, field.label))
        continue
      }
      if (passes(p, field, actual)) why.push(explain(p, field, actual, labels))
      else failed.push(explain(p, field, actual, labels))
    }
    const status = failed.length ? 'miss' : missing.length ? 'pending' : 'match'
    const rankRaw = rank ? rank.pick(row) ?? null : null
    return {
      symbol: row.symbol,
      status,
      matched: status === 'match',
      why,
      missing,
      failed,
      rank: typeof rankRaw === 'boolean' ? (rankRaw ? 1 : 0) : rankRaw,
    }
  })

  // Rank inside each status band; a row with no rank value sinks to the
  // bottom of its band whichever way the sort points.
  return results.sort((a, b) => {
    const band = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (band) return band
    if (a.rank == null && b.rank == null) return a.symbol.localeCompare(b.symbol)
    if (a.rank == null) return 1
    if (b.rank == null) return -1
    return (a.rank - b.rank) * dir || a.symbol.localeCompare(b.symbol)
  })
}

/** Symbols that were not matching last pass and are matching now. Pure diff so
 *  the alert arming path is testable without a feed. */
export function screenEntrants(previous, results) {
  const before = new Set(previous || [])
  return (results || [])
    .filter((r) => r.matched && !before.has(r.symbol))
    .map((r) => r.symbol)
}

export function matchedSymbols(results) {
  return (results || []).filter((r) => r.matched).map((r) => r.symbol)
}

// ── alert bridge ──────────────────────────────────────────────────────────

// alerts.js speaks one condition at a time (price / rsi / sma_cross / volume).
// An AND of predicates has no representation there, so entering a screen arms
// the CLOSEST SINGLE condition and says so. Faking a compound alert would be
// worse than admitting the approximation.
function mapPredicate(p) {
  if (p.op === 'between') return null
  if (p.field === 'rsi') return { type: 'rsi', operator: p.op, value: p.value }
  if (p.field === 'price') return { type: 'price', operator: p.op, value: p.value }
  if (p.field === 'volRatio') return p.op === '>' ? { type: 'volume', operator: '>', value: p.value } : null
  if (p.field === 'sma50') return { type: 'sma_cross', operator: p.op === 'above' ? '>' : '<', value: 50 }
  if (p.field === 'sma200') return { type: 'sma_cross', operator: p.op === 'above' ? '>' : '<', value: 200 }
  return null
}

/**
 * The alert to arm when `symbol` enters `def`. Prefers the predicate on the
 * rank field — that is the one the user is watching — then falls back to the
 * first mappable predicate. Returns null when nothing in the screen can be
 * expressed as a single alert condition; the UI reports that rather than
 * arming something the user did not ask for.
 */
export function alertSpecForEntry(def, symbol) {
  const preds = def?.predicates || []
  const ranked = preds.find((p) => p.field === def?.rankBy)
  const ordered = ranked ? [ranked, ...preds.filter((p) => p !== ranked)] : preds
  for (const p of ordered) {
    const spec = mapPredicate(p)
    if (spec) return { symbol, ...spec, approx: preds.length > 1, from: p.field }
  }
  return null
}
