import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RESEARCH_DIR, researchFiles, researchSource } from './researchSource.js'

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')
const lane = (name) => read(`src/pages/research/${name}`)
const shell = () => read('src/pages/research.jsx')

// P1 from the design audit: research.jsx was ~2.5K lines. It is split BY
// ROUTED SUBVIEW, with the stateful controllers pulled into focused hooks.
// This is deliberately not a generic component framework — every file below is
// a product concept that already had a name in the tab strip.

describe('the research lane is split by routed subview', () => {
  const SUBVIEWS = [
    'overview.jsx', 'news.jsx', 'options.jsx', 'earnings.jsx', 'analysts.jsx',
    'financials.jsx', 'ownership.jsx', 'filings.jsx', 'profile.jsx',
    'dividends.jsx', 'wireMini.jsx',
  ]

  it.each(SUBVIEWS)('%s exists as its own module', (file) => {
    expect(existsSync(resolve(RESEARCH_DIR, file))).toBe(true)
  })

  it('keeps the routed entry point at src/pages/research.jsx so the lazy chunk still resolves', () => {
    expect(shell()).toContain('export function Research(')
    expect(read('src/pages/index.jsx'))
      .toContain("lazyPage(() => import('./research.jsx').then((m) => m.Research))")
  })

  it('leaves the shell as a shell — routing, header rail, and subview choice only', () => {
    const src = shell()
    expect(src.split('\n').length).toBeLessThan(300)
    // the big subview bodies are gone from the shell
    for (const gone of ['function OptionsLadder', 'function DesBand',
                        'function AnalystsView', 'function SymbolNewsView',
                        'function Candles']) {
      expect(src).not.toContain(gone)
    }
  })

  it('moves the stateful controllers into use*.js hooks', () => {
    for (const hook of ['useResearchChart.js', 'useResearchKeys.js']) {
      expect(existsSync(resolve(RESEARCH_DIR, hook))).toBe(true)
    }
    expect(lane('useResearchChart.js')).toContain('export function useResearchChart')
    expect(lane('useResearchKeys.js')).toContain('export function useResearchKeys')
    // the shell consumes them rather than re-declaring the state
    expect(shell()).toContain('useResearchChart(symbol)')
    expect(shell()).toContain('useResearchKeys(symbol, route)')
  })

  it('holds every lane file under the monolith threshold that started this', () => {
    for (const file of researchFiles()) {
      expect(readFileSync(file, 'utf8').split('\n').length, file).toBeLessThan(700)
    }
  })
})

describe('research header rail (design pass target)', () => {
  const header = () => lane('header.jsx')

  it('pins the quote lane while the identity may scroll', () => {
    const src = header()
    // one sticky rail carries identity + quote + the section strip
    expect(src).toContain('data-research-rail')
    expect(src).toContain('sticky top-0')
    // identity is still the expendable, horizontally scrollable lane
    expect(src).toContain('data-research-identity-scroll')
    expect(src).toContain('data-research-quote-cluster')
  })

  it('keeps regular price, percent change and the live extended print in the pinned cluster', () => {
    const cluster = header().slice(header().indexOf('data-research-quote-cluster'))
    expect(cluster).toContain('<FlashPrice price={q.price} fmt={fmtPrice} />')
    expect(cluster).toContain('{fmtPct(q.pct)}')
    expect(cluster).toContain('{q.extLabel}')
    // the extended print survives the phone breakpoint — it is the whole point
    // of a stable rail after the close
    const ext = cluster.slice(cluster.indexOf('{q.extLabel}'))
    expect(ext).not.toContain('max-sm:hidden">\n                  <span class={extendedLabelClass')
  })

  it('marks the current section while keeping every numbered target button-shaped', () => {
    const src = header()
    expect(src).toContain('px-2.5 py-1 rounded-md border')
    expect(src).toContain('border-accent-2 text-accent-2 bg-accent-2-soft')
    expect(src).toContain('border-white/25 text-muted hover:text-ink hover:bg-surface-3')
    expect(src).not.toContain('border-b-2 border-transparent')
  })
})

describe('research right rail modules (design pass target)', () => {

  it('scrolls the wide rail independently and stacks it in task order when narrow', () => {
    const src = lane('rail.jsx')
    expect(src).toContain('lg:sticky')
    expect(src).toContain('lg:overflow-y-auto')
    expect(src).toContain('data-research-rail-modules')
  })

  it('renders the rail in the fixed task order — the reorder arrows are gone whole (Jeff 2026-08-21)', () => {
    const src = lane('rail.jsx')
    expect(src).not.toContain('onMove')
    expect(src).not.toContain('REORDER_BTN')
    expect(src).not.toContain('useRailModules')
    // synthesize → technicals → valuation → news, in source order
    const order = ['<AiReport', '<Technicals', '<Fundamentals', '<News']
    let at = src.indexOf('data-research-rail-modules')
    for (const tag of order) {
      const next = src.indexOf(tag, at)
      expect(next, tag).toBeGreaterThan(at)
      at = next
    }
  })
})

describe('news labelling (design pass target)', () => {
  it('reserves FRAGWIRE for event intelligence and NEWS FEED for the provider', () => {
    const news = lane('news.jsx')
    expect(news).toContain('`FRAGWIRE · ${symbol}`')
    expect(news).toContain("`${tl('News feed')} · ${symbol}`")
    expect(news).not.toContain("`${tl('News')} · ${symbol}`")
    // the overview rail card keeps the same provider label
    expect(lane('rail.jsx')).toContain("tl('News feed')")
    // and the wire tape stays branded FRAGWIRE
    expect(lane('wireMini.jsx')).toContain('FRAGWIRE')
  })
})

describe('overlay toggles stay idempotent under repeated clicks', () => {
  it('tears every derived series and empty pane down before rebuilding them', () => {
    const chart = lane('overviewChart.jsx')
    expect(chart).toContain('c.extra.forEach((sr) => { try { c.chart.removeSeries(sr) } catch { /* gone */ } })')
    expect(chart).toContain('c.extra = []')
    expect(chart).toContain('while (c.chart.panes().length > 1)')
  })

  it('keeps the date axis range-aware rather than bar-resolution-aware', () => {
    expect(researchSource()).toContain('timeAxis={!!activeRange?.intraday}')
    expect(lane('overviewChart.jsx'))
      .toContain('localization: timeAxis ? { timeFormatter: marketTimeLabel } : undefined')
  })
})
