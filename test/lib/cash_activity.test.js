import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CashActivity } from '../../src/pages/portfolioCash.jsx'
import { createPortfolio, loadPortfolios, setCash } from '../../src/lib/myPortfolios.js'

let host
beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
})
afterEach(() => { render(null, host); host.remove() })

function input(label, value) {
  const el = host.querySelector(`[aria-label="${label}"]`)
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('CashActivity', () => {
  it('offers explicit cash actions, previews the balance and records a deposit', async () => {
    const created = createPortfolio('Core', 'USD')
    setCash(created.id, 'USD', 1_000)
    render(h(CashActivity, { portfolio: loadPortfolios()[0], rates: { USD: 1 } }), host)

    expect(host.textContent).toContain('Deposit')
    expect(host.textContent).toContain('Withdraw')
    expect(host.textContent).toContain('Set balance')
    input('Cash amount', '500')
    input('Note', 'Transfer in')
    await new Promise((resolve) => setTimeout(resolve))
    expect(host.textContent).toContain('$1,000.00')
    expect(host.textContent).toContain('$1,500.00')

    host.querySelector('button[type="submit"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise((resolve) => setTimeout(resolve))
    expect(loadPortfolios()[0].cash).toEqual([{ ccy: 'USD', amount: 1_500 }])
    expect(host.textContent).toContain('Transfer in')
    expect(host.textContent).toContain('+$500.00')
  })

  it('records a withdrawal as an external negative flow', async () => {
    const created = createPortfolio('Core', 'USD')
    setCash(created.id, 'USD', 1_000)
    render(h(CashActivity, { portfolio: loadPortfolios()[0], rates: { USD: 1 } }), host)
    const withdraw = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Withdraw')
    withdraw.click()
    await new Promise((resolve) => setTimeout(resolve))
    input('Cash amount', '125')
    await new Promise((resolve) => setTimeout(resolve))
    host.querySelector('button[type="submit"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise((resolve) => setTimeout(resolve))
    expect(loadPortfolios()[0].cash).toEqual([{ ccy: 'USD', amount: 875 }])
    expect(loadPortfolios()[0].cashTxns.at(-1)).toMatchObject({ kind: 'withdrawal', amount: -125 })
  })

  it('turns a directly entered lower balance into a withdrawal', async () => {
    const created = createPortfolio('Core', 'USD')
    setCash(created.id, 'USD', 1_000)
    render(h(CashActivity, { portfolio: loadPortfolios()[0], rates: { USD: 1 } }), host)
    const reconcile = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Set balance')
    reconcile.click()
    await new Promise((resolve) => setTimeout(resolve))
    input('Cash amount', '800')
    await new Promise((resolve) => setTimeout(resolve))
    host.querySelector('button[type="submit"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise((resolve) => setTimeout(resolve))
    expect(loadPortfolios()[0].cash).toEqual([{ ccy: 'USD', amount: 800 }])
    expect(loadPortfolios()[0].cashTxns.at(-1)).toMatchObject({ kind: 'withdrawal', amount: -200 })
  })
})
