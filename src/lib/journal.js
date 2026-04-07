// Trade journal: timestamped entries with auto symbol extraction.
// Stored in localStorage.

import { getItem, setItem } from './storage.js'

const STORAGE_KEY = 'trade_journal'
const MAX_ENTRIES = 500
const SYMBOL_RE = /\b[A-Z]{1,5}\b/g
const STOPWORDS = new Set(['I', 'A', 'AM', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'IF', 'IN', 'IS', 'IT', 'ME', 'MY', 'NO', 'OF', 'OK', 'ON', 'OR', 'SO', 'TO', 'UP', 'US', 'WE', 'THE', 'FOR', 'AND', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'BUY', 'PUT', 'SET', 'NEW', 'NOW', 'OLD', 'SEE', 'WAY', 'MAY', 'SAY', 'SHE', 'HIS', 'HOW', 'MAN', 'ITS', 'LET', 'TOP', 'RED', 'RUN', 'END', 'DID', 'GET', 'HAS', 'HIM', 'HIT', 'LOW', 'OIL', 'SIT', 'TRY', 'USE', 'ADD', 'AGO', 'BIG', 'GOT', 'MAX', 'MIN', 'NET', 'PER', 'PRE', 'RAN', 'RAW', 'ROW', 'SAT', 'TAX', 'YES', 'YET'])

export function loadEntries() {
  return getItem(STORAGE_KEY, [])
}

export function addEntry(text) {
  const entries = loadEntries()
  const symbols = extractSymbols(text)
  const entry = {
    id: entries.length ? Math.max(...entries.map(e => e.id)) + 1 : 1,
    text,
    symbols,
    ts: new Date().toISOString(),
  }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  setItem(STORAGE_KEY, entries)
  return entry
}

export function removeEntry(id) {
  const entries = loadEntries().filter(e => e.id !== id)
  setItem(STORAGE_KEY, entries)
}

export function searchEntries(term) {
  const q = term.toLowerCase()
  return loadEntries().filter(e =>
    e.text.toLowerCase().includes(q) ||
    e.symbols?.some(s => s.toLowerCase().includes(q))
  )
}

function extractSymbols(text) {
  const matches = text.match(SYMBOL_RE) || []
  return [...new Set(matches.filter(m => !STOPWORDS.has(m) && m.length >= 2))]
}
