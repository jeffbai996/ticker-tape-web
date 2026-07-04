import { describe, it, expect } from 'vitest'
import { pruneOldest, createPCache } from '../../src/lib/pcache.js'

describe('pruneOldest', () => {
  it('keeps the newest entries by ts', () => {
    const obj = {
      a: { ts: 1 },
      b: { ts: 3 },
      c: { ts: 2 },
    }
    expect(Object.keys(pruneOldest(obj, 2)).sort()).toEqual(['b', 'c'])
  })
  it('is a no-op under the cap', () => {
    const obj = { a: { ts: 1 } }
    expect(pruneOldest(obj, 5)).toEqual(obj)
  })
  it('treats a missing ts as oldest', () => {
    const obj = { a: {}, b: { ts: 5 } }
    expect(Object.keys(pruneOldest(obj, 1))).toEqual(['b'])
  })
})

describe('createPCache', () => {
  it('round-trips values within a session', () => {
    const c = createPCache('t:roundtrip')
    c.set('x', { v: 1, ts: Date.now() })
    expect(c.get('x')).toEqual({ v: 1, ts: expect.any(Number) })
    expect(c.get('missing')).toBeNull()
  })

  it('hydrates from localStorage', () => {
    localStorage.setItem('t:hydrate', JSON.stringify({ k: { v: 42, ts: 7 } }))
    const c = createPCache('t:hydrate')
    expect(c.get('k')).toEqual({ v: 42, ts: 7 })
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('t:corrupt', '{not json')
    const c = createPCache('t:corrupt')
    expect(c.get('anything')).toBeNull()
  })

  it('persists (throttled) so a new instance sees writes', async () => {
    const c = createPCache('t:persist', { throttleMs: 5 })
    c.set('k', { v: 'hello', ts: Date.now() })
    await new Promise((r) => setTimeout(r, 30))
    const c2 = createPCache('t:persist')
    expect(c2.get('k')?.v).toBe('hello')
  })
})
