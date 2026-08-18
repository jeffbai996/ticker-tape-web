import { describe, expect, it } from 'vitest'
import { parseToolCall, toolProtocol } from '../../src/lib/wirechat.js'

const DEFS = [
  {
    name: 'get_quotes',
    description: 'Live quotes.',
    parameters: {
      type: 'object',
      properties: { symbols: { type: 'array' }, detail: { type: 'string' } },
      required: ['symbols'],
    },
  },
  { name: 'navigate', description: 'Jump.', parameters: { type: 'object', properties: { view: { type: 'string' } }, required: ['view'] } },
]

describe('toolProtocol', () => {
  it('names every tool and marks optional params', () => {
    const p = toolProtocol(DEFS)
    expect(p).toContain('get_quotes(symbols: array, detail?: string)')
    expect(p).toContain('navigate(view: string)')
  })

  it('states the reply contract', () => {
    expect(toolProtocol(DEFS)).toContain('{"tool": "<name>", "args": {…}}')
  })
})

describe('parseToolCall', () => {
  it('reads a bare call', () => {
    expect(parseToolCall('{"tool":"navigate","args":{"view":"markets"}}', DEFS))
      .toEqual({ name: 'navigate', args: { view: 'markets' } })
  })

  it('survives a fenced block', () => {
    const t = '```json\n{"tool":"get_quotes","args":{"symbols":["AAPL"]}}\n```'
    expect(parseToolCall(t, DEFS).name).toBe('get_quotes')
  })

  it('survives leading prose', () => {
    const t = 'Let me check that.\n{"tool":"get_quotes","args":{"symbols":["MU"]}}'
    expect(parseToolCall(t, DEFS).args.symbols).toEqual(['MU'])
  })

  it('defaults missing args to an empty object', () => {
    expect(parseToolCall('{"tool":"navigate"}', DEFS).args).toEqual({})
  })

  it('ignores prose that merely contains braces', () => {
    expect(parseToolCall('Use the {tool} menu to do that.', DEFS)).toBe(null)
    expect(parseToolCall('NVDA is up. Nothing to call here.', DEFS)).toBe(null)
  })

  it('refuses unknown tools', () => {
    expect(parseToolCall('{"tool":"rm_rf","args":{}}', DEFS)).toBe(null)
  })

  it('refuses malformed json', () => {
    expect(parseToolCall('{"tool":"navigate", args:}', DEFS)).toBe(null)
  })

  it('handles empty input', () => {
    expect(parseToolCall('', DEFS)).toBe(null)
    expect(parseToolCall(null, DEFS)).toBe(null)
  })
})
