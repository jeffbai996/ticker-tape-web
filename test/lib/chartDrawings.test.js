import { describe, it, expect, beforeEach } from 'vitest'
import {
  DRAWINGS_KEY, readAll, loadDrawings, saveDrawings, addDrawing,
  removeDrawing, clearDrawings, newId, sanitizeDrawing,
} from '../../src/lib/chartDrawings.js'

// A throwaway Storage stand-in so tests never depend on jsdom's shared
// localStorage leaking between files.
function fakeStore(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _raw: () => map.get(DRAWINGS_KEY),
  }
}

const hline = (price = 100) => ({ type: 'hline', points: [{ time: 1, price }] })
const trend = () => ({
  type: 'trend',
  points: [{ time: 100, price: 10 }, { time: 200, price: 20 }],
})

describe('chartDrawings round-trip', () => {
  let store
  beforeEach(() => { store = fakeStore() })

  it('returns an empty list for a symbol with nothing stored', () => {
    expect(loadDrawings('NVDA', store)).toEqual([])
  })

  it('round-trips a saved drawing through JSON', () => {
    const list = [hline(123.45)]
    saveDrawings('NVDA', list, store)
    const back = loadDrawings('NVDA', store)
    expect(back).toHaveLength(1)
    expect(back[0].type).toBe('hline')
    expect(back[0].points).toEqual([{ time: 1, price: 123.45 }])
  })

  it('serializes as {symbol: [...]}', () => {
    saveDrawings('nvda', [hline()], store)
    const raw = JSON.parse(store._raw())
    expect(Object.keys(raw)).toEqual(['NVDA'])
    expect(Array.isArray(raw.NVDA)).toBe(true)
  })

  it('gives every stored drawing a stable id', () => {
    saveDrawings('NVDA', [hline(), trend()], store)
    const [a, b] = loadDrawings('NVDA', store)
    expect(a.id).toBeTruthy()
    expect(b.id).toBeTruthy()
    expect(a.id).not.toBe(b.id)
    // ids survive a reload
    expect(loadDrawings('NVDA', store)[0].id).toBe(a.id)
  })

  it('newId produces unique values', () => {
    const ids = new Set(Array.from({ length: 50 }, newId))
    expect(ids.size).toBe(50)
  })
})

describe('chartDrawings per-symbol isolation', () => {
  let store
  beforeEach(() => { store = fakeStore() })

  it('keeps symbols independent', () => {
    saveDrawings('NVDA', [hline(100)], store)
    saveDrawings('MSFT', [hline(200), trend()], store)
    expect(loadDrawings('NVDA', store)).toHaveLength(1)
    expect(loadDrawings('MSFT', store)).toHaveLength(2)
    expect(loadDrawings('NVDA', store)[0].points[0].price).toBe(100)
  })

  it('is case- and whitespace-insensitive on the symbol', () => {
    saveDrawings(' nvda ', [hline(7)], store)
    expect(loadDrawings('NVDA', store)[0].points[0].price).toBe(7)
  })

  it('clearing one symbol leaves the others alone', () => {
    saveDrawings('NVDA', [hline()], store)
    saveDrawings('MSFT', [hline()], store)
    expect(clearDrawings('NVDA', store)).toEqual([])
    expect(loadDrawings('NVDA', store)).toEqual([])
    expect(loadDrawings('MSFT', store)).toHaveLength(1)
  })

  it('drops the symbol key entirely when cleared', () => {
    saveDrawings('NVDA', [hline()], store)
    clearDrawings('NVDA', store)
    expect(Object.keys(readAll(store))).not.toContain('NVDA')
  })

  it('ignores a blank symbol instead of writing a junk key', () => {
    expect(loadDrawings('', store)).toEqual([])
    saveDrawings('', [hline()], store)
    expect(readAll(store)).toEqual({})
  })
})

describe('chartDrawings add / remove', () => {
  let store
  beforeEach(() => { store = fakeStore() })

  it('appends and persists', () => {
    const list = addDrawing('NVDA', hline(1), store)
    expect(list).toHaveLength(1)
    addDrawing('NVDA', trend(), store)
    expect(loadDrawings('NVDA', store)).toHaveLength(2)
  })

  it('returns the id it assigned so callers can select the new drawing', () => {
    const list = addDrawing('NVDA', hline(1), store)
    expect(list[0].id).toBeTruthy()
  })

  it('removes by id', () => {
    const [a] = addDrawing('NVDA', hline(1), store)
    addDrawing('NVDA', hline(2), store)
    const left = removeDrawing('NVDA', a.id, store)
    expect(left).toHaveLength(1)
    expect(left[0].points[0].price).toBe(2)
    expect(loadDrawings('NVDA', store)).toHaveLength(1)
  })

  it('removing an unknown id is a no-op', () => {
    addDrawing('NVDA', hline(1), store)
    expect(removeDrawing('NVDA', 'nope', store)).toHaveLength(1)
  })

  it('refuses to add an invalid drawing', () => {
    addDrawing('NVDA', { type: 'hline', points: [] }, store)
    addDrawing('NVDA', null, store)
    expect(loadDrawings('NVDA', store)).toEqual([])
  })
})

describe('chartDrawings tolerates garbage', () => {
  it('survives corrupt JSON', () => {
    const store = fakeStore({ [DRAWINGS_KEY]: '{not json at all' })
    expect(readAll(store)).toEqual({})
    expect(loadDrawings('NVDA', store)).toEqual([])
  })

  it('survives valid JSON of the wrong shape', () => {
    expect(readAll(fakeStore({ [DRAWINGS_KEY]: '[1,2,3]' }))).toEqual({})
    expect(readAll(fakeStore({ [DRAWINGS_KEY]: '"NVDA"' }))).toEqual({})
    expect(readAll(fakeStore({ [DRAWINGS_KEY]: 'null' }))).toEqual({})
    expect(loadDrawings('NVDA', fakeStore({ [DRAWINGS_KEY]: '{"NVDA":42}' })))
      .toEqual([])
  })

  it('drops individual malformed drawings but keeps the good ones', () => {
    const store = fakeStore({
      [DRAWINGS_KEY]: JSON.stringify({
        NVDA: [
          { type: 'hline', points: [{ time: 1, price: 50 }] },
          { type: 'hline', points: [{ time: 1, price: 'abc' }] },
          { type: 'trend', points: [{ time: 1, price: 2 }] }, // needs two
          { type: 'fib', points: [{ time: 1, price: 2 }] }, // unknown type
          null,
          'garbage',
        ],
      }),
    })
    const list = loadDrawings('NVDA', store)
    expect(list).toHaveLength(1)
    expect(list[0].points[0].price).toBe(50)
  })

  it('survives a storage that throws (private mode / quota)', () => {
    const hostile = {
      getItem() { throw new Error('denied') },
      setItem() { throw new Error('quota') },
      removeItem() { throw new Error('denied') },
    }
    expect(loadDrawings('NVDA', hostile)).toEqual([])
    expect(() => saveDrawings('NVDA', [hline()], hostile)).not.toThrow()
    expect(() => clearDrawings('NVDA', hostile)).not.toThrow()
  })

  it('survives a missing storage entirely', () => {
    expect(loadDrawings('NVDA', null)).toEqual([])
    expect(() => saveDrawings('NVDA', [hline()], null)).not.toThrow()
  })
})

describe('sanitizeDrawing', () => {
  it('accepts a well-formed hline and trend', () => {
    expect(sanitizeDrawing(hline(5))).toMatchObject({ type: 'hline' })
    expect(sanitizeDrawing(trend())).toMatchObject({ type: 'trend' })
  })

  it('rejects non-finite numbers', () => {
    expect(sanitizeDrawing({ type: 'hline', points: [{ time: 1, price: NaN }] })).toBeNull()
    expect(sanitizeDrawing({ type: 'hline', points: [{ time: NaN, price: 1 }] })).toBeNull()
    expect(sanitizeDrawing({ type: 'hline', points: [{ time: 1, price: Infinity }] })).toBeNull()
  })

  it('keeps only time and price on each point', () => {
    const d = sanitizeDrawing({
      type: 'hline', id: 'x',
      points: [{ time: 1, price: 2, junk: 'drop me' }],
      evil: true,
    })
    expect(d.points[0]).toEqual({ time: 1, price: 2 })
    expect(d.evil).toBeUndefined()
    expect(d.id).toBe('x')
  })

  it('truncates extra points to the type arity', () => {
    const d = sanitizeDrawing({
      type: 'hline',
      points: [{ time: 1, price: 2 }, { time: 3, price: 4 }],
    })
    expect(d.points).toHaveLength(1)
  })

  it('accepts string times (lightweight-charts business-day strings)', () => {
    const d = sanitizeDrawing({
      type: 'hline', points: [{ time: '2026-08-11', price: 2 }] })
    expect(d.points[0].time).toBe('2026-08-11')
  })
})
