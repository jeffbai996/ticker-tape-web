// The TV keeps its own list in widget storage. It is edited with the remote
// (Green adds, Red removes), so the rules are deliberately small: Yahoo-shaped
// symbols only, no duplicates, insertion order is the board order.

const STORAGE_KEY = 'ttw-tv-symbols'

// Generic large caps and index funds only; this repo is public.
export const DEFAULT_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM', 'V',
  'WMT', 'XOM', 'KO', 'SPY', 'QQQ', 'DIA', 'IWM',
]

// Letters, digits and the punctuation Yahoo uses for classes, indices,
// futures, FX and foreign listings (BRK-B, ^GSPC, ES=F, 0700.HK).
const SYMBOL_RE = /^[A-Z0-9^][A-Z0-9.^=-]{0,19}$/

export function normalizeSymbol(raw) {
  const symbol = String(raw ?? '').trim().toUpperCase()
  return SYMBOL_RE.test(symbol) ? symbol : null
}

export function addSymbol(list, raw) {
  const symbol = normalizeSymbol(raw)
  if (!symbol || list.includes(symbol)) return list
  return [...list, symbol]
}

export function removeSymbol(list, symbol) {
  return list.filter((s) => s !== symbol)
}

export function loadSymbols(storage) {
  let raw = null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return [...DEFAULT_SYMBOLS]
  }
  if (raw == null) return [...DEFAULT_SYMBOLS]
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_SYMBOLS]
    return [...new Set(parsed.map(normalizeSymbol).filter(Boolean))]
  } catch {
    return [...DEFAULT_SYMBOLS]
  }
}

export function saveSymbols(storage, list) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // A full or locked store costs persistence, not the session's list.
  }
}
