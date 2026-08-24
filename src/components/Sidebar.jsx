import { useEffect, useState } from 'preact/hooks'
import { NAV, hrefFor } from '../lib/route.js'
import { goChatHome } from '../lib/chatnav.js'
import { t as tt, tl } from '../lib/i18n.js'
import { useNamedWatchlists, useQuotes, useWatchlist } from '../hooks.js'
import { FlashPrice } from './Fig.jsx'
import { watch, unwatch, isWatchlistFull, MAX_WATCHLIST } from '../lib/watchlist.js'
import {
  addWatchlistSymbol, removeWatchlistSymbol, isNamedWatchlistFull, MAX_WATCHLIST_SYMBOLS,
} from '../lib/watchlists.js'
import { nextSort, sortSymbols } from '../lib/watchsort.js'
import { loadSidebarWatchlistId, saveSidebarWatchlistId } from '../lib/sidebarWatchlist.js'
import { fmtPriceBare, fmtPct } from '../lib/format.js'
import { lastGoodTs } from '../lib/feed.js'
import { prefetchSymbol } from '../lib/history.js'

function WatchRow({ symbol, q, onRemove }) {
  const up = (q?.pct ?? 0) >= 0
  return (
    <div class="wl-row group flex items-baseline px-3 py-[3px] font-mono text-[11px]"
      onMouseEnter={() => prefetchSymbol(symbol)}>
      <a href={`#/research/${symbol.toLowerCase()}`} class="text-ink font-[650] font-tick text-[10px] w-14 hover:no-underline hover:bg-transparent">
        {symbol}
      </a>
      <span class="text-ink-2 font-medium ml-auto">{q ? <FlashPrice price={q.price} fmt={fmtPriceBare} /> : '—'}</span>
      <span class={`w-16 text-right font-semibold text-[10px] ${q ? (up ? 'text-up' : 'text-down') : 'text-muted'}`}>
        {q ? fmtPct(q.pct) : ''}
      </span>
      <button
        onClick={() => onRemove(symbol)}
        title={`unwatch ${symbol}`}
        class="w-0 overflow-hidden group-hover:w-4 text-right text-muted hover:text-down"
      >
        ×
      </button>
    </div>
  )
}

function AddSymbol({ onAdd, isFull, cap }) {
  const [value, setValue] = useState('')
  // The rail swallowed every refusal. Only the cap is worth a line here — a
  // typo is obvious from the box still holding it, "no room left" is not.
  const [err, setErr] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (onAdd(value)) { setValue(''); setErr(''); return }
    setErr(isFull() ? tt('watchlists.full', { max: cap }) : '')
  }
  // Dashed box + "+ add" reads as a control; the old bare underline with a
  // "+ SYM" placeholder was invisible (Jeff 2026-08-04). Same 56px footprint.
  return (
    <div class="ml-auto flex flex-col items-end">
      <form onSubmit={submit} title={tl('add symbol')}>
        <input
          value={value}
          onInput={(e) => { setValue(e.currentTarget.value); setErr('') }}
          placeholder={`+ ${tl('add')}`}
          class="w-14 bg-transparent border border-dashed border-line-2 rounded px-1 text-[10px] font-mono text-ink uppercase outline-none text-center hover:border-accent/60 focus:border-solid focus:border-accent placeholder:text-ink-2 placeholder:normal-case"
        />
      </form>
      {err && <span class="pt-0.5 font-anth text-[9px] normal-case tracking-normal text-down">{err}</span>}
    </div>
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

/** Sort control that doubles as the column header it sorts. */
function SortHead({ label, col, sort, onSort, align = 'left' }) {
  const on = sort?.key === col
  return (
    <button
      onClick={() => onSort(nextSort(sort, col))}
      title={`${tl('sort by')} ${label}`}
      class={`flex-1 flex items-baseline gap-1 font-mono text-[9px] tracking-wider uppercase ${
        align === 'right' ? 'justify-end' : ''
      } ${on ? 'text-accent' : 'text-muted hover:text-ink-2'}`}
    >
      {label}
      <span class={on ? '' : 'opacity-0'}>{sort?.dir === 'asc' ? '▲' : '▼'}</span>
    </button>
  )
}

export function Sidebar({ route }) {
  const mainWatchlist = useWatchlist()
  const namedWatchlists = useNamedWatchlists()
  const [sidebarListId, setSidebarListId] = useState(() => loadSidebarWatchlistId(namedWatchlists))
  const [pickerOpen, setPickerOpen] = useState(false)
  const activeNamed = namedWatchlists.find((item) => item.id === sidebarListId) || null
  const stored = activeNamed?.symbols || mainWatchlist
  const quotes = useQuotes(stored)
  const listName = activeNamed?.name || tl('Default')
  const chooseSidebarList = (id) => {
    saveSidebarWatchlistId(id)
    setSidebarListId(id)
    setPickerOpen(false)
  }
  useEffect(() => {
    if (sidebarListId !== 'main' && !activeNamed) chooseSidebarList('main')
  }, [sidebarListId, activeNamed])
  // a view preference, not a rewrite of the list — the stored order survives
  const [sort, setSort] = useState(() => {
    try { return JSON.parse(localStorage.getItem('watch_sort')) } catch { return null }
  })
  const applySort = (next) => {
    setSort(next)
    if (next) localStorage.setItem('watch_sort', JSON.stringify(next))
    else localStorage.removeItem('watch_sort')
  }
  const watchlist = sortSymbols(stored, quotes, sort)
  const addSymbol = activeNamed
    ? (symbol) => addWatchlistSymbol(activeNamed.id, symbol)
    : watch
  const removeSymbol = activeNamed
    ? (symbol) => removeWatchlistSymbol(activeNamed.id, symbol)
    : unwatch
  // which list the rail is actually editing decides whose cap applies
  const listFull = activeNamed
    ? () => isNamedWatchlistFull(activeNamed.id)
    : isWatchlistFull
  const listCap = activeNamed ? MAX_WATCHLIST_SYMBOLS : MAX_WATCHLIST

  return (
    <nav class="w-44 min-[1200px]:w-52 shrink-0 bg-black border-r border-line flex flex-col max-md:hidden min-h-0">
      <UpdatedLine />
      <div class="pb-2">
        {NAV.filter((s) => !s.phoneOnly).map((section) => (
          <div key={section.id}>
            <a
              href={hrefFor(section.id)}
              onClick={section.id === 'chat' ? goChatHome : undefined}
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

      <div class="relative px-3 pt-2 pb-1 border-t border-line font-mono text-[10px] tracking-wider text-muted flex items-baseline">
        <button type="button" data-sidebar-watchlist-selector aria-haspopup="listbox" aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
          class="inline-flex min-w-0 items-center gap-1 text-left uppercase text-muted transition-colors hover:text-accent">
          <span class="truncate">{listName}</span>
          <span class={`shrink-0 text-[8px] transition-transform ${pickerOpen ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
        </button>
        <AddSymbol onAdd={addSymbol} isFull={listFull} cap={listCap} />
        {pickerOpen && (
          <div role="listbox" aria-label={tl('Watchlists')}
            class="absolute left-2 right-2 top-full z-30 mt-1 overflow-hidden rounded-md border border-line-2 bg-surface-1 py-1 shadow-lg shadow-black/60">
            {[{ id: 'main', name: tl('Default') }, ...namedWatchlists].map((list) => (
              <button key={list.id} type="button" role="option" aria-selected={sidebarListId === list.id}
                onClick={() => chooseSidebarList(list.id)}
                class={`flex w-full items-center px-2 py-1.5 text-left font-mono text-[10px] transition-colors ${sidebarListId === list.id
                  ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-3 hover:text-ink'}`}>
                <span class="truncate">{list.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div class="px-3 pb-1 flex items-baseline gap-2 border-b border-line/60">
        <SortHead label={tl('sym')} col="sym" sort={sort} onSort={applySort} />
        <SortHead label="%" col="pct" sort={sort} onSort={applySort} align="right" />
      </div>
      <div class="flex-1 overflow-y-auto min-h-0">
        {watchlist.map((s) => (
          <WatchRow key={s} symbol={s} q={quotes[s]?.quote} onRemove={removeSymbol} />
        ))}
      </div>
    </nav>
  )
}
