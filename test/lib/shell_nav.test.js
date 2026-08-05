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

  it('shows live list detail, ticker previews, and explicit management actions', () => {
    expect(page).toContain('average move')
    expect(page).toContain('advancing')
    expect(page).toContain('declining')
    expect(page).toContain('symbol chips')
    expect(page).toContain('Create watchlist')
    expect(page).toContain('Rename')
    expect(page).toContain('Delete')
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
})
