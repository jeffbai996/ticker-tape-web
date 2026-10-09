// The names actually held: the IBKR positions last seen on the IBKR page plus
// the hand-entered portfolios' holdings. The briefing's technical flags rank
// these first (Jeff 2026-10-09). Per device, like the rest of local state.
import { loadPortfolios } from './myPortfolios.js'

const KEY = 'broker_held_v1'

/** Called by the IBKR page with its current position symbols. */
export function rememberBrokerHoldings(symbols) {
  const clean = [...new Set((symbols || []).filter((s) => typeof s === 'string' && s))]
  try { localStorage.setItem(KEY, JSON.stringify(clean)) } catch { /* best-effort */ }
}

function brokerHeld() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(raw) ? raw.filter((s) => typeof s === 'string' && s) : []
  } catch { return [] }
}

/** Held symbols, broker positions first, without duplicates. */
export function heldSymbols({ portfolios = loadPortfolios() } = {}) {
  const out = [...brokerHeld()]
  for (const p of portfolios || []) for (const h of p.holdings || []) if (h?.symbol) out.push(h.symbol)
  return [...new Set(out)]
}
