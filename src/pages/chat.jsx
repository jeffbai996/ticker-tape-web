import { useEffect, useRef, useState } from 'preact/hooks'
import { fetchChatModels, fetchSpend } from '../lib/chatClient.js'
import { runAgentic, trimHistory } from '../lib/agent.js'
import { toolLabel } from '../lib/tools.js'
import { MdLite } from '../components/AiReport.jsx'
import { tl, t as tt } from '../lib/i18n.js'
import { wireChatAvailable } from '../lib/wirechat.js'
import { useQuotes, useWatchlist } from '../hooks.js'
import { useEarningsDays } from './dashboard.jsx'
import { ECON_EVENTS } from '../lib/markets.js'
import { loadCatalysts, mergedEvents } from '../lib/catalysts.js'
import { fmtPct } from '../lib/format.js'
import { buildChatContext, hasLiveBook } from '../lib/chatContext.js'
import { loadMemories, addMemory, editMemory, removeMemory, applyMemoryTags } from '../lib/chatMemory.js'
import { loadJournal, addJournalEntry, removeJournalEntry, searchJournal } from '../lib/journal.js'

// Base prompt stays generic in source. Whether the assistant has a real book
// is decided at runtime by whether the viewer wired in their own fragwire —
// the public no-endpoint build keeps the demo disclaimer.
function baseSystem() {
  const common =
    'You are the assistant inside ticker-tape-web, a market dashboard ' +
    '(dashboard, markets, per-symbol research, screening, alerts, portfolio). ' +
    'You have tools: live quotes, technicals, earnings, market ' +
    'pulse, the macro calendar (plus adding user catalysts to it), watchlist ' +
    'read/write, alert arming, persistent memory, and app navigation. Use them for ' +
    'anything involving current prices, technicals, or the watchlist instead of ' +
    'answering from memory; call several in one round when that is faster. '
  const book = hasLiveBook()
    ? 'A LIVE PORTFOLIO block in your context is the user\'s real book — treat ' +
      'position and margin questions as real. '
    : 'You have no access to any personal, account, or portfolio data — the ' +
      'portfolio section is a clearly-labeled synthetic demo. '
  return common + book + 'Be concise.'
}

const HISTORY_KEY = 'chat_history_v1'
const STORE_MAX = 400     // what the browser keeps and the page renders
const MODEL_WINDOW = 48   // what a single turn actually sends to the model

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []
  } catch {
    return []
  }
}

function saveHistory(h) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimHistory(h, STORE_MAX)))
  } catch { /* best-effort */ }
}

/** Download the transcript as markdown (CLI `export` parity). */
function exportChat(history) {
  const stamp = (m) => (m.ts ? ` _${new Date(m.ts).toLocaleString()}_` : '')
  const lines = [`# ticker-tape chat export — ${new Date().toISOString().slice(0, 16)}`, '']
  for (const m of history) {
    if (m.role === 'user') lines.push(`**You**${stamp(m)}`, '', m.content, '', '---', '')
    else if (m.role === 'assistant' && m.content) {
      lines.push(`**Assistant**${m.model ? ` (${m.model})` : ''}${stamp(m)}`, '', m.content, '', '---', '')
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `chat_${new Date().toISOString().slice(0, 10)}.md`
  a.click()
  URL.revokeObjectURL(a.href)
}

const SUGGESTIONS = [
  "what's moving today?",
  'how does NVDA look technically?',
  "what's on the calendar this week?",
  'open TSLA research',
]

/**
 * Launchpad quick actions, computed from live data so the pad stays current:
 * an earnings print today suggests its own summary, a big mover suggests its
 * own "why", the next macro event suggests its own read.
 */
function dynamicActions({ watchlist, quotes, earnDays, nextEvent, book }) {
  const acts = []
  const reporting = watchlist.filter((s) => earnDays[s] === 0).slice(0, 2)
  for (const s of reporting) acts.push(`summarize ${s}'s earnings report`)
  const soon = watchlist.filter((s) => earnDays[s] > 0 && earnDays[s] <= 3)
    .sort((a, b) => earnDays[a] - earnDays[b])[0]
  if (soon) acts.push(`what should I watch in ${soon}'s earnings (${earnDays[soon]}d out)?`)
  const movers = watchlist
    .map((s) => ({ s, pct: quotes[s]?.quote?.pct }))
    .filter((x) => x.pct != null && Math.abs(x.pct) >= 3)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 2)
  for (const m of movers) {
    acts.push(`what's driving ${m.s} ${m.pct > 0 ? 'up' : 'down'} ${Math.abs(m.pct).toFixed(1)}% today?`)
  }
  if (nextEvent && nextEvent.days <= 5) {
    acts.push(`what does ${nextEvent.rawLabel || nextEvent.label} (${nextEvent.days === 0 ? 'today' : `${nextEvent.days}d`}) mean for ${book ? 'my book' : 'the market'}?`)
  }
  if (book) acts.push('how is my book positioned this week?')
  for (const s of SUGGESTIONS) {
    if (acts.length >= 7) break
    acts.push(s)
  }
  return acts.slice(0, 7)
}

/** Inline-editable row shared by the memory and journal drawers. */
function NoteRow({ id, text, meta, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  if (editing) {
    return (
      <div class="flex items-start gap-2 py-1 font-mono text-[11px]">
        <span class="text-accent shrink-0 pt-0.5">#{id}</span>
        <textarea
          value={draft}
          rows={2}
          onInput={(e) => setDraft(e.currentTarget.value)}
          class="flex-1 bg-surface-2 border border-accent/50 rounded-md px-2 py-1 text-ink outline-none resize-y font-anth text-[12px]"
        />
        <button onClick={() => { onSave(draft); setEditing(false) }}
          class="text-up hover:brightness-125 shrink-0 pt-0.5">✓</button>
        <button onClick={() => { setDraft(text); setEditing(false) }}
          class="text-muted hover:text-ink shrink-0 pt-0.5">✕</button>
      </div>
    )
  }
  return (
    <div class="group flex items-baseline gap-2 py-1 font-mono text-[11px] border-b border-line-2/60 last:border-0">
      <span class="text-accent shrink-0">#{id}</span>
      <span class="text-ink-2 flex-1 min-w-0 font-anth text-[12px] leading-snug">{text}</span>
      {meta && <span class="text-muted text-[9px] shrink-0">{meta}</span>}
      {onSave && (
        <button onClick={() => setEditing(true)} title="edit"
          class="opacity-0 group-hover:opacity-100 text-muted hover:text-accent shrink-0">✎</button>
      )}
      <button onClick={onDelete} title="delete"
        class="opacity-0 group-hover:opacity-100 text-muted hover:text-down shrink-0">✕</button>
    </div>
  )
}

/** Add-line at the bottom of a drawer. */
function NoteAdd({ placeholder, onAdd }) {
  const [v, setV] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (!v.trim()) return
    onAdd(v.trim())
    setV('')
  }
  return (
    <form onSubmit={submit} class="flex items-center gap-2 pt-1.5">
      <input value={v} onInput={(e) => setV(e.currentTarget.value)} placeholder={placeholder}
        class="flex-1 bg-surface-2 border border-line rounded-md px-2 py-1 font-anth text-[12px] text-ink outline-none focus:border-accent/60 placeholder:text-muted" />
      <button type="submit" disabled={!v.trim()}
        class="font-mono text-[10px] px-2 py-1 rounded-md border border-line text-muted hover:text-ink hover:border-accent/50 disabled:opacity-40">
        add
      </button>
    </form>
  )
}

/** Three-dot pulse — a spinner reads as an error state, this reads as work. */
function Thinking() {
  return (
    <span class="inline-flex items-center gap-1 py-1" aria-label="thinking">
      {[0, 1, 2].map((i) => (
        <span key={i} class="w-1.5 h-1.5 rounded-full bg-muted animate-pulse"
              style={`animation-delay:${i * 160}ms`} />
      ))}
    </span>
  )
}

/** Composer grows with the message instead of scrolling a one-line box. */
function autoGrow(el) {
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}

function SpendMeter({ spend }) {
  if (!spend) return null
  const pct = Math.min(100, (spend.spent / spend.cap) * 100)
  return (
    <span class="flex items-center gap-2 font-mono text-[10px] text-muted" title={tt('chat.cap_note')}>
      <span>${spend.spent.toFixed(2)} / ${spend.cap}</span>
      <span class="w-20 h-1.5 bg-surface-2 rounded-full overflow-hidden inline-block">
        <span class={`block h-full ${pct > 80 ? 'bg-down' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </span>
    </span>
  )
}

function ToolChips({ calls, results }) {
  return (
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 self-start pl-1">
      {calls.map((tc) => {
        const res = results.get(tc.id)
        const failed = res != null && res.startsWith('{"error"')
        return (
          <span
            key={tc.id}
            title={failed ? res.slice(0, 200) : undefined}
            class="inline-flex items-center gap-1 font-mono text-[10px] text-muted"
          >
            <span class={failed ? 'text-down' : res == null ? 'text-accent animate-pulse' : 'text-up'}>
              {failed ? '✕' : res == null ? '◌' : '✓'}
            </span>
            {toolLabel(tc)}
          </span>
        )
      })}
    </div>
  )
}

export function Chat() {
  const [models, setModels] = useState([])
  const [model, setModel] = useState(localStorage.getItem('chat_model') || 'flash')
  const [effort, setEffort] = useState(localStorage.getItem('chat_effort') || 'auto')
  const [spend, setSpend] = useState(null)
  const [history, setHistory] = useState(loadHistory)
  const [input, setInput] = useState(() => {
    const pre = sessionStorage.getItem('chat_prefill') || ''
    sessionStorage.removeItem('chat_prefill')
    return pre
  })
  const onWire = wireChatAvailable()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)          // memory-tag confirmations
  const [drawer, setDrawer] = useState(null)          // 'mem' | 'journal' | null
  const [memories, setMemories] = useState(loadMemories)
  const [journal, setJournal] = useState(loadJournal)
  const [jrFilter, setJrFilter] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // Launchpad fuel — live quotes, earnings proximity, next calendar event.
  // useQuotes polls, so the pad's suggestions refresh on their own.
  const watchlist = useWatchlist()
  const quotes = useQuotes(history.length === 0 ? watchlist : [])
  const earnDays = useEarningsDays(history.length === 0 ? watchlist : [])
  const nextEvent = mergedEvents(ECON_EVENTS, loadCatalysts(),
    new Date().toISOString().slice(0, 10), 30)[0] || null

  useEffect(() => {
    // on the wire path the worker is never used — don't ask it anything
    if (wireChatAvailable()) return
    fetchChatModels().then((d) => {
      setModels(d.models)
      if (!d.models.some((candidate) => candidate.key === model)) {
        setModel('flash')
        localStorage.setItem('chat_model', 'flash')
      }
    }).catch(() => {})
    fetchSpend().then(setSpend).catch(() => {})
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [history])

  const send = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setError(null)
    setNotice(null)
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setBusy(true)

    const base = [...history, { role: 'user', content: text, ts: Date.now(), model }]
    let added = []
    let live = ''
    const paint = () =>
      setHistory([...base, ...added, ...(live ? [{ role: 'assistant', content: live }] : [])])
    paint()

    // CLI parity: volatile context (clock, memories, quotes, book, news for
    // mentioned symbols) rebuilt per turn and appended to the base prompt.
    let system = baseSystem()
    try {
      system += '\n\n' + await buildChatContext(text)
    } catch { /* context is best-effort — a bare prompt still answers */ }

    const finish = () => {
      // Apply + strip [MEMORY…] tags from whatever the model said, stamp
      // the new entries, then persist.
      const notes = []
      const stamped = added.map((m) => {
        if (m.role === 'assistant' && m.content) {
          const r = applyMemoryTags(m.content)
          notes.push(...r.notes)
          return { ...m, content: r.text, ts: Date.now(), model }
        }
        return m.role === 'assistant' ? { ...m, ts: Date.now(), model } : m
      })
      if (notes.length) {
        setNotice(notes.join(' · '))
        setMemories(loadMemories())
      }
      const done = [...base, ...stamped]
      setHistory(done)
      saveHistory(done)
    }

    try {
      await runAgentic({
        model,
        effort,
        system,
        messages: trimHistory(base, MODEL_WINDOW),
        onDelta: (d) => {
          live += d
          paint()
        },
        onRound: (entries) => {
          added = entries
          live = ''
          paint()
        },
      })
      finish()
    } catch (err) {
      setError(String(err.message || err))
      finish()
    } finally {
      setBusy(false)
      if (!onWire) fetchSpend().then(setSpend).catch(() => {})
    }
  }

  const clear = () => {
    setHistory([])
    saveHistory([])
  }

  // Tool results by call id, for chip status/tooltips.
  const results = new Map(history.filter((m) => m.role === 'tool').map((m) => [m.id, m.content]))

  return (
    <div class="flex-1 flex flex-col p-3 min-h-0 min-w-0 select-text">
      <div class="flex items-center gap-3 px-1 pb-2 flex-wrap">
        <h1 class="font-bold text-lg text-ink" style="font-family: 'Plus Jakarta Sans', sans-serif">{tl('AI Chat')}</h1>
        {!onWire && <label class="flex items-center gap-1.5 bg-surface-2 border border-line rounded-lg pl-2.5 pr-1 py-1 focus-within:border-accent/70 hover:border-line-2 transition-colors">
          <span class="font-mono text-[9px] uppercase tracking-wider text-muted">model</span>
          <select
            value={model}
            onChange={(e) => {
              setModel(e.currentTarget.value)
              localStorage.setItem('chat_model', e.currentTarget.value)
            }}
            class="bg-transparent font-mono text-[11px] text-ink outline-none pr-1 cursor-pointer"
          >
            {(models.length ? models : [{ key: model, label: model }]).map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>}
        {onWire && (
          <span class="font-mono text-[10px] text-muted border border-line rounded-md px-2 py-1"
                title="answers come from your own subscription via fragwire — no metered API, no cap">
            via <span class="text-accent">wire</span>
          </span>
        )}
        {!onWire && <div class="flex items-center gap-0.5 bg-surface-2 border border-line rounded-lg p-0.5" title="thinking effort">
          {['auto', 'off', 'low', 'medium', 'high'].map((lv) => (
            <button
              key={lv}
              onClick={() => {
                setEffort(lv)
                localStorage.setItem('chat_effort', lv)
              }}
              class={`px-2 py-[3px] font-mono text-[10px] rounded-md transition-colors ${
                effort === lv
                  ? 'bg-accent text-black font-bold'
                  : 'text-muted hover:text-ink hover:bg-surface-3'
              }`}
            >
              {lv}
            </button>
          ))}
        </div>}
        <div class="ml-auto flex items-center gap-3">
          <button
            onClick={() => { setMemories(loadMemories()); setDrawer(drawer === 'mem' ? null : 'mem') }}
            class={`font-mono text-[10px] ${drawer === 'mem' ? 'text-accent' : 'text-muted hover:text-ink'}`}
            title="persistent memories — the assistant carries these into every conversation"
          >
            mem {memories.length}
          </button>
          <button
            onClick={() => { setJournal(loadJournal()); setDrawer(drawer === 'journal' ? null : 'journal') }}
            class={`font-mono text-[10px] ${drawer === 'journal' ? 'text-accent' : 'text-muted hover:text-ink'}`}
            title="trade journal — your own decisions and rationale, searchable"
          >
            journal {journal.length}
          </button>
          {history.length > 0 && (
            <button onClick={() => exportChat(history)} class="font-mono text-[10px] text-muted hover:text-ink"
              title="download the transcript as markdown">
              {tl('export')}
            </button>
          )}
          {history.length > 0 && (
            <button onClick={clear} class="font-mono text-[10px] text-muted hover:text-down">
              {tl('clear')}
            </button>
          )}
        </div>
      </div>

      {drawer === 'mem' && (
        <div class="max-w-3xl w-full mb-2 bg-surface-1 border border-line rounded-xl px-3 py-2 max-h-[38vh] overflow-y-auto">
          <div class="font-mono text-[9px] tracking-wider text-muted uppercase pb-1">
            memories — injected into every turn · “remember …” / “forget #N” in chat also works
          </div>
          {memories.length === 0 && (
            <div class="font-anth text-[12px] text-muted py-1">nothing saved yet</div>
          )}
          {memories.map((m) => (
            <NoteRow key={m.id} id={m.id} text={m.text}
              meta={new Date(m.ts).toISOString().slice(0, 10)}
              onSave={(t) => { editMemory(m.id, t); setMemories(loadMemories()) }}
              onDelete={() => { removeMemory(m.id); setMemories(loadMemories()) }} />
          ))}
          <NoteAdd placeholder="add a memory…"
            onAdd={(t) => { addMemory(t); setMemories(loadMemories()) }} />
        </div>
      )}

      {drawer === 'journal' && (
        <div class="max-w-3xl w-full mb-2 bg-surface-1 border border-line rounded-xl px-3 py-2 max-h-[38vh] overflow-y-auto">
          <div class="flex items-center gap-2 pb-1">
            <span class="font-mono text-[9px] tracking-wider text-muted uppercase">
              trade journal — “journal: …” in chat also works
            </span>
            <input value={jrFilter} onInput={(e) => setJrFilter(e.currentTarget.value)}
              placeholder="search…"
              class="ml-auto bg-surface-2 border border-line rounded-md px-2 py-0.5 font-mono text-[10px] text-ink outline-none focus:border-accent/60 w-32 placeholder:text-muted" />
          </div>
          {(jrFilter ? searchJournal(jrFilter) : journal).slice(-30).reverse().map((e) => (
            <NoteRow key={e.id} id={e.id} text={e.text}
              meta={`${new Date(e.ts).toISOString().slice(0, 10)}${e.symbols.length ? ` · ${e.symbols.join(' ')}` : ''}`}
              onDelete={() => { removeJournalEntry(e.id); setJournal(loadJournal()) }} />
          ))}
          {(jrFilter ? searchJournal(jrFilter) : journal).length === 0 && (
            <div class="font-anth text-[12px] text-muted py-1">
              {jrFilter ? 'no matches' : 'nothing logged yet'}
            </div>
          )}
          <NoteAdd placeholder="log a decision, a read, a why…"
            onAdd={(t) => { addJournalEntry(t); setJournal(loadJournal()) }} />
        </div>
      )}

      <div ref={scrollRef} class="flex-1 overflow-y-auto min-h-0 max-w-3xl w-full flex flex-col gap-2 px-1">
        {history.length === 0 && (() => {
          const book = hasLiveBook()
          const acts = dynamicActions({ watchlist, quotes, earnDays, nextEvent, book })
          const movers = watchlist
            .map((s) => ({ s, pct: quotes[s]?.quote?.pct }))
            .filter((x) => x.pct != null)
            .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
            .slice(0, 3)
          const nextEarn = watchlist
            .filter((s) => earnDays[s] != null && earnDays[s] >= 0)
            .sort((a, b) => earnDays[a] - earnDays[b])
            .slice(0, 3)
          return (
            <div class="pt-6 flex flex-col items-start gap-5 w-full">
              <div>
                <div class="text-ink text-[16px] font-anth font-semibold">
                  {onWire
                    ? 'Ask about a ticker, a sector, or the book.'
                    : tt('chat.empty')}
                </div>
                <div class="text-muted text-[12px] font-anth pt-1">
                  live quotes · technicals · calendar · watchlist · alerts · memory · journal · navigation
                </div>
              </div>

              {/* right now — the pad rebuilds itself from live data */}
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                <div class="bg-surface-1 border border-line rounded-xl px-3 py-2">
                  <div class="font-mono text-[9px] tracking-wider text-muted uppercase pb-1">moving now</div>
                  {movers.length ? movers.map(({ s, pct }) => (
                    <a key={s} href={`#/research/${s.toLowerCase()}`} class="flex items-baseline justify-between font-mono text-[12px] py-0.5 hover:no-underline">
                      <span class="text-ink font-bold">{s}</span>
                      <span class={pct >= 0 ? 'text-up' : 'text-down'}>{fmtPct(pct)}</span>
                    </a>
                  )) : <div class="font-mono text-[11px] text-muted py-1">loading…</div>}
                </div>
                <div class="bg-surface-1 border border-line rounded-xl px-3 py-2">
                  <div class="font-mono text-[9px] tracking-wider text-muted uppercase pb-1">next earnings</div>
                  {nextEarn.length ? nextEarn.map((s) => (
                    <a key={s} href={`#/research/${s.toLowerCase()}/earnings`} class="flex items-baseline justify-between font-mono text-[12px] py-0.5 hover:no-underline">
                      <span class="text-ink font-bold">{s}</span>
                      <span class={earnDays[s] === 0 ? 'text-imminent font-bold' : earnDays[s] <= 7 ? 'text-down' : 'text-accent'}>
                        {earnDays[s]}d
                      </span>
                    </a>
                  )) : <div class="font-mono text-[11px] text-muted py-1">loading…</div>}
                </div>
                <div class="bg-surface-1 border border-line rounded-xl px-3 py-2">
                  <div class="font-mono text-[9px] tracking-wider text-muted uppercase pb-1">on the calendar</div>
                  {nextEvent ? (
                    <a href="#/markets/calendar" class="block font-mono text-[12px] py-0.5 hover:no-underline">
                      <span class="text-ink">{nextEvent.label}</span>{' '}
                      <span class={nextEvent.days <= 1 ? 'text-imminent font-bold' : nextEvent.days <= 7 ? 'text-down' : 'text-accent'}>
                        {nextEvent.days === 0 ? 'today' : `${nextEvent.days}d`}
                      </span>
                    </a>
                  ) : <div class="font-mono text-[11px] text-muted py-1">clear runway</div>}
                </div>
              </div>

              <div class="flex flex-wrap gap-1.5">
                {acts.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => { setInput(sug); inputRef.current?.focus() }}
                    class="font-anth text-[12px] text-ink-2 border border-line rounded-full px-3 py-1 hover:border-accent/60 hover:text-ink hover:bg-accent-soft transition-colors"
                  >
                    {sug}
                  </button>
                ))}
              </div>

              {(memories.length > 0 || journal.length > 0) && (
                <div class="font-mono text-[10px] text-muted">
                  {memories.length > 0 && <span>{memories.length} memories</span>}
                  {memories.length > 0 && journal.length > 0 && ' · '}
                  {journal.length > 0 && <span>{journal.length} journal entries</span>}
                </div>
              )}
            </div>
          )
        })()}
        {history.map((m, i) => {
          if (m.role === 'tool') return null
          if (m.role === 'assistant' && m.toolCalls?.length) {
            return (
              <div key={i} class="self-start flex flex-col gap-1 max-w-[95%]">
                {m.content && (
                  <div class="rounded-xl border px-3 py-2 text-[13px] leading-relaxed bg-surface-1 border-line text-ink">
                    <MdLite text={m.content} />
                  </div>
                )}
                <ToolChips calls={m.toolCalls} results={results} />
              </div>
            )
          }
          if (m.role === 'assistant') {
            return (
              <div key={i} class="group self-start max-w-[95%] relative"
                title={m.ts ? `${m.model ? `${m.model} · ` : ''}${new Date(m.ts).toLocaleString()}` : undefined}>
                <div class="rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-relaxed bg-surface-1 border-line text-ink font-anth">
                  {m.content
                    ? <MdLite text={m.content} />
                    : busy && i === history.length - 1
                      ? <Thinking />
                      : null}
                </div>
                {m.content && (
                  <div class="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(m.content)}
                      title="copy"
                      class="bg-surface-2 border border-line rounded-md px-1.5 py-0.5 font-mono text-[9px] text-muted hover:text-ink"
                    >
                      copy
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // CLI `journal save` parity: the exchange, not just the answer
                        const q = history[i - 1]?.role === 'user' ? history[i - 1].content : ''
                        const e = addJournalEntry(`${q ? `Q: ${q}\n\n` : ''}A: ${m.content}`)
                        setJournal(loadJournal())
                        setNotice(e ? `✓ exchange saved to journal #${e.id}` : null)
                      }}
                      title="save this exchange to the trade journal"
                      class="bg-surface-2 border border-line rounded-md px-1.5 py-0.5 font-mono text-[9px] text-muted hover:text-accent"
                    >
                      → journal
                    </button>
                  </div>
                )}
              </div>
            )
          }
          return (
            <div key={i} class="self-end rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap bg-accent-soft border border-accent/40 text-ink max-w-[85%] font-anth">
              {m.content}
            </div>
          )
        })}
        {busy && ['user', 'tool'].includes(history[history.length - 1]?.role) && (
          <div class="self-start px-1"><Thinking /></div>
        )}
        {notice && (
          <div class="self-start font-mono text-[10px] text-up px-1">{notice}</div>
        )}
        {error && (
          <div class="self-start font-mono text-[11px] text-down px-1">{error}</div>
        )}
      </div>

      <form onSubmit={send} class="max-w-3xl w-full pt-2">
        {/* items-center keeps a one-line placeholder vertically centered
            against the 32px send button; the textarea grows downward from
            there (Jeff 2026-08-04: "placeholder isn't centered"). */}
        <div class="flex items-center gap-2 bg-surface-1 border border-line rounded-2xl px-3 py-1.5 focus-within:border-accent/70 focus-within:shadow-[0_0_0_1px_rgba(245,158,11,0.15)] transition-all">
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            onInput={(e) => {
              setInput(e.currentTarget.value)
              autoGrow(e.currentTarget)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) }
            }}
            placeholder={tt('chat.placeholder')}
            class="flex-1 bg-transparent resize-none outline-none text-[13.5px] leading-[21px] py-[5.5px] text-ink placeholder:text-muted max-h-40 font-anth"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            title={busy ? 'working' : 'send  ⏎'}
            class="shrink-0 w-8 h-8 grid place-items-center rounded-full bg-accent text-black disabled:bg-surface-3 disabled:text-muted transition-colors"
          >
            {busy
              ? <span class="block w-3 h-3 rounded-sm bg-black/70 animate-pulse" />
              : <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>}
          </button>
        </div>
        <div class="flex items-center gap-3 px-2 pt-1 font-mono text-[9.5px] text-muted">
          <span><kbd class="text-ink-2">⏎</kbd> send</span>
          <span><kbd class="text-ink-2">⇧⏎</kbd> newline</span>
          {!onWire && <SpendMeter spend={spend} />}
        </div>
      </form>
    </div>
  )
}
