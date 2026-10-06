/** The book actions (new / currency / rename / delete) ride in the portfolio
 *  heading. The public demo has never offered them there, so the demo build
 *  keeps hiding them; every other build, the private one included, shows them.
 */
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let host

beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  render(null, host)
  host.remove()
  vi.unstubAllEnvs()
  vi.resetModules()
})

/** Mount the real heading with a book action registered, under a build flag. */
async function mountHeader(env) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  vi.resetModules()
  const { setHeaderActions } = await import('../../src/lib/headerSlot.js')
  const { PortfolioHeader } = await import('../../src/pages/portfolio.jsx')
  setHeaderActions(h('button', { type: 'button', 'data-book-action': 'new' }, 'New portfolio'))
  await act(() => {
    render(h(PortfolioHeader, { accounts: [], account: '', onChange: () => {}, book: null, wired: false }), host)
  })
  return host.querySelector('[data-book-action="new"]')
}

describe('portfolio heading book actions', () => {
  it('hides them in the public demo build', async () => {
    expect(await mountHeader({ VITE_PUBLIC_DEMO: '1', VITE_PRIVATE: '' })).toBeNull()
    expect(host.querySelector('h1')).not.toBeNull()    // the heading itself still renders
  })

  it('keeps them in the private build', async () => {
    expect(await mountHeader({ VITE_PUBLIC_DEMO: '', VITE_PRIVATE: '1' })).not.toBeNull()
  })

  it('shows them in a plain build too', async () => {
    expect(await mountHeader({ VITE_PUBLIC_DEMO: '', VITE_PRIVATE: '' })).not.toBeNull()
  })
})
