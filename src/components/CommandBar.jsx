import { useEffect, useRef, useState } from 'preact/hooks'
import { parseCommand } from '../lib/commands.js'
import { watch, unwatch } from '../lib/watchlist.js'
import { addAlert, conditionText } from '../lib/alerts.js'
import { addCatalyst, removeCatalyst, loadCatalysts } from '../lib/catalysts.js'
import { getCached } from '../lib/feed.js'
import { loadUserGroups, saveUserGroup, removeUserGroup } from '../lib/usergroups.js'
import { loadMemories, addMemory, editMemory, removeMemory } from '../lib/chatMemory.js'
import {
  loadJournal, addJournalEntry, removeJournalEntry, searchJournal,
} from '../lib/journal.js'
import { fetchDividends } from '../lib/history.js'
import { fetchFundamentals } from '../lib/fundamentals.js'
import { fmtPrice, fmtPct } from '../lib/format.js'
import { parseRich, TUI } from '../lib/rich.js'
import { getLocale, setLocale, tl } from '../lib/i18n.js'

// The TUI's bottom command line, with a real output console: every command
// echoes into a drop-up log (like the CLI's main pane) instead of a blink-
// and-you-miss-it flash. ↑/↓ recalls history, Esc closes the console.

let nextId = 1

/** One-line quote echo from the feed cache, if the symbol is priced. */
function quoteEcho(symbol) {
  const q = getCached(symbol)?.quote
  if (!q?.price) return null
  const up = (q.pct ?? 0) >= 0
  const tone = up ? 'green' : 'red'
  return `[bold]${symbol}[/] ${fmtPrice(q.price)} [${tone}]${up ? '▲' : '▼'} ${fmtPct(q.pct)}[/]`
}

/** Console line: TUI rich markup → colored spans. */
function Rich({ text }) {
  return parseRich(text).map((s, i) => (
    <span
      key={i}
      style={{
        color: s.color || undefined,
        fontWeight: s.bold ? 700 : undefined,
        opacity: s.dim && !s.color ? 0.62 : undefined,
      }}
    >
      {s.text}
    </span>
  ))
}

export function CommandBar() {
  const [value, setValue] = useState('')
  const [log, setLog] = useState([])
  const [open, setOpen] = useState(false)
  const [histIdx, setHistIdx] = useState(-1)
  const history = useRef([])
  const scrollRef = useRef(null)
  // console height is a preference: drag the top edge, it sticks
  const [consoleH, setConsoleH] = useState(() => {
    const v = parseInt(localStorage.getItem('console_h') || '', 10)
    return v >= 120 ? v : 288
  })
  const startDrag = (e) => {
    e.preventDefault()
    const grip = e.currentTarget
    grip.setPointerCapture(e.pointerId)
    const startY = e.clientY
    const startH = consoleH
    const move = (ev) => setConsoleH(
      Math.max(120, Math.min(window.innerHeight * 0.8, startH + (startY - ev.clientY))))
    const up = () => {
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', up)
      setConsoleH((h) => {
        const r = Math.round(h)
        localStorage.setItem('console_h', String(r))
        return r
      })
    }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', up)
  }

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [log])

  // `/` from anywhere focuses the command line (unless you're already typing
  // somewhere) — the slash never lands in the input.
  const inputRef = useRef(null)
  useEffect(() => {
    const onSlash = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
        || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onSlash)
    return () => window.removeEventListener('keydown', onSlash)
  }, [])

  const print = (cmd, text) => {
    setLog((l) => [...l.slice(-40), { id: nextId++, cmd, text }])
    setOpen(true)
  }

  const run = (e) => {
    e.preventDefault()
    const cmd = value.trim()
    const plan = parseCommand(cmd)
    if (!plan) {
      if (cmd) print(cmd, `[red]unknown:[/] ${cmd} [#808080]— try h for help[/]`)
      return
    }
    history.current.push(cmd)
    setHistIdx(-1)
    setValue('')

    if (plan.type === 'nav') {
      // chart range / options expiry ride-alongs: storage covers a view that
      // mounts after the hash change, the event covers one already mounted.
      if (plan.range) {
        sessionStorage.setItem('chart_range', plan.range)
        window.dispatchEvent(new CustomEvent('tape:chart-range', { detail: plan.range }))
      }
      if (plan.expiry) {
        sessionStorage.setItem('opt_expiry', plan.expiry)
        window.dispatchEvent(new CustomEvent('tape:opt-expiry', { detail: plan.expiry }))
      }
      location.hash = plan.hash
      const sym = plan.hash.match(/#\/research\/([a-z0-9.^=-]+)/)?.[1]?.toUpperCase()
      print(cmd, (sym && quoteEcho(sym)) || `→ ${plan.hash.replace('#/', '') || 'dashboard'}`)
    } else if (plan.type === 'watch') {
      print(cmd, watch(plan.symbol) ? `[green]✓[/] watching [bold]${plan.symbol}[/]` : `[red]${plan.symbol}: already watched or invalid[/]`)
    } else if (plan.type === 'unwatch') {
      print(cmd, unwatch(plan.symbol) ? `[green]✓[/] unwatched [bold]${plan.symbol}[/]` : `[red]${plan.symbol}: not on the list[/]`)
    } else if (plan.type === 'alert') {
      try {
        const a = addAlert({ symbol: plan.symbol, type: 'price', operator: plan.operator, value: plan.value })
        print(cmd, `[green]✓ armed[/] [#00c8ff]${conditionText(a)}[/]`)
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
    } else if (plan.type === 'nav_msg') {
      location.hash = plan.hash
      print(cmd, plan.text)
    } else if (plan.type === 'clear') {
      setLog([])
      setOpen(false)
    } else if (plan.type === 'lang') {
      const next = plan.locale || (getLocale() === 'en' ? 'zh' : 'en')
      setLocale(next)
      print(cmd, `[green]✓[/] ${next === 'zh' ? '中文' : 'english'}`)
    } else if (plan.type === 'copy') {
      // `copy` = last output, `copy N` = that console entry, CLI-style
      const entry = plan.n == null ? log[log.length - 1] : log[plan.n - 1]
      if (!entry) {
        print(cmd, `[red]nothing at ${plan.n ?? 'the end'} of the console[/]`)
      } else {
        const plain = parseRich(entry.text).map((s) => s.text).join('')
        navigator.clipboard?.writeText(`${entry.cmd}\n${plain}`)
          .then(() => print(cmd, `[green]✓[/] copied ${plan.n ? `#${plan.n}` : 'last output'}`))
          .catch(() => print(cmd, '[red]clipboard blocked by the browser[/]'))
      }
    } else if (plan.type === 'group_list') {
      const groups = Object.entries(loadUserGroups())
      print(cmd, groups.length
        ? groups.map(([n, syms]) => `[bold #00c8ff]${n.padEnd(14)}[/]${syms.join(' ')}`).join('\n')
        : 'no groups — group semis NVDA AMD TSM')
    } else if (plan.type === 'group_add') {
      const saved = saveUserGroup(plan.name, plan.symbols)
      if (!saved) {
        print(cmd, `[red]bad group — name must be a word, symbols must be symbols[/]`)
      } else {
        // a group you can't see is useless: pull members onto the watchlist
        const added = saved.filter((s) => watch(s))
        print(cmd, `[green]✓[/] group [bold]${plan.name}[/]: ${saved.join(' ')}`
          + (added.length ? ` [#808080](+${added.length} to watchlist)[/]` : ''))
      }
    } else if (plan.type === 'group_rm') {
      print(cmd, removeUserGroup(plan.name)
        ? `[green]✓[/] removed group [bold]${plan.name}[/]`
        : `[red]no group "${plan.name}"[/]`)
    } else if (plan.type === 'mem_list') {
      const mems = loadMemories()
      print(cmd, mems.length
        ? mems.map((m) => `[bold #00c8ff]#${String(m.id).padEnd(3)}[/]${m.text.slice(0, 70).padEnd(72)}[#808080]${new Date(m.ts).toISOString().slice(0, 10)}[/]`).join('\n')
        : 'no memories — mem add TEXT, or ask the AI chat to remember something')
    } else if (plan.type === 'mem_add') {
      const m = addMemory(plan.text)
      print(cmd, m ? `[green]✓[/] memory #${m.id} saved` : '[red]empty memory[/]')
    } else if (plan.type === 'mem_edit') {
      print(cmd, editMemory(plan.id, plan.text)
        ? `[green]✓[/] memory #${plan.id} updated` : `[red]no memory #${plan.id}[/]`)
    } else if (plan.type === 'mem_rm') {
      print(cmd, removeMemory(plan.id)
        ? `[green]✓[/] memory #${plan.id} deleted` : `[red]no memory #${plan.id}[/]`)
    } else if (plan.type === 'mem_show') {
      const m = loadMemories().find((x) => x.id === plan.id)
      print(cmd, m
        ? `[bold]#${m.id}[/]  ${m.text}\n[#808080]saved ${new Date(m.ts).toLocaleString()}[/]`
        : `[red]no memory #${plan.id}[/]`)
    } else if (plan.type === 'journal_list') {
      const entries = loadJournal().slice(-15)
      print(cmd, entries.length
        ? entries.map((e) => `[bold #00c8ff]#${String(e.id).padEnd(3)}[/]${e.text.replace(/\n/g, ' ').slice(0, 60).padEnd(62)}[#808080]${new Date(e.ts).toISOString().slice(0, 10)}${e.symbols.length ? `  [${e.symbols.join(' ')}]` : ''}[/]`).join('\n')
        : 'no journal entries — journal add TEXT')
    } else if (plan.type === 'journal_add') {
      const e = addJournalEntry(plan.text)
      print(cmd, e
        ? `[green]✓[/] journal #${e.id} saved [#808080](${e.symbols.length ? e.symbols.join(' ') : 'no symbols'})[/]`
        : '[red]empty entry[/]')
    } else if (plan.type === 'journal_rm') {
      const m = plan.range.match(/^(\d+)(?:-(\d+))?$/)
      const lo = Number(m[1])
      const hi = Number(m[2] || m[1])
      let n = 0
      for (let i = lo; i <= hi; i++) if (removeJournalEntry(i)) n++
      print(cmd, n ? `[green]✓[/] deleted ${n} journal ${n === 1 ? 'entry' : 'entries'}` : `[red]nothing in #${plan.range}[/]`)
    } else if (plan.type === 'journal_search') {
      const hits = searchJournal(plan.term).slice(-10)
      print(cmd, hits.length
        ? hits.map((e) => `[bold #00c8ff]#${String(e.id).padEnd(3)}[/]${e.text.replace(/\n/g, ' ').slice(0, 64)}  [#808080]${new Date(e.ts).toISOString().slice(0, 10)}[/]`).join('\n')
        : `[#808080]nothing matching "${plan.term}"[/]`)
    } else if (plan.type === 'journal_show') {
      const e = loadJournal().find((x) => x.id === plan.id)
      print(cmd, e
        ? `[bold]#${e.id}[/]  [#808080]${new Date(e.ts).toLocaleString()}${e.symbols.length ? `  [${e.symbols.join(' ')}]` : ''}[/]\n${e.text}`
        : `[red]no journal #${plan.id}[/]`)
    } else if (plan.type === 'div') {
      const sym = plan.symbol
      print(cmd, `[#808080]fetching ${sym} dividends…[/]`)
      Promise.all([
        fetchDividends(sym).catch(() => []),
        fetchFundamentals(sym).catch(() => null),
      ]).then(([hist, f]) => {
        const lines = []
        if (f?.dividendYield != null || f?.dividendRate != null) {
          const bits = []
          if (f.dividendRate != null) bits.push(`rate $${f.dividendRate.toFixed(2)}/yr`)
          if (f.dividendYield != null) bits.push(`yield ${(f.dividendYield * 100).toFixed(2)}%`)
          if (f.payoutRatio != null) bits.push(`payout ${(f.payoutRatio * 100).toFixed(0)}%`)
          if (f.exDividendDate != null) bits.push(`ex-div ${new Date(f.exDividendDate * 1000).toISOString().slice(0, 10)}`)
          lines.push(`[bold]${sym}[/] ${bits.join(' · ')}`)
        }
        if (hist.length) {
          lines.push(...hist.slice(0, 10).map((d) =>
            `${new Date(d.date * 1000).toISOString().slice(0, 10)}  [green]$${+d.amount.toFixed(4)}[/]`))
          if (hist.length > 10) lines.push(`[#808080]… ${hist.length - 10} more in the last 5y[/]`)
        }
        print(cmd, lines.length ? lines.join('\n') : `[#808080]${sym} pays no dividend[/]`)
      })
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
          <div onPointerDown={startDrag}
            class="h-2.5 cursor-ns-resize touch-none flex items-center justify-center group/grip"
            title={tl('drag to resize')}>
            <div class="w-10 h-[3px] rounded bg-line group-hover/grip:bg-accent group-active/grip:bg-accent" />
          </div>
          <div class="flex items-center px-3 py-1 border-b border-line-2">
            <span class="font-mono text-[9px] tracking-wider text-muted uppercase">{tl('console')}</span>
            <button
              onClick={() => setOpen(false)}
              class="ml-auto font-mono text-[11px] text-muted hover:text-ink px-1"
              title="Esc"
            >
              ✕
            </button>
          </div>
          <div ref={scrollRef} style={{ maxHeight: `${consoleH}px` }}
            class="overflow-y-auto px-3 py-1.5 font-mono text-[11px] leading-relaxed select-text">
            {log.map((entry) => (
              <div key={entry.id} class="pb-1">
                <div class="text-muted">
                  <span class="text-accent">ticker&gt;</span> {entry.cmd}
                </div>
                <pre class="text-ink-2 whitespace-pre-wrap pl-3 m-0 font-mono"><Rich text={entry.text} /></pre>
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
          ref={inputRef}
          value={value}
          onInput={(e) => setValue(e.currentTarget.value)}
          onKeyDown={onKey}
          placeholder={tl('type command or symbol…  (h = help)')}
          class="flex-1 bg-transparent outline-none text-ink placeholder:text-muted min-w-0"
        />
        {/* keycap hint, not placeholder prose: `/` focuses from anywhere */}
        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          title={tl('focus console')}
          class="shrink-0 w-5 h-5 grid place-items-center rounded border border-line-2 bg-surface-2 text-muted hover:text-ink text-[10px] leading-none"
        >
          /
        </button>
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
