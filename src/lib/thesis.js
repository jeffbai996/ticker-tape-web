// Thesis Watcher presentation data. The API remains the source of truth for
// verdicts; this module only turns its records into a compact, reviewable view.
//
// Every helper here is tolerant of an older fragwire: the watcher API is being
// extended (evidence, freshness, catalysts, manual history, candidate ids) and
// the page has to render honestly against a server that predates all of it.

/** Epoch seconds, epoch millis or an ISO string → millis. null when unusable. */
export function toMs(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    // anything below ~1973 in millis is really a seconds stamp
    return value < 1e11 ? value * 1000 : value
  }
  const numeric = Number(value)
  if (!Number.isNaN(numeric) && /^\d+(\.\d+)?$/.test(String(value).trim())) return toMs(numeric)
  // bare SQLite stamps ("2026-08-10 04:00:00") are UTC, not local
  const text = String(value).trim()
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text) ? `${text.replace(' ', 'T')}Z` : text
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? null : parsed
}

// Four distinct truths, never conflated: a detector that fired, a detector
// that cleared, a detector that could not see (a risk in itself — amber), and
// a manual condition nobody has reviewed yet (merely absent — muted).
export const VERDICTS = {
  FIRED: { code: 'FIRED', label: 'FIRED', tone: 'fired', rank: 0 },
  NO_DATA: { code: 'NO_DATA', label: 'NO DATA', tone: 'warn', rank: 1 },
  AWAITING: { code: 'AWAITING', label: 'AWAITING REVIEW', tone: 'muted', rank: 2 },
  CLEAR: { code: 'CLEAR', label: 'CLEAR', tone: 'clear', rank: 3 },
}

/** Verdict → display state. `auto` decides what "insufficient data" means. */
export function verdictState(breaker) {
  const raw = String(breaker?.verdict || '').toUpperCase()
  if (raw === 'FIRED') return VERDICTS.FIRED
  if (raw === 'CLEAR') return VERDICTS.CLEAR
  if (raw === 'AWAITING' || raw === 'AWAITING_REVIEW') return VERDICTS.AWAITING
  // INSUFFICIENT_DATA / NO_DATA / missing: an automated detector with no data
  // is blind, which is a warning; a manual condition with no entry is just
  // unreviewed. `auto` absent (older server) is treated as automated so the
  // page errs toward warning rather than silence.
  return breaker?.auto === false ? VERDICTS.AWAITING : VERDICTS.NO_DATA
}

export function thesisHealth(breakers) {
  const rows = Array.isArray(breakers) ? breakers : []
  let fired = 0, clear = 0, awaiting = 0, noData = 0
  for (const row of rows) {
    const code = verdictState(row).code
    if (code === 'FIRED') fired += 1
    else if (code === 'CLEAR') clear += 1
    else if (code === 'AWAITING') awaiting += 1
    else noData += 1
  }
  return {
    state: fired ? 'BREACHED' : 'GOOD',
    total: rows.length,
    fired, clear, awaiting, noData,
    review: awaiting + noData,
  }
}

// Re-underwrite conditions sit above trim conditions: one changes the thesis,
// the other only changes the size.
export const SEVERITY_ORDER = ['reunderwrite', 'trim']

export function severityRank(severity) {
  const index = SEVERITY_ORDER.indexOf(String(severity || '').toLowerCase())
  return index === -1 ? SEVERITY_ORDER.length : index
}

/** Group breakers by severity, worst severity and worst verdict first. */
export function groupBySeverity(breakers) {
  const rows = Array.isArray(breakers) ? breakers : []
  const groups = new Map()
  for (const row of rows) {
    const severity = String(row?.severity || '').toLowerCase() || 'other'
    if (!groups.has(severity)) groups.set(severity, [])
    groups.get(severity).push(row)
  }
  return [...groups.entries()]
    .map(([severity, list]) => ({
      severity,
      rows: [...list].sort((a, b) =>
        verdictState(a).rank - verdictState(b).rank
        || String(a.id).localeCompare(String(b.id))),
      fired: list.filter((row) => verdictState(row).code === 'FIRED').length,
    }))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity)
      || a.severity.localeCompare(b.severity))
}

/** Compact age string for a timestamp: "4m" / "3h" / "2d". */
export function ageLabel(ms, now = Date.now()) {
  if (ms == null) return ''
  const mins = Math.max(0, Math.round((now - ms) / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

// Daily cron: a run older than one day plus slack is late, two days is broken.
const FRESH_WARN_H = 26
const FRESH_STALE_H = 50

/**
 * Watcher freshness from the run record, falling back to the database mtime
 * when an older server reports no run at all.
 */
export function watcherFreshness(freshness, now = Date.now()) {
  const run = freshness?.last_run || null
  const runMs = toMs(run?.finished_at ?? run?.started_at)
  const dbMs = toMs(freshness?.db_mtime)
  const ms = runMs ?? dbMs
  if (ms == null) return null
  const ageHours = (now - ms) / 3_600_000
  const tone = ageHours > FRESH_STALE_H ? 'fired' : ageHours > FRESH_WARN_H ? 'warn' : 'clear'
  return {
    ms,
    source: runMs != null ? 'run' : 'db',
    kind: run?.kind || '',
    evaluated: run?.evaluated ?? null,
    fired: run?.fired ?? null,
    ageHours,
    age: ageLabel(ms, now),
    tone,
  }
}

const EVIDENCE_SKIP = new Set(['', 'null', 'undefined'])

/** Evidence blob → readable key/value rows. One level deep; nests serialize. */
export function evidenceRows(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return []
  const out = []
  for (const [key, value] of Object.entries(evidence)) {
    let text
    if (value == null) text = '—'
    else if (typeof value === 'boolean') text = value ? 'yes' : 'no'
    else if (typeof value === 'number') text = String(value)
    else if (typeof value === 'string') text = value
    else if (Array.isArray(value)) text = value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ')
    else text = JSON.stringify(value)
    if (EVIDENCE_SKIP.has(text)) text = '—'
    out.push({ key, label: key.replaceAll('_', ' '), value: text })
  }
  return out
}

/** Future-only catalysts with a days-until count, soonest first. */
export function catalystRows(catalysts, today = new Date().toISOString().slice(0, 10)) {
  const base = Date.parse(`${today}T00:00:00Z`)
  return (Array.isArray(catalysts) ? catalysts : [])
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row?.date || '')))
    .map((row) => ({
      ...row,
      // the bridge passes catalysts.yaml's own field name through ("what");
      // normalize here so the view speaks one vocabulary
      label: row.label ?? row.what ?? '',
      days: Math.round((Date.parse(`${row.date}T00:00:00Z`) - base) / 86_400_000),
    }))
    .filter((row) => Number.isFinite(row.days) && row.days >= 0)
    .sort((a, b) => a.days - b.days || String(a.label).localeCompare(String(b.label)))
}

/** Rotation ledger, newest first, with the timestamp field normalized. */
export function rotationLedger(rotation) {
  return (Array.isArray(rotation) ? rotation : [])
    .filter((row) => row && row.estimate)
    .map((row) => ({
      estimate: String(row.estimate),
      note: row.note || '',
      breaker_id: row.breaker_id || null,
      ms: toMs(row.created_at ?? row.set_at),
    }))
    .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))
}

/** Open sweep candidates. Older servers send no id/status — index stands in. */
export function candidateRows(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((row, index) => ({
      ...row,
      key: row?.id != null ? String(row.id) : `i${index}`,
      actionable: row?.id != null,
      status: row?.status || 'new',
    }))
    .filter((row) => row.status === 'new')
}

export function thesisSignals(events, limit = 8) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => event?.headline && Number(event.meta?.thesis || 0) >= 2)
    .sort((a, b) => (b.ts_event || 0) - (a.ts_event || 0))
    .slice(0, limit)
}

export function thesisAnalysisPrompt(breakers, signals) {
  const conditions = (Array.isArray(breakers) ? breakers : [])
    .map((breaker) => `${breaker.id} [${breaker.verdict}]: ${breaker.description || 'No description.'}`)
    .join('\n') || 'No watch conditions are available.'
  const evidence = (Array.isArray(signals) ? signals : [])
    .map((signal) => `${signal.source || 'wire'}: ${signal.headline}${signal.url ? ` (${signal.url})` : ''}`)
    .join('\n') || 'No thesis-tagged wire signals are available in this window.'
  return `Review this Thesis Watcher snapshot using only the supplied conditions and wire evidence.

CONDITIONS
${conditions}

WIRE EVIDENCE
${evidence}

Return three concise sections: changed evidence, condition impact, and open evidence. Cite the relevant source line for each conclusion. Do not mark any breaker as fired. Do not make a trade recommendation.`
}
