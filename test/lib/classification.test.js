import { describe, expect, it, vi } from 'vitest'
import { categoryFromProfile, resolveClassification } from '../../src/lib/classification.js'
import { groupDashboardRows } from '../../src/lib/dashboardRows.js'

describe('metadata classification', () => {
  it('distinguishes semiconductor businesses from other technology', () => {
    expect(categoryFromProfile({ sector: 'Technology', industry: 'Semiconductors' })).toBe('Semis')
    expect(categoryFromProfile({ sector: 'Technology', industry: 'Software - Application' })).toBe('Software & AI')
    expect(categoryFromProfile({ industry: '半导体设备' })).toBe('Semis')
  })
  it('maps financial and industrial sectors and keeps unknown metadata unclassified', () => {
    expect(categoryFromProfile({ sector: 'Financial Services' })).toBe('Financials')
    expect(categoryFromProfile({ sector: 'Industrials' })).toBe('Energy & Industrials')
    expect(categoryFromProfile({ industry: '银行' })).toBe('Financials')
    expect(categoryFromProfile(null)).toBeNull()
    expect(categoryFromProfile({ sector: 'unknown' })).toBeNull()
  })
  it('uses Chinese industry metadata when the profile is missing', async () => {
    const profile = vi.fn().mockResolvedValue(null)
    const industry = vi.fn().mockResolvedValue('半导体')
    expect(await resolveClassification('123456.SZ', { profile, industry })).toBe('Semis')
    expect(industry).toHaveBeenCalledWith('123456.SZ')
  })
  it('survives provider errors without inventing a category', async () => {
    const profile = vi.fn().mockRejectedValue(new Error('offline'))
    const industry = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await resolveClassification('ZZZZ', { profile, industry })).toBeNull()
    expect(await resolveClassification('123456.SZ', { profile, industry })).toBeNull()
    expect(industry).toHaveBeenCalledTimes(1)
  })
  it('uses discovered categories after explicit groups and built-in classifications', () => {
    expect(groupDashboardRows(['ZZZZ', 'YYYY', 'AAPL', 'XXXX'], { Custom: ['YYYY'] }, {
      ZZZZ: 'Financials', YYYY: 'Semis', AAPL: 'Semis',
    })).toEqual([
      { name: 'Custom', symbols: ['YYYY'] },
      { name: 'Megacaps', symbols: ['AAPL'] },
      { name: 'Financials', symbols: ['ZZZZ'] },
      { name: 'General', symbols: ['XXXX'] },
    ])
  })
})
