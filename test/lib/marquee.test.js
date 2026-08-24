import { describe, expect, it } from 'vitest'
import { marqueeCopies, preservedMarqueeTime } from '../../src/lib/marquee.js'

describe('marqueeCopies', () => {
  it('keeps one complete spare cycle beyond the viewport', () => {
    expect(marqueeCopies(390, 100)).toBe(5)
    expect(marqueeCopies(390, 500)).toBe(2)
  })

  it('falls back to two cycles until the belt is measurable', () => {
    expect(marqueeCopies(390, 0)).toBe(2)
    expect(marqueeCopies(0, 100)).toBe(2)
  })

  it('keeps the belt at the same elapsed point when its cycle is remeasured', () => {
    expect(preservedMarqueeTime(47_500, 30_000)).toBe(17_500)
    expect(preservedMarqueeTime(7_250, 30_000)).toBe(7_250)
    expect(preservedMarqueeTime(null, 30_000)).toBeNull()
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

describe('tap-to-sweep on every truncated name (Jeff 2026-08-17)', () => {
  it('Marquee sweeps on tap as well as hover, and the truncated-name sites use it', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')
    const mq = src('src/components/Marquee.jsx')
    expect(mq).toMatch(/onClick=\{/)                       // tap sweeps
    expect(mq).toMatch(/onMouseEnter=\{start\}/)           // hover still sweeps
    // research header company name is a Marquee, not a shrink-0 nowrap span
    const { researchSource } = await import('./researchSource.js')
    const research = researchSource()
    const at = research.indexOf('data-research-company-name')
    const tagStart = research.lastIndexOf('<', at)
    const tagEnd = research.indexOf('/>', at)
    const tag = research.slice(tagStart, tagEnd)
    expect(tag).toMatch(/^<Marquee/)
    expect(tag).not.toMatch(/shrink-0 whitespace-nowrap/)
    // sector-strip / holdings / list-name sites on the dashboard use Marquee
    const dash = src('src/pages/dashboard.jsx')
    for (const marker of ['{h.name}', '{r.name}', '{activeList.name}']) {
      // every raw-render of these names must be gone
      expect(dash, marker).not.toMatch(new RegExp('truncate[^>]*>\\s*' + marker.replace(/[{}.]/g, '\\$&')))
    }
    // brief archive title + model name
    const brief = src('src/pages/brief.jsx')
    expect(brief).not.toMatch(/truncate">\{r\.title\}/)
    expect(brief).not.toMatch(/truncate[^>]*>\{m\.name\}/)
  })
})
