import { beforeEach, describe, expect, it } from 'vitest'
import {
  addCashTxn, addTxn, createPortfolio, loadPortfolios, reconcileCash,
  removeCash, removeCashTxn, removeTxn, replacePortfolios, setCash, setHolding,
} from '../../src/lib/myPortfolios.js'

beforeEach(() => localStorage.clear())

const book = (id) => loadPortfolios().find((p) => p.id === id)
const balance = (id, ccy) => book(id).cash.find((c) => c.ccy === ccy)?.amount ?? null

describe('trade settlement against cash', () => {
  it('deducts buys, credits sells and includes fees', () => {
    const p = createPortfolio('Core', 'USD')
    setCash(p.id, 'USD', 10_000)

    const buy = addTxn(p.id, {
      d: '2026-08-23', sym: 'AAPL', side: 'buy', qty: 10, px: 200, fee: 5, ccy: 'USD',
    })
    expect(buy).toMatchObject({ affectsCash: true, ccy: 'USD' })
    expect(balance(p.id, 'USD')).toBe(7_995)

    addTxn(p.id, {
      d: '2026-08-24', sym: 'AAPL', side: 'sell', qty: 4, px: 220, fee: 3, ccy: 'USD',
    })
    expect(balance(p.id, 'USD')).toBe(8_872)
  })

  it('reverses exactly the linked cash effect when a trade is removed', () => {
    const p = createPortfolio('Core', 'USD')
    setCash(p.id, 'USD', 5_000)
    const trade = addTxn(p.id, {
      d: '2026-08-23', sym: 'MSFT', side: 'buy', qty: 5, px: 400, fee: 2, ccy: 'USD',
    })
    expect(balance(p.id, 'USD')).toBe(2_998)
    removeTxn(p.id, trade.id)
    expect(balance(p.id, 'USD')).toBe(5_000)
  })

  it('does not charge cash for a synthetic opening position', () => {
    const p = createPortfolio('Core', 'USD')
    setHolding(p.id, 'AAPL', 10, 100)
    setCash(p.id, 'USD', 5_000)
    addTxn(p.id, { d: '2026-08-24', sym: 'AAPL', side: 'buy', qty: 2, px: 120, ccy: 'USD' })

    const current = book(p.id)
    expect(current.txns).toHaveLength(2)
    expect(current.txns[0]).toMatchObject({ opening: true })
    expect(current.txns[0].affectsCash).toBeUndefined()
    expect(balance(p.id, 'USD')).toBe(4_760)
  })

  it('creates a same-currency cash balance when a trade has no account yet', () => {
    const p = createPortfolio('Core', 'USD')
    addTxn(p.id, { d: '2026-08-24', sym: 'AAPL', side: 'buy', qty: 2, px: 120, ccy: 'USD' })
    expect(balance(p.id, 'USD')).toBe(-240)
  })
})

describe('manual cash activity', () => {
  it('treats a directly restated balance as money in or money out', () => {
    const p = createPortfolio('Core', 'USD')
    setCash(p.id, 'USD', 1_000)
    setCash(p.id, 'USD', 800)
    expect(book(p.id).cashTxns.at(-1)).toMatchObject({ kind: 'withdrawal', amount: -200 })
    setCash(p.id, 'USD', 1_100)
    expect(book(p.id).cashTxns.at(-1)).toMatchObject({ kind: 'deposit', amount: 300 })
  })

  it('does not create cloud-invalid zero-value activity for sub-cent edits', () => {
    const p = createPortfolio('Core', 'USD')
    setCash(p.id, 'USD', 1_000)

    setCash(p.id, 'USD', 1_000.001)
    expect(balance(p.id, 'USD')).toBe(1_000)
    expect(book(p.id).cashTxns).toHaveLength(1)
    expect(addCashTxn(p.id, {
      d: '2026-08-23', ccy: 'USD', kind: 'deposit', amount: 0.001,
    })).toBeNull()
  })

  it('records deposits, withdrawals and reconciliation as a running ledger', () => {
    const p = createPortfolio('Core', 'USD')
    setCash(p.id, 'USD', 1_000)
    const deposit = addCashTxn(p.id, {
      d: '2026-08-23', ccy: 'USD', kind: 'deposit', amount: 500, note: '  transfer in  ',
    })
    const withdrawal = addCashTxn(p.id, {
      d: '2026-08-24', ccy: 'USD', kind: 'withdrawal', amount: 125,
    })
    expect(deposit).toMatchObject({ kind: 'deposit', amount: 500, note: 'transfer in' })
    expect(withdrawal).toMatchObject({ kind: 'withdrawal', amount: -125 })
    expect(balance(p.id, 'USD')).toBe(1_375)

    const adjustment = reconcileCash(p.id, 'USD', 1_400, {
      d: '2026-08-24', note: 'statement balance', bookAmount: 25, bookCcy: 'USD',
    })
    expect(adjustment).toMatchObject({ kind: 'deposit', amount: 25 })
    expect(balance(p.id, 'USD')).toBe(1_400)

    removeCashTxn(p.id, withdrawal.id)
    expect(balance(p.id, 'USD')).toBe(1_525)
  })

  it('refuses malformed activity rather than corrupting cash', () => {
    const p = createPortfolio('Core', 'USD')
    expect(addCashTxn(p.id, { d: 'bad', ccy: 'USD', kind: 'deposit', amount: 10 })).toBeNull()
    expect(addCashTxn(p.id, { d: '2026-08-23', ccy: 'GBP', kind: 'deposit', amount: 10 })).toBeNull()
    expect(addCashTxn(p.id, { d: '2026-08-23', ccy: 'USD', kind: 'withdrawal', amount: 0 })).toBeNull()
    expect(book(p.id).cash).toEqual([])
  })

  it('does not erase an account that has journal activity', () => {
    const p = createPortfolio('Core', 'USD')
    setCash(p.id, 'USD', 1_000)
    addCashTxn(p.id, { d: '2026-08-23', ccy: 'USD', kind: 'deposit', amount: 50 })

    expect(removeCash(p.id, 'USD')).toBe(false)
    expect(balance(p.id, 'USD')).toBe(1_050)
    expect(book(p.id).cashTxns).toHaveLength(2)
  })
})

describe('legacy cash migration', () => {
  it('preserves the exact current balance and does not replay historical trades', () => {
    localStorage.setItem('my_portfolios_v1', JSON.stringify([{
      id: 'p1', name: 'Legacy', ccy: 'USD', holdings: [{ symbol: 'AAPL', shares: 10, cost: 100 }],
      cash: [{ ccy: 'USD', amount: 12_345.67 }],
      txns: [{ id: 'old1', d: '2026-08-20', sym: 'AAPL', side: 'buy', qty: 10, px: 100, ccy: 'USD' }],
    }]))
    const migrated = loadPortfolios()[0]
    expect(migrated.cash).toEqual([{ ccy: 'USD', amount: 12_345.67 }])
    expect(migrated.cashTxns).toEqual([
      { id: 'clegacy-USD', kind: 'opening', ccy: 'USD', amount: 12_345.67 },
    ])
    expect(migrated.txns[0].affectsCash).toBeUndefined()
  })

  it('sanitizes persisted cash activity and derives cash rather than trusting its cache', () => {
    replacePortfolios([{
      id: 'p1', name: 'Book', ccy: 'USD', holdings: [], cash: [{ ccy: 'USD', amount: 999 }],
      snapshots: [], txns: [], cashTxns: [
        { id: 'c1', kind: 'opening', ccy: 'USD', amount: 100 },
        { id: 'c2', d: '2026-08-23', kind: 'deposit', ccy: 'USD', amount: 50, note: ' ok ' },
        { id: 'c3', d: 'nope', kind: 'withdrawal', ccy: 'USD', amount: -5 },
      ],
    }])
    expect(loadPortfolios()[0]).toMatchObject({
      cash: [{ ccy: 'USD', amount: 150 }],
      cashTxns: [
        { id: 'c1', kind: 'opening', ccy: 'USD', amount: 100 },
        { id: 'c2', d: '2026-08-23', kind: 'deposit', ccy: 'USD', amount: 50, note: 'ok' },
      ],
    })
  })
})
