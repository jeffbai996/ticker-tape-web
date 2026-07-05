// Generated-report archive: every AI briefing/memo auto-saves here so a good
// synthesis isn't lost to a page refresh. Per-browser localStorage, newest
// first, capped — the CLI's conviction-archive idea without the YAML.

const KEY = 'report_archive_v1'
const MAX = 50

const listeners = new Set()

export function onArchiveChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function loadArchive() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch { /* quota — drop the tail and retry once */
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10)))
    } catch { /* give up quietly */ }
  }
  for (const fn of listeners) fn(list)
}

/** Save one generated report; returns the entry. Newest first, capped. */
export function saveReport({ kind, symbol = null, title, text }) {
  if (!text?.trim()) return null
  const list = loadArchive()
  const entry = {
    id: Math.max(0, ...list.map((r) => r.id)) + 1,
    ts: Date.now(),
    kind: kind === 'memo' ? 'memo' : 'briefing',
    symbol: symbol ? symbol.toUpperCase() : null,
    title: (title || 'report').slice(0, 80),
    text,
  }
  save([entry, ...list].slice(0, MAX))
  return entry
}

export function removeReport(id) {
  const list = loadArchive()
  const next = list.filter((r) => r.id !== id)
  if (next.length === list.length) return false
  save(next)
  return true
}
