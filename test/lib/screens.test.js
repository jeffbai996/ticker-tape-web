// Saved screens + fundamental filter bands for the screening page.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadScreens, saveScreen, deleteScreen, passesScreenFilters,
} from '../../src/lib/screens.js'

beforeEach(() => localStorage.clear())

describe('saved screens', () => {
  it('saves, lists, and upserts by name', () => {
    saveScreen('semis', 'NVDA AMD TSM')
    saveScreen('mega', 'AAPL MSFT')
    saveScreen('semis', 'NVDA AMD TSM MU')
    expect(loadScreens()).toEqual([
      { name: 'semis', symbols: 'NVDA AMD TSM MU' },
      { name: 'mega', symbols: 'AAPL MSFT' },
    ])
  })
  it('deletes by name and ignores blanks', () => {
    saveScreen('semis', 'NVDA')
    saveScreen('', 'X')
    saveScreen('empty', '  ')
    deleteScreen('semis')
    expect(loadScreens()).toEqual([])
  })
})

describe('passesScreenFilters', () => {
  const fund = { forwardPE: 24, revenueGrowth: 0.31, profitMargins: 0.28 }
  it('passes when inside every active band', () => {
    expect(passesScreenFilters(fund, { peMax: 30, growthMin: 20, marginMin: 20 })).toBe(true)
  })
  it('fails when any band is violated', () => {
    expect(passesScreenFilters(fund, { peMax: 20 })).toBe(false)
    expect(passesScreenFilters(fund, { growthMin: 40 })).toBe(false)
    expect(passesScreenFilters(fund, { marginMin: 35 })).toBe(false)
  })
  it('no active bands means everything passes; missing data is null', () => {
    expect(passesScreenFilters(fund, {})).toBe(true)
    expect(passesScreenFilters({}, { peMax: 30 })).toBe(null)
    expect(passesScreenFilters(null, { peMax: 30 })).toBe(null)
  })
})
