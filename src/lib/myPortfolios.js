/** Hand-built portfolios, Koyfin-style (Jeff 2026-08-20).
 *
 *  Several books, each with a display currency chosen at creation; holdings
 *  in any of USD/CAD/HKD/CNY, valued off the live feed. The site is static,
 *  so localStorage is the book of record — nothing a user types here ever
 *  leaves the browser. First run seeds one obviously-generic multi-market
 *  sample so the page demonstrates itself; delete it and it stays gone
 *  (absent key = never visited, stored [] = deliberately empty).
 */

import { sessionDayPct, dayPnlFromValue } from './dayPnl.js'
import { convertCcy, holdingCurrency, PORTFOLIO_CCYS } from './fx.js'
import { SYMBOL_RE } from './symbols.js'
import { normalizeVenueCode } from './venueCodes.js'

const KEY = 'my_portfolios_v1'
export const MAX_MY_PORTFOLIOS = 20
export const MAX_MY_HOLDINGS = 60
const MAX_NAME = 40
const listeners = new Set()

// The short-lived first-run sample (2026-08-20, same day): browsers that
// loaded that build still hold it. An UNTOUCHED copy — exact name and
// holdings — is dropped on load; one the user edited is theirs now.
const OLD_SEED = '{"symbol":"AAPL","shares":10,"cost":180}|{"symbol":"RY.TO","shares":20,"cost":125}|{"symbol":"0700.HK","shares":100,"cost":320}|{"symbol":"600519.SS","shares":5,"cost":1500}'
const isOldSeed = (p) => p.name === 'Sample (multi-currency)' && p.ccy === 'USD'
  && p.holdings.map((h) => JSON.stringify(h)).join('|') === OLD_SEED

const cleanName = (v) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME)

function cleanHolding(h) {
  // Board codes typed off a broker screen ("02628") name nothing on any
  // venue, so they are repaired here rather than stored broken — on the way
  // in AND on every load, which quietly fixes books already in storage.
  // Shares and cost are never touched (Jeff 2026-08-21).
  const symbol = normalizeVenueCode(h?.symbol)
  const shares = Number(h?.shares)
  if (!SYMBOL_RE.test(symbol)) return null
  if (!Number.isFinite(shares) || shares <= 0) return null
  const cost = Number(h?.cost)
  return Number.isFinite(cost) && cost > 0
    ? { symbol, shares, cost }
    : { symbol, shares }
}

/** One cash account per supported currency, no more (Jeff 2026-08-21). A
 *  negative amount is a margin balance, not an error. */
function cleanCash(raw) {
  const seen = new Set()
  return (Array.isArray(raw) ? raw : []).flatMap((c) => {
    const ccy = String(c?.ccy || '').toUpperCase()
    const amount = Number(c?.amount)
    if (!PORTFOLIO_CCYS.includes(ccy) || seen.has(ccy)) return []
    if (typeof c?.amount === 'boolean' || c?.amount === '' || !Number.isFinite(amount)) return []
    seen.add(ccy)
    return [{ ccy, amount }]
  })
}

let nextId = 1
function freshId(taken) {
  while (taken.has(`p${nextId}`)) nextId++
  return `p${nextId++}`
}

function sanitize(raw) {
  if (!Array.isArray(raw)) return []
  const ids = new Set()
  return raw.flatMap((item) => {
    const name = cleanName(item?.name)
    const id = String(item?.id || '')
    if (!name || !/^p\d+$/.test(id) || ids.has(id)) return []
    if (!PORTFOLIO_CCYS.includes(item?.ccy)) return []
    ids.add(id)
    const seen = new Set()
    const holdings = (Array.isArray(item.holdings) ? item.holdings : [])
      .map(cleanHolding)
      .filter((h) => h && !seen.has(h.symbol) && seen.add(h.symbol))
      .slice(0, MAX_MY_HOLDINGS)
    return [{ id, name, ccy: item.ccy, holdings, cash: cleanCash(item.cash) }]
  }).slice(0, MAX_MY_PORTFOLIOS)
}

export function loadPortfolios() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw == null) return []
    return sanitize(JSON.parse(raw)).filter((p) => !isOldSeed(p))
  } catch { return [] }
}

function persist(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* best-effort */ }
  for (const fn of [...listeners]) fn(items)
}

/** Apply a cloud-merged set wholesale (sync engine only): sanitized through
 *  the same gate as user input, then persisted and announced. */
export function replacePortfolios(items) {
  const clean = sanitize(items || [])
  persist(clean)
  return clean
}

export function onPortfoliosChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function createPortfolio(name, ccy) {
  const clean = cleanName(name)
  if (!clean || !PORTFOLIO_CCYS.includes(ccy)) return null
  const items = loadPortfolios()
  if (items.length >= MAX_MY_PORTFOLIOS) return null
  const p = { id: freshId(new Set(items.map((x) => x.id))), name: clean, ccy, holdings: [], cash: [] }
  persist([...items, p])
  return p
}

export function renamePortfolio(id, name) {
  const clean = cleanName(name)
  if (!clean) return null
  const items = loadPortfolios()
  const p = items.find((x) => x.id === id)
  if (!p) return null
  p.name = clean
  persist(items)
  return p
}

/** Display currency is a view choice, not an identity — changeable any time
 *  (Jeff 2026-08-20). Holdings stay untouched; totals re-convert live. */
export function setPortfolioCcy(id, ccy) {
  if (!PORTFOLIO_CCYS.includes(ccy)) return null
  const items = loadPortfolios()
  const p = items.find((x) => x.id === id)
  if (!p) return null
  p.ccy = ccy
  persist(items)
  return p
}

export function deletePortfolio(id) {
  persist(loadPortfolios().filter((x) => x.id !== id))
}

/** Add or restate one holding. Returns the stored holding, or null if the
 *  input would corrupt the book (bad symbol, non-positive shares, full). */
export function setHolding(id, symbol, shares, cost) {
  const clean = cleanHolding({ symbol, shares, cost })
  if (!clean) return null
  const items = loadPortfolios()
  const p = items.find((x) => x.id === id)
  if (!p) return null
  const at = p.holdings.findIndex((h) => h.symbol === clean.symbol)
  if (at >= 0) p.holdings[at] = clean
  else if (p.holdings.length < MAX_MY_HOLDINGS) p.holdings.push(clean)
  else return null
  persist(items)
  return clean
}

export function removeHolding(id, symbol) {
  const items = loadPortfolios()
  const p = items.find((x) => x.id === id)
  if (!p) return
  const sym = String(symbol || '').toUpperCase()
  p.holdings = p.holdings.filter((h) => h.symbol !== sym)
  persist(items)
}

/** Set (or restate) the one cash account this book keeps in `ccy`. Returns
 *  the stored account, or null if the currency or the amount is not one the
 *  book can hold. */
export function setCash(id, ccy, amount) {
  const [clean] = cleanCash([{ ccy, amount }])
  if (!clean) return null
  const items = loadPortfolios()
  const p = items.find((x) => x.id === id)
  if (!p) return null
  const at = p.cash.findIndex((c) => c.ccy === clean.ccy)
  if (at >= 0) p.cash[at] = clean
  else p.cash.push(clean)
  persist(items)
  return clean
}

export function removeCash(id, ccy) {
  const items = loadPortfolios()
  const p = items.find((x) => x.id === id)
  if (!p) return
  p.cash = p.cash.filter((c) => c.ccy !== String(ccy || '').toUpperCase())
  persist(items)
}

/** The live math, pure: holdings + cash + quotes + FX rates →
 *  display-currency rows and totals. A holding missing a price OR a rate
 *  lands in `missing` and stays out of every total — a dash beats a silently
 *  wrong sum. Cash accounts join the same row list under `kind: 'cash'`: they
 *  carry value and weight but no price, no day P&L and no cost basis. */
export function portfolioValues(holdings, quotes, rates, displayCcy, cash) {
  const rows = []
  const missing = []
  for (const h of holdings || []) {
    const q = quotes?.[h.symbol]
    const ccy = holdingCurrency(h.symbol, q)
    const px = q?.extPrice ?? q?.price
    const native = typeof px === 'number' && px > 0 ? px * h.shares : null
    const valueDisplay = convertCcy(native, ccy, displayCcy, rates)
    if (valueDisplay == null) {
      missing.push(h.symbol)
      rows.push({ ...h, kind: 'equity', ccy, price: px ?? null, dayPct: null,
        valueDisplay: null, dayPnlDisplay: null, unrealDisplay: null, weightPct: null })
      continue
    }
    const dayPct = sessionDayPct(q)
    const unrealNative = h.cost != null && native != null ? native - h.cost * h.shares : null
    rows.push({
      ...h,
      kind: 'equity',
      ccy,
      price: px,
      dayPct,
      valueDisplay,
      dayPnlDisplay: dayPnlFromValue(valueDisplay, dayPct),
      unrealDisplay: convertCcy(unrealNative, ccy, displayCcy, rates),
      weightPct: null,
    })
  }
  for (const c of cash || []) {
    const valueDisplay = convertCcy(c.amount, c.ccy, displayCcy, rates)
    if (valueDisplay == null) missing.push(`${c.ccy} cash`)
    rows.push({
      kind: 'cash', ccy: c.ccy, amount: c.amount, symbol: `CASH.${c.ccy}`,
      price: null, dayPct: null, valueDisplay, dayPnlDisplay: null,
      unrealDisplay: null, weightPct: null,
    })
  }

  const priced = rows.filter((r) => r.valueDisplay != null)
  const value = priced.reduce((s, r) => s + r.valueDisplay, 0)
  for (const r of priced) r.weightPct = value > 0 ? (r.valueDisplay / value) * 100 : null
  const dayRows = priced.filter((r) => r.dayPnlDisplay != null)
  const dayPnl = dayRows.length ? dayRows.reduce((s, r) => s + r.dayPnlDisplay, 0) : null
  const dayBase = dayPnl != null ? value - dayPnl : null
  const unrealRows = priced.filter((r) => r.unrealDisplay != null)
  return {
    rows,
    missing,
    total: {
      value: priced.length ? value : null,
      dayPnl,
      dayPct: dayBase ? (dayPnl / dayBase) * 100 : null,
      unrealPnl: unrealRows.length ? unrealRows.reduce((s, r) => s + r.unrealDisplay, 0) : null,
    },
  }
}
