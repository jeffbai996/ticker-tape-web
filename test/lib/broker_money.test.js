/** The IBKR page reads like the family portfolio page (Jeff 2026-10-09: "our
 *  IBKR portfolio doesn't even look as good as the stepdad ticker tape"):
 *  a currency mark before the figure instead of "CAD" after every number,
 *  and the Canadian-listed twin of a US holding is labelled, not a duplicate. */
import { describe, expect, it } from 'vitest'
import { brokerMoney, cdrRows } from '../../src/lib/brokerBook.js'

describe('brokerMoney', () => {
  it('prints the currency mark before the figure', () => {
    expect(brokerMoney(10199390, 'CAD')).toBe('C$10,199,390')
    expect(brokerMoney(332.55, 'USD', 2)).toBe('$332.55')
    expect(brokerMoney(1234, 'EUR')).toBe('EUR 1,234')
  })
  it('is a dash for an unknown currency or a missing value', () => {
    expect(brokerMoney(5, null)).toBe('—')
    expect(brokerMoney(null, 'CAD')).toBe('—')
  })
})

describe('cdrRows', () => {
  it('marks the non-USD line of a symbol that also trades in USD', () => {
    const rows = [
      { symbol: 'NVDA', currency: 'USD' }, { symbol: 'NVDA', currency: 'CAD' },
      { symbol: 'MU', currency: 'USD' }, { symbol: 'SHOP', currency: 'CAD' },
    ]
    const cdr = cdrRows(rows)
    expect(cdr.has(rows[1])).toBe(true)
    expect(cdr.has(rows[0])).toBe(false)
    expect(cdr.has(rows[3])).toBe(false)
  })
})
