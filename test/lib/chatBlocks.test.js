// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  BLOCK_LIMITS, blockAnchors, blockText, indexedComparison, makeBlock, sampleIndices, turnBlocks, validateBlock,
} from '../../src/lib/chatBlocks.js'

const line = (extra = {}) => ({
  v: 1, type: 'line', id: 'cmp', title: 'AAPL vs MSFT', unit: { kind: 'index', baseline: 100 },
  dates: ['2026-01-02', '2026-01-05', '2026-01-06'],
  series: [{ key: 'AAPL', label: 'AAPL', values: [100, 101.5, 99] }, { key: 'MSFT', label: 'MSFT', values: [100, null, 102] }],
  ...extra,
})
const bars = (extra = {}) => ({
  v: 1, type: 'bars', id: 'contrib', title: 'Example growth · contributors', unit: { kind: 'ccy', currency: 'USD' }, signed: true,
  items: [{ key: 'AAPL', label: 'Apple', value: 120.5, pct: 1.2 }, { key: 'XYZ', label: 'XYZ', value: null, note: 'no price' }],
  ...extra,
})
const table = (extra = {}) => ({
  v: 1, type: 'table', id: 'tbl', title: 'Returns', columns: [{ key: 'sym', label: 'Symbol' }, { key: 'ret', label: 'Return %', align: 'right' }],
  rows: [['AAPL', 4.2], ['MSFT', null]], ...extra,
})

describe('validateBlock', () => {
  it('accepts each block type and returns a clean copy without unknown fields', () => {
    for (const raw of [line({ extra: 'x' }), bars({ html: '<b>' }), table()]) {
      const out = validateBlock(raw)
      expect(out.ok, out.error).toBe(true)
      expect(out.block.extra).toBeUndefined()
      expect(out.block.html).toBeUndefined()
      expect(out.block.v).toBe(1)
    }
  })
  it('rejects unknown versions, types and non-objects', () => {
    expect(validateBlock(line({ v: 2 })).ok).toBe(false)
    expect(validateBlock(line({ type: 'pie' })).ok).toBe(false)
    expect(validateBlock('{"v":1}').ok).toBe(false)
    expect(validateBlock(null).ok).toBe(false)
    expect(validateBlock([line()]).ok).toBe(false)
  })
  it('turns NaN, Infinity and non-numeric values into nulls instead of drawing them', () => {
    const out = validateBlock(line({ series: [{ key: 'A', values: [NaN, Infinity, '5'] }, { key: 'B', values: [1, 2, 3] }] }))
    expect(out.ok).toBe(true)
    expect(out.block.series[0].values).toEqual([null, null, null])
    const b = validateBlock(bars({ items: [{ key: 'A', value: -Infinity, pct: 'x' }] }))
    expect(b.block.items[0]).toEqual({ key: 'A', label: 'A', value: null })
  })
  it('refuses a line block with no finite values at all', () => {
    expect(validateBlock(line({ series: [{ key: 'A', values: [null, NaN, undefined] }] })).ok).toBe(false)
  })
  it('requires matching lengths, ISO dates and unique keys', () => {
    expect(validateBlock(line({ series: [{ key: 'A', values: [1, 2] }] })).ok).toBe(false)
    expect(validateBlock(line({ dates: ['2026/01/02', '2026-01-05', '2026-01-06'] })).ok).toBe(false)
    expect(validateBlock(line({ series: [{ key: 'A', values: [1, 2, 3] }, { key: 'A', values: [1, 2, 3] }] })).ok).toBe(false)
    expect(validateBlock(bars({ items: [{ key: 'a b', value: 1 }] })).ok).toBe(false)
    expect(validateBlock(table({ rows: [['AAPL']] })).ok).toBe(false)
  })
  it('bounds series, points, items, rows, columns, strings and notes', () => {
    const many = (n, f) => Array.from({ length: n }, (_, i) => f(i))
    const dates = many(BLOCK_LIMITS.points + 1, (i) => `2026-01-${String((i % 28) + 1).padStart(2, '0')}`)
    expect(validateBlock(line({ dates, series: [{ key: 'A', values: dates.map(() => 1) }] })).ok).toBe(false)
    expect(validateBlock(line({ series: many(BLOCK_LIMITS.series + 1, (i) => ({ key: `S${i}`, values: [1, 2, 3] })) })).ok).toBe(false)
    expect(validateBlock(bars({ items: many(BLOCK_LIMITS.items + 1, (i) => ({ key: `I${i}`, value: i })) })).ok).toBe(false)
    expect(validateBlock(table({ rows: many(BLOCK_LIMITS.rows + 1, () => ['a', 1]) })).ok).toBe(false)
    expect(validateBlock(table({ columns: many(BLOCK_LIMITS.columns + 1, (i) => ({ key: `c${i}` })), rows: [] })).ok).toBe(false)
    const long = validateBlock(bars({ title: 'x'.repeat(500), notes: many(10, (i) => `note ${i}`) }))
    expect(long.block.title.length).toBe(BLOCK_LIMITS.text)
    expect(long.block.notes.length).toBe(BLOCK_LIMITS.notes)
  })
  it('refuses a payload over the byte budget even when every field is individually valid', () => {
    const items = Array.from({ length: BLOCK_LIMITS.items }, (_, i) => ({ key: `I${i}`, label: 'y'.repeat(BLOCK_LIMITS.text), value: i, note: 'z'.repeat(BLOCK_LIMITS.text) }))
    const columns = Array.from({ length: BLOCK_LIMITS.columns }, (_, i) => ({ key: `c${i}`, label: 'x'.repeat(BLOCK_LIMITS.text) }))
    const rows = Array.from({ length: BLOCK_LIMITS.rows }, () => columns.map(() => 'w'.repeat(BLOCK_LIMITS.cell)))
    const big = validateBlock(table({ columns, rows, notes: items.map((i) => i.note) }))
    const heavy = validateBlock(line({
      dates: Array.from({ length: BLOCK_LIMITS.points }, (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, '0')}`),
      series: Array.from({ length: BLOCK_LIMITS.series }, (_, k) => ({ key: `S${k}`, label: 'l'.repeat(BLOCK_LIMITS.text), values: Array.from({ length: BLOCK_LIMITS.points }, () => 12345.6789) })),
    }))
    expect([big.ok, heavy.ok]).toContain(false)
  })
  it('keeps source provenance and drops a non-numeric as-of', () => {
    const out = validateBlock(line({ source: { tool: 'chart_compare', provider: 'Yahoo Finance', asOf: 'yesterday', range: '1Y', secret: 'x' } }))
    expect(out.block.source).toEqual({ tool: 'chart_compare', provider: 'Yahoo Finance', range: '1Y' })
  })
  it('makeBlock throws on an invalid block so an executor cannot emit one', () => {
    expect(() => makeBlock(line({ title: '' }))).toThrow(/title/)
  })
})

describe('transcript helpers', () => {
  const history = [
    { role: 'user', content: 'Compare AAPL and MSFT' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'w0', name: 'chart_compare', args: {} }] },
    { role: 'tool', id: 'w0', name: 'chart_compare', content: '{}', block: line() },
    { role: 'assistant', content: 'AAPL led.' },
    { role: 'user', content: 'And the book?' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'w1', name: 'chart_portfolio', args: {} }] },
    { role: 'tool', id: 'w1', name: 'chart_portfolio', content: '{}', block: bars() },
    { role: 'tool', id: 'w2', name: 'chart_portfolio', content: '{}', block: { v: 9 } },
  ]
  it('collects only valid blocks from the turn that contains the index', () => {
    expect(turnBlocks(history, 3).map((b) => b.id)).toEqual(['cmp'])
    expect(turnBlocks(history, 6).map((b) => b.id)).toEqual(['contrib'])
    expect(turnBlocks([{ role: 'assistant', content: 'legacy' }], 0)).toEqual([])
  })
  it('anchors blocks on the final text answer, or the last record of an unfinished turn', () => {
    const { anchors, tail } = blockAnchors(history)
    expect([...anchors.keys()]).toEqual([3, 7])
    expect(tail).toEqual([])
  })
  it('hands the streaming turn back as a tail instead of anchoring it', () => {
    const { anchors, tail } = blockAnchors(history, { liveTail: true })
    expect([...anchors.keys()]).toEqual([3])
    expect(tail.map((b) => b.id)).toEqual(['contrib'])
  })
  it('renders a readable text fallback for every type', () => {
    expect(blockText(validateBlock(line()).block)).toContain('2026-01-05 | 101.5 | —')
    expect(blockText(validateBlock(bars()).block)).toContain('XYZ: — · no price')
    expect(blockText(validateBlock(table()).block)).toContain('MSFT | —')
  })
})

describe('indexedComparison', () => {
  const dateOf = (bar) => bar.d
  it('indexes to 100 on the first common session and leaves untraded sessions null', () => {
    const out = indexedComparison([
      { key: 'A', bars: [{ d: '2026-01-02', close: 10 }, { d: '2026-01-05', close: 11 }, { d: '2026-01-06', close: 12 }] },
      { key: 'B', bars: [{ d: '2026-01-05', close: 50 }, { d: '2026-01-06', close: 45 }, { d: '2026-01-07', close: 55 }] },
    ], { dateOf })
    expect(out.baselineDate).toBe('2026-01-05')
    expect(out.dates).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(out.series[0].values).toEqual([100, 109.09, null])
    expect(out.series[1].values).toEqual([100, 90, 110])
    expect(out.missing).toEqual({ A: 1, B: 0 })
  })
  it('returns nothing when the series never overlap', () => {
    const out = indexedComparison([{ key: 'A', bars: [{ d: '2026-01-02', close: 1 }] }, { key: 'B', bars: [{ d: '2026-01-03', close: 1 }] }], { dateOf })
    expect(out.dates).toEqual([])
    expect(out.baselineDate).toBeNull()
  })
  it('ignores non-finite or non-positive closes and samples long windows evenly', () => {
    const bars = Array.from({ length: 600 }, (_, i) => ({ d: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, close: i === 3 ? NaN : 100 + i }))
    const out = indexedComparison([{ key: 'A', bars }], { dateOf, max: 50 })
    expect(out.sampled).toBe(true)
    expect(out.dates.length).toBe(50)
    expect(out.dates[0]).toBe('2024-01-01')
    expect(out.dates.at(-1)).toBe(bars.at(-1).d)
    expect(sampleIndices(5, 10)).toEqual([0, 1, 2, 3, 4])
  })
})
