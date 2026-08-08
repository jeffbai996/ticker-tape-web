import { useEffect, useRef, useState } from 'preact/hooks'
import { fetchChatModels, fetchSpend } from '../lib/chatClient.js'
import { runAgentic, trimHistory } from '../lib/agent.js'
import { toolLabel, toolRunLabel } from '../lib/tools.js'
import { BrandSpinner } from '../components/BrandSpinner.jsx'
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
    'brevity — a thin answer is worse than a long one. ' +
    // the model kept guessing "metered API" about its own plumbing — state
    // the actual wiring so infra questions get the truth (Jeff 2026-08-06)
    'Infrastructure, if asked: on this private build your calls route ' +
    'through the user\'s own local subscription router (Claude Code / agy ' +
    'CLIs on their flat plans) — no metered API, no per-token billing. Do ' +
    'not speculate beyond that. '
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

// Generic tail, used only to top the pad up once the live suggestions run out.
// `needsSymbol` entries are skipped rather than shown with a placeholder when
// there is no watchlist to draw a name from.
const SUGGESTIONS = [
  { key: 'chat.action_moving', k: 'mkt' },
  { key: 'chat.action_technical', k: 'mkt', needsSymbol: true },
  { key: 'chat.action_calendar', k: 'mkt' },
  { key: 'chat.action_research', k: 'app', needsSymbol: true },
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
  for (const s of reporting) push(tt('chat.action_earnings_summary', { symbol: s }), 'mkt')
  const soon = watchlist.filter((s) => earnDays[s] > 0 && earnDays[s] <= 3)
    .sort((a, b) => earnDays[a] - earnDays[b])[0]
  if (soon) push(tt('chat.action_earnings_preview', { symbol: soon, days: earnDays[soon] }), 'mkt')

  const movers = watchlist
    .map((s) => ({ s, pct: quotes[s]?.quote?.pct, price: quotes[s]?.quote?.price }))
    .filter((x) => x.pct != null && Math.abs(x.pct) >= 3)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
  for (const m of movers.slice(0, 2)) {
    push(tt('chat.action_mover', {
      symbol: m.s, direction: tl(m.pct > 0 ? 'up' : 'down'), pct: Math.abs(m.pct).toFixed(1),
    }), 'mkt')
  }

  if (nextEvent && nextEvent.days <= 7) {
    push(tt('chat.action_event', {
      event: tl(nextEvent.rawLabel || nextEvent.label),
      when: nextEvent.days === 0 ? tl('today') : tt('common.days', { days: nextEvent.days }),
      target: tl(book ? 'my book' : 'the market'),
    }), book ? 'book' : 'mkt')
  }

  if (book) {
    push(tt('chat.action_book_position'), 'book')
    push(tt('chat.action_book_risk'), 'book')
  }

  // a live alert suggestion off the top mover — the arm tool is real
  const top = movers[0]
  if (top?.price) {
    const lvl = top.pct > 0
      ? Math.ceil((top.price * 1.03) / 5) * 5
      : Math.floor((top.price * 0.97) / 5) * 5
    push(tt('chat.action_alert', { symbol: top.s, level: lvl }), 'app')
  }

  // Anomalies off the badges the feed already computes for every symbol. These
  // rank above the generic prompts because they name the thing that is
  // genuinely unusual right now, which is what you'd actually want to ask.
  const badge = (s) => quotes[s]?.tech || null
  const overnight = watchlist
    .map((s) => ({ s, pct: quotes[s]?.quote?.extPct }))
    .filter((x) => x.pct != null && Math.abs(x.pct) >= 1.5)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0]
  if (overnight) {
    push(tt('chat.action_overnight', {
      symbol: overnight.s, pct: overnight.pct.toFixed(1),
    }), 'mkt')
  }

  const spike = watchlist
    .map((s) => ({ s, r: badge(s)?.volRatio }))
    .filter((x) => x.r != null && x.r >= 2)
    .sort((a, b) => b.r - a.r)[0]
  if (spike) push(tt('chat.action_vol_spike', { symbol: spike.s, mult: spike.r.toFixed(1) }), 'mkt')

  const stretched = watchlist
    .map((s) => ({ s, rsi: badge(s)?.rsi }))
    .filter((x) => x.rsi != null && (x.rsi >= 70 || x.rsi <= 30))
    .sort((a, b) => Math.abs(b.rsi - 50) - Math.abs(a.rsi - 50))[0]
  if (stretched) push(tt('chat.action_stretched', { symbol: stretched.s, rsi: Math.round(stretched.rsi) }), 'mkt')

  const leader = watchlist
    .map((s) => ({ s, rs: badge(s)?.rs }))
    .filter((x) => x.rs != null && Math.abs(x.rs) >= 5)
    .sort((a, b) => Math.abs(b.rs) - Math.abs(a.rs))[0]
  if (leader) push(tt('chat.action_rs', { symbol: leader.s, pct: leader.rs.toFixed(1) }), 'mkt')

  const nearHigh = watchlist
    .map((s) => ({ s, off: badge(s)?.offHigh }))
    .filter((x) => x.off != null && x.off <= 3)
    .sort((a, b) => a.off - b.off)[0]
  if (nearHigh) push(tt('chat.action_near_high', { symbol: nearHigh.s, pct: nearHigh.off.toFixed(1) }), 'mkt')

  push(tt('chat.action_strongest'), 'mkt')

  // journal recall — only when there is a journal to recall from
  const lastTagged = [...(journal || [])].reverse().find((e) => e.symbols?.length)
  if (lastTagged) push(tt('chat.action_journal', { symbol: lastTagged.symbols[0] }), 'app')

  push(tt('chat.action_heatmap'), 'app')
  // The generic tail. Symbol-bearing ones borrow a name from the watchlist so
  // the pad never asks about a ticker the reader does not follow.
  const anySymbol = watchlist[0] || null
  for (const s of SUGGESTIONS) {
    if (acts.length >= 12) break
    if (s.needsSymbol && !anySymbol) continue
    push(tt(s.key, s.needsSymbol ? { symbol: anySymbol } : undefined), s.k)
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
      {/* touch has no hover — the controls stay visible on coarse pointers,
          which is why "no way to delete" read as true on the phone */}
      {onSave && (
        <button onClick={() => setEditing(true)} title={tl('edit')}
          class="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 text-muted hover:text-accent shrink-0">✎</button>
      )}
      <button onClick={onDelete} title={tl('delete')}
        class="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 text-muted hover:text-down shrink-0">✕</button>
    </div>
  )
}

/** claude.ai-style memory composer: type what should change in plain words
 *  ("forget the SGOV note", "merge #2 and #5") — a one-shot model call turns
 *  it into add/edit/delete ops applied through the normal memory mutators. */
function MemoryComposer({ memories, onApplied }) {
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const run = async (e) => {
    e.preventDefault()
    const ask = v.trim()
    if (!ask || busy) return
    setBusy(true)
    setNote(null)
    try {
      const listing = memories.map((m) => `#${m.id}: ${m.text}`).join('\n') || '(none)'
      const system = 'You maintain a short list of persistent assistant memories. '
        + 'Reply with ONLY a JSON array of operations — no prose, no code fence. '
        + 'Allowed ops: {"op":"add","text":"..."}, {"op":"edit","id":N,"text":"..."}, '
        + '{"op":"delete","id":N}. Apply the smallest set of changes that satisfies '
        + 'the request; reply [] if nothing applies.'
      const resp = await fetch(`${wireUrl().replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'auto', system,
          messages: [{ role: 'user', content: `Current memories:\n${listing}\n\nRequest: ${ask}` }] }),
        signal: AbortSignal.timeout(90_000),
      })
      const out = await resp.json()
      if (!out.ok) throw new Error(out.error || `chat ${resp.status}`)
      const match = (out.text || '').match(/\[[\s\S]*\]/)
      const ops = JSON.parse(match ? match[0] : '[]')
      let applied = 0
      for (const op of ops) {
        if (op.op === 'add' && op.text) { if (addMemory(op.text)) applied += 1 }
        else if (op.op === 'edit' && op.id != null && op.text) { if (editMemory(op.id, op.text)) applied += 1 }
        else if (op.op === 'delete' && op.id != null) { if (removeMemory(op.id)) applied += 1 }
      }
      setNote(applied ? `${applied} ${tl('changes applied')}` : tl('no changes needed'))
      if (applied) setV('')
      onApplied()
    } catch (err) {
      setNote(String(err.message || err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={run} class="pt-2 pb-1 border-b border-line">
      <div class="flex items-end gap-2">
        <textarea value={v} rows={1}
          onInput={(e) => { setV(e.currentTarget.value); autoGrow(e.currentTarget) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(e) } }}
          placeholder={`${tl('describe a change — add, rewrite, forget…')}`}
          class="flex-1 bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 font-anth text-[12px] text-ink outline-none focus:border-accent/60 placeholder:text-muted resize-none" />
        <button type="submit" disabled={busy || !v.trim()}
          class="font-mono text-[10px] px-2.5 py-1.5 rounded-lg border border-accent text-accent bg-accent-soft hover:bg-accent hover:text-black font-semibold disabled:opacity-40 disabled:pointer-events-none">
          {busy ? '…' : tl('apply')}
        </button>
      </div>
      {note && <div class="font-anth text-[10.5px] text-muted pt-1">{note}</div>}
    </form>
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

/** One row of the session list. Delete is always visible (hover-only meant it
 *  didn't exist on touch, and Jeff couldn't find it at all — 2026-08-07), and
 *  arming it flips the row into a confirm rather than firing on one tap. */
function SessionRow({ thread, active, busy, onOpen, onDelete }) {
  const [arming, setArming] = useState(false)
  useEffect(() => {
    if (!arming) return
    const t = setTimeout(() => setArming(false), 4000)
    return () => clearTimeout(t)
  }, [arming])
  return (
    <div class={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${active ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
      <button type="button" disabled={busy} onClick={onOpen} class="flex-1 min-w-0 text-left disabled:opacity-50">
        <span class={`block truncate font-anth text-[12px] ${active ? 'text-accent' : 'text-ink-2'}`}>
          {thread.title || tl('untitled')}
        </span>
        <span class="block font-mono text-[9px] text-muted">{tt('chat.session_messages', { n: thread.n })}</span>
      </button>
      {arming ? (
        <span class="flex items-center gap-1 shrink-0">
          <button type="button" disabled={busy} onClick={() => { setArming(false); onDelete() }}
            class="font-anth text-[10px] px-1.5 py-0.5 rounded border border-down/50 text-down hover:bg-down/10 disabled:opacity-40">
            {tl('delete')}
          </button>
          <button type="button" onClick={() => setArming(false)}
            class="font-anth text-[10px] px-1.5 py-0.5 rounded border border-line text-muted hover:text-ink">
            {tl('cancel')}
          </button>
        </span>
      ) : (
        <button type="button" disabled={busy} onClick={() => setArming(true)} title={tl('delete session')}
          aria-label={tl('delete session')}
          class="shrink-0 w-6 h-6 grid place-items-center rounded-md text-muted hover:text-down hover:bg-surface-2 disabled:opacity-30">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 4.5h10M6.5 4.5V3.2h3v1.3M4.4 4.5l.6 8.1h6l.6-8.1M6.6 7v3.4M9.4 7v3.4" />
          </svg>
        </button>
      )}
    </div>
  )
}

/** "~1.2k tokens" — the depth read for a model that reasons behind a
 *  curtain. Claude 5's adaptive thinking omits the text and reports only how
 *  much of it there was (Jeff 2026-08-07: he wanted the reasoning itself; this
 *  is what the backend actually exposes). */
function thinkDepth(tokens) {
  if (!tokens) return ''
  return tokens >= 1000 ? `~${(tokens / 1000).toFixed(1)}k tokens` : `~${tokens} tokens`
}

/** Three dots that keep breathing while a step runs. */
function Ellipsis() {
  return <span class="chat-ellipsis" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
}

/** The model's reasoning as it streams. Pinned to the newest line — a pane
 *  that doesn't follow the text is a pane you have to babysit. */
function ThinkingPane({ text }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [text])
  if (!text) return null
  return <div ref={ref} class="chat-think">{text}</div>
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
  // the reasoning of whichever model step is live — shown as it arrives
  // rather than only inside the folded step list (Jeff 2026-08-07)
  const liveThinking = busy && running?.kind === 'model' ? running.detail : ''
  const liveDepth = busy && running?.kind === 'model' ? thinkDepth(running.thinkTokens) : ''

  return (
    <div class={`chat-trace w-full max-w-[92%] self-start text-muted ${busy ? 'is-live' : ''}`}>
      <button type="button" class="chat-trace-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span class={`chat-trace-mark ${busy ? 'is-running' : failed ? 'is-error' : 'is-done'}`} aria-hidden="true">
          {busy ? <BrandSpinner size={19} /> : null}
        </span>
        <span class="chat-trace-title">{title}{busy ? <Ellipsis /> : ` ${elapsed}`}</span>
        {busy && <span class="font-mono text-[9px] tabular-nums text-muted">{elapsed}</span>}
        {liveDepth && !liveThinking && (
          <span class="font-mono text-[9px] tabular-nums text-muted/80">{liveDepth}</span>
        )}
        <span class="chat-trace-count">{steps.length} {steps.length === 1 ? 'step' : 'steps'}</span>
        <span class={`chat-trace-caret ${open ? 'is-open' : ''}`} />
      </button>
      {/* live reasoning rides ABOVE the step list: it's the part you actually
          read while waiting, and it stays reachable per-step afterwards */}
      {liveThinking && <ThinkingPane text={liveThinking} />}
      <div class={`chat-trace-reveal ${open ? 'is-open' : ''}`}>
        <div>
          <div class="chat-trace-body">
            {/* The header already IS the live status line, so the step that is
                currently running would render the same word directly under it
                — "Thinking…" stacked on "Thinking…" (Jeff 2026-08-07). Drop the
                running step from the list while it duplicates the header; it
                joins the list the moment it finishes and has a duration to
                report, which is when a history row starts being worth having. */}
            {steps.filter((step) => !(
              busy && step.status === 'running' && (step.verb || step.label) === title
            )).map((step) => {
              const end = step.endedAt || now
              const stepElapsed = step.startedAt ? durationLabel(end - step.startedAt) : ''
              return (
                <div key={step.key} class={`chat-trace-step is-${step.status || 'done'}`}>
                  <span class="chat-trace-node" />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-2">
                      <span class="chat-trace-label">
                        {step.label}{step.status === 'running' && <Ellipsis />}
                      </span>
                      {stepElapsed && <span class="chat-trace-time">{stepElapsed}</span>}
                    </div>
                    {/* No placeholder for absent reasoning. Most backends
                        return none at all, so "no reasoning returned for this
                        step" was a line of chrome under every model step
                        announcing that nothing happened. A step with real
                        reasoning shows it; a step with only a token count says
                        so; a step with neither says nothing. */}
                    {step.detail
                      ? <div class={`chat-trace-detail ${step.kind === 'tool' ? 'is-tool' : ''}`}>{step.detail}</div>
                      : step.kind === 'model' && step.thinkTokens ? (
                        <div class="chat-trace-detail">
                          {`${tl('reasoned privately')} · ${thinkDepth(step.thinkTokens)}`}
                        </div>
                      ) : null}
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
                     threadLen, onResume, memN, journalN, journal,
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
                  {earnDays[s] === 0 ? tl('today') : tt('common.days', { days: earnDays[s] })}
                </span>
              </a>
            )) : <div class="font-mono text-[11px] text-muted py-1">{tl('loading…')}</div>}
          </div>
          <div class={cell}>
            <div class={eyebrow}>{tl('on the calendar')}</div>
            {events.length ? events.slice(0, 4).map((ev) => (
              <a key={ev.label + ev.days} href="#/markets/calendar" class="flex items-baseline justify-between gap-2 font-mono text-[11.5px] py-px hover:no-underline">
                <span class="text-ink truncate">{tl(ev.rawLabel || ev.label)}</span>
                <span class={ev.days <= 1 ? 'text-imminent font-bold' : ev.days <= 7 ? 'text-down' : 'text-accent'}>
                  {ev.days === 0 ? tl('today') : tt('common.days', { days: ev.days })}
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

      {/* the composer used to sit here, mid-pad, which meant scrolling to
          find it on a short viewport — it's docked at the bottom of the page
          now (Jeff 2026-08-07) */}
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
    // Close the drawer, exactly as switchThread does. Without this the new
    // thread was created correctly but the modal stayed up covering it, so
    // from the reader's side the button did nothing at all (Jeff 2026-08-07).
    setDrawer(null)
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
    // context assembly is table stakes, not a trace step worth narrating
    // (Jeff 2026-08-06: "it says read live market context every single time")
    replaceActivity([{
      key: 'context', kind: 'context', label: 'Thinking',
      verb: 'Thinking', status: 'running', startedAt: turnStartedRef.current,
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

    const traceEvent = (event) => {
      const now = Date.now()
      if (event.type === 'model_start') {
        // the placeholder "Thinking…" step yields to the real model step
        updateActivity((steps) => [...steps.filter((step) => step.key !== 'context'), {
          key: `model-${event.round}`, kind: 'model',
          label: 'Thinking', verb: 'Thinking',
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
      if (event.type === 'thinking_tokens') {
        updateActivity((steps) => steps.map((step) => step.key === `model-${event.round}`
          ? { ...step, thinkTokens: event.tokens }
          : step))
        return
      }
      if (event.type === 'model_done') {
        updateActivity((steps) => steps.map((step) => step.key === `model-${event.round}`
          ? {
              ...step,
              label: event.outcome === 'answer' ? 'Answered' : 'Reasoned',
              status: 'done', endedAt: now,
            }
          : step))
        return
      }
      if (event.type === 'tool_start') {
        const call = { name: event.name, args: event.args }
        updateActivity((steps) => [...steps, {
          key: `tool-${event.id}`, kind: 'tool', label: toolRunLabel(call),
          verb: toolRunLabel(call), detail: traceArgs(event.args),
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
        {/* OWUI-style: the model rides the composer, not page chrome */}
        <div class="flex items-center gap-2 px-2 pt-1 font-mono text-[9.5px] text-muted flex-wrap">
          {/* The bare select rendered the OS's own control — different chrome
              on every platform, and visibly foreign next to the hand-built
              effort pills beside it. appearance-none plus our own caret makes
              the two read as one control group (Jeff 2026-08-07). The caret is
              pointer-events-none so clicking it still opens the select. */}
          <span class="relative inline-flex items-center">
            <select
              value={model}
              onChange={(e) => chooseModel(e.currentTarget.value)}
              title={tl('model')}
              class="appearance-none bg-surface-2 border border-line rounded-md pl-2 pr-5 py-[3px] font-anth text-[10.5px] text-ink-2 outline-none cursor-pointer hover:border-line-2 focus:border-accent/70 transition-colors"
            >
              {(models.length ? models : [{ key: model, label: model }]).map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <span class="pointer-events-none absolute right-1.5 text-[7px] leading-none text-muted">▾</span>
          </span>
          {effortLevels.length > 0 && (
            <span class="flex items-center gap-0.5 bg-surface-2 border border-line rounded-md px-0.5 py-px" title={tl('thinking effort')}>
              {effortLevels.map((lv) => (
                <button
                  key={lv}
                  type="button"
                  onClick={() => {
                    setEffort(lv)
                    localStorage.setItem('chat_effort', lv)
                  }}
                  class={`px-1.5 py-px font-anth text-[10px] rounded transition-colors ${
                    effort === lv
                      ? 'bg-accent text-black font-bold'
                      : 'text-muted hover:text-ink hover:bg-surface-3'
                  }`}
                >
                  {/* Not translated. These are the API's own effort tiers --
                      low / medium / high / max are the literal values sent
                      upstream, so rendering 低/中/高 made the control name
                      something different from the thing it sets (Jeff
                      2026-08-07). Model names beside it aren't translated
                      either, for the same reason. */}
                  {lv}
                </button>
              ))}
            </span>
          )}
          {onWire && selectedModel?.fixed_effort && (
            <span class="font-mono text-[9px] text-muted border border-line rounded-md px-1.5 py-px"
                  title={tl('fixed thinking tier')}>
              {selectedModel.fixed_effort}
            </span>
          )}
          <span class="ml-auto flex items-center gap-3">
            <span><kbd class="text-ink-2">⏎</kbd> {tl('send')}</span>
            <span><kbd class="text-ink-2">⇧⏎</kbd> {tl('newline')}</span>
            {queued.length > 0 && <span class="text-accent">{queued.length} queued</span>}
            {!onWire && <SpendMeter spend={spend} />}
          </span>
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
    <div class="relative flex-1 flex flex-col p-3 pt-8 min-h-0 min-w-0 select-text">
      {/* The header row is gone — the dialog owns its vertical space. The
          wordmark tucks into the far top-left corner and the tool rail into
          the top-right, both floating transparent (Jeff 2026-08-06). Model
          and effort moved onto the composer, OWUI-style. */}
      {/* the wordmark used to sit jammed into the corner at 13px; it now
          shares the rail's 12px inset and reads at 15px (Jeff 2026-08-07) */}
      {/* 15px at top-3/left-3 still read cramped against the rail (Jeff
          2026-08-07, second pass). 17px with roomier insets; leading-tight
          rather than leading-none so the descender in "g" isn't clipped. */}
      {/* The brow. The wordmark and the tool rail float ABOVE the scrolling
          transcript with nothing behind them, so scrolled content ran straight
          through the lettering — the launchpad heading collided with "AI Chat"
          (Jeff 2026-08-07). This is the mask: full width so it covers the rail
          on the right as well as the wordmark on the left, tall enough to clear
          both (rail bottoms out at 38px, wordmark at ~37px), and fading rather
          than a hard edge so text slides under it instead of being guillotined.
          z-20 keeps it under the z-30 chrome; pointer-events-none so it cannot
          eat a click meant for the transcript. */}
      <div class="pointer-events-none absolute inset-x-0 top-0 h-14 z-20
                  bg-gradient-to-b from-surface-0 via-surface-0/95 to-transparent" />
      <div class="absolute top-4 left-4 z-30 flex items-center gap-2">
        <h1 class="font-bold text-[17px] leading-tight text-ink" style="font-family: 'Plus Jakarta Sans', sans-serif">{tl('AI Chat')}</h1>
        <span class={`w-1.5 h-1.5 rounded-full ${onWire ? 'bg-up' : 'bg-accent'}`}
              title={tl(onWire ? 'online — private wire' : 'online — public proxy')} />
      </div>
        <div class="absolute top-2.5 right-3 z-30 h-7 flex items-center gap-0.5 rounded-lg px-0.5">
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
              <SessionRow key={thread.id} thread={thread} busy={busy}
                active={thread.id === currentThreadId()}
                onOpen={() => switchThread(thread.id)}
                onDelete={() => deleteSession(thread.id)} />
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
          <MemoryComposer memories={memories} onApplied={() => setMemories(loadMemories())} />
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
        <>
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
            memN={memories.length}
            journalN={journal.length}
            journal={journal}
            onOpenMem={() => { setMemories(loadMemories()); setDrawer('mem') }}
            onOpenJournal={() => { setJournal(loadJournal()); setDrawer('journal') }}
          />
        </div>
        {composer}
        </>
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
                  {tt('chat.earnings_due', {
                    when: earnDays[sym] === 0 ? tl('today') : tt('common.days', { days: earnDays[sym] }),
                  })}
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
                  title={tl('delete session')} aria-label={tl('delete session')}
                  class="text-muted/70 hover:text-down shrink-0 font-mono text-[10px]">✕</button>
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
