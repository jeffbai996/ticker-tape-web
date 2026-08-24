import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Holdings } from '../../src/pages/portfolioMine.jsx'

let host

beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  render(null, host)
  host.remove()
})

describe('portfolio venue groups', () => {
  it('collapses and restores a venue from its whole, accessible header bar', async () => {
    const portfolio = {
      id: 'example-book', ccy: 'USD', cash: [], txns: [], cashTxns: [],
      holdings: [
        { symbol: '0700.HK', shares: 10, cost: 300 },
        { symbol: 'AAPL', shares: 5, cost: 150 },
      ],
    }
    const quotes = {
      '0700.HK': { name: 'Example HK Company', price: 400, currency: 'HKD', pct: 1 },
      AAPL: { name: 'Example US Company', price: 200, currency: 'USD', pct: -1 },
    }
    render(h(Holdings, { portfolio, quotes, rates: { USD: 1, HKD: 7.8 } }), host)

    const header = host.querySelector('[data-venue-group="hk"]')
    expect(header.tagName).toBe('BUTTON')
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(host.textContent).toContain('0700.HK')
    expect(host.querySelector('[data-venue-subtotal="hk"]')).not.toBeNull()

    header.click()
    await new Promise((resolve) => setTimeout(resolve))
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(host.textContent).not.toContain('0700.HK')
    expect(host.querySelector('[data-venue-subtotal="hk"]')).toBeNull()

    header.click()
    await new Promise((resolve) => setTimeout(resolve))
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(host.textContent).toContain('0700.HK')
    expect(host.querySelector('[data-venue-subtotal="hk"]')).not.toBeNull()
  })
})
