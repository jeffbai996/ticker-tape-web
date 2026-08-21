import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { parseCommand } from '../lib/commands.js'
import { executePlan } from '../lib/execute.js'
import { applyCompletion, completions } from '../lib/complete.js'
import { getWatchlist } from '../lib/watchlist.js'
import { parseRich } from '../lib/rich.js'
import { isTypingTarget, watchMedia } from '../lib/keys.js'
import { tl } from '../lib/i18n.js'
import { consoleHeightAt, nextConsolePosture, isTap, COMPACT_H } from '../lib/consoleResize.js'
import * as consoleStore from '../lib/consoleStore.js'

// The TUI's bottom command line, with a real output console: every command
// echoes into a drop-up log (like the CLI's main pane) instead of a blink-
// and-you-miss-it flash. ↑/↓ recalls history, Esc closes the console.


/** Console line: TUI rich markup → colored spans. */
export function Rich({ text }) {
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
  // the log lives in consoleStore (shared with the phone's #/console page);
  // this is just the subscription mirror for rendering
  const [log, setLogState] = useState(consoleStore.getLog)
  useEffect(() => consoleStore.subscribe(setLogState), [])
  const [open, setOpen] = useState(false)
  // `hot` = the user started typing with nothing else focused, so the line
  // grows and lights up — it was too easy to type into an invisible console
  // (Jeff 2026-08-05)
  const [hot, setHot] = useState(false)
  const [histIdx, setHistIdx] = useState(-1)
  const scrollRef = useRef(null)
  const panelRef = useRef(null)
  // console height is a preference: drag the top edge, it sticks
  const [consoleH, setConsoleH] = useState(() => {
    const v = parseInt(localStorage.getItem('console_h') || '', 10)
    return v >= 120 ? v : 288
  })
  // Postures: rapid-fire keyboard commands keep a ~6-line peek ('compact');
  // a deliberate tap on the console body or a drag unlocks the stored drag
  // height ('stored'); a tap on the grab bar cycles compact → stored → tall
  // (Jeff 2026-08-17). Esc resets to the peek. 'tall' is 80vh, the drag cap.
  const [posture, setPosture] = useState('compact')
  const expanded = posture !== 'compact'
  const setExpanded = (on) => setPosture(on ? 'stored' : 'compact')
  const closeConsole = () => { setOpen(false); setPosture('compact') }
  const postureHeight = () => {
    if (posture === 'compact') return Math.min(consoleH, COMPACT_H)
    if (posture === 'tall') return Math.round(window.innerHeight * 0.8)
    return consoleH
  }
  const startDrag = (e) => {
    e.preventDefault()
    const panel = panelRef.current
    if (!panel) return
    const grip = e.currentTarget
    grip.setPointerCapture(e.pointerId)
    const startY = e.clientY
    const startH = postureHeight()
    let next = startH
    let frame = 0
    let moved = false
    const paint = () => {
      frame = 0
      panel.style.height = `${next}px`
      panel.style.maxHeight = `${next}px`
    }
    // Expanding and tracking are synchronous DOM work. Feeding every pointer
    // event through Preact plus a 200ms CSS transition made the grip trail the
    // finger by roughly half a second on iPad.
    paint()
    const move = (ev) => {
      if (!isTap(startY, ev.clientY)) moved = true
      if (!moved) return
      next = consoleHeightAt(startH, startY, ev.clientY, window.innerHeight)
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const up = (ev) => {
      if (frame) cancelAnimationFrame(frame)
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', up)
      grip.removeEventListener('pointercancel', up)
      if (!moved && ev.type === 'pointerup') {
        // a tap, not a drag: step to the next posture; the render below
        // paints it, so undo the synchronous height we set on pointerdown
        panel.style.height = ''
        panel.style.maxHeight = ''
        setPosture(nextConsolePosture(posture, {
          stored: consoleH, viewport: window.innerHeight }).posture)
        return
      }
      paint()
      const height = Math.round(next)
      localStorage.setItem('console_h', String(height))
      setConsoleH(height)
      setPosture('stored')
    }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', up)
    grip.addEventListener('pointercancel', up)
  }

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [log])

  // The bar is `max-md:hidden`, so below md every global keystroke it captured
  // went into an invisible input. Both capture effects only arm on wide.
  const [wide, setWide] = useState(true)
  useEffect(() => watchMedia('(min-width: 768px)', setWide), [])

  // `/` from anywhere focuses the command line (unless you're already typing
  // somewhere) — the slash never lands in the input.
  const inputRef = useRef(null)
  useEffect(() => {
    if (!wide) return undefined
    const onSlash = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onSlash)
    return () => window.removeEventListener('keydown', onSlash)
  }, [wide])

  const print = (cmd, text) => {
    consoleStore.print(cmd, text)
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
    consoleStore.pushHistory(cmd)
    setHistIdx(-1)
    setValue('')

    executePlan(plan, cmd, {
      print,
      getLog: consoleStore.getLog,
      clearConsole: () => { consoleStore.clear(); closeConsole() },
    })
  }

  // Anything printable typed while nothing else has focus belongs to the
  // command line. `/` is handled above (it focuses without typing itself).
  useEffect(() => {
    if (!wide) return undefined
    const onDoc = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/' || e.key.length !== 1) return
      // research pages own bare digits — bloomberg speed keys (1 = Overview)
      if (/^[0-9]$/.test(e.key) && location.hash.startsWith('#/research/')) return
      if (isTypingTarget(document.activeElement)) return
      const input = inputRef.current
      if (!input) return
      e.preventDefault()
      input.focus()
      setValue((v) => v + e.key)
      setHot(true)
    }
    addEventListener('keydown', onDoc)
    return () => removeEventListener('keydown', onDoc)
  }, [wide])

  // memoized per input value — recomputing (and re-rendering the strip) on
  // unrelated renders made the first keystrokes visibly stutter
  const suggestions = useMemo(() => value.trim()
    ? completions(value, getWatchlist()).slice(0, 8)
    : [], [value])

  const onKey = (e) => {
    const h = consoleStore.getHistory()
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
      return
    }
    if (e.key === 'Tab' && suggestions.length) {
      e.preventDefault()
      setValue(applyCompletion(value, suggestions))
      return
    }
    if (e.key === 'Escape') {
      setHot(false)
      closeConsole()
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

  // The chip hugs the placeholder text (Jeff 2026-08-20: "what is the /
  // button doing all the way out there") — a fixed 26rem box fit the EN
  // placeholder but left the zh one half-empty. Width follows the actual
  // placeholder (CJK ≈ 2ch in the mono stack) until the user types.
  const ph = tl('type command or symbol…  (h = help)')
  let phCh = 3
  for (const c of ph) phCh += c.charCodeAt(0) > 0x2e7f ? 2 : 1
  return (
    <div class="max-md:hidden relative shrink-0">
      {open && log.length > 0 && (
        <div class="absolute bottom-full left-0 right-0 z-40 bg-surface-1/95 backdrop-blur border-t border-line shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
          {/* one brow, not a grip strip stacked on a header — the word sat
              low in a tall band (Jeff 2026-08-06: "equal height margins
              top/bottom"). The whole header is the resize handle now. */}
          <div onPointerDown={startDrag}
            class="relative flex items-center px-3 py-1 border-b border-line-2 cursor-ns-resize touch-none group/grip"
            title={tl('tap to cycle size · drag to resize')}>
            <span class="font-mono text-[9px] tracking-wider text-muted uppercase">{tl('console')}</span>
            <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-[3px] rounded bg-line group-hover/grip:bg-accent group-active/grip:bg-accent" />
            <button
              onClick={closeConsole}
              onPointerDown={(e) => e.stopPropagation()}
              class="ml-auto font-mono text-[11px] text-muted hover:text-ink px-1 cursor-pointer"
              title="Esc"
            >
              ✕
            </button>
          </div>
          <div ref={(node) => { scrollRef.current = node; panelRef.current = node }}
            onClick={() => setExpanded(true)}
            style={{
              height: `${postureHeight()}px`,
              maxHeight: `${postureHeight()}px`,
            }}
            class="overflow-y-auto px-3 py-1.5 font-mono text-[11px] leading-relaxed select-text will-change-[height]">
            {log.map((entry) => (
              <div key={entry.id} class="pb-1">
                <div class="text-muted">
                  <span class="text-accent">ticker&gt;</span> {entry.cmd}
                </div>
                <pre class="text-ink-2 whitespace-pre-wrap m-0 font-mono"><Rich text={entry.text} /></pre>
              </div>
            ))}
          </div>
        </div>
      )}
      {suggestions.length > 0 && (
        <div class="absolute bottom-full left-0 right-0 z-30 flex items-center gap-1 px-3 py-1
                    bg-surface-2/95 backdrop-blur border-t border-line-2 overflow-x-auto no-scrollbar">
          {suggestions.map((sug, i) => (
            <button
              key={sug}
              type="button"
              onClick={() => { setValue(`${sug} `); inputRef.current?.focus() }}
              class={`shrink-0 px-1.5 py-px rounded font-mono text-[10.5px] ${
                i === 0 ? 'bg-accent text-black font-semibold' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {sug.split(/\s+/).pop()}
            </button>
          ))}
          <span class="ml-auto shrink-0 text-[9px] font-mono text-muted tracking-wider">tab</span>
        </div>
      )}
      <form
        onSubmit={run}
        class={`flex items-center gap-2 px-3 bg-surface-1 border-t font-mono text-[11px] transition-all ${
          hot ? 'h-11 border-accent/70 bg-accent-soft' : 'h-8 border-line'
        }`}
      >
        <span class="text-accent font-bold shrink-0">ticker&gt;</span>
        <input
          ref={inputRef}
          value={value}
          onInput={(e) => setValue(e.currentTarget.value)}
          onKeyDown={onKey}
          onBlur={() => setHot(false)}
          placeholder={ph}
          class="flex-none bg-transparent outline-none text-ink placeholder:text-muted min-w-0"
          style={{ width: value ? 'min(100%, 26rem)' : `min(100%, ${phCh}ch)` }}
        />
        {/* keycap hint sits right after the placeholder text (Jeff
            2026-08-17: not all the way left, not bottom-right). Glyph is
            dead-centered: flex + line-height 1 + a 1px optical nudge, since
            the slash's ink sits high in the mono em box. */}
        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          title={tl('focus console')}
          class="shrink-0 w-5 h-5 inline-flex items-center justify-center rounded border border-line-2 bg-surface-2 text-muted hover:text-ink text-[10px] leading-none pt-px"
        >
          /
        </button>
        <span class="flex-1" />
      </form>
    </div>
  )
}
