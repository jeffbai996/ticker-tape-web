// Backtest UI glue — pure helpers around the shared core in src/lib/backtest.js.
// Fills never leave the browser: they live in localStorage only and the
// worker/proxy only ever sees bare symbols + date ranges (THE RULE, CLAUDE.md).

const FILLS_KEY = 'bt_fills_v1'

// Small deterministic demo ledger — generic symbols only, never a real book.
// Six fills across ~2.5 years: two round-trips plus one open position, enough
// to draw entry/exit marks and a non-trivial equity curve.
const DEMO_FILLS_CSV = [
  'date,symbol,side,qty,price',
  '2023-01-10,AAPL,BUY,50,132.50',
  '2023-06-05,MSFT,BUY,20,325.00',
  '2023-11-15,AAPL,SELL,20,189.00',
  '2024-03-01,NVDA,BUY,10,850.00',
  '2024-09-20,MSFT,SELL,20,425.00',
  '2025-02-10,NVDA,SELL,4,720.00',
].join('\n') + '\n'

/** The bundled demo ledger CSV — generic symbols, deterministic, never real. */
export function demoFillsCsv() {
  return DEMO_FILLS_CSV
}

/** Raw fills CSV text from localStorage, or null if the user hasn't saved one. */
export function loadFillsCsv() {
  try {
    return localStorage.getItem(FILLS_KEY)
  } catch {
    return null
  }
}

/** Persist the user's ledger CSV (or clear it back to the demo default). */
export function saveFillsCsv(text) {
  try {
    if (text == null) localStorage.removeItem(FILLS_KEY)
    else localStorage.setItem(FILLS_KEY, text)
  } catch {
    // quota exceeded / private mode: the in-memory value still drives this render
  }
}

/** Date-keyed closes ({ 'YYYY-MM-DD': close }) from a Yahoo v8 chart result,
 *  the shape assembleBacktest/convertBars expect. Bars with a null close are
 *  dropped — never fabricate a price. */
export function closesByDateFromChart(result) {
  const ts = result?.timestamp || []
  const closes = result?.indicators?.quote?.[0]?.close || []
  const out = {}
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i]
    if (c == null) continue
    out[new Date(ts[i] * 1000).toISOString().slice(0, 10)] = c
  }
  return out
}
