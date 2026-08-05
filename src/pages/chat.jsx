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
import { CHATSTORE_SYNC_EVENT, chatstoreAvailable, syncNotes } from '../lib/chatstore.js'
import {
  fetchThreadList, loadActiveHistory, migrateLegacy, openThread,
  removeThread, saveActiveHistory, startNewThread, currentThreadId,
} from '../lib/threads.js'
import { wireUrl } from '../lib/wire.js'

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
    'answering from memory; call several in one round when that is faster. ' +
    'Answer like a sharp desk colleague: lead with the direct call, then the ' +
    'numbers behind it. Always quote the actual figures your tools returned ' +
    '(price, %, levels, dates) — never vague direction words where a number ' +
    'exists. A typical market answer covers the print, the driver, the levels ' +
    'that matter, and what to watch next. Tight paragraphs or dash bullets. ' +
    'No filler, no disclaimers, no restating the question. Depth beats ' +
    'brevity — a thin answer is worse than a long one. '
  const book = hasLiveBook()
    ? 'A LIVE PORTFOLIO block in your context is the user\'s real book — treat ' +
      'position and margin questions as real. '
    : 'You have no access to any personal, account, or portfolio data — the ' +
      'portfolio section is a clearly-labeled synthetic demo. '
  return common + book
}

const MODEL_WINDOW = 48   // what a single turn actually sends to the model

const loadHistory = loadActiveHistory
const saveHistory = saveActiveHistory

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
        <button onClick={() => setEditing(true)} title={tl('edit')}
          class="opacity-0 group-hover:opacity-100 text-muted hover:text-accent shrink-0">✎</button>
      )}
      <button onClick={onDelete} title={tl('delete')}
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

function durationLabel(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000))
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m ${sec % 60}s`
}

function traceArgs(args) {
  if (!args || typeof args !== 'object' || !Object.keys(args).length) return ''
  const raw = Object.entries(args)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ')
  return raw.length > 320 ? `${raw.slice(0, 319)}…` : raw
}

/** One complete provider/tool timeline. Live traces stay open; completed traces
 * fold into an Operator-style "Worked for" row without discarding the steps. */
function ActivityTrace({ steps, busy = false, startedAt }) {
  const [open, setOpen] = useState(busy)
  const [, tick] = useState(0)
  useEffect(() => { if (busy) setOpen(true) }, [busy])
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [busy])
  if (!steps?.length) return null

  const now = Date.now()
  const first = startedAt || steps[0]?.startedAt || now
  const last = busy ? now : Math.max(...steps.map((step) => step.endedAt || step.startedAt || first))
  const running = [...steps].reverse().find((step) => step.status === 'running')
  const failed = steps.some((step) => step.status === 'error')
  const title = busy ? (running?.verb || running?.label || 'Working') : failed ? 'Stopped after' : 'Worked for'
  const elapsed = durationLabel(last - first)

  return (
    <div class={`chat-trace w-full max-w-[92%] self-start text-muted ${busy ? 'is-live' : ''}`}>
      <button type="button" class="chat-trace-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span class={`chat-trace-mark ${busy ? 'is-running' : failed ? 'is-error' : 'is-done'}`} aria-hidden="true">
          {busy ? (
            <svg viewBox="0 0 20 20"><path d="M4 10a6 6 0 0 1 10.2-4.2M16 10a6 6 0 0 1-10.2 4.2" /></svg>
          ) : null}
        </span>
        <span class="chat-trace-title">{title}{busy ? '' : ` ${elapsed}`}</span>
        {busy && <span class="font-mono text-[9px] tabular-nums text-muted">{elapsed}</span>}
        <span class="chat-trace-count">{steps.length} {steps.length === 1 ? 'step' : 'steps'}</span>
        <span class={`chat-trace-caret ${open ? 'is-open' : ''}`} />
      </button>
      <div class={`chat-trace-reveal ${open ? 'is-open' : ''}`}>
        <div>
          <div class="chat-trace-body">
            {steps.map((step) => {
              const end = step.endedAt || now
              const stepElapsed = step.startedAt ? durationLabel(end - step.startedAt) : ''
              return (
                <div key={step.key} class={`chat-trace-step is-${step.status || 'done'}`}>
                  <span class="chat-trace-node" />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-2">
                      <span class="chat-trace-label">{step.label}</span>
                      {stepElapsed && <span class="chat-trace-time">{stepElapsed}</span>}
                    </div>
                    {step.detail && <div class={`chat-trace-detail ${step.kind === 'tool' ? 'is-tool' : ''}`}>{step.detail}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
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
              ? tt('chat.wire_empty')
              : tt('chat.empty')}
          </h2>
          <div class="text-muted text-[11px] font-anth pt-1">
            {tt('chat.context_line')}
          </div>
        </div>
        {threadLen > 0 && (
          <button
            type="button"
            onClick={onResume}
            class="ml-auto shrink-0 flex items-center gap-1.5 font-mono text-[10px] text-muted border border-line rounded-lg px-2.5 py-1.5 hover:border-accent/60 hover:text-ink transition-colors"
            title={tl('park thread')}
          >
            {tl('resume thread')} <span class="text-accent">{threadLen}</span>
          </button>
        )}
      </div>

      {/* right now — one instrument, rebuilt from live data on every poll */}
      <div class="bg-surface-1 border border-line rounded-xl divide-y divide-line">
        <div class="grid grid-cols-1 sm:grid-cols-3 divide-y divide-line sm:divide-y-0 sm:divide-x">
          <div class={cell}>
            <div class={eyebrow}>{tl('moving now')}</div>
            {movers.length ? movers.map(({ s, pct }) => (
              <a key={s} href={`#/research/${s.toLowerCase()}`} class="flex items-baseline justify-between font-mono text-[11.5px] py-px hover:no-underline">
                <span class="text-ink font-[650] font-tick">{s}</span>
                <span class={pct >= 0 ? 'text-up' : 'text-down'}>{fmtPct(pct)}</span>
              </a>
            )) : <div class="font-mono text-[11px] text-muted py-1">{tl('loading…')}</div>}
          </div>
          <div class={cell}>
            <div class={eyebrow}>{tl('next earnings')}</div>
            {nextEarn.length ? nextEarn.map((s) => (
              <a key={s} href={`#/research/${s.toLowerCase()}/earnings`} class="flex items-baseline justify-between font-mono text-[11.5px] py-px hover:no-underline">
                <span class="text-ink font-[650] font-tick">{s}</span>
                <span class={earnDays[s] === 0 ? 'text-imminent font-bold' : earnDays[s] <= 7 ? 'text-down' : 'text-accent'}>
                  {earnDays[s] === 0 ? tl('today') : `${earnDays[s]}d`}
                </span>
              </a>
            )) : <div class="font-mono text-[11px] text-muted py-1">{tl('loading…')}</div>}
          </div>
          <div class={cell}>
            <div class={eyebrow}>{tl('on the calendar')}</div>
            {events.length ? events.slice(0, 4).map((ev) => (
              <a key={ev.label + ev.days} href="#/markets/calendar" class="flex items-baseline justify-between gap-2 font-mono text-[11.5px] py-px hover:no-underline">
                <span class="text-ink truncate">{ev.rawLabel || ev.label}</span>
                <span class={ev.days <= 1 ? 'text-imminent font-bold' : ev.days <= 7 ? 'text-down' : 'text-accent'}>
                  {ev.days === 0 ? tl('today') : `${ev.days}d`}
                </span>
              </a>
            )) : <div class="font-mono text-[11px] text-muted py-1">{tl('clear runway')}</div>}
          </div>
        </div>
        <div class={`grid grid-cols-1 divide-y divide-line sm:divide-y-0 sm:divide-x ${book ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          <div class={cell}>
            <div class={eyebrow}>{tl('Pulse')}</div>
            {pulse ? (
              <div class="font-mono text-[11.5px] leading-[1.55]">
                <div class="flex justify-between"><span class="text-muted">{tl('A/D')}</span>
                  <span><span class="text-up">{pulse.adv}</span><span class="text-muted"> / </span><span class="text-down">{pulse.dec}</span></span></div>
                <div class="flex justify-between"><span class="text-muted">{tl('avg')}</span>
                  <span class={pulse.avg >= 0 ? 'text-up' : 'text-down'}>{fmtPct(pulse.avg)}</span></div>
                <div class="flex justify-between"><span class="text-muted">{tl('ext A/D')}</span>
                  <span><span class="text-up">{pulse.extAdv}</span><span class="text-muted"> / </span><span class="text-down">{pulse.extDec}</span></span></div>
                <div class="flex justify-between"><span class="text-muted">{tl('down >3%')}</span>
                  <span class={pulse.stress ? 'text-down font-bold' : 'text-ink-2'}>{pulse.stress}</span></div>
              </div>
            ) : <div class="font-mono text-[11px] text-muted py-1">{tl('loading…')}</div>}
          </div>
          {book && (
            <div class={cell}>
              <div class={eyebrow}>{tl('the book')}</div>
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
                      <span class="text-muted">{tl('Cushion')}</span>
                      <span class={bk.margin.cushion_pct < 8 ? 'text-down' : 'text-ink-2'}>{bk.margin.cushion_pct.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              ) : <div class="font-mono text-[11px] text-muted py-1">{tl('reading the wire…')}</div>}
            </div>
          )}
          <div class={cell}>
            <div class={eyebrow}>{tl('context it carries')}</div>
            <div class="font-mono text-[11.5px] leading-[1.55]">
              <button type="button" onClick={onOpenMem} class="flex justify-between w-full hover:text-ink">
                <span class="text-muted">{tl('memories')}</span><span class="text-ink-2">{memN}</span>
              </button>
              <button type="button" onClick={onOpenJournal} class="flex justify-between w-full hover:text-ink">
                <span class="text-muted">{tl('journal')}</span><span class="text-ink-2">{journalN}</span>
              </button>
              <div class="flex justify-between"><span class="text-muted">{tl('watching')}</span><span class="text-ink-2">{watchlist.length}</span></div>
              <div class="flex justify-between"><span class="text-muted">{tl('book')}</span>
                <span class={book ? 'text-up' : 'text-muted'}>{tl(book ? 'live' : 'demo')}</span></div>
            </div>
          </div>
        </div>
      </div>

      {composer}

      <div>
        <div class="flex items-baseline gap-3 pb-1.5">
          <span class="font-mono text-[9px] tracking-[0.16em] text-muted uppercase">{tl('start here')}</span>
          <span class="font-mono text-[9px] text-muted flex items-center gap-2.5">
            <span class="flex items-center gap-1"><span class="w-1 h-1 rounded-full bg-accent" />{tl('markets')}</span>
            {book && <span class="flex items-center gap-1"><span class="w-1 h-1 rounded-full bg-up" />{tl('book')}</span>}
            <span class="flex items-center gap-1"><span class="w-1 h-1 rounded-full bg-accent-2" />{tl('app')}</span>
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
  const [liveAnswer, setLiveAnswer] = useState('')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)          // memory-tag confirmations
  const [drawer, setDrawer] = useState(null)          // 'sessions' | 'mem' | 'journal' | null
  const [memories, setMemories] = useState(loadMemories)
  const [journal, setJournal] = useState(loadJournal)
  const [jrFilter, setJrFilter] = useState('')
  // The launchpad is a place you can go back to, not just the zero state:
  // pressing AI Chat in the nav returns here with the thread still parked.
  const [atHome, setAtHome] = useState(takeChatHomePending)
  const [threads, setThreads] = useState([])
  const scrollRef = useRef(null)
  const stickRef = useRef(true)      // autoscroll only while parked at the tail
  const abortRef = useRef(null)
  const inputRef = useRef(null)
  const historyRef = useRef(history)
  const activityRef = useRef([])
  const turnStartedRef = useRef(0)
  const queuedRef = useRef([])
  const busyRef = useRef(false)

  const splash = history.length === 0 || atHome

  // Launchpad fuel — live quotes, earnings proximity, next calendar event.
  // useQuotes polls, so the pad's suggestions refresh on their own.
  const watchlist = useWatchlist()
  // the right rail is live even mid-thread, so the pad data polls always
  const quotes = useQuotes(watchlist)
  const earnDays = useEarningsDays(watchlist)
  const upcoming = mergedEvents(ECON_EVENTS, loadCatalysts(),
    new Date().toISOString().slice(0, 10), 60).slice(0, 4)

  // Boot: pull the shared brain from the wire (server wins), adopt a legacy
  // local conversation as thread #1, and list the threads for the rail.
  const refreshThreads = () => fetchThreadList().then(setThreads).catch(() => {})
  useEffect(() => {
    const onSync = () => { setMemories(loadMemories()); setJournal(loadJournal()) }
    if (chatstoreAvailable()) {
      window.addEventListener(CHATSTORE_SYNC_EVENT, onSync)
      syncNotes().catch(() => {})
    }
    migrateLegacy().then(refreshThreads).catch(() => {})
    return () => window.removeEventListener(CHATSTORE_SYNC_EVENT, onSync)
  }, [])

  const newThread = async () => {
    if (busyRef.current) return
    await startNewThread(historyRef.current)
    historyRef.current = []
    activityRef.current = []
    setHistory([])
    setActivity([])
    setLiveAnswer('')
    setAtHome(true)
    await refreshThreads()
  }

  const switchThread = async (id) => {
    if (busyRef.current || id === currentThreadId()) {
      setDrawer(null)
      setAtHome(false)
      return
    }
    try {
      const messages = await openThread(id, historyRef.current)
      historyRef.current = messages
      setHistory(messages)
      activityRef.current = []
      setActivity([])
      setLiveAnswer('')
      setAtHome(false)
      setDrawer(null)
      await refreshThreads()
    } catch { /* thread gone — list will refresh */ }
  }

  const deleteSession = async (id) => {
    if (busyRef.current) return
    const wasActive = id === currentThreadId()
    await removeThread(id)
    if (wasActive) {
      historyRef.current = []
      activityRef.current = []
      setHistory([])
      setActivity([])
      setLiveAnswer('')
      setAtHome(true)
    }
    await refreshThreads()
  }

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

  // follow the stream only when the user is already at the tail — scrolling
  // up to reread mustn't get yanked back down on every delta
  useEffect(() => {
    if (stickRef.current) scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [history])

  const clearComposer = () => {
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  const replaceHistory = (next, persist = false) => {
    historyRef.current = next
    setHistory(next)
    if (persist) {
      saveHistory(next)
      if (chatstoreAvailable()) setTimeout(refreshThreads, 1500)
    }
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

  const replaceActivity = (next) => {
    activityRef.current = next
    setActivity(next)
  }

  const updateActivity = (fn) => replaceActivity(fn(activityRef.current))

  const runTurn = async ({ text, model: runModel, effort: runEffort, ts }) => {
    setError(null)
    setNotice(null)
    setLiveAnswer('')
    turnStartedRef.current = Date.now()
    replaceActivity([{
      key: 'context', kind: 'context', label: 'Reading live market context',
      verb: 'Reading context', status: 'running', startedAt: turnStartedRef.current,
    }])

    const base = [...historyRef.current, {
      role: 'user', content: text, ts: ts || Date.now(), model: runModel,
    }]
    let added = []
    let live = ''
    const paint = () => {
      // a tool-call round streams raw {"tool": …} JSON — that renders as a
      // trace step once parsed, so don't flash the JSON as prose meanwhile.
      // Keep the live answer outside history so the trace always leads into it.
      const final = added.at(-1)
      const hasFinal = final?.role === 'assistant' && final.content && !final.toolCalls?.length
      const stable = hasFinal ? added.slice(0, -1) : added
      const candidate = live || (hasFinal ? final.content : '')
      const showLive = candidate && !candidate.trimStart().startsWith('{')
      setHistory([...base, ...stable])
      setLiveAnswer(showLive ? candidate : '')
    }
    paint()

    // CLI parity: volatile context (clock, memories, quotes, book, news for
    // mentioned symbols) rebuilt per turn and appended to the base prompt.
    let system = baseSystem()
    try {
      system += '\n\n' + await buildChatContext(text)
    } catch { /* context is best-effort — a bare prompt still answers */ }
    const runLabel = models.find((candidate) => candidate.key === runModel)?.label || runModel
    updateActivity((steps) => steps.map((step) => step.key === 'context'
      ? { ...step, label: 'Read live market context', status: 'done', endedAt: Date.now() }
      : step))

    const traceEvent = (event) => {
      const now = Date.now()
      if (event.type === 'model_start') {
        updateActivity((steps) => [...steps, {
          key: `model-${event.round}`, kind: 'model',
          label: `Thinking with ${runLabel}`, verb: `Thinking with ${runLabel}`,
          status: 'running', startedAt: now, detail: '',
        }])
        return
      }
      if (event.type === 'thinking') {
        updateActivity((steps) => steps.map((step) => step.key === `model-${event.round}`
          ? { ...step, detail: `${step.detail || ''}${event.delta}`.slice(-5000) }
          : step))
        return
      }
      if (event.type === 'model_done') {
        updateActivity((steps) => steps.map((step) => step.key === `model-${event.round}`
          ? {
              ...step,
              label: event.outcome === 'answer' ? `Composed with ${runLabel}` : `Reasoned with ${runLabel}`,
              status: 'done', endedAt: now,
            }
          : step))
        return
      }
      if (event.type === 'tool_start') {
        const call = { name: event.name, args: event.args }
        updateActivity((steps) => [...steps, {
          key: `tool-${event.id}`, kind: 'tool', label: toolLabel(call),
          verb: toolLabel(call), detail: traceArgs(event.args),
          status: 'running', startedAt: now,
        }])
        return
      }
      if (event.type === 'tool_done' || event.type === 'tool_error') {
        updateActivity((steps) => steps.map((step) => step.key === `tool-${event.id}`
          ? {
              ...step,
              status: event.type === 'tool_error' ? 'error' : 'done',
              detail: event.type === 'tool_error' ? event.error : step.detail,
              endedAt: now,
            }
          : step))
      }
    }

    const finish = () => {
      // Apply + strip [MEMORY…] tags from whatever the model said, stamp
      // the new entries, then persist.
      const notes = []
      const completedAt = Date.now()
      const trace = activityRef.current.map((step) => step.status === 'running'
        ? { ...step, status: 'done', endedAt: completedAt }
        : step)
      const stamped = added.map((m) => {
        if (m.role === 'assistant' && m.content) {
          const r = applyMemoryTags(m.content)
          notes.push(...r.notes)
          return { ...m, content: r.text, ts: Date.now(), model: runModel }
        }
        return m.role === 'assistant'
          ? { ...m, ts: Date.now(), model: runModel, traceHidden: !!m.toolCalls?.length }
          : m
      })
      let finalIndex = -1
      for (let i = stamped.length - 1; i >= 0; i--) {
        if (stamped[i].role === 'assistant' && stamped[i].content) { finalIndex = i; break }
      }
      if (finalIndex >= 0) {
        stamped[finalIndex] = {
          ...stamped[finalIndex], trace, traceStartedAt: turnStartedRef.current,
        }
      }
      if (notes.length) {
        setNotice(notes.join(' · '))
        setMemories(loadMemories())
      }
      const done = [...base, ...stamped]
      replaceHistory(done, true)
      setLiveAnswer('')
      if (finalIndex >= 0) replaceActivity([])
    }

    try {
      abortRef.current = new AbortController()
      await runAgentic({
        signal: abortRef.current.signal,
        model: runModel,
        effort: runEffort,
        system,
        messages: trimHistory(base, MODEL_WINDOW),
        takeFollowUps: drainFollowUps,
        onDelta: (d) => {
          live += d
          paint()
        },
        onTrace: traceEvent,
        onRound: (entries) => {
          added = entries
          live = ''
          paint()
        },
      })
      finish()
    } catch (err) {
      if (err?.name !== 'AbortError') setError(String(err.message || err))
      const stopped = err?.name === 'AbortError'
      updateActivity((steps) => steps.map((step) => step.status === 'running'
        ? {
            ...step, status: stopped ? 'done' : 'error', endedAt: Date.now(),
            label: stopped ? `Stopped ${step.label.toLowerCase()}` : step.label,
          }
        : step))
      if (live) added = [...added, { role: 'assistant', content: live }]
      finish()
    } finally {
      abortRef.current = null
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

  const stop = () => {
    queuedRef.current = []
    setQueued([])
    abortRef.current?.abort()
  }

  const [rec, setRec] = useState(null)
  const mic = async () => {
    if (rec) { rec.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      const chunks = []
      mr.ondataavailable = (e) => chunks.push(e.data)
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRec(null)
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' })
        setNotice('transcribing…')
        try {
          const resp = await fetch(`${wireUrl().replace(/\/$/, '')}/api/transcribe`, {
            method: 'POST', headers: { 'Content-Type': blob.type }, body: blob,
          })
          const out = await resp.json()
          if (!out.ok) throw new Error(out.error || 'transcribe failed')
          setNotice(null)
          setInput((cur) => (cur ? `${cur} ` : '') + out.text)
          inputRef.current?.focus()
        } catch (err) {
          setNotice(null)
          setError(`transcription failed: ${err.message || err}`)
        }
      }
      mr.start()
      setRec(mr)
    } catch {
      setError('microphone unavailable')
    }
  }

  const clear = () => {
    replaceHistory([], true)
    replaceActivity([])
    setLiveAnswer('')
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
      <form onSubmit={send} class="max-w-[46rem] w-full mx-auto pt-2">
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
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); return }
              if (e.key === 'ArrowUp' && !input) {
                const lastQ = [...historyRef.current].reverse().find((m) => m.role === 'user')
                if (lastQ) { e.preventDefault(); setInput(lastQ.content); autoGrow(e.currentTarget) }
              }
            }}
            placeholder={busy ? tt('chat.follow_up') : tt('chat.placeholder')}
            class="flex-1 bg-transparent resize-none outline-none text-[13.5px] leading-[21px] py-[5.5px] text-ink placeholder:text-muted max-h-40 font-anth"
          />
          {onWire && (
            <button
              type="button"
              onClick={mic}
              title={rec ? 'stop recording' : 'dictate (whisper on the wire)'}
              class={`shrink-0 w-8 h-8 grid place-items-center rounded-md border transition-colors ${
                rec ? 'border-down text-down animate-pulse' : 'border-line-2 text-muted hover:text-ink'}`}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
            </button>
          )}
          {busy && (
            <button
              type="button"
              onClick={stop}
              title={tl('stop generating')}
              class="shrink-0 w-8 h-8 grid place-items-center rounded-md border border-line-2 text-ink-2 hover:text-down hover:border-down/60 transition-colors"
            >
              <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
            </button>
          )}
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
          <span><kbd class="text-ink-2">⏎</kbd> {tl('send')}</span>
          <span><kbd class="text-ink-2">⇧⏎</kbd> {tl('newline')}</span>
          {queued.length > 0 && <span class="text-accent">{queued.length} queued</span>}
          {!onWire && <SpendMeter spend={spend} />}
        </div>
      </form>
  )

  const railMovers = watchlist
    .map((sym) => ({ sym, pct: quotes[sym]?.quote?.pct }))
    .filter((x) => x.pct != null)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 4)
  const railEarn = watchlist
    .filter((sym) => earnDays[sym] != null && earnDays[sym] >= 0)
    .sort((a, b) => earnDays[a] - earnDays[b])
    .slice(0, 3)

  return (
    <div class="flex-1 flex min-h-0 min-w-0">
    <div class="flex-1 flex flex-col p-3 min-h-0 min-w-0 select-text">
      {/* One control height across the row — the title, the wire pill, the
          model housing, the effort pills and the icon rail all centre on the
          same axis (Jeff 2026-08-04: "aren't vertically aligned"). */}
      <div class="max-w-[56rem] w-full mx-auto flex items-center gap-2 px-1 pb-2 mb-1 border-b border-line flex-wrap">
        <h1 class="font-bold text-lg leading-none text-ink" style="font-family: 'Plus Jakarta Sans', sans-serif">{tl('AI Chat')}</h1>
        <span class={`w-1.5 h-1.5 rounded-full mr-1 ${onWire ? 'bg-up' : 'bg-accent'}`}
              title={onWire ? 'online — private wire' : 'online — public proxy'} />
        <label class="h-7 flex items-center gap-1.5 bg-surface-2 border border-line rounded-lg pl-2.5 pr-1 focus-within:border-accent/70 hover:border-line-2 transition-colors">
          <span class="font-mono text-[9px] uppercase tracking-wider text-muted">{tl('model')}</span>
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
          <div class="h-7 flex items-center gap-0.5 bg-surface-2 border border-line rounded-lg px-0.5" title={tl('thinking effort')}>
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
                title={tl('fixed thinking tier')}>
            {selectedModel.fixed_effort}
          </span>
        )}
        <div class="ml-auto h-7 flex items-center gap-0.5 border border-line rounded-lg px-0.5">
          <button
            onClick={() => setDrawer(drawer === 'sessions' ? null : 'sessions')}
            class={`relative w-6 h-6 grid place-items-center rounded-md ${drawer === 'sessions' ? 'text-accent bg-accent-soft' : 'text-muted hover:text-ink hover:bg-surface-2'}`}
            title={tl('saved chat sessions')}
            aria-label={tl('chat sessions')}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 5h14v11H9l-4 3V5z"/><path d="M8 9h8M8 12h5"/>
            </svg>
            {threads.length > 0 && <span class="absolute -top-1 -right-1 min-w-[13px] h-[13px] px-0.5 grid place-items-center rounded-full bg-surface-3 border border-line-2 font-mono text-[7.5px] text-ink-2 leading-none">{threads.length}</span>}
          </button>
          <button
            onClick={() => { setMemories(loadMemories()); setDrawer(drawer === 'mem' ? null : 'mem') }}
            class={`relative w-6 h-6 grid place-items-center rounded-md ${drawer === 'mem' ? 'text-accent bg-accent-soft' : 'text-muted hover:text-ink hover:bg-surface-2'}`}
            title={tl('persistent memories')}
            aria-label={tl('memories')}
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
            title={tl('trade journal hint')}
            aria-label={tl('trade journal')}
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
              title={tl('download transcript')}>
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

      {drawer === 'sessions' && (
        <div class="fixed inset-0 z-50 bg-black/55 grid place-items-center p-4" onClick={() => setDrawer(null)}>
        <div class="max-w-xl w-full bg-surface-1 border border-line rounded-2xl px-4 py-3 max-h-[72vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div class="flex items-center gap-3 pb-3 border-b border-line">
            <div>
              <div class="font-anth text-[15px] font-semibold text-ink">{tl('Chat sessions')}</div>
              <div class="font-anth text-[11px] text-muted">{tl('Saved automatically. Open any session without replacing this one.')}</div>
            </div>
            <button type="button" disabled={busy} onClick={newThread}
              class="ml-auto font-anth text-[11px] text-accent border border-accent/40 rounded-md px-2 py-1 hover:bg-accent-soft disabled:opacity-40">
              {tl('+ new session')}
            </button>
            <button class="text-muted hover:text-ink" onClick={() => setDrawer(null)} aria-label={tl('close')}>✕</button>
          </div>
          <div class="py-2 flex flex-col gap-1">
            {threads.length === 0 && <div class="font-anth text-[12px] text-muted py-1">{tl('no saved sessions yet')}</div>}
            {threads.map((thread) => (
              <div key={thread.id} class={`group flex items-center gap-2 rounded-lg px-2 py-1.5 ${thread.id === currentThreadId() ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                <button type="button" disabled={busy} onClick={() => switchThread(thread.id)} class="flex-1 min-w-0 text-left disabled:opacity-50">
                  <span class={`block truncate font-anth text-[12px] ${thread.id === currentThreadId() ? 'text-accent' : 'text-ink-2'}`}>{thread.title || tl('untitled')}</span>
                  <span class="block font-mono text-[9px] text-muted">{tt('chat.session_messages', { n: thread.n })}</span>
                </button>
                <button type="button" disabled={busy} onClick={() => deleteSession(thread.id)} title={tl('delete session')}
                  class="opacity-0 group-hover:opacity-100 max-md:opacity-100 text-muted hover:text-down disabled:opacity-30 shrink-0 font-mono text-[11px]">✕</button>
              </div>
            ))}
          </div>
        </div>
        </div>
      )}

      {drawer === 'mem' && (
        <div class="fixed inset-0 z-50 bg-black/55 grid place-items-center p-4" onClick={() => setDrawer(null)}>
        <div class="max-w-xl w-full bg-surface-1 border border-line rounded-2xl px-4 py-3 max-h-[72vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div class="flex items-start gap-3 pb-3 border-b border-line">
            <div><div class="font-anth text-[15px] font-semibold text-ink">{tl('Memories')}</div>
              <div class="font-anth text-[11px] text-muted">{tl('Details the assistant should remember in future chats.')}</div></div>
            <button class="ml-auto text-muted hover:text-ink" onClick={() => setDrawer(null)} aria-label={tl('close')}>✕</button>
          </div>
          {memories.length === 0 && (
            <div class="font-anth text-[12px] text-muted py-1">{tl('nothing saved yet')}</div>
          )}
          {memories.map((m) => (
            <NoteRow key={m.id} id={m.id} text={m.text}
              meta={new Date(m.ts).toISOString().slice(0, 10)}
              onSave={(t) => { editMemory(m.id, t); setMemories(loadMemories()) }}
              onDelete={() => { removeMemory(m.id); setMemories(loadMemories()) }} />
          ))}
          <NoteAdd placeholder={`${tl('add a memory')}…`}
            onAdd={(t) => { addMemory(t); setMemories(loadMemories()) }} />
        </div>
        </div>
      )}

      {drawer === 'journal' && (
        <div class="fixed inset-0 z-50 bg-black/55 grid place-items-center p-4" onClick={() => setDrawer(null)}>
        <div class="max-w-xl w-full bg-surface-1 border border-line rounded-2xl px-4 py-3 max-h-[72vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div class="flex items-center gap-2 pb-3 border-b border-line">
            <div><div class="font-anth text-[15px] font-semibold text-ink">{tl('Trade journal')}</div>
              <div class="font-anth text-[11px] text-muted">{tl('Your decisions, rationale, and notes—not AI settings.')}</div></div>
            <input value={jrFilter} onInput={(e) => setJrFilter(e.currentTarget.value)}
              placeholder={`${tl('Search')}…`}
              class="ml-auto bg-surface-2 border border-line rounded-md px-2 py-0.5 font-mono text-[10px] text-ink outline-none focus:border-accent/60 w-32 placeholder:text-muted" />
            <button class="text-muted hover:text-ink" onClick={() => setDrawer(null)} aria-label={tl('close')}>✕</button>
          </div>
          {(jrFilter ? searchJournal(jrFilter) : journal).slice(-30).reverse().map((e) => (
            <NoteRow key={e.id} id={e.id} text={e.text}
              meta={`${new Date(e.ts).toISOString().slice(0, 10)}${e.symbols.length ? ` · ${e.symbols.join(' ')}` : ''}`}
              onDelete={() => { removeJournalEntry(e.id); setJournal(loadJournal()) }} />
          ))}
          {(jrFilter ? searchJournal(jrFilter) : journal).length === 0 && (
            <div class="font-anth text-[12px] text-muted py-1">
              {tl(jrFilter ? 'no matches' : 'nothing logged yet')}
            </div>
          )}
          <NoteAdd placeholder={`${tl('log a decision, a read, a why')}…`}
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
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget
              stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
            }}
            class="flex-1 overflow-y-auto min-h-0 max-w-[46rem] w-full mx-auto flex flex-col gap-3 px-2"
          >
        {history.map((m, i) => {
          if (m.role === 'tool') return null
          if (m.role === 'assistant' && m.toolCalls?.length) {
            if (m.traceHidden) return null
            return (
              <div key={i} class="chat-message-enter self-start flex flex-col gap-1 max-w-[92%]">
                {m.content && (
                  <div class="rounded-xl border px-3 py-2 font-anth text-[13px] leading-relaxed bg-surface-1 border-line text-ink">
                    <MdLite text={m.content} />
                  </div>
                )}
                <ToolChips calls={m.toolCalls} results={results} />
              </div>
            )
          }
          if (m.role === 'assistant') {
            if (!m.content) return null   // trace narrates the wait — no empty bubble
            return (
              <div key={i} class="w-full flex flex-col gap-1.5 chat-turn-enter">
                {m.trace?.length > 0 && (
                  <ActivityTrace steps={m.trace} startedAt={m.traceStartedAt} />
                )}
                <div class="group self-start max-w-[92%] relative"
                  title={m.ts ? `${m.model ? `${m.model} · ` : ''}${new Date(m.ts).toLocaleString()}` : undefined}>
                  <div class="chat-assistant-bubble rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-relaxed bg-surface-1 border-line text-ink font-anth">
                    <MdLite text={m.content} />
                  </div>
                  <div class="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(m.content)}
                        title={tl('copy')}
                        class="bg-surface-2 border border-line rounded-md px-1.5 py-0.5 font-mono text-[9px] text-muted hover:text-ink"
                      >
                        {tl('copy')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // CLI `journal save` parity: the exchange, not just the answer
                          const q = history[i - 1]?.role === 'user' ? history[i - 1].content : ''
                          const e = addJournalEntry(`${q ? `Q: ${q}\n\n` : ''}A: ${m.content}`)
                          setJournal(loadJournal())
                          setNotice(e ? tt('chat.exchange_saved', { id: e.id }) : null)
                        }}
                        title={tl('save exchange to journal')}
                        class="bg-surface-2 border border-line rounded-md px-1.5 py-0.5 font-mono text-[9px] text-muted hover:text-accent"
                      >
                        → {tl('journal')}
                      </button>
                    </div>
                </div>
              </div>
            )
          }
          return (
            <div key={i} class="chat-message-enter self-end rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap bg-accent-soft border border-accent/40 text-ink max-w-[85%] font-anth">
              {m.content}
            </div>
          )
        })}
        {activity.length > 0 && (
          <ActivityTrace steps={activity} busy={busy} startedAt={turnStartedRef.current} />
        )}
        {liveAnswer && (
          <div class="chat-assistant-bubble chat-message-live self-start max-w-[92%] rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-relaxed bg-surface-1 border-line text-ink font-anth">
            <MdLite text={liveAnswer} />
          </div>
        )}
        {queued.map((item, i) => (
          <div key={`${item.ts}-${i}`} class="self-end max-w-[85%] flex flex-col items-end gap-0.5">
            <div class="rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap bg-accent-soft/60 border border-accent/25 text-ink font-anth">
              {item.text}
            </div>
            <span class="font-mono text-[9px] text-muted pr-1">{tl('queued follow-up')}</span>
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

    {/* Keep useful context on the right without turning the chat into a CRUD
        dashboard. Memory and journal live behind the compact Library row. */}
    <aside class="hidden xl:flex w-[228px] shrink-0 flex-col gap-2 p-3 pl-0 overflow-y-auto min-h-0">
      <section class="chat-rail-section bg-surface-1 border border-line rounded-xl overflow-hidden shrink-0">
        <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
          <h2 class="font-anth font-bold text-[10px] tracking-wider text-accent uppercase">{tl('in view')}</h2>
        </header>
        <div class="px-2.5 py-1 font-mono text-[10.5px]">
          {railMovers.map(({ sym, pct }) => (
            <a key={sym} href={`#/research/${sym.toLowerCase()}`} class="flex justify-between py-px hover:no-underline">
              <span class="text-ink font-[650] font-tick">{sym}</span>
              <span class={pct >= 0 ? 'text-up' : 'text-down'}>{fmtPct(pct)}</span>
            </a>
          ))}
          {railEarn.length > 0 && <div class="border-t border-line/50 mt-1 pt-1">
            {railEarn.map((sym) => (
              <a key={sym} href={`#/research/${sym.toLowerCase()}/earnings`} class="flex justify-between py-px hover:no-underline">
                <span class="text-ink-2 font-tick">{sym}</span>
                <span class={earnDays[sym] === 0 ? 'text-imminent font-bold' : earnDays[sym] <= 7 ? 'text-down' : 'text-accent'}>
                  {earnDays[sym] === 0 ? 'ern today' : `ern ${earnDays[sym]}d`}
                </span>
              </a>
            ))}
          </div>}
        </div>
      </section>

      <section class="chat-rail-section bg-surface-1 border border-line rounded-xl overflow-hidden shrink-0">
          <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2 flex items-baseline gap-1.5">
            <h2 class="font-anth font-bold text-[10px] tracking-wider text-accent uppercase">{tl('sessions')}</h2>
            <span class="font-mono text-[9px] text-muted">{threads.length}</span>
            <button onClick={newThread} disabled={busy} title={tl('new session')}
              class="ml-auto font-mono text-[10px] text-muted hover:text-accent">{tl('+ new')}</button>
          </header>
          <div class="px-1 py-1 max-h-[34vh] overflow-y-auto">
            {threads.length === 0 && <div class="px-1.5 font-anth text-[11px] text-muted py-0.5">{tl('no saved threads')}</div>}
            {threads.map((t) => (
              <div key={t.id} class={`group flex items-baseline gap-1.5 px-1.5 py-0.5 rounded-md ${t.id === currentThreadId() ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                <button onClick={() => switchThread(t.id)} class="flex-1 min-w-0 text-left">
                  <span class={`block truncate font-anth text-[11px] ${t.id === currentThreadId() ? 'text-accent' : 'text-ink-2'}`}>{t.title || tl('untitled')}</span>
                </button>
                <span class="font-mono text-[8.5px] text-muted shrink-0">{t.n}</span>
                <button onClick={() => deleteSession(t.id)} disabled={busy}
                  title={tl('delete session')}
                  class="opacity-0 group-hover:opacity-100 text-muted hover:text-down shrink-0 font-mono text-[10px]">✕</button>
              </div>
            ))}
          </div>
      </section>

      <section class="chat-rail-section bg-surface-1 border border-line rounded-xl overflow-hidden shrink-0">
        <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
          <h2 class="font-anth font-bold text-[10px] tracking-wider text-accent uppercase">{tl('library')}</h2>
        </header>
        <div class="grid grid-cols-2 divide-x divide-line">
          <button type="button" onClick={() => { setMemories(loadMemories()); setDrawer('mem') }}
            class="group flex flex-col items-start gap-0.5 px-2.5 py-2 text-left hover:bg-surface-2">
            <span class="font-anth text-[11px] text-ink-2 group-hover:text-ink">{tl('memories')}</span>
            <span class="font-mono text-[15px] text-ink">{memories.length}</span>
          </button>
          <button type="button" onClick={() => { setJournal(loadJournal()); setDrawer('journal') }}
            class="group flex flex-col items-start gap-0.5 px-2.5 py-2 text-left hover:bg-surface-2">
            <span class="font-anth text-[11px] text-ink-2 group-hover:text-ink">{tl('journal')}</span>
            <span class="font-mono text-[15px] text-ink">{journal.length}</span>
          </button>
        </div>
      </section>
    </aside>
    </div>
  )
}
