/** Trades → positions, FIFO. Money here is the reason the page exists. */
import { describe, expect, it } from 'vitest'
import { applyLedger, positionsFromTxns } from '../../src/lib/lots.js'

const t = (d, side, qty, px, fee = 0, sym = '0700.HK') => ({ id: `${d}-${side}-${qty}`, d, sym, side, qty, px, fee, ccy: 'HKD' })

describe('positionsFromTxns', () => {
  it('averages buys with fees in the cost, sells FIFO and books realized P&L', () => {
    const pos = positionsFromTxns([
      t('2026-01-10', 'buy', 100, 400, 10),   // lot A: 40,010
      t('2026-02-10', 'buy', 100, 500, 10),   // lot B: 50,010
      t('2026-03-10', 'sell', 150, 600, 15),  // closes A (100) + half B (50)
    ])
    const p = pos['0700.HK']
    expect(p.qty).toBe(50)
    // remaining: half of lot B = 25,005 → avg 500.10
    expect(p.costBasis).toBeCloseTo(25005, 2)
    expect(p.avgCost).toBeCloseTo(500.1, 4)
    // proceeds 90,000 − 15 fee − basis (40,010 + 25,005) = 24,970
    expect(p.realized).toBeCloseTo(24970, 2)
    expect(p.fees).toBe(35)
    expect(p.buys).toBe(2); expect(p.sells).toBe(1)
    expect(p.firstDate).toBe('2026-01-10'); expect(p.lastDate).toBe('2026-03-10')
  })

  it('orders by date, not by the order typed', () => {
    const pos = positionsFromTxns([t('2026-03-01', 'sell', 10, 20), t('2026-01-01', 'buy', 10, 10)])
    expect(pos['0700.HK'].qty).toBe(0)
    expect(pos['0700.HK'].realized).toBe(100)
    expect(pos['0700.HK'].oversold).toBeUndefined()
  })

  it('flags a sell the ledger cannot cover instead of inventing a negative lot', () => {
    const pos = positionsFromTxns([t('2026-01-01', 'buy', 10, 10), t('2026-02-01', 'sell', 15, 12)])
    expect(pos['0700.HK'].qty).toBe(0)
    expect(pos['0700.HK'].oversold).toBe(5)
  })

  it('skips rows with no date or no quantity', () => {
    expect(positionsFromTxns([{ id: 'x', d: '', sym: 'AAPL', side: 'buy', qty: 1, px: 1 }, { id: 'y', d: '2026-01-01', sym: 'AAPL', side: 'buy', qty: 0, px: 1 }])).toEqual({})
  })
})

describe('applyLedger', () => {
  it('replaces hand rows for traded symbols, keeps the rest, drops closed positions', () => {
    const holdings = [{ symbol: '0700.HK', shares: 999, cost: 1 }, { symbol: 'AAPL', shares: 10, cost: 100 }]
    const txns = [t('2026-01-01', 'buy', 100, 400), t('2026-01-02', 'buy', 10, 150, 0, 'MSFT'), t('2026-01-03', 'sell', 10, 160, 0, 'MSFT')]
    const out = applyLedger(holdings, txns)
    expect(out).toEqual([{ symbol: 'AAPL', shares: 10, cost: 100 }, { symbol: '0700.HK', shares: 100, cost: 400 }])
  })
})
