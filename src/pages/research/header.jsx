import { useEffect, useState } from 'preact/hooks'
import { tl } from '../../lib/i18n.js'
import { Marquee } from '../../components/Marquee.jsx'
import { FlashMetric, FlashPrice } from '../../components/Fig.jsx'
import { fmtPrice, fmtPriceWide, fmtPct, fmtChange, fmtVol } from '../../lib/format.js'
import { extendedLabelClass } from '../../lib/extendedHours.js'
import { watch, unwatch } from '../../lib/watchlist.js'
import { useWatchlist } from '../../hooks.js'
import { lastGoodTs } from '../../lib/feed.js'

function WatchStar({ symbol }) {
  const watched = useWatchlist().includes(symbol)
  return (
    <button
      onClick={() => (watched ? unwatch(symbol) : watch(symbol))}
      title={watched ? 'unwatch' : 'watch'}
      class="inline-flex size-4 shrink-0 items-center justify-center text-accent hover:text-accent-2"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"
        fill={watched ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.75"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="m12 2.8 2.85 5.77 6.37.93-4.61 4.49 1.09 6.34L12 17.34l-5.7 2.99 1.09-6.34L2.78 9.5l6.37-.93L12 2.8Z" />
      </svg>
    </button>
  )
}

/** Hand the current symbol + price to the alerts form (mirrors chat_prefill). */
function AlertButton({ symbol, price }) {
  const go = () => {
    try {
      sessionStorage.setItem('alert_prefill', JSON.stringify({
        symbol, value: price != null ? Number(Number(price).toFixed(2)) : null,
      }))
    } catch { /* storage unavailable — the form just opens empty */ }
    location.hash = '#/alerts'
  }
  return (
    <button onClick={go} title={tl('alert on this symbol')}
      class="inline-flex size-4 shrink-0 items-center justify-center text-accent hover:text-accent-2">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"
        fill="none" stroke="currentColor" stroke-width="1.75"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
    </button>
  )
}

/** Dead-feed tell for the quote header. A frozen price looks exactly like a
 *  quiet one, and the dashboard/sidebar already say so when the sweep stops —
 *  research was the only place still showing stale numbers straight-faced.
 *  Own component so its 10s tick can't repaint the whole page. */
function StaleQuoteTag() {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000)
    return () => clearInterval(t)
  }, [])
  const good = lastGoodTs()
  if (!good) return null
  const mins = Math.floor((Date.now() - good) / 60_000)
  if (mins < 5) return null      // same threshold as the sidebar's banner
  return (
    // amber, not red: this is feed health, and a limping feed must not read as
    // a falling tape (same rule FeedIndicator states for the shell chip)
    <span class="font-mono text-[10px] text-accent font-bold whitespace-nowrap"
      title={tl('quotes stopped updating — the feed is not answering')}>
      ⚠ {tl('STALE')} {mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`}
    </span>
  )
}

/** Sticky rail (P1 design pass): identity may scroll away under a long legal
 *  name, but the quote cluster and the section strip never do — the price
 *  someone glanced up for, and the tab they're on, stay pinned. */
export function ResearchHeader({ symbol, q, route }) {
  const up = (q?.pct ?? 0) >= 0
  const extUp = (q?.extPct ?? 0) >= 0
  const tabs = [
    { id: null, label: tl('Overview'), href: `#/research/${symbol.toLowerCase()}` },
    { id: 'news', label: tl('News'), href: `#/research/${symbol.toLowerCase()}/news` },
    { id: 'intraday', label: tl('Chart'), href: `#/research/${symbol.toLowerCase()}/intraday` },
    { id: 'options', label: tl('Options'), href: `#/research/${symbol.toLowerCase()}/options` },
    { id: 'earnings', label: tl('Earnings'), href: `#/research/${symbol.toLowerCase()}/earnings` },
    { id: 'analysts', label: tl('Analysts'), href: `#/research/${symbol.toLowerCase()}/analysts` },
    { id: 'financials', label: tl('Financials'), href: `#/research/${symbol.toLowerCase()}/financials` },
    { id: 'ownership', label: tl('Ownership'), href: `#/research/${symbol.toLowerCase()}/ownership` },
    { id: 'filings', label: tl('Filings'), href: `#/research/${symbol.toLowerCase()}/filings` },
    { id: 'profile', label: tl('Profile'), href: `#/research/${symbol.toLowerCase()}/profile` },
    // route.js has accepted /dividends since it shipped; the tab strip
    // never listed it, so the view was deep-link-only (2026-08-10)
    { id: 'dividends', label: tl('Dividends'), href: `#/research/${symbol.toLowerCase()}/dividends` },
  ]
  return (
    <div data-research-rail class="sticky top-0 z-10 bg-surface-0/95 backdrop-blur-sm">
      <div data-research-header class="flex items-center gap-3 max-sm:gap-2 px-1 pb-2 flex-nowrap min-w-0 overflow-hidden">
        {/* Identity is the expendable/scrollable lane. Quotes never enter this
            scroller, so a long legal company name cannot push live data out. */}
        <div data-research-identity-scroll class="flex items-center gap-3 flex-1 min-w-0 overflow-x-auto overscroll-x-contain no-scrollbar">
          <h1 class="font-tick font-bold text-lg text-ink shrink-0">{symbol}</h1>
          <WatchStar symbol={symbol} />
          <AlertButton symbol={symbol} price={q?.price} />
          {q?.name && (
            /* bounded + sweepable: tap (phone) or hover (desktop) scrolls a
               long legal name; the identity lane no longer relies on the
               user discovering it's finger-scrollable (Jeff 2026-08-17) */
            <Marquee data-research-company-name text={q.name} title={`${symbol} — ${q.name}`}
              class="block min-w-0 max-w-[46vw] sm:max-w-[28rem] text-[12px] text-muted font-anth" />
          )}
        </div>
        {q && (
          <span data-research-quote-cluster class="ml-auto flex items-baseline gap-x-3 max-sm:gap-x-2 shrink-0 whitespace-nowrap">
              <span class="font-mono font-bold text-lg max-sm:text-[15px] text-ink price-grouped whitespace-nowrap"><FlashPrice price={q.price} fmt={fmtPriceWide} /></span>
              <span class={`font-mono text-[15px] max-sm:text-[12px] ${up ? 'text-up' : 'text-down'}`}>
                <span class="font-semibold max-sm:hidden"><FlashMetric value={q.change} fmt={fmtChange} /></span>{' '}
                <span class="font-normal">{fmtPct(q.pct)}</span>
              </span>
              {q.volume != null && (
                <span class="font-mono text-[11px] text-muted max-sm:hidden">vol {fmtVol(q.volume)}</span>
              )}
              <span class="max-sm:hidden"><StaleQuoteTag /></span>
              {q.extLabel && q.extPrice != null && (
                <span class="font-mono text-[12px] max-sm:text-[11px] whitespace-nowrap">
                  <span class={extendedLabelClass(q.extLabel)}>{q.extLabel}</span>{' '}
                  <span class="text-ink-2 price-grouped whitespace-nowrap"><FlashPrice price={q.extPrice} fmt={fmtPriceWide} /></span>
                  {q.extPct != null && (
                    <span class={`ml-1.5 max-sm:hidden ${extUp ? 'text-up' : 'text-down'}`}>
                      {extUp ? '▲' : '▼'}{Math.abs(q.extPct).toFixed(2)}%
                    </span>
                  )}
                </span>
              )}
            </span>
        )}
        {/* the range + bar-interval pickers live inside the Overview chart
            card now, ChartSuite-style (Jeff 2026-08-09: "time pills into the
            chart also") — the header carries only identity and quote */}
      </div>

      <div class="flex gap-1 px-1 pb-2 select-none flex-nowrap overflow-x-auto no-scrollbar">
        {tabs.map((tab, ti) => (
          <a
            key={tab.label}
            href={tab.href}
            class={`font-mono text-[9.5px] px-2.5 py-1 rounded-md border hover:no-underline whitespace-nowrap shrink-0 ${
              route.view === tab.id
                ? 'border-accent-2 text-accent-2 bg-accent-2-soft'
                : 'border-white/25 text-muted hover:text-ink hover:bg-surface-3'
            }`}
          >
            {/* Weight lives on the WORD only. It used to sit on the anchor, so
                the accent-coloured "1)" bolded along with it and the label never
                looked any heavier than its own prefix (Jeff 2026-08-07). The
                digit stays at 400 so the word reads as the label and the number
                as the shortcut hint. Past the tenth tab there is no digit left
                to spend — (ti+1)%10 would re-print "1)" and promise a key that
                lands somewhere else — so the eleventh takes "-", the key next
                along the row, and anything beyond it carries the label alone. */}
            {ti < 11 && (
              <><span class="font-normal text-accent">{ti < 10 ? (ti + 1) % 10 : '-'})</span>{' '}</>
            )}
            <span class="font-semibold">{tab.label}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
