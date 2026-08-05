import { useState } from 'preact/hooks'
import { useNamedWatchlists, useQuotes, useWatchlist } from '../hooks.js'
import {
  createWatchlist, removeWatchlist, renameWatchlist,
} from '../lib/watchlists.js'
import { fmtPct } from '../lib/format.js'

function ListSummary({ symbols, quotes }) {
  const moves = symbols
    .map((symbol) => quotes[symbol]?.quote?.pct)
    .filter((value) => Number.isFinite(value))
  const average = moves.length
    ? moves.reduce((sum, value) => sum + value, 0) / moves.length
    : null
  const advancing = moves.filter((value) => value > 0).length
  const declining = moves.filter((value) => value < 0).length

  return (
    <div class="grid grid-cols-3 gap-1.5">
      <div class="rounded-lg border border-line bg-black/25 px-2 py-1.5">
        <div class="font-anth text-[8px] uppercase tracking-wider text-muted">average move</div>
        <div class={`pt-0.5 font-mono text-[11px] font-semibold ${average == null ? 'text-muted' : average >= 0 ? 'text-up' : 'text-down'}`}>
          {average == null ? '—' : fmtPct(average)}
        </div>
      </div>
      <div class="rounded-lg border border-line bg-black/25 px-2 py-1.5">
        <div class="font-anth text-[8px] uppercase tracking-wider text-muted">advancing</div>
        <div class="pt-0.5 font-mono text-[11px] font-semibold text-up">{advancing}</div>
      </div>
      <div class="rounded-lg border border-line bg-black/25 px-2 py-1.5">
        <div class="font-anth text-[8px] uppercase tracking-wider text-muted">declining</div>
        <div class="pt-0.5 font-mono text-[11px] font-semibold text-down">{declining}</div>
      </div>
    </div>
  )
}

function SymbolPreview({ symbols, quotes }) {
  const shown = symbols.slice(0, 8)
  return (
    <div aria-label="symbol chips" class="min-h-14 flex flex-wrap content-start gap-1.5">
      {shown.map((symbol) => {
        const pct = quotes[symbol]?.quote?.pct
        return (
          <span key={symbol} class="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-1 font-mono text-[9px] text-ink-2">
            <span class="font-semibold text-ink">{symbol}</span>
            {Number.isFinite(pct) && (
              <span class={pct >= 0 ? 'text-up' : 'text-down'}>{fmtPct(pct)}</span>
            )}
          </span>
        )
      })}
      {symbols.length > shown.length && (
        <span class="px-1 py-1 font-mono text-[9px] text-muted">+{symbols.length - shown.length}</span>
      )}
      {!symbols.length && (
        <span class="font-anth text-[10px] leading-relaxed text-muted">No tickers yet. Open this list to build it.</span>
      )}
    </div>
  )
}

function WatchlistCard({ item, quotes, primary = false }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const href = primary ? '#/' : `#/watchlists/${item.id}`
  const submit = (event) => {
    event.preventDefault()
    const saved = renameWatchlist(item.id, name)
    if (saved) setEditing(false)
  }

  return (
    <article class={`group bg-surface-1 border rounded-xl p-3.5 flex flex-col gap-3 min-w-0 transition-colors ${primary ? 'border-accent/40' : 'border-line hover:border-line-2'}`}>
      <div class="flex items-start gap-2 min-h-9">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            {editing ? (
              <form onSubmit={submit} class="flex gap-1 min-w-0 flex-1">
                <input autoFocus value={name} onInput={(e) => setName(e.currentTarget.value)}
                  class="min-w-0 flex-1 bg-surface-2 border border-accent rounded px-2 py-1 font-anth text-[12px] text-ink outline-none" />
                <button class="font-anth text-[10px] font-semibold text-accent px-1.5">Save</button>
              </form>
            ) : (
              <a href={href} class="font-anth font-bold text-[14px] text-ink hover:text-accent hover:no-underline truncate">
                {item.name}
              </a>
            )}
            {primary && <span class="rounded border border-accent/40 bg-accent-soft px-1.5 py-px font-anth text-[7px] font-bold tracking-wider text-accent">PRIMARY</span>}
          </div>
          <div class="pt-0.5 font-anth text-[9px] text-muted">
            {item.symbols.length} {item.symbols.length === 1 ? 'ticker' : 'tickers'}
            {primary ? ' · shared across Briefing, Wire, AI, and the tape' : ' · independent dashboard view'}
          </div>
        </div>
      </div>

      <ListSummary symbols={item.symbols} quotes={quotes} />
      <SymbolPreview symbols={item.symbols} quotes={quotes} />

      <div class="flex items-center gap-3 border-t border-line pt-2.5 font-anth text-[10px] font-semibold">
        <a href={href} class="text-accent hover:no-underline">Open dashboard →</a>
        {!primary && (
          <>
            <button onClick={() => { setName(item.name); setEditing((value) => !value) }} class="ml-auto text-muted hover:text-ink">Rename</button>
            <button onClick={() => {
              if (confirm(`Delete watchlist “${item.name}”?`)) removeWatchlist(item.id)
            }} class="text-muted hover:text-down">Delete</button>
          </>
        )}
      </div>
    </article>
  )
}

export function WatchlistsPage() {
  const main = useWatchlist()
  const lists = useNamedWatchlists()
  const symbols = [...new Set([...main, ...lists.flatMap((item) => item.symbols)])]
  const quotes = useQuotes(symbols)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const submit = (event) => {
    event.preventDefault()
    const created = createWatchlist(name)
    if (!created) return setError('Use a unique watchlist name.')
    setName('')
    setError('')
    location.hash = `#/watchlists/${created.id}`
  }

  return (
    <div class="flex-1 p-3 sm:p-4 select-text min-w-0 overflow-y-auto">
      <div class="max-w-5xl mx-auto">
        <header class="flex flex-wrap items-end gap-3 px-1 pb-4 border-b border-line">
          <div class="min-w-0">
            <div class="font-anth text-[9px] uppercase tracking-[0.18em] text-accent">Market workspace</div>
            <h1 class="font-anth font-bold text-xl text-ink">Watchlists</h1>
            <p class="pt-1 font-anth text-[10px] text-muted">Separate market lenses with the same live dashboard machinery.</p>
          </div>
          <form onSubmit={submit} class="ml-auto flex items-center gap-2 rounded-xl border border-line bg-surface-1 p-1.5">
            <input value={name} onInput={(e) => { setName(e.currentTarget.value); setError('') }}
              aria-label="Watchlist name" placeholder="Watchlist name"
              class="min-w-0 w-36 sm:w-44 bg-transparent px-2 py-1 font-anth text-[11px] text-ink outline-none placeholder:text-muted" />
            <button class="rounded-lg border border-accent/60 bg-accent-soft px-2.5 py-1.5 font-anth text-[10px] font-semibold text-accent hover:bg-accent/15">Create watchlist</button>
          </form>
        </header>
        {error && <div class="px-1 pt-2 font-anth text-[10px] text-down">{error}</div>}

        <div class="grid md:grid-cols-2 gap-3 pt-4">
          <WatchlistCard item={{ id: 'main', name: 'Main dashboard', symbols: main }} quotes={quotes} primary />
          {lists.map((item) => <WatchlistCard key={item.id} item={item} quotes={quotes} />)}
        </div>

        {!lists.length && (
          <div class="mt-3 rounded-xl border border-dashed border-line-2 px-4 py-5 text-center">
            <div class="font-anth text-[11px] font-semibold text-ink-2">One dashboard is plenty—until it isn’t.</div>
            <div class="pt-1 font-anth text-[10px] text-muted">Create a focused list for earnings, setups, sectors, or whatever fresh market disease has entered the building.</div>
          </div>
        )}
      </div>
    </div>
  )
}
