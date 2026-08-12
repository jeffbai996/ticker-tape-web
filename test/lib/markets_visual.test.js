import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const markets = readFileSync(resolve(process.cwd(), 'src/pages/markets.jsx'), 'utf8')

describe('market overview visual column', () => {
  it('has one whole-board picker with a conditional history window', () => {
    expect(markets).toContain('function MarketVisualPicker')
    expect(markets).toContain('aria-label={tl(\'Row visual\')}')
    expect(markets).toContain('MARKET_VISUALS.map')
    expect(markets).toContain('MARKET_VISUAL_WINDOWS.map')
    expect(markets).toContain("visual !== 'session' && visual !== 'off'")
  })

  it('replaces both fixed tail cells with the selected visual', () => {
    expect(markets).toContain('function MarketVisual')
    expect(markets).toContain('<DayMeter q={q} />')
    expect(markets).toContain('<Spark type={visual}')
    expect(markets).toContain('<MarketVisual visual={visual} window={visualWindow}')
    // Commodities keeps its existing two-column tail; this picker is scoped to
    // the overview shown in the report rather than silently redesigning tabs.
    expect(markets).toContain('visual == null ? (')
  })

  it('makes the session meter readable without relying on its tooltip', () => {
    expect(markets).toContain('aria-label={title}')
    expect(markets).toContain("{tl('Lo')}")
    expect(markets).toContain("{tl('Hi')}")
    expect(markets).toContain('w-[88px]')
  })
})
