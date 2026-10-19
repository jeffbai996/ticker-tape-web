// Rich chat output: the versioned block contract that lets an assistant
// answer carry a chart or table. Blocks are built app-side from tool data
// (chatVisuals.js), validated here before they enter the transcript, and
// validated again at render so a synced or hand-edited thread cannot draw
// anything the schema does not describe. Pure: no DOM, no I/O.

export const BLOCK_VERSION = 1
export const BLOCK_TYPES = ['line', 'bars', 'table']
export const BLOCK_LIMITS = {
  series: 8, points: 400, items: 60, rows: 60, columns: 8, notes: 6,
  text: 160, cell: 80, bytes: 40_000,
}
const UNIT_KINDS = new Set(['index', 'pct', 'ccy', 'price', 'count', 'text'])
const ALIGNS = new Set(['left', 'right'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const KEY_RE = /^[A-Za-z0-9._^=:-]{1,64}$/

const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const text = (value, max = BLOCK_LIMITS.text) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const fail = (error) => ({ ok: false, error })

function cleanUnit(raw) {
  if (!raw || typeof raw !== 'object') return { kind: 'text' }
  const kind = UNIT_KINDS.has(raw.kind) ? raw.kind : 'text'
  const unit = { kind }
  const currency = text(raw.currency, 8)
  if (currency) unit.currency = currency
  if (finite(raw.baseline) != null) unit.baseline = raw.baseline
  const digits = finite(raw.digits)
  if (digits != null) unit.digits = Math.max(0, Math.min(6, Math.trunc(digits)))
  return unit
}

function cleanSource(raw) {
  if (!raw || typeof raw !== 'object') return null
  const source = {}
  for (const field of ['tool', 'provider', 'range', 'baselineDate', 'portfolioId']) {
    const value = text(raw[field])
    if (value) source[field] = value
  }
  const asOf = finite(raw.asOf)
  if (asOf != null) source.asOf = Math.trunc(asOf)
  return Object.keys(source).length ? source : null
}

function cleanLine(raw, block) {
  if (!Array.isArray(raw.dates) || !Array.isArray(raw.series)) return fail('line block needs dates and series')
  if (raw.dates.length < 2 || raw.dates.length > BLOCK_LIMITS.points) return fail('line block point count out of range')
  if (!raw.series.length || raw.series.length > BLOCK_LIMITS.series) return fail('line block series count out of range')
  const dates = raw.dates.map((d) => (typeof d === 'string' && DATE_RE.test(d) ? d : null))
  if (dates.some((d) => !d)) return fail('line block dates must be YYYY-MM-DD')
  const series = []
  const keys = new Set()
  for (const entry of raw.series) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.values)) return fail('line block series malformed')
    const key = typeof entry.key === 'string' && KEY_RE.test(entry.key) ? entry.key : ''
    if (!key || keys.has(key)) return fail('line block series keys must be unique')
    if (entry.values.length !== dates.length) return fail('line block series length must match dates')
    keys.add(key)
    series.push({ key, label: text(entry.label) || key, values: entry.values.map(finite) })
  }
  if (!series.some((s) => s.values.some((v) => v != null))) return fail('line block has no finite values')
  return { ok: true, block: { ...block, dates, series } }
}

function cleanBars(raw, block) {
  if (!Array.isArray(raw.items) || !raw.items.length || raw.items.length > BLOCK_LIMITS.items) return fail('bars block item count out of range')
  const items = []
  const keys = new Set()
  for (const entry of raw.items) {
    if (!entry || typeof entry !== 'object') return fail('bars block item malformed')
    const key = typeof entry.key === 'string' && KEY_RE.test(entry.key) ? entry.key : ''
    if (!key || keys.has(key)) return fail('bars block item keys must be unique')
    keys.add(key)
    const item = { key, label: text(entry.label) || key, value: finite(entry.value) }
    const pct = finite(entry.pct)
    if (pct != null) item.pct = pct
    const note = text(entry.note)
    if (note) item.note = note
    items.push(item)
  }
  return { ok: true, block: { ...block, items, signed: !!raw.signed } }
}

function cleanTable(raw, block) {
  if (!Array.isArray(raw.columns) || !raw.columns.length || raw.columns.length > BLOCK_LIMITS.columns) return fail('table block column count out of range')
  if (!Array.isArray(raw.rows) || raw.rows.length > BLOCK_LIMITS.rows) return fail('table block row count out of range')
  const columns = []
  const keys = new Set()
  for (const entry of raw.columns) {
    if (!entry || typeof entry !== 'object') return fail('table block column malformed')
    const key = typeof entry.key === 'string' && KEY_RE.test(entry.key) ? entry.key : ''
    if (!key || keys.has(key)) return fail('table block column keys must be unique')
    keys.add(key)
    columns.push({ key, label: text(entry.label) || key, align: ALIGNS.has(entry.align) ? entry.align : 'left' })
  }
  const rows = []
  for (const row of raw.rows) {
    if (!Array.isArray(row) || row.length !== columns.length) return fail('table block rows must match the columns')
    rows.push(row.map((cell) => (typeof cell === 'number' ? finite(cell) : typeof cell === 'string' ? text(cell, BLOCK_LIMITS.cell) : null)))
  }
  return { ok: true, block: { ...block, columns, rows } }
}

/**
 * Validate one block. Returns {ok:true, block} with a clean copy (unknown
 * fields dropped, NaN/Infinity → null, strings bounded) or {ok:false, error}.
 */
export function validateBlock(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('block must be an object')
  if (raw.v !== BLOCK_VERSION) return fail(`unsupported block version ${String(raw.v)}`)
  if (!BLOCK_TYPES.includes(raw.type)) return fail(`unsupported block type ${String(raw.type)}`)
  const id = typeof raw.id === 'string' && KEY_RE.test(raw.id) ? raw.id : ''
  if (!id) return fail('block id required')
  const title = text(raw.title)
  if (!title) return fail('block title required')
  const block = { v: BLOCK_VERSION, type: raw.type, id, title, unit: cleanUnit(raw.unit) }
  const subtitle = text(raw.subtitle)
  if (subtitle) block.subtitle = subtitle
  const source = cleanSource(raw.source)
  if (source) block.source = source
  if (Array.isArray(raw.notes)) {
    const notes = raw.notes.map((n) => text(n)).filter(Boolean).slice(0, BLOCK_LIMITS.notes)
    if (notes.length) block.notes = notes
  }
  const result = raw.type === 'line' ? cleanLine(raw, block)
    : raw.type === 'bars' ? cleanBars(raw, block)
      : cleanTable(raw, block)
  if (!result.ok) return result
  if (JSON.stringify(result.block).length > BLOCK_LIMITS.bytes) return fail('block exceeds the size limit')
  return result
}

/** Build a block through the validator so executors cannot ship a malformed one. */
export function makeBlock(raw) {
  const result = validateBlock(raw)
  if (!result.ok) throw new Error(`invalid chat block: ${result.error}`)
  return result.block
}

/** Valid blocks carried by the tool records of the turn that contains `index`. */
export function turnBlocks(history, index) {
  let start = index
  while (start > 0 && history[start].role !== 'user') start -= 1
  let end = index
  while (end + 1 < history.length && history[end + 1].role !== 'user') end += 1
  const out = []
  for (let i = start; i <= end; i++) {
    const message = history[i]
    if (message?.role !== 'tool' || !message.block) continue
    const result = validateBlock(message.block)
    if (result.ok) out.push({ ...result.block, key: `${i}:${result.block.id}` })
  }
  return out
}

/**
 * Where each turn's blocks render: on its final text answer when there is
 * one, otherwise on the turn's last record. With `liveTail`, the newest turn
 * is still streaming and its blocks are returned separately so the page can
 * draw them between the live trace and the live answer.
 */
export function blockAnchors(history, { liveTail = false } = {}) {
  const anchors = new Map()
  let tail = []
  let start = -1
  const close = (end, isTail) => {
    if (start < 0) return
    const blocks = turnBlocks(history, start)
    if (!blocks.length) return
    if (isTail) { tail = blocks; return }
    let anchor = end
    for (let i = end; i >= start; i--) {
      const m = history[i]
      if (m.role === 'assistant' && m.content && !m.toolCalls?.length) { anchor = i; break }
    }
    anchors.set(anchor, blocks)
  }
  for (let i = 0; i < history.length; i++) {
    if (history[i].role === 'user') { close(i - 1, false); start = i }
  }
  close(history.length - 1, liveTail)
  return { anchors, tail }
}

/** A plain-text rendering for transcript export and for screen readers. */
export function blockText(block) {
  const lines = [`[${block.title}${block.subtitle ? ` — ${block.subtitle}` : ''}]`]
  if (block.type === 'line') {
    lines.push(['date', ...block.series.map((s) => s.label)].join(' | '))
    block.dates.forEach((d, i) => lines.push([d, ...block.series.map((s) => (s.values[i] == null ? '—' : String(s.values[i])))].join(' | ')))
  } else if (block.type === 'bars') {
    for (const item of block.items) lines.push(`${item.label}: ${item.value == null ? '—' : item.value}${item.pct != null ? ` (${item.pct}%)` : ''}${item.note ? ` · ${item.note}` : ''}`)
  } else {
    lines.push(block.columns.map((c) => c.label).join(' | '))
    for (const row of block.rows) lines.push(row.map((cell) => (cell == null ? '—' : String(cell))).join(' | '))
  }
  for (const note of block.notes || []) lines.push(`· ${note}`)
  return lines.join('\n')
}

/** Even sampling that always keeps the first and last observation. */
export function sampleIndices(length, max) {
  if (length <= max) return Array.from({ length }, (_, i) => i)
  const out = []
  for (let k = 0; k < max; k++) out.push(Math.round((k * (length - 1)) / (max - 1)))
  return [...new Set(out)]
}

/**
 * Align several bar lists on their session dates and index each to 100 at
 * the first date every series has observed. Dates a series did not trade are
 * null, never forward-filled, so a holiday on one exchange shows as a gap
 * rather than a fabricated print.
 */
export function indexedComparison(inputs, { dateOf, max = BLOCK_LIMITS.points } = {}) {
  const closes = inputs.map(({ bars }) => {
    const byDate = new Map()
    for (const bar of bars || []) {
      const d = dateOf(bar)
      const c = finite(bar?.close)
      if (d && c != null && c > 0) byDate.set(d, c)
    }
    return byDate
  })
  const dates = [...new Set(closes.flatMap((m) => [...m.keys()]))].sort()
  const baselineDate = dates.find((d) => closes.every((m) => m.has(d))) || null
  if (!baselineDate) return { dates: [], series: [], baselineDate: null, missing: {}, sampled: false }
  const window = dates.filter((d) => d >= baselineDate)
  const picked = sampleIndices(window.length, max).map((i) => window[i])
  const missing = {}
  const series = inputs.map(({ key, label }, k) => {
    const base = closes[k].get(baselineDate)
    let gaps = 0
    const values = picked.map((d) => {
      const c = closes[k].get(d)
      if (c == null) { gaps += 1; return null }
      return Math.round((c / base) * 10000) / 100
    })
    missing[key] = gaps
    return { key, label: label || key, values }
  })
  return { dates: picked, series, baselineDate, missing, sampled: picked.length < window.length, sessions: window.length }
}
