import { describe, it, expect } from 'vitest'
import { techBadges, histoBars } from '../../src/lib/badges.js'
import { pulseStats } from '../../src/lib/pulse.js'
import { parseCommand } from '../../src/lib/commands.js'

describe('techBadges', () => {
  // 250 rising closes: above both SMAs, at the 52w high, RSI pegged high
  const rising = Array.from({ length: 250 }, (_, i) => 100 + i)
  const vols = Array.from({ length: 250 }, () => 1000)

  it('flags SMAs, off-high, and vol ratio', () => {
    const b = techBadges({ closes: rising, volumes: [...vols.slice(0, 249), 2000] })
    expect(b.above50).toBe(true)
    expect(b.above200).toBe(true)
    expect(b.offHigh).toBeCloseTo(0)
    expect(b.volRatio).toBeCloseTo(2)
    expect(b.rsi).toBeGreaterThan(70)
  })

  it('computes RS as own 20d return minus benchmark 20d return', () => {
    // symbol +10% over 20d, bench flat → rs ≈ +10
    const closes = [...Array(230).fill(100), ...Array.from({ length: 21 }, (_, i) => 100 * (1 + 0.1 * (i / 20)))]
    const bench = Array(251).fill(500)
    const b = techBadges({ closes, volumes: vols }, bench)
    expect(b.rs).toBeCloseTo(10, 1)
  })

  it('omits RS without a benchmark and survives short series', () => {
    expect(techBadges({ closes: rising, volumes: vols }).rs).toBeNull()
    const short = techBadges({ closes: [1, 2, 3], volumes: [1, 2, 3] })
    expect(short.above200).toBeNull()
    expect(short.volRatio).toBeNull()
    expect(techBadges({ closes: [], volumes: [] })).toBeNull()
  })
})

describe('histoBars', () => {
  it('colors bars by close direction and carries volume', () => {
    const bars = [
      { close: 10, open: 9, volume: 100 },
      { close: 12, volume: 200 },
      { close: 11, volume: 150 },
    ]
    const h = histoBars(bars, 40)
    expect(h).toHaveLength(3)
    expect(h[0].up).toBe(true)   // close ≥ open on first bar
    expect(h[1]).toEqual({ v: 200, up: true })
    expect(h[2]).toEqual({ v: 150, up: false })
  })

  it('takes only the last n bars', () => {
    const bars = Array.from({ length: 60 }, (_, i) => ({ close: i, volume: 1 }))
    expect(histoBars(bars, 40)).toHaveLength(40)
  })
})

describe('pulseStats', () => {
  const q = (symbol, pct, extPct = null) => ({ symbol, pct, extPct })

  it('computes breadth, extremes, and dispersion', () => {
    const s = pulseStats([q('A', 4), q('B', -2), q('C', 0.5), q('D', -3.5, 1.2)])
    expect(s.adv).toBe(2)
    expect(s.dec).toBe(2)
    expect(s.hi).toEqual({ symbol: 'A', pct: 4 })
    expect(s.lo).toEqual({ symbol: 'D', pct: -3.5 })
    expect(s.spread).toBeCloseTo(7.5)
    expect(s.stress).toBe(1)          // ≤ -3%
    expect(s.movers).toBe(2)          // |pct| > 2, strictly — B at -2 doesn't count
    expect(s.flat).toBe(1)            // |pct| < 1
    expect(s.greenPct).toBeCloseTo(50)
    expect(s.extAdv).toBe(1)
    expect(s.median).toBeCloseTo((0.5 + -2) / 2)
    expect(s.sigma).toBeGreaterThan(0)
  })

  it('returns null with no priced quotes', () => {
    expect(pulseStats([{ symbol: 'X', pct: null }])).toBeNull()
  })
})

describe('parseCommand', () => {
  it('routes bare symbols and per-symbol views', () => {
    expect(parseCommand('nvda')).toEqual({ type: 'nav', hash: '#/research/nvda' })
    expect(parseCommand('ta MSFT')).toEqual({ type: 'nav', hash: '#/research/msft' })
    expect(parseCommand('intra spy')).toEqual({ type: 'nav', hash: '#/research/spy/intraday' })
    expect(parseCommand('ei jpm')).toEqual({ type: 'nav', hash: '#/research/jpm/earnings' })
    expect(parseCommand('an aapl')).toEqual({ type: 'nav', hash: '#/research/aapl/analysts' })
  })

  it('handles navigation shortcuts', () => {
    expect(parseCommand('m')).toEqual({ type: 'nav', hash: '#/markets' })
    expect(parseCommand('er')).toEqual({ type: 'nav', hash: '#/markets/earnings' })
    expect(parseCommand('pos')).toEqual({ type: 'nav', hash: '#/portfolio' })
  })

  it('parses watch/unwatch and alerts', () => {
    expect(parseCommand('w shop')).toEqual({ type: 'watch', symbol: 'SHOP' })
    expect(parseCommand('uw shop')).toEqual({ type: 'unwatch', symbol: 'SHOP' })
    expect(parseCommand('alert msft > 500')).toEqual({ type: 'alert', symbol: 'MSFT', operator: '>', value: 500 })
    expect(parseCommand('alert msft >500')).toEqual({ type: 'alert', symbol: 'MSFT', operator: '>', value: 500 })
    expect(parseCommand('alert')).toEqual({ type: 'nav', hash: '#/alerts' })
    expect(parseCommand('alert junk').type).toBe('msg')
  })

  it('parses vs/screen into symbol sets', () => {
    expect(parseCommand('vs nvda amd')).toEqual({ type: 'screen', symbols: ['NVDA', 'AMD'], view: 'compare' })
    expect(parseCommand('screen aapl msft')).toEqual({ type: 'screen', symbols: ['AAPL', 'MSFT'], view: 'valuation' })
  })

  it('passes chat questions through', () => {
    expect(parseCommand('chat what moved semis today')).toEqual({ type: 'chat', q: 'what moved semis today' })
    expect(parseCommand('chat')).toEqual({ type: 'nav', hash: '#/chat' })
  })

  it('returns null on junk and msg on help/quit', () => {
    expect(parseCommand('')).toBeNull()
    expect(parseCommand('!!!')).toBeNull()
    expect(parseCommand('help').type).toBe('msg')
    expect(parseCommand('q').type).toBe('msg')
  })
})
