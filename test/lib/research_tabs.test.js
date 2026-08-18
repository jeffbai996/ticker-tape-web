/** The research tab strip and the speed keys that reach it.
 *
 *  This file used to pin the source text of `useResearchKeys` — the VIEWS
 *  array complete with its line break and indentation, the guard expression,
 *  and the index arithmetic — plus the JSX that prints the hint. Those
 *  assertions were re-pointed twice while the behaviour never changed (the
 *  lane moved a directory deeper, the array was rewrapped), and they still
 *  could not answer the only question that matters: does the key printed on a
 *  tab take you to that tab?
 *
 *  So it renders the header, reads the hint off each tab, and presses it. The
 *  keyboard and the strip are checked against each other rather than against
 *  a transcript of how they were written. What stays a string contract is the
 *  removal of dead code, where "this text is absent" IS the assertion.
 */
import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseHash } from '../../src/lib/route.js'
import { researchSource } from './researchSource.js'

// StaleQuoteTag reads the feed's last-good clock; the header is otherwise
// pure. Stub that one export so a test can decide how quiet the feed is.
const feed = vi.hoisted(() => ({ goodTs: 0 }))
vi.mock('../../src/lib/feed.js', async (importOriginal) => ({
  ...await importOriginal(),
  lastGoodTs: () => feed.goodTs,
}))

const { ResearchHeader } = await import('../../src/pages/research/header.jsx')
const { useResearchKeys } = await import('../../src/pages/research/useResearchKeys.js')

const SYMBOL = 'AAPL'
const WATCHLIST = ['AAPL', 'MSFT', 'GOOGL']

// Preact flushes effects after paint (rAF, else a 100ms fallback); jsdom has
// no rAF, so shim one and give the flush a macrotask to land in.
const flush = () => new Promise((resolve) => setTimeout(resolve, 40))
let host = null
let hadRaf = null

beforeEach(() => {
  hadRaf = globalThis.requestAnimationFrame
  if (typeof hadRaf !== 'function') {
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  }
  // Marquee measures the company name; jsdom ships no ResizeObserver
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  }
  localStorage.setItem('watchlist_v1', JSON.stringify(WATCHLIST))
  feed.goodTs = Date.now()
  location.hash = ''
  document.body.innerHTML = '<div id="host"></div>'
  host = document.getElementById('host')
})

afterEach(() => {
  render(null, host)
  document.body.innerHTML = ''
  location.hash = ''
  if (typeof hadRaf !== 'function') {
    delete globalThis.requestAnimationFrame
    delete globalThis.cancelAnimationFrame
  }
})

/** The header plus the key bindings the page installs alongside it. */
function ResearchProbe({ symbol, q, route }) {
  useResearchKeys(symbol, route)
  return h(ResearchHeader, { symbol, q, route })
}

async function mount({ symbol = SYMBOL, q = null, route = { view: null } } = {}) {
  render(h(ResearchProbe, { symbol, q, route }), host)
  await flush()
  return host
}

/** Every tab in the strip: the key it advertises, its label, its href. */
function tabs() {
  return [...host.querySelectorAll('a[href^="#/research/"]')].map((a) => {
    const spans = [...a.querySelectorAll('span')]
    const hint = spans.length > 1 ? spans[0].textContent.trim() : ''
    return {
      href: a.getAttribute('href'),
      key: hint.endsWith(')') ? hint.slice(0, -1) : null,
      label: spans[spans.length - 1].textContent.trim(),
    }
  })
}

const press = async (key, target = window) => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  await flush()
}

describe('research tab shortcuts', () => {
  it('sends every advertised key to the tab that advertises it', async () => {
    await mount()
    const strip = tabs()
    // ten digits and the key past them; anything beyond carries no hint
    expect(strip.length).toBeGreaterThanOrEqual(11)
    expect(strip.slice(0, 11).map((t) => t.key)).toEqual(
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'])

    for (const tab of strip.slice(0, 11)) {
      location.hash = ''
      await press(tab.key)
      expect(location.hash, `pressing ${tab.key} should open ${tab.label}`).toBe(tab.href)
    }
  })

  it('gives dividends the key past 0 rather than leaving it mouse-only', async () => {
    await mount()
    const dividends = tabs().find((t) => t.href.endsWith('/dividends'))
    expect(dividends).toBeDefined()
    expect(dividends.key).toBe('-')

    await press('-')
    expect(location.hash).toBe(`#/research/${SYMBOL.toLowerCase()}/dividends`)
  })

  it('ignores a key it has no tab for', async () => {
    await mount()
    location.hash = '#/research/aapl/options'
    await press('=')
    expect(location.hash).toBe('#/research/aapl/options')
  })

  it('never steals a keystroke from something being typed into', async () => {
    await mount()
    const input = document.createElement('input')
    document.body.appendChild(input)
    location.hash = '#/research/aapl'
    await press(']', input)
    await press('3', input)
    expect(location.hash).toBe('#/research/aapl')
  })

  it('keeps [ / ] cycling on whatever subview is open, dividends included', async () => {
    // the walk rebuilds the hash with the CURRENT view, so a tab only stays
    // put if route.js still recognises it
    await mount({ route: { view: 'dividends' } })
    await press(']')
    expect(location.hash).toBe('#/research/msft/dividends')
    expect(parseHash(location.hash)).toMatchObject({ sub: 'MSFT', view: 'dividends' })

    // the probe stays mounted on AAPL (the real page remounts on the new
    // route), so [ walks backwards from AAPL and wraps to the tail
    await press('[')
    expect(location.hash).toBe('#/research/googl/dividends')
  })

  it('routes every tab it prints — no strip entry that lands on the overview', async () => {
    await mount()
    for (const tab of tabs()) {
      const parsed = parseHash(tab.href)
      expect(parsed.sub).toBe(SYMBOL)
      const view = tab.href.split('/')[3] || null
      expect(parsed.view, `route.js does not recognise ${tab.label}`).toBe(view)
    }
  })
})

describe('research quote header', () => {
  const quote = { price: 190.12, change: 1.4, pct: 0.74, volume: 1_000_000, name: 'Example Corp' }

  it('says so when the quote feed has gone quiet', async () => {
    feed.goodTs = Date.now() - 12 * 60_000
    await mount({ q: quote })
    const stale = [...host.querySelectorAll('span')]
      .find((s) => s.textContent.includes('STALE') && s.children.length === 0)
    expect(stale).toBeDefined()
    expect(stale.textContent).toContain('12m')
    // amber, not red: a limping feed must never read as a falling tape
    expect(stale.className).toContain('text-accent')
  })

  it('counts a long silence in hours', async () => {
    feed.goodTs = Date.now() - 200 * 60_000
    await mount({ q: quote })
    expect(host.textContent).toContain('3h')
  })

  it('stays quiet while the feed is answering', async () => {
    feed.goodTs = Date.now() - 60_000       // same 5-minute threshold as the sidebar
    await mount({ q: quote })
    expect(host.textContent).not.toContain('STALE')
  })

  it('stays quiet when the feed has never answered at all', async () => {
    feed.goodTs = 0
    await mount({ q: quote })
    expect(host.textContent).not.toContain('STALE')
  })
})

describe('dead code', () => {
  // absence is the assertion here, so the source string IS the contract
  it('drops the unused symbol wire view', () => {
    const src = researchSource()
    expect(src).not.toContain('SymbolWireView')
    expect(src).not.toContain('research.no_wire_config')
    expect(src).not.toContain('research.wire_unreachable')
  })
})
