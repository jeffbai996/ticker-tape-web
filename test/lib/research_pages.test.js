import { describe, it, expect } from 'vitest'
import { parseProfile, parseHolders } from '../../src/lib/fundamentals.js'
import { parseSecFilings } from '../../src/lib/edgar.js'

describe('parseProfile', () => {
  it('extracts the profile shape', () => {
    const p = parseProfile({ assetProfile: {
      sector: 'Technology', industry: 'Semiconductors',
      fullTimeEmployees: 51000, city: 'Santa Clara', state: 'CA',
      country: 'United States', website: 'https://x.com',
      longBusinessSummary: 'Makes chips.',
      companyOfficers: [
        { name: 'A. Boss', title: 'CEO', totalPay: { raw: 5e6 } },
        { maxAge: 1 },
      ],
    } })
    expect(p.sector).toBe('Technology')
    expect(p.employees).toBe(51000)
    expect(p.officers).toHaveLength(1)
    expect(p.officers[0].pay).toBe(5e6)
  })
  it('null when module missing', () => {
    expect(parseProfile({})).toBeNull()
  })
})

describe('parseHolders', () => {
  it('breakdown + top holders', () => {
    const h = parseHolders({
      majorHoldersBreakdown: {
        insidersPercentHeld: { raw: 0.001 },
        institutionsPercentHeld: { raw: 0.78 },
        institutionsCount: { raw: 3400 },
      },
      institutionOwnership: { ownershipList: [
        { organization: 'Vanguard', pctHeld: { raw: 0.09 },
          position: { raw: 1e8 }, value: { raw: 2e10 },
          reportDate: { raw: 1750000000 } },
      ] },
    })
    expect(h.institutionsPct).toBeCloseTo(0.78)
    expect(h.top[0].org).toBe('Vanguard')
    expect(h.top[0].reportDate).toBe(1750000000000)
  })
})

describe('sec filings (yahoo mirror)', () => {
  const mod = { secFilings: { filings: [
    { date: '2026-07-30', epochDate: 1785000000, type: '10-Q',
      title: 'Quarterly Report', edgarUrl: 'https://finance.yahoo.com/sec-filing/x/1',
      exhibits: [{ type: 'EX-99.1', url: 'https://cdn.yahoo/ex991.htm' }, { type: 'bad' }] },
    { epochDate: 1751328000, type: '8-K', title: 'Current Report' },
    { type: null, date: '2026-01-01' },
  ] } }
  it('normalizes rows, drops untyped, keeps exhibit links', () => {
    const rows = parseSecFilings(mod)
    expect(rows).toHaveLength(2)
    expect(rows[0].form).toBe('10-Q')
    expect(rows[0].date).toBe('2026-07-30')
    expect(rows[0].exhibits).toHaveLength(1)
    expect(rows[1].date).toBe(new Date(1751328000 * 1000).toISOString().slice(0, 10))
  })
  it('empty module → empty list', () => {
    expect(parseSecFilings({})).toEqual([])
  })
})
