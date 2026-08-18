import { describe, expect, it } from 'vitest'
import { marqueeCopies } from '../../src/lib/marquee.js'

describe('marqueeCopies', () => {
  it('keeps one complete spare cycle beyond the viewport', () => {
    expect(marqueeCopies(390, 100)).toBe(5)
    expect(marqueeCopies(390, 500)).toBe(2)
  })

  it('falls back to two cycles until the belt is measurable', () => {
    expect(marqueeCopies(390, 0)).toBe(2)
    expect(marqueeCopies(0, 100)).toBe(2)
  })
})

describe('auto marquee for the mobile ticker-name reveal', () => {
  it('Marquee accepts `auto` and the revealed company name uses it, so a long name (NAURA Technology…) sweeps instead of sitting truncated (Jeff 2026-08-17)', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const mq = readFileSync(resolve(process.cwd(), 'src/components/Marquee.jsx'), 'utf8')
    const dash = readFileSync(resolve(process.cwd(), 'src/pages/dashboard.jsx'), 'utf8')
    // prop exists and drives a start-on-mount effect that sweeps out and back
    expect(mq).toMatch(/auto\s*=\s*false/)
    expect(mq).toMatch(/is-scrolling/)
    expect(mq).toMatch(/is-returning|sweep back|and back/)
    // the narrow-band swap span renders a Marquee with auto, not raw text
    const swap = dash.slice(dash.indexOf('tui-company-name-swap'), dash.indexOf('tui-company-name-swap') + 400)
    expect(swap).toMatch(/<Marquee[^>]*\bauto\b/)
    expect(swap).not.toMatch(/>\s*\{q\.name\}\s*<\/span>/)
  })
})
