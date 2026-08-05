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
import { buildChatContext, hasLiveBook, fetchBookJson } from '../lib/chatContext.js'
import { pulseStats } from '../lib/pulse.js'
import { loadMemories, addMemory, editMemory, removeMemory, applyMemoryTags } from '../lib/chatMemory.js'
import { loadJournal, addJournalEntry, removeJournalEntry, searchJournal } from '../lib/journal.js'
import { CHAT_HOME_EVENT, takeChatHomePending } from '../lib/chatnav.js'

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
  { t: "what's moving today?", k: 'mkt' },
  { t: 'how does NVDA look technically?', k: 'mkt' },
  { t: "what's on the calendar this week?", k: 'mkt' },
  { t: 'open TSLA research', k: 'app' },
]

/**
 * Launchpad quick actions, computed from live data so the pad stays current:
 * an earnings print today suggests its own summary, a big mover suggests its
 * own "why", the next macro event suggests its own read, the journal suggests
 * its own recall. Typed (mkt / book / app) so the chips can wear their lane.
 */
function dynamicActions({ watchlist, quotes, earnDays, nextEvent, book, journal }) {
  const acts = []
  const push = (t, k) => { if (!acts.some((a) => a.t === t)) acts.push({ t, k }) }

  const reporting = watchlist.filter((s) => earnDays[s] === 0).slice(0, 2)
  for (const s of reporting) push(`summarize ${s}'s earnings report`, 'mkt')
  const soon = watchlist.filter((s) => earnDays[s] > 0 && earnDays[s] <= 3)
    .sort((a, b) => earnDays[a] - earnDays[b])[0]
  if (soon) push(`what should I watch in ${soon}'s earnings (${earnDays[soon]}d out)?`, 'mkt')

  const movers = watchlist
    .map((s) => ({ s, pct: quotes[s]?.quote?.pct, price: quotes[s]?.quote?.price }))
    .filter((x) => x.pct != null && Math.abs(x.pct) >= 3)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
  for (const m of movers.slice(0, 2)) {
    push(`what's driving ${m.s} ${m.pct > 0 ? 'up' : 'down'} ${Math.abs(m.pct).toFixed(1)}% today?`, 'mkt')
  }

  if (nextEvent && nextEvent.days <= 7) {
    push(`what does ${nextEvent.rawLabel || nextEvent.label} (${nextEvent.days === 0 ? 'today' : `${nextEvent.days}d`}) mean for ${book ? 'my book' : 'the market'}?`, book ? 'book' : 'mkt')
  }

  if (book) {
    push('how is my book positioned this week?', 'book')
    push("what's the biggest risk to the book right now?", 'book')
  }

  // a live alert suggestion off the top mover — the arm tool is real
  const top = movers[0]
  if (top?.price) {
    const lvl = top.pct > 0
      ? Math.ceil((top.price * 1.03) / 5) * 5
      : Math.floor((top.price * 0.97) / 5) * 5
    push(`arm an alert on ${top.s} at ${lvl}`, 'app')
  }

  push('which watchlist name looks strongest technically?', 'mkt')

  // journal recall — only when there is a journal to recall from
  const lastTagged = [...(journal || [])].reverse().find((e) => e.symbols?.length)
  if (lastTagged) push(`what did my journal say about ${lastTagged.symbols[0]}?`, 'app')

  push('open the heatmap', 'app')
  for (const s of SUGGESTIONS) {
    if (acts.length >= 12) break
    push(s.t, s.k)
  }
  return acts.slice(0, 12)
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


/**
 * The launchpad — chat's home screen, and a place you can navigate back to.
 * One instrument panel (three cells under a single frame, hairline-divided)
 * rather than three floating cards: the terminal reads its state off single
 * frames everywhere else, and the composer sits inside the pad so the empty
 * page has a centre of gravity instead of a void under it.
 */
function Launchpad({ onWire, watchlist, quotes, earnDays, events, onPick,
                     threadLen, onResume, composer, memN, journalN, journal,
                     onOpenMem, onOpenJournal }) {
  const book = hasLiveBook()
  const nextEvent = events[0] || null
  const acts = dynamicActions({ watchlist, quotes, earnDays, nextEvent, book, journal })
  const movers = watchlist
    .map((s) => ({ s, pct: quotes[s]?.quote?.pct }))
    .filter((x) => x.pct != null)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 4)
  const nextEarn = watchlist
    .filter((s) => earnDays[s] != null && earnDays[s] >= 0)
    .sort((a, b) => earnDays[a] - earnDays[b])
    .slice(0, 4)
  const pulse = pulseStats(watchlist.map((s) => quotes[s]?.quote).filter(Boolean))

  // the real book, when a wire is connected — TTL-cached in chatContext
  const [bk, setBk] = useState(null)
  useEffect(() => {
    if (book) fetchBookJson().then(setBk).catch(() => {})
  }, [book])
  const topPos = (bk?.positions || [])
    .filter((p) => p.weight_pct != null)
    .sort((a, b) => b.weight_pct - a.weight_pct)
    .slice(0, 3)

  const cell = "px-3 py-2 min-w-0"
  const eyebrow = "font-mono text-[9px] tracking-[0.16em] text-muted uppercase pb-1"
  const DOT = { mkt: 'bg-accent', book: 'bg-up', app: 'bg-accent-2' }

  return (
    <div class="w-full max-w-3xl px-1 py-3 flex flex-col gap-3">
      <div class="flex items-start gap-3">
        <div class="min-w-0">
          <h2 class="font-anth text-[20px] leading-[1.25] font-semibold text-ink">
            {onWire
              ? 'Ask about a ticker, a sector, or the book.'
              : tt('chat.empty')}
          </h2>
          <div class="text-muted text-[11px] font-anth pt-1">
            live quotes · technicals · calendar · watchlist · alerts · memory · journal · navigation
          </div>
        </div>
        {threadLen > 0 && (
          <button
            type="button"
            onClick={onResume}
            class="ml-auto shrink-0 flex items-center gap-1.5 font-mono text-[10px] text-muted border border-line rounded-lg px-2.5 py-1.5 hover:border-accent/60 hover:text-ink transition-colors"
            title="the thread is still here — this only parks it"
          >
            resume thread <span class="text-accent">{threadLen}</span>
          </button>
        )}
      </div>

      {/* right now — one instrument, rebuilt from live data on every poll */}
      <div class="bg-surface-1 border border-line rounded-xl divide-y divide-line">
        <div class="grid grid-cols-1 sm:grid-cols-3 divide-y divide-line sm:divide-y-0 sm:divide-x">
          <div class={cell}>
            <div class={eyebrow}>moving now</div>
            {movers.length ? movers.map(({ s, pct }) => (
              <a key={s} href={`#/research/${s.toLowerCase()}`} class="flex items-baseline justify-between font-mono text-[11.5px] py-px hover:no-underline">
                <span class="text-ink font-[650] font-tick">{s}</span>
                <span class={pct >= 0 ? 'text-up' : 'text-down'}>{fmtPct(pct)}</span>
              </a>
            )) : <div class="font-mono text-[11px] text-muted py-1">loading…</div>}
          </div>
          <div class={cell}>
            <div class={eyebrow}>next earnings</div>
            {nextEarn.length ? nextEarn.map((s) => (
              <a key={s} href={`#/research/${s.toLowerCase()}/earnings`} class="flex items-baseline justify-between font-mono text-[11.5px] py-px hover:no-underline">
                <span class="text-ink font-[650] font-tick">{s}</span>
                <span class={earnDays[s] === 0 ? 'text-imminent font-bold' : earnDays[s] <= 7 ? 'text-down' : 'text-accent'}>
                  {earnDays[s] === 0 ? 'today' : `${earnDays[s]}d`}
                </span>
              </a>
            )) : <div class="font-mono text-[11px] text-muted py-1">loading…</div>}
          </div>
          <div class={cell}>
            <div class={eyebrow}>on the calendar</div>
            {events.length ? events.slice(0, 4).map((ev) => (
              <a key={ev.label + ev.days} href="#/markets/calendar" class="flex items-baseline justify-between gap-2 font-mono text-[11.5px] py-px hover:no-underline">
                <span class="text-ink truncate">{ev.rawLabel || ev.label}</span>
                <span class={ev.days <= 1 ? 'text-imminent font-bold' : ev.days <= 7 ? 'text-down' : 'text-accent'}>
                  {ev.days === 0 ? 'today' : `${ev.days}d`}
                </span>
              </a>
            )) : <div class="font-mono text-[11px] text-muted py-1">clear runway</div>}
          </div>
        </div>
        <div class={`grid grid-cols-1 divide-y divide-line sm:divide-y-0 sm:divide-x ${book ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          <div class={cell}>
            <div class={eyebrow}>pulse</div>
            {pulse ? (
              <div class="font-mono text-[11.5px] leading-[1.55]">
                <div class="flex justify-between"><span class="text-muted">A/D</span>
                  <span><span class="text-up">{pulse.adv}</span><span class="text-muted"> / </span><span class="text-down">{pulse.dec}</span></span></div>
                <div class="flex justify-between"><span class="text-muted">avg</span>
                  <span class={pulse.avg >= 0 ? 'text-up' : 'text-down'}>{fmtPct(pulse.avg)}</span></div>
                <div class="flex justify-between"><span class="text-muted">ext A/D</span>
                  <span><span class="text-up">{pulse.extAdv}</span><span class="text-muted"> / </span><span class="text-down">{pulse.extDec}</span></span></div>
                <div class="flex justify-between"><span class="text-muted">down &gt;3%</span>
                  <span class={pulse.stress ? 'text-down font-bold' : 'text-ink-2'}>{pulse.stress}</span></div>
              </div>
            ) : <div class="font-mono text-[11px] text-muted py-1">loading…</div>}
          </div>
          {book && (
            <div class={cell}>
              <div class={eyebrow}>the book</div>
              {topPos.length ? (
                <div class="font-mono text-[11.5px] leading-[1.55]">
                  {topPos.map((p) => (
                    <div key={p.symbol} class="flex justify-between">
                      <span class="text-ink font-[650] font-tick">{p.symbol}</span>
                      <span><span class="text-ink-2">{Math.round(p.weight_pct)}%</span>{' '}
                        <span class={p.unrealized_pnl >= 0 ? 'text-up' : 'text-down'}>{p.unrealized_pnl >= 0 ? '▲' : '▼'}</span></span>
                    </div>
                  ))}
                  {bk?.margin?.cushion_pct != null && (
                    <div class="flex justify-between pt-px border-t border-line-2/60 mt-px">
                      <span class="text-muted">cushion</span>
                      <span class={bk.margin.cushion_pct < 8 ? 'text-down' : 'text-ink-2'}>{bk.margin.cushion_pct.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              ) : <div class="font-mono text-[11px] text-muted py-1">reading the wire…</div>}
            </div>
          )}
          <div class={cell}>
            <div class={eyebrow}>context it carries</div>
            <div class="font-mono text-[11.5px] leading-[1.55]">
              <button type="button" onClick={onOpenMem} class="flex justify-between w-full hover:text-ink">
                <span class="text-muted">memories</span><span class="text-ink-2">{memN}</span>
              </button>
              <button type="button" onClick={onOpenJournal} class="flex justify-between w-full hover:text-ink">
                <span class="text-muted">journal</span><span class="text-ink-2">{journalN}</span>
              </button>
              <div class="flex justify-between"><span class="text-muted">watching</span><span class="text-ink-2">{watchlist.length}</span></div>
              <div class="flex justify-between"><span class="text-muted">book</span>
                <span class={book ? 'text-up' : 'text-muted'}>{book ? 'live' : 'demo'}</span></div>
            </div>
          </div>
        </div>
      </div>

      {composer}

      <div>
        <div class="flex items-baseline gap-3 pb-1.5">
          <span class="font-mono text-[9px] tracking-[0.16em] text-muted uppercase">start here</span>
          <span class="font-mono text-[9px] text-muted flex items-center gap-2.5">
            <span class="flex items-center gap-1"><span class="w-1 h-1 rounded-full bg-accent" />markets</span>
            {book && <span class="flex items-center gap-1"><span class="w-1 h-1 rounded-full bg-up" />book</span>}
            <span class="flex items-center gap-1"><span class="w-1 h-1 rounded-full bg-accent-2" />app</span>
          </span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          {acts.map((sug) => (
            <button
              key={sug.t}
              type="button"
              onClick={() => onPick(sug.t)}
              class="flex items-center gap-1.5 font-anth text-[12px] text-ink-2 border border-line rounded-full pl-2.5 pr-3 py-1 hover:border-accent/60 hover:text-ink hover:bg-accent-soft transition-colors"
            >
              <span class={`w-1 h-1 rounded-full shrink-0 ${DOT[sug.k] || 'bg-muted'}`} />
              {sug.t}
            </button>
          ))}
        </div>
      </div>
    </div>
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
  // The launchpad is a place you can go back to, not just the zero state:
  // pressing AI Chat in the nav returns here with the thread still parked.
  const [atHome, setAtHome] = useState(takeChatHomePending)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const historyRef = useRef(history)
  const queuedRef = useRef([])
  const busyRef = useRef(false)

  const splash = history.length === 0 || atHome

  // Launchpad fuel — live quotes, earnings proximity, next calendar event.
  // useQuotes polls, so the pad's suggestions refresh on their own.
  const watchlist = useWatchlist()
  const quotes = useQuotes(splash ? watchlist : [])
  const earnDays = useEarningsDays(splash ? watchlist : [])
  const upcoming = mergedEvents(ECON_EVENTS, loadCatalysts(),
    new Date().toISOString().slice(0, 10), 60).slice(0, 4)

  // Warm case: already on the chat page when AI Chat is pressed again.
  useEffect(() => {
    const home = () => { setAtHome(true); setDrawer(null) }
    window.addEventListener(CHAT_HOME_EVENT, home)
    return () => window.removeEventListener(CHAT_HOME_EVENT, home)
  }, [])

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
    setAtHome(false)   // asking a question is how you leave the launchpad
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

  const composer = (
      <form onSubmit={send} class="max-w-3xl w-full pt-2">
        {/* items-center keeps a one-line placeholder vertically centered
            against the 32px send button; the textarea grows downward from
            there (Jeff 2026-08-04: "placeholder isn't centered"). */}
        {/* surface-2 + line-2, one tier brighter than the launchpad panel —
            the composer was sinking into the page (Jeff 2026-08-04) */}
        <div class="flex items-center gap-2 bg-surface-2 border border-line-2 rounded-xl px-3 py-1.5 focus-within:border-accent/70 focus-within:shadow-[0_0_0_1px_rgba(245,158,11,0.18)] transition-all">
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
            class="shrink-0 w-8 h-8 grid place-items-center rounded-md bg-white text-black disabled:bg-surface-3 disabled:text-muted transition-colors"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          </button>
        </div>
        <div class="flex items-center gap-3 px-2 pt-1 font-mono text-[9.5px] text-muted">
          <span><kbd class="text-ink-2">⏎</kbd> send</span>
          <span><kbd class="text-ink-2">⇧⏎</kbd> newline</span>
          <span class="hidden sm:inline">⏎ while busy queues a follow-up</span>
          <span class="hidden md:inline">ask it to remember — memories persist</span>
          {queued.length > 0 && <span class="text-accent">{queued.length} queued</span>}
          {!onWire && <SpendMeter spend={spend} />}
        </div>
      </form>
  )

  return (
    <div class="flex-1 flex flex-col p-3 min-h-0 min-w-0 select-text">
      {/* One control height across the row — the title, the wire pill, the
          model housing, the effort pills and the icon rail all centre on the
          same axis (Jeff 2026-08-04: "aren't vertically aligned"). */}
      <div class="flex items-center gap-2 px-1 pb-2 mb-1 border-b border-line flex-wrap">
        <h1 class="font-bold text-lg leading-none text-ink" style="font-family: 'Plus Jakarta Sans', sans-serif">{tl('AI Chat')}</h1>
        <span class={`w-1.5 h-1.5 rounded-full mr-1 ${onWire ? 'bg-up' : 'bg-accent'}`}
              title={onWire ? 'online — private wire' : 'online — public proxy'} />
        <label class="h-7 flex items-center gap-1.5 bg-surface-2 border border-line rounded-lg pl-2.5 pr-1 focus-within:border-accent/70 hover:border-line-2 transition-colors">
          <span class="font-mono text-[9px] uppercase tracking-wider text-muted">model</span>
          <select
            value={model}
            onChange={(e) => chooseModel(e.currentTarget.value)}
            class="bg-transparent font-anth text-[12px] text-ink outline-none pr-1 cursor-pointer"
          >
            {(models.length ? models : [{ key: model, label: model }]).map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>
        {effortLevels.length > 0 && (
          <div class="h-7 flex items-center gap-0.5 bg-surface-2 border border-line rounded-lg px-0.5" title="thinking effort">
            {effortLevels.map((lv) => (
              <button
                key={lv}
                onClick={() => {
                  setEffort(lv)
                  localStorage.setItem('chat_effort', lv)
                }}
                class={`px-2 h-[22px] font-anth text-[11px] rounded-md transition-colors ${
                  effort === lv
                    ? 'bg-accent text-black font-bold'
                    : 'text-muted hover:text-ink hover:bg-surface-3'
                }`}
              >
                {lv}
              </button>
            ))}
          </div>
        )}
        {onWire && selectedModel?.fixed_effort && (
          <span class="h-7 inline-flex items-center font-mono text-[10px] text-muted border border-line rounded-lg px-2"
                title="this subscription model has a fixed thinking tier">
            {selectedModel.fixed_effort}
          </span>
        )}
        <div class="ml-auto h-7 flex items-center gap-0.5 border border-line rounded-lg px-0.5">
          <button
            onClick={() => { setMemories(loadMemories()); setDrawer(drawer === 'mem' ? null : 'mem') }}
            class={`relative w-6 h-6 grid place-items-center rounded-md ${drawer === 'mem' ? 'text-accent bg-accent-soft' : 'text-muted hover:text-ink hover:bg-surface-2'}`}
            title="persistent memories — the assistant carries these into every conversation"
            aria-label="memories"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 21V8.5M12 8.5a3.4 3.4 0 0 1 3.2-4.5 3.4 3.4 0 0 1 3.3 2.6A3.3 3.3 0 0 1 21 9.9a3.3 3.3 0 0 1-1.4 5.6A3.4 3.4 0 0 1 15 19.4c-1.3 0-2.4-.7-3-1.7-.6 1-1.7 1.7-3 1.7a3.4 3.4 0 0 1-3.6-3.9A3.3 3.3 0 0 1 4 9.9a3.3 3.3 0 0 1 2.5-3.3A3.4 3.4 0 0 1 9.8 4 3.4 3.4 0 0 1 12 8.5z"/>
              <path d="M8.5 9.5c.8.4 1.6.4 2.3 0M13.2 12.5c.8.4 1.6.4 2.3 0M8 14.5c.7.4 1.4.4 2 0"/>
            </svg>
            {memories.length > 0 && <span class="absolute -top-1 -right-1 min-w-[13px] h-[13px] px-0.5 grid place-items-center rounded-full bg-surface-3 border border-line-2 font-mono text-[7.5px] text-ink-2 leading-none">{memories.length}</span>}
          </button>
          <button
            onClick={() => { setJournal(loadJournal()); setDrawer(drawer === 'journal' ? null : 'journal') }}
            class={`relative w-6 h-6 grid place-items-center rounded-md ${drawer === 'journal' ? 'text-accent bg-accent-soft' : 'text-muted hover:text-ink hover:bg-surface-2'}`}
            title="trade journal — your own decisions and rationale, searchable"
            aria-label="trade journal"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
              <path d="M7 2v20"/>
              <path d="M14 2v7l2-1.6L18 9V2"/>
            </svg>
            {journal.length > 0 && <span class="absolute -top-1 -right-1 min-w-[13px] h-[13px] px-0.5 grid place-items-center rounded-full bg-surface-3 border border-line-2 font-mono text-[7.5px] text-ink-2 leading-none">{journal.length}</span>}
          </button>
          {history.length > 0 && (
            <button onClick={() => exportChat(history)} class="w-6 h-6 grid place-items-center rounded-md text-muted hover:text-ink hover:bg-surface-2"
              title="download the transcript as markdown">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"/></svg>
            </button>
          )}
          {history.length > 0 && (
            <button onClick={clear} class="w-6 h-6 grid place-items-center rounded-md text-muted hover:text-down hover:bg-surface-2" title={tl('clear')}>
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

      {/* safe centering: plain justify-center clips the top of the launchpad
          when it outgrows the viewport (phone), because overflow only scrolls
          toward the end edge. */}
      {splash ? (
        <div class="flex-1 min-h-0 overflow-y-auto flex flex-col [justify-content:safe_center]">
          <Launchpad
            onWire={onWire}
            watchlist={watchlist}
            quotes={quotes}
            earnDays={earnDays}
            events={upcoming}
            threadLen={history.length}
            onResume={() => setAtHome(false)}
            onPick={(text) => { setInput(text); inputRef.current?.focus() }}
            composer={composer}
            memN={memories.length}
            journalN={journal.length}
            journal={journal}
            onOpenMem={() => { setMemories(loadMemories()); setDrawer('mem') }}
            onOpenJournal={() => { setJournal(loadJournal()); setDrawer('journal') }}
          />
        </div>
      ) : (
        <>
          <div ref={scrollRef} class="flex-1 overflow-y-auto min-h-0 max-w-3xl w-full flex flex-col gap-2 px-1">
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
          {composer}
        </>
      )}
    </div>
  )
}
