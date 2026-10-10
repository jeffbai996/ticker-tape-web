import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SYMBOLS, addSymbol, loadSymbols, normalizeSymbol, removeSymbol, saveSymbols,
} from '../../tv/lib/watchlist.js'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
    data,
  }
}

describe('TV watchlist', () => {
  it('normalizes typed symbols to upper case without spaces', () => {
    expect(normalizeSymbol('  brk-b ')).toBe('BRK-B')
    expect(normalizeSymbol('^gspc')).toBe('^GSPC')
    expect(normalizeSymbol('es=f')).toBe('ES=F')
  })

  it('rejects input that cannot be a Yahoo symbol', () => {
    expect(normalizeSymbol('')).toBeNull()
    expect(normalizeSymbol('A B')).toBeNull()
    expect(normalizeSymbol('<script>')).toBeNull()
    expect(normalizeSymbol('X'.repeat(21))).toBeNull()
  })

  it('appends a new symbol and ignores a duplicate', () => {
    expect(addSymbol(['AAPL'], 'msft')).toEqual(['AAPL', 'MSFT'])
    expect(addSymbol(['AAPL'], 'aapl')).toEqual(['AAPL'])
  })

  it('leaves the list unchanged when the symbol is invalid', () => {
    const list = ['AAPL']
    expect(addSymbol(list, '!!')).toBe(list)
  })

  it('removes a symbol', () => {
    expect(removeSymbol(['AAPL', 'MSFT'], 'AAPL')).toEqual(['MSFT'])
  })

  it('falls back to the defaults when nothing is stored', () => {
    expect(loadSymbols(memoryStorage())).toEqual(DEFAULT_SYMBOLS)
  })

  it('falls back to the defaults when the stored value is corrupt', () => {
    expect(loadSymbols(memoryStorage({ 'ttw-tv-symbols': '{nope' }))).toEqual(DEFAULT_SYMBOLS)
  })

  it('keeps an empty list the viewer saved on purpose', () => {
    const storage = memoryStorage()
    saveSymbols(storage, [])
    expect(loadSymbols(storage)).toEqual([])
  })

  it('round-trips a saved list and drops invalid entries on load', () => {
    const storage = memoryStorage({ 'ttw-tv-symbols': JSON.stringify(['aapl', 'bad sym', 'MSFT']) })
    expect(loadSymbols(storage)).toEqual(['AAPL', 'MSFT'])
  })

  it('survives storage that throws', () => {
    const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
    expect(loadSymbols(broken)).toEqual(DEFAULT_SYMBOLS)
    expect(() => saveSymbols(broken, ['AAPL'])).not.toThrow()
  })
})
