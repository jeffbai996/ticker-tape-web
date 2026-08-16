import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HELP_TEXT, parseCommand } from '../../src/lib/commands.js'
import { consoleHeightAt } from '../../src/lib/consoleResize.js'
import { parseRich } from '../../src/lib/rich.js'

const commandBar = readFileSync('src/components/CommandBar.jsx', 'utf8')
const plain = (text) => parseRich(text).map((span) => span.text).join('')

describe('console resize', () => {
  it('tracks pointer distance immediately and clamps to the viewport', () => {
    expect(consoleHeightAt(288, 500, 400, 1000)).toBe(388)
    expect(consoleHeightAt(288, 500, 900, 1000)).toBe(120)
    expect(consoleHeightAt(700, 500, 0, 800)).toBe(640)
  })

  it('mutates the console height during drag without a render or transition lag', () => {
    expect(commandBar).toContain("panel.style.height = `${next}px`")
    expect(commandBar).toContain("panel.style.maxHeight = `${next}px`")
    expect(commandBar).not.toContain('const move = (ev) => setConsoleH(')
    expect(commandBar).not.toContain('transition-[max-height] duration-200')
  })

  it('submits Enter explicitly instead of relying on implicit form behavior', () => {
    expect(commandBar).toContain("if (e.key === 'Enter')")
    expect(commandBar).toContain('e.currentTarget.form?.requestSubmit()')
  })
})

describe('ticker-tape-cli parity', () => {
  it('keeps the CLI section order and one-column command rail', () => {
    const text = plain(HELP_TEXT)
    const sections = [
      'KEYBOARD SHORTCUTS', 'COMMANDS', 'PORTFOLIO', 'IBKR', 'AI CHAT', 'OTHER',
    ]
    let cursor = -1
    for (const section of sections) {
      const next = text.indexOf(`═══ ${section} ═══`)
      expect(next).toBeGreaterThan(cursor)
      cursor = next
    }
    expect(text).toContain('m, market'.padEnd(28) + 'Market overview')
    expect(text).not.toContain('research\n')
  })

  it('accepts CLI aliases where an equivalent web surface exists', () => {
    expect(parseCommand('i MU')).toEqual({ type: 'nav', hash: '#/research/mu/intraday' })
    expect(parseCommand('chain MU')).toEqual({ type: 'nav', hash: '#/research/mu/options' })
    expect(parseCommand('scr')).toEqual({ type: 'nav', hash: '#/screen' })
    expect(parseCommand('cm')).toEqual({ type: 'nav', hash: '#/markets/commodities' })
    expect(parseCommand('risk')).toEqual({ type: 'nav', hash: '#/portfolio/cockpit' })
    expect(parseCommand('tt')).toEqual({ type: 'nav', hash: '#/portfolio/timetravel' })
    expect(parseCommand('tw')).toEqual({ type: 'nav', hash: '#/portfolio/thesis' })
    expect(parseCommand('morning')).toEqual({ type: 'nav', hash: '#/brief' })
    expect(parseCommand('news')).toEqual({ type: 'nav', hash: '#/wire' })
    expect(parseCommand('news MU')).toEqual({ type: 'nav', hash: '#/research/mu/news' })
    expect(parseCommand('wire story 42')).toEqual({ type: 'nav', hash: '#/wire/42' })
  })
})
