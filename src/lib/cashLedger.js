/** Cash activity for hand-built portfolios.
 *
 *  Existing books began with one editable balance per currency. Those become
 *  opening entries; deposits, withdrawals and reconciliations append to that
 *  baseline. Newly recorded trades carry `affectsCash` and are replayed into
 *  the same balance. Historical trades omit the flag, so upgrading never
 *  charges today's cash for yesterday's book.
 */

import { PORTFOLIO_CCYS } from './fx.js'

export const MAX_CASH_TXNS = 400
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ID_RE = /^[A-Za-z0-9_-]{1,24}$/
const KINDS = new Set(['opening', 'deposit', 'withdrawal', 'adjustment'])

export const roundCash = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100

function cleanNote(value) {
  const note = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120)
  return note || null
}

/** Sanitize one persisted manual cash entry. Trade cash is derived from the
 *  trade itself, so there is no duplicate leg to drift out of sync. */
export function cleanCashTxn(raw) {
  const id = String(raw?.id || '')
  const kind = String(raw?.kind || '')
  const ccy = String(raw?.ccy || '').toUpperCase()
  const amount = Number(raw?.amount)
  if (!ID_RE.test(id) || !KINDS.has(kind) || !PORTFOLIO_CCYS.includes(ccy)) return null
  if (!Number.isFinite(amount)) return null
  const roundedAmount = roundCash(amount)
  if (kind === 'deposit' && !(roundedAmount > 0)) return null
  if (kind === 'withdrawal' && !(roundedAmount < 0)) return null
  if (kind === 'adjustment' && roundedAmount === 0) return null
  if (kind !== 'opening' && !DATE_RE.test(String(raw?.d || ''))) return null

  const out = { id, ...(kind === 'opening' ? {} : { d: String(raw.d) }), kind, ccy, amount: roundedAmount }
  const note = cleanNote(raw?.note)
  if (note) out.note = note
  const bookAmount = Number(raw?.bookAmount)
  const bookCcy = String(raw?.bookCcy || '').toUpperCase()
  if (Number.isFinite(bookAmount) && PORTFOLIO_CCYS.includes(bookCcy)) {
    out.bookAmount = roundCash(bookAmount)
    out.bookCcy = bookCcy
  }
  return out
}

export function cleanCashTxns(raw) {
  const seen = new Set()
  return (Array.isArray(raw) ? raw : []).map(cleanCashTxn)
    .filter((entry) => entry && !seen.has(entry.id) && seen.add(entry.id))
    .slice(-MAX_CASH_TXNS)
}

/** Old absolute balances become deterministic opening entries. No date means
 *  they establish the baseline and can never be mistaken for a contribution. */
export function legacyCashTxns(cash) {
  return (cash || []).map((row) => ({
    id: `clegacy-${row.ccy}`, kind: 'opening', ccy: row.ccy, amount: roundCash(row.amount),
  }))
}

/** Signed cash effect of a newly linked trade. */
export function tradeCashDelta(txn) {
  if (txn?.affectsCash !== true || !PORTFOLIO_CCYS.includes(txn?.ccy)) return null
  const qty = Number(txn.qty)
  const px = Number(txn.px)
  if (!(qty > 0) || !(px >= 0)) return null
  const fee = Number(txn.fee) > 0 ? Number(txn.fee) : 0
  return roundCash(txn.side === 'sell' ? qty * px - fee : -(qty * px + fee))
}

/** Manual entries plus linked trades -> one current row per currency. */
export function cashBalances(cashTxns, txns) {
  const totals = new Map()
  const add = (ccy, amount) => {
    if (!totals.has(ccy)) totals.set(ccy, 0)
    totals.set(ccy, roundCash(totals.get(ccy) + amount))
  }
  for (const entry of cashTxns || []) add(entry.ccy, entry.amount)
  for (const txn of txns || []) {
    const delta = tradeCashDelta(txn)
    if (delta != null) add(txn.ccy, delta)
  }
  return [...totals].map(([ccy, amount]) => ({ ccy, amount }))
}

export function cashBalanceFor(portfolio, ccy) {
  return cashBalances(portfolio?.cashTxns || [], portfolio?.txns || [])
    .find((row) => row.ccy === ccy)?.amount ?? 0
}

/** One chronological journal. Trade legs are projections, not stored copies. */
export function cashJournal(portfolio) {
  const manual = (portfolio?.cashTxns || []).map((entry, order) => ({ ...entry, order }))
  const offset = manual.length
  const trades = (portfolio?.txns || []).flatMap((txn, order) => {
    const amount = tradeCashDelta(txn)
    return amount == null ? [] : [{
      id: `trade-${txn.id}`, d: txn.d, kind: 'trade', ccy: txn.ccy, amount,
      tradeId: txn.id, sym: txn.sym, side: txn.side, order: offset + order,
    }]
  })
  return [...manual, ...trades].sort((a, b) => {
    const ad = a.d || ''
    const bd = b.d || ''
    return ad < bd ? -1 : ad > bd ? 1 : a.order - b.order
  }).map(({ order, ...entry }) => entry)
}

/** External contributions in the book's display currency, grouped by date.
 *  Trade settlement and opening balances are intentionally absent. */
export function externalCashFlows(cashTxns, bookCcy) {
  const flows = new Map()
  for (const entry of cashTxns || []) {
    if (!['deposit', 'withdrawal', 'adjustment'].includes(entry.kind) || !entry.d) continue
    const amount = entry.bookCcy === bookCcy && Number.isFinite(entry.bookAmount)
      ? entry.bookAmount
      : entry.ccy === bookCcy ? entry.amount : null
    if (amount == null) continue
    flows.set(entry.d, roundCash((flows.get(entry.d) || 0) + amount))
  }
  return flows
}
