import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const src = fs.readFileSync('src/pages/wire.jsx', 'utf8')

describe('wire workbench sizing', () => {
  it('pins the desktop workspace and scrolls the feed instead of the page', () => {
    expect(src).toContain('data-wire-workbench')
    expect(src).toContain('h-full min-h-0 overflow-hidden max-xl:overflow-y-auto')
    expect(src).toContain('flex-1 min-h-0 gap-2 items-stretch max-xl:flex-col')
    expect(src).toContain('data-wire-feed')
    expect(src).toContain('overflow-y-auto overscroll-contain')
  })

  it('keeps the rail independently scrollable on desktop', () => {
    expect(src).toContain('data-wire-rail')
    expect(src).toContain('min-h-0 overflow-y-auto overscroll-contain')
  })

  it('grows the rail fluidly and stacks it before zoom can clip widgets', () => {
    expect(src).toContain('w-[clamp(260px,24vw,340px)]')
    expect(src).toContain('max-xl:w-full max-xl:overflow-visible')
    expect(src).toContain('max-xl:flex-col max-xl:flex-none')
  })

  it('uses source credibility pips instead of a repetitive NWS column', () => {
    expect(src).toContain('data-wire-credibility')
    expect(src).not.toContain("TYPE_CODE[ev.type] || String(ev.type).slice(0, 3).toUpperCase()")
    expect(src.match(/<CredPips ev=\{ev\} hot=\{hot\}/g)).toHaveLength(1)
  })

  it('puts earnings facts before release prose in expanded rows', () => {
    expect(src.indexOf("Object.keys(ev.numbers || {}).length > 0"))
      .toBeLessThan(src.indexOf("body && <p"))
  })
})
