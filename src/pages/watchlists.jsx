import { useEffect, useState } from 'preact/hooks'
import { useNamedWatchlists, useQuotes, useWatchlist } from '../hooks.js'
import {
  addWatchlistSymbol, createWatchlist, removeWatchlist, removeWatchlistSymbol,
  renameWatchlist, isNamedWatchlistFull, MAX_WATCHLIST_SYMBOLS,
} from '../lib/watchlists.js'
import { unwatch, watch, isWatchlistFull, MAX_WATCHLIST } from '../lib/watchlist.js'
import { useEarningsDays } from './dashboard.jsx'
import { fmtPct } from '../lib/format.js'
import { pulseStats } from '../lib/pulse.js'
import { t as tt, tl } from '../lib/i18n.js'
import { isTapeList, toggleTapeList } from '../lib/tapeLists.js'
import { onSyncStatus } from '../lib/cloudsave.js'
import { pinDashboardLanding, pinnedDashboardLanding } from '../lib/dashboardLanding.js'
import { wireServiceUrl } from '../lib/wire.js'
import { pushWatchlistToWire } from '../lib/watchlistExport.js'
import { shouldOpenWatchlistCard } from '../lib/watchlistCard.js'
import { Empty } from '../components/Loading.jsx'

/** Cloud-save state, quietly: synced rev / syncing / offline. Hidden entirely
 *  on builds with no wire endpoint. */
function CloudChip() {
  const [st, setSt] = useState({ state: 'off', rev: 0 })
  useEffect(() => onSyncStatus(setSt), [])
  if (st.state === 'off') return null
  // no rev counter — "r51" meant nothing to anyone (Jeff 2026-08-06)
  const label = st.state === 'synced' ? tl('cloud')
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

function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  const field = document.createElement('textarea')
  field.value = value
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  return copied ? Promise.resolve() : Promise.reject(new Error('copy failed'))
}

function ListSummary({ symbols, quotes, earnDays }) {
  // 7d, not 14: the two-week window flagged half the board every season and
  // stopped meaning anything (Jeff 2026-08-06)
  const ernSoon = symbols.filter((s) => earnDays?.[s] != null
    && earnDays[s] >= 0 && earnDays[s] <= 7).length
  // shared breadth maths (rail Pulse, markets Movers) rather than a third
  // local variant — note flat names count as advancing there, so adv + dec
  // now always sums to the list
  const stats = pulseStats(symbols.map((symbol) => ({ symbol, pct: quotes[symbol]?.quote?.pct })))
  const average = stats ? stats.avg : null
  const advancing = stats?.adv ?? 0
  const declining = stats?.dec ?? 0

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
  const [, pinBump] = useState(0)
  const pinned = pinnedDashboardLanding()
  const isDefault = primary ? pinned === 'main' : pinned === item.id
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [managing, setManaging] = useState(false)
  const [, tapeBump] = useState(0)
  const onTape = isTapeList(item.id)
  const ctl = 'inline-flex h-8 items-center rounded-md border px-2.5 max-sm:px-2 text-[11px] whitespace-nowrap transition-colors'
  const ctlOff = `${ctl} border-line-2 bg-surface-2 text-ink-2 hover:border-line hover:text-ink`
  const ctlOn = `${ctl} border-accent/50 bg-accent/10 text-accent`
  const [exportState, setExportState] = useState('idle')
  const [notice, setNotice] = useState('')
  const others = allLists.filter((l) => l.id !== item.id)
  const [dest, setDest] = useState('')
  const destId = dest || others[0]?.id || ''
  const addTo = (target, symbol) => target === 'main'
    ? watch(symbol) : addWatchlistSymbol(target, symbol)
  const dropFrom = (symbol) => item.id === 'main'
    ? unwatch(symbol) : removeWatchlistSymbol(item.id, symbol)
  const destFull = () => destId === 'main' ? isWatchlistFull() : isNamedWatchlistFull(destId)
  // send is add-then-drop, so a destination that refuses the add used to lose
  // the ticker outright. A full destination now stops the move and says so.
  const send = (symbol) => {
    if (!destId) return
    if (!addTo(destId, symbol) && destFull()) {
      setNotice(tt('watchlists.full', {
        max: destId === 'main' ? MAX_WATCHLIST : MAX_WATCHLIST_SYMBOLS,
      }))
      setTimeout(() => setNotice(''), 2500)
      return
    }
    dropFrom(symbol)
  }
  const exportSymbols = async () => {
    const text = item.symbols.join(' ')
    const flash = () => {
      setExportState('done')
      setTimeout(() => setExportState('idle'), 1500)
    }
    const fail = () => {
      setExportState('error')
      setTimeout(() => setExportState('idle'), 2500)
    }
    const endpoint = wireServiceUrl()
    if (endpoint) {
      setExportState('syncing')
      try {
        await pushWatchlistToWire(endpoint, item.symbols, fetch,
          { replace: primary })
        flash()
      } catch {
        fail()
      }
      return
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
      // a false return is the same dead end as a throw — both used to leave
      // the button sitting on 'idle', reading as "nothing happened"
      try { if (document.execCommand('copy')) flash(); else fail() } catch { fail() }
      ta.remove()
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(flash).catch(legacyCopy)
      return
    }
    legacyCopy()
  }
  const href = primary ? '#/watchlists/main' : `#/watchlists/${item.id}`
  const submit = (event) => {
    event.preventDefault()
    const saved = renameWatchlist(item.id, name)
    if (saved) setEditing(false)
  }
  const openCard = (event) => {
    if (editing || managing) return
    if (!shouldOpenWatchlistCard(event, window.getSelection()?.toString())) return
    location.hash = href
  }

  return (
    <article onClick={openCard} class={`group bg-surface-1 border rounded-xl p-3.5 flex flex-col gap-3 min-w-0 transition-colors ${
      editing || managing ? '' : 'cursor-pointer hover:bg-surface-2/40'
    } ${primary ? 'border-accent/40 hover:border-accent/60' : 'border-line hover:border-line-2'}`}>
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
              <a href={href} class="font-anth font-bold text-[21px] leading-tight tracking-tight text-ink hover:text-accent hover:no-underline truncate">
                {item.name}
              </a>
            )}
            {primary && <span class="rounded border border-accent/40 bg-accent-soft px-1.5 py-px font-anth text-[7px] font-bold tracking-wider text-accent">{tl('PRIMARY')}</span>}
          </div>
          <div data-watchlist-count class="pt-1 flex items-baseline gap-1 font-anth">
            <span class="font-mono text-[12px] font-bold text-ink-2">{item.symbols.length}</span>
            <span class="text-[10px] text-muted">{tl(item.symbols.length === 1 ? 'ticker' : 'tickers')}</span>
          </div>
        </div>
        <label class="flex shrink-0 items-center gap-2 pt-1 font-anth text-[10px] text-muted" onClick={(e) => e.stopPropagation()}>
          {tl('display on tape')}
          <button type="button" role="switch" aria-checked={onTape}
            onClick={(e) => { e.stopPropagation(); toggleTapeList(item.id); tapeBump((n) => n + 1) }}
            class={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${onTape ? 'border-accent/60 bg-accent' : 'border-line-2 bg-surface-3'}`}>
            <span class={`absolute top-0.5 h-[14px] w-[14px] rounded-full bg-black/80 transition-[left] ${onTape ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </label>
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
      {notice && <div class="font-anth text-[10px] text-down">{notice}</div>}
      <SymbolPreview symbols={item.symbols} quotes={quotes} managing={managing}
        onSend={send} onRemove={dropFrom} />

      {/* every control is a bordered button of one height — the bare text
          row read as labels, not things to tap (Jeff 2026-08-22) */}
      <div class="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5 font-anth text-[11px] font-semibold">
        <a href={href} data-watchlist-open
          class={`${ctl} border-accent/60 bg-accent-soft text-accent hover:bg-accent hover:text-black hover:no-underline`}>
          {tt('watchlists.open')}
        </a>
        <button onClick={() => setManaging((v) => !v)} class={managing ? ctlOn : ctlOff}>
          {managing ? tl('done') : tl('manage')}
        </button>
        <button onClick={() => { pinDashboardLanding(primary ? null : item.id); pinBump((n) => n + 1) }}
          title={tl('opens first on a fresh load')} class={isDefault ? ctlOn : ctlOff}>
          <span class="max-sm:hidden">{isDefault ? `★ ${tl('default')}` : `☆ ${tl('set default')}`}</span>
          <span class="sm:hidden" aria-hidden="true">{isDefault ? '★' : '☆'}</span>
        </button>
        <button onClick={exportSymbols} disabled={exportState === 'syncing'} class={`${ctlOff} disabled:opacity-50`}>
          {exportState === 'syncing' ? '…'
            : exportState === 'done' ? tl('exported ✓')
            : exportState === 'error' ? tl('export failed')
            : tl('export')}
        </button>
        {!primary && (
          <div class="ml-auto flex items-center gap-1.5">
            <button onClick={() => { setName(item.name); setEditing((value) => !value) }} class={ctlOff}>{tl('rename')}</button>
            <button onClick={() => {
              if (confirm(tt('watchlists.delete_confirm', { name: item.name }))) removeWatchlist(item.id)
            }} class={`${ctlOff} hover:border-down/50 hover:text-down`}>{tl('delete')}</button>
          </div>
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
  const [creating, setCreating] = useState(false)
  const allLists = [{ id: 'main', name: tl('Default') }, ...lists]
  const submit = (event) => {
    event.preventDefault()
    // import path: paste "NVDA MSFT GOOGL" (or CSV) and the list is born full
    const seedSymbols = seed.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)
    const created = createWatchlist(name, seedSymbols)
    if (!created) return setError(tt('watchlists.unique_name'))
    setName('')
    setSeed('')
    setError('')
    setCreating(false)
    location.hash = `#/watchlists/${created.id}`
  }

  return (
    <div class="flex-1 p-3 sm:p-4 select-text min-w-0 overflow-y-auto">
      <div class="max-w-5xl mx-auto">
        <header class="flex flex-wrap items-end gap-3 px-1 pb-4 border-b border-line">
          <div class="min-w-0">
            <div class="font-anth text-[9px] uppercase tracking-[0.18em] text-accent">{tl('Market workspace')}</div>
            <h1 class="font-anth font-bold text-xl text-ink flex items-center gap-2">{tl('Watchlists')} <CloudChip /></h1>
          </div>
          {!creating && (
            <button type="button" onClick={() => setCreating(true)}
              class="ml-auto inline-flex h-8 items-center rounded-md border border-accent/60 bg-accent-soft px-3 font-anth text-[11px] font-semibold text-accent transition-colors hover:bg-accent hover:text-black">
              + {tt('watchlists.new')}
            </button>
          )}
          {creating && (
            <form onSubmit={submit} class="basis-full flex flex-wrap items-center gap-1.5 rounded-lg border border-accent/40 bg-surface-1 p-1.5 shadow-sm shadow-black/30">
              <input autoFocus value={name} onInput={(e) => { setName(e.currentTarget.value); setError('') }}
                aria-label={tl('Watchlist name')} placeholder={tl('Watchlist name')}
                class="min-w-32 flex-1 bg-transparent px-2 py-1 font-anth text-[11px] text-ink outline-none placeholder:text-muted" />
              <input value={seed} onInput={(e) => setSeed(e.currentTarget.value)}
                aria-label={tl('symbols (optional)')} placeholder={tl('symbols (optional)')}
                class="min-w-28 flex-1 border-l border-line bg-transparent px-2 py-1 font-mono text-[10px] uppercase text-ink outline-none placeholder:text-muted placeholder:normal-case" />
              <button class="shrink-0 rounded-md border border-accent/60 bg-accent-soft px-2.5 py-1 font-anth text-[10px] font-semibold text-accent hover:bg-accent/15">{tl('Create')}</button>
              <button type="button" onClick={() => { setCreating(false); setError('') }}
                class="shrink-0 px-1.5 font-anth text-[10px] text-muted hover:text-ink">{tl('Cancel')}</button>
            </form>
          )}
        </header>
        {error && <div class="px-1 pt-2 font-anth text-[10px] text-down">{error}</div>}

        <div class="grid md:grid-cols-2 gap-3 pt-4">
          <WatchlistCard item={{ id: 'main', name: tl('Default'), symbols: main }}
            quotes={quotes} earnDays={earnDays} allLists={allLists} primary />
          {lists.map((item) => (
            <WatchlistCard key={item.id} item={item} quotes={quotes}
              earnDays={earnDays} allLists={allLists} />
          ))}
        </div>

        {!lists.length && (
          <div class="mt-3 rounded-xl border border-dashed border-line-2">
            {/* the title keeps its own weight and tone — Empty owns only the
                centring and the reserved breathing room */}
            <Empty label={<span class="font-semibold text-ink-2">{tt('watchlists.empty_title')}</span>}
              body={tt('watchlists.empty_body')} />
          </div>
        )}
      </div>
    </div>
  )
}
