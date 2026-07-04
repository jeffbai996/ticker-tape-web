import { useRef, useState } from 'preact/hooks'
import { parseCommand } from '../lib/commands.js'
import { watch, unwatch } from '../lib/watchlist.js'
import { addAlert, conditionText } from '../lib/alerts.js'

// The TUI's bottom command line: `ticker> type command or symbol…`.
// Desktop-only — mobile has the bottom tab bar + palette instead.

export function CommandBar() {
  const [value, setValue] = useState('')
  const [msg, setMsg] = useState(null)
  const msgTimer = useRef(null)

  const flash = (text) => {
    setMsg(text)
    clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => setMsg(null), 6000)
  }

  const run = (e) => {
    e.preventDefault()
    const plan = parseCommand(value)
    if (!plan) {
      if (value.trim()) flash(`unknown: ${value.trim()} — try h for help`)
      return
    }
    setValue('')

    if (plan.type === 'nav') {
      location.hash = plan.hash
    } else if (plan.type === 'watch') {
      flash(watch(plan.symbol) ? `watching ${plan.symbol}` : `${plan.symbol}: already watched or invalid`)
    } else if (plan.type === 'unwatch') {
      flash(unwatch(plan.symbol) ? `unwatched ${plan.symbol}` : `${plan.symbol}: not on the list`)
    } else if (plan.type === 'alert') {
      try {
        const a = addAlert({ symbol: plan.symbol, type: 'price', operator: plan.operator, value: plan.value })
        flash(`armed: ${conditionText(a)}`)
      } catch (err) {
        flash(String(err.message || err))
      }
    } else if (plan.type === 'screen') {
      localStorage.setItem('screen_symbols', plan.symbols.join(' '))
      location.hash = `#/screen/${plan.view === 'compare' ? 'compare' : 'valuation'}`
    } else if (plan.type === 'chat') {
      sessionStorage.setItem('chat_prefill', plan.q)
      location.hash = '#/chat'
    } else if (plan.type === 'msg') {
      flash(plan.text)
    }
  }

  return (
    <form
      onSubmit={run}
      class="max-md:hidden flex items-center gap-2 px-3 h-8 shrink-0 bg-surface-1 border-t border-line font-mono text-[11px]"
    >
      <span class="text-accent font-bold shrink-0">ticker&gt;</span>
      <input
        value={value}
        onInput={(e) => setValue(e.currentTarget.value)}
        placeholder="type command or symbol…  (h = help)"
        class="flex-1 bg-transparent outline-none text-ink placeholder:text-muted min-w-0"
      />
      {msg && <span class="text-muted truncate max-w-[50%]">{msg}</span>}
    </form>
  )
}
