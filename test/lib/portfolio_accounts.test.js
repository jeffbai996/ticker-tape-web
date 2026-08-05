import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(process.cwd(), 'src/pages/portfolio.jsx'), 'utf8')
const labels = readFileSync(resolve(process.cwd(), 'src/lib/i18n.js'), 'utf8')

describe('private portfolio account switching', () => {
  it('loads configured accounts and scopes every book request', () => {
    expect(page).toContain('/api/portfolio/accounts')
    expect(page).toContain("localStorage.getItem('portfolio_account_v1')")
    expect(page).toContain("params.set('account', account)")
    expect(page).toContain('onAccountChange')
    expect(page).toContain("const BOTH_ACCOUNTS = 'all'")
    expect(page).toContain("{ id: BOTH_ACCOUNTS, label: tl('Both') }")
  })

  it('uses a segmented slider and a neutral portfolio heading', () => {
    expect(page).toContain('function AccountSwitcher')
    expect(page).toContain('portfolio-account-slider')
    expect(page).toContain('function PortfolioHeader')
    expect(page).not.toContain('border border-up/50 rounded-lg')
  })

  it('uses the live margin summary in the account view', () => {
    expect(page).toContain('function Account({ priceMap, positions, margin, account })')
    expect(page).toContain("margin?.equity")
    expect(page).toContain("margin?.above_maintenance")
  })

  it('adds a live overview strip and book pulse to the positions surface', () => {
    expect(page).toContain('function BookSummary')
    expect(page).toContain('function BookPulse')
    expect(page).toContain('margin?.equity')
    expect(page).toContain('margin?.above_maintenance')
  })
})

describe('portfolio translation coverage', () => {
  it('routes portfolio status and gateway copy through i18n', () => {
    for (const key of [
      'portfolio.live', 'portfolio.connecting', 'portfolio.link_down',
      'portfolio.gateway_loading', 'portfolio.gateway_empty',
    ]) expect(labels).toContain(`'${key}'`)
    expect(page).not.toContain('>asking the gateway…<')
    expect(page).not.toContain('>CONNECTING TO IBKR…<')
  })
})
