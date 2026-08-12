import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')
const research = read('src/pages/research.jsx')
const app = read('src/app.jsx')
const alerts = read('src/pages/alerts.jsx')
const markets = read('src/pages/markets.jsx')

describe('research header', () => {
  it('reads the broker book from the same endpoint the portfolio page uses', () => {
    expect(research).toContain("fetch(`${base.replace(/\\/$/, '')}/api/portfolio`")
    expect(research).toContain('const POSITIONS_TTL = 60_000')
    // one shared in-flight promise, not a fetch per header render
    expect(research).toContain('positionsCache = { ts: Date.now(), value }')
  })

  it('hides the position chip when flat or when the wire is down', () => {
    expect(research).toContain('if (!pos) return null')
    expect(research).toContain("if (!base) return Promise.resolve([])")
  })

  it('hands the current price to the alerts form through sessionStorage', () => {
    expect(research).toContain("sessionStorage.setItem('alert_prefill'")
    expect(research).toContain("location.hash = '#/alerts'")
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
