/** The status-row clock cycles the timezone on click, but it was painted as
 *  plain amber text sitting next to plain amber text — nothing said it could
 *  be pressed. It now wears the house `board-control` chip. The rules that
 *  matter are the ones a later edit would quietly break: an edge at rest, no
 *  geometry change under the pointer, amber as the only accent, and no
 *  dependence on the feed chip being rendered to keep its spacing. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/components/StatusBar.jsx', 'utf8')

/** The clock button's class attribute, isolated from the rest of the bar. */
const clockClass = (() => {
  const at = source.indexOf('title={tl(\'cycle timezone\')}')
  const before = source.slice(0, at)
  const open = before.lastIndexOf('class="')
  return before.slice(open + 'class="'.length, before.indexOf('"', open + 7))
})()

describe('the timezone clock reads as a control', () => {
  it('wears the house board-control chip with a real border at rest', () => {
    expect(clockClass).toContain('board-control')
    expect(clockClass).toMatch(/\bborder\b/)
  })

  it('changes nothing but colour on hover — no box growing under the pointer', () => {
    // an outline or a hover-only border used to be the shortcut here; both
    // move the row (or, with outline, paint outside it) on a 32px header
    expect(clockClass).not.toContain('hover:outline')
    expect(clockClass).toContain('transition-colors')
    for (const shifty of ['hover:p', 'hover:m', 'hover:border-2', 'hover:text-[']) {
      expect(clockClass).not.toContain(shifty)
    }
  })

  it('keeps the accent amber and never borrows the market colours', () => {
    expect(clockClass).toContain('hover:border-accent/50')
    expect(clockClass).not.toContain('text-up')
    expect(clockClass).not.toContain('text-down')
  })

  it('stays on one line at any width', () => {
    expect(clockClass).toContain('whitespace-nowrap')
  })

  it('carries its own left gap instead of leaning on the feed chip', () => {
    // FeedIndicator renders nothing while the feed is healthy, and the index
    // strip to its left is a scroll container that can end flush at its edge
    expect(clockClass).toMatch(/\bml-1\b/)
  })

  it('pads evenly, so the online dot sits centred between chip and locale', () => {
    // the phone-only pr-0 existed because a borderless clock made the eye
    // measure from the "ET" glyph; with an edge to measure from it is wrong
    expect(clockClass).not.toContain('pr-0')
    expect(clockClass).toContain('px-1.5')
  })
})
