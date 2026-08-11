import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

/** The name-reveal tap target.
 *
 *  The identity slot is `flex-1 min-w-0` so it can absorb the row's spare
 *  width, which means its BOX extends well to the right of the ticker glyphs.
 *  With the handler on that slot, tapping the empty space beside a short
 *  ticker expanded the company name over the price (Jeff 2026-08-11: "only
 *  expand the name if the user clicks on the ticker letters area, not the area
 *  to the right of it").
 *
 *  The symbol span is `shrink-0`, so it is exactly as wide as the letters it
 *  draws — that is the only correct target. Asserted against the source
 *  because this is a layout/binding relationship, not a pure function.
 */
const src = fs.readFileSync('src/pages/dashboard.jsx', 'utf8')

describe('watchlist row: name-reveal tap target', () => {
  it('binds the reveal to the ticker glyphs', () => {
    expect(src).toContain(
      '<span class="tui-company-symbol shrink-0" onClick={onIdentityTap}>{symbol}</span>')
  })

  it('does not bind the reveal to the elastic identity slot', () => {
    // The slot keeps the ref (the handler reads it to find the inline name),
    // but must not carry the click itself.
    const slot = src.slice(src.indexOf('<span ref={identityRef}'))
    const openTag = slot.slice(0, slot.indexOf('>') + 1)
    expect(openTag).toContain('ref={identityRef}')
    expect(openTag).not.toContain('onClick')
  })

  it('keeps the ref the handler depends on', () => {
    // onIdentityTap queries identityRef for [data-inline-name] to decide
    // whether a reveal is even needed — losing the ref would make every tap
    // reveal, including on layouts where the name is already visible.
    expect(src).toContain("identityRef.current?.querySelector('[data-inline-name]')")
  })
})
