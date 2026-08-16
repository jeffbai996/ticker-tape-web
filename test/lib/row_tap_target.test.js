import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = fs.readFileSync('src/pages/dashboard.jsx', 'utf8')

describe('watchlist row: touch identity', () => {
  it('binds the first-tap reveal only to the ticker glyphs', () => {
    expect(src).toContain(
      '<span data-ticker-reveal-target class="tui-company-symbol shrink-0" onClick={onIdentityTap}>{symbol}</span>')
    expect(src).not.toContain("matchMedia('(hover: none)').matches")
    expect(src).toContain("identityRef.current?.querySelector('[data-inline-name]')")
    expect(src).toContain('onReveal?.(symbol)')
  })

  it('leaves the elastic identity slot and the rest of the row navigation alone', () => {
    expect(src).toContain(
      'data-inline-name class="hidden @min-[545px]:block @min-[820px]:hidden min-w-0"')
    const slot = src.slice(src.indexOf('<span ref={identityRef}'))
    const openTag = slot.slice(0, slot.indexOf('>') + 1)
    expect(openTag).not.toContain('onClick')
    expect(src).not.toContain('onClick={onIdentityTap} class="tui-row')
    expect(src).toContain('href={`#/research/${symbol.toLowerCase()}`}')
    expect(src).toContain('data-row-link="ticker-overview"')
    expect(src).toContain('flex-nowrap min-w-0')
    expect(src).not.toContain('flex-nowrap max-sm:flex-wrap min-w-0')
  })

  it('reveals once, then lets the second ticker tap navigate', () => {
    expect(src).toContain('if (selecting || revealed || !q?.name')
    expect(src).toContain('e.preventDefault()')
    expect(src).toContain('e.stopPropagation()')
    expect(src).toContain('const [revealedSym, setRevealedSym] = useState(null)')
    expect(src).toContain('const revealName = (sym) => setRevealedSym(sym)')
    expect(src).toMatch(/revealed=\{revealedSym === s\}\s+onReveal=\{revealName\}/)
    expect(src).toMatch(/revealed=\{revealedSym === symbol\}\s+onReveal=\{revealName\}/)
  })
})
