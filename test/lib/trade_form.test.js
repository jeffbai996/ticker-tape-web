/** The add-trade form is how Gordon records every buy and sell. It broke
 *  invisibly once: SymbolSuggest hands its onInput the DOM event, the form
 *  stored the event as the symbol, and the first keystroke crashed the
 *  render — the form looked alive and did nothing (Gordon 2026-08-23:
 *  "我敲那个代码它没有反应"). This types into the real component.
 */
import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AddTradeForm } from '../../src/pages/portfolioTrades.jsx'
import { createPortfolio, loadPortfolios } from '../../src/lib/myPortfolios.js'

let host
beforeEach(() => { localStorage.clear(); host = document.createElement('div'); document.body.appendChild(host) })
afterEach(() => { render(null, host); host.remove() })

function type(input, text) {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('AddTradeForm', () => {
  it('records a typed trade on the book it was given', async () => {
    const tick = () => new Promise((r) => setTimeout(r))
    const p = createPortfolio('Gordon', 'CNY')
    render(h(AddTradeForm, { portfolio: p }), host)
    const [sym] = host.querySelectorAll('input')
    type(sym, '600036.SS')
    await tick()
    // typing must not crash the render — the regression stored the event
    // object as the symbol and threw on the next render
    expect(host.querySelector('button[type=submit]')).toBeTruthy()
    const boxes = [...host.querySelectorAll('input')]
    type(boxes[1], '100')   // qty
    type(boxes[2], '38.9')  // price
    await tick()
    const submit = host.querySelector('button[type=submit]')
    expect(submit.disabled).toBe(false)
    submit.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await tick()
    const book = loadPortfolios().find((x) => x.id === p.id)
    expect(book.txns).toHaveLength(1)
    expect(book.txns[0]).toMatchObject({ sym: '600036.SS', side: 'buy', qty: 100, px: 38.9 })
    // and the ledger derived the holding onto the same book, no other
    expect(book.holdings.map((h2) => h2.symbol)).toContain('600036.SS')
  })
})
