/** The status-row clock cycles the timezone on click, but it was painted as
 *  plain amber text sitting next to plain amber text — nothing said it could
 *  be pressed. It now wears the house `board-control` chip.
 *
 *  This used to be a source-string contract: find `title={tl('cycle
 *  timezone')}` in StatusBar.jsx, walk backwards to the nearest `class="`,
 *  and match substrings of whatever came out. That scan pinned the ORDER of
 *  the class list and the order of the JSX attributes — reordering either,
 *  which changes nothing a reader can see, broke the file. It also could not
 *  see the one thing worth guarding: that clicking the chip actually cycles
 *  the zone.
 *
 *  So it renders the bar and reads the button. The rules that matter are the
 *  ones a later edit would quietly break: it is a real control, it cycles and
 *  remembers, it has an edge at rest, no geometry moves under the pointer,
 *  amber is the only accent, and it does not lean on the feed chip for its
 *  spacing.
 */
import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOCK_ZONES } from '../../src/lib/rollclock.js'
import { StatusBar } from '../../src/components/StatusBar.jsx'

// The bar's index strip is the only part that wants the feed; the clock does
// not. Stub the one hook so mounting the header never opens a socket.
vi.mock('../../src/hooks.js', async (importOriginal) => ({
  ...await importOriginal(),
  useQuotes: () => ({}),
}))

// Preact flushes effects after paint — via requestAnimationFrame where the
// host has one, else a 100ms timeout. jsdom has neither, so install a rAF that
// fires on the next macrotask (same shim as overlay.test.js) and a short flush
// lands the effects deterministically.
const flush = () => new Promise((resolve) => setTimeout(resolve, 40))
let host = null
let hadRaf = null

beforeEach(() => {
  hadRaf = globalThis.requestAnimationFrame
  if (typeof hadRaf !== 'function') {
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  }
  localStorage.clear()
  document.body.innerHTML = '<div id="host"></div>'
  host = document.getElementById('host')
})

afterEach(() => {
  render(null, host)
  document.body.innerHTML = ''
  localStorage.clear()
  if (typeof hadRaf !== 'function') {
    delete globalThis.requestAnimationFrame
    delete globalThis.cancelAnimationFrame
  }
})

/** Mount the status bar and hand back its timezone chip. */
async function clock() {
  render(h(StatusBar, {}), host)
  await flush()
  return host.querySelector('[title="cycle timezone"]')
}

/** The zone abbreviation the chip is currently showing. Direct child only —
 *  the rolling clock face nests a span per digit inside the chip. */
const zoneLabel = (button) => button.querySelector(':scope > span:last-child').textContent.trim()

describe('the timezone clock is a control, not a caption', () => {
  it('renders as a button so a keyboard reaches it at all', async () => {
    const button = await clock()
    expect(button).not.toBeNull()
    expect(button.tagName).toBe('BUTTON')
  })

  it('cycles the zone on every click and wraps back to the first', async () => {
    const button = await clock()
    expect(zoneLabel(button)).toBe('ET')
    for (let i = 1; i <= CLOCK_ZONES.length; i++) {
      button.click()
      await flush()
      expect(zoneLabel(button)).toBe(CLOCK_ZONES[i % CLOCK_ZONES.length].label)
    }
  })

  it('remembers the chosen zone for the next visit', async () => {
    const button = await clock()
    button.click()
    await flush()
    expect(localStorage.getItem('tape-clock-tz')).toBe(CLOCK_ZONES[1].id)

    render(null, host)
    const reopened = await clock()
    expect(zoneLabel(reopened)).toBe(CLOCK_ZONES[1].label)
  })
})

describe('the timezone clock stays aligned and quiet', () => {
  // classList, not a substring of the source: these are the rules, and the
  // order they happen to be written in is not one of them
  let cls = null
  beforeEach(async () => { cls = (await clock()).classList })

  it('rests borderless and reveals the border on hover (Jeff 2026-08-20: the affordance animates in, it does not sit there)', () => {
    expect(cls.contains('board-control')).toBe(false)
    expect(cls.contains('border')).toBe(true)
    expect(cls.contains('border-transparent')).toBe(true)   // invisible at rest
    expect(cls.contains('hover:border-line-2')).toBe(true)  // visible under the pointer
    expect(cls.contains('transition-colors')).toBe(true)    // and it animates in
    expect(cls.contains('rounded')).toBe(true)
    expect(cls.contains('cursor-pointer')).toBe(true)
  })

  it('uses the same explicit row-control height without padding inflating it', () => {
    expect(cls.contains('h-5')).toBe(true)
    expect(cls.contains('py-0')).toBe(true)
  })

  it('changes nothing but colour on hover — no box growing under the pointer', () => {
    // an outline or a hover-only border used to be the shortcut here; both
    // move the row (or, with outline, paint outside it) on a 32px header
    expect(cls.contains('transition-colors')).toBe(true)
    expect(cls.contains('hover:border-2')).toBe(false)
    expect([...cls].filter((c) => /^hover:(outline|p|m|text-\[)/.test(c))).toEqual([])
  })

  it('keeps the accent amber and never borrows the market colours', () => {
    expect(cls.contains('hover:border-line-2')).toBe(true)
    expect(cls.contains('hover:border-accent/50')).toBe(false)
    expect(cls.contains('text-up')).toBe(false)
    expect(cls.contains('text-down')).toBe(false)
  })

  it('stays on one line at any width', () => {
    expect(cls.contains('whitespace-nowrap')).toBe(true)
  })

  it('spacing belongs to the right-cluster GROUP now, not the clock (Jeff 2026-08-21: balance + symmetry)', () => {
    // clock · dot · locale sit in one flex group at a uniform gap; the clock
    // stopped carrying its own junction margin
    expect(cls.contains('ml-1')).toBe(false)
    expect(cls.contains('-ml-2.5')).toBe(false)
  })

  it('pads tight and evenly — the saved slack goes to the tape strip', () => {
    expect(cls.contains('pr-0')).toBe(false)
    expect(cls.contains('px-1')).toBe(true)
    expect(cls.contains('px-1.5')).toBe(false)
  })
})
