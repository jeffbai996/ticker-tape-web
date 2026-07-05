import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadCatalysts, addCatalyst, removeCatalyst, mergedEvents, CATALYST_TYPES,
} from '../../src/lib/catalysts.js'

beforeEach(() => localStorage.clear())

describe('catalyst store', () => {
  it('adds with defaults and persists', () => {
    const c = addCatalyst({ date: '2026-09-09', symbol: 'nvda', type: 'product', label: 'GTC keynote' })
    expect(c).toMatchObject({ id: 1, symbol: 'NVDA', type: 'product', label: 'GTC keynote' })
    expect(loadCatalysts()).toHaveLength(1)

    const macro = addCatalyst({ date: '2026-08-01', label: 'tariff decision' })
    expect(macro.symbol).toBe('MACRO')
    expect(macro.type).toBe('other')
    expect(macro.id).toBe(2)
  })

  it('validates date, label, type, and symbol', () => {
    expect(() => addCatalyst({ date: '9/9/26', label: 'x' })).toThrow(/YYYY-MM-DD/)
    expect(() => addCatalyst({ date: '2026-13-45', label: 'x' })).toThrow(/YYYY-MM-DD/)
    expect(() => addCatalyst({ date: '2026-09-09', label: '  ' })).toThrow(/label/)
    expect(() => addCatalyst({ date: '2026-09-09', label: 'x', type: 'meme' })).toThrow(/type/)
    expect(() => addCatalyst({ date: '2026-09-09', label: 'x', symbol: 'not a symbol' })).toThrow(/symbol/)
  })

  it('removes by id', () => {
    const c = addCatalyst({ date: '2026-09-09', label: 'x' })
    expect(removeCatalyst(c.id)).toBe(true)
    expect(removeCatalyst(c.id)).toBe(false)
    expect(loadCatalysts()).toHaveLength(0)
  })

  it('exposes the type vocabulary', () => {
    expect(CATALYST_TYPES).toContain('product')
    expect(CATALYST_TYPES).toContain('policy')
  })
})

describe('mergedEvents', () => {
  const econ = [
    { date: '2026-07-14', type: 'CPI', label: 'CPI Release' },
    { date: '2026-07-29', type: 'FOMC', label: 'FOMC Rate Decision' },
    { date: '2026-01-01', type: 'CPI', label: 'past event' },
  ]
  const cats = [
    { id: 1, date: '2026-07-20', symbol: 'NVDA', type: 'product', label: 'GTC keynote' },
    { id: 2, date: '2026-07-05', symbol: 'MACRO', type: 'policy', label: 'tariffs' },
    { id: 3, date: '2027-01-01', symbol: 'AMD', type: 'conf', label: 'too far' },
  ]

  it('merges, filters to horizon, sorts by days', () => {
    const out = mergedEvents(econ, cats, '2026-07-04', 60)
    expect(out.map((e) => e.date)).toEqual(['2026-07-05', '2026-07-14', '2026-07-20', '2026-07-29'])
    expect(out[0].days).toBe(1)
  })

  it('marks user rows and prefixes symbol into the label', () => {
    const out = mergedEvents(econ, cats, '2026-07-04', 60)
    const gtc = out.find((e) => e.id === 1)
    expect(gtc.user).toBe(true)
    expect(gtc.type).toBe('PRODUCT')
    expect(gtc.label).toBe('NVDA — GTC keynote')
    const macro = out.find((e) => e.id === 2)
    expect(macro.label).toBe('tariffs')
    expect(out.find((e) => e.type === 'CPI').user).toBeUndefined()
  })
})
