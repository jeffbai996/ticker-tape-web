// Contract for the two places feed health surfaces: the shell status row and
// the dashboard price tooltip. Row-level freshness must stay discoverable
// without adding visible chrome beside every quote.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')
const indicator = read('src/components/FeedIndicator.jsx')
const statusbar = read('src/components/StatusBar.jsx')
const dashboard = read('src/pages/dashboard.jsx')
const css = read('src/styles/main.css')

describe('shell feed indicator', () => {
  it('uses one literal-color dot for every feed state', () => {
    expect(indicator).toContain("live: 'bg-[#3fb950]'")
    expect(indicator).toContain("recovering: 'bg-[#fbbf24]'")
    expect(indicator).toContain("delayed: 'bg-[#f85149]'")
    expect(indicator).toContain("offline: 'bg-[#f85149]'")
    expect(indicator).toContain("const state = online ? health.state : 'offline'")
    expect(indicator).toContain('DOT_CLASS[state]')
  })

  it('reads state from the pure health module', () => {
    expect(indicator).toContain("from '../lib/feedHealth.js'")
    expect(indicator).toContain("from '../lib/feed.js'")
    expect(indicator).toContain('feedStatus()')
    expect(indicator).toContain('feedHealth(')
    expect(indicator).toContain('data-feed-state={state}')
    // no state maths in the component — it only paints what feedHealth said
    expect(indicator).not.toMatch(/lastSnapshotTs\s*[<>]/)
  })

  it('replaces the online dot without adding text to the status row', () => {
    expect(indicator).toContain('h-1.5 w-1.5 rounded-full')
    expect(indicator).not.toContain('health.ageLabel')
    expect(indicator).not.toContain("tl(health.state.toUpperCase())")
    expect(statusbar).toContain('<FeedIndicator online={online} colorOrder={colorOrder} onToggle={toggleColorOrder} />')
    expect(statusbar).not.toMatch(/online \? 'bg-\[#3fb950\]'/)
    expect(statusbar).toContain("import { FeedIndicator } from './FeedIndicator.jsx'")
  })

  it('updates the dot on a visible-only clock and keeps the reason accessible', () => {
    expect(indicator).toContain('startVisibleClock(1000')
    expect(indicator).toContain("health.state === 'live'")
    expect(indicator).toContain("tt(health.titleKey, health.titleParams)")
    expect(indicator).toContain("aria-label={`${tl('Switch gain and loss colors')} · ${detail}`}")
    expect(indicator).toContain('data-market-color-toggle')
  })
})

describe('dashboard row freshness affordance', () => {
  it('puts source and age on the price cell tooltip', () => {
    expect(dashboard).toContain("import { freshnessTitle, symbolFreshness } from '../lib/feedHealth.js'")
    expect(dashboard).toContain('symbolFreshness(data)')
    expect(dashboard).toContain('freshnessTitle(fresh)')
  })

  it('does not paint a marker beside snapshot or stale quotes', () => {
    expect(dashboard).not.toContain('tui-fresh-dot')
    expect(dashboard).not.toContain('data-fresh-source')
    expect(css).not.toContain('.tui-fresh-dot')
  })

  it('leaves the measured quote columns untouched', () => {
    expect(dashboard).toContain('min-w-(--col-price)')
    expect(dashboard).toContain('<span data-col="price" class="inline-block whitespace-nowrap">')
  })
})
