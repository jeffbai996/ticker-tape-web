import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TuiRow } from '../../src/pages/dashboard.jsx'


const DATA = {
  quote: {
    name: 'Example Manufacturing Corporation',
    price: 123.45,
    change: 1.25,
    pct: 1.02,
    volume: 2_000_000,
    dayLow: 120,
    dayHigh: 125,
  },
  tech: {
    rsi: 56,
    above50: true,
    above200: true,
    volRatio: 1.2,
    low52: 90,
    high52: 140,
    offHigh: -12,
    rs: 4,
  },
  histo: [],
}

let host

beforeEach(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  document.body.innerHTML = '<div id="host"></div>'
  host = document.getElementById('host')
  location.hash = ''
})

afterEach(() => {
  render(null, host)
  document.body.innerHTML = ''
  location.hash = ''
})

function mount(props = {}) {
  render(h(TuiRow, {
    symbol: 'ACME',
    data: DATA,
    earnDays: 12,
    ...props,
  }), host)
  return host.querySelector('[data-row-link="ticker-overview"]')
}

function cancellableClick(node) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  node.dispatchEvent(event)
  return event
}

describe('dashboard ticker row', () => {
  it('renders identity and quotes inside a direct overview link', () => {
    const row = mount()

    expect(row.getAttribute('href')).toBe('#/research/acme')
    expect(row.textContent).toContain('ACME')
    expect(row.textContent).toContain('Example Manufacturing Corporation')
    expect(row.textContent).toContain('123.45')
    expect(row.textContent).toContain('+1.02%')
  })

  it('uses only the first compact ticker tap to reveal the company name', () => {
    const onReveal = vi.fn()
    mount({ onReveal })

    const ticker = host.querySelector('[data-ticker-reveal-target]')
    const first = cancellableClick(ticker)

    expect(first.defaultPrevented).toBe(true)
    expect(onReveal).toHaveBeenCalledOnce()
    expect(onReveal).toHaveBeenCalledWith('ACME')
  })

  it('lets a revealed ticker tap and the rest of the row navigate normally', () => {
    const onReveal = vi.fn()
    const row = mount({ revealed: true, onReveal })

    expect(cancellableClick(host.querySelector('[data-ticker-reveal-target]')).defaultPrevented)
      .toBe(false)
    expect(cancellableClick(row).defaultPrevented).toBe(false)
    expect(onReveal).not.toHaveBeenCalled()
  })

  it('turns the row into a non-navigating toggle in select mode', () => {
    const onToggleSelect = vi.fn()
    const row = mount({ selecting: true, selected: true, onToggleSelect })
    const event = cancellableClick(row)

    expect(event.defaultPrevented).toBe(true)
    expect(onToggleSelect).toHaveBeenCalledWith('ACME')
    expect(row.textContent).toContain('✓')
    expect(row.querySelector('button[title^="unwatch"]')).toBeNull()
  })

  it('removes from the watchlist without opening research', () => {
    const onRemove = vi.fn()
    const row = mount({ onRemove })
    const button = row.querySelector('button[title^="unwatch"]')
    const event = cancellableClick(button)

    expect(event.defaultPrevented).toBe(true)
    expect(onRemove).toHaveBeenCalledWith('ACME')
  })

  it('holds the extended-hours quote slot until a print arrives', () => {
    mount()
    const quoteCluster = host.querySelector('.tui-quote-cluster')
    expect(quoteCluster.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(quoteCluster.textContent).toContain('123.45')

    mount({ data: {
      ...DATA,
      quote: { ...DATA.quote, extLabel: 'AH', extPrice: 124.1, extPct: 0.53 },
    } })
    expect(host.querySelector('.tui-quote-cluster').textContent).toContain('AH 124.10 ▲0.5%')
  })
})
