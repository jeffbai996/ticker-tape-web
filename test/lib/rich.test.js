import { describe, expect, it } from 'vitest'
import { parseRich, TUI } from '../../src/lib/rich.js'

describe('parseRich — the TUI markup subset', () => {
  it('parses nested color + bold spans', () => {
    const s = parseRich('plain [bold #00c8ff]cmd[/] and [dim]note[/]')
    expect(s).toEqual([
      { text: 'plain ' },
      { text: 'cmd', bold: true, color: '#00c8ff' },
      { text: ' and ' },
      { text: 'note', dim: true },
    ])
  })

  it('maps rich named colors to the TUI palette', () => {
    const s = parseRich('[green]+1.2%[/][red]-3%[/]')
    expect(s[0].color).toBe(TUI.positive)
    expect(s[1].color).toBe(TUI.negative)
  })

  it('passes unknown bracket text through literally', () => {
    const s = parseRich('array[0] and [weird tag] stay')
    expect(s.map((x) => x.text).join('')).toBe('array[0] and [weird tag] stay')
  })

  it('honors escaped brackets like the CLI help does', () => {
    expect(parseRich('\\[TICKER]').map((x) => x.text).join('')).toBe('[TICKER]')
  })

  it('inherits outer style inside nested tags', () => {
    const s = parseRich('[bold #ffc800]a[dim]b[/]c[/]')
    expect(s[1]).toMatchObject({ text: 'b', bold: true, dim: true })
    expect(s[2]).toMatchObject({ text: 'c', bold: true, color: '#ffc800' })
  })
})
