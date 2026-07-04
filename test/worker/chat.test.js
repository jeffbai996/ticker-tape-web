import { describe, it, expect } from 'vitest'
import { MODELS, estimateCost, deltaFrom, DAILY_CAP_USD } from '../../worker/chat.js'

describe('MODELS registry', () => {
  it('has provider, label, and both cost rates on every model', () => {
    for (const m of Object.values(MODELS)) {
      expect(['gemini', 'anthropic', 'openai']).toContain(m.provider)
      expect(m.costIn).toBeGreaterThan(0)
      expect(m.costOut).toBeGreaterThan(0)
      expect(m.label.length).toBeGreaterThan(0)
    }
  })
})

describe('estimateCost', () => {
  it('charges input estimate plus full output allowance', () => {
    // flash: $0.30/M in, $2.50/M out, 2048 max out tokens
    const c = estimateCost(MODELS.flash, 4000) // ≈1000 input tokens
    expect(c).toBeCloseTo((1000 / 1e6) * 0.3 + (2048 / 1e6) * 2.5, 6)
  })

  it('keeps a fable turn well under the daily cap', () => {
    const c = estimateCost(MODELS.fable, 32_000)
    expect(c).toBeLessThan(DAILY_CAP_USD / 10)
  })
})

describe('deltaFrom', () => {
  it('parses anthropic text deltas and ignores other events', () => {
    expect(deltaFrom('anthropic', JSON.stringify({
      type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' },
    }))).toBe('hi')
    expect(deltaFrom('anthropic', JSON.stringify({ type: 'message_start' }))).toBeNull()
    expect(deltaFrom('anthropic', JSON.stringify({
      type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'x' },
    }))).toBeNull()
  })

  it('parses gemini candidate parts', () => {
    expect(deltaFrom('gemini', JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }],
    }))).toBe('ab')
    expect(deltaFrom('gemini', JSON.stringify({ candidates: [{ finishReason: 'STOP' }] }))).toBeNull()
  })

  it('parses openai chat deltas', () => {
    expect(deltaFrom('openai', JSON.stringify({
      choices: [{ delta: { content: 'yo' } }],
    }))).toBe('yo')
    expect(deltaFrom('openai', JSON.stringify({ choices: [{ delta: {} }] }))).toBeNull()
  })

  it('returns null on junk payloads', () => {
    expect(deltaFrom('anthropic', 'not json')).toBeNull()
    expect(deltaFrom('gemini', '{}')).toBeNull()
  })
})
