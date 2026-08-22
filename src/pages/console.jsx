import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { parseCommand, HELP_TEXT, HELP_TEXT_NARROW } from '../lib/commands.js'
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
          <pre class="text-ink-2 whitespace-pre-wrap m-0 font-mono text-[11px]"><Rich text={HELP_TEXT_NARROW} /></pre>
        )}
        {log.map((entry) => (
          <div key={entry.id} class="pb-1.5">
            <div class="text-muted"><span class="text-accent">ticker&gt;</span> {entry.cmd}</div>
            {/* `h` output is shared console state with the desktop bar — swap
                in the narrow register at render time, this pane is the phone */}
            <pre class="text-ink-2 whitespace-pre-wrap m-0 font-mono"><Rich text={entry.text === HELP_TEXT ? HELP_TEXT_NARROW : entry.text} /></pre>
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
        class="sticky bottom-0 flex items-center gap-2 px-3 py-2 bg-surface-1 border-t border-line font-mono">
        <span class="text-accent font-bold shrink-0 text-[12px]">ticker&gt;</span>
        {/* iOS zooms the page on focus of any input under 16px and never
            zooms back. The input stays 16px for the engine and is scaled to
            12px for the eye; the wrapper clips the 133% width that keeps the
            scaled box flush with the ↵ button (Jeff 2026-08-22: "you also
            didn't fix the composer") */}
        {/* the input box is an explicit 24px line, zero padding/margin: iOS
            gives inputs their own vertical padding, which left more room
            under the text than over it (Jeff 2026-08-22) */}
        <div class="flex-1 min-w-0 overflow-hidden h-6 flex items-center">
          <input ref={inputRef} value={value}
            onInput={(e) => setValue(e.currentTarget.value)}
            onKeyDown={onKey}
            placeholder={tl('command or symbol… h = help')}
            autocapitalize="off" autocorrect="off" spellcheck={false} enterkeyhint="go"
            style={{ width: '133.34%' }}
            class="shrink-0 origin-left scale-75 h-6 leading-6 p-0 m-0 appearance-none bg-transparent outline-none text-ink placeholder:text-muted text-[16px]" />
        </div>
        <button type="submit" class="shrink-0 px-2.5 h-6 rounded border border-line text-ink-2 text-[11px] active:border-accent">↵</button>
      </form>
    </div>
  )
}
