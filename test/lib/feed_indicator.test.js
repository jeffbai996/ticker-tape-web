// Contract for the two places feed health surfaces: the shell status row and
// the dashboard rows. The dashboard assertions exist mostly to defend row
// geometry — a freshness affordance that resizes a row on a tick is worse
// than no affordance at all.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')
const indicator = read('src/components/FeedIndicator.jsx')
const statusbar = read('src/components/StatusBar.jsx')
const dashboard = read('src/pages/dashboard.jsx')
const css = read('src/styles/main.css')

describe('shell feed indicator', () => {
  it('renders the three states from the pure health module', () => {
    expect(indicator).toContain("from '../lib/feedHealth.js'")
    expect(indicator).toContain("from '../lib/feed.js'")
    expect(indicator).toContain('feedStatus()')
    expect(indicator).toContain('feedHealth(')
    expect(indicator).toContain('data-feed-state={health.state}')
    // no state maths in the component — it only paints what feedHealth said
    expect(indicator).not.toMatch(/lastSnapshotTs\s*[<>]/)
  })

  it('keeps the label amber and leaves red/green to market direction', () => {
    expect(indicator).toContain('text-accent')
    expect(indicator).not.toContain('text-up')
    expect(indicator).not.toContain('text-down')
  })

  it('stays a tiny single-line chip inside the existing status row', () => {
    expect(indicator).toContain('font-mono')
    expect(indicator).toMatch(/text-\[10(\.5)?px\]/)
    expect(indicator).toContain('whitespace-nowrap')
    expect(indicator).toContain('shrink-0')
    expect(statusbar).toContain('<FeedIndicator />')
    expect(statusbar).toContain("import { FeedIndicator } from './FeedIndicator.jsx'")
  })

  it('shows the reconnect age only when the feed is not live', () => {
    expect(indicator).toContain('health.ageLabel')
    expect(indicator).toContain("health.state !== 'live'")
  })
})

describe('dashboard row freshness affordance', () => {
  it('puts source and age on the price cell tooltip', () => {
    expect(dashboard).toContain("import { freshnessTitle, isLiveSource, symbolFreshness } from '../lib/feedHealth.js'")
    expect(dashboard).toContain('symbolFreshness(data)')
    expect(dashboard).toContain('freshnessTitle(fresh)')
  })

  it('marks only rows that are not live, and never with a new column', () => {
    expect(dashboard).toContain('isLiveSource(fresh.source)')
    expect(dashboard).toContain('class="tui-fresh-dot"')
    expect(dashboard).toContain('data-fresh-source={fresh.source}')
    expect(dashboard).toContain('aria-hidden="true"')
  })

  it('takes the marker out of the flow so a tick cannot move the row', () => {
    expect(css).toMatch(/\.tui-fresh-dot\s*\{[\s\S]*position: absolute;/)
    expect(css).toMatch(/\.tui-fresh-dot\s*\{[\s\S]*width: 3px;/)
    // no animation on the marker: the board must not breathe once a minute
    expect(css).not.toMatch(/\.tui-fresh-dot[\s\S]{0,200}animation:/)
  })

  it('leaves the measured quote columns untouched', () => {
    expect(dashboard).toContain('min-w-(--col-price)')
    expect(dashboard).toContain('<span data-col="price" class="inline-block whitespace-nowrap">')
  })
})
