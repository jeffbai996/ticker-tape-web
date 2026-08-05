import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboard = readFileSync(resolve(process.cwd(), 'src/pages/dashboard.jsx'), 'utf8')
const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')

describe('compact dashboard company name', () => {
  it('keeps a non-reflowing hover and keyboard-focus reveal beside the ticker', () => {
    expect(dashboard).toContain('class="tui-row group/row')
    expect(dashboard).toContain('class="tui-company-name-peek @min-[820px]:hidden"')
    expect(dashboard).toContain('aria-hidden="true"')
    expect(dashboard).toContain('class="tui-company-name-wide hidden @min-[820px]:block')
    expect(css).toContain('.tui-row:hover .tui-company-name-peek')
    expect(css).toContain('.tui-row:focus-visible .tui-company-name-peek')
    expect(css).toContain('position: absolute')
    expect(css).toContain('clip-path: inset(0 100% 0 0)')
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*\.tui-company-name-peek/)
  })
})
