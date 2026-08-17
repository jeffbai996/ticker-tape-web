import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HELP_TEXT, parseCommand } from '../../src/lib/commands.js'
import { consoleHeightAt, nextConsolePosture, isTap } from '../../src/lib/consoleResize.js'
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

  it('a tap on the grab bar cycles postures; a drag does not (Jeff 2026-08-17)', () => {
    // compact peek → the stored height → tall → back to compact
    expect(nextConsolePosture('compact', { stored: 288, viewport: 1000 })).toEqual({ posture: 'stored', height: 288 })
    expect(nextConsolePosture('stored', { stored: 288, viewport: 1000 })).toEqual({ posture: 'tall', height: 800 })
    expect(nextConsolePosture('tall', { stored: 288, viewport: 1000 })).toEqual({ posture: 'compact', height: 110 })
    // if the stored height already IS tall, skip the duplicate stop
    expect(nextConsolePosture('compact', { stored: 800, viewport: 1000 })).toEqual({ posture: 'tall', height: 800 })
    // tap = pointer barely moved between down and up
    expect(isTap(500, 503)).toBe(true)
    expect(isTap(500, 520)).toBe(false)
  })

  it('the / hint sits before the prompt, and there is no "console ▴" reopener (Jeff 2026-08-17: invisible bottom-right)', () => {
    const promptIdx = commandBar.indexOf('font-bold shrink-0">ticker&gt;</span>')
    const hintIdx = commandBar.indexOf("title={tl('focus console')}")
    expect(hintIdx).toBeGreaterThan(-1)
    expect(hintIdx).toBeLessThan(promptIdx)
    expect(commandBar).not.toMatch(/console ▴/)
  })

  it('submits Enter explicitly instead of relying on implicit form behavior', () => {
    expect(commandBar).toContain("if (e.key === 'Enter')")
    expect(commandBar).toContain('e.currentTarget.form?.requestSubmit()')
  })
})

describe('ticker-tape-cli parity', () => {
  it('uses the wide terminal for the compact two-column help register', () => {
    const text = plain(HELP_TEXT)
    const sections = ['research', 'screens', 'actions', 'notes', 'console']
    let cursor = -1
    for (const section of sections) {
      const next = text.indexOf(`═══ ${section} ═══`)
      expect(next).toBeGreaterThan(cursor)
      cursor = next
    }
    expect(text).toContain(
      'SYM'.padEnd(18) + 'open research'.padEnd(24)
      + 'ta|chart SYM'.padEnd(18) + 'chart + technicals',
    )
    expect(text).not.toContain('KEYBOARD SHORTCUTS')
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
