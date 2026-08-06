import { describe, expect, it } from 'vitest'
import { alignedReturns, regressStats } from '../../src/lib/regress.js'

const bars = (pairs) => pairs.map(([t, c]) => ({ t, c }))

describe('alignedReturns', () => {
  it('pairs same-day returns and skips unmatched days', () => {
    const a = bars([[1, 100], [2, 110], [3, 99], [4, 108.9]])
    const b = bars([[1, 50], [2, 51], [4, 53]])          // day 3 missing
    const out = alignedReturns(a, b)
    expect(out).toHaveLength(1)                          // only 1→2 is a shared consecutive pair
    expect(out[0][0]).toBeCloseTo(0.1)
    expect(out[0][1]).toBeCloseTo(0.02)
  })
})

describe('regressStats', () => {
  it('recovers a clean 2x beta with corr 1', () => {
    const pairs = [[0.02, 0.01], [-0.04, -0.02], [0.06, 0.03], [-0.02, -0.01]]
    const s = regressStats(pairs)
    expect(s.beta).toBeCloseTo(2, 5)
    expect(s.corr).toBeCloseTo(1, 5)
  })

  it('splits capture by benchmark direction', () => {
    // up days: stock 2x; down days: stock 0.5x
    const pairs = [[0.02, 0.01], [0.04, 0.02], [-0.005, -0.01], [-0.01, -0.02]]
    const s = regressStats(pairs)
    expect(s.upCapture).toBeCloseTo(200, 0)
    expect(s.downCapture).toBeCloseTo(50, 0)
  })

  it('returns null stats when there is nothing to regress', () => {
    expect(regressStats([])).toBeNull()
    expect(regressStats([[0.01, 0]])).toBeNull()         // zero benchmark variance
  })
})
