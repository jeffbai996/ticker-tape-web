import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_DEFS, SCREEN_DEFS_VERSION, SCREEN_FIELDS,
  alertSpecForEntry, deleteScreenDef, describePredicate, evaluateScreen,
  loadScreenDefs, matchedSymbols, migrateScreenDefs, newScreenDef,
  normalizeDef, normalizePredicate, opsForField, saveScreenDef, screenEntrants,
  screenUniverse, MAX_UNIVERSE,
} from '../../src/lib/screenDefs.js'

const row = (symbol, tech = {}, quote = {}) => ({ symbol, tech, quote })

const OVERSOLD = normalizeDef({
  name: 'oversold heavy',
  predicates: [
    { field: 'rsi', op: '<', value: 30 },
    { field: 'volRatio', op: '>', value: 1.5 },
  ],
  rankBy: 'rsi',
  rankDir: 'asc',
})

beforeEach(() => localStorage.clear())

describe('predicate model', () => {
  it('offers only the operators the field kind can answer', () => {
    expect(opsForField('rsi')).toEqual(['>', '<', 'between'])
    expect(opsForField('sma200')).toEqual(['above', 'below'])
    expect(opsForField('nope')).toEqual([])
  })

  it('drops half-typed predicates instead of persisting a rule that matches everything', () => {
    expect(normalizePredicate({ field: 'rsi', op: '<', value: '30' })).toEqual({ field: 'rsi', op: '<', value: 30, value2: null })
    expect(normalizePredicate({ field: 'rsi', op: '<', value: '' })).toBe(null)
    expect(normalizePredicate({ field: 'rsi', op: 'above', value: 30 })).toBe(null)
    expect(normalizePredicate({ field: 'ebitda', op: '<', value: 3 })).toBe(null)
    expect(normalizePredicate({ field: 'rsi', op: 'between', value: 30 })).toBe(null)
  })

  it('stores a between band low to high whichever way it was typed', () => {
    expect(normalizePredicate({ field: 'rsi', op: 'between', value: 70, value2: 40 }))
      .toEqual({ field: 'rsi', op: 'between', value: 40, value2: 70 })
  })

  it('needs no value for a side predicate', () => {
    expect(normalizePredicate({ field: 'sma50', op: 'above' }))
      .toEqual({ field: 'sma50', op: 'above', value: null, value2: null })
  })

  it('describes a predicate in the units the board uses', () => {
    expect(describePredicate({ field: 'rsi', op: '<', value: 30 })).toBe('RSI < 30.0')
    expect(describePredicate({ field: 'volRatio', op: '>', value: 1.5 })).toBe('vol > 1.5x')
    expect(describePredicate({ field: 'offHigh', op: 'between', value: -25, value2: -10 })).toBe('off high -25%–-10%')
    expect(describePredicate({ field: 'sma200', op: 'above' })).toBe('above SMA200')
    expect(describePredicate({ field: 'rsi', op: '<', value: 30 }, () => 'RSI相对强弱')).toBe('RSI相对强弱 < 30.0')
  })

  it('screens only fields the feed already computes', () => {
    expect(SCREEN_FIELDS.map((f) => f.id)).toEqual([
      'rsi', 'rs', 'volRatio', 'offHigh', 'sma50', 'sma200', 'price', 'pct', 'spread',
    ])
  })

  it('reads each field off the dashboard row shape', () => {
    const r = row('AAPL',
      { rsi: 28, rs: -3, volRatio: 2.1, offHigh: -12, above50: true, above200: false },
      { price: 100, pct: -1.5, bid: 99.98, ask: 100.02 })
    const read = Object.fromEntries(SCREEN_FIELDS.map((f) => [f.id, f.pick(r)]))
    expect(read.rsi).toBe(28)
    expect(read.sma50).toBe(true)
    expect(read.sma200).toBe(false)
    expect(read.pct).toBe(-1.5)
    expect(read.spread).toBeCloseTo(0.04, 6)
  })
})

describe('screen definition storage', () => {
  it('round-trips a definition through the versioned envelope', () => {
    const saved = saveScreenDef({ name: 'Oversold heavy', predicates: OVERSOLD.predicates, rankBy: 'rsi', rankDir: 'asc' }, 111)
    expect(saved.id).toBe('oversold-heavy')
    expect(saved.updated).toBe(111)
    expect(JSON.parse(localStorage.getItem('screen_defs_v1')).version).toBe(SCREEN_DEFS_VERSION)
    expect(loadScreenDefs()).toEqual([saved])
  })

  it('updates in place by id and never duplicates the same screen', () => {
    saveScreenDef({ name: 'momo', predicates: [{ field: 'rs', op: '>', value: 5 }] }, 1)
    const again = saveScreenDef({ id: 'momo', name: 'momo', predicates: [{ field: 'rs', op: '>', value: 9 }] }, 2)
    expect(loadScreenDefs()).toHaveLength(1)
    expect(again.predicates[0].value).toBe(9)
  })

  it('gives a second screen with a colliding slug its own id', () => {
    saveScreenDef({ name: 'momo' }, 1)
    const second = saveScreenDef({ name: 'MOMO' }, 2)
    expect(second.id).toBe('momo-2')
    expect(loadScreenDefs()).toHaveLength(2)
  })

  it('caps the store and refuses a save past the cap', () => {
    for (let i = 0; i < MAX_DEFS; i++) saveScreenDef({ name: `s${i}` }, i)
    expect(saveScreenDef({ name: 'one too many' }, 99)).toBe(null)
    expect(loadScreenDefs()).toHaveLength(MAX_DEFS)
  })

  it('deletes by id and reports whether anything went', () => {
    saveScreenDef({ name: 'momo' }, 1)
    expect(deleteScreenDef('nope')).toBe(false)
    expect(deleteScreenDef('momo')).toBe(true)
    expect(loadScreenDefs()).toEqual([])
  })

  it('survives corrupt storage and lifts a pre-version bare array', () => {
    localStorage.setItem('screen_defs_v1', '{{{')
    expect(loadScreenDefs()).toEqual([])
    expect(migrateScreenDefs([{ name: 'legacy', predicates: [{ field: 'rsi', op: '<', value: 30 }] }]))
      .toEqual([{ id: 'legacy', name: 'legacy', predicates: [{ field: 'rsi', op: '<', value: 30, value2: null }], sources: ['board'], rankBy: 'rsi', rankDir: 'desc', updated: 0 }])
  })

  it('refuses a future envelope rather than guessing at its shape', () => {
    expect(migrateScreenDefs({ version: SCREEN_DEFS_VERSION + 1, defs: [{ name: 'x' }] })).toEqual([])
  })

  it('normalizes a nameless or junk definition away', () => {
    expect(normalizeDef({ name: '   ' })).toBe(null)
    expect(newScreenDef('fresh')).toEqual({ id: 'fresh', name: 'fresh', predicates: [], sources: ['board'], rankBy: 'rsi', rankDir: 'desc', updated: 0 })
  })
})

describe('evaluateScreen', () => {
  const rows = [
    row('AAA', { rsi: 28, volRatio: 2.1 }),
    row('BBB', { rsi: 22, volRatio: 3.0 }),
    row('CCC', { rsi: 55, volRatio: 2.0 }),
    row('DDD', { volRatio: 4.0 }),
  ]

  it('explains why each symbol matched with the values that passed', () => {
    const [first] = evaluateScreen(rows, OVERSOLD)
    expect(first.symbol).toBe('BBB')
    expect(first.matched).toBe(true)
    expect(first.why).toEqual(['RSI 22.0 < 30.0', 'vol 3.0x > 1.5x'])
    expect(first.missing).toEqual([])
  })

  it('reports a missing input instead of silently excluding the symbol', () => {
    const ddd = evaluateScreen(rows, OVERSOLD).find((r) => r.symbol === 'DDD')
    expect(ddd.status).toBe('pending')
    expect(ddd.matched).toBe(false)
    expect(ddd.missing).toEqual(['RSI'])
    expect(ddd.why).toEqual(['vol 4.0x > 1.5x'])
  })

  it('keeps a failing symbol with the predicate that failed it', () => {
    const ccc = evaluateScreen(rows, OVERSOLD).find((r) => r.symbol === 'CCC')
    expect(ccc.status).toBe('miss')
    expect(ccc.failed).toEqual(['RSI 55.0 < 30.0'])
  })

  it('bands matches first, then pending, then misses', () => {
    expect(evaluateScreen(rows, OVERSOLD).map((r) => r.symbol)).toEqual(['BBB', 'AAA', 'DDD', 'CCC'])
  })

  it('ranks by the chosen field and direction with nulls last', () => {
    const def = normalizeDef({ name: 'all', predicates: [], rankBy: 'volRatio', rankDir: 'desc' })
    expect(evaluateScreen(rows, def).map((r) => r.symbol)).toEqual(['DDD', 'BBB', 'AAA', 'CCC'])
    const up = evaluateScreen(rows, { ...def, rankDir: 'asc' })
    expect(up.map((r) => r.symbol)).toEqual(['CCC', 'AAA', 'BBB', 'DDD'])
    const empty = evaluateScreen([row('ZZZ'), row('YYY')], def)
    expect(empty.map((r) => r.symbol)).toEqual(['YYY', 'ZZZ'])
  })

  it('matches everything when a screen has no predicates yet', () => {
    const def = newScreenDef('blank')
    expect(evaluateScreen(rows, def).every((r) => r.matched)).toBe(true)
  })

  it('handles side predicates and translates field names through the label hook', () => {
    const def = normalizeDef({ name: 'trend', predicates: [{ field: 'sma200', op: 'above' }], rankBy: 'rs' })
    const out = evaluateScreen([row('UP', { above200: true }), row('DN', { above200: false }), row('NA', {})], def)
    expect(out.find((r) => r.symbol === 'UP').why).toEqual(['SMA200 above'])
    expect(out.find((r) => r.symbol === 'DN').status).toBe('miss')
    expect(out.find((r) => r.symbol === 'NA').missing).toEqual(['SMA200'])
    const zh = evaluateScreen([row('UP', { above200: true })], def, {
      labels: (id, en) => (id === 'above' ? '在上方' : en),
    })
    expect(zh[0].why).toEqual(['SMA200 在上方'])
  })

  it('evaluates a between band inclusively', () => {
    const def = normalizeDef({ name: 'band', predicates: [{ field: 'rsi', op: 'between', value: 40, value2: 60 }] })
    const out = evaluateScreen([row('IN', { rsi: 40 }), row('OUT', { rsi: 61 })], def)
    expect(out.find((r) => r.symbol === 'IN').why).toEqual(['RSI 40.0 in 40.0–60.0'])
    expect(out.find((r) => r.symbol === 'OUT').matched).toBe(false)
  })

  it('is pure — no storage, no mutation of the rows it was handed', () => {
    const input = [row('AAA', { rsi: 28, volRatio: 2.1 })]
    const snapshot = JSON.stringify(input)
    evaluateScreen(input, OVERSOLD)
    expect(JSON.stringify(input)).toBe(snapshot)
    expect(localStorage.getItem('screen_defs_v1')).toBe(null)
  })
})

describe('entry diff and alert bridge', () => {
  const results = [
    { symbol: 'AAA', matched: true },
    { symbol: 'BBB', matched: true },
    { symbol: 'CCC', matched: false },
  ]

  it('reports only symbols that newly entered the screen', () => {
    expect(matchedSymbols(results)).toEqual(['AAA', 'BBB'])
    expect(screenEntrants(['AAA'], results)).toEqual(['BBB'])
    expect(screenEntrants(['AAA', 'BBB'], results)).toEqual([])
    expect(screenEntrants([], results)).toEqual(['AAA', 'BBB'])
  })

  it('a symbol that leaves and returns counts as a new entry', () => {
    expect(screenEntrants(['CCC'], results)).toEqual(['AAA', 'BBB'])
  })

  it('arms the closest single alert condition, preferring the rank field', () => {
    expect(alertSpecForEntry(OVERSOLD, 'AAA'))
      .toEqual({ symbol: 'AAA', type: 'rsi', operator: '<', value: 30, approx: true, from: 'rsi' })
    const volRanked = normalizeDef({ ...OVERSOLD, rankBy: 'volRatio' })
    expect(alertSpecForEntry(volRanked, 'AAA'))
      .toEqual({ symbol: 'AAA', type: 'volume', operator: '>', value: 1.5, approx: true, from: 'volRatio' })
  })

  it('maps SMA position onto a cross alert and marks a single-predicate screen exact', () => {
    const def = normalizeDef({ name: 'trend', predicates: [{ field: 'sma200', op: 'below' }], rankBy: 'rs' })
    expect(alertSpecForEntry(def, 'BBB'))
      .toEqual({ symbol: 'BBB', type: 'sma_cross', operator: '<', value: 200, approx: false, from: 'sma200' })
  })

  it('returns null when no predicate can be expressed as one alert', () => {
    const def = normalizeDef({ name: 'band', predicates: [{ field: 'offHigh', op: '<', value: -15 }] })
    expect(alertSpecForEntry(def, 'AAA')).toBe(null)
    expect(alertSpecForEntry(newScreenDef('blank'), 'AAA')).toBe(null)
  })
})

describe('screen universe', () => {
  const lists = [
    { id: 'semis', symbols: ['AMD', 'AAPL'] },
    { id: 'etfs', symbols: ['SPY', 'QQQ'] },
  ]

  it('defaults to the main board and nothing else', () => {
    const def = newScreenDef('blank')
    expect(def.sources).toEqual(['board'])
    expect(screenUniverse(def, ['AAPL', 'MSFT'], lists)).toEqual(['AAPL', 'MSFT'])
  })

  it('unions the selected named watchlists without duplicating a symbol', () => {
    const def = normalizeDef({ name: 'wide', sources: ['board', 'semis', 'etfs'] })
    expect(screenUniverse(def, ['AAPL', 'MSFT'], lists)).toEqual(['AAPL', 'MSFT', 'AMD', 'SPY', 'QQQ'])
  })

  it('ignores a source that no longer exists rather than throwing', () => {
    const def = normalizeDef({ name: 'stale', sources: ['deleted-list'] })
    expect(screenUniverse(def, ['AAPL'], lists)).toEqual([])
  })

  it('caps the universe so one screen cannot fan out the feed', () => {
    const big = Array.from({ length: MAX_UNIVERSE + 20 }, (_, i) => `S${i}`)
    expect(screenUniverse(newScreenDef('big'), big, lists)).toHaveLength(MAX_UNIVERSE)
  })

  it('keeps junk source ids out of the stored definition', () => {
    expect(normalizeDef({ name: 'x', sources: ['board', 'BAD ID', ''] }).sources).toEqual(['board'])
  })
})
