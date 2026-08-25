import { describe, it, expect } from 'vitest'
import {
  FAMILY_KEYS, PURGE_MARKER, alreadyPurged, purgeFamilyResidue, residueKeys,
} from '../../src/lib/familyResidue.js'

function fakeStore(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _keys: () => [...map.keys()],
  }
}

describe('family residue purge', () => {
  it('clears the orphaned family book the public origin used to serve', () => {
    const store = fakeStore({
      my_portfolios_v1: '[{"name":"Gordon"}]',
      my_portfolios_sync_meta_v1: '{"rev":1018}',
      unrelated_pref: 'keep me',
    })
    const cleared = purgeFamilyResidue(store)
    expect(cleared.sort()).toEqual(['my_portfolios_sync_meta_v1', 'my_portfolios_v1'])
    expect(store.getItem('my_portfolios_v1')).toBe(null)
    expect(store.getItem('unrelated_pref')).toBe('keep me')
  })

  it('runs once — a book the visitor makes afterwards survives every later load', () => {
    const store = fakeStore({ my_portfolios_v1: 'the family book' })
    purgeFamilyResidue(store)
    store.setItem('my_portfolios_v1', 'the visitor\'s own book')
    purgeFamilyResidue(store)
    purgeFamilyResidue(store)
    expect(store.getItem('my_portfolios_v1')).toBe('the visitor\'s own book')
  })

  it('marks a store that held no residue, so a clean visitor is never re-scanned', () => {
    const store = fakeStore()
    expect(purgeFamilyResidue(store)).toEqual([])
    expect(alreadyPurged(store)).toBe(true)
    expect(store.getItem(PURGE_MARKER)).toBe('1')
  })

  it('survives a store that throws on every access (Safari private mode)', () => {
    const hostile = {
      getItem() { throw new Error('SecurityError') },
      setItem() { throw new Error('SecurityError') },
      removeItem() { throw new Error('SecurityError') },
    }
    expect(() => purgeFamilyResidue(hostile)).not.toThrow()
    expect(residueKeys(hostile)).toEqual([])
  })

  it('has no store at all on a server render', () => {
    expect(purgeFamilyResidue(undefined)).toEqual([])
    expect(residueKeys(null)).toEqual([])
  })

  it('names every key the portfolio book writes', () => {
    // if a new key joins the book, it must join the purge or it keeps leaking
    expect(FAMILY_KEYS).toContain('my_portfolios_v1')
    expect(FAMILY_KEYS).toContain('my_portfolios_trash_v1')
    expect(FAMILY_KEYS).toContain('my_portfolios_sync_meta_v1')
  })
})
