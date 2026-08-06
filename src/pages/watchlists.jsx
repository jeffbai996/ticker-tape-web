import { useState } from 'preact/hooks'
import { useNamedWatchlists, useQuotes, useWatchlist } from '../hooks.js'
import {
  addWatchlistSymbol, createWatchlist, removeWatchlist, removeWatchlistSymbol,
  renameWatchlist,
} from '../lib/watchlists.js'
import { unwatch, watch } from '../lib/watchlist.js'
import { useEarningsDays } from './dashboard.jsx'
import { fmtPct } from '../lib/format.js'
import { t as tt, tl } from '../lib/i18n.js'
import { onSyncStatus } from '../lib/cloudsave.js'
import { useEffect } from 'preact/hooks'

/** Cloud-save state, quietly: synced rev / syncing / offline. Hidden entirely
 *  on builds with no wire endpoint. */
function CloudChip() {
  const [st, setSt] = useState({ state: 'off', rev: 0 })
  useEffect(() => onSyncStatus(setSt), [])
  if (st.state === 'off') return null
  const label = st.state === 'synced' ? `${tl('cloud')} · r${st.rev}`
    : st.state === 'syncing' ? `${tl('cloud')} · …`
    : tl('cloud offline')
  return (
    <span class={`rounded border px-1.5 py-px font-anth text-[8px] font-bold tracking-wider uppercase ${
      st.state === 'synced' ? 'border-up/40 text-up'
      : st.state === 'syncing' ? 'border-line text-muted'
      : 'border-down/40 text-down'}`}>
      {label}
    </span>
  )
}

function ListSummary({ symbols, quotes, earnDays }) {
  // 7d, not 14: the two-week window flagged half the board every season and
  // stopped meaning anything (Jeff 2026-08-06)
  const ernSoon = symbols.filter((s) => earnDays?.[s] != null
    && earnDays[s] >= 0 && earnDays[s] <= 7).length
  const moves = symbols
    .map((symbol) => quotes[symbol]?.quote?.pct)
    .filter((value) => Number.isFinite(value))
  const average = moves.length
    ? moves.reduce((sum, value) => sum + value, 0) / moves.length
    : null
  const advancing = moves.filter((value) => value > 0).length
  const declining = moves.filter((value) => value < 0).length

  return (
    <div class="grid grid-cols-4 gap-1.5">
      <div class="rounded-lg border border-line bg-black/25 px-2 py-1.5">
        <div class="font-anth text-[8px] uppercase tracking-wider text-muted whitespace-nowrap truncate">{tl('average move')}</div>
        <div class={`pt-0.5 font-mono text-[15px] max-sm:text-[16px] font-semibold ${average == null ? 'text-muted' : average >= 0 ? 'text-up' : 'text-down'}`}>
          {average == null ? '—' : fmtPct(average)}
        </div>
      </div>
      <div class="rounded-lg border border-line bg-black/25 px-2 py-1.5">
        <div class="font-anth text-[8px] uppercase tracking-wider text-muted whitespace-nowrap truncate">{tl('advancing')}</div>
        <div class="pt-0.5 font-mono text-[15px] max-sm:text-[16px] font-semibold text-up">{advancing}</div>
      </div>
      <div class="rounded-lg border border-line bg-black/25 px-2 py-1.5">
        <div class="font-anth text-[8px] uppercase tracking-wider text-muted whitespace-nowrap truncate">{tl('declining')}</div>
        <div class="pt-0.5 font-mono text-[15px] max-sm:text-[16px] font-semibold text-down">{declining}</div>
      </div>
      <div class="rounded-lg border border-line bg-black/25 px-2 py-1.5">
        <div class="font-anth text-[8px] uppercase tracking-wider text-muted whitespace-nowrap truncate">{tl('earnings 7d')}</div>
        <div class={`pt-0.5 font-mono text-[15px] max-sm:text-[16px] font-semibold ${ernSoon ? 'text-accent' : 'text-muted'}`}>{ernSoon}</div>
      </div>
    </div>
  )
}

function SymbolPreview({ symbols, quotes, managing, onSend, onRemove }) {
  const shown = managing ? symbols : symbols.slice(0, 8)
  return (
    <div aria-label={tl('symbol chips')} class="min-h-14 flex flex-wrap content-start gap-1.5">
      {shown.map((symbol) => {
        const pct = quotes[symbol]?.quote?.pct
        return (
          <span key={symbol} class={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 font-mono text-[9px] text-ink-2 ${
            managing ? 'border-accent/40 bg-accent-soft/40' : 'border-line bg-surface-2'}`}>
            <span class="font-semibold text-ink">{symbol}</span>
            {Number.isFinite(pct) && (
              <span class={pct >= 0 ? 'text-up' : 'text-down'}>{fmtPct(pct)}</span>
            )}
            {managing && (
              <>
                <button onClick={() => onSend(symbol)} title={tl('send to destination')}
                  class="text-muted hover:text-accent px-0.5">→</button>
                <button onClick={() => onRemove(symbol)} title={tl('remove')}
                  class="text-muted hover:text-down">✕</button>
              </>
            )}
          </span>
        )
      })}
      {!managing && symbols.length > shown.length && (
        <span class="px-1 py-1 font-mono text-[9px] text-muted">+{symbols.length - shown.length}</span>
      )}
      {!symbols.length && (
        <span class="font-anth text-[10px] leading-relaxed text-muted">{tt('watchlists.empty')}</span>
      )}
    </div>
  )
}

function WatchlistCard({ item, quotes, earnDays, allLists, primary = false }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [managing, setManaging] = useState(false)
  const [copied, setCopied] = useState(false)
  const others = allLists.filter((l) => l.id !== item.id)
  const [dest, setDest] = useState('')
  const destId = dest || others[0]?.id || ''
  const addTo = (target, symbol) => target === 'main'
    ? watch(symbol) : addWatchlistSymbol(target, symbol)
  const dropFrom = (symbol) => item.id === 'main'
    ? unwatch(symbol) : removeWatchlistSymbol(item.id, symbol)
  const send = (symbol) => { if (destId) { addTo(destId, symbol); dropFrom(symbol) } }
  const exportSymbols = () => {
    const text = item.symbols.join(' ')
    const flash = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
    // clipboard API needs a secure context — the plain-http tailnet build gets
    // undefined here, and even where it exists the write can be denied — either
    // way Export silently no-oped (2026-08-06). execCommand still works in both.
    const legacyCopy = () => {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { if (document.execCommand('copy')) flash() } catch { /* no clipboard at all */ }
      ta.remove()
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(flash).catch(legacyCopy)
      return
    }
    legacyCopy()
  }
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
                <button class="font-anth text-[10px] font-semibold text-accent px-1.5">{tl('Save')}</button>
              </form>
            ) : (
              <a href={href} class="font-anth font-bold text-[14px] text-ink hover:text-accent hover:no-underline truncate">
                {item.name}
              </a>
            )}
            {primary && <span class="rounded border border-accent/40 bg-accent-soft px-1.5 py-px font-anth text-[7px] font-bold tracking-wider text-accent">{tl('PRIMARY')}</span>}
          </div>
          <div class="pt-0.5 font-anth text-[9px] text-muted">
            {item.symbols.length} {tl(item.symbols.length === 1 ? 'ticker' : 'tickers')}
            {primary ? ` · ${tl('shared across Briefing, Wire, AI, and the tape')}` : ` · ${tl('independent dashboard view')}`}
          </div>
        </div>
      </div>

      <ListSummary symbols={item.symbols} quotes={quotes} earnDays={earnDays} />
      {managing && others.length > 0 && (
        <div class="flex items-center gap-1.5 font-anth text-[10px] text-muted">
          {tl('send symbols to')}
          <select value={destId} onChange={(e) => setDest(e.currentTarget.value)}
            class="bg-surface-2 border border-line rounded px-1.5 py-0.5 font-anth text-[10px] text-ink outline-none">
            {others.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <span class="text-[9px]">{tl('→ moves · ✕ removes')}</span>
        </div>
      )}
      <SymbolPreview symbols={item.symbols} quotes={quotes} managing={managing}
        onSend={send} onRemove={dropFrom} />

      <div class="flex items-center gap-3 border-t border-line pt-2.5 font-anth text-[10px] font-semibold">
        <a href={href} class="text-accent hover:no-underline">{tl('Open dashboard →')}</a>
        <button onClick={() => setManaging((v) => !v)}
          class={managing ? 'text-accent-2' : 'text-muted hover:text-ink'}>
          {managing ? tl('done') : `⇄ ${tl('manage')}`}
        </button>
        <button onClick={exportSymbols} class="text-muted hover:text-ink">
          {copied ? tl('copied ✓') : tl('Export')}
        </button>
        {!primary && (
          <>
            <button onClick={() => { setName(item.name); setEditing((value) => !value) }} class="ml-auto text-muted hover:text-ink">{tl('Rename')}</button>
            <button onClick={() => {
              if (confirm(tt('watchlists.delete_confirm', { name: item.name }))) removeWatchlist(item.id)
            }} class="text-muted hover:text-down">{tl('Delete')}</button>
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
  const earnDays = useEarningsDays(symbols)
  const [name, setName] = useState('')
  const [seed, setSeed] = useState('')
  const [error, setError] = useState('')
  const allLists = [{ id: 'main', name: tl('Dashboard') }, ...lists]
  const submit = (event) => {
    event.preventDefault()
    // import path: paste "NVDA MU MSFT" (or CSV) and the list is born full
    const seedSymbols = seed.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)
    const created = createWatchlist(name, seedSymbols)
    if (!created) return setError(tt('watchlists.unique_name'))
    setName('')
    setSeed('')
    setError('')
    location.hash = `#/watchlists/${created.id}`
  }

  return (
    <div class="flex-1 p-3 sm:p-4 select-text min-w-0 overflow-y-auto">
      <div class="max-w-5xl mx-auto">
        <header class="flex flex-wrap items-end gap-3 px-1 pb-4 border-b border-line">
          <div class="min-w-0">
            <div class="font-anth text-[9px] uppercase tracking-[0.18em] text-accent">{tl('Market workspace')}</div>
            <h1 class="font-anth font-bold text-xl text-ink flex items-center gap-2">{tl('Watchlists')} <CloudChip /></h1>
            <p class="pt-1 font-anth text-[10px] text-muted">{tt('watchlists.subtitle')}</p>
          </div>
          {/* one slim line at every width — the fields flex instead of owning
              fixed widths, and the button never wraps its label
              (Jeff 2026-08-06: "way too fat") */}
          <form onSubmit={submit} class="ml-auto w-full sm:w-auto flex items-center flex-nowrap gap-1.5 rounded-lg border border-line bg-surface-1 p-1">
            <input value={name} onInput={(e) => { setName(e.currentTarget.value); setError('') }}
              aria-label={tl('Watchlist name')} placeholder={tl('Watchlist name')}
              class="min-w-0 flex-1 sm:flex-none sm:w-36 bg-transparent px-2 py-0.5 font-anth text-[11px] text-ink outline-none placeholder:text-muted" />
            <input value={seed} onInput={(e) => setSeed(e.currentTarget.value)}
              aria-label={tl('symbols (optional)')} placeholder={tl('symbols (optional)')}
              class="min-w-0 flex-1 sm:flex-none sm:w-40 bg-transparent px-2 py-0.5 font-mono text-[10px] uppercase text-ink outline-none placeholder:text-muted placeholder:normal-case border-l border-line" />
            <button class="shrink-0 whitespace-nowrap rounded-md border border-accent/60 bg-accent-soft px-2.5 py-1 font-anth text-[10px] font-semibold text-accent hover:bg-accent/15">{tl('Create')}</button>
          </form>
        </header>
        {error && <div class="px-1 pt-2 font-anth text-[10px] text-down">{error}</div>}

        <div class="grid md:grid-cols-2 gap-3 pt-4">
          <WatchlistCard item={{ id: 'main', name: tl('Dashboard'), symbols: main }}
            quotes={quotes} earnDays={earnDays} allLists={allLists} primary />
          {lists.map((item) => (
            <WatchlistCard key={item.id} item={item} quotes={quotes}
              earnDays={earnDays} allLists={allLists} />
          ))}
        </div>

        {!lists.length && (
          <div class="mt-3 rounded-xl border border-dashed border-line-2 px-4 py-5 text-center">
            <div class="font-anth text-[11px] font-semibold text-ink-2">{tt('watchlists.empty_title')}</div>
            <div class="pt-1 font-anth text-[10px] text-muted">{tt('watchlists.empty_body')}</div>
          </div>
        )}
      </div>
    </div>
  )
}
