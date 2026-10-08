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
const MAX_BODY_BYTES = 256_000          // raised 2026-08-22: marks + trades per book
const MAX_SNAPSHOTS = 400
const MAX_TXNS = 400
const MAX_CASH_TXNS = 400
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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

function validCash(c) {
  return plainObject(c) && exactKeys(c, new Set(['ccy', 'amount']))
    && CCYS.has(c.ccy) && typeof c.amount === 'number' && Number.isFinite(c.amount)
}

/** A daily value mark: {d, v, c}. */
function validSnapshot(x) {
  return plainObject(x) && exactKeys(x, new Set(['d', 'v', 'c']))
    && typeof x.d === 'string' && DATE_RE.test(x.d)
    && typeof x.v === 'number' && Number.isFinite(x.v) && x.v >= 0
    && CCYS.has(x.c)
}

/** A trade: {id, d, sym, side, qty, px, fee?, ccy?}. */
function validTxn(t) {
  if (!plainObject(t)) return false
  const allowed = new Set(['id', 'd', 'sym', 'side', 'qty', 'px', 'fee', 'ccy', 'affectsCash', 'opening'])
  if (!Object.keys(t).every((k) => allowed.has(k))) return false
  if (typeof t.id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(t.id)) return false
  if (typeof t.d !== 'string' || !DATE_RE.test(t.d)) return false
  if (typeof t.sym !== 'string' || !SYMBOL_RE.test(t.sym)) return false
  if (t.side !== 'buy' && t.side !== 'sell') return false
  if (typeof t.qty !== 'number' || !Number.isFinite(t.qty) || t.qty <= 0) return false
  if (typeof t.px !== 'number' || !Number.isFinite(t.px) || t.px < 0) return false
  if ('fee' in t && (typeof t.fee !== 'number' || !Number.isFinite(t.fee) || t.fee < 0)) return false
  if ('ccy' in t && !CCYS.has(t.ccy)) return false
  if ('affectsCash' in t && t.affectsCash !== true) return false
  if ('opening' in t && t.opening !== true) return false
  if (t.affectsCash === true && !CCYS.has(t.ccy)) return false
  if (t.affectsCash === true && t.opening === true) return false
  return true
}

/** A manual cash entry. Opening balances have no date; external activity and
 *  reconciliations do, so performance can remove those flows. */
function validCashTxn(entry) {
  if (!plainObject(entry)) return false
  const allowed = new Set(['id', 'd', 'kind', 'ccy', 'amount', 'note', 'bookAmount', 'bookCcy'])
  if (!Object.keys(entry).every((key) => allowed.has(key))) return false
  if (typeof entry.id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(entry.id)) return false
  if (!['opening', 'deposit', 'withdrawal', 'adjustment'].includes(entry.kind)) return false
  if (!CCYS.has(entry.ccy) || typeof entry.amount !== 'number' || !Number.isFinite(entry.amount)) return false
  if (entry.kind === 'deposit' && entry.amount <= 0) return false
  if (entry.kind === 'withdrawal' && entry.amount >= 0) return false
  if (entry.kind === 'adjustment' && entry.amount === 0) return false
  if (entry.kind === 'opening') {
    if ('d' in entry) return false
  } else if (typeof entry.d !== 'string' || !DATE_RE.test(entry.d)) return false
  if ('note' in entry && (typeof entry.note !== 'string' || !entry.note.trim() || entry.note.length > 120)) return false
  const hasBookAmount = 'bookAmount' in entry
  const hasBookCcy = 'bookCcy' in entry
  if (hasBookAmount !== hasBookCcy) return false
  if (hasBookAmount && (typeof entry.bookAmount !== 'number' || !Number.isFinite(entry.bookAmount) || !CCYS.has(entry.bookCcy))) return false
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
    // cash, snapshots and txns are optional per book; older clients omit them
    const keys = Object.keys(p)
    const known = new Set(['id', 'name', 'ccy', 'holdings', 'cash', 'cashTxns', 'snapshots', 'txns'])
    if (!plainObject(p)
        || !keys.every((k) => known.has(k)) || !['id', 'name', 'ccy', 'holdings'].every((k) => keys.includes(k))
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
    if ('cash' in p) {
      if (!Array.isArray(p.cash) || p.cash.length > CCYS.size || !p.cash.every(validCash)) return { ok: false, error: 'invalid cash' }
      if (new Set(p.cash.map((c) => c.ccy)).size !== p.cash.length) return { ok: false, error: 'invalid cash' }
    }
    if ('snapshots' in p) {
      if (!Array.isArray(p.snapshots) || p.snapshots.length > MAX_SNAPSHOTS || !p.snapshots.every(validSnapshot)) return { ok: false, error: 'invalid snapshots' }
    }
    if ('txns' in p) {
      if (!Array.isArray(p.txns) || p.txns.length > MAX_TXNS || !p.txns.every(validTxn)) return { ok: false, error: 'invalid txns' }
    }
    if ('cashTxns' in p) {
      if (!Array.isArray(p.cashTxns) || p.cashTxns.length > MAX_CASH_TXNS || !p.cashTxns.every(validCashTxn)) return { ok: false, error: 'invalid cash txns' }
      if (new Set(p.cashTxns.map((entry) => entry.id)).size !== p.cashTxns.length) return { ok: false, error: 'invalid cash txns' }
    }
    ids.add(p.id)
  }
  if (!validClock(value.touched) || !validClock(value.deleted)) {
    return { ok: false, error: 'invalid sync metadata' }
  }
  return { ok: true }
}

export const handlePortfolios = makeCapDocHandler({
  route: '/portfolios',
  keyPrefix: 'myportfolios:',
  validate: validatePortfolioDocument,
  maxBody: MAX_BODY_BYTES,
})
