import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')
const research = read('src/pages/research.jsx')
const chartSuite = read('src/components/ChartSuite.jsx')
const app = read('src/app.jsx')
const alerts = read('src/pages/alerts.jsx')
const markets = read('src/pages/markets.jsx')

describe('research header', () => {
  it('keeps portfolio holdings out of the quote header', () => {
    expect(research).not.toContain('function PositionChip(')
    expect(research).not.toContain('<PositionChip ')
    expect(research).not.toContain('/api/portfolio')
  })

  it('hands the current price to the alerts form through sessionStorage', () => {
    expect(research).toContain("sessionStorage.setItem('alert_prefill'")
    expect(research).toContain("location.hash = '#/alerts'")
  })

  it('uses matching icon boxes and strokes for watch and alert controls', () => {
    expect(research).not.toContain('>⏰</button>')
    expect(research.match(/viewBox="0 0 24 24" width="16" height="16"/g)).toHaveLength(2)
    expect(research.match(/stroke="currentColor" stroke-width="1.75"/g)).toHaveLength(2)
    expect(research.match(/inline-flex size-4 shrink-0 items-center justify-center/g)).toHaveLength(2)
  })

  it('keeps the complete quote header on one line', () => {
    expect(research).toContain('class="flex items-center gap-3 px-1 pb-2 flex-nowrap min-w-0 overflow-hidden"')
    expect(research).not.toContain('max-sm:w-full flex items-baseline')
  })
})

describe('research wire tape', () => {
  it('links each mini row at the story and keeps the source one click away', () => {
    expect(research).toContain('href={`#/wire/${e.id}`}')
    expect(research).toContain('class="grid grid-cols-[18px_78px_30px_1fr] gap-x-2 items-baseline px-3 py-[2px] hover:bg-surface-3"')
    expect(research).toContain('onClick={(ev) => ev.stopPropagation()}')
  })

  it('keeps wire events in the tape instead of obscuring the overview chart', () => {
    expect(research).not.toContain('createSeriesMarkers')
    expect(research).not.toContain("position: 'aboveBar'")
    expect(research).not.toContain('useSymbolWire')
    expect(research).not.toContain('<WireMini symbol={symbol} rows=')
    expect(research).toContain('function WireMini({ symbol })')
    expect(research).toContain('fetchSymbolWire(base, symbol)')
  })
})

describe('research tabs and keys', () => {
  it('exposes the dividends view the router already accepted', () => {
    expect(research).toContain("{ id: 'dividends', label: tl('Dividends')")
  })

  // digits carry the first ten tabs, "-" carries the eleventh; past that
  // there is no key left to promise, so those tabs print no prefix
  it('stops printing key prefixes once the speed keys run out', () => {
    expect(research).toContain('{ti < 11 && (')
    expect(research).toContain('<span class="font-normal text-accent">{ti < 10 ? (ti + 1) % 10 : \'-\'})</span>')
  })

  it('cycles the watchlist with [ and ] without leaving the current subview', () => {
    expect(research).toContain("if (e.key === '[' || e.key === ']')")
    expect(research).toContain('if (isTypingTarget(e.target)) return')
    expect(research).toContain("location.hash = `#/research/${next.toLowerCase()}${route.view ? '/' + route.view : ''}`")
  })

  it('closes the mobile rail on Escape', () => {
    expect(research).toContain('useEscape(() => setRailOpen(false), railOpen)')
  })

  it('requests the broker dividend report with its supported single scope', () => {
    expect(research).toContain('/api/ibkr/dividends?scope=single&symbol=')
    expect(research).not.toContain('/api/ibkr/dividends?scope=symbol&symbol=')
  })
})

describe('research DES band', () => {
  it('finally renders the cell number it has always been passed', () => {
    expect(research).toContain('{n != null && <span class="text-muted/50">{n} </span>}{label}')
  })

  it('reuses the existing spread and off-high helpers for the new cells', () => {
    expect(research).toContain("import { techBadges } from '../lib/badges.js'")
    expect(research).toContain("import { quoteSpread } from '../lib/dashboardRows.js'")
    expect(research).toContain("label={tl('Bid/Ask · SPR')}")
    expect(research).toContain("label={tl('% off 52w high')}")
  })
})

describe('chart control continuity', () => {
  it('keeps the overview chart mounted while range, bar, or EXT data loads', () => {
    expect(research).toContain("const [hist, setHist] = useState(null)\n  const histSymbolRef = useRef(symbol)\n  const [warmPad, setWarmPad] = useState(null)")
    expect(research).toContain('const seed = peekHistory(symbol, rangeKey, { interval: tick, prepost: ovExt })')
    expect(research).toContain('if (seed) setHist(seed)')
    expect(research).not.toContain("setHist(peekHistory(symbol, rangeKey, { interval: tick, prepost: ovExt }) ?? null)")
  })

  it('only clears the full chart when its symbol actually changes', () => {
    expect(chartSuite).toContain("barsSymbolRef.current = null\n    setBars(null)\n    setState('loading')\n  }, [symbol])")
    expect(chartSuite).not.toContain("setState('loading')\n    setBars(null)\n    fetchHistory")
    expect(chartSuite).not.toContain('}, [bars, cmpBars, cmp, prefs, intraday])')
    expect(chartSuite).toContain('prefs.type, prefs.log, prefs.ov, prefs.panes, intraday]')
  })

  it('removes empty oscillator panes before rebuilding overlays', () => {
    expect(research).toContain('while (c.chart.panes().length > 1)')
    expect(research).toContain('c.chart.removePane(c.chart.panes().length - 1)')
  })

  it('lets warmed history satisfy long moving averages', () => {
    expect(research).toContain("if (!ov['sma' + n] || warmed.length < n) continue")
    expect(research).not.toContain("if (!ov['sma' + n] || bars.length < n) continue")
  })

  it('does not refit the time axis for an overlay-only toggle', () => {
    expect(research).toContain('if (fittedBarsRef.current !== bars)')
    expect(research).toContain('fittedBarsRef.current = bars')
  })
})

describe('shell scroll restore', () => {
  it('keeps a bounded hash→offset map on the one scrolling main', () => {
    expect(app).toContain('const SCROLL_MAX = 50')
    expect(app).toContain('if (scrollTops.size > SCROLL_MAX) scrollTops.delete(scrollTops.keys().next().value)')
    expect(app).toContain('<main ref={mainRef}')
  })

  it('restores after the route paints and files offsets under the hash that produced them', () => {
    expect(app).toContain('requestAnimationFrame(() => { el.scrollTop = scrollTops.get(key) || 0 })')
    expect(app).toContain("pending = [location.hash || '#/', el.scrollTop]")
  })
})

describe('alerts prefill', () => {
  it('consumes the research ride-along exactly once', () => {
    expect(alerts).toContain("sessionStorage.getItem('alert_prefill')")
    expect(alerts).toContain("sessionStorage.removeItem('alert_prefill')")
    expect(alerts).toContain('const [prefill] = useState(consumeAlertPrefill)')
  })
})

describe('markets calendar', () => {
  it('clears the open event detail on Escape', () => {
    expect(markets).toContain("useEscape(() => setOpenKey(''), !!openKey)")
  })
})
