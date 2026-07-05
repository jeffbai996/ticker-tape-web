import { describe, it, expect } from 'vitest'
import { parseSSE } from '../../src/lib/chatClient.js'

describe('parseSSE', () => {
  it('extracts text deltas and buffers the partial tail', () => {
    const [deltas, done, rest] = parseSSE('data: {"d":"he"}\n\ndata: {"d":"llo"}\n\ndata: {"d":"wor')
    expect(deltas).toEqual(['he', 'llo'])
    expect(done).toBe(false)
    expect(rest).toBe('data: {"d":"wor')
  })

  it('flags [DONE] and skips junk lines', () => {
    const [deltas, done, , tcs] = parseSSE('data: junk\n\ndata: {"d":"x"}\n\ndata: [DONE]\n\n')
    expect(deltas).toEqual(['x'])
    expect(done).toBe(true)
    expect(tcs).toEqual([])
  })

  it('collects tool-call events alongside text', () => {
    const buf =
      'data: {"d":"let me check"}\n\n' +
      'data: {"tc":[{"id":"t1","name":"get_quotes","args":{"symbols":["NVDA"]}}]}\n\n' +
      'data: [DONE]\n\n'
    const [deltas, done, , tcs] = parseSSE(buf)
    expect(deltas).toEqual(['let me check'])
    expect(done).toBe(true)
    expect(tcs).toEqual([{ id: 't1', name: 'get_quotes', args: { symbols: ['NVDA'] } }])
  })
})
