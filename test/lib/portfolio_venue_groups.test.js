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
  it('switches a venue subtotal between its source and portfolio currency', async () => {
    const portfolio = {
      id: 'mixed-currency-book', ccy: 'HKD', cash: [], txns: [], cashTxns: [],
      holdings: [
        { symbol: '600036.SS', shares: 100, cost: 5 },
        { symbol: '0700.HK', shares: 10, cost: 300 },
      ],
    }
    const quotes = {
      '600036.SS': { name: 'Example A Share', price: 10, currency: 'CNY', pct: 0 },
      '0700.HK': { name: 'Example HK Company', price: 400, currency: 'HKD', pct: 0 },
    }
    render(h(Holdings, { portfolio, quotes, rates: { USD: 1, CNY: 0.14, HKD: 0.128 } }), host)

    const subtotal = host.querySelector('[data-venue-subtotal="cn"]')
    const source = host.querySelector('[data-subtotal-currency="cn"]')
    expect(subtotal.textContent).toContain('HK$1,094')
    expect(source.getAttribute('aria-pressed')).toBe('false')

    source.click()
    await new Promise((resolve) => setTimeout(resolve))
    expect(subtotal.textContent).toContain('¥1,000')
    expect(source.getAttribute('aria-pressed')).toBe('true')
  })

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
