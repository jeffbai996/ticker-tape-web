import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// No network in this test: quotes and saved history stay empty.
vi.mock('../../src/hooks.js', async (orig) => ({ ...(await orig()), useQuotes: () => ({}) }))
vi.mock('../../src/hooks/usePortfolioHistory.js', () => ({ usePortfolioHistory: () => ({ marks: [], status: 'ready' }) }))
vi.mock('../../src/lib/cnEvents.js', () => ({ fetchSymbolEventsCached: () => new Promise(() => {}) }))

const { MyPortfolios } = await import('../../src/pages/portfolioMine.jsx')
const { replacePortfolios } = await import('../../src/lib/myPortfolios.js')

let root
beforeEach(() => { localStorage.clear(); root = document.createElement('div'); document.body.append(root) })
afterEach(() => { render(null, root); root.remove() })

const nameField = () => root.querySelector('input[aria-label="Portfolio name"]')

describe('new portfolio form on a fresh browser', () => {
  it('opens by itself when there are no books and closes when saved books sync in', async () => {
    await act(() => { render(h(MyPortfolios, {}), root) })
    expect(nameField()).not.toBeNull()
    await act(() => { replacePortfolios([{ id: 'p1', name: 'Demo', ccy: 'USD', holdings: [] }]) })
    expect(nameField()).toBeNull()
  })
})
