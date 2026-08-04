import { useEffect, useRef, useState } from 'preact/hooks'
import { fetchChatModels, fetchSpend } from '../lib/chatClient.js'
import { runAgentic, trimHistory } from '../lib/agent.js'
import { toolLabel } from '../lib/tools.js'
import { MdLite } from '../components/AiReport.jsx'
import { tl, t as tt } from '../lib/i18n.js'
import { wireChatAvailable } from '../lib/wirechat.js'

// Generic on purpose: the assistant knows about markets and this app, and is
// told it has no account or personal data (it genuinely has none).
const SYSTEM =
  'You are the assistant inside ticker-tape-web, a public demo market dashboard ' +
  '(dashboard, markets, per-symbol research, screening, alerts, and a synthetic ' +
  'DEMO portfolio). You have tools: live quotes, technicals, earnings, market ' +
  'pulse, the macro calendar (plus adding user catalysts to it), watchlist ' +
  'read/write, alert arming, and app navigation. Use them for ' +
  'anything involving current prices, technicals, or the watchlist instead of ' +
  'answering from memory; call several in one round when that is faster. ' +
  'You have no access to any personal, account, or portfolio data — the ' +
  'portfolio section is a clearly-labeled synthetic demo. Be concise.'

const HISTORY_KEY = 'chat_history_v1'
const MAX_TURNS = 40

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []
  } catch {
    return []
  }
}

function saveHistory(h) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimHistory(h, MAX_TURNS)))
  } catch { /* best-effort */ }
}

const SUGGESTIONS = [
  "what's moving today?",
  'how does NVDA look technically?',
  "what's on the calendar this week?",
  'open TSLA research',
]

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
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    fetchChatModels().then((d) => {
      setModels(d.models)
      if (!d.models.some((candidate) => candidate.key === model)) {
        setModel('flash')
        localStorage.setItem('chat_model', 'flash')
      }
    }).catch(() => {})
    if (!wireChatAvailable()) fetchSpend().then(setSpend).catch(() => {})
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [history])

  const send = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setError(null)
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setBusy(true)

    const base = [...history, { role: 'user', content: text }]
    let added = []
    let live = ''
    const paint = () =>
      setHistory([...base, ...added, ...(live ? [{ role: 'assistant', content: live }] : [])])
    paint()

    try {
      await runAgentic({
        model,
        effort,
        system: SYSTEM,
        messages: base,
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
      const done = [...base, ...added]
      setHistory(done)
      saveHistory(done)
    } catch (err) {
      setError(String(err.message || err))
      const done = [...base, ...added]
      setHistory(done)
      saveHistory(done)
    } finally {
      setBusy(false)
      fetchSpend().then(setSpend).catch(() => {})
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
        {!onWire && <select
          value={model}
          onChange={(e) => {
            setModel(e.currentTarget.value)
            localStorage.setItem('chat_model', e.currentTarget.value)
          }}
          class="bg-surface-2 border border-line rounded-md px-2 py-1 font-mono text-[11px] text-ink outline-none"
        >
          {(models.length ? models : [{ key: model, label: model }]).map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>}
        {onWire && (
          <span class="font-mono text-[10px] text-muted border border-line rounded-md px-2 py-1"
                title="answers come from your own subscription via fragwire — no metered API, no cap">
            via <span class="text-accent">wire</span>
          </span>
        )}
        {!onWire && <div class="flex items-center border border-line rounded-md overflow-hidden" title="thinking effort">
          {['auto', 'off', 'low', 'medium', 'high'].map((lv) => (
            <button
              key={lv}
              onClick={() => {
                setEffort(lv)
                localStorage.setItem('chat_effort', lv)
              }}
              class={`px-2 py-1 font-mono text-[10px] border-r border-line last:border-r-0 ${
                effort === lv ? 'bg-accent text-black font-bold' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {lv}
            </button>
          ))}
        </div>}
        <div class="ml-auto flex items-center gap-3">
          {history.length > 0 && (
            <button onClick={clear} class="font-mono text-[10px] text-muted hover:text-down">
              {tl('clear')}
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} class="flex-1 overflow-y-auto min-h-0 max-w-3xl w-full flex flex-col gap-2 px-1">
        {history.length === 0 && (
          <div class="pt-10 flex flex-col items-start gap-4 max-w-lg">
            <div>
              <div class="text-ink text-[15px] font-anth">
                {onWire
                  ? 'Ask about a ticker, a sector, or how this app works.'
                  : tt('chat.empty')}
              </div>
              <div class="text-muted text-[12px] font-anth pt-1">
                it can pull live quotes and technicals, read the calendar, edit
                your watchlist, arm alerts, and move you around the app.
              </div>
            </div>
            <div class="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => { setInput(sug); inputRef.current?.focus() }}
                  class="font-anth text-[12px] text-ink-2 border border-line rounded-full px-3 py-1 hover:border-accent/60 hover:text-ink"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}
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
              <div key={i} class="group self-start max-w-[95%] relative">
                <div class="rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-relaxed bg-surface-1 border-line text-ink font-anth">
                  {m.content
                    ? <MdLite text={m.content} />
                    : busy && i === history.length - 1
                      ? <Thinking />
                      : null}
                </div>
                {m.content && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(m.content)}
                    title="copy"
                    class="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-2 border border-line rounded-md px-1.5 py-0.5 font-mono text-[9px] text-muted hover:text-ink"
                  >
                    copy
                  </button>
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
        {error && (
          <div class="self-start font-mono text-[11px] text-down px-1">{error}</div>
        )}
      </div>

      <form onSubmit={send} class="max-w-3xl w-full pt-2">
        <div class="flex items-end gap-2 bg-surface-1 border border-line rounded-2xl px-3 py-2 focus-within:border-accent/70 transition-colors">
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
            class="flex-1 bg-transparent resize-none outline-none text-[13.5px] leading-relaxed text-ink placeholder:text-muted max-h-40 font-anth"
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
