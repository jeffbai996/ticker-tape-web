// Saved screens: named symbol sets for the screening page, plus the
// fundamental filter predicate. Pure localStorage + pure functions.

const KEY = 'screens_v1'

export function loadScreens() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (Array.isArray(raw)) return raw.filter((s) => s && s.name && s.symbols)
  } catch { /* corrupt = none */ }
  return []
}

function persist(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40))) } catch { /* full */ }
}

export function saveScreen(name, symbols) {
  const n = (name || '').trim()
  const s = (symbols || '').trim()
  if (!n || !s) return
  const list = loadScreens()
  const hit = list.find((x) => x.name === n)
  if (hit) hit.symbols = s
  else list.push({ name: n, symbols: s })
  persist(list)
}

export function deleteScreen(name) {
  persist(loadScreens().filter((x) => x.name !== name))
}

/**
 * Fundamental filter bands over one symbol's fundamentals.
 * bands: { peMax?, growthMin?, marginMin? } — growth/margin in PERCENT
 * (Yahoo serves fractions; the UI speaks percent).
 * Returns true/false, or null when the data needed by an active band is
 * missing — a dash, not a silent pass or fail.
 */
export function passesScreenFilters(fund, bands) {
  const checks = [
    [bands?.peMax, fund?.forwardPE, (v, b) => v <= b],
    [bands?.growthMin, fund?.revenueGrowth != null ? fund.revenueGrowth * 100 : null, (v, b) => v >= b],
    [bands?.marginMin, fund?.profitMargins != null ? fund.profitMargins * 100 : null, (v, b) => v >= b],
  ]
  for (const [band, value, ok] of checks) {
    if (band == null || band === '') continue
    if (value == null) return null
    if (!ok(value, Number(band))) return false
  }
  return true
}
