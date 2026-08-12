import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('watchlist navigation', () => {
  const nav = source('src/lib/nav.js')
  const sidebar = source('src/components/Sidebar.jsx')
  const bottom = source('src/components/BottomNav.jsx')

  it('makes Watchlists a first-class item immediately after Dashboard', () => {
    expect(nav).toContain("{ id: 'dashboard', label: 'Dashboard', subs: [] }")
    expect(nav).toContain("{ id: 'watchlists', label: 'Watchlists', subs: [] }")
    expect(nav.indexOf("id: 'watchlists'")).toBeGreaterThan(nav.indexOf("id: 'dashboard'"))
    expect(sidebar).not.toContain("hrefFor('dashboard', 'watchlists')")
    expect(sidebar).not.toContain("section.id === 'dashboard'")
  })

  it('uses the same first-class navigation on mobile', () => {
    expect(bottom).toContain('NAV.map')
    expect(bottom).not.toContain('MOBILE_NAV')
  })
})

describe('watchlists surface', () => {
  const page = source('src/pages/watchlists.jsx')
  const pages = source('src/pages/index.jsx')
  const dashboard = source('src/pages/dashboard.jsx')

  it('shows live list detail, ticker previews, and explicit management actions', () => {
    expect(page).toContain('average move')
    expect(page).toContain('advancing')
    expect(page).toContain('declining')
    expect(page).toContain('symbol chips')
    // 2026-08-06: label shortened to 'Create' so the form holds one line
    expect(page).toContain("tl('Create')")
    expect(page).toContain("tl('rename')")
    expect(page).toContain("tl('delete')")
  })

  it('routes destructive and validation copy through i18n', () => {
    expect(page).toContain("tt('watchlists.unique_name')")
    expect(page).toContain("tt('watchlists.delete_confirm'")
    expect(page).not.toContain('Use a unique watchlist name.')
    expect(page).not.toContain('Delete watchlist “')
  })

  it('restores the last dashboard list locally and keeps main explicit', () => {
    expect(pages).toContain('<LandingDashboard />')
    expect(dashboard).toContain('rememberDashboardLanding(activeList?.id || null)')
    expect(dashboard).toContain("location.hash = '#/watchlists/main'")
    expect(page).toContain("const href = primary ? '#/watchlists/main'")
  })
})

describe('compact mobile status bar', () => {
  const status = source('src/components/StatusBar.jsx')
  const tape = source('src/components/Tape.jsx')
  const mark = source('public/ticker-tape-mark.svg')

  it('uses the favicon mark, single-letter market states, and a minute clock', () => {
    expect(status).toContain("${import.meta.env.BASE_URL}ticker-tape-mark.svg")
    expect(mark).toContain('#f59e0b')
    expect(status).toContain("const COMPACT_STATE_LABEL = { open: 'O', pre: 'P', post: 'A', closed: 'C', holiday: 'H' }")
    expect(status).toContain('max-md:hidden')
    expect(status).toContain('md:hidden')
    expect(status).toContain('desktopClock')
    expect(status).toContain('mobileClock')
    expect(status).toContain('.slice(0, 5)')
  })

  it('keeps the mobile shell rows compact and measures a gapless tape loop', () => {
    expect(status).toContain('h-8')
    expect(tape).toContain('h-6')
    expect(tape).toContain('ResizeObserver')
    expect(tape).toContain("'--tape-cycle-width'")
  })

  // Jeff, 2026-08-05: the tight pass ran the quotes together — entries need
  // air between them, and the extended-session label needs as much room on
  // its left as on its right (the % glyph's side bearing eats the difference).
  // 2026-08-06: a second tight pass tried to fit NQ on phones and Jeff called
  // it microscopic — the original scale is the contract again; the strip
  // simply scrolls.
  // 2026-08-07: Jeff asked for half the trench between entries. That is NOT a
  // reversal of the above — the rejected pass shrank the TYPE to fit more on a
  // phone; this one leaves every font alone and only closes the gap, so the
  // quotes stay the same size and more of them fit before the scroll.
  it('keeps both quote strips readable, not jammed', () => {
    expect(status).toContain('class="w-full flex items-baseline gap-[5px]')
    expect(status).toContain('gap-1.5 whitespace-nowrap leading-5 px-0.5')
    expect(tape).toContain('class="tape-cycle flex items-center h-full gap-1.5 pr-3"')
    expect(tape).toContain('gap-1.5 whitespace-nowrap hover:no-underline px-1 py-0.5')
    expect(tape).toContain('gap-1.5 text-[10px] pl-[3px]')
    // …but the fixed-width quote columns stay gone: they padded every row to
    // the widest print and left holes mid-tape
    expect(tape).not.toContain('min-w-[3.75rem]')
    expect(tape).not.toContain('min-w-[3.25rem]')
  })

  it('links a tape headline at its own story, not the wire index', () => {
    expect(tape).toContain('href={`#/wire/${e.id}`}')
    const wire = readFileSync(resolve(process.cwd(), 'src/pages/wire.jsx'), 'utf8')
    expect(wire).toContain('const targetId = route?.sub ? Number(route.sub) : null')
    expect(wire).toContain('id={`ev-${ev.id}`}')
    expect(wire).toContain("scrollIntoView({ block: 'center', behavior: 'smooth' })")
    // landing must be one-shot: the SSE feed re-renders constantly
    expect(wire).toContain('landedRef.current === targetId')
  })

  it('color-codes the extended-session quote beside the regular print', () => {
    expect(tape).toContain('q.extLabel')
    expect(tape).toContain('q.extPrice')
    expect(tape).toContain('extendedLabelClass(q.extLabel)')
    expect(status).toContain("pre: 'text-[#5ba8d9]")
    expect(status).toContain("post: 'text-[#c084fc]")
  })
})
