import { beforeEach, describe, expect, it } from 'vitest'
import {
  getGroupPrefs, isCollapsed, moveGroup, orderGroups, toggleCollapsed,
} from '../src/lib/catgroups.js'

const NAMES = ['Megacaps', 'Semis & AI', 'Financials']
const groups = (names = NAMES) => names.map((name) => ({ name, symbols: [] }))

beforeEach(() => localStorage.clear())

describe('orderGroups', () => {
  it('leaves the natural order alone when nothing is saved', () => {
    expect(orderGroups(groups(), []).map((g) => g.name)).toEqual(NAMES)
  })

  it('sorts by the saved order', () => {
    const order = ['Financials', 'Megacaps', 'Semis & AI']
    expect(orderGroups(groups(), order).map((g) => g.name)).toEqual(order)
  })

  it('keeps groups the saved order never heard of, at the end', () => {
    const withNew = groups([...NAMES, 'Crypto'])
    const out = orderGroups(withNew, ['Semis & AI', 'Megacaps', 'Financials'])
    expect(out.map((g) => g.name)).toEqual(['Semis & AI', 'Megacaps', 'Financials', 'Crypto'])
  })

  it('ignores saved names that no longer exist', () => {
    const out = orderGroups(groups(['Megacaps']), ['Retired Bucket', 'Megacaps'])
    expect(out.map((g) => g.name)).toEqual(['Megacaps'])
  })
})

describe('collapse', () => {
  it('round-trips a collapsed group', () => {
    expect(isCollapsed('Megacaps')).toBe(false)
    toggleCollapsed('Megacaps')
    expect(isCollapsed('Megacaps')).toBe(true)
    toggleCollapsed('Megacaps')
    expect(isCollapsed('Megacaps')).toBe(false)
  })

  it('collapses groups independently', () => {
    toggleCollapsed('Megacaps')
    toggleCollapsed('Financials')
    expect(getGroupPrefs().collapsed).toEqual(['Megacaps', 'Financials'])
    toggleCollapsed('Megacaps')
    expect(getGroupPrefs().collapsed).toEqual(['Financials'])
  })
})

describe('moveGroup', () => {
  it('seeds the order from what is on screen, then swaps', () => {
    moveGroup('Semis & AI', -1, NAMES)
    expect(getGroupPrefs().order).toEqual(['Semis & AI', 'Megacaps', 'Financials'])
  })

  it('moves down', () => {
    moveGroup('Megacaps', 1, NAMES)
    expect(getGroupPrefs().order).toEqual(['Semis & AI', 'Megacaps', 'Financials'])
  })

  it('clamps at both edges instead of wrapping', () => {
    moveGroup('Megacaps', -1, NAMES)
    expect(getGroupPrefs().order).toEqual([])
    moveGroup('Financials', 1, NAMES)
    expect(getGroupPrefs().order).toEqual([])
  })

  it('absorbs a newly-added group into an existing saved order', () => {
    moveGroup('Financials', -1, NAMES)               // saves an order of 3
    moveGroup('Crypto', -1, [...NAMES, 'Crypto'])    // 4th appears later
    expect(getGroupPrefs().order).toContain('Crypto')
    expect(getGroupPrefs().order).toHaveLength(4)
  })
})
