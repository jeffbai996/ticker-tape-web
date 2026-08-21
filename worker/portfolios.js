// Capability-scoped "my portfolios" sync for the public build (Jeff
// 2026-08-20: the book has a real user now — localStorage alone evaporates
// on iOS after a week away). Rides the SAME sync code as the watchlist
// document but its own KV row, so old clients that only know watchlists can
// never stomp a portfolio doc.

import { CAPABILITY_RE, exactKeys, makeCapDocHandler, plainObject } from './capdoc.js'

const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/
const ID_RE = /^p\d{1,6}$/
const CCYS = new Set(['USD', 'CAD', 'HKD', 'CNY'])
const MAX_PORTFOLIOS = 20
const MAX_HOLDINGS = 60
const MAX_NAME_CHARS = 40
const MAX_BODY_BYTES = 64_000

export function validPortfolioCapability(value) {
  return CAPABILITY_RE.test(String(value || ''))
}

export function portfolioStorageKey(capability) {
  if (!validPortfolioCapability(capability)) return ''
  return `myportfolios:${capability}`
}

function validHolding(h) {
  if (!plainObject(h)) return false
  const keys = Object.keys(h)
  if (!keys.every((k) => k === 'symbol' || k === 'shares' || k === 'cost')) return false
  if (typeof h.symbol !== 'string' || !SYMBOL_RE.test(h.symbol)) return false
  if (typeof h.shares !== 'number' || !Number.isFinite(h.shares) || h.shares <= 0) return false
  if ('cost' in h && (typeof h.cost !== 'number' || !Number.isFinite(h.cost) || h.cost <= 0)) return false
  return true
}

function validClock(value) {
  if (!plainObject(value) || Object.keys(value).length > MAX_PORTFOLIOS * 2) return false
  return Object.entries(value).every(([part, stamp]) =>
    ID_RE.test(part) && Number.isSafeInteger(stamp) && stamp >= 0)
}

export function validatePortfolioDocument(value) {
  if (!plainObject(value)
      || !exactKeys(value, new Set(['portfolios', 'touched', 'deleted']))) {
    return { ok: false, error: 'invalid document shape' }
  }
  if (!Array.isArray(value.portfolios) || value.portfolios.length > MAX_PORTFOLIOS) {
    return { ok: false, error: 'invalid portfolios' }
  }
  const ids = new Set()
  for (const p of value.portfolios) {
    if (!plainObject(p)
        || !exactKeys(p, new Set(['id', 'name', 'ccy', 'holdings']))
        || typeof p.id !== 'string' || !ID_RE.test(p.id) || ids.has(p.id)
        || typeof p.name !== 'string' || !p.name.trim() || p.name.length > MAX_NAME_CHARS
        || !CCYS.has(p.ccy)
        || !Array.isArray(p.holdings) || p.holdings.length > MAX_HOLDINGS) {
      return { ok: false, error: 'invalid portfolio' }
    }
    const symbols = new Set()
    for (const h of p.holdings) {
      if (!validHolding(h) || symbols.has(h.symbol)) return { ok: false, error: 'invalid holding' }
      symbols.add(h.symbol)
    }
    ids.add(p.id)
  }
  if (!validClock(value.touched) || !validClock(value.deleted)) {
    return { ok: false, error: 'invalid sync metadata' }
  }
  return { ok: true }
}

export const handlePortfolios = makeCapDocHandler({
  route: '/portfolios/',
  keyPrefix: 'myportfolios:',
  validate: validatePortfolioDocument,
  maxBody: MAX_BODY_BYTES,
})
