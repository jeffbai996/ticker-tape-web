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

  it('routes destructive and validation copy through i18n', () => {
    expect(page).toContain("tt('watchlists.unique_name')")
    expect(page).toContain("tt('watchlists.delete_confirm'")
    expect(page).not.toContain('Use a unique watchlist name.')
    expect(page).not.toContain('Delete watchlist “')
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

  it('keeps both quote strips tightly spaced', () => {
    expect(status).toContain('class="w-full flex items-baseline gap-0')
    expect(status).toContain('gap-[3px] whitespace-nowrap leading-5 px-1')
    expect(status).not.toContain('items-baseline gap-4 overflow-x-auto')
    expect(tape).toContain('class="tape-cycle flex items-center h-full gap-0 pr-1"')
    expect(tape).toContain('gap-[3px] whitespace-nowrap hover:no-underline px-1 py-0.5')
    expect(tape).not.toContain('min-w-[3.75rem]')
    expect(tape).not.toContain('min-w-[3.25rem]')
    expect(tape).not.toContain('h-full gap-4 pr-4')
  })

  it('color-codes the extended-session quote beside the regular print', () => {
    expect(tape).toContain('q.extLabel')
    expect(tape).toContain('q.extPrice')
    expect(tape).toContain('extendedLabelClass(q.extLabel)')
    expect(status).toContain("pre: 'text-[#5ba8d9]")
    expect(status).toContain("post: 'text-[#c084fc]")
  })
})
