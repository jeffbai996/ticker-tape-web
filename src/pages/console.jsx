import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { parseCommand, HELP_TEXT } from '../lib/commands.js'
import { executePlan } from '../lib/execute.js'
import { completions, applyCompletion } from '../lib/complete.js'
import { getWatchlist } from '../lib/watchlist.js'
import * as consoleStore from '../lib/consoleStore.js'
import { Rich } from '../components/CommandBar.jsx'
import { tl } from '../lib/i18n.js'

// The phone's console — its own page, not a floating panel (Jeff
// 2026-08-17). Output log scrolls above; the input is pinned at the bottom
// just above the chin nav; same command grammar, history and store as the
// desktop bar, so a command run on either shows on both.
export function ConsolePage() {
  const [log, setLog] = useState(consoleStore.getLog)
  useEffect(() => consoleStore.subscribe(setLog), [])
  const [value, setValue] = useState('')
  const [histIdx, setHistIdx] = useState(-1)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [log])

  const print = (cmd, text) => consoleStore.print(cmd, text)
  const run = (e) => {
    e.preventDefault()
    const cmd = value.trim()
    const plan = parseCommand(cmd)
    if (!plan) {
      if (cmd) print(cmd, `[red]unknown:[/] ${cmd} [#808080]— try h for help[/]`)
      return
    }
    consoleStore.pushHistory(cmd)
    setHistIdx(-1)
    setValue('')
    executePlan(plan, cmd, {
      print,
      getLog: consoleStore.getLog,
      clearConsole: () => consoleStore.clear(),
    })
  }

  const suggestions = useMemo(() => value.trim()
    ? completions(value, getWatchlist()).slice(0, 8)
    : [], [value])

  const onKey = (e) => {
    const h = consoleStore.getHistory()
    if (e.key === 'Tab' && suggestions.length) {
      e.preventDefault(); setValue(applyCompletion(value, suggestions)); return
    }
    if (e.key === 'ArrowUp' && h.length) {
      e.preventDefault()
      const idx = histIdx < 0 ? h.length - 1 : Math.max(0, histIdx - 1)
      setHistIdx(idx); setValue(h[idx])
    } else if (e.key === 'ArrowDown' && histIdx >= 0) {
      e.preventDefault()
      const idx = histIdx + 1
      if (idx >= h.length) { setHistIdx(-1); setValue('') } else { setHistIdx(idx); setValue(h[idx]) }
    }
  }

  return (
    <div class="flex flex-col flex-1 min-h-0 w-full">
      {/* output — one column of help on the phone (the wide two-column
          register is the desktop panel's) */}
      <div ref={scrollRef} class="flex-1 min-h-0 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-relaxed select-text">
        {log.length === 0 && (
          <pre class="text-ink-2 whitespace-pre-wrap m-0 font-mono text-[11px]"><Rich text={HELP_TEXT} /></pre>
        )}
        {log.map((entry) => (
          <div key={entry.id} class="pb-1.5">
            <div class="text-muted"><span class="text-accent">ticker&gt;</span> {entry.cmd}</div>
            <pre class="text-ink-2 whitespace-pre-wrap m-0 font-mono"><Rich text={entry.text} /></pre>
          </div>
        ))}
      </div>
      {suggestions.length > 0 && (
        <div class="flex items-center gap-1 px-3 py-1 bg-surface-2 border-t border-line-2 overflow-x-auto no-scrollbar">
          {suggestions.map((sug, i) => (
            <button key={sug} type="button"
              onClick={() => { setValue(`${sug} `); inputRef.current?.focus() }}
              class={`shrink-0 px-2 py-1 rounded font-mono text-[12px] ${i === 0 ? 'bg-accent text-black font-semibold' : 'text-ink-2'}`}>
              {sug.split(/\s+/).pop()}
            </button>
          ))}
        </div>
      )}
      {/* input pinned above the chin nav (BottomNav is fixed bottom-0, ~48px) */}
      <form onSubmit={run}
        class="sticky bottom-0 flex items-center gap-2 px-3 h-12 bg-surface-1 border-t border-line font-mono">
        <span class="text-accent font-bold shrink-0 text-[13px]">ticker&gt;</span>
        <input ref={inputRef} value={value}
          onInput={(e) => setValue(e.currentTarget.value)}
          onKeyDown={onKey}
          placeholder={tl('type command or symbol…  (h = help)')}
          autocapitalize="off" autocorrect="off" spellcheck={false} enterkeyhint="go"
          class="flex-1 min-w-0 bg-transparent outline-none text-ink placeholder:text-muted text-[16px]" />
        <button type="submit" class="shrink-0 px-3 h-8 rounded border border-line text-ink-2 text-[12px] active:border-accent">↵</button>
      </form>
    </div>
  )
}
