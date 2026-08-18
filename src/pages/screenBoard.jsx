import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useNamedWatchlists, useQuotes, useWatchlist } from '../hooks.js'
import { TuiRow } from './dashboard.jsx'
import {
  BOARD_SOURCE, DEFAULT_RANK, MAX_PREDICATES, SCREEN_FIELDS,
  alertSpecForEntry, deleteScreenDef, evaluateScreen, loadScreenDefs,
  matchedSymbols, newScreenDef, normalizeDef, opsForField, saveScreenDef,
  screenEntrants, screenUniverse,
} from '../lib/screenDefs.js'
import { createWatchlist } from '../lib/watchlists.js'
import { addAlert, conditionText } from '../lib/alerts.js'
import { scheduleQuoteColumns } from '../lib/quoteColumns.js'
import { t as tt, tl } from '../lib/i18n.js'
import { Empty } from '../components/Loading.jsx'

// Ranked signal boards: the screen composer (predicate lines + rank) over the
// technicals the feed already computes, with the dashboard's own row as the
// result grammar. Nothing here re-derives an indicator — every field is read
// off the same {quote, tech} the board renders, so a screen can never disagree
// with the badges beside it.

// tl() reads the live locale, so the operator words are resolved at render
// rather than frozen into a module-level table at import time.
const opLabel = (op) => (op === '>' || op === '<' ? op : tl(op))

/** The store speaks English field ids; the UI speaks the user's locale. */
const label = (id, en) => tl(en)

const chip = 'bg-surface-2 border border-line rounded-[3px] px-1.5 py-[3px] text-ink outline-none focus:border-accent'

function PredicateLine({ predicate, index, isRank, onChange, onRemove }) {
  const field = SCREEN_FIELDS.find((f) => f.id === predicate.field)
  const ops = opsForField(predicate.field)
  const set = (patch) => onChange(index, { ...predicate, ...patch })
  return (
    <div class="flex items-center gap-2 max-sm:gap-1.5 py-[5px] border-b border-line font-mono text-[11px] flex-wrap">
      <span class="text-muted w-8 shrink-0">{index === 0 ? tl('where') : tl('and')}</span>
      {/* the field pill carries the amber only when this is also the rank
          field — one accent on the line the board is sorted by, no confetti */}
      <select
        value={predicate.field}
        onChange={(e) => {
          const next = e.currentTarget.value
          set({ field: next, op: opsForField(next)[0], value: '', value2: '' })
        }}
        aria-label={tl('field')}
        class={`${chip} ${isRank ? 'border-accent/60 text-accent' : ''}`}
      >
        {SCREEN_FIELDS.map((f) => <option key={f.id} value={f.id}>{tl(f.label)}</option>)}
      </select>
      <select value={predicate.op} onChange={(e) => set({ op: e.currentTarget.value })}
        aria-label={tl('operator')} class={chip}>
        {ops.map((op) => <option key={op} value={op}>{opLabel(op)}</option>)}
      </select>
      {field?.kind !== 'side' && (
        <input value={predicate.value ?? ''} inputMode="decimal" aria-label={tl('value')}
          onInput={(e) => set({ value: e.currentTarget.value })}
          class={`${chip} w-16 text-right`} />
      )}
      {predicate.op === 'between' && (
        <>
          <span class="text-muted">–</span>
          <input value={predicate.value2 ?? ''} inputMode="decimal" aria-label={tl('upper bound')}
            onInput={(e) => set({ value2: e.currentTarget.value })}
            class={`${chip} w-16 text-right`} />
        </>
      )}
      {field?.unit && field.kind !== 'side' && <span class="text-muted">{field.unit}</span>}
      <button onClick={() => onRemove(index)} title={tl('remove filter')}
        class="ml-auto text-muted hover:text-down px-1">✕</button>
    </div>
  )
}

/** One dashboard row plus the muted mono line that says why it is here. */
function ResultRow({ result, data }) {
  const notes = result.matched ? result.why : [...result.why, ...result.failed]
  return (
    <div class="border-b border-line last:border-0">
      <TuiRow symbol={result.symbol} data={data} />
      <div class="flex justify-end gap-2 px-3 pb-[3px] font-mono text-[10px] text-muted text-right flex-wrap">
        {result.missing.length > 0 && (
          <span class="text-accent/80">
            {tt('screen.no_input', { fields: result.missing.join(', ') })}
          </span>
        )}
        <span class="min-w-0">{notes.join(' · ')}</span>
      </div>
    </div>
  )
}

export function ScreenBoard() {
  const board = useWatchlist()
  const lists = useNamedWatchlists()
  const [defs, setDefs] = useState(loadScreenDefs)
  // The working copy is deliberately loose (values are strings mid-typing);
  // normalizeDef is the gate between the composer and both storage and
  // evaluation, so a half-typed line never becomes a rule.
  const [draft, setDraft] = useState(() => loadScreenDefs()[0] || newScreenDef(tl('new screen')))
  const [notice, setNotice] = useState(null)
  const [watching, setWatching] = useState(false)
  const seen = useRef([])
  const boardRef = useRef(null)

  // Same measured price/change/ext columns the dashboard board uses, so a
  // screen result lines up with the watchlist it came from.
  useEffect(() => { scheduleQuoteColumns(boardRef.current) })

  const def = useMemo(() => normalizeDef(draft) || newScreenDef(tl('new screen')), [draft])
  const universe = useMemo(() => screenUniverse(def, board, lists), [def, board, lists])
  const quotes = useQuotes(universe)

  const rows = universe.map((symbol) => ({
    symbol,
    quote: quotes[symbol]?.quote || null,
    tech: quotes[symbol]?.tech || null,
  }))
  const results = evaluateScreen(rows, def, { labels: label })
  const matched = matchedSymbols(results)
  const pending = results.filter((r) => r.status === 'pending')

  // Entry alerts arm from the moment the switch flips: everything already in
  // the screen is the baseline, not a notification storm.
  useEffect(() => {
    if (!watching) return
    const entered = screenEntrants(seen.current, results)
    seen.current = matched
    if (!entered.length) return
    const armed = []
    for (const symbol of entered) {
      const spec = alertSpecForEntry(def, symbol)
      if (!spec) continue
      try { armed.push(conditionText(addAlert(spec))) } catch { /* rejected by alerts.js */ }
    }
    setNotice(armed.length
      ? `${tl('armed')}: ${armed.join(' · ')}`
      : tt('screen.no_alertable', { symbols: entered.join(', ') }))
  }, [watching, matched.join(',')])

  const patch = (next) => { setDraft(next); setNotice(null) }
  const setPredicate = (index, value) => patch({
    ...draft,
    predicates: draft.predicates.map((p, i) => (i === index ? value : p)),
  })
  const addPredicate = () => patch({
    ...draft,
    predicates: [...draft.predicates, { field: DEFAULT_RANK, op: '<', value: '' }],
  })
  const removePredicate = (index) => patch({
    ...draft,
    predicates: draft.predicates.filter((_, i) => i !== index),
  })
  const toggleSource = (id) => {
    const on = draft.sources?.includes(id)
    const next = on ? draft.sources.filter((s) => s !== id) : [...(draft.sources || []), id]
    patch({ ...draft, sources: next.length ? next : [BOARD_SOURCE] })
  }

  const save = () => {
    const stored = saveScreenDef({ ...def, name: draft.name })
    if (!stored) return setNotice(tl('screen store is full'))
    setDefs(loadScreenDefs())
    setDraft(stored)
    setNotice(`${tl('saved')} — ${stored.name}`)
  }

  const openAsWatchlist = () => {
    if (!matched.length) return setNotice(tl('nothing matched yet'))
    const list = createWatchlist(def.name, matched)
    if (!list) return setNotice(tl('a watchlist already has that name'))
    location.hash = `#/watchlists/${list.id}`
  }

  const armEntries = () => {
    seen.current = matched
    setWatching((on) => !on)
    setNotice(watching ? tl('stopped watching for new entries') : tt('screen.watching', { name: def.name }))
  }

  const sourceChip = (id, name) => {
    const on = draft.sources?.includes(id)
    return (
      <button key={id} onClick={() => toggleSource(id)}
        class={`rounded-[3px] px-1.5 py-[2px] border ${on
          ? 'border-accent/60 text-accent' : 'border-line text-muted hover:text-ink-2'}`}>
        {name}
      </button>
    )
  }

  return (
    <div class="flex-1 p-3 select-text min-w-0">
      {/* saved definitions: one dense line of chips, not a card each */}
      <div class="flex items-center gap-1.5 flex-wrap pb-2 font-mono text-[10px]">
        <span class="text-muted uppercase tracking-wider">{tl('saved screens')}</span>
        {defs.map((s) => (
          <span key={s.id} class="group inline-flex items-center gap-1 border border-line rounded-[3px] pl-2 pr-1 py-px">
            <button onClick={() => { setDraft(s); setNotice(null) }}
              class={`hover:brightness-125 ${s.id === draft.id ? 'text-accent' : 'text-ink-2'}`}>{s.name}</button>
            <button onClick={() => { deleteScreenDef(s.id); setDefs(loadScreenDefs()) }}
              title={tl('delete')}
              class="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 text-muted hover:text-down">✕</button>
          </span>
        ))}
        <button onClick={() => patch(newScreenDef(tl('new screen')))}
          class="border border-dashed border-line-2 rounded-[3px] px-2 py-px text-muted hover:text-accent hover:border-accent/60">
          + {tl('new screen')}
        </button>
      </div>

      <section class="bg-surface-1 border border-line rounded-xl px-3 py-2 max-w-3xl">
        <div class="flex items-center gap-2 pb-1.5 border-b border-line-2 font-mono text-[11px] flex-wrap">
          <input value={draft.name} aria-label={tl('screen name')}
            onInput={(e) => patch({ ...draft, name: e.currentTarget.value })}
            class="bg-transparent text-accent font-semibold text-[12px] outline-none border-b border-transparent focus:border-accent/60 w-40" />
          <span class="text-muted uppercase tracking-wider text-[9px]">{tl('universe')}</span>
          {sourceChip(BOARD_SOURCE, tl('board'))}
          {lists.map((l) => sourceChip(l.id, l.name))}
          <span class="text-muted ml-auto">{universe.length} {tl('symbols')}</span>
        </div>

        {draft.predicates.map((p, i) => (
          <PredicateLine key={i} predicate={p} index={i} isRank={p.field === draft.rankBy}
            onChange={setPredicate} onRemove={removePredicate} />
        ))}
        {!draft.predicates.length && (
          <div class="py-2 font-mono text-[11px] text-muted">{tt('screen.no_predicates')}</div>
        )}

        <div class="flex items-center gap-2 py-[5px] border-b border-line font-mono text-[11px] flex-wrap">
          {draft.predicates.length < MAX_PREDICATES && (
            <button onClick={addPredicate} class="text-muted hover:text-accent">+ {tl('add filter')}</button>
          )}
          <span class="text-muted uppercase tracking-wider text-[9px] ml-auto">{tl('rank by')}</span>
          <select value={draft.rankBy} onChange={(e) => patch({ ...draft, rankBy: e.currentTarget.value })}
            aria-label={tl('rank by')} class={`${chip} border-accent/60 text-accent`}>
            {SCREEN_FIELDS.map((f) => <option key={f.id} value={f.id}>{tl(f.label)}</option>)}
          </select>
          <button onClick={() => patch({ ...draft, rankDir: draft.rankDir === 'asc' ? 'desc' : 'asc' })}
            title={tl('sort direction')} class="text-accent px-1">
            {draft.rankDir === 'asc' ? '▲' : '▼'}
          </button>
        </div>

        <div class="flex items-center gap-3 pt-2 font-mono text-[11px] flex-wrap">
          <button onClick={save} class="text-accent hover:brightness-125">{tl('save screen')}</button>
          <span class="w-px h-3.5 bg-line-2" />
          <button onClick={openAsWatchlist} class="text-ink-2 hover:text-accent">{tl('open as watchlist')}</button>
          <span class="w-px h-3.5 bg-line-2" />
          <button onClick={armEntries} class={watching ? 'text-accent' : 'text-ink-2 hover:text-accent'}>
            {watching ? `● ${tl('watching entries')}` : tl('alert when entered')}
          </button>
          <span class="text-muted ml-auto">
            {matched.length} {tl('matched')} · {pending.length} {tl('pending inputs')}
          </span>
        </div>
        {notice && <div class="pt-1.5 font-mono text-[10px] text-ink-2">{notice}</div>}
      </section>

      <section ref={boardRef} class="@container relative bg-surface-1 border border-line rounded-xl mt-3 overflow-hidden min-w-0">
        {results.filter((r) => r.status !== 'miss').map((r) => (
          <ResultRow key={r.symbol} result={r} data={quotes[r.symbol]} />
        ))}
        {!results.some((r) => r.status !== 'miss') && (
          <Empty label={universe.length ? tl('nothing matched yet') : tl('add symbols to your board first')} />
        )}
      </section>
    </div>
  )
}
