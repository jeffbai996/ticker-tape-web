import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { INDICES } from '../../src/lib/symbols.js'

const source = readFileSync('src/components/StatusBar.jsx', 'utf8')

describe('status bar responsive labels', () => {
  it('covers the major cross-asset macro gauges', () => {
    expect(INDICES).toEqual(expect.arrayContaining([
      { symbol: 'CL=F', label: 'WTI' },
      { symbol: 'NG=F', label: 'GAS' },
      { symbol: 'SI=F', label: 'SILVER' },
      { symbol: '^HSI', label: 'HSI' },
      { symbol: '^N225', label: 'N225' },
      { symbol: '^KS11', label: 'KOSPI' },
      { symbol: '000001.SS', label: 'SSE' },
      { symbol: 'BZ=F', label: 'BRENT' },
      { symbol: 'HG=F', label: 'COPPER' },
      { symbol: 'BTC-USD', label: 'BTC' },
    ]))
    expect(new Set(INDICES.map(({ symbol }) => symbol)).size).toBe(INDICES.length)
  })

  it('shows S&P only on mobile and retains S&P 500 on desktop', () => {
    expect(source).toContain("label === 'S&P 500'")
    expect(source).toContain('class="md:hidden">S&P</span>')
    expect(source).toContain('class="max-md:hidden">{tl(label)}</span>')
  })

  it('pins the clock and locale controls to the same row height', () => {
    expect(source).toContain('data-status-clock')
    expect(source).toContain('data-status-locale')
    expect(source).toContain('data-status-clock\n      class="h-5')
    expect(source).toContain('data-status-locale')
    expect(source).toMatch(/data-status-locale\s+class="h-5/)
  })

  it('subtly lifts the clock on hover and keyboard focus', () => {
    expect(source).toContain('hover:border-line-2')
    expect(source).toContain('hover:bg-white/[0.045]')
    expect(source).toContain('focus-visible:border-line-2')
    expect(source).toContain('focus-visible:bg-white/[0.045]')
  })
})
