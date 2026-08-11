// Trade journal (CLI journal.py parity) — timestamped log of decisions and
// rationale, distinct from chat memories (AI context) and chat history (the
// transcript). Entries auto-tag likely ticker symbols so "what was I thinking
// on MU" is searchable later.

import { pushAdd, pushDelete } from './chatstore.js'

const KEY = 'trade_journal_v1'
const MAX_ENTRIES = 500

const SYM_RE = /\b[A-Z]{1,5}\b/g
const STOPWORDS = new Set([
  'I', 'A', 'AM', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'IF', 'IN', 'IS',
  'IT', 'ME', 'MY', 'NO', 'OF', 'ON', 'OR', 'SO', 'TO', 'UP', 'US', 'WE',
  'THE', 'AND', 'BUT', 'FOR', 'NOT', 'ALL', 'CAN', 'HAD', 'HAS', 'HER',
  'HIM', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'OUR', 'OUT',
  'OWN', 'SAY', 'SHE', 'TOO', 'USE', 'WAY', 'WHO', 'DID', 'GET', 'HIT',
  'LET', 'PUT', 'RUN', 'SET', 'TOP', 'BUY', 'SELL', 'SOLD', 'TRIM', 'HOLD',
  'LONG', 'SHORT', 'FROM', 'JUST', 'OVER', 'SUCH', 'TAKE', 'THAN', 'THEM',
  'VERY', 'WHEN', 'COME', 'MAKE', 'LIKE', 'INTO', 'YEAR', 'BACK', 'ALSO',
  'BEEN', 'CALL', 'EACH', 'EVEN', 'FIND', 'WANT', 'WILL', 'WITH', 'WHAT',
  'THIS', 'THAT', 'HAVE', 'KEEP', 'NEED', 'GOOD', 'HIGH', 'LAST', 'MOST',
  'SOME', 'THEN', 'WENT', 'WERE', 'WELL', 'AI', 'ETF', 'CEO', 'CFO', 'EPS',
  'GDP', 'CPI', 'FED', 'IPO', 'YOY', 'QOQ',
])

function extractSymbols(text) {
  const found = (text.match(SYM_RE) || []).filter((m) => !STOPWORDS.has(m))
  return [...new Set(found)]
}

export function loadJournal() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (Array.isArray(raw)) return raw.filter((e) => e && e.id != null && e.text)
  } catch { /* corrupt state = empty journal */ }
  return []
}

function persist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_ENTRIES)))
  } catch { /* best-effort */ }
}

export function addJournalEntry(text) {
  const t = (text || '').trim()
  if (!t) return null
  const list = loadJournal()
  const id = list.reduce((m, x) => Math.max(m, x.id), 0) + 1
  const entry = { id, text: t, symbols: extractSymbols(t), ts: Date.now() }
  persist([...list, entry])
  pushAdd('journal', entry, (serverId) => {
    const cur = loadJournal()
    const hit = cur.find((e) => e.id === entry.id)
    if (hit && serverId !== entry.id) { hit.id = serverId; persist(cur) }
    entry.id = serverId
  })
  return entry
}

export function removeJournalEntry(id) {
  const list = loadJournal()
  const next = list.filter((e) => e.id !== Number(id))
  if (next.length === list.length) return false
  persist(next)
  pushDelete('journal', Number(id))
  return true
}

export function searchJournal(term) {
  const t = (term || '').toLowerCase()
  return loadJournal().filter((e) => e.text.toLowerCase().includes(t)
    || e.symbols.some((s) => s.toLowerCase() === t))
}
