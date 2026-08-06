import { describe, expect, it } from 'vitest'
import { tapeEntries, tapeBadge } from '../../src/lib/tape.js'

const q = (symbol) => ({ symbol })
const h = (id, over = {}) => ({ id, headline: `story ${id}`, type: 'headline', ...over })

describe('tapeEntries', () => {
  // headlines used to be printed as one block at the head of every cycle,
  // so the tape ran "news news news news" then nothing but quotes
  it('spreads headlines through the quotes instead of front-loading them', () => {
    const kinds = tapeEntries([h(1), h(2)], [q('A'), q('B'), q('C'), q('D'), q('E'), q('F')])
      .map((e) => e.kind)
    expect(kinds.filter((k) => k === 'headline')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'quote')).toHaveLength(6)
    const first = kinds.indexOf('headline')
    const last = kinds.lastIndexOf('headline')
    expect(first).toBeGreaterThan(0)          // never opens on a headline
    expect(last - first).toBeGreaterThan(1)   // and they are not adjacent
  })

  it('keeps every quote when headlines outnumber them', () => {
    const out = tapeEntries([h(1), h(2), h(3), h(4)], [q('A'), q('B')])
    expect(out.filter((e) => e.kind === 'quote')).toHaveLength(2)
    expect(out.filter((e) => e.kind === 'headline')).toHaveLength(4)
  })

  it('degrades to whatever it has', () => {
    expect(tapeEntries([], [q('A')]).map((e) => e.kind)).toEqual(['quote'])
    expect(tapeEntries([h(1)], []).map((e) => e.kind)).toEqual(['headline'])
    expect(tapeEntries()).toEqual([])
  })
})

describe('tapeBadge', () => {
  it('names the event type when the wire typed it', () => {
    expect(tapeBadge(h(1, { type: 'earnings_release' })).code).toBe('ERN')
    expect(tapeBadge(h(1, { type: 'filing' })).code).toBe('FIL')
    expect(tapeBadge(h(1, { type: 'fed_speech' })).code).toBe('FED')
  })

  // a plain headline is the common case, and 'NEWS' on all of them says
  // nothing — the triage tier is why the story is on your tape at all
  it('falls back to the relevance tier for plain headlines', () => {
    expect(tapeBadge(h(1, { meta: { thesis: 2 } }), new Set()).code).toBe('T2')
    expect(tapeBadge(h(1, { meta: { thesis: 1 } }), new Set()).code).toBe('T1')
    expect(tapeBadge(h(1, { meta: { thesis: 0 } }), new Set()).code).toBe('NEWS')
    expect(tapeBadge(h(1)).code).toBe('NEWS')
  })

  it('promotes a thesis story on a name you hold to T3', () => {
    const ev = h(1, { meta: { thesis: 2 }, symbols: ['NVDA'] })
    expect(tapeBadge(ev, new Set(['NVDA'])).code).toBe('T3')
    expect(tapeBadge(ev, new Set(['AAPL'])).code).toBe('T2')
  })

  it('gives each tier its own tone so the tape is scannable', () => {
    const tones = ['T1', 'T2', 'T3'].map((t, i) =>
      tapeBadge(h(1, { meta: { thesis: i + 1 }, symbols: ['NVDA'] }),
                new Set(t === 'T3' ? ['NVDA'] : [])).cls)
    expect(new Set(tones).size).toBe(3)
  })
})
