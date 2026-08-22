import { useEffect, useState } from 'preact/hooks'
import { Overlay } from '../../components/Overlay.jsx'
import { hrefFor } from '../../lib/route.js'
import { getLocale, tl, t as tt } from '../../lib/i18n.js'
import { fetchCnIndustry, isCnListing } from '../../lib/cnData.js'
import { fetchHistory, peekHistory, rangeReturn } from '../../lib/history.js'
import { fetchFundamentals, peekFundamentals, fetchProfile, peekProfile } from '../../lib/fundamentals.js'
import { fetchEarningsDate, peekEarningsDate } from '../../lib/fundamentals.js'
import {
  fmtPrice, fmtPriceBare, fmtPct, fmtVol, fmtBig, fmtRatio, fmtFracPct,
} from '../../lib/format.js'
import { Fig } from '../../components/Fig.jsx'
import { getCached } from '../../lib/feed.js'
import { useWatchlist } from '../../hooks.js'
import { techBadges } from '../../lib/badges.js'
import { quoteSpread } from '../../lib/dashboardRows.js'
import { ratingTone } from './shared.jsx'
import { Candles } from './overviewChart.jsx'
import { WireMini } from './wireMini.jsx'
import { RailModules } from './rail.jsx'

function SymbolPrompt() {
  const [value, setValue] = useState('')
  const watchlist = useWatchlist()
  const recents = (() => {
    try { return JSON.parse(localStorage.getItem('tape-recent-syms') || '[]') }
    catch { return [] }
  })()
  const go = (e) => {
    e.preventDefault()
    const sym = value.trim().toUpperCase()
    if (sym) location.hash = hrefFor('research', sym.toLowerCase())
  }
  const FUNCS = [
    ['1', 'Overview', 'chart · DES stat band · technicals · fundamentals · news', ''],
    ['2', 'Chart', 'full workbench — overlays, RSI/MACD panes, compare mode', '/intraday'],
    ['3', 'Options', 'chain with greeks', '/options'],
    ['4', 'Earnings', 'years of prints, surprises, price reactions', '/earnings'],
    ['5', 'Analysts', 'rec trend, price targets, rating changes', '/analysts'],
    ['6', 'Insider', 'insider transactions', '/insider'],
    ['7', 'Holders', 'institutional + insider ownership', '/holders'],
    ['8', 'Filings', 'the SEC trail', '/filings'],
    ['9', 'Profile', 'sector, business, officers', '/profile'],
    ['0', 'Wire', 'everything fragwire captured on the name', '/wire'],
  ]
  const openSym = (sym, view = '') =>
    (location.hash = `#/research/${sym.toLowerCase()}${view}`)
  return (
    <div class="flex-1 p-6 select-none">
      <div class="max-w-4xl mx-auto flex flex-col gap-4">
        <form onSubmit={go} class="bg-surface-1 border border-line rounded-2xl p-5">
          <h1 class="font-mono font-bold text-[13px] tracking-wider text-accent uppercase mb-1">{tl('Research')}</h1>
          <p class="font-mono text-[11px] text-muted mb-3">
            {tt('research.landing_hint')}
          </p>
          <div class="flex gap-2 max-w-sm">
            <input
              value={value}
              onInput={(e) => setValue(e.target.value)}
              placeholder="NVDA, SPY, BTC-USD…"
              class="flex-1 bg-surface-0 border border-line-2 rounded-lg px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-accent"
            />
            <button type="submit" class="bg-accent text-surface-0 font-mono font-bold text-[12px] px-4 rounded-lg hover:opacity-90">{tl('GO')}</button>
          </div>
        </form>

        <div class="grid gap-4 md:grid-cols-2">
          <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
            <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
              <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Functions')}</h2>
            </header>
            <div class="py-1">
              {FUNCS.map(([n, name, desc, view]) => (
                <button
                  key={n}
                  onClick={() => { const target = recents[0] || watchlist[0]; if (target) openSym(target, view) }}
                  // grid, not flex+widths: tracks align by construction, so
                  // mobile font inflation can't stagger the columns
                  // (Jeff 2026-08-06: "align the content here into columns")
                  class="w-full text-left px-3 py-[5px] font-mono text-[11.5px] hover:bg-surface-3 grid grid-cols-[1.4rem_5.6rem_minmax(0,1fr)] gap-2 items-baseline"
                >
                  <span class="text-accent">{n})</span>
                  <span class="text-ink">{tl(name)}</span>
                  <span class="text-muted truncate">{tl(desc)}</span>
                </button>
              ))}
            </div>
          </section>

          <div class="flex flex-col gap-4">
            <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
              <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
                <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Watchlist')}</h2>
              </header>
              <div class="p-2.5 flex flex-wrap gap-1.5">
                {watchlist.slice(0, 16).map((sym) => (
                  <button
                    key={sym}
                    onClick={() => openSym(sym)}
                    class="font-mono text-[11px] px-2 py-1 rounded border border-line text-ink-2 hover:text-accent hover:border-accent/60"
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </section>
            {recents.length > 0 && (
              <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
                <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
                  <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Recent')}</h2>
                </header>
                <div class="p-2.5 flex flex-wrap gap-1.5">
                  {recents.slice(0, 10).map((sym) => (
                    <button
                      key={sym}
                      onClick={() => openSym(sym)}
                      class="font-mono text-[11px] px-2 py-1 rounded border border-line text-ink-2 hover:text-accent hover:border-accent/60"
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
              <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
                <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('From the terminal')}</h2>
              </header>
              <div class="p-3 font-mono text-[11px] text-muted leading-relaxed">
                {tt('research.terminal_hint')}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

// DES-style stat band under the overview chart — numbered blocks, dense
// mono, the bloomberg register (Jeff's GSK DES reference, 2026-08-03)
// numbers are reserved for keyboard targets (tabs); stat cells are read-only
function DesCell({ n, label, value, tone, big }) {
  return (
    <div class="flex flex-col gap-0.5 px-2.5 py-1.5 min-w-0">
      {/* the cell number was passed in from the start but never drawn — it's
          the DES grid's coordinate, dimmer than the label it prefixes */}
      <span class="text-[8.5px] text-muted uppercase tracking-wider truncate">
        {n != null && <span class="text-muted/50">{n} </span>}{label}
      </span>
      <span class={`font-mono min-w-0 truncate ${big ? 'text-[14px] font-semibold' : 'text-[12.5px] font-medium'} ${tone || 'text-ink'}`} title={value ?? ''}><Fig v={value} /></span>
    </div>
  )
}

function DesBand({ symbol, bars, rangeKey }) {
  // a zh reader's HK / mainland name carries the exchange's industry label
  const [cnIndustry, setCnIndustry] = useState('')
  useEffect(() => {
    setCnIndustry('')
    if (getLocale() !== 'zh' || !isCnListing(symbol)) return undefined
    let live = true
    fetchCnIndustry(symbol).then((v) => { if (live) setCnIndustry(v) }).catch(() => {})
    return () => { live = false }
  }, [symbol])
  const [f, setF] = useState(() => peekFundamentals(symbol) ?? null)
  const [yr, setYr] = useState(() => peekHistory(symbol, '1Y') ?? null)
  const [cal, setCal] = useState(() => peekEarningsDate(symbol) ?? null)
  const [prof, setProf] = useState(() => peekProfile(symbol) ?? null)
  useEffect(() => {
    setF(peekFundamentals(symbol) ?? null)
    setYr(peekHistory(symbol, '1Y') ?? null)
    setCal(peekEarningsDate(symbol) ?? null)
    setProf(peekProfile(symbol) ?? null)
    fetchFundamentals(symbol).then(setF).catch(() => setF({}))
    fetchHistory(symbol, '1Y').then(setYr).catch(() => {})
    fetchEarningsDate(symbol).then(setCal).catch(() => {})
    fetchProfile(symbol).then(setProf).catch(() => {})
  }, [symbol])
  const cached = getCached(symbol)
  const q = cached?.quote
  const price = q?.price ?? (bars?.length ? bars[bars.length - 1].close : null)
  const pct = q?.pct ?? null
  // return over the VISIBLE range, labelled by it — this cell said "YTD"
  // regardless of the range picked (Jeff 2026-08-17)
  const rr = rangeReturn(bars, price, rangeKey || '')
  const tone = (v) => (v == null ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down')
  // trailing returns off the 1Y daily series — bars are oldest-first seconds
  const ret = (days) => {
    const bs = yr?.bars
    if (!bs?.length || price == null) return null
    const cutoff = Date.now() / 1000 - days * 86400
    const b = bs.find((x) => x.time >= cutoff)
    return b && b !== bs[bs.length - 1] ? ((price / b.close) - 1) * 100 : null
  }
  const ret1y = yr?.bars?.length && price != null
    ? ((price / yr.bars[0].close) - 1) * 100 : null
  const yNow = new Date().getFullYear()
  const yFirst = yr?.bars?.find((b) => new Date(b.time * 1000).getFullYear() === yNow)
  const ytdFull = yFirst && price != null ? ((price / yFirst.close) - 1) * 100 : null
  const wkPos = f?.fiftyTwoWeekHigh != null && f?.fiftyTwoWeekLow != null && price != null
    ? (price - f.fiftyTwoWeekLow) / (f.fiftyTwoWeekHigh - f.fiftyTwoWeekLow) : null
  // spread and drawdown-from-high both already have one implementation each
  // (dashboardRows / badges) — the band reads them, it doesn't re-derive them
  const spread = quoteSpread(q)
  const badges = yr?.bars?.length
    ? techBadges({ closes: yr.bars.map((b) => b.close), volumes: yr.bars.map((b) => b.volume) })
    : null
  return (
    <div class="border-t border-line grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 divide-x divide-line select-none">
      <DesCell n={1} label={tl('Px / Chg')} big
        value={price != null ? `${fmtPrice(price)}${pct != null ? ` ${fmtPct(pct)}` : ''}` : null}
        tone={tone(pct)} />
      <DesCell n={2} label={tl('52wk H / L')}
        value={f?.fiftyTwoWeekHigh != null ? `${fmtPrice(f.fiftyTwoWeekHigh)} / ${fmtPrice(f.fiftyTwoWeekLow)}` : null} />
      <DesCell n={3} label={tl('52wk pos')}
        value={wkPos != null ? `${Math.round(wkPos * 100)}%` : null}
        tone={wkPos != null && wkPos > 0.5 ? 'text-up' : 'text-ink-2'} />
      <DesCell n={4} label={rr.label || tl('range')}
        value={rr.pct != null ? fmtPct(rr.pct) : null} tone={tone(rr.pct)} />
      <DesCell n={5} label={tl('Mkt cap / EV')}
        value={f?.marketCap != null ? `${fmtBig(f.marketCap)}${f.enterpriseValue ? ` / ${fmtBig(f.enterpriseValue)}` : ''}` : null} />
      <DesCell n={6} label={tl('Shrs out / float')}
        value={f?.sharesOutstanding != null ? `${fmtVol(f.sharesOutstanding)}${f.floatShares ? ` / ${fmtVol(f.floatShares)}` : ''}` : null} />
      <DesCell n={7} label={tl('Vol / avg')}
        value={f?.volume != null ? `${fmtVol(f.volume)}${f.averageVolume ? ` / ${fmtVol(f.averageVolume)}` : ''}` : null} />
      <DesCell n={8} label={tl('Open / prev')}
        value={f?.open != null ? `${fmtPrice(f.open)} / ${fmtPrice(f.previousClose)}` : null} />
      <DesCell n={9} label={tl('Tgt / upside')}
        value={f?.targetMeanPrice != null ? `${fmtPrice(f.targetMeanPrice)}${price ? ` ${fmtPct(((f.targetMeanPrice / price) - 1) * 100)}` : ''}` : null}
        tone={f?.targetMeanPrice != null && price ? (f.targetMeanPrice >= price ? 'text-up' : 'text-down') : null} />
      <DesCell n={10} label={tl('Consensus')}
        value={f?.recommendationKey ? f.recommendationKey.replace('_', ' ').toUpperCase() : null}
        tone={f?.recommendationKey ? ratingTone(f.recommendationKey) : null} />
      <DesCell n={11} label={tl('Short % flt')}
        value={f?.shortPercentOfFloat != null ? fmtFracPct(f.shortPercentOfFloat) : null} />
      <DesCell n={12} label={tl('Beta / D-E')}
        value={f?.beta != null ? `${fmtRatio(f.beta)}${f.debtToEquity != null ? ` / ${fmtRatio(f.debtToEquity)}` : ''}` : null} />
      <DesCell n={13} label={tl('P/E t / fwd')}
        value={f?.trailingPE != null || f?.forwardPE != null ? `${fmtRatio(f?.trailingPE)} / ${fmtRatio(f?.forwardPE)}` : null} />
      <DesCell n={14} label="EV/EBITDA"
        value={f?.enterpriseToEbitda != null ? fmtRatio(f.enterpriseToEbitda) : null} />
      <DesCell n={15} label={tl('FCF ttm')}
        value={f?.freeCashflow != null ? fmtBig(f.freeCashflow) : null} />
      <DesCell n={16} label={tl('Div yld')}
        value={f?.dividendYield != null ? fmtFracPct(f.dividendYield) : '—'} />
      <DesCell n={17} label={tl('Ret 1w / 1m')}
        value={ret(7) != null ? `${fmtPct(ret(7))} / ${fmtPct(ret(30))}` : null}
        tone={tone(ret(30))} />
      <DesCell n={18} label={tl('Ret 3m / 6m')}
        value={ret(91) != null ? `${fmtPct(ret(91))} / ${fmtPct(ret(182))}` : null}
        tone={tone(ret(182))} />
      <DesCell n={19} label={tl('Ret ytd / 1y')}
        value={ytdFull != null || ret1y != null ? `${fmtPct(ytdFull)} / ${fmtPct(ret1y)}` : null}
        tone={tone(ret1y)} />
      <DesCell n={20} label={tl('Next ern')}
        value={cal?.date ? `${new Date(cal.date).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }).toLowerCase()} · ${Math.max(0, Math.round((cal.date - Date.now()) / 86400000))}${getLocale() === 'zh' ? '天' : 'd'}` : null} />
      <DesCell n={21} label={tl('Sector')} value={cnIndustry || prof?.sector || null} />
      <DesCell n={22} label={tl('Industry')} value={prof?.industry || null} />
      <DesCell n={23} label={tl('Employees')}
        value={prof?.employees != null ? prof.employees.toLocaleString('en-US') : null} />
      <DesCell n={24} label={tl('Avg $ vol')}
        value={f?.averageVolume != null && price != null ? fmtBig(f.averageVolume * price) : null} />
      <DesCell n={25} label={tl('Gross / op mgn')}
        value={f?.grossMargins != null ? `${fmtFracPct(f.grossMargins)} / ${fmtFracPct(f.operatingMargins)}` : null} />
      <DesCell n={26} label={tl('Net mgn / ROE')}
        value={f?.profitMargins != null ? `${fmtFracPct(f.profitMargins)}${f.returnOnEquity != null ? ` / ${fmtFracPct(f.returnOnEquity)}` : ''}` : null} />
      <DesCell n={27} label={tl('Rev / EPS gr')}
        value={f?.revenueGrowth != null ? `${fmtFracPct(f.revenueGrowth)}${f.earningsGrowth != null ? ` / ${fmtFracPct(f.earningsGrowth)}` : ''}` : null}
        tone={f?.revenueGrowth != null ? (f.revenueGrowth >= 0 ? 'text-up' : 'text-down') : null} />
      <DesCell n={28} label="P/S / P/B"
        value={f?.priceToSalesTrailing12Months != null || f?.priceToBook != null
          ? `${fmtRatio(f?.priceToSalesTrailing12Months)} / ${fmtRatio(f?.priceToBook)}` : null} />
      <DesCell n={29} label={tl('PEG / payout')}
        value={f?.pegRatio != null || f?.payoutRatio != null
          ? `${fmtRatio(f?.pegRatio)} / ${fmtFracPct(f?.payoutRatio)}` : null} />
      <DesCell n={30} label={tl('Div rate')}
        value={f?.dividendRate != null ? fmtPrice(f.dividendRate) : '—'} />
      <DesCell n={31} label={tl('Bid/Ask · SPR')}
        value={spread != null ? `${fmtPriceBare(q.bid)} / ${fmtPriceBare(q.ask)} · ${fmtPriceBare(spread)}` : null} />
      <DesCell n={32} label={tl('% off 52w high')}
        value={badges?.offHigh != null ? fmtPct(badges.offHigh) : null}
        tone={badges?.offHigh != null && badges.offHigh > -5 ? 'text-up' : 'text-ink-2'} />
    </div>
  )
}

export { SymbolPrompt }

/** The default (no route.view) subview: chart + DES band + wire tape on the
 *  left, the reorderable module rail on the right — a slide-over on phone. */
export function Overview({ symbol, chart, railOpen, setRailOpen }) {
  const { hist, warmPad, err, activeRange, rangeKey, selectRange,
          tick, setTick, ovExt, setOvExt } = chart
  return (
    <div class="grid gap-2 lg:grid-cols-[1fr_320px]">
      <section class="bg-surface-1 border border-line rounded-xl min-w-0 overflow-hidden flex flex-col self-stretch">
        <div class="p-2 pb-0">
        {hist ? (
          <Candles bars={hist.bars} warmPad={warmPad} intraday={hist.intraday}
            timeAxis={!!activeRange?.intraday}
            ticks={activeRange?.ticks} tick={tick || activeRange?.interval} onTick={setTick}
            rangeKey={rangeKey} onRange={selectRange}
            ext={ovExt} onExt={setOvExt} canExt={!!activeRange?.intraday} />
        ) : (
          <div class="h-[380px] flex items-center justify-center font-mono text-[11px] text-muted">
            {err ? 'no chart' : 'loading…'}
          </div>
        )}
        </div>
        <DesBand symbol={symbol} bars={hist?.bars} rangeKey={rangeKey} />
        <WireMini symbol={symbol} />
      </section>
      <div class="max-lg:hidden flex flex-col gap-3 min-w-0"><RailModules symbol={symbol} /></div>
      {/* below lg the rail lives behind a right-edge grip: a slide-over
         panel, not a stack the user has to scroll past */}
      <button
        onClick={() => setRailOpen(!railOpen)}
        title={railOpen ? 'hide panel' : 'show panel'}
        class={`lg:hidden fixed top-1/2 -translate-y-1/2 z-50 py-4 px-0.5 rounded-l-md border border-r-0 border-line bg-surface-1 font-mono text-[10px] leading-[0.6] text-muted hover:text-ink transition-all ${railOpen ? 'right-[320px]' : 'right-0'}`}
      >
        ⋮
      </button>
      {railOpen && (
        /* a bare panel: the slide-over deliberately keeps no scrim, so the
           chart behind it stays readable while the rail is open */
        <Overlay
          onClose={() => setRailOpen(false)}
          label={tl('rail')}
          backdrop={false}
          class="lg:hidden fixed right-0 top-0 bottom-0 w-[320px] z-40 overflow-y-auto bg-surface-0 border-l border-line p-2 flex flex-col gap-3"
        >
          <RailModules symbol={symbol} />
        </Overlay>
      )}
    </div>
  )
}
