import { useEffect, useRef, useState } from 'preact/hooks'
import { parseCommand } from '../lib/commands.js'
import { watch, unwatch } from '../lib/watchlist.js'
import { addAlert, conditionText } from '../lib/alerts.js'
import { addCatalyst, removeCatalyst, loadCatalysts } from '../lib/catalysts.js'
import { getCached } from '../lib/feed.js'
import { fmtPrice, fmtPct } from '../lib/format.js'

// The TUI's bottom command line, with a real output console: every command
// echoes into a drop-up log (like the CLI's main pane) instead of a blink-
// and-you-miss-it flash. ↑/↓ recalls history, Esc closes the console.

let nextId = 1

/** One-line quote echo from the feed cache, if the symbol is priced. */
function quoteEcho(symbol) {
  const q = getCached(symbol)?.quote
  if (!q?.price) return null
  const arrow = (q.pct ?? 0) >= 0 ? '▲' : '▼'
  return `${symbol} ${fmtPrice(q.price)} ${arrow} ${fmtPct(q.pct)}`
}

export function CommandBar() {
  const [value, setValue] = useState('')
  const [log, setLog] = useState([])
  const [open, setOpen] = useState(false)
  const [histIdx, setHistIdx] = useState(-1)
  const history = useRef([])
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [log])

  const print = (cmd, text) => {
    setLog((l) => [...l.slice(-40), { id: nextId++, cmd, text }])
    setOpen(true)
  }

  const run = (e) => {
    e.preventDefault()
    const cmd = value.trim()
    const plan = parseCommand(cmd)
    if (!plan) {
      if (cmd) print(cmd, `unknown: ${cmd} — try h for help`)
      return
    }
    history.current.push(cmd)
    setHistIdx(-1)
    setValue('')

    if (plan.type === 'nav') {
      location.hash = plan.hash
      const sym = plan.hash.match(/#\/research\/([a-z0-9.^=-]+)/)?.[1]?.toUpperCase()
      print(cmd, (sym && quoteEcho(sym)) || `→ ${plan.hash.replace('#/', '') || 'dashboard'}`)
    } else if (plan.type === 'watch') {
      print(cmd, watch(plan.symbol) ? `watching ${plan.symbol}` : `${plan.symbol}: already watched or invalid`)
    } else if (plan.type === 'unwatch') {
      print(cmd, unwatch(plan.symbol) ? `unwatched ${plan.symbol}` : `${plan.symbol}: not on the list`)
    } else if (plan.type === 'alert') {
      try {
        const a = addAlert({ symbol: plan.symbol, type: 'price', operator: plan.operator, value: plan.value })
        print(cmd, `armed: ${conditionText(a)}`)
      } catch (err) {
        print(cmd, String(err.message || err))
      }
    } else if (plan.type === 'screen') {
      localStorage.setItem('screen_symbols', plan.symbols.join(' '))
      location.hash = `#/screen/${plan.view === 'compare' ? 'compare' : 'valuation'}`
      print(cmd, `${plan.view}: ${plan.symbols.join(' ')}`)
    } else if (plan.type === 'catalyst_add') {
      try {
        const c = addCatalyst({ date: plan.date, symbol: plan.symbol, type: plan.ctype, label: plan.label })
        print(cmd, `catalyst #${c.id}: ${c.date}  ${c.symbol === 'MACRO' ? '' : `${c.symbol} `}[${c.type}] ${c.label}`)
      } catch (err) {
        print(cmd, String(err.message || err))
      }
    } else if (plan.type === 'catalyst_rm') {
      print(cmd, removeCatalyst(plan.id) ? `removed catalyst #${plan.id}` : `no catalyst #${plan.id}`)
    } else if (plan.type === 'catalyst_list') {
      const cats = [...loadCatalysts()].sort((a, b) => a.date.localeCompare(b.date))
      print(cmd, cats.length
        ? cats.map((c) => `#${c.id}  ${c.date}  ${c.symbol === 'MACRO' ? '' : `${c.symbol} `}[${c.type}] ${c.label}`).join('\n')
        : 'no catalysts — cat add 2026-09-09 NVDA product GTC keynote')
    } else if (plan.type === 'chat') {
      sessionStorage.setItem('chat_prefill', plan.q)
      location.hash = '#/chat'
      print(cmd, `→ chat: ${plan.q}`)
    } else if (plan.type === 'msg') {
      print(cmd, plan.text)
    }
  }

  const onKey = (e) => {
    const h = history.current
    if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowUp' && h.length) {
      e.preventDefault()
      const idx = histIdx < 0 ? h.length - 1 : Math.max(0, histIdx - 1)
      setHistIdx(idx)
      setValue(h[idx])
    } else if (e.key === 'ArrowDown' && histIdx >= 0) {
      e.preventDefault()
      const idx = histIdx + 1
      if (idx >= h.length) {
        setHistIdx(-1)
        setValue('')
      } else {
        setHistIdx(idx)
        setValue(h[idx])
      }
    }
  }

  return (
    <div class="max-md:hidden relative shrink-0">
      {open && log.length > 0 && (
        <div class="absolute bottom-full left-0 right-0 z-40 bg-surface-1/95 backdrop-blur border-t border-line shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
          <div class="flex items-center px-3 py-1 border-b border-line-2">
            <span class="font-mono text-[9px] tracking-wider text-muted uppercase">console</span>
            <button
              onClick={() => setOpen(false)}
              class="ml-auto font-mono text-[11px] text-muted hover:text-ink px-1"
              title="Esc"
            >
              ✕
            </button>
          </div>
          <div ref={scrollRef} class="max-h-56 overflow-y-auto px-3 py-1.5 font-mono text-[11px] leading-relaxed select-text">
            {log.map((entry) => (
              <div key={entry.id} class="pb-1">
                <div class="text-muted">
                  <span class="text-accent">ticker&gt;</span> {entry.cmd}
                </div>
                <pre class="text-ink-2 whitespace-pre-wrap pl-3 m-0 font-mono">{entry.text}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
      <form
        onSubmit={run}
        class="flex items-center gap-2 px-3 h-8 bg-surface-1 border-t border-line font-mono text-[11px]"
      >
        <span class="text-accent font-bold shrink-0">ticker&gt;</span>
        <input
          value={value}
          onInput={(e) => setValue(e.currentTarget.value)}
          onKeyDown={onKey}
          placeholder="type command or symbol…  (h = help)"
          class="flex-1 bg-transparent outline-none text-ink placeholder:text-muted min-w-0"
        />
        {log.length > 0 && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            class="text-muted hover:text-ink text-[10px] shrink-0"
          >
            console ▴
          </button>
        )}
      </form>
    </div>
  )
}
