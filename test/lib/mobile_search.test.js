import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')

// Jeff 2026-08-17: "when user taps search [on mobile] it should open a search
// modal kinda like a spotlight … can take up to the whole page" and "the text
// within the search bar is too large — make sure we don't have that going
// forward" (the iOS <16px focus-zoom + the 16px form-control guard inflating a
// 10px control).
describe('mobile spotlight search', () => {
  const palette = src('src/components/Palette.jsx')
  const dash = src('src/pages/dashboard.jsx')
  const app = src('src/app.jsx')

  it('the palette is a full-screen sheet on phone with a 16px input (no iOS focus zoom)', () => {
    // sheet: edge-to-edge on small screens, the desktop card layout only from sm:
    expect(palette).toMatch(/max-sm:inset-0|max-sm:h-full|max-sm:rounded-none/)
    // the input never goes below 16px on phone — that is the zoom threshold
    expect(palette).toMatch(/text-\[16px\]|text-base/)
    // an explicit close affordance for touch (Esc has no key on a phone)
    expect(palette).toMatch(/aria-label=\{tt\('palette\.close'\)\}|aria-label="close"/i)
  })

  it('tapping the dashboard toolbar search on phone opens the palette instead of expanding inline', () => {
    // a global open event the shell listens for, seeded with any typed text
    expect(app).toMatch(/addEventListener\('open-palette'/)
    expect(dash).toMatch(/dispatchEvent\(new CustomEvent\('open-palette'/)
    // and the palette accepts a seed query
    expect(palette).toMatch(/seed/)
  })

  it('there is no sub-16px text on the phone search control itself', () => {
    const at = dash.indexOf('board-search')
    const cls = dash.slice(at, at + 700)
    // phone: the control is a button-like trigger, so its own text size is moot,
    // but it must not carry a small font that the guard then inflates
    expect(cls).toMatch(/max-sm:text-\[16px\]|max-sm:text-base/)
  })
})
