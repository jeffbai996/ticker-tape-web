import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, render } from 'preact'
import fixture from '../fixtures/contracts/portfolio-currency-v1.json'
import { positionRows, mergeLegs, stressGrid } from '../../src/lib/demo.js'

const quotes = vi.hoisted(() => ({
  FIXTURE: { quote: { price: 100, change: 1, pct: 1, currency: 'USD' } },
  MSFT: { quote: { price: 100, change: 1, pct: 1, currency: 'USD' } },
}))
vi.mock('../../src/hooks.js', async (original) => ({
  ...await original(), useQuotes: () => quotes,
}))
vi.mock('../../src/lib/wire.js', async (original) => ({
  ...await original(), wireServiceUrl: () => 'https://fixture.invalid',
}))
import { brokerBook, brokerMoney, knownCurrency } from '../../src/lib/brokerBook.js'
import { Portfolio } from '../../src/pages/portfolio.jsx'

const unknown = { broker: true, symbol: 'MSFT', shares: 2, avgCost: 80,
  livePrice: 100, liveValue: 200, liveBase: null, liveUnreal: 40,
  currency: 'CAD', baseCurrency: null, baseAvailable: false, weightAvailable: false }
const priceMap = { MSFT: quotes.MSFT.quote }
const clone = (value) => structuredClone(value)

describe('unavailable broker base amounts', () => {
  it('retains native values without substituting them for base arithmetic', () => {
    const [row] = positionRows([unknown], priceMap)
    expect(row.mktValue).toBeNull()
    expect(row.weight).toBeNull()
    expect(row.costBasis).toBeNull()
    expect(row.dayPnl).toBeNull()
    expect(row.unrealPnl).toBeNull()
    expect(row.nativeValue).toBe(200)
    expect(row.nativeUnreal).toBe(40)
  })
  it('current unknown metadata overrides a cached known base amount', () => {
    expect(positionRows([{ ...unknown, liveBase: 200, baseCurrency: 'CAD' }], priceMap)[0].mktValue).toBeNull()
  })
  it('missing native marks cannot be replaced by an unverified quote', () => {
    const [row] = positionRows([{ ...unknown, livePrice: null, liveValue: null }], priceMap)
    expect(row.price).toBeNull()
    expect(row.nativeValue).toBeNull()
    expect(row.mktValue).toBeNull()
  })
  it('a missing base leg prevents a partial total after same-contract merging', () => {
    const known = { ...unknown, liveBase: 200, baseCurrency: 'CAD', baseAvailable: true, weightAvailable: true }
    const [merged] = mergeLegs([known, { ...unknown, baseCurrency: 'CAD', baseAvailable: true }])
    expect(merged.liveBase).toBeNull()
    expect(positionRows([merged], priceMap)[0].weight).toBeNull()
  })
  it('explicitly unavailable weights stay unavailable even with a valid base amount', () => {
    const [row] = positionRows([{ ...unknown, liveBase: 200, baseCurrency: 'CAD', baseAvailable: true }], priceMap)
    expect(row.mktValue).toBe(200)
    expect(row.weight).toBeNull()
  })
  it('stress output is unavailable rather than a partial or zero-filled estimate', () => {
    expect(stressGrid([unknown], priceMap).every((row) => row.pnl === null)).toBe(true)
  })
  it('known non-USD conversion and a real zero remain supported', () => {
    const known = { ...unknown, currency: 'USD', baseCurrency: 'CAD', baseAvailable: true,
      weightAvailable: true, liveBase: 270 }
    const [row] = positionRows([known], priceMap)
    expect(row.mktValue).toBe(270)
    expect(row.unrealPnl).toBe(54)
    expect(row.weight).toBe(100)
    const [zero] = positionRows([{ ...known, currency: 'CAD', liveValue: 0, liveBase: 0, liveUnreal: 0 }], {})
    expect(zero.mktValue).toBe(0)
    expect(zero.unrealPnl).toBe(0)
  })
})

let host
beforeEach(() => { localStorage.clear(); host = document.createElement('div'); document.body.append(host) })
afterEach(() => { render(null, host); host.remove(); vi.unstubAllGlobals() })
async function mount(out, sub = 'positions') {
  vi.stubGlobal('fetch', vi.fn(async (url) => ({ ok: true, json: async () =>
    String(url).includes('/accounts')
      ? { ok: true, accounts: [{ id: 'all', label: 'Both' }] } : out })))
  localStorage.setItem('portfolio_account_v1', 'all')
  render(h(Portfolio, { route: { sub } }), host)
  await vi.waitFor(() => expect(host.textContent).toContain('Interactive Brokers'))
  return host.textContent
}

describe('broker response rendering', () => {
  for (const entry of fixture.cases) {
    it(`renders the shared ${entry.name} response without fabricated totals`, async () => {
      const text = await mount(clone(entry.expected))
      expect(text).toContain('FIXTURE')
      if (entry.name === 'complete_cad') {
        expect(text).toContain('C$2,000')
        expect(text).toContain('0.15x')
      } else {
        expect(text).toContain(entry.expected.margin_warning)
        expect(text).not.toContain('3,500')
        expect(text).not.toContain('100%')
        expect(text).toContain('Primary')
        expect(text).toContain('Secondary')
        expect(text).toContain(brokerMoney(200, entry.expected.positions[1].currency))
      }
    })
  }
  for (const sub of ['account', 'sizing', 'carry', 'cockpit']) {
    it(`${sub} cannot reconstruct a demo balance from an unknown broker book`, async () => {
      const out = clone(fixture.cases[1].expected)
      const text = await mount(out, sub)
      expect(text).toContain(out.margin_warning)
      expect(text).not.toContain('3,500')
      expect(text).not.toContain('3,200')
    })
  }
  it('retains a valid empty book and its warning instead of treating it as link failure', async () => {
    const out = { ...clone(fixture.cases[1].expected), positions: [] }
    expect(await mount(out)).toContain(out.margin_warning)
  })
  it('known partial margin retains labelled equity without a demo maintenance fallback', async () => {
    const out = clone(fixture.cases[0].expected)
    out.margin = { equity: 1000 }
    out.margin_complete = false
    out.margin_warning = 'Margin incomplete: maintenance unavailable.'
    const text = await mount(out, 'account')
    expect(text).toContain(out.margin_warning)
    expect(text).toContain('C$1,000')
    expect(text).not.toContain('$75')
    expect(text).not.toContain('$3,200')
  })
  it('a current unavailable warning defeats cached known currency and amounts', async () => {
    const out = clone(fixture.cases[0].expected)
    out.currency_unavailable = true
    out.margin_complete = false
    out.margin_warning = 'Base currency unavailable. Cached values are unavailable.'
    out.account_summaries = []
    const text = await mount(out, 'account')
    expect(text).toContain(out.margin_warning)
    expect(text).not.toContain('C$2,000')
    expect(text).not.toContain('0.15x')
  })
})

describe('broker metadata availability', () => {
  it('rejects empty, placeholder, non-string and malformed summary currency', () => {
    for (const currency of [null, undefined, '', 'BASE', 'XXX', 'UNK', 'NAN', 'usd', 'USD\n', 123]) {
      expect(knownCurrency(currency)).toBeNull()
      const out = { ...clone(fixture.cases[0].expected), currency }
      expect(brokerBook(out).margin).toBeNull()
    }
    expect(knownCurrency('CNH')).toBe('CNH')
  })
  it('an omitted owner summary cannot establish that position\'s base units', () => {
    const out = clone(fixture.cases[0].expected)
    out.account_summaries = out.account_summaries.slice(0, 1)
    const book = brokerBook(out)
    expect(book.currency).toBeNull()
    expect(positionRows(book.positions, {}).every((row) => row.mktValue === null && row.weight === null)).toBe(true)
  })
  it('conflicting margin units do not relabel received money', () => {
    const out = clone(fixture.cases[0].expected)
    out.margin.currency = 'EUR'
    expect(brokerBook(out).margin).toBeNull()
    expect(brokerBook(out).marginComplete).toBe(false)
  })
  it('cached per-account amounts cannot override a current unavailable warning', async () => {
    const out = clone(fixture.cases[0].expected)
    out.currency_unavailable = true
    out.margin_warning = 'Base currency unavailable. Cached values are unavailable.'
    const text = await mount(out)
    expect(text).toContain(out.margin_warning)
    expect(text).not.toContain('C$1,000')
    expect(text).not.toContain('C$2,000')
  })
  it('an empty unknown book has no zero-filled stress estimates', async () => {
    const out = { ...clone(fixture.cases[1].expected), positions: [] }
    const text = await mount(out, 'cockpit')
    expect(text).toContain(out.margin_warning)
    expect(text).not.toContain('0.00x')
    for (const row of host.querySelectorAll('tbody tr')) {
      expect([...row.querySelectorAll('td')].slice(1).every((cell) => cell.textContent === '—')).toBe(true)
    }
  })
  it('a known zero balance is displayed with its received units', async () => {
    const out = clone(fixture.cases[0].expected)
    out.account_summaries = []
    out.positions = []
    out.margin = { equity: 0, maintenance: 0, above_maintenance: 0 }
    const text = await mount(out, 'account')
    expect(text).toContain('C$0')
    expect(text).not.toContain('3,200')
  })
})

describe('unknown native units', () => {
  it('does not convert unlabelled native P&L even when a base amount is supplied', () => {
    const [row] = positionRows([{ ...unknown, currency: null, baseCurrency: 'CAD',
      baseAvailable: true, liveBase: 270 }], priceMap)
    expect(row.mktValue).toBe(270)
    expect(row.unrealPnl).toBeNull()
    expect(row.costBasis).toBeNull()
  })
})

it('an unavailable flag alone overrides cached account summary units and balances', () => {
  const out = clone(fixture.cases[0].expected)
  out.currency_unavailable = true
  out.margin_warning = null
  const book = brokerBook(out)
  expect(book.currency).toBeNull()
  expect(book.accountSummaries.every((summary) => summary.currency === null && summary.margin === null)).toBe(true)
})
