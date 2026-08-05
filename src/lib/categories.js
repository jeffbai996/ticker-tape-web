// Explicit per-symbol dashboard category overrides. Membership is global to
// the browser, while each named watchlist owns only its ticker selection.

const KEY = 'dashboard_category_overrides_v1'
const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/
const CATEGORY_RE = /^.{1,32}$/
const listeners = new Set()

export function getCategoryOverrides() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(Object.entries(raw).filter(([symbol, category]) =>
      SYMBOL_RE.test(symbol) && typeof category === 'string' && CATEGORY_RE.test(category),
    ))
  } catch { return {} }
}

function persist(overrides) {
  try { localStorage.setItem(KEY, JSON.stringify(overrides)) } catch { /* best-effort */ }
  for (const fn of listeners) fn(overrides)
}

export function onCategoryOverridesChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setCategoryOverride(value, category) {
  const symbol = String(value || '').trim().toUpperCase()
  if (!SYMBOL_RE.test(symbol)) return null
  const overrides = getCategoryOverrides()
  if (category == null || category === '') {
    delete overrides[symbol]
    persist(overrides)
    return null
  }
  const clean = String(category).trim().slice(0, 32)
  if (!CATEGORY_RE.test(clean)) return null
  overrides[symbol] = clean
  persist(overrides)
  return clean
}

