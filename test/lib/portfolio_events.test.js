import { afterEach, describe, expect, it } from 'vitest'
import { upcomingEvents } from '../../src/pages/portfolioEvents.jsx'
import { setLocale } from '../../src/lib/i18n.js'

const holdings = [{ symbol: 'AAPL', shares: 10 }]
const ev = { AAPL: { payDate: '2026-10-20', exDate: '2026-10-15', dividends: [{ perShare: 0.25, ccy: 'USD' }] } }

afterEach(() => setLocale('en'))

describe('upcoming book events', () => {
  it('labels a future dividend payment as a pay date, not as paid', () => {
    setLocale('zh')
    const pay = upcomingEvents(holdings, ev, '2026-10-17').find((u) => u.d === '2026-10-20')
    expect(pay.what).toBe('派息日')
    expect(pay.what).not.toBe('已派')
  })

  it('leaves out dates that have already passed', () => {
    expect(upcomingEvents(holdings, ev, '2026-10-17').map((u) => u.d)).toEqual(['2026-10-20'])
  })
})
