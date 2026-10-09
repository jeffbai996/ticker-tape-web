import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
vi.mock('../../src/lib/classification.js', () => ({ resolveClassification: vi.fn() }))
import { resolveClassification } from '../../src/lib/classification.js'
import { useClassifications } from '../../src/lib/useClassifications.js'

const host = document.createElement('div')
afterEach(() => { render(null, host); vi.clearAllMocks() })
function Board({ symbols }) {
  const categories = useClassifications(symbols)
  return h('pre', {}, JSON.stringify(categories))
}

describe('classification loading', () => {
  it('updates unmatched names asynchronously and reuses the cache on remount', async () => {
    resolveClassification.mockResolvedValue('Financials')
    await act(async () => { render(h(Board, { symbols: ['AAPL', 'ZZZZ'] }), host) })
    await vi.waitFor(() => expect(JSON.parse(host.textContent)).toEqual({ ZZZZ: 'Financials' }))
    expect(resolveClassification).toHaveBeenCalledTimes(1)
    expect(resolveClassification).toHaveBeenCalledWith('ZZZZ')
    await act(async () => { render(null, host) })
    await act(async () => { render(h(Board, { symbols: ['ZZZZ'] }), host) })
    await vi.waitFor(() => expect(JSON.parse(host.textContent)).toEqual({ ZZZZ: 'Financials' }))
    expect(resolveClassification).toHaveBeenCalledTimes(1)
  })
  it('does not apply an old list response after the list changes', async () => {
    let finish
    resolveClassification.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await act(async () => { render(h(Board, { symbols: ['YYYY'] }), host) })
    await act(async () => { render(h(Board, { symbols: ['AAPL'] }), host) })
    await act(async () => { finish('Semis') })
    expect(JSON.parse(host.textContent)).toEqual({})
  })
})
