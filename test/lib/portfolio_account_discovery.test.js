import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'

vi.mock('../../src/hooks.js', async (original) => ({ ...await original(), useQuotes: () => ({}) }))
vi.mock('../../src/lib/wire.js', async (original) => ({
  ...await original(), wireServiceUrl: () => 'https://fixture.invalid',
}))
import { brokerBookState, PortfolioHeader, usePortfolioAccounts } from '../../src/pages/portfolio.jsx'

describe('broker book state before an account is chosen', () => {
  it('is link-down when account discovery failed', () => {
    expect(brokerBookState(null, false, '')).toBe(false)
  })
  it('is link-down when the wire answered with no accounts', () => {
    expect(brokerBookState(null, [], '')).toBe(false)
  })
  it('is still connecting while discovery is in flight', () => {
    expect(brokerBookState(null, null, '')).toBeNull()
  })
  it('defers to the live book once an account is selected', () => {
    expect(brokerBookState(null, false, 'U1')).toBeNull()
    const book = { positions: [] }
    expect(brokerBookState(book, false, '')).toBe(book)
  })
})

let host
let seen
function Probe() {
  seen = usePortfolioAccounts()
  return null
}
beforeEach(() => { vi.useFakeTimers(); host = document.createElement('div'); document.body.append(host) })
afterEach(() => { render(null, host); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('account discovery', () => {
  it('reports a failed lookup, then retries and recovers', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ json: async () => ({ ok: true, accounts: [{ id: 'U1', label: 'Main' }] }) })
    vi.stubGlobal('fetch', fetch)
    await act(async () => { render(h(Probe), host) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(seen).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(seen).toEqual([{ id: 'U1', label: 'Main' }])
  })

  it('shows link-down in the header instead of connecting after a failed lookup', async () => {
    await act(async () => { render(h(PortfolioHeader, { accounts: false, account: '', book: brokerBookState(null, false, ''), wired: true }), host) })
    expect(host.textContent).toContain('LINK DOWN')
    expect(host.textContent).not.toContain('CONNECTING')
  })
})
