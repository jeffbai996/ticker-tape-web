import { useEffect, useRef, useState } from 'preact/hooks'
import { fetchChatModels, fetchSpend } from '../lib/chatClient.js'
import { runAgentic, trimHistory } from '../lib/agent.js'
import { toolLabel } from '../lib/tools.js'
import { MdLite } from '../components/AiReport.jsx'
import { tl, t as tt } from '../lib/i18n.js'

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
  const [spend, setSpend] = useState(null)
  const [history, setHistory] = useState(loadHistory)
  const [input, setInput] = useState(() => {
    const pre = sessionStorage.getItem('chat_prefill') || ''
    sessionStorage.removeItem('chat_prefill')
    return pre
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    fetchChatModels().then((d) => setModels(d.models)).catch(() => {})
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
    setInput('')
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
        <h1 class="font-mono font-bold text-lg text-ink">{tl('AI Chat')}</h1>
        <select
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
        </select>
        <div class="ml-auto flex items-center gap-3">
          <SpendMeter spend={spend} />
          {history.length > 0 && (
            <button onClick={clear} class="font-mono text-[10px] text-muted hover:text-down">
              {tl('clear')}
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} class="flex-1 overflow-y-auto min-h-0 max-w-3xl w-full flex flex-col gap-2 px-1">
        {history.length === 0 && (
          <div class="font-mono text-[11px] text-muted pt-6">{tt('chat.empty')}</div>
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
              <div key={i} class="self-start rounded-xl border px-3 py-2 text-[13px] leading-relaxed bg-surface-1 border-line text-ink max-w-[95%]">
                {m.content
                  ? <MdLite text={m.content} />
                  : busy && i === history.length - 1
                    ? <span class="text-muted font-mono text-[11px]">{tt('common.loading')}</span>
                    : null}
              </div>
            )
          }
          return (
            <div key={i} class="self-end rounded-xl border px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap bg-accent-soft border-accent/40 text-ink max-w-[85%]">
              {m.content}
            </div>
          )
        })}
        {busy && ['user', 'tool'].includes(history[history.length - 1]?.role) && (
          <div class="self-start font-mono text-[11px] text-muted px-1">{tt('common.loading')}</div>
        )}
        {error && (
          <div class="self-start font-mono text-[11px] text-down px-1">{error}</div>
        )}
      </div>

      <form onSubmit={send} class="max-w-3xl w-full flex gap-2 pt-2">
        <input
          value={input}
          onInput={(e) => setInput(e.currentTarget.value)}
          placeholder={tt('chat.placeholder')}
          class="flex-1 bg-surface-1 border border-line rounded-xl px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-accent placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy}
          class="font-mono text-[12px] px-4 rounded-xl border border-accent text-accent bg-accent-soft hover:bg-accent hover:text-black disabled:opacity-40"
        >
          {busy ? '…' : tl('Send')}
        </button>
      </form>
    </div>
  )
}
