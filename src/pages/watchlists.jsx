import { useState } from 'preact/hooks'
import { useNamedWatchlists, useWatchlist } from '../hooks.js'
import {
  createWatchlist, removeWatchlist, renameWatchlist,
} from '../lib/watchlists.js'

function WatchlistCard({ item }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const submit = (event) => {
    event.preventDefault()
    const saved = renameWatchlist(item.id, name)
    if (saved) setEditing(false)
  }
  return (
    <article class="bg-surface-1 border border-line rounded-xl p-3 flex flex-col gap-3 min-w-0">
      <div class="flex items-start gap-2">
        {editing ? (
          <form onSubmit={submit} class="flex gap-1 min-w-0 flex-1">
            <input autoFocus value={name} onInput={(e) => setName(e.currentTarget.value)}
              class="min-w-0 flex-1 bg-surface-2 border border-accent rounded px-2 py-1 font-anth text-[12px] text-ink outline-none" />
            <button class="font-mono text-[10px] text-accent px-1">save</button>
          </form>
        ) : (
          <a href={`#/dashboard/${item.id}`} class="font-anth font-bold text-[13px] text-ink hover:text-accent hover:no-underline truncate">
            {item.name}
          </a>
        )}
        <span class="ml-auto shrink-0 font-mono text-[10px] text-muted">{item.symbols.length}</span>
      </div>
      <div class="min-h-8 font-mono text-[10px] text-ink-2 leading-relaxed">
        {item.symbols.length ? item.symbols.join('  ') : 'empty — open it and add tickers'}
      </div>
      <div class="flex gap-3 font-mono text-[10px]">
        <a href={`#/dashboard/${item.id}`} class="text-accent hover:no-underline">open</a>
        <button onClick={() => setEditing((v) => !v)} class="text-muted hover:text-ink">rename</button>
        <button onClick={() => {
          if (confirm(`Delete watchlist “${item.name}”?`)) removeWatchlist(item.id)
        }} class="text-muted hover:text-down ml-auto">delete</button>
      </div>
    </article>
  )
}

export function WatchlistsPage() {
  const main = useWatchlist()
  const lists = useNamedWatchlists()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const submit = (event) => {
    event.preventDefault()
    const created = createWatchlist(name)
    if (!created) return setError('use a unique watchlist name')
    setName('')
    setError('')
    location.hash = `#/dashboard/${created.id}`
  }
  return (
    <div class="flex-1 p-3 select-text min-w-0">
      <div class="max-w-4xl mx-auto">
        <header class="flex flex-wrap items-end gap-3 px-1 pb-3 border-b border-line">
          <div>
            <div class="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">Dashboard</div>
            <h1 class="font-anth font-bold text-lg text-ink">Watchlists</h1>
          </div>
          <form onSubmit={submit} class="ml-auto flex items-center gap-2">
            <input value={name} onInput={(e) => { setName(e.currentTarget.value); setError('') }}
              placeholder="new watchlist"
              class="w-40 bg-surface-1 border border-line rounded-lg px-2.5 py-1.5 font-anth text-[11px] text-ink outline-none focus:border-accent placeholder:text-muted" />
            <button class="rounded-lg border border-accent/60 px-2.5 py-1.5 font-mono text-[10px] text-accent hover:bg-accent-soft">+ create</button>
          </form>
        </header>
        {error && <div class="px-1 pt-2 font-mono text-[10px] text-down">{error}</div>}
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-3">
          <article class="bg-surface-1 border border-accent/30 rounded-xl p-3 flex flex-col gap-3">
            <div class="flex items-baseline gap-2">
              <a href="#/" class="font-anth font-bold text-[13px] text-ink hover:text-accent hover:no-underline">Main dashboard</a>
              <span class="ml-auto font-mono text-[10px] text-muted">{main.length}</span>
            </div>
            <div class="font-mono text-[10px] text-muted">The canonical list used by Briefing, Wire, AI, and the global tape.</div>
            <a href="#/" class="font-mono text-[10px] text-accent hover:no-underline">open</a>
          </article>
          {lists.map((item) => <WatchlistCard key={item.id} item={item} />)}
        </div>
      </div>
    </div>
  )
}
