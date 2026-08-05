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
})
