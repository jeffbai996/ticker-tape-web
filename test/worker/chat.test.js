import { describe, it, expect } from 'vitest'
import {
  MODELS, estimateCost, deltaFrom, DAILY_CAP_USD,
  validMessage, anthMessages, gemContents, oaiMessages, makeToolCollector,
  providerRequest,
} from '../../worker/chat.js'

describe('MODELS registry', () => {
  it('exposes the deliberately trimmed web lineup', () => {
    expect(Object.keys(MODELS)).toEqual(['flash', 'sonnet', 'opus', 'fable', 'terra', 'sol'])
    expect(MODELS.flash).toMatchObject({ id: 'gemini-3.6-flash', thinkingBudget: 1024 })
    expect(MODELS.opus).toMatchObject({ id: 'claude-opus-5', effort: 'medium' })
    expect(MODELS.terra).toMatchObject({ id: 'gpt-5.6-terra', reasoningEffort: 'high' })
    expect(MODELS.sol).toMatchObject({ id: 'gpt-5.6-sol', reasoningEffort: 'low' })
  })

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
    // Flash 3.6: $1.50/M in, $7.50/M out, 2048 max out tokens
    const c = estimateCost(MODELS.flash, 4000) // ≈1000 input tokens
    expect(c).toBeCloseTo((1000 / 1e6) * 1.5 + (2048 / 1e6) * 7.5, 6)
  })

  it('keeps a fable turn well under the daily cap', () => {
    const c = estimateCost(MODELS.fable, 32_000)
    expect(c).toBeLessThan(DAILY_CAP_USD / 10)
  })
})

describe('providerRequest effort', () => {
  const messages = [{ role: 'user', content: 'Analyze AAPL' }]

  it('sends Gemini thinking budget', () => {
    const [, init] = providerRequest(MODELS.flash, 'key', '', messages, null)
    expect(JSON.parse(init.body).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 1024 })
  })

  it('sends adaptive thinking and effort to Anthropic', () => {
    const [, init] = providerRequest(MODELS.opus, 'key', '', messages, null)
    const body = JSON.parse(init.body)
    expect(body.thinking).toEqual({ type: 'adaptive' })
    expect(body.output_config).toEqual({ effort: 'medium' })
  })

  it('sends reasoning effort to OpenAI', () => {
    const [, terraInit] = providerRequest(MODELS.terra, 'key', '', messages, null)
    const [, solInit] = providerRequest(MODELS.sol, 'key', '', messages, null)
    expect(JSON.parse(terraInit.body).reasoning_effort).toBe('high')
    expect(JSON.parse(solInit.body).reasoning_effort).toBe('low')
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

const TC = { id: 'tu_1', name: 'get_quotes', args: { symbols: ['NVDA'] } }
const CONVO = [
  { role: 'user', content: 'quote nvda' },
  { role: 'assistant', content: 'checking', toolCalls: [TC] },
  { role: 'tool', id: 'tu_1', name: 'get_quotes', content: '{"price":190}' },
  { role: 'assistant', content: 'NVDA is 190.' },
]

describe('validMessage', () => {
  it('accepts the three neutral shapes', () => {
    for (const m of CONVO) expect(validMessage(m)).toBe(true)
  })

  it('rejects malformed shapes', () => {
    expect(validMessage({ role: 'system', content: 'x' })).toBe(false)
    expect(validMessage({ role: 'user', content: 5 })).toBe(false)
    expect(validMessage({ role: 'tool', id: 'a', content: 'x' })).toBe(false) // no name
    expect(validMessage({ role: 'user', content: 'x', toolCalls: [] })).toBe(false) // user can't call
    expect(validMessage({ role: 'assistant', content: '', toolCalls: [{ id: 1, name: 'x', args: {} }] })).toBe(false)
    expect(validMessage({ role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'x', args: null }] })).toBe(false)
  })
})

describe('anthMessages', () => {
  it('maps tool calls to tool_use and results to tool_result user turns', () => {
    const out = anthMessages(CONVO)
    expect(out).toHaveLength(4)
    expect(out[1].content).toEqual([
      { type: 'text', text: 'checking' },
      { type: 'tool_use', id: 'tu_1', name: 'get_quotes', input: { symbols: ['NVDA'] } },
    ])
    expect(out[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '{"price":190}' }],
    })
    expect(out[3]).toEqual({ role: 'assistant', content: 'NVDA is 190.' })
  })

  it('merges consecutive tool results into one user message, no empty text block', () => {
    const out = anthMessages([
      { role: 'assistant', content: '', toolCalls: [TC, { ...TC, id: 'tu_2' }] },
      { role: 'tool', id: 'tu_1', name: 'get_quotes', content: 'a' },
      { role: 'tool', id: 'tu_2', name: 'get_quotes', content: 'b' },
    ])
    expect(out).toHaveLength(2)
    expect(out[0].content[0].type).toBe('tool_use')
    expect(out[1].content).toHaveLength(2)
  })
})

describe('gemContents', () => {
  it('maps to functionCall/functionResponse parts', () => {
    const out = gemContents(CONVO)
    expect(out.map((c) => c.role)).toEqual(['user', 'model', 'user', 'model'])
    expect(out[1].parts[1]).toEqual({
      functionCall: { name: 'get_quotes', args: { symbols: ['NVDA'] } },
    })
    expect(out[2].parts[0].functionResponse.name).toBe('get_quotes')
  })

  it('merges consecutive tool results into one user content', () => {
    const out = gemContents([
      { role: 'tool', id: 'a', name: 'x', content: '1' },
      { role: 'tool', id: 'b', name: 'y', content: '2' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].parts).toHaveLength(2)
  })
})

describe('oaiMessages', () => {
  it('maps to tool_calls with stringified args and role:tool results', () => {
    const out = oaiMessages(CONVO)
    expect(out[1].tool_calls[0]).toEqual({
      id: 'tu_1',
      type: 'function',
      function: { name: 'get_quotes', arguments: '{"symbols":["NVDA"]}' },
    })
    expect(out[2]).toEqual({ role: 'tool', tool_call_id: 'tu_1', content: '{"price":190}' })
  })
})

describe('makeToolCollector', () => {
  it('assembles anthropic input_json_delta fragments', () => {
    const c = makeToolCollector('anthropic')
    c.feed(JSON.stringify({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_9', name: 'set_alert' } }))
    c.feed(JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"symbol":"NV' } }))
    c.feed(JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'DA","value":250}' } }))
    expect(c.result()).toEqual([{ id: 'tu_9', name: 'set_alert', args: { symbol: 'NVDA', value: 250 } }])
  })

  it('drops anthropic calls whose args never parse', () => {
    const c = makeToolCollector('anthropic')
    c.feed(JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_9', name: 'x' } }))
    c.feed(JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"broken' } }))
    expect(c.result()).toEqual([])
  })

  it('treats an empty anthropic input as {} (zero-arg tools)', () => {
    const c = makeToolCollector('anthropic')
    c.feed(JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_3', name: 'get_watchlist' } }))
    expect(c.result()).toEqual([{ id: 'tu_3', name: 'get_watchlist', args: {} }])
  })

  it('collects whole gemini functionCall parts with synthesized ids', () => {
    const c = makeToolCollector('gemini')
    c.feed(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'get_quotes', args: { symbols: ['A'] } } }, { functionCall: { name: 'get_watchlist' } }] } }] }))
    const out = c.result()
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ id: 'g0', name: 'get_quotes', args: { symbols: ['A'] } })
    expect(out[1].args).toEqual({})
  })

  it('captures gemini thoughtSignature and gemContents replays it', () => {
    const c = makeToolCollector('gemini')
    c.feed(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'get_quotes', args: {} }, thoughtSignature: 'SIG==' }] } }] }))
    const [call] = c.result()
    expect(call.sig).toBe('SIG==')

    const out = gemContents([{ role: 'assistant', content: '', toolCalls: [call] }])
    expect(out[0].parts[0].thoughtSignature).toBe('SIG==')
    expect(out[0].parts[0].functionCall.name).toBe('get_quotes')
  })

  it('assembles openai incremental tool_calls by index', () => {
    const c = makeToolCollector('openai')
    c.feed(JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'watch', arguments: '' } }] } }] }))
    c.feed(JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"symbol":' } }] } }] }))
    c.feed(JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"SHOP"}' } }] } }] }))
    expect(c.result()).toEqual([{ id: 'call_1', name: 'watch', args: { symbol: 'SHOP' } }])
  })

  it('ignores unparseable payloads and text-only streams', () => {
    const c = makeToolCollector('anthropic')
    c.feed('not json')
    c.feed(JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } }))
    expect(c.result()).toEqual([])
  })
})
