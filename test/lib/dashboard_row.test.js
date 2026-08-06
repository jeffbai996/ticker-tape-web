import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboard = readFileSync(resolve(process.cwd(), 'src/pages/dashboard.jsx'), 'utf8')
const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')

describe('compact dashboard company name', () => {
  it('swaps the ticker for the company name in the same fixed slot', () => {
    expect(dashboard).toContain('class={`tui-row group/row')
    expect(dashboard).toContain('class="tui-company-identity relative flex items-baseline gap-1.5 flex-1 min-w-0')
    expect(dashboard).toContain('class="tui-company-symbol shrink-0"')
    // the swap only covers widths too narrow to show both strings at once;
    // above that the name rides inline in the slot's spare width
    expect(dashboard).toContain('class="tui-company-name-swap @min-[545px]:hidden"')
    // 2026-08-06: the mid-band name hover-scrolls instead of hard-truncating,
    // so the reader can see the rest of a long name at that zoom
    expect(dashboard).toContain('data-inline-name class="hidden @min-[545px]:block @min-[820px]:hidden min-w-0"')
    expect(dashboard).toMatch(/data-inline-name[\s\S]{0,200}<Marquee text=\{q\.name\}/)
    expect(dashboard).toContain('aria-hidden="true"')
    expect(dashboard).toContain('class="tui-company-name-wide hidden @min-[820px]:block')
    expect(css).toContain('.tui-row:hover .tui-company-symbol')
    expect(css).toContain('.tui-row:focus-visible .tui-company-name-swap')
    expect(css).toMatch(/\.tui-company-name-swap\s*\{[\s\S]*position: absolute;[\s\S]*inset: 0;/)
    expect(css).toMatch(/\.tui-company-identity\s*\{[\s\S]*overflow: hidden;/)
    expect(css).toMatch(/\.tui-company-name-swap\s*\{[\s\S]*padding-right: 2px;/)
    expect(dashboard).toContain('class="tui-quote-cluster flex items-baseline gap-1.5 max-sm:gap-1 shrink-0"')
    expect(dashboard).toMatch(/tui-quote-cluster[\s\S]*q\.extLabel[\s\S]*q\.extPrice/)
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*\.tui-company-name-swap/)
  })

  // touch has no hover: first tap on the ticker reveals, second navigates
  it('reveals the name on a first tap where the slot cannot show both', () => {
    expect(dashboard).toContain("matchMedia('(hover: none)').matches")
    expect(dashboard).toContain('data-inline-name')
    expect(dashboard).toContain('setRevealed(true)')
    expect(dashboard).toContain("revealed ? ' is-revealed' : ''")
    expect(css).toContain('.tui-row.is-revealed .tui-company-name-swap')
    expect(css).toContain('@container (max-width: 544px)')
  })

  it('flashes the regular print as ticker-by-ticker updates land', () => {
    expect(dashboard).toContain('<FlashPrice price={q.price} fmt={fmtPrice} />')
    expect(readFileSync(resolve(process.cwd(), 'src/components/Fig.jsx'), 'utf8'))
      .toContain("document.addEventListener('visibilitychange', rebaseline)")
    expect(css).toContain('.px-flash-up { background: #00ff55; }')
    expect(css).not.toContain('@keyframes tick-flash')
  })

  it('paints daily change and only newly printed day extremes', () => {
    expect(dashboard).toContain('<FlashMetric value={q.change} fmt={fmtAbsChange} kind="change" />')
    expect(dashboard).toContain('<FlashMetric value={q.pct} fmt={fmtPct} kind="change" />')
    expect(dashboard).toContain('<FlashMetric value={lo} fmt={fmtPriceBare} kind="low" />')
    expect(dashboard).toContain('<FlashMetric value={hi} fmt={fmtPriceBare} kind="high" />')
  })

  it('fills the high-zoom regular-hours gap with a labeled day range', () => {
    expect(dashboard).toContain('function CompactDayRange')
    expect(dashboard).toContain('hidden @min-[545px]:flex @min-[730px]:hidden')
    expect(dashboard).toContain('text-down/80 w-11 text-right')
    expect(dashboard).toContain('text-up/80 w-11')
    // 2026-08-06: at this width the compact range rides the BADGE line for
    // every row. Keeping it in the meter column made the two meter lines
    // different widths (AVG 169px left of VOL), and ghosting a matching slot
    // widened the row until the identity column collapsed off screen.
    expect(dashboard).toContain('<CompactDayRange lo={q?.dayLow} hi={q?.dayHigh} v={q?.price}')
    expect(dashboard).toContain("cls=\"ml-auto shrink-0 pr-1\"")
    expect(dashboard).not.toContain('{!q?.extLabel && (')
  })

  it('sizes the sparkline continuously instead of jumping at range breakpoints', () => {
    expect(dashboard).toContain('w-[clamp(76px,18cqw,168px)]')
    expect(dashboard).not.toContain('max-w-[520px]')
  })

  it('keeps the richer day and 52-week ranges at lower browser zoom', () => {
    expect(dashboard).toContain('<RangeBar label="DAY"')
    expect(dashboard).toContain('<RangeBar label="52W"')
    expect(dashboard).toContain('hidden @min-[730px]:flex')
  })

  it('offers mapped sectors plus searchable and sortable flat views', () => {
    expect(dashboard).not.toContain('function CategoryPicker')
    expect(dashboard).not.toContain('setCategoryOverride')
    expect(dashboard).toContain("setViewMode('grouped')")
    expect(dashboard).toContain("setViewMode('flat')")
    expect(dashboard).toContain("{tl('Sectors')}")
    expect(dashboard).toContain("{tl('All')}")
    // search rests folded (desktop keeps a readable Search… pill) and
    // animates open on click
    expect(dashboard).toContain("placeholder={`${tl('Search')}…`}")
    expect(dashboard).toContain('transition-[width]')
    expect(dashboard).toContain('max-sm:placeholder:text-transparent')
    // sort, select mode and the watchlist picker fold into the board menu
    expect(dashboard).toContain('function BoardMenu')
    expect(dashboard).toContain("['spread', tl('Spread')]")
    expect(dashboard).toContain("{item(tl('Main board'), !listId,")
    expect(dashboard).not.toContain('<option value="manual"')
    expect(dashboard).not.toContain('manage lists')
  })

  it('merges desktop controls and the scrollable sector tape into one row', () => {
    // one row at every width — the strip scrolls, nothing wraps to a second row
    expect(dashboard).toContain('class="dashboard-toolbar flex items-center gap-2 md:gap-4 px-1 pb-2 min-w-0"')
    expect(dashboard).toContain('class="dashboard-controls flex items-center gap-2 min-w-0 shrink-0"')
    expect(dashboard).toContain('class={`dashboard-sectors flex items-baseline gap-x-4 min-w-0')
    expect(dashboard).toContain('overflow-x-auto no-scrollbar')
    expect(dashboard).toContain('function SectorScroller')
    expect(dashboard).toContain('aria-label={tl(\'Scroll sectors right\')}')
    expect(css).toContain('.sector-scroll-fade')
  })

  it('shows raw bid-ask spread without a basis-point suffix', () => {
    // the label now sits in its own fixed cell so VOL/AVG land on one x —
    // what this test guards is the RAW spread render, not the box around it
    expect(dashboard).toMatch(/class="text-accent\/60 text-\[9px\][^"]*">\{q && quoteSpread\(q\) != null \? 'SPR' : ''\}/)
    expect(dashboard).toContain('fmtSpread(quoteSpread(q))')
    expect(dashboard).not.toMatch(/SPR[^\n]*(?:bp|bps)/)
  })
})
