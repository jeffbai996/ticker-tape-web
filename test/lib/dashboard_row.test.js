import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboard = readFileSync(resolve(process.cwd(), 'src/pages/dashboard.jsx'), 'utf8')
const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')

describe('compact dashboard company name', () => {
  it('swaps the ticker for the company name in the same fixed slot', () => {
    expect(dashboard).toContain('class="tui-row group/row')
    expect(dashboard).toContain('class="tui-company-identity relative w-14 max-sm:w-12 shrink-0')
    expect(dashboard).toContain('class="tui-company-symbol"')
    expect(dashboard).toContain('class="tui-company-name-swap @min-[820px]:hidden"')
    expect(dashboard).toContain('aria-hidden="true"')
    expect(dashboard).toContain('class="tui-company-name-wide hidden @min-[820px]:block')
    expect(css).toContain('.tui-row:hover .tui-company-symbol')
    expect(css).toContain('.tui-row:focus-visible .tui-company-name-swap')
    expect(css).toMatch(/\.tui-company-name-swap\s*\{[\s\S]*position: absolute;[\s\S]*inset: 0;/)
    expect(css).toMatch(/\.tui-company-identity\s*\{[\s\S]*overflow: hidden;/)
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*\.tui-company-name-swap/)
  })

  it('flashes the regular print as ticker-by-ticker updates land', () => {
    expect(dashboard).toContain('<FlashPrice price={q.price} fmt={fmtPrice} />')
    expect(readFileSync(resolve(process.cwd(), 'src/components/Fig.jsx'), 'utf8'))
      .toContain("document.addEventListener('visibilitychange', rebaseline)")
    expect(css).toContain('animation: tick-flash 1.35s')
  })

  it('fills the high-zoom regular-hours gap with a compact day range', () => {
    expect(dashboard).toContain('function CompactDayRange')
    expect(dashboard).toContain('hidden @min-[545px]:flex @min-[730px]:hidden')
    expect(dashboard).toContain('{!q?.extLabel && (')
    expect(dashboard).toContain('<CompactDayRange lo={q?.dayLow} hi={q?.dayHigh} v={q?.price} />')
  })

  it('keeps the richer day and 52-week ranges at lower browser zoom', () => {
    expect(dashboard).toContain('<RangeBar label="DAY"')
    expect(dashboard).toContain('<RangeBar label="52W"')
    expect(dashboard).toContain('hidden @min-[730px]:flex')
  })
})
