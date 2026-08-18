import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const markets = readFileSync(resolve(process.cwd(), 'src/pages/markets.jsx'), 'utf8')

describe('event workspace shell', () => {
  it('opens in place of the calendar rather than as a card or a modal', () => {
    expect(markets).toContain('function EventWorkspace')
    // route-in-place: the calendar list is replaced, so the panel owns the
    // full column height instead of stacking a second surface under a table.
    expect(markets).toContain('if (openEvent && details) {')
    expect(markets).toContain('<EventWorkspace')
    expect(markets).toContain('flex-1 min-w-0 flex flex-col')
    expect(markets).not.toContain('<Overlay')
    expect(markets).toContain("{tl('back to calendar')}")
  })

  it('carries an eyebrow with the kind and a live mono countdown', () => {
    expect(markets).toContain('function EventCountdown')
    expect(markets).toContain('formatCountdown')
    // ticks every second, but only while the tab is visible (perf pass 2026-08-18)
    expect(markets).toContain('startVisibleClock(1000, () => setNow(Date.now()))')
    expect(markets).toContain('tabular-nums')
    expect(markets).toContain("{tl('time to event')}")
    expect(markets).toContain("{tl('since release')}")
  })

  it('marks the pre/post states on the panel itself', () => {
    expect(markets).toContain('data-event-phase={phase}')
    expect(markets).toContain("phase === 'pre'")
    expect(markets).toContain("phase === 'post'")
    expect(markets).toContain("{tl('awaiting release')}")
  })

  it('lays facts against links on desktop and stacks them on a phone', () => {
    expect(markets).toContain('lg:grid-cols-[minmax(0,1fr)_320px]')
    expect(markets).toContain('overflow-x-auto')
  })
})

describe('event workspace content', () => {
  it('prints prior, consensus, and actual honestly', () => {
    expect(markets).toContain('function EventNumbers')
    expect(markets).toContain('eventNumbers(')
    expect(markets).toContain("{tl('Prior')}")
    expect(markets).toContain("{tl('Consensus')}")
    expect(markets).toContain("{tl('Actual')}")
    // an absent number is an em dash, never a filled-in guess
    expect(markets).toContain("value == null ? '—'")
    expect(markets).toContain("{tl('no consensus published for this event')}")
  })

  it('shows the surprise and the linked-symbol reaction after release', () => {
    expect(markets).toContain('eventSurprise(')
    expect(markets).toContain('eventReaction(')
    expect(markets).toContain("{tl('first market reaction')}")
    expect(markets).toContain("{tl('no reaction data yet')}")
    expect(markets).toContain("row.source === 'session'")
  })

  it('renders linked symbols in the dashboard row grammar', () => {
    expect(markets).toContain('function EventLinkRow')
    expect(markets).toContain('eventLinkedSymbols(')
    expect(markets).toContain('<FlashPrice price={q.price} fmt={fmtPrice} />')
    expect(markets).toContain('fmtPct(q.pct)')
    expect(markets).toContain("hrefFor('research', row.symbol.toLowerCase())")
  })

  it('keeps market direction on red/green and everything else on amber', () => {
    expect(markets).toContain("up ? 'text-up' : 'text-down'")
    expect(markets).toContain('text-accent')
  })

  it('explains what the event is in plain language', () => {
    expect(markets).toContain('eventNarrative(')
    expect(markets).toContain("{tl('What it is')}")
    expect(markets).toContain("{tl('Why it matters')}")
    expect(markets).toContain("{tl('Affected sectors')}")
  })

  it('degrades the wire strip instead of failing when there is no endpoint', () => {
    expect(markets).toContain('function EventWire')
    expect(markets).toContain('peekSymbolWire(')
    expect(markets).toContain('fetchSymbolWire(')
    // the mirror has no symbol index, so "connected" here means a real service
    expect(markets).toContain('wireServiceUrl()')
    expect(markets).toContain("{tl('no wire endpoint configured')}")
    expect(markets).toContain('.catch(')
  })
})

describe('event alert arming', () => {
  it('discloses channel, cooldown, and budget before the arm control', () => {
    expect(markets).toContain('function EventAlertArm')
    expect(markets).toContain('eventAlertPlan(')
    expect(markets).toContain("{tl('Channel')}")
    expect(markets).toContain("{tl('Cooldown')}")
    expect(markets).toContain("{tl('Delivery budget')}")
    const armIndex = markets.indexOf("{tl('Arm alert')}")
    expect(armIndex).toBeGreaterThan(markets.indexOf("{tl('Delivery budget')}"))
  })

  it('arms a browser alert through the existing store and never orders', () => {
    expect(markets).toContain('addAlert(')
    expect(markets).toContain('getAlertDeliveryPrefs()')
    expect(markets).toContain('fetchAlertDestinations()')
    expect(markets).toContain("{tl('browser alert only — nothing is ordered')}")
    expect(markets).not.toMatch(/placeOrder|submitOrder|\bbuy\(|\bsell\(/)
  })
})
