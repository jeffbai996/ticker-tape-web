import { useEffect, useRef, useState } from 'preact/hooks'
import { fetchChatModels, fetchSpend } from '../lib/chatClient.js'
import { runAgentic, trimHistory } from '../lib/agent.js'
import { toolLabel } from '../lib/tools.js'
import { MdLite } from '../components/AiReport.jsx'
import { tl, t as tt } from '../lib/i18n.js'
import { fetchWireChatModels, wireChatAvailable } from '../lib/wirechat.js'
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

function ActivityTrace({ steps, busy }) {
  if (!steps.length) return null
  return (
    <details open={busy} class="self-start max-w-[95%] text-muted">
      <summary class="cursor-pointer select-none font-mono text-[10px] hover:text-ink">
        {busy ? 'Working' : 'Activity'} · {steps.length} {steps.length === 1 ? 'step' : 'steps'}
      </summary>
      <div class="mt-1 ml-1 pl-2 border-l border-line flex flex-col gap-1">
        {steps.map((step) => (
          <div key={step.key} class="flex items-center gap-1.5 font-mono text-[10px]">
            <span class={step.done ? 'text-up' : 'text-accent animate-pulse'}>{step.done ? '✓' : '◌'}</span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </details>
  )
}

export function Chat() {
  const onWire = wireChatAvailable()
  const modelStorageKey = onWire ? 'chat_wire_model' : 'chat_model'
  const [models, setModels] = useState([])
  const [model, setModel] = useState(
    localStorage.getItem(modelStorageKey) || (onWire ? 'agy-flash' : 'flash'),
  )
  const [effort, setEffort] = useState(localStorage.getItem('chat_effort') || 'auto')
  const [spend, setSpend] = useState(null)
  const [history, setHistory] = useState(loadHistory)
  const [input, setInput] = useState(() => {
    const pre = sessionStorage.getItem('chat_prefill') || ''
    sessionStorage.removeItem('chat_prefill')
    return pre
  })
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState([])
  const [activity, setActivity] = useState([])
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)          // memory-tag confirmations
  const [drawer, setDrawer] = useState(null)          // 'mem' | 'journal' | null
  const [memories, setMemories] = useState(loadMemories)
  const [journal, setJournal] = useState(loadJournal)
  const [jrFilter, setJrFilter] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const historyRef = useRef(history)
  const queuedRef = useRef([])
  const busyRef = useRef(false)

  // Launchpad fuel — live quotes, earnings proximity, next calendar event.
  // useQuotes polls, so the pad's suggestions refresh on their own.
  const watchlist = useWatchlist()
  const quotes = useQuotes(history.length === 0 ? watchlist : [])
  const earnDays = useEarningsDays(history.length === 0 ? watchlist : [])
  const nextEvent = mergedEvents(ECON_EVENTS, loadCatalysts(),
    new Date().toISOString().slice(0, 10), 30)[0] || null

  useEffect(() => {
    const load = onWire
      ? fetchWireChatModels()
      : fetchChatModels().then((data) => data.models)
    load.then((liveModels) => {
      setModels(liveModels)
      const current = liveModels.find((candidate) => candidate.key === model)
      if (!current) {
        const fallback = liveModels[0]?.key || (onWire ? 'agy-flash' : 'flash')
        setModel(fallback)
        localStorage.setItem(modelStorageKey, fallback)
        const info = liveModels[0]
        if (onWire) {
          const nextEffort = info?.default_effort || info?.efforts?.[0] || ''
          setEffort(nextEffort)
          localStorage.setItem('chat_effort', nextEffort)
        }
      } else if (onWire) {
        const choices = current.efforts || []
        const nextEffort = choices.includes(effort)
          ? effort
          : (current.default_effort || choices[0] || '')
        setEffort(nextEffort)
        localStorage.setItem('chat_effort', nextEffort)
      }
    }).catch(() => {})
    if (onWire) return
    fetchSpend().then(setSpend).catch(() => {})
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [history])

  const clearComposer = () => {
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  const replaceHistory = (next, persist = false) => {
    historyRef.current = next
    setHistory(next)
    if (persist) saveHistory(next)
  }

  const drainFollowUps = () => {
    const batch = queuedRef.current
    if (!batch.length) return []
    queuedRef.current = []
    setQueued([])
    return batch.map(({ text, model: queuedModel, ts }) => ({
      role: 'user', content: text, ts, model: queuedModel,
    }))
  }

  const runTurn = async ({ text, model: runModel, effort: runEffort, ts }) => {
    setError(null)
    setNotice(null)
    setActivity([{ key: 'context', label: 'Reading live market context', done: false }])

    const base = [...historyRef.current, {
      role: 'user', content: text, ts: ts || Date.now(), model: runModel,
    }]
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
    const runLabel = models.find((candidate) => candidate.key === runModel)?.label || runModel
    setActivity([
      { key: 'context', label: 'Read live market context', done: true },
      { key: 'model', label: `Thinking with ${runLabel}`, done: false },
    ])

    const traceEntries = (entries, modelDone = false) => {
      const toolResults = new Set(entries.filter((m) => m.role === 'tool').map((m) => m.id))
      const toolSteps = entries.flatMap((m) => (m.toolCalls || []).map((tc) => ({
        key: `tool-${tc.id}`, label: toolLabel(tc), done: toolResults.has(tc.id),
      })))
      setActivity([
        { key: 'context', label: 'Read live market context', done: true },
        { key: 'model', label: `${modelDone ? 'Answered with' : 'Thinking with'} ${runLabel}`, done: modelDone },
        ...toolSteps,
      ])
    }

    const finish = () => {
      // Apply + strip [MEMORY…] tags from whatever the model said, stamp
      // the new entries, then persist.
      const notes = []
      const stamped = added.map((m) => {
        if (m.role === 'assistant' && m.content) {
          const r = applyMemoryTags(m.content)
          notes.push(...r.notes)
          return { ...m, content: r.text, ts: Date.now(), model: runModel }
        }
        return m.role === 'assistant' ? { ...m, ts: Date.now(), model: runModel } : m
      })
      if (notes.length) {
        setNotice(notes.join(' · '))
        setMemories(loadMemories())
      }
      const done = [...base, ...stamped]
      replaceHistory(done, true)
    }

    try {
      await runAgentic({
        model: runModel,
        effort: runEffort,
        system,
        messages: trimHistory(base, MODEL_WINDOW),
        takeFollowUps: drainFollowUps,
        onDelta: (d) => {
          live += d
          paint()
        },
        onRound: (entries) => {
          added = entries
          live = ''
          const last = entries[entries.length - 1]
          traceEntries(entries, last?.role === 'assistant' && !last.toolCalls?.length)
          paint()
        },
      })
      traceEntries(added, true)
      finish()
    } catch (err) {
      setError(String(err.message || err))
      setActivity((steps) => steps.map((step) => ({ ...step, done: true })))
      finish()
    }
  }

  const runTurns = async (first) => {
    busyRef.current = true
    setBusy(true)
    let next = first
    try {
      while (next) {
        await runTurn(next)
        // If the current request ended without a tool boundary, its polite
        // queue has not been consumed yet. Continue it as the next turn.
        next = queuedRef.current.shift() || null
        if (next) setQueued([...queuedRef.current])
      }
    } finally {
      busyRef.current = false
      setBusy(false)
      if (!onWire) fetchSpend().then(setSpend).catch(() => {})
    }
  }

  const send = (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    const item = { text, model, effort, ts: Date.now() }
    clearComposer()
    if (busyRef.current) {
      queuedRef.current = [...queuedRef.current, item]
      setQueued([...queuedRef.current])
      return
    }
    runTurns(item)
  }

  const clear = () => {
    replaceHistory([], true)
  }

  // Tool results by call id, for chip status/tooltips.
  const results = new Map(history.filter((m) => m.role === 'tool').map((m) => [m.id, m.content]))
  const selectedModel = models.find((candidate) => candidate.key === model)
  const effortLevels = onWire
    ? (selectedModel?.efforts || [])
    : ['auto', 'off', 'low', 'medium', 'high']

  const chooseModel = (key) => {
    setModel(key)
    localStorage.setItem(modelStorageKey, key)
    const info = models.find((candidate) => candidate.key === key)
    const choices = info?.efforts || []
    if (onWire && choices.length && !choices.includes(effort)) {
      const nextEffort = info.default_effort || choices[0]
      setEffort(nextEffort)
      localStorage.setItem('chat_effort', nextEffort)
    } else if (onWire && !choices.length) {
      setEffort('')
      localStorage.setItem('chat_effort', '')
    }
  }

  return (
    <div class="flex-1 flex flex-col p-3 min-h-0 min-w-0 select-text">
      <div class="flex items-center gap-3 px-1 pb-2 flex-wrap">
        <h1 class="font-bold text-lg text-ink" style="font-family: 'Plus Jakarta Sans', sans-serif">{tl('AI Chat')}</h1>
        <label class="flex items-center gap-1.5 bg-surface-2 border border-line rounded-lg pl-2.5 pr-1 py-1 focus-within:border-accent/70 hover:border-line-2 transition-colors">
          <span class="font-mono text-[9px] uppercase tracking-wider text-muted">model</span>
          <select
            value={model}
            onChange={(e) => chooseModel(e.currentTarget.value)}
            class="bg-transparent font-mono text-[11px] text-ink outline-none pr-1 cursor-pointer"
          >
            {(models.length ? models : [{ key: model, label: model }]).map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>
        {onWire && (
          <span class="font-mono text-[10px] text-muted border border-line rounded-md px-2 py-1"
                title="answers come from your own subscription via fragwire — no metered API, no cap">
            via <span class="text-accent">wire</span>
          </span>
        )}
        {effortLevels.length > 0 && <div class="flex items-center gap-0.5 bg-surface-2 border border-line rounded-lg p-0.5" title="thinking effort">
          {effortLevels.map((lv) => (
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
        {onWire && selectedModel?.fixed_effort && (
          <span class="font-mono text-[10px] text-muted border border-line rounded-md px-2 py-1"
                title="this subscription model has a fixed thinking tier">
            {selectedModel.fixed_effort}
          </span>
        )}
        <div class="ml-auto flex items-center gap-3">
          <button
            onClick={() => { setMemories(loadMemories()); setDrawer(drawer === 'mem' ? null : 'mem') }}
            class={`w-7 h-7 grid place-items-center rounded-md ${drawer === 'mem' ? 'text-accent bg-accent-soft' : 'text-muted hover:text-ink hover:bg-surface-2'}`}
            title="persistent memories — the assistant carries these into every conversation"
            aria-label="memories"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 4.5a3 3 0 0 0-5 2.2v1.1A3.2 3.2 0 0 0 4.5 14v1a3 3 0 0 0 4.5 2.6M15 4.5a3 3 0 0 1 5 2.2v1.1a3.2 3.2 0 0 1-.5 6.2v1a3 3 0 0 1-4.5 2.6M9 4v16M15 4v16M9 8h2M13 12h2M9 16h2"/></svg>
          </button>
          <button
            onClick={() => { setJournal(loadJournal()); setDrawer(drawer === 'journal' ? null : 'journal') }}
            class={`w-7 h-7 grid place-items-center rounded-md ${drawer === 'journal' ? 'text-accent bg-accent-soft' : 'text-muted hover:text-ink hover:bg-surface-2'}`}
            title="trade journal — your own decisions and rationale, searchable"
            aria-label="trade journal"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5zM5 4.5v17M9 7h7M9 11h7M9 15h4"/></svg>
          </button>
          {history.length > 0 && (
            <button onClick={() => exportChat(history)} class="w-7 h-7 grid place-items-center rounded-md text-muted hover:text-ink hover:bg-surface-2"
              title="download the transcript as markdown">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"/></svg>
            </button>
          )}
          {history.length > 0 && (
            <button onClick={clear} class="w-7 h-7 grid place-items-center rounded-md text-muted hover:text-down hover:bg-surface-2" title={tl('clear')}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 3h6l1 4H8zM7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>
            </button>
          )}
        </div>
      </div>

      {drawer === 'mem' && (
        <div class="fixed inset-0 z-50 bg-black/55 grid place-items-center p-4" onClick={() => setDrawer(null)}>
        <div class="max-w-xl w-full bg-surface-1 border border-line rounded-2xl px-4 py-3 max-h-[72vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div class="flex items-start gap-3 pb-3 border-b border-line">
            <div><div class="font-anth text-[15px] font-semibold text-ink">Memories</div>
              <div class="font-anth text-[11px] text-muted">Details the assistant should remember in future chats.</div></div>
            <button class="ml-auto text-muted hover:text-ink" onClick={() => setDrawer(null)} aria-label="close">✕</button>
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
        </div>
      )}

      {drawer === 'journal' && (
        <div class="fixed inset-0 z-50 bg-black/55 grid place-items-center p-4" onClick={() => setDrawer(null)}>
        <div class="max-w-xl w-full bg-surface-1 border border-line rounded-2xl px-4 py-3 max-h-[72vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div class="flex items-center gap-2 pb-3 border-b border-line">
            <div><div class="font-anth text-[15px] font-semibold text-ink">Trade journal</div>
              <div class="font-anth text-[11px] text-muted">Your decisions, rationale, and notes—not AI settings.</div></div>
            <input value={jrFilter} onInput={(e) => setJrFilter(e.currentTarget.value)}
              placeholder="search…"
              class="ml-auto bg-surface-2 border border-line rounded-md px-2 py-0.5 font-mono text-[10px] text-ink outline-none focus:border-accent/60 w-32 placeholder:text-muted" />
            <button class="text-muted hover:text-ink" onClick={() => setDrawer(null)} aria-label="close">✕</button>
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
        <ActivityTrace steps={activity} busy={busy} />
        {queued.map((item, i) => (
          <div key={`${item.ts}-${i}`} class="self-end max-w-[85%] flex flex-col items-end gap-0.5">
            <div class="rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap bg-accent-soft/60 border border-accent/25 text-ink font-anth">
              {item.text}
            </div>
            <span class="font-mono text-[9px] text-muted pr-1">queued follow-up</span>
          </div>
        ))}
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
            placeholder={busy ? tt('chat.follow_up') : tt('chat.placeholder')}
            class="flex-1 bg-transparent resize-none outline-none text-[13.5px] leading-[21px] py-[5.5px] text-ink placeholder:text-muted max-h-40 font-anth"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            title={busy ? 'queue follow-up  ⏎' : 'send  ⏎'}
            class="shrink-0 w-8 h-8 grid place-items-center rounded-full bg-accent text-black disabled:bg-surface-3 disabled:text-muted transition-colors"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          </button>
        </div>
        <div class="flex items-center gap-3 px-2 pt-1 font-mono text-[9.5px] text-muted">
          <span><kbd class="text-ink-2">⏎</kbd> send</span>
          <span><kbd class="text-ink-2">⇧⏎</kbd> newline</span>
          {queued.length > 0 && <span class="text-accent">{queued.length} queued</span>}
          {!onWire && <SpendMeter spend={spend} />}
        </div>
      </form>
    </div>
  )
}
