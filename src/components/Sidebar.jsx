import { useEffect, useState } from 'preact/hooks'
import { NAV, hrefFor } from '../lib/route.js'
import { tl } from '../lib/i18n.js'
import { useQuotes, useWatchlist } from '../hooks.js'
import { FlashPrice } from './Fig.jsx'
import { watch, unwatch } from '../lib/watchlist.js'
import { fmtPrice, fmtPct } from '../lib/format.js'
import { lastGoodTs } from '../lib/feed.js'

function WatchRow({ symbol, q }) {
  const up = (q?.pct ?? 0) >= 0
  return (
    <div class="wl-row group flex items-baseline px-3 py-[3px] font-mono text-[11px]">
      <a href={`#/research/${symbol.toLowerCase()}`} class="text-ink font-bold font-tick w-14 hover:no-underline hover:bg-transparent">
        {symbol}
      </a>
      <span class="text-ink-2 font-medium ml-auto">{q ? <FlashPrice price={q.price} fmt={fmtPrice} /> : '—'}</span>
      <span class={`w-16 text-right font-semibold text-[10px] ${q ? (up ? 'text-up' : 'text-down') : 'text-muted'}`}>
        {q ? fmtPct(q.pct) : ''}
      </span>
      <button
        onClick={() => unwatch(symbol)}
        title={`unwatch ${symbol}`}
        class="w-0 overflow-hidden group-hover:w-4 text-right text-muted hover:text-down"
      >
        ×
      </button>
    </div>
  )
}

function AddSymbol() {
  const [value, setValue] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (watch(value)) setValue('')
  }
  return (
    <form onSubmit={submit} class="ml-auto">
      <input
        value={value}
        onInput={(e) => setValue(e.currentTarget.value)}
        placeholder="+ SYM"
        class="w-14 bg-transparent border-b border-line text-[10px] font-mono text-ink uppercase outline-none focus:border-accent placeholder:text-muted"
      />
    </form>
  )
}

/** Feed freshness, in the TUI's own words: amber italic, ET, stale warning. */
function UpdatedLine() {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000)
    return () => clearInterval(t)
  }, [])
  const good = lastGoodTs()
  const staleMin = good ? Math.floor((Date.now() - good) / 60_000) : 0
  const ts = good
    ? new Date(good).toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' })
    : null
  return (
    <div class="px-3 pt-2 pb-1 font-mono text-[10px] leading-tight">
      <div class="text-accent italic">
        {ts ? `${tl('updated')} ${ts} ET` : '…'}
      </div>
      {staleMin >= 5 && (
        <div class="text-down font-bold not-italic pt-0.5">
          ⚠ {tl('STALE')} {staleMin < 60 ? `${staleMin}m` : `${Math.floor(staleMin / 60)}h`}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ route }) {
  const watchlist = useWatchlist()
  const quotes = useQuotes(watchlist)

  return (
    <nav class="w-52 shrink-0 bg-black border-r border-line flex flex-col max-md:hidden min-h-0">
      <UpdatedLine />
      <div class="pb-2">
        {NAV.map((section) => (
          <div key={section.id}>
            <a
              href={hrefFor(section.id)}
              class={`flex items-center gap-2 mx-2 px-2.5 py-1 rounded-lg font-mono lowercase text-[12px] transition-colors ${
                route.section === section.id
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-2 hover:bg-accent-soft hover:text-ink'
              }`}
            >
              {tl(section.label)}
              {section.badge && (
                <span class="text-[8px] font-mono font-bold px-1 py-px rounded border border-line-2 text-muted">
                  {section.badge}
                </span>
              )}
            </a>
            {route.section === section.id && section.subs.length > 0 && (
              <div class="ml-4 my-0.5 flex flex-col border-l border-line">
                <a
                  href={hrefFor(section.id)}
                  class={`px-3 py-0.5 font-mono lowercase text-[10.5px] ${!route.sub ? 'text-accent' : 'text-muted hover:text-ink-2'}`}
                >
                  {tl('Overview')}
                </a>
                {section.subs.map((sub) => (
                  <a
                    key={sub.id}
                    href={hrefFor(section.id, sub.id)}
                    class={`px-3 py-0.5 font-mono lowercase text-[10.5px] ${
                      route.sub === sub.id ? 'text-accent' : 'text-muted hover:text-ink-2'
                    }`}
                  >
                    {tl(sub.label)}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div class="px-3 pt-2 pb-1 border-t border-line font-mono text-[10px] tracking-wider text-muted flex items-baseline">
        {tl('Watchlist').toUpperCase()}
        <AddSymbol />
      </div>
      <div class="flex-1 overflow-y-auto min-h-0">
        {watchlist.map((s) => (
          <WatchRow key={s} symbol={s} q={quotes[s]?.quote} />
        ))}
      </div>
    </nav>
  )
}
