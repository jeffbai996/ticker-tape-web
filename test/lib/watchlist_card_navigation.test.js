import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { shouldOpenWatchlistCard } from '../../src/lib/watchlistCard.js'

const page = readFileSync('src/pages/watchlists.jsx', 'utf8')

describe('watchlist dashboard cards', () => {
  it('opens from inert card space but not from nested controls', () => {
    const inert = { defaultPrevented: false, target: { closest: vi.fn(() => null) } }
    expect(shouldOpenWatchlistCard(inert, '')).toBe(true)

    for (const tag of ['a', 'button', 'input', 'select', 'form']) {
      const interactive = {
        defaultPrevented: false,
        target: { closest: vi.fn(() => ({ tagName: tag.toUpperCase() })) },
      }
      expect(shouldOpenWatchlistCard(interactive, '')).toBe(false)
    }
  })

  it('does not navigate after text selection or a prevented click', () => {
    const inert = { defaultPrevented: false, target: { closest: () => null } }
    expect(shouldOpenWatchlistCard(inert, 'selected ticker')).toBe(false)
    expect(shouldOpenWatchlistCard({ ...inert, defaultPrevented: true }, '')).toBe(false)
  })

  it('keeps an explicit high-emphasis open control', () => {
    expect(page).toContain('data-watchlist-open')
    expect(page).toContain('border-accent/60 bg-accent-soft')
  })

  it('uses a terse, hierarchical ticker count', () => {
    expect(page).not.toContain("tl('independent dashboard view')")
    expect(page).not.toContain("tl('shared across Briefing, Wire, AI, and the tape')")
    expect(page).toContain('data-watchlist-count')
    expect(page).toContain('font-mono text-[12px] font-bold text-ink-2')
  })
})
