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
  it('says nothing at all while the feed is healthy', () => {
    // Jeff 2026-08-18: "remove the word LIVE here" — a status row that
    // announces the normal case is noise; only trouble earns a word.
    expect(indicator).toContain("if (health.state === 'live') return null")
    expect(indicator).not.toMatch(/live:\s*'text-/)
  })

  it('renders the abnormal states from the pure health module', () => {
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

  it('shows the reconnect age beside the state word', () => {
    expect(indicator).toContain('health.ageLabel')
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
