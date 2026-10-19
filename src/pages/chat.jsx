import {TEMPORARY_CHAT_PROMPT} from '../lib/chatPrivacy.js'
import { assistantIdentityPrompt } from '../lib/chatIdentity.js'
import { TraceEntry } from '../components/TraceEntry.jsx'
import {ChatNotice} from '../components/ChatNotice.jsx'
import {ChatFailure} from '../components/ChatFailure.jsx'
import {ConversationDelete} from '../components/ConversationDelete.jsx'
import {pickerModels,modelGroups,fullModelName} from '../lib/chatModels.js'
import {SuggestionRows} from '../components/SuggestionRows.jsx'
import { earningsTone } from '../lib/earningsTone.js'
import {submitTextKey} from '../lib/chatInput.js'
import {chatRailData,rsiTone} from '../lib/chatRail.js'
import {replayRequest} from '../lib/chatReplay.js'
import {mergeTurnUsage,metricDuration} from '../lib/chatMetrics.js'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { fetchChatModels, fetchSpend } from '../lib/chatClient.js'
import { runAgentic, trimHistory } from '../lib/agent.js'
import {activityLabel} from '../lib/chatActivityLabels.js'
import { toolLabel, toolRunLabel } from '../lib/tools.js'
import { BrandSpinner } from '../components/BrandSpinner.jsx'
import { Loading } from '../components/Loading.jsx'
import { Overlay } from '../components/Overlay.jsx'
import { MdLite } from '../components/AiReport.jsx'
import { getLocale, tl, t as tt } from '../lib/i18n.js'
import { applyLanguagePreference } from '../lib/aidials.js'
import { fetchWireChatModels, wireChatAvailable, wireComplete } from '../lib/wirechat.js'
import { useQuotes, useWatchlist } from '../hooks.js'
import { useEarningsDays } from './dashboard.jsx'
import { ECON_EVENTS } from '../lib/markets.js'
import { loadCatalysts, mergedEvents } from '../lib/catalysts.js'
import { fmtPct } from '../lib/format.js'
import { buildChatContext, hasLiveBook, fetchBookJson, savedChatBook } from '../lib/chatContext.js'
import { pulseStats } from '../lib/pulse.js'
import { loadMemories, editMemory, removeMemory, applyMemoryTags, applyMemoryOperations, canUndoMemoryCompaction, undoMemoryCompaction } from '../lib/chatMemory.js'
import { loadJournal, addJournalEntry, removeJournalEntry, searchJournal } from '../lib/journal.js'
import { CHAT_HOME_EVENT, takeChatHomePending, CHAT_RETURN_EVENT, canResumeChat, markChatInteraction } from '../lib/chatnav.js'
import { captureAnchor, restoreAnchor } from '../lib/scrollAnchor.js'
import { CHATSTORE_ERROR_EVENT, CHATSTORE_SYNC_EVENT, chatstoreAvailable, syncNotes } from '../lib/chatstore.js'
import { LANES, activeLanes, dynamicActions, visibleActions, promptLabel } from '../lib/launchpad.js'
import {
  liveThreadList, onThreadsChange, fetchThreadList, hydrateActiveThread, loadActiveHistory, migrateLegacy,
  openThread, removeThread, saveActiveHistory, flushActiveHistory, startNewThread, deleteActiveThread, currentThreadId,
} from '../lib/threads.js'
import { wireServiceUrl } from '../lib/wire.js'
import { plainTraceText, hasTurnActivity, activityGroups, traceIcon, completionLabel, tracePrintout, traceToolDetails } from '../lib/chatTrace.js'
import { ChatFooter } from '../components/ChatFooter.jsx'
import { loadZhTable, loadMissingZhName, onZhTable, zhName } from '../lib/zhNames.js'
import { onPortfoliosChange } from '../lib/myPortfolios.js'
import { CHAT_CONTEXT_EVENT, takeChatContext, takeChatAction, contextualReadTools } from '../lib/chatHandoff.js'
import { IS_FAMILY_AI, IS_FAMILY_BUILD, IS_PRIVATE_BUILD } from '../lib/nav.js'

// Base prompt stays generic in source. Whether the assistant has a real book
// is decided at runtime by whether the viewer wired in their own newsservice —
// the public no-endpoint build keeps the demo disclaimer.
function baseSystem(selection) {
  const common =
    assistantIdentityPrompt(selection) +
    'You work inside ticker-tape, a market dashboard ' +
    '(dashboard, markets, per-symbol research, screening, alerts, portfolio). ' +
    'You have tools: live quotes, technicals, earnings, market ' +
    'pulse, the macro calendar (plus adding user catalysts to it), watchlist ' +
    'read/write, alert arming, persistent memory, and app navigation. Use them for ' +
    'anything involving current prices, technicals, or the watchlist instead of ' +
    'answering from memory; complete the relevant reads before answering. ' +
    'Answer like a sharp desk colleague: lead with the direct call, then the ' +
    'numbers behind it. Always quote the actual figures your tools returned ' +
    '(price, %, levels, dates) — never vague direction words where a number ' +
    'exists. A typical market answer covers the print, the driver, the levels ' +
    'that matter, and what to watch next. Tight paragraphs or dash bullets. ' +
    'For a contextual question about a saved portfolio, use the explicit portfolio_id in SELECTED VIEW CONTEXT to read the clicked book with get_portfolio. Do not substitute the default book or combine other books unless asked. ' +
    'No filler, no disclaimers, no restating the question. Depth beats ' +
    'brevity — a thin answer is worse than a long one. '
  const infrastructure =
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
  if (IS_FAMILY_AI) return common +
    'This family edition uses the selected subscription model. ' +
    'Only context supplied by this browser is available. An ALL SAVED PORTFOLIOS catalog lists every book the user can view. A SAVED PORTFOLIO block describes the selected view only. Use get_portfolio to inspect any named or unselected book, including separate currency books. Do not claim you lack access just because a tab is not selected. Read cash, trades, history, research and other app data using the available tools. There is no broker connection ' +
    'or access to the subscription owner\'s accounts, files, or chat history. '
  return common + infrastructure + book
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
          aria-label={tl('Save changes')} class="text-[#3fb950] hover:brightness-125 shrink-0 pt-0.5">✓</button>
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
        <button onClick={() => setEditing(true)} title={tl('edit')} aria-label={tl('edit')}
          class="text-muted hover:text-accent shrink-0 rounded px-1 py-0.5">{tl('edit')}</button>
      )}
      <button onClick={onDelete} title={tl('delete')} aria-label={tl('delete')}
        class="text-muted hover:text-[#f85149] hover:bg-[#f85149]/10 shrink-0 rounded px-1 py-0.5">{tl('delete')}</button>
    </div>
  )
}

/** claude.ai-style memory composer: type what should change in plain words
 *  ("forget the SGOV note", "merge #2 and #5") — a one-shot model call turns
 *  it into add/edit/delete ops applied through the normal memory mutators. */
export function MemoryComposer({ memories, onApplied, children }) {
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const run = async (e, compact=false) => {
    e.preventDefault()
    const ask = compact ? 'Consolidate duplicate or overlapping memories. Preserve all distinct facts, exact numbers, ticker symbols, prices, dates and preferences. Only remove obsolete information when a newer fact explicitly supersedes it. Keep retained IDs, use edit/delete operations only, and keep at least three entries. When uncertain, preserve the original fact.' : v.trim()
    if (!ask || busy) return
    setBusy(compact ? 'compact' : 'apply')
    setNote(null)
    try {
      const listing = memories.map((m) => `#${m.id}: ${m.text}`).join('\n') || '(none)'
      const system = 'You maintain a short list of persistent assistant memories. '
        + 'Reply with ONLY a JSON array of operations — no prose, no code fence. '
        + 'Allowed ops: {"op":"add","text":"..."}, {"op":"edit","id":N,"text":"..."}, '
        + '{"op":"delete","id":N}. Apply the smallest set of changes that satisfies '
        + 'the request; reply [] if nothing applies.'
      const out = await wireComplete({
        model: localStorage.getItem('chat_wire_model') || 'agy-flash', system,
        messages: [{ role: 'user', content: `Current memories:\n${listing}\n\nRequest: ${ask}` }],
        signal: AbortSignal.timeout(90_000),
      })
      const match = (out.text || '').match(/\[[\s\S]*\]/)
      const ops = JSON.parse(match ? match[0] : '[]')
      const applied=applyMemoryOperations(ops,{compact,expected:memories})
      setNote(applied ? (compact ? `${tl('Compacted')} ${memories.length} → ${loadMemories().length}` : `${applied} ${tl('changes applied')}`) : tl('no changes needed'))
      if (applied) setV('')
      onApplied()
    } catch (err) {
      setNote(tl(String(err.message || err)))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div class="flex items-center gap-3 pb-3 border-b border-line" data-memory-toolbar>
        <p class="min-w-0 flex-1 font-anth text-[11px] text-muted">{tl('Details the assistant should remember in future chats.')}</p>
        {canUndoMemoryCompaction() && <button type="button" disabled={!!busy} onClick={()=>{try{undoMemoryCompaction();setNote(tl('Compaction undone'));onApplied()}catch(err){setNote(tl(err.message))}}} class="font-anth text-[10px] text-muted hover:text-ink">{tl('Undo')}</button>}
        <button type="button" disabled={!!busy || memories.length<3} aria-busy={busy==='compact'} onClick={e=>run(e,true)} title={tl('Merge duplicate memories while keeping distinct facts')}
          class="inline-flex min-w-[66px] h-[25px] items-center justify-center gap-1 rounded border border-line px-2 font-anth text-[10px] text-muted hover:text-ink disabled:opacity-40">
          {busy==='compact' ? <BrandSpinner size={13} /> : tl('Compact')}
        </button>
      </div>
      {children}
      <form onSubmit={e=>run(e)} class="pt-3 pb-1 border-t border-line">
      <div class="flex items-end gap-2">
        <textarea value={v} rows={2}
          onInput={(e) => { setV(e.currentTarget.value); autoGrow(e.currentTarget) }}
          onKeyDown={(e) => { if (submitTextKey(e,'modified')) { e.preventDefault(); run(e) } }}
          placeholder={tl('Describe what you want to remember…')} aria-label={tl('Describe what you want to remember…')}
          class="flex-1 bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 font-anth text-[12px] text-ink outline-none focus:border-accent/60 placeholder:text-muted resize-none" />
        <button type="submit" disabled={busy || !v.trim()} aria-busy={busy==='apply'} aria-label={tl(busy==='apply' ? 'Applying changes' : 'apply')} title={tl('Ctrl/Cmd+Enter to apply')}
          class="inline-flex min-w-[56px] h-[30px] items-center justify-center font-mono text-[10px] px-2.5 py-1.5 rounded-lg border border-accent text-accent bg-accent-soft hover:bg-accent hover:text-black font-semibold disabled:opacity-40 disabled:pointer-events-none">
          {busy==='apply' ? <BrandSpinner size={14} /> : tl('apply')}
        </button>
      </div>
      {note && <div class="font-anth text-[10.5px] text-muted pt-1">{note}</div>}
      </form>
    </>
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
        {tl('add')}
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
        <span class={`block h-full ${pct > 80 ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
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
            <span class={failed ? 'text-red-400' : res == null ? 'text-accent animate-pulse' : 'text-muted'}>
              {failed ? '✕' : res == null ? '◌' : '✓'}
            </span>
            {toolLabel(tc,tl)}
          </span>
        )
      })}
    </div>
  )
}

function durationLabel(ms) {
  return metricDuration(Math.max(0,ms)/1000)
}

/** One row of the session list. Delete is always visible (hover-only meant it
 *  didn't exist on touch, and Jeff couldn't find it at all — 2026-08-07), and
 *  arming it flips the row into a confirm rather than firing on one tap. */
function SessionRow({ thread, active, busy, onOpen, onDelete }) {
  return (
    <div class={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${active ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
      <button type="button" disabled={busy} onClick={onOpen} class="flex-1 min-w-0 text-left disabled:opacity-50">
        <span class={`block truncate font-anth text-[12px] ${active ? 'text-accent' : 'text-ink-2'}`}>
          {thread.title || tl('untitled')}
        </span>
        <span class="block font-mono text-[9px] text-muted">{tt('chat.session_messages', { n: thread.n })}</span>
      </button>
      <ConversationDelete disabled={busy} onDelete={onDelete} />
    </div>
  )
}

/** "~1.2k tokens" — the depth read for a model that reasons behind a
 *  curtain. Claude 5's adaptive thinking omits the text and reports only how
 *  much of it there was (Jeff 2026-08-07: he wanted the reasoning itself; this
 *  is what the backend actually exposes). */
function thinkDepth(tokens) {
  if (!tokens) return ''
  return tokens >= 1000 ? `~${(tokens / 1000).toFixed(1)}k tok` : `~${tokens} tok`
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
  return <div ref={ref} class="chat-think">{plainTraceText(text)}</div>
}


/** Per-step glyph. Grey, 12px, stroked — the label already says what happened,
 *  so the icon is a scanning aid, not decoration, and it stays monochrome so a
 *  list of steps reads as one column rather than a row of colours. */
function StepIcon({ kind, name, verb, status }) {
  const icon=traceIcon({kind,name,label:verb})
  const p={fill:'none',stroke:'currentColor','stroke-width':1.5,'stroke-linecap':'round','stroke-linejoin':'round'}
  const paths={
    portfolio:<g {...p}><path d="M2 3h4a2 2 0 0 1 2 2v9a2 2 0 0 0-2-2H2zM14 3h-4a2 2 0 0 0-2 2v9a2 2 0 0 1 2-2h4z"/></g>,
    calendar:<g {...p}><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M5 1.5v3M11 1.5v3M2 7h12M5 10h1M10 10h1"/></g>,
    market:<g {...p}><path d="M2 2v12h12M4 10l3-4 3 2 4-5"/></g>,
    read:<g {...p}><path d="M2 3h4a2 2 0 0 1 2 2v9a2 2 0 0 0-2-2H2zM14 3h-4a2 2 0 0 0-2 2v9a2 2 0 0 1 2-2h4z"/></g>,
    search:<g {...p}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></g>,
    answer:<g {...p}><path d="M3 8.5 6.5 12 13 4.5"/></g>,
    thinking:<g {...p}><path d="M6 12.5h4M6.5 14h3M8 2a4 4 0 0 0-2.5 7.1c.5.4.5.8.5 1.4h4c0-.6 0-1 .5-1.4A4 4 0 0 0 8 2Z"/></g>,
  }
  return <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" data-trace-icon={icon}
    class={`chat-trace-node is-${status||'done'}`}>{paths[icon]}</svg>
}

export function ActivityTrace({ steps, busy = false, startedAt, usage = null }) {
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
  const title = busy ? (running?.verb || running?.label || 'Working') : failed ? 'Stopped after' : completionLabel(steps)
  const elapsed = durationLabel(last - first)
  // the reasoning of whichever model step is live — shown as it arrives
  // rather than only inside the folded step list (Jeff 2026-08-07)
  const liveThinking = busy && running?.kind === 'model' ? running.detail : ''
  const liveDepth = busy && running?.kind === 'model' ? thinkDepth(running.thinkTokens) : ''
  // The header already IS the live status line — it renders the running step's
  // verb — so the step that is currently running would repeat the same word
  // directly beneath it ("Thinking..." stacked on "Thinking..."). Drop it while
  // it duplicates the header; it rejoins the moment it finishes and has a
  // duration to report, which is when a history row starts being worth having.
  const visibleSteps = steps.filter((step) => !(
    busy && step.status === 'running' && (step.verb || step.label) === title && !step.detail && !step.thinkTokens
  ))

  return (
    <div class={`chat-trace w-full max-w-[92%] self-start text-muted ${busy ? 'is-live' : !failed ? 'is-complete' : ''}`}>
      <button type="button" class="chat-trace-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span class={`chat-trace-mark ${busy ? 'is-running' : failed ? 'is-error' : 'is-done'}`} aria-hidden="true">
          {busy ? <BrandSpinner size={19} /> : null}
        </span>
        <span class="chat-trace-heading"><span class="chat-trace-summary">
        <span class="chat-trace-title">{activityLabel(title,tl)}{busy ? <Ellipsis /> : ` ${elapsed}`}</span>
        {busy && <span class="font-mono text-[9px] tabular-nums text-muted">{elapsed}</span>}
        {liveDepth && !liveThinking && (
          <span class="font-mono text-[9px] tabular-nums text-muted/80">{liveDepth}</span>
        )}
        </span>
        <span class="chat-trace-count">{tt(steps.length===1?'chat.step':'chat.steps',{n:steps.length})}</span>
        </span>
      </button>
      <div class={`chat-trace-reveal ${open ? 'is-open' : ''}`}>
        <div>
          {/* Rendered only when it has rows. .chat-trace-body carries a
              border-left spine plus padding, so an EMPTY body still painted a
              short grey stub hanging under the header — visible for the whole
              first turn, since filtering the running step can leave nothing to
              show (Jeff 2026-08-07). */}
          {visibleSteps.length > 0 && (
          <div class="chat-trace-body">
            {activityGroups(visibleSteps).map((group, index) => (
              <section key={group.model?.key || index} class="chat-trace-phase">
                {group.model && (
                  <div class="chat-trace-reason">
                    <TraceEntry detail={group.model.detail || group.model.commentary || group.model.thinkTokens ? <>
                      {group.model.detail && (group.model.status === 'running'
                        ? <ThinkingPane text={group.model.detail} />
                        : <div class="chat-trace-detail">{plainTraceText(group.model.detail)}</div>)}
                      {group.model.commentary && <div class="chat-trace-detail">{group.model.commentary}</div>}
                      {!group.model.detail && group.model.thinkTokens ? <div class="chat-trace-detail">
                        {`${tl('reasoned privately')} · ${thinkDepth(group.model.thinkTokens)}`}
                      </div> : null}
                    </> : null}>
                      <span class="chat-trace-icon"><StepIcon kind="model" verb={group.model.label || group.model.verb} status={group.model.status} /></span>
                      <span>{activityLabel(group.model.label,tl)}</span>
                      <span class="chat-trace-time">{group.model.startedAt ? durationLabel((group.model.endedAt || now)-group.model.startedAt) : ''}</span>
                      {!group.model.detail && group.model.thinkTokens ? <span class="chat-trace-time">{thinkDepth(group.model.thinkTokens)}</span> : null}
                    </TraceEntry>
                  </div>
                )}
                {group.tools.length > 0 && <div class="chat-trace-tools">
                  {group.tools.map(step=>{
                    const end=step.endedAt || now
                    const stepElapsed=step.startedAt ? durationLabel(end-step.startedAt) : ''
                    return (
                <div key={step.key} class={`chat-trace-step is-tool is-${step.status || 'done'}`}>
                  <div class="min-w-0 flex-1">
                    <TraceEntry detail={step.input || step.output || step.detail ? <>
                      {step.input && <div class="chat-trace-printout"><div>{tl('Input')}</div><pre>{step.input}</pre></div>}
                      {step.output && <div class="chat-trace-printout"><div>{tl('Output')}</div><pre>{step.output}</pre></div>}
                      {step.detail && <div class="chat-trace-detail">{plainTraceText(step.detail)}</div>}
                    </> : null}>
                      <span class="chat-trace-icon"><StepIcon kind={step.kind} name={step.name} verb={step.label || step.verb} status={step.status} /></span>
                      <span class="chat-trace-label">
                        {activityLabel(step.label,tl)}{step.status === 'running' && <Ellipsis />}
                      </span>
                      {stepElapsed && <span class="chat-trace-time">{stepElapsed}</span>}
                    </TraceEntry>
                  </div>
                </div>
                    )
                  })}
                </div>}
              </section>
            ))}
          </div>
          )}
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
                     onOpenMem, onOpenJournal, temporary=false, bookRevision = 0 }) {
  const book = hasLiveBook()
  const nextEvent = events[0] || null
  const [lane, setLane] = useState(null)
  const [page, setPage] = useState(0)
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
  }, [book,bookRevision])
  const suggestionSymbols=[...new Set([...(bk?.positions || []).map(p=>p.symbol),...watchlist])]
  const [,nameTick]=useState(0)
  useEffect(()=>{
    if(getLocale()!=='zh') return
    loadZhTable().then(()=>suggestionSymbols.forEach(s=>loadMissingZhName(s)))
    return onZhTable(()=>nameTick(n=>n+1))
  },[suggestionSymbols.join(',')])
  const names=getLocale()==='zh' ? Object.fromEntries(suggestionSymbols.map(s=>[s,zhName(s)])) : {}
  const pool=dynamicActions({watchlist:suggestionSymbols,quotes,earnDays,nextEvent,book,journal,edition:page})
  const lanes=activeLanes(pool)
  const shown=visibleActions(pool,{lane,page,size:40,rotate:true})
  const refreshable=shown.length>12
  const [suggestionsPaused,setSuggestionsPaused]=useState(false)
  const topPos = (bk?.positions || [])
    .filter((p) => bk?.manual || p.weight_pct != null)
    .sort((a, b) => (b.weight_pct || 0) - (a.weight_pct || 0))
    .slice(0, 3)

  const cell = "px-3 py-2 min-w-0"
  const eyebrow = "font-mono text-[9px] tracking-[0.16em] text-muted uppercase pb-1"

  return (
    <div class="chat-launchpad w-full px-1 py-3 flex flex-col gap-3">
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
                <span class="text-ink font-[650]">{s}</span>
                <span class={pct >= 0 ? 'text-up' : 'text-down'}>{fmtPct(pct)}</span>
              </a>
            )) : <Loading label={tl('loading…')} minH={72} />}
          </div>
          <div class={cell}>
            <div class={eyebrow}>{tl('next earnings')}</div>
            {nextEarn.length ? nextEarn.map((s) => (
              <a key={s} href={`#/research/${s.toLowerCase()}/earnings`} class="flex items-baseline justify-between font-mono text-[11.5px] py-px hover:no-underline">
                <span class="text-ink font-[650]">{s}</span>
                <span class={earningsTone(earnDays[s])}>
                  {earnDays[s] === 0 ? tl('today') : tt('common.days', { days: earnDays[s] })}
                </span>
              </a>
            )) : <Loading label={tl('loading…')} minH={72} />}
          </div>
          <div class={cell}>
            <div class={eyebrow}>{tl('on the calendar')}</div>
            {events.length ? events.slice(0, 4).map((ev) => (
              <a key={ev.label + ev.days} href="#/markets/calendar" class="flex items-baseline justify-between gap-2 font-mono text-[11.5px] py-px hover:no-underline">
                <span class="text-ink truncate">{tl(ev.rawLabel || ev.label)}</span>
                <span class={ev.days <= 1 ? 'text-imminent font-bold' : ev.days <= 7 ? 'text-danger' : 'text-accent'}>
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
            ) : <Loading label={tl('loading…')} minH={72} />}
          </div>
          {book && (
            <div class={cell}>
              <div class={eyebrow}>{tl('the book')}</div>
              {bk?.manual && <a href="#/portfolio/mine" class="block truncate text-[10px] text-muted mb-1">{bk.name}</a>}
              {topPos.length ? (
                <div class="font-mono text-[11.5px] leading-[1.55]">
                  {topPos.map((p) => (
                    <div key={p.symbol} class="flex justify-between">
                      <span class="text-ink font-[650]">{(getLocale()==='zh' && zhName(p.symbol)) || p.symbol}</span>
                      {bk?.manual ? <span class="text-ink-2">{p.shares} {tl('shares')}</span> : <span><span class="text-ink-2">{Math.round(p.weight_pct)}%</span>{' '}
                        <span class={p.unrealized_pnl >= 0 ? 'text-up' : 'text-down'}>{p.unrealized_pnl >= 0 ? '▲' : '▼'}</span></span>}
                    </div>
                  ))}
                  {bk?.margin?.cushion_pct != null && (
                    <div class="flex justify-between pt-px border-t border-line-2/60 mt-px">
                      <span class="text-muted">{tl('Cushion')}</span>
                      <span class={bk.margin.cushion_pct < 8 ? 'text-danger' : 'text-ink-2'}>{bk.margin.cushion_pct.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              ) : <div class="font-mono text-[11px] text-muted py-1">{tl('reading the wire…')}</div>}
            </div>
          )}
          <div class={cell}>
            <div class={eyebrow}>{tl('context it carries')}</div>
            <div class="font-mono text-[11.5px] leading-[1.55]">
              {!temporary && <>
              <button type="button" onClick={onOpenMem} class="flex justify-between w-full hover:text-ink">
                <span class="text-muted">{tl('memories')}</span><span class="text-ink-2">{memN}</span>
              </button>
              <button type="button" onClick={onOpenJournal} class="flex justify-between w-full hover:text-ink">
                <span class="text-muted">{tl('journal')}</span><span class="text-ink-2">{journalN}</span>
              </button>
              </>}
              <div class="flex justify-between"><span class="text-muted">{tl('watching')}</span><span class="text-ink-2">{watchlist.length}</span></div>
              <div class="flex justify-between"><span class="text-muted">{tl('book')}</span>
                <span class={book ? 'text-success' : 'text-muted'}>{tl(book ? (IS_FAMILY_AI ? 'saved' : 'live') : 'demo')}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* the composer used to sit here, mid-pad, which meant scrolling to
          find it on a short viewport — it's docked at the bottom of the page
          now (Jeff 2026-08-07) */}
      {/* The legend used to be three static dots explaining the colours. It is
          now the filter itself — same information, but it does something, and
          it only offers lanes the pool actually has so a tap can never empty
          the pad. Refresh rotates a page forward through the pool and is
          hidden outright when everything already fits on screen. */}
      <div class="chat-suggestions">
        <div class="flex items-center gap-2 pb-1.5 flex-wrap">
          <span class="font-mono text-[9px] tracking-[0.16em] text-muted uppercase">{tl('start here')}</span>
          <div class="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => { setLane(null); setPage(0) }}
              class={`font-mono text-[9px] uppercase tracking-[0.1em] rounded-full px-1.5 py-0.5 border transition-colors ${lane === null ? 'border-accent/60 text-ink bg-accent-soft' : 'border-transparent text-muted hover:text-ink'}`}
            >{tl('all')}</button>
            {lanes.map((l) => (
              <button
                key={l.k}
                type="button"
                onClick={() => { setLane(lane === l.k ? null : l.k); setPage(0) }}
                class={`flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] rounded-full px-1.5 py-0.5 border transition-colors ${lane === l.k ? 'border-accent/60 text-ink bg-accent-soft' : 'border-transparent text-muted hover:text-ink'}`}
              >
                <span class={`w-1 h-1 rounded-full ${l.dot}`} />{tl(l.label)}
              </button>
            ))}
          </div>
          <button type="button" class="chat-suggestion-motion ml-auto text-muted hover:text-ink"
            onClick={()=>setSuggestionsPaused(v=>!v)} aria-pressed={suggestionsPaused}
            aria-label={tl(suggestionsPaused?'Resume suggestions':'Pause suggestions')}
            title={tl(suggestionsPaused?'Resume suggestions':'Pause suggestions')}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              {suggestionsPaused?<path d="m5 3 8 5-8 5z"/>:<path d="M4 3h3v10H4zm5 0h3v10H9z"/>}
            </svg>
          </button>
          {refreshable && (
            <button
              type="button"
              onClick={() => setPage((n) => n + 1)}
              class="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted hover:text-ink transition-colors"
              title={tl('show other prompts')}
              aria-label={tl('refresh prompts')}
            >
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 11a8 8 0 1 0-.6 4" /><path d="M20 4.5V11h-6" />
              </svg>
              {tl('refresh')}
            </button>
          )}
        </div>
        <SuggestionRows key={`${lane||'all'}-${page}`} items={shown} onPick={onPick}
          label={a=>promptLabel(a.t,names)} paused={suggestionsPaused}/>

      </div>
    </div>
  )
}


export function Chat() {
  const onWire = wireChatAvailable()
  const modelStorageKey = onWire ? 'chat_wire_model' : 'chat_model'
  const [models, setModels] = useState([])
  // transcript text size — like operator's +/-; composer deliberately excluded
  // (Jeff 2026-08-10). CSS zoom on the scroller scales the px-classed bubbles.
  const [chatZoom, setChatZoom] = useState(() => {
    const saved = Number(localStorage.getItem('chat_text_zoom'))
    return saved >= 0.7 && saved <= 2 ? saved : 1
  })
  const bumpChatZoom = (d) => {
    // Snapshot where the reader is while the old text size is still on
    // screen. The restore happens in the layout effect below, once preact
    // has reflowed the transcript at the new size.
    zoomAnchorRef.current = captureAnchor(scrollRef.current)
    setChatZoom((z) => {
      const next = Math.min(2, Math.max(0.7, Math.round((z + d) * 20) / 20))
      localStorage.setItem('chat_text_zoom', String(next))
      return next
    })
  }
  const [model, setModel] = useState(
    IS_FAMILY_AI ? 'family-sonnet' : localStorage.getItem(modelStorageKey) || (onWire ? 'agy-argon' : 'argon'),
  )
  const [effort, setEffort] = useState(IS_FAMILY_AI ? 'medium' : model==='agy-argon' ? 'low' : localStorage.getItem('chat_effort') || 'auto')
  const [spend, setSpend] = useState(null)
  const [history, setHistory] = useState(loadHistory)
  const [incognito,setIncognito]=useState(false)
  const incognitoRef=useRef(false)
  const [input, setInput] = useState(() => {
    const pre = sessionStorage.getItem('chat_prefill') || ''
    sessionStorage.removeItem('chat_prefill')
    return pre
  })
  const [pendingContext,setPendingContext]=useState(takeChatContext)
  const [pendingAction,setPendingAction]=useState(()=>takeChatAction(input))
  const actionRef=useRef(pendingAction)
  const preparingAction=useRef(false)
  const mounted=useRef(true)
  const cancelAction=()=>{actionRef.current=null;setPendingAction(null)}
  useEffect(()=>()=>{mounted.current=false;actionRef.current=null},[])
  useEffect(()=>{
    const receive=()=>{
      const question=sessionStorage.getItem('chat_prefill') || ''
      sessionStorage.removeItem('chat_prefill')
      if(question)setInput(question)
      entryDraft.current=true
      setPendingContext(takeChatContext());setAtHome(false)
      const action=takeChatAction(question)
      actionRef.current=action;setPendingAction(action)
    }
    window.addEventListener(CHAT_CONTEXT_EVENT,receive)
    return ()=>window.removeEventListener(CHAT_CONTEXT_EVENT,receive)
  },[])
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState([])
  const [activity, setActivity] = useState([])
  const [liveAnswer, setLiveAnswer] = useState('')
  const [usage, setUsage] = useState(null)   // live {in, out} token counter
  const usageRef = useRef(null)              // same value, readable at turn end
  const [error, setError] = useState(null)
  const [editingMessage,setEditingMessage] = useState(null)
  const [notice, setNotice] = useState(null)          // memory-tag confirmations
  const [drawer, setDrawer] = useState(null)          // 'sessions' | 'mem' | 'journal' | null
  const [memories, setMemories] = useState(loadMemories)
  const [journal, setJournal] = useState(loadJournal)
  const [jrFilter, setJrFilter] = useState('')
  const [initialHome]=useState(takeChatHomePending)
  const forcedHome=useRef(initialHome)
  const entryDraft=useRef(!!input || !!pendingContext)
  const [atHome, setAtHome] = useState(()=>forcedHome.current || (!entryDraft.current && !canResumeChat(history)))
  const [threads, setThreads] = useState([])
  const scrollRef = useRef(null)
  const zoomAnchorRef = useRef(null)
  const stickRef = useRef(true)      // autoscroll only while parked at the tail
  const abortRef = useRef(null)
  const inputRef = useRef(null)
  const historyRef = useRef(history)
  const activityRef = useRef([])
  const turnStartedRef = useRef(0)
  const turnModelRef = useRef({})
  const queuedRef = useRef([])
  const busyRef = useRef(false)
  const admissionRef = useRef(false)

  const splash = history.length === 0 || atHome

  // Launchpad fuel — live quotes, earnings proximity, next calendar event.
  // useQuotes polls, so the pad's suggestions refresh on their own.
  const watchlist = useWatchlist()
  const [bookRevision,bookTick]=useState(0)
  useEffect(()=>onPortfoliosChange(()=>bookTick(n=>n+1)),[])
  const quoteSymbols=IS_FAMILY_AI ? [...new Set([...watchlist,...(savedChatBook()?.positions || []).map(p=>p.symbol)])] : watchlist
  // the right rail is live even mid-thread, so the pad data polls always
  const quotes = useQuotes(quoteSymbols)
  const earnDays = useEarningsDays(quoteSymbols)
  const upcoming = mergedEvents(ECON_EVENTS, loadCatalysts(),
    new Date().toISOString().slice(0, 10), 60).slice(0, 6)

  // Boot: pull the shared brain from the wire (server wins), adopt a legacy
  // local conversation as thread #1, and list the threads for the rail.
  const sessionFailure = (err) => {
    setError(`${tl('session sync failed')}: ${String(err?.message || err)}`)
  }
  const [threadsReady,setThreadsReady]=useState(false)
  const threadRead=useRef(0)
  const refreshThreads = () => {const revision=++threadRead.current;return fetchThreadList().then(rows=>{if(revision===threadRead.current)setThreads(rows)}).catch(sessionFailure)}
  useEffect(() => onThreadsChange((mutation) => {
    if (mutation?.deletedId != null) {
      // A read started before deletion must not put the removed row back.
      threadRead.current += 1
      setThreads(rows => rows.filter(row => String(row.id) !== String(mutation.deletedId)))
    } else {
      refreshThreads()
    }
  }), [])
  useEffect(() => {
    const onSync = () => { if(!incognitoRef.current){setMemories(loadMemories());setJournal(loadJournal())} }
    if (chatstoreAvailable()) {
      window.addEventListener(CHATSTORE_SYNC_EVENT, onSync)
      syncNotes().catch(sessionFailure)
    }
    const bootThreads = async () => {
      try {
        await migrateLegacy()
        const messages = await hydrateActiveThread()
        historyRef.current = messages
        setHistory(messages)
        if(!forcedHome.current && !entryDraft.current) {
          const resume=canResumeChat(messages)
          setAtHome(!resume)
          if(resume)markChatInteraction()
        }
        await refreshThreads()
        if(mounted.current)setThreadsReady(true)
      } catch (err) {
        sessionFailure(err)
      }
    }
    bootThreads()
    return () => window.removeEventListener(CHATSTORE_SYNC_EVENT, onSync)
  }, [])

  const newThread = async () => {
    cancelAction()
    if (busyRef.current) return
    try {
      if(!incognitoRef.current)await startNewThread(historyRef.current)
      if(IS_FAMILY_AI){setModel('family-sonnet');setEffort('medium')}
      historyRef.current = []
      activityRef.current = []
      setHistory([])
      setActivity([])
      setLiveAnswer('')
      setError(null)
      setEditingMessage(null)
      setAtHome(true)
      setDrawer(null)
      await refreshThreads()
    } catch (err) {
      sessionFailure(err)
    }
  }

  const toggleIncognito=async()=>{
    if(busyRef.current || admissionRef.current || !threadsReady)return
    cancelAction();busyRef.current=true;setBusy(true)
    try {
      // Park a normal conversation before entering. Temporary text never
      // reaches the thread store, including when leaving or starting again.
      if(!incognitoRef.current)await startNewThread(historyRef.current)
      if(!mounted.current)return
      const next=!incognitoRef.current
      incognitoRef.current=next;setIncognito(next)
      historyRef.current=[];activityRef.current=[]
      setHistory([]);setActivity([]);setLiveAnswer('');setError(null);setNotice(null)
      setEditingMessage(null);setDrawer(null);setPendingContext(null);clearComposer();setAtHome(true)
      setMemories(next ? [] : loadMemories());setJournal(next ? [] : loadJournal())
      refreshThreads()
    } catch(err){if(mounted.current)sessionFailure(err)}
    finally {busyRef.current=false;if(mounted.current)setBusy(false)}
  }

  const switchThread = async (id) => {
    cancelAction()
    markChatInteraction()
    if (busyRef.current || id === currentThreadId()) {
      setDrawer(null)
      setAtHome(false)
      return
    }
    try {
      const previous=incognitoRef.current ? [] : historyRef.current
      if(incognitoRef.current){
        incognitoRef.current=false;setIncognito(false);historyRef.current=[];setHistory([])
        setPendingContext(null);clearComposer();setMemories(loadMemories());setJournal(loadJournal())
      }
      const messages = await openThread(id, previous)
      historyRef.current = messages
      setHistory(messages)
      activityRef.current = []
      setActivity([])
      setLiveAnswer('')
      setError(null)
      setEditingMessage(null)
      setAtHome(false)
      setDrawer(null)
      await refreshThreads()
    } catch (err) {
      sessionFailure(err)
      await refreshThreads()
    }
  }

  const deleteSession = async (id) => {
    if (busyRef.current) return
    try {
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
    } catch (err) {
      sessionFailure(err)
    }
  }

  useEffect(() => {
    const failed = event => sessionFailure(event.detail)
    const refresh = () => {
      if (document.visibilityState === 'hidden' || busyRef.current || incognitoRef.current || !chatstoreAvailable()) return
      syncNotes().catch(sessionFailure)
      refreshThreads()
    }
    window.addEventListener(CHATSTORE_ERROR_EVENT, failed)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener(CHATSTORE_ERROR_EVENT, failed)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  // Warm case: already on the chat page when AI Chat is pressed again.
  useEffect(() => {
    const home = () => { cancelAction();forcedHome.current=true; takeChatHomePending(); setAtHome(true); setDrawer(null) }
    const returning = () => {
      forcedHome.current=false
      const resume=canResumeChat(historyRef.current)
      setAtHome(!resume);setDrawer(null)
      if(resume)markChatInteraction()
    }
    window.addEventListener(CHAT_HOME_EVENT, home)
    window.addEventListener(CHAT_RETURN_EVENT, returning)
    return () => {window.removeEventListener(CHAT_HOME_EVENT, home);window.removeEventListener(CHAT_RETURN_EVENT, returning)}
  }, [])

  useEffect(() => {
    const load = onWire
      ? fetchWireChatModels()
      : fetchChatModels().then((data) => data.models)
    load.then((available) => {
      const liveModels=pickerModels(available,IS_PRIVATE_BUILD)
      setModels(liveModels)
      const current = liveModels.find((candidate) => candidate.key === model)
      if (!current) {
        const fallback = liveModels[0]?.key || (onWire ? 'agy-argon' : 'argon')
        setModel(fallback)
        localStorage.setItem(modelStorageKey, fallback)
        const info = liveModels[0]
        if (onWire) {
          const nextEffort = info?.fixed_effort || info?.default_effort || info?.efforts?.[0] || ''
          setEffort(nextEffort)
          localStorage.setItem('chat_effort', nextEffort)
        }
      } else if (onWire) {
        const choices = current.efforts || []
        const nextEffort = choices.includes(effort)
          ? effort
          : (current.fixed_effort || current.default_effort || choices[0] || '')
        setEffort(nextEffort)
        localStorage.setItem('chat_effort', nextEffort)
      }
    }).catch(err => {cancelAction();setError(tl(err.message || String(err)))})
    if (onWire) return
    fetchSpend().then(setSpend).catch(() => {})
  }, [])

  // follow the stream only when the user is already at the tail — scrolling
  // up to reread mustn't get yanked back down on every delta
  useLayoutEffect(() => {
    if (stickRef.current) scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [history,liveAnswer,activity,usage])

  // A text-size change reflows every bubble, so the transcript slides out
  // from under the reader unless we put them back. useLayoutEffect, not
  // useEffect: this has to land before the browser paints, or the jump is
  // visible as a flicker.
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current
    if (!anchor) return
    zoomAnchorRef.current = null
    restoreAnchor(scrollRef.current, anchor)
  }, [chatZoom])

  const clearComposer = () => {
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  const replaceHistory = (next, persist = false) => {
    historyRef.current = next
    setHistory(next)
    if (persist && !incognitoRef.current) {
      saveHistory(next)
    }
  }

  const drainFollowUps = () => {
    const batch = queuedRef.current
    if (!batch.length) return []
    queuedRef.current = []
    setQueued([])
    return batch.map(({ text, model: queuedModel, ts, context }) => ({
      role: 'user', content: text, ts, model: queuedModel, context,
    }))
  }

  const replaceActivity = (next) => {
    activityRef.current = next
    setActivity(next)
  }

  const updateActivity = (fn) => replaceActivity(fn(activityRef.current))

  const runTurn = async ({ text, model: runModel, effort: runEffort, ts, context }) => {
    const temporary=incognitoRef.current
    setError(null)
    setNotice(null)
    setLiveAnswer('')
    setUsage(null)
    usageRef.current = null
    turnStartedRef.current = Date.now()
    turnModelRef.current = { model: runModel, label: models.find((m) => m.key === runModel)?.label || runModel, effort: runEffort }
    // context assembly is table stakes, not a trace step worth narrating
    // (Jeff 2026-08-06: "it says read live market context every single time")
    replaceActivity([{
      key: 'context', kind: 'context', label: 'Thinking',
      verb: 'Thinking', status: 'running', startedAt: turnStartedRef.current,
    }])

    const base = [...historyRef.current, {
      role: 'user', content: text, ts: ts || Date.now(), model: runModel, context,
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
    if (IS_FAMILY_AI && !temporary) await syncNotes().catch(sessionFailure)
    const selected = models.find(candidate => candidate.key === runModel)
    let system = baseSystem({modelLabel:selected?.label, effort:selected?.fixed_effort || runEffort})
    try {
      system += '\n\n' + await buildChatContext(text,{temporary})
    } catch { /* context is best-effort — a bare prompt still answers */ }
    if(temporary)system+='\n\n'+TEMPORARY_CHAT_PROMPT
    system = applyLanguagePreference(system, getLocale())

    const traceEvent = (event) => {
      const now = Date.now()
      if (event.type === 'model') {
        turnModelRef.current = {model:event.key,label:event.label,effort:event.effort}
        if (event.fallback_from) setNotice({kind:'model_fallback',model:fullModelName(event.label)})
        return
      }
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
      if (event.type === 'usage') {
        // Update synchronously: a one-frame reply can finish before a state updater runs.
        const next=mergeTurnUsage(usageRef.current,event.round,event.usage)
        usageRef.current=next
        setUsage(next)
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
              commentary: event.commentary ? tracePrintout(event.commentary) : undefined,
            }
          : step))
        return
      }
      if (event.type === 'tool_start') {
        const call = { name: event.name, args: event.args }
        updateActivity((steps) => [...steps, {
          key: `tool-${event.id}`, kind: 'tool', name:event.name, label: toolRunLabel(call),
          verb: toolRunLabel(call), input: event.args && Object.keys(event.args).length ? tracePrintout(event.args, 4000) : '',
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
              output: event.type === 'tool_done' ? tracePrintout(event.result) : step.output,
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
          const r = applyMemoryTags(m.content,{persist:!temporary})
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
          // Carry the final token count onto the message. Without this the
          // counter vanished the instant the turn finished, since only the
          // LIVE trace is handed the usage prop — so you could watch a turn
          // cost 50k and then never see what it cost again.
          ...stamped[finalIndex], trace, traceStartedAt: turnStartedRef.current,
          traceUsage: usageRef.current,
          traceEndedAt: completedAt, model: turnModelRef.current.model, modelLabel: turnModelRef.current.label, effort: turnModelRef.current.effort,
        }
      }
      if (notes.length) {
        setNotice({kind:'memory',items:notes})
        setMemories(loadMemories())
      }
      const done = [...base, ...stamped]
      replaceHistory(done, !temporary)
      setLiveAnswer('')
      if (finalIndex >= 0) replaceActivity([])
    }

    try {
      abortRef.current = new AbortController()
      await runAgentic({
        temporary,
        signal: abortRef.current.signal,
        model: runModel,
        effort: runEffort,
        system,
        messages: trimHistory(base, MODEL_WINDOW),
        initialTools: [...(IS_FAMILY_AI ? [{name:'get_portfolios',args:{}}] : []),...contextualReadTools(context)],
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
      if (err?.name !== 'AbortError') {
        const message=String(err.message || err)
        const failure=err.status===429?{message:tl(message),status:429,code:err.code,retryAt:err.retryAt||Date.now()+(err.retryAfter||0)*1000}:tl(message)
        setError(failure)
        base[base.length-1]={...base.at(-1),failure}
      }
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

  const replay = async (index,text) => {
    if(busyRef.current)return
    const branch=replayRequest(historyRef.current,index,text,{model,effort})
    busyRef.current=true;setBusy(true)
    try {
      if(!incognitoRef.current)await startNewThread(historyRef.current)
      replaceHistory(branch.prefix)
      replaceActivity([]);setLiveAnswer('');setError(null);setEditingMessage(null)
      setAtHome(false);markChatInteraction()
      await runTurns(branch.request)
      if(!incognitoRef.current)await flushActiveHistory(historyRef.current)
      await refreshThreads()
    } catch(err) { sessionFailure(err) }
    finally {busyRef.current=false;setBusy(false)}
  }

  // Claim before awaiting storage. Hydration must finish first or its old
  // transcript can overwrite the generated answer. Each action starts a new conversation.
  useEffect(()=>{
    if(!pendingAction || !threadsReady || busy || busyRef.current || !models.some(m=>m.key===model))return
    const action=pendingAction,context=pendingContext
    setPendingAction(null)
    busyRef.current=true;preparingAction.current=true;setBusy(true)
    const start=async()=>{
      try {
        if(!incognitoRef.current)await startNewThread(historyRef.current)
        historyRef.current=[]
        if(!mounted.current)return
        replaceHistory([]);replaceActivity([]);setLiveAnswer('');setError(null);setEditingMessage(null)
        if(actionRef.current!==action)return
        actionRef.current=null
        setPendingContext(null);clearComposer();setDrawer(null)
        setAtHome(false);markChatInteraction()
        preparingAction.current=false
        await runTurns({text:action.question,context,model,effort,ts:Date.now()})
        await refreshThreads()
      } catch(err) {if(mounted.current)sessionFailure(err)}
      finally {
        preparingAction.current=false;busyRef.current=false
        if(mounted.current)setBusy(false)
      }
    }
    start()
  },[pendingAction,threadsReady,busy,models,model,effort])

  const send = async (e) => {
    e.preventDefault()
    if(preparingAction.current)return
    cancelAction()
    const text = input.trim()
    if (!text) return
    if (admissionRef.current) return
    if (onWire && !IS_FAMILY_AI && !busyRef.current) {
      admissionRef.current=true
      try {
        const available=pickerModels(await fetchWireChatModels(),IS_PRIVATE_BUILD)
        setModels(available)
        if(available.find(item=>item.key===model)?.busy){setError(tl('Model unavailable; please select another model.'));return}
      } catch(err){setError(tl(err.message||String(err)));return}
      finally {admissionRef.current=false}
    }
    const item = { text, model, effort, ts: Date.now(),context:pendingContext }
    setPendingContext(null)
    clearComposer()
    markChatInteraction()
    setAtHome(false)   // asking a question is how you leave the launchpad
    if (busyRef.current) {
      queuedRef.current = [...queuedRef.current, item]
      setQueued([...queuedRef.current])
      return
    }
    runTurns(item)
  }

  const stop = () => {
    cancelAction()
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
        setNotice(tl('transcribing…'))
        try {
          const resp = await fetch(`${wireServiceUrl().replace(/\/$/, '')}/api/transcribe`, {
            method: 'POST', headers: { 'Content-Type': blob.type }, body: blob,
          })
          const out = await resp.json()
          if (!out.ok) throw new Error(out.error || 'transcribe failed')
          setNotice(null)
          setInput((cur) => (cur ? `${cur} ` : '') + out.text)
          inputRef.current?.focus()
        } catch (err) {
          setNotice(null)
          // {err} pattern key: tl falls back to the English template, so the
          // substitution works in both locales without a parameterized entry
          setError(tl('transcription failed: {err}').replace('{err}', err.message || err))
        }
      }
      mr.start()
      setRec(mr)
    } catch {
      setError(tl('microphone unavailable'))
    }
  }

  const clear = async () => {
    if(busyRef.current)return
    try {
      if(!incognitoRef.current)await deleteActiveThread()
      if(IS_FAMILY_AI){setModel('family-sonnet');setEffort('medium')}
      replaceHistory([]);replaceActivity([]);setLiveAnswer('')
      setError(null);setEditingMessage(null);setAtHome(true);setDrawer(null)
      await refreshThreads()
    } catch(err) {sessionFailure(err)}
  }

  // Tool results by call id, for chip status/tooltips.
  const results = new Map(history.filter((m) => m.role === 'tool').map((m) => [m.id, m.content]))
  const selectedModel = models.find((candidate) => candidate.key === model)
  const effortLevels = onWire
    ? (selectedModel?.efforts || [])
    : ['auto', 'off', 'low', 'medium', 'high']

  const refreshModelAvailability = () => {
    if(onWire)fetchWireChatModels().then(items=>setModels(pickerModels(items,IS_PRIVATE_BUILD))).catch(()=>{})
  }
  useEffect(()=>{
    const visible=()=>{if(document.visibilityState==='visible'&&!busyRef.current)refreshModelAvailability()}
    const timer=onWire&&!IS_FAMILY_AI?setInterval(visible,3000):null
    window.addEventListener('focus',visible)
    document.addEventListener('visibilitychange',visible)
    return ()=>{clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible)}
  },[onWire])

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
      setEffort(info?.fixed_effort || '')
      localStorage.setItem('chat_effort', info?.fixed_effort || '')
    }
  }

  const composerButton = "shrink-0 w-8 h-8 box-border grid place-items-center rounded-md border transition-colors"
  const composer = (
      <form onSubmit={send} class="max-w-[46rem] w-full mx-auto pt-2">
        {incognito && <p data-incognito-notice class="mb-2 px-1 font-anth text-[10px] text-muted">{tl('Temporary chat. History is not saved. Memories and notes are off.')}</p>}
        {pendingContext && <div data-chat-context class="mb-2 flex items-center gap-2 rounded-md border border-line px-2 py-1 font-anth text-[10px] text-muted">
          <span class="min-w-0 flex-1 truncate">{pendingContext.label}</span>
          <button type="button" aria-label={tl('Remove')} onClick={()=>setPendingContext(null)}>✕</button>
        </div>}
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
              cancelAction()
              setInput(e.currentTarget.value)
              autoGrow(e.currentTarget)
            }}
            onKeyDown={(e) => {
              if (e.isComposing || e.keyCode===229) return
              if (submitTextKey(e)) { e.preventDefault(); send(e); return }
              if (e.key === 'ArrowUp' && !input) {
                const lastQ = [...historyRef.current].reverse().find((m) => m.role === 'user')
                if (lastQ) { e.preventDefault(); setInput(lastQ.content); autoGrow(e.currentTarget) }
              }
            }}
            placeholder={busy ? tt('chat.follow_up') : tt('chat.placeholder')}
            class="flex-1 bg-transparent resize-none outline-none text-[13.5px] leading-[21px] py-[5.5px] text-ink placeholder:text-muted max-h-40 font-anth"
          />
          {onWire && !IS_FAMILY_AI && (
            <button
              type="button"
              onClick={mic}
              title={tl(rec ? 'stop recording' : 'dictate (whisper on the wire)')}
              class={`${composerButton} ${
                rec ? 'border-danger text-danger animate-pulse' : 'border-line-2 text-muted hover:text-ink'}`}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
            </button>
          )}
          {/* ONE button that morphs: send at rest, stop while streaming —
              not a second control spawning beside it (Jeff 2026-08-10).
              Enter still queues a follow-up mid-stream via the form submit. */}
          {busy ? (
            <button
              type="button"
              onClick={stop}
              title={tl('stop generating')}
              class={`${composerButton} border-transparent bg-danger text-white hover:bg-danger/80`}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || selectedModel?.busy}
              title={`${tl('send')}  ⏎`}
              class="shrink-0 w-8 h-8 grid place-items-center rounded-md bg-white text-black disabled:bg-surface-3 disabled:text-muted transition-colors"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
            </button>
          )}
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
              onPointerDown={refreshModelAvailability}
              onFocus={refreshModelAvailability}
              class="appearance-none bg-surface-2 border border-line rounded-md pl-2 pr-5 py-[3px] font-anth text-[10.5px] text-ink-2 outline-none cursor-pointer hover:border-line-2 focus:border-accent/70 transition-colors"
            >
              {(() => {
                const live = models.length ? models : [{ key: model, label: model }]
                const groups=modelGroups(live,IS_PRIVATE_BUILD)
                return groups.map((g) => g.name ? (
                  <optgroup key={g.name} label={`— ${g.name} —`}>
                    {g.items.map((m) => <option key={m.key} value={m.key} disabled={m.busy || m.available === false}>{m.label}</option>)}
                  </optgroup>
                ) : g.items.map(m=><option key={m.key} value={m.key} disabled={m.busy || m.available===false}>{m.label}</option>))
              })()}
            </select>
            <span class="pointer-events-none absolute right-1.5 text-[7px] leading-none text-muted">▾</span>
          </span>
          <span class="flex items-center gap-0.5 bg-surface-2 border border-line rounded-md px-0.5 py-px" title={tl('transcript text size')}>
            <button type="button" onClick={() => bumpChatZoom(-0.1)}
              class="px-1.5 py-px font-mono text-[10px] rounded text-muted hover:text-ink hover:bg-surface-3">−</button>
            <button type="button" onClick={() => bumpChatZoom(0.1)}
              class="px-1.5 py-px font-mono text-[10px] rounded text-muted hover:text-ink hover:bg-surface-3">+</button>
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
                  {tl(lv)}
                </button>
              ))}
            </span>
          )}
          {onWire && selectedModel?.fixed_effort && (
            <span class="font-mono text-[9px] text-muted border border-line rounded-md px-1.5 py-px"
                  title={tl('fixed thinking tier')}>
              {tl('thinking')}
            </span>
          )}
          <span class="composer-shortcuts ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <span class="inline-flex items-center gap-1"><kbd class="text-ink-2">↵</kbd> {tl('send')}</span>
            <span class="desktop-shortcut inline-flex items-center gap-1">
              <kbd class="text-ink-2">⇧</kbd><span aria-hidden="true">+</span><kbd class="text-ink-2">↵</kbd>
              <span>{tl('newline')}</span>
            </span>
            <span class="desktop-shortcut inline-flex items-center gap-1"><kbd class="text-ink-2">↑</kbd> {tl('recall')}</span>
            <span class="inline-flex items-center gap-1 max-sm:hidden">
              <kbd class="text-ink-2">⌘/Ctrl</kbd><span aria-hidden="true">+</span><kbd class="text-ink-2">K</kbd>
              <span>{tl('commands')}</span>
            </span>
            {queued.length > 0 && <span class="text-accent">{tt('chat.queued',{n:queued.length})}</span>}
            {!onWire && <SpendMeter spend={spend} />}
          </span>
        </div>
      </form>
  )

  const liveThreads=incognito ? threads : liveThreadList(threads,currentThreadId(),history,{streaming:!!liveAnswer})
  const rail=chatRailData({symbols:quoteSymbols,quotes,earnDays,events:upcoming})
  const railMovers=rail.movers


  return (
    <div class="flex-1 flex min-h-0 min-w-0">
    <div class="relative flex-1 flex flex-col p-3 pt-16 min-h-0 min-w-0 select-text"
      onPointerDownCapture={()=>{if(!atHome && historyRef.current.length)markChatInteraction()}}
      onKeyDownCapture={()=>{if(!atHome && historyRef.current.length)markChatInteraction()}}
      onInputCapture={()=>{if(!atHome && historyRef.current.length)markChatInteraction()}}
      onScrollCapture={()=>{if(!atHome && historyRef.current.length)markChatInteraction()}}>
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
        {/* Wireframe bubble with two text rules — same stroke language as the
            tool rail (1.7, round joins) so the header reads as one set. Sized
            to the cap height of the 17px wordmark beside it. */}
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
             class="shrink-0 text-accent" fill="none" stroke="currentColor"
             stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 13.2a3.3 3.3 0 0 1-3.3 3.3H10l-4.2 3.2a.5.5 0 0 1-.8-.4v-2.8
                   A3.3 3.3 0 0 1 4 13.2V7.3A3.3 3.3 0 0 1 7.3 4h9.4A3.3 3.3 0 0 1 20 7.3z" />
          <path d="M8.4 9.2h7.2M8.4 12.2h4.4" />
        </svg>
        <h1 class="font-bold text-[17px] leading-tight text-ink" style="font-family: var(--font-sans)">{tl('AI Chat')}</h1>
        <span class={`w-1.5 h-1.5 rounded-full ${models.length ? 'bg-[#3fb950]' : 'bg-muted animate-pulse'}`}
              title={tl(onWire ? 'online — private wire' : 'online — public proxy')} />
        <button type="button" data-incognito-toggle aria-pressed={incognito} disabled={busy || !threadsReady}
          onClick={toggleIncognito} aria-label={tl('Incognito')} title={tl(incognito ? 'End incognito chat' : 'Start incognito chat')}
          class={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-anth text-[10px] whitespace-nowrap disabled:opacity-40 ${incognito ? 'border-accent/50 text-accent bg-accent-soft' : 'border-line text-muted hover:text-ink'}`}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/><path d="m3 3 18 18"/></svg>
          <span class={incognito ? '' : 'max-sm:sr-only'}>{tl('Incognito')}</span>
        </button>
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
            {liveThreads.length > 0 && <span class="absolute -top-1 -right-1 min-w-[13px] h-[13px] px-0.5 grid place-items-center rounded-full bg-surface-3 border border-line-2 font-mono text-[7.5px] text-ink-2 leading-none">{liveThreads.length}</span>}
          </button>
          {!incognito && <>
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
          </>}
          {history.length > 0 && (
            <button onClick={() => exportChat(history)} class="w-6 h-6 grid place-items-center rounded-md text-muted hover:text-ink hover:bg-surface-2"
              title={tl('download transcript')}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"/></svg>
            </button>
          )}
          {history.length > 0 && (
            <ConversationDelete onDelete={clear} disabled={busy} label={tl('clear')} />
          )}
        </div>

      {drawer === 'sessions' && (
        <Overlay onClose={() => setDrawer(null)} label={tl('Chat sessions')}
          class="max-w-xl w-full bg-surface-1 border border-line rounded-2xl px-4 py-3 max-h-[72vh] overflow-y-auto">
          <div class="flex items-center gap-3 pb-3 border-b border-line">
            <div class="min-w-0 flex-1">
              <div class="font-anth text-[15px] font-semibold text-ink">{tl('Chat sessions')}</div>
              <div class="font-anth text-[11px] text-muted">
                {tl('Saved automatically. Open any session without replacing this one.').split(tl('current conversation')).map((part, index) => (
                  <span key={index}>{index > 0 && <span class="whitespace-nowrap">{tl('current conversation')}</span>}{part}</span>
                ))}
              </div>
            </div>
            <button type="button" disabled={busy} onClick={newThread}
              class="ml-auto shrink-0 whitespace-nowrap font-anth text-[11px] text-accent border border-accent/40 rounded-md px-2 py-1 hover:bg-accent-soft disabled:opacity-40">
              {tl('+ new session')}
            </button>
            <button class="chat-drawer-close shrink-0 text-muted hover:text-ink" onClick={() => setDrawer(null)} aria-label={tl('close')}>✕</button>
          </div>
          <div class="py-2 flex flex-col gap-1">
            {liveThreads.length === 0 && <div class="font-anth text-[12px] text-muted py-1">{tl('no saved sessions yet')}</div>}
            {liveThreads.map((thread) => (
              <SessionRow key={thread.id} thread={thread} busy={busy}
                active={thread.id === currentThreadId()}
                onOpen={() => switchThread(thread.id)}
                onDelete={() => deleteSession(thread.id)} />
            ))}
          </div>
        </Overlay>
      )}

      {!incognito && drawer === 'mem' && (
        <Overlay onClose={() => setDrawer(null)} label={tl('Memories')}
          class="max-w-xl w-full bg-surface-1 border border-line rounded-2xl px-4 py-3 max-h-[72vh] overflow-y-auto">
          <div class="flex items-start gap-3 pb-1">
            <div class="font-anth text-[15px] font-semibold text-ink">{tl('Memories')}</div>
            <button class="chat-drawer-close ml-auto text-muted hover:text-ink" onClick={() => setDrawer(null)} aria-label={tl('close')}>✕</button>
          </div>
          <MemoryComposer memories={memories} onApplied={() => setMemories(loadMemories())}>
          {memories.length === 0 && (
            <div class="font-anth text-[12px] text-muted py-1">{tl('nothing saved yet')}</div>
          )}
          {memories.map((m) => (
            <NoteRow key={m.id} id={m.id} text={m.text}
              meta={new Date(m.ts).toISOString().slice(0, 10)}
              onSave={(t) => { editMemory(m.id, t); setMemories(loadMemories()) }}
              onDelete={() => { removeMemory(m.id); setMemories(loadMemories()) }} />
          ))}
          </MemoryComposer>
        </Overlay>
      )}

      {!incognito && drawer === 'journal' && (
        <Overlay onClose={() => setDrawer(null)} label={tl('Trade journal')}
          class="max-w-xl w-full bg-surface-1 border border-line rounded-2xl px-4 py-3 max-h-[72vh] overflow-y-auto">
          <div class="flex items-center gap-2 pb-3 border-b border-line">
            <div><div class="font-anth text-[15px] font-semibold text-ink">{tl('Trade journal')}</div>
              <div class="font-anth text-[11px] text-muted">{tl('Your decisions, rationale, and notes—not AI settings.')}</div></div>
            <input value={jrFilter} onInput={(e) => setJrFilter(e.currentTarget.value)}
              placeholder={`${tl('Search')}…`}
              class="ml-auto bg-surface-2 border border-line rounded-md px-2 py-0.5 font-mono text-[10px] text-ink outline-none focus:border-accent/60 w-32 placeholder:text-muted" />
            <button class="chat-drawer-close text-muted hover:text-ink" onClick={() => setDrawer(null)} aria-label={tl('close')}>✕</button>
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
        </Overlay>
      )}

      {/* safe centering: plain justify-center clips the top of the launchpad
          when it outgrows the viewport (phone), because overflow only scrolls
          toward the end edge. */}
      {splash ? (
        <>
        <div class="flex-1 min-h-0 overflow-y-auto flex flex-col">
          <Launchpad
            onWire={onWire}
            temporary={incognito}
            watchlist={watchlist}
            bookRevision={bookRevision}
            quotes={quotes}
            earnDays={earnDays}
            events={upcoming}
            threadLen={history.length}
            onResume={() => {markChatInteraction();setAtHome(false)}}
            onPick={(text) => { setInput(text); inputRef.current?.focus() }}
            memN={memories.length}
            journalN={journal.length}
            journal={journal}
            onOpenMem={() => { setMemories(loadMemories()); setDrawer('mem') }}
            onOpenJournal={() => { setJournal(loadJournal()); setDrawer('journal') }}
          />
        </div>
        {error && <div class="max-w-[46rem] w-full mx-auto"><ChatFailure error={error} /></div>}
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
            style={{ fontSize: `${(13.5 * chatZoom).toFixed(2)}px`, overflowAnchor: 'none' }}
          >
        {history.map((m, i) => {
          if (m.role === 'tool') return null
          if (m.role === 'assistant' && m.toolCalls?.length) {
            if (m.traceHidden || hasTurnActivity(history, i, activity)) return null
            return (
              <div key={i} class="chat-message-enter self-start flex flex-col gap-1 max-w-[92%]">
                {m.content && (
                  <div class="chat-message-copy rounded-xl border px-3 py-2 font-anth text-[0.96em] leading-relaxed bg-surface-1 border-line text-ink">
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
                  <ActivityTrace steps={traceToolDetails(m.trace, history, i)} startedAt={m.traceStartedAt} usage={m.traceUsage} />
                )}
                <div class="group self-start max-w-[92%] flex items-center gap-1.5">
                  <div class="chat-message-copy chat-assistant-bubble min-w-0 rounded-2xl border px-3.5 py-2.5 text-[1em] leading-relaxed bg-surface-1 border-line text-ink font-anth">
                    <MdLite text={m.content} />
                  </div>
                  <div class="chat-assistant-actions shrink-0 flex flex-nowrap gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(m.content)}
                        title={tl('copy')} aria-label={tl('copy')}
                        class="w-6 h-6 shrink-0 grid place-items-center rounded-md text-muted hover:text-ink hover:bg-surface-2"
                      >
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4"/></svg>
                      </button>
                      {!incognito && m.content.trim().length>=160 && <button
                        type="button"
                        onClick={() => {
                          // CLI `journal save` parity: the exchange, not just the answer
                          const q = history[i - 1]?.role === 'user' ? history[i - 1].content : ''
                          const e = addJournalEntry(`${q ? `Q: ${q}\n\n` : ''}A: ${m.content}`)
                          setJournal(loadJournal())
                          setNotice(e ? {kind:'journal'} : null)
                        }}
                        title={tl('save exchange to journal')} aria-label={tl('save exchange to journal')}
                        class="w-6 h-6 shrink-0 grid place-items-center rounded-md text-muted hover:text-accent hover:bg-surface-2"
                      >
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>
                      </button>}
                    </div>
                </div>
                <ChatFooter model={m.modelLabel || models.find((item) => item.key === m.model)?.label || m.model}
                  effort={m.effort} usage={m.traceUsage} startedAt={m.traceStartedAt}
                  endedAt={m.traceEndedAt || (m.trace?.length ? Math.max(...m.trace.map((s) => s.endedAt || s.startedAt || 0)) : m.ts)} />
              </div>
            )
          }
          return (
            <div key={i} class="chat-user-message chat-message-enter self-end max-w-[85%] flex flex-col items-end gap-1">
              {editingMessage?.index===i ? <form class="w-full" onSubmit={e=>{e.preventDefault();replay(i,editingMessage.text)}}>
                <textarea aria-label={getLocale()==='zh'?'编辑消息':'Edit message'} class="chat-edit-message w-full min-h-24 rounded-xl border border-accent bg-surface-2 p-3 font-anth text-ink" value={editingMessage.text}
                  onInput={e=>setEditingMessage({index:i,text:e.currentTarget.value})}
                  onKeyDown={e=>{if(submitTextKey(e,'modified')){e.preventDefault();replay(i,editingMessage.text)}}} />
                <div class="flex justify-end gap-2 text-[11px]">
                  <button type="button" onClick={()=>setEditingMessage(null)}>{getLocale()==='zh'?'取消':'Cancel'}</button>
                  <button type="submit" disabled={busy||!editingMessage.text.trim()} class="text-accent">{getLocale()==='zh'?'编辑并重新发送':'Edit and resend'}</button>
                </div>
              </form> : <>
                <div class="chat-message-copy rounded-2xl px-3.5 py-2.5 text-[1em] leading-relaxed whitespace-pre-wrap bg-accent-soft border border-accent/40 text-ink font-anth">{m.content}</div>
                <div class="chat-user-actions">
                  <button type="button" disabled={busy} onClick={()=>setEditingMessage({index:i,text:m.content})} aria-label={getLocale()==='zh'?'编辑':'Edit'} title={getLocale()==='zh'?'编辑':'Edit'}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>
                  </button>
                  <button type="button" disabled={busy} onClick={()=>replay(i,m.content)} aria-label={getLocale()==='zh'?'重试':'Retry'} title={getLocale()==='zh'?'重试':'Retry'}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.6"/></svg>
                  </button>
                </div>
                {m.failure && <ChatFailure error={m.failure} busy={busy} onRetry={()=>replay(i,m.content)} />}
              </>}
            </div>
          )
        })}
        {activity.length > 0 && (
          <ActivityTrace steps={activity} busy={busy} startedAt={turnStartedRef.current} usage={usage} />
        )}
        {liveAnswer && (
          <div class="chat-message-copy chat-assistant-bubble chat-message-live self-start max-w-[92%] rounded-2xl border px-3.5 py-2.5 text-[1em] leading-relaxed bg-surface-1 border-line text-ink font-anth">
            <MdLite text={liveAnswer} />
          </div>
        )}
        {activity.length > 0 && <ChatFooter model={turnModelRef.current.label}
          effort={turnModelRef.current.effort} usage={usage} startedAt={turnStartedRef.current}
          busy={busy} endedAt={busy ? undefined : Math.max(...activity.map((s) => s.endedAt || s.startedAt || 0))} />}
        {queued.map((item, i) => (
          <div key={`${item.ts}-${i}`} class="self-end max-w-[85%] flex flex-col items-end gap-0.5">
            <div class="rounded-2xl px-3.5 py-2.5 text-[1em] leading-relaxed whitespace-pre-wrap bg-accent-soft/60 border border-accent/25 text-ink font-anth">
              {item.text}
            </div>
            <span class="font-mono text-[9px] text-muted pr-1">{tl('queued follow-up')}</span>
          </div>
        ))}
        <ChatNotice notice={notice} onMemory={()=>{setMemories(loadMemories());setDrawer('mem')}} onJournal={()=>{setJournal(loadJournal());setDrawer('journal')}} />
        {error && !history.some(m=>(m.failure?.message||m.failure)===(error?.message||error)) && <ChatFailure error={error} />}
          </div>
          {composer}
        </>
      )}
    </div>

    {/* Keep useful context on the right without turning the chat into a CRUD
        dashboard. Memory and journal live behind the compact Library row. */}
    <aside class="chat-context-rail hidden min-[1160px]:flex w-[228px] shrink-0 flex-col gap-2 p-3 pl-0 overflow-y-auto min-h-0">
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

        </div>
      </section>

      <section class="chat-rail-section bg-surface-1 border border-line rounded-xl overflow-hidden shrink-0">
          <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2 flex items-baseline gap-1.5">
            <h2 class="font-anth font-bold text-[10px] tracking-wider text-accent uppercase">{tl('sessions')}</h2>
            <span class="font-mono text-[9px] text-muted">{liveThreads.length}</span>
            <button onClick={newThread} disabled={busy} title={tl('new session')}
              class="ml-auto font-mono text-[10px] text-muted hover:text-accent">{tl('+ new')}</button>
          </header>
          <div class="px-1 py-1 max-h-[34vh] overflow-y-auto">
            {liveThreads.length === 0 && <div class="px-1.5 font-anth text-[11px] text-muted py-0.5">{tl('no saved threads')}</div>}
            {liveThreads.map((t) => (
              <div key={t.id} class={`group flex items-center gap-1.5 px-1.5 py-0.5 rounded-md ${t.id === currentThreadId() ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                <button onClick={() => switchThread(t.id)} class="flex-1 min-w-0 text-left">
                  <span class={`block truncate font-anth text-[11px] ${t.id === currentThreadId() ? 'text-accent' : 'text-ink-2'}`}>{t.title || tl('untitled')}</span>
                </button>
                <span class="font-mono text-[8.5px] text-muted shrink-0">{t.n}</span>
                <ConversationDelete compact onDelete={() => deleteSession(t.id)} disabled={busy} />
              </div>
            ))}
          </div>
      </section>

      {rail.earnings.length>0 && <section data-chat-rail="earnings" class="chat-rail-section bg-surface-1 border border-line rounded-xl overflow-hidden shrink-0">
        <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2 flex items-baseline justify-between">
          <h2 class="font-anth font-bold text-[10px] tracking-wider text-accent uppercase">{tl('Earnings')}</h2>
          <a href="#/markets/earnings" class="text-[9px] text-muted hover:text-accent">{getLocale()==='zh'?'全部':'All'}</a>
        </header>
        <div class="px-2.5 py-1 font-mono text-[10.5px]">
          {rail.earnings.map(({symbol,days})=><a key={symbol} href={`#/research/${symbol.toLowerCase()}/earnings`} class="flex items-baseline justify-between gap-2 py-0.5 hover:no-underline">
            <span class="text-ink-2 font-tick">{symbol}</span>
            <span class={earningsTone(days)}>{days===0?tl('today'):tt('common.days',{days})}</span>
          </a>)}
        </div>
      </section>}

      {rail.signals.length>0 && <section data-chat-rail="signals" class="chat-rail-section bg-surface-1 border border-line rounded-xl overflow-hidden shrink-0">
        <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
          <h2 class="font-anth font-bold text-[10px] tracking-wider text-accent uppercase">{tl('Technicals')}</h2>
        </header>
        <div class="px-2.5 py-1 font-mono text-[10px]">
          {rail.signals.map(signal=><a key={signal.symbol} href={`#/research/${signal.symbol.toLowerCase()}`} class="flex flex-wrap items-baseline justify-between gap-1 py-0.5 hover:no-underline">
            <span class="text-ink-2 font-tick">{signal.symbol}</span>
            <span class="flex gap-2">
              {Number.isFinite(signal.rsi)&&<span class={rsiTone(signal.rsi)}>RSI {Math.round(signal.rsi)}</span>}
              {signal.volume>=2&&<span class="text-accent">{signal.volume.toFixed(1)}× {getLocale()==='zh'?'量':'vol'}</span>}
            </span>
          </a>)}
        </div>
      </section>}

      {rail.events.length>0 && <section data-chat-rail="calendar" class="chat-rail-section bg-surface-1 border border-line rounded-xl overflow-hidden shrink-0">
        <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
          <h2 class="font-anth font-bold text-[10px] tracking-wider text-accent uppercase">{tl('Calendar')}</h2>
        </header>
        <div class="px-2.5 py-1">
          {rail.events.map((event,index)=><a key={`${event.date}-${index}`} href="#/markets/calendar" class="flex items-baseline justify-between gap-2 py-1 hover:no-underline">
            <span class="min-w-0 truncate text-[10.5px] text-ink-2 font-anth">{tl(event.label)}</span>
            <span class="shrink-0 font-mono text-[9px] text-muted">{event.date?.slice(5)}</span>
          </a>)}
        </div>
      </section>}

      {!incognito && (
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
      )}
    </aside>
    </div>
  )
}
