/** The IBKR page shows the same analysis cards as the family portfolio page
 *  (Jeff 2026-10-09: "its still missing half this shit"). The broker's own
 *  base-currency figures feed them; nothing is re-priced or re-converted. */
import { beforeEach, describe, expect, it } from 'vitest'
import { brokerCardRows } from '../../src/lib/brokerBook.js'
import { brokerSnapshots, recordBrokerSnapshot } from '../../src/lib/brokerSnapshots.js'

describe('brokerCardRows', () => {
  const rows = [
    { symbol: 'MU', currency: 'USD', shares: 7714, avgCost: 332.55, price: 1059.07, dayPct: 2.26,
      mktValue: 11620124, dayPnl: 256274, unrealPnl: 7971369, weight: 44.8 },
    { symbol: 'NVDA', currency: 'CAD', shares: 15000, avgCost: 31.31, price: 51.4, dayPct: 1.88,
      mktValue: 771062, dayPnl: 14219, unrealPnl: 301354, weight: 3.0 },
  ]
  it('carries the broker figures into the card row shape untouched', () => {
    const [mu] = brokerCardRows(rows)
    expect(mu).toMatchObject({ kind: 'equity', symbol: 'MU', ccy: 'USD', shares: 7714, cost: 332.55,
      price: 1059.07, dayPct: 2.26, valueDisplay: 11620124, dayPnlDisplay: 256274,
      unrealDisplay: 7971369, weightPct: 44.8 })
  })
  it('keeps a CDR line as its own row in its own currency', () => {
    expect(brokerCardRows(rows)[1]).toMatchObject({ symbol: 'NVDA', ccy: 'CAD', valueDisplay: 771062 })
  })
  it('leaves a missing broker figure missing rather than zero', () => {
    const [r] = brokerCardRows([{ symbol: 'X', currency: 'USD', mktValue: null, dayPnl: null }])
    expect(r.valueDisplay).toBeNull()
    expect(r.dayPnlDisplay).toBeNull()
  })
})

describe('broker NLV marks', () => {
  beforeEach(() => localStorage.clear())
  it('keeps one mark a day per account, latest reading wins', () => {
    recordBrokerSnapshot('U1', 100, 'CAD', '2026-10-08')
    recordBrokerSnapshot('U1', 110, 'CAD', '2026-10-09')
    recordBrokerSnapshot('U1', 120, 'CAD', '2026-10-09')
    expect(brokerSnapshots('U1')).toEqual([{ d: '2026-10-08', v: 100, c: 'CAD' }, { d: '2026-10-09', v: 120, c: 'CAD' }])
    expect(brokerSnapshots('U2')).toEqual([])
  })
  it('ignores a value that is not a real balance', () => {
    recordBrokerSnapshot('U1', NaN, 'CAD', '2026-10-09')
    recordBrokerSnapshot('U1', 5, null, '2026-10-09')
    expect(brokerSnapshots('U1')).toEqual([])
  })
})
