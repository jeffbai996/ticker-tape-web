import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboard = readFileSync(resolve(process.cwd(), 'src/pages/dashboard.jsx'), 'utf8')
const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')

describe('compact dashboard company name', () => {
  it('obscures the name only in the compact touch layout', () => {
    expect(dashboard).toContain('class={`tui-row group/row')
    expect(dashboard).toContain('class="tui-company-identity relative flex items-baseline gap-1.5 flex-1 min-w-0')
    expect(dashboard).toContain('data-ticker-reveal-target class="tui-company-symbol shrink-0" onClick={onIdentityTap}')
    expect(dashboard).toContain('data-inline-name class="hidden @min-[545px]:block @min-[820px]:hidden min-w-0"')
    expect(dashboard).toMatch(/data-inline-name[\s\S]{0,200}<Marquee text=\{q\.name\}/)
    expect(dashboard).toContain('class="tui-company-name-swap @min-[545px]:hidden"')
    expect(dashboard).toContain('aria-hidden="true"')
    expect(dashboard).toContain('class="tui-company-name-wide hidden @min-[820px]:block')
    expect(css).toMatch(/\.tui-company-identity\s*\{[\s\S]*overflow: hidden;/)
    expect(dashboard).toContain('class="tui-quote-cluster flex items-baseline gap-1.5 max-sm:gap-1 shrink-0"')
    expect(dashboard).toContain('max-w-[220px] @min-[1080px]:max-w-[300px]')
    // wide-band floors sit at the WIDEST normal print so every row's price
    // shares one x — a row with no PM/AH (or a two-digit move) must not sit
    // left of its neighbours (Jeff 2026-08-18)
    expect(dashboard.match(/@min-\[545px\]:min-w-\[7\.5rem\] @min-\[545px\]:text-right/g)).toHaveLength(2)
    expect(dashboard).toContain('@min-[545px]:min-w-[8.4rem] shrink-0')
    expect(dashboard).not.toContain('@min-[820px]:min-w-[7rem]')
    expect(dashboard).not.toContain('@min-[820px]:min-w-[7.7rem]')
    expect(dashboard).not.toContain('@min-[820px]:min-w-[9.4rem]')
    expect(dashboard).toMatch(/tui-quote-cluster[\s\S]*q\.extLabel[\s\S]*q\.extPrice/)
  })

  it('animates one compact name without restoring the black overlay', () => {
    expect(dashboard).not.toContain("matchMedia('(hover: none)').matches")
    expect(dashboard).toContain('onIdentityTap')
    expect(dashboard).toContain('revealedSym')
    expect(dashboard).toContain('onReveal')
    expect(dashboard).toContain('is-revealed')
    expect(dashboard).toContain('tui-company-name-swap')
    expect(css).toContain('.tui-row.is-revealed .tui-company-name-swap')
    expect(css).not.toContain('.tui-row.is-revealed .tui-quote-cluster')
    expect(css).toMatch(/\.tui-row\.is-revealed \.tui-company-name-swap\s*\{[\s\S]*width: 100%;[\s\S]*max-width: 100%;/)
    expect(css).not.toMatch(/\.tui-row\.is-revealed[\s\S]{0,1000}\.tui-quote-cluster[\s\S]{0,120}opacity:\s*0/)
    expect(css).not.toContain('background: linear-gradient(90deg')
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
    expect(dashboard).toContain('{fmtPct(q.pct)}')
    expect(dashboard).not.toContain('<FlashMetric value={q.pct} fmt={fmtPct} kind="change" />')
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
    expect(dashboard).toMatch(/setViewMode\('flat'\)[\s\S]{0,350}\{tl\('All'\)\}[\s\S]{0,350}setViewMode\('grouped'\)[\s\S]{0,350}\{tl\('Sectors'\)\}/)
    // search rests folded (desktop keeps a readable Search… pill) and
    // animates open on click
    expect(dashboard).toContain("placeholder={`${tl('Search')}…`}")
    expect(dashboard).toContain('transition-[width,background-color,border-color,box-shadow]')
    expect(dashboard).toContain('max-sm:placeholder:text-transparent')
    expect(dashboard).toContain("expanded ? 'w-[min(6rem,24vw)] sm:w-60 pr-2'")
    expect(dashboard).not.toContain("expanded ? 'w-44 sm:w-60 pr-2'")
    // sort and the watchlist picker stay in the menu; select is a first-class
    // toolbar action directly after search
    expect(dashboard).toContain('function BoardMenu')
    expect(dashboard).toContain("['spread', tl('Spread')]")
    expect(dashboard).toContain("{item(tl('Dashboard'), !listId,")
    expect(dashboard).not.toContain("{head(tl('Actions'))}")
    expect(dashboard).not.toContain('onSelectMode')
    expect(dashboard).toMatch(/<TickerSearch[^>]+\/>\s*<button data-select-trigger/)
    expect(dashboard).toContain("{tl('Select')}")
    expect(dashboard).not.toContain('<option value="manual"')
    expect(dashboard).not.toContain('manage lists')
  })

  it('reserves the extended-hours slot while its quote is missing', () => {
    // a floor, never a ceiling: the fixed 6.2rem box clipped the trailing %
    // of a 4-digit ext print (ON 1834.59 ▼2.0%) on phones (Jeff 2026-08-18)
    expect(dashboard).not.toMatch(/max-sm:w-\[6\.2rem\]/)
    expect(dashboard.match(/max-sm:min-w-\[6\.2rem\]/g)).toHaveLength(2)
    expect(dashboard).toContain("q?.extLabel && q.extPrice != null ? (")
    expect(dashboard).not.toContain(") : marketState(new Date()).state !== 'open' ? (")
    expect(dashboard).not.toMatch(/aria-hidden="true"[\s\S]{0,500}\) : null\}/)
    expect(dashboard).toMatch(/q\?\.extLabel && q\.extPrice != null \? \([\s\S]*\) : \([\s\S]*invisible[\s\S]*aria-hidden="true"/)
  })

  it('keeps sectors visible while selection actions float above the viewport edge', () => {
    const toolbarStart = dashboard.indexOf('<div class="dashboard-toolbar')
    const toolbarEnd = dashboard.indexOf('{selecting && (', toolbarStart)
    const toolbar = dashboard.slice(toolbarStart, toolbarEnd)

    expect(toolbar).toContain('<SectorScroller watchlist={watchlist} quotes={quotes} />')
    expect(toolbar).not.toContain('data-select-actions')
    expect(dashboard).toContain('data-select-actions role="toolbar"')
    expect(dashboard).toContain('selection-island fixed left-1/2')
    expect(dashboard).toContain('-translate-x-1/2')
    expect(dashboard).toContain('bottom-[calc(env(safe-area-inset-bottom)+3.25rem)] md:bottom-10')
    expect(dashboard).toContain('z-50')
    expect(dashboard).not.toContain('lg:mr-[238px]')
  })

  // 2026-08-11: reordering is a thing you do to the rows, not a separate mode.
  // The grip lives on the row inside select mode; the bottom-right ⇅ button
  // and the whole ReorderList screen are gone.
  it('drags rows to reorder from inside select mode', () => {
    expect(dashboard).toContain('class="tui-drag-handle')
    expect(dashboard).toContain('const grabbable = selecting && !!dragScope && !!drag')
    expect(dashboard).toContain('data-row-symbol={symbol}')
    expect(dashboard).toContain('data-drag-scope={dragScope || undefined}')
    // pointer events, never HTML5 DnD — iOS Safari has no dragstart at all
    expect(dashboard).toContain('onPointerDown={(e) => drag.onPointerDown(symbol, e)}')
    expect(dashboard).toContain('onPointerCancel={drag.onPointerCancel}')
    expect(dashboard).toContain('setPointerCapture?.(e.pointerId)')
    expect(dashboard).not.toMatch(/draggable\b/)
    expect(dashboard).not.toContain('dataTransfer')
    expect(css).toMatch(/\.tui-drag-handle\s*\{[\s\S]*touch-action: none;/)
    // the grip takes the meters' space rather than squeezing in beside them
    expect(dashboard).toContain("${grabbable ? 'hidden' : 'hidden @min-[545px]:flex'} shrink-0 flex-col")
    expect(dashboard).toContain("${grabbable ? ' pr-11' : ''}")
    // manual order only: a live % sort would snap the row straight back
    expect(dashboard).toContain("selecting && sort === 'manual' ? scope : null")
    expect(dashboard).toContain('dragScope={dragScopeFor(g.name)}')
    expect(dashboard).toContain("dragScope={dragScopeFor('flat')}")
  })

  it('moves the drop marker by transform and never per-frame setState', () => {
    expect(dashboard).toContain('class="board-drop-line pointer-events-none absolute inset-x-0 top-0')
    expect(dashboard).toMatch(/line\.style\.transform = `translateY\(/)
    // the move handler must not touch state — dragSym is set once per drag
    expect(dashboard).toMatch(/onPointerMove: \(e\) => \{[\s\S]*?paintDrop\(e\.clientY\)\s*\},/)
    expect(dashboard).not.toMatch(/onPointerMove: \(e\) => \{[\s\S]*?setDrag/)
    // geometry is read once at pointerdown, not on every move
    expect(dashboard).toContain('rows: measureScope(scope)')
    expect(css).toMatch(/\.board-drop-line\s*\{[\s\S]*will-change: transform;/)
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*\.board-drop-line/)
  })

  it('drops the standalone reorder mode it replaces', () => {
    expect(dashboard).not.toContain('function ReorderList')
    expect(dashboard).not.toContain('setReordering')
    expect(dashboard).not.toContain('reordering')
    expect(dashboard).not.toContain('onReorder')
    expect(dashboard).not.toContain("tl('reorder')")
    expect(dashboard).not.toContain("tl('drag rows or use the arrows')")
    // the add row survived the reorder-mode deletion; it now also carries the
    // cap so a full board reports itself (see cap_notices.test.js)
    expect(dashboard).toContain('<AddSymbolRow onAdd={addSymbol} isPresent={isPresent} isFull={listFull} cap={listCap} />')
  })

  it('computes the grouped board once per input change, not per quote tick', () => {
    expect(dashboard).toContain('const { visibleManual, ordered } = useMemo(')
    expect(dashboard).toContain("if (viewMode !== 'grouped') return { visibleManual: [], ordered: [] }")
    expect(dashboard).not.toContain('quickFilterKey')
    expect(dashboard).toContain("[viewMode, watchKey, filter, nameKey, groupsRev, groupPrefs.order.join(',')]")
    // the flat view's numeric sorts stay live, but only while it is on screen
    expect(dashboard).toContain("selectFlatRows(watchlist, quotes, { filter, sort })")
  })

  it('stops the DAY spark fan-out while the tab is hidden', () => {
    expect(dashboard).toContain('if (!initial && document.hidden) { missed = true; return }')
    expect(dashboard).toContain("document.addEventListener('visibilitychange', onVisible)")
    expect(dashboard).toContain("document.removeEventListener('visibilitychange', onVisible)")
    // still ONE interval driving the whole board
    expect(dashboard.match(/setInterval\(refresh/g)).toHaveLength(1)
  })

  it('translates the strings the zh board was still rendering in English', () => {
    expect(dashboard).toContain("title={folded ? tl('expand') : tl('collapse')}")
    expect(dashboard).toContain("title={tl('unwatch %s').replace('%s', symbol)}")
    expect(dashboard).toContain("title={tl('drag to reorder')}")
    // nothing left rendering a bare English literal into a title
    expect(dashboard).not.toMatch(/title="[a-z]/)
  })

  it('keeps autocomplete identity compact and draws a cached six-month spark', () => {
    expect(dashboard).toContain('function SearchResultSpark({ symbol })')
    expect(dashboard).toContain("fetchHistory(symbol, '6M')")
    expect(dashboard).toContain('<Spark type="line" window="6M" bars={bars}')
    expect(dashboard).toContain('class="flex items-center gap-2 px-2.5 py-1.5 border-t border-line/60 first:border-0 hover:bg-accent-soft cursor-pointer"')
    expect(dashboard).toContain('class="w-3 h-[9px] rounded-[1px] shrink-0"')
    expect(dashboard).toContain('class="font-mono font-bold text-[10.5px] text-accent shrink-0"')
    expect(dashboard).toContain('<SearchResultSpark symbol={h.symbol} />')
    expect(dashboard).toContain("title={`${symbol} 6M`}")
    expect(dashboard).toContain('class="ml-auto inline-flex w-16 h-3.5 shrink-0 items-center"')
    expect(dashboard).toContain('class="block w-16 h-3.5"')
  })

  it('uses the menu corner for sector layout controls', () => {
    expect(dashboard).not.toContain('function BreadthPanel')
    expect(dashboard).not.toContain('QuickFilterPanel')
    expect(dashboard).not.toContain('quickFilter')
    expect(dashboard).toContain('function SectorLayoutPanel({ names, head, onDone })')
    expect(dashboard).toContain("setGroupsCollapsed(names, false)")
    expect(dashboard).toContain("setGroupsCollapsed(names, true)")
    expect(dashboard).toContain('resetGroupOrder()')
  })

  it('animates and shades the watchlist toolbar controls as one family', () => {
    expect(dashboard).toContain('aria-expanded={open}')
    expect(dashboard).toContain("open ? 'is-open' : ''")
    expect(dashboard).toContain('<span class={`board-burger ${open ? \'is-open\' : \'\'}`} aria-hidden="true">')
    expect(dashboard).not.toContain('<svg class={`board-burger')
    expect(dashboard).toContain('class="absolute inset-y-0 left-2 text-muted pointer-events-none grid place-items-center translate-y-px"')
    expect(dashboard).not.toContain("expanded ? 'left-2'")
    expect(dashboard).toContain('class="board-menu-pop z-40')
    expect(dashboard).toContain('board-control inline-flex rounded-lg')
    expect(dashboard).toContain('board-search')
    expect(dashboard).toContain("viewMode === 'grouped' ? 'bg-accent-soft text-accent shadow-sm'")
    expect(dashboard).toContain("viewMode === 'flat' ? 'bg-accent-soft text-accent shadow-sm'")
    expect(css).toContain('.board-burger-line')
    expect(css).toMatch(/\.board-burger\s*\{[\s\S]*position: relative;[\s\S]*width: 12px;[\s\S]*height: 12px;/)
    expect(css).toMatch(/\.board-burger-line\s*\{[\s\S]*top: 50%;[\s\S]*margin-top: -0\.75px;/)
    expect(css).toContain('.board-burger-line:nth-child(1) { transform: translateY(-4px); }')
    expect(css).toContain('.board-burger.is-open .board-burger-line:nth-child(1)')
    expect(css).toMatch(/\.board-burger\.is-open \.board-burger-line:nth-child\(1\)\s*\{\s*transform: rotate\(45deg\);/)
    expect(css).toContain('@keyframes board-menu-pop')
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*\.board-menu-pop/)
  })

  it('keeps the mobile search the same height as its square toolbar peers', () => {
    expect(dashboard).toContain('board-search h-[26px] min-w-0')
    expect(dashboard).toContain("expanded ? 'w-[min(6rem,24vw)] sm:w-60 pr-2'")
    expect(dashboard).toContain(": 'w-[26px] sm:w-[88px] pr-0 sm:pr-2")
    expect(dashboard).not.toContain('board-search min-w-0 border rounded-lg pl-6 py-1')
  })

  // 2026-08-11: the mobile bottom sheet is gone — it floated detached from
  // the button that opened it ("drops this far down"). One anchored dropdown
  // at every width; phones only get a tighter width cap.
  it('uses one anchored popover at every width, never a detached sheet', () => {
    expect(dashboard).toContain('class="board-menu-grid grid grid-cols-2 gap-1.5 p-1.5"')
    expect(dashboard).toContain('class="board-menu-section"')
    expect(css).toContain('@media (max-width: 639px)')
    expect(css).not.toMatch(/\.board-menu-pop[\s\S]{0,200}position: fixed;/)
    expect(css).not.toContain('@keyframes board-menu-sheet')
    expect(dashboard).not.toContain('board-menu-sheet-handle')
  })

  it('refreshes DAY sparklines progressively and feeds them into every row', () => {
    expect(dashboard).toContain('function useIntradaySparks(symbols, enabled)')
    expect(dashboard).toContain('rollCashSession(session.current, now)')
    expect(dashboard).toContain("fetchHistory(symbol, '1D')")
    expect(dashboard).toContain('const intradaySparks = useIntradaySparks(watchlist, sparkWin === \'DAY\'')
    expect(dashboard).toContain("intradayBars={intradaySparks[symbol]}")
    expect(dashboard).toContain("sparkWin === 'DAY' ? intradayBars : data?.histo")
  })

  it('merges desktop controls and the scrollable sector tape into one row', () => {
    // one row at every width — the strip scrolls, nothing wraps to a second row
    expect(dashboard).toContain('class="dashboard-toolbar flex items-center gap-2 md:gap-4 px-1 pb-2 min-w-0"')
    expect(dashboard).toContain('class="dashboard-controls flex items-center gap-2 min-w-0 shrink-0"')
    expect(dashboard).toContain('class="dashboard-sectors flex items-baseline gap-x-4 min-w-0')
    expect(dashboard).toContain('overflow-x-auto no-scrollbar')
    expect(dashboard).toContain('function SectorScroller')
    expect(dashboard).toContain('aria-label={tl(\'Scroll sectors right\')}')
    // .sector-scroll-fade was dropped: the class was never applied to any
    // element, so the rule styled nothing. The scroller itself is what this
    // test guards.
    expect(css).not.toContain('.sector-scroll-fade')
  })

  it('shows raw bid-ask spread without a basis-point suffix', () => {
    // the label now sits in its own fixed cell so VOL/AVG land on one x —
    // what this test guards is the RAW spread render, not the box around it
    expect(dashboard).toMatch(/class="text-accent\/60 text-\[9px\][^"]*">\{q && quoteSpread\(q\) != null \? 'SPR' : ''\}/)
    expect(dashboard).toContain('fmtSpread(quoteSpread(q))')
    expect(dashboard).not.toMatch(/SPR[^\n]*(?:bp|bps)/)
  })
})
