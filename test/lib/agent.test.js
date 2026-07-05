import { describe, it, expect } from 'vitest'
import { trimHistory } from '../../src/lib/agent.js'

const u = (i) => ({ role: 'user', content: `u${i}` })
const a = (i) => ({ role: 'assistant', content: `a${i}` })
const call = { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'get_watchlist', args: {} }] }
const result = { role: 'tool', id: 't1', name: 'get_watchlist', content: '{}' }

describe('trimHistory', () => {
  it('returns short histories untouched', () => {
    const h = [u(1), a(1)]
    expect(trimHistory(h, 10)).toBe(h)
  })

  it('cuts on a user boundary', () => {
    const h = [u(1), a(1), u(2), a(2), u(3), a(3)]
    const out = trimHistory(h, 4)
    expect(out).toEqual([u(2), a(2), u(3), a(3)])
    expect(out[0].role).toBe('user')
  })

  it('never separates a tool call from its result', () => {
    const h = [u(1), a(1), u(2), call, result, a(2)]
    // max 4 would naively cut inside the tool exchange (at `call`)
    const out = trimHistory(h, 4)
    expect(out[0].role).toBe('user')
    const callIdx = out.findIndex((m) => m.toolCalls)
    const resIdx = out.findIndex((m) => m.role === 'tool')
    expect(callIdx === -1 ? resIdx === -1 : resIdx > callIdx).toBe(true)
  })

  it('falls back to the last user turn when no boundary is in range', () => {
    const h = [u(1), call, result, result, result, result, a(1)]
    const out = trimHistory(h, 3)
    expect(out[0]).toEqual(u(1))
  })
})
