import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { filterNav, searchLocal, searchSymbols } from '../lib/search.js'
import { venueFlag } from '../lib/venueFlag.js'
import { hrefFor } from '../lib/route.js'
import { parseCommand, describePlan } from '../lib/commands.js'
import { executePlan } from '../lib/execute.js'
import { Overlay } from './Overlay.jsx'
import { t as tt } from '../lib/i18n.js'

// Ctrl/Cmd+K command palette: run a command, jump to a section, or pull up any
// symbol. The user's own universe (watchlist, named lists, recents) matches
// synchronously; the Yahoo lookup is debounced and merges in when it lands.
// (`/` is the command bar's — the palette is Cmd/Ctrl+K only.)

const TAGS = { command: 'run', symbol: 'sym', nav: 'go to', list: 'list' }

export function Palette({ onClose, seed = '' }) {
  // `seed`: text already typed into a phone search field before it handed
  // off to the sheet — never lose the user's first keystroke
  const [query, setQuery] = useState(seed)
  const [symbols, setSymbols] = useState([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const debounce = useRef(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    // Overlay puts focus here on open; this only fixes the caret, which must
    // land after the seed rather than before it
    try { el.setSelectionRange(el.value.length, el.value.length) } catch { /* not a text input */ }
  }, [])

  useEffect(() => {
    clearTimeout(debounce.current)
    if (!query.trim()) {
      setSymbols([])
      return
    }
    debounce.current = setTimeout(() => {
      searchSymbols(query).then(setSymbols).catch(() => setSymbols([]))
    }, 250)
    return () => clearTimeout(debounce.current)
  }, [query])

  const cmd = query.trim()
  const local = useMemo(() => searchLocal(cmd), [cmd])
  const plan = useMemo(() => parseCommand(cmd), [cmd])

  const entries = []
  // A bare ticker already has its own rows below (and `verify` marks exactly
  // that plan) — a "run: NVDA" row on top of them would just be noise.
  if (plan && !plan.verify) {
    entries.push({
      kind: 'command',
      label: `run: ${cmd}`,
      detail: describePlan(plan),
      plan,
    })
  }
  const localSyms = new Set(local.filter((e) => e.kind === 'symbol').map((e) => e.symbol))
  entries.push(
    ...local,
    ...symbols
      .filter((s) => !localSyms.has(s.symbol.toUpperCase()))
      .map((s) => ({
        kind: 'symbol',
        label: s.symbol,
        detail: [s.name, s.type, s.exchange].filter(Boolean).join(' · '),
        flag: venueFlag({ exch: s.exchange, symbol: s.symbol }),
        href: hrefFor('research', s.symbol.toLowerCase()),
      })),
    ...filterNav(query),
  )
  const sel = Math.min(selected, Math.max(0, entries.length - 1))

  const go = (entry) => {
    if (!entry) return
    if (entry.kind === 'command') executePlan(entry.plan, cmd)
    else location.hash = entry.href
    onClose()
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((n) => Math.min(n + 1, entries.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((n) => Math.max(n - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // bare ticker + no results yet → jump straight to research
      if (!entries.length && /^[A-Za-z0-9.^=-]{1,12}$/.test(cmd)) {
        location.hash = hrefFor('research', cmd.toLowerCase())
        onClose()
      } else go(entries[sel])
    }
  }

  return (
    /* Desktop: a centered card. Phone: a full-screen sheet — the whole page if
       results need it (Jeff 2026-08-17). The input is 16px on phone so iOS
       Safari doesn't zoom the viewport on focus. */
    <Overlay
      onClose={onClose}
      label={tt('palette.placeholder')}
      initialFocus={inputRef}
      backdropClass="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[15vh] max-sm:pt-0 max-sm:bg-surface-0"
      class="w-full max-w-lg bg-surface-1 border border-line rounded-xl shadow-2xl overflow-hidden max-sm:max-w-none max-sm:h-full max-sm:rounded-none max-sm:border-0 max-sm:flex max-sm:flex-col"
    >
      <div class="flex items-center gap-2 border-b border-line bg-surface-2 max-sm:pt-[env(safe-area-inset-top)]">
        <input
          ref={inputRef}
          value={query}
          onInput={(e) => { setQuery(e.currentTarget.value); setSelected(0) }}
          onKeyDown={onKey}
          placeholder={tt('palette.placeholder')}
          autocapitalize="off" autocorrect="off" spellcheck={false} enterkeyhint="go"
          class="flex-1 min-w-0 bg-transparent px-4 py-3 font-mono text-[13px] max-sm:text-[16px] max-sm:py-3.5 text-ink outline-none placeholder:text-muted"
        />
        <button type="button" onClick={onClose} aria-label={tt('palette.close')}
          class="sm:hidden shrink-0 mr-2 w-8 h-8 grid place-items-center rounded-lg text-muted active:text-ink font-mono text-[14px]">✕</button>
      </div>
      <div class="max-h-80 overflow-y-auto max-sm:max-h-none max-sm:flex-1 max-sm:pb-[env(safe-area-inset-bottom)]">
        {entries.length === 0 && query.trim() && (
          <div class="px-4 py-3 font-mono text-[11px] text-muted">
            {tt('palette.no_match', { q: query.trim().toUpperCase() })}
          </div>
        )}
        {!query.trim() && (
          <div class="px-4 py-2 font-mono text-[10px] text-muted border-b border-line-2">
            alt+1…9 jumps to a section · type a command (chart NVDA 6M)
          </div>
        )}
        {entries.map((entry, i) => (
          <button
            key={`${entry.kind}:${entry.label}`}
            onClick={() => go(entry)}
            onMouseEnter={() => setSelected(i)}
            class={`w-full flex items-center gap-3 px-4 py-2 max-sm:py-3 text-left font-mono text-[12px] max-sm:text-[14px] ${
              i === sel ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-surface-3'
            }`}
          >
            <span class="text-[9px] uppercase tracking-wider text-muted w-12 shrink-0">
              {entry.source || TAGS[entry.kind]}
            </span>
            {entry.flag && <img src={entry.flag} alt="" class="w-4 h-3 rounded-[1px] shrink-0" />}
            <span class="font-bold">{entry.label}</span>
            {entry.detail && <span class="text-[10px] text-muted truncate">{entry.detail}</span>}
          </button>
        ))}
      </div>
    </Overlay>
  )
}
