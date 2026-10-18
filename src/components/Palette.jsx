import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { filterNav, searchLocal, searchSymbols } from '../lib/search.js'
import { venueFlag } from '../lib/venueFlag.js'
import { hrefFor } from '../lib/route.js'
import { parseCommand, describePlan } from '../lib/commands.js'
import { executePlan } from '../lib/execute.js'
import { Overlay } from './Overlay.jsx'
import { t as tt, tl } from '../lib/i18n.js'
import { localName, zhName, zhAliasHits } from '../lib/zhNames.js'
import { useZhNames } from '../hooks.js'

// Ctrl/Cmd+K command palette: run a command, jump to a section, or pull up any
// symbol. The user's own universe (watchlist, named lists, recents) matches
// synchronously; the Yahoo lookup is debounced and merges in when it lands.
// (`/` is the command bar's — the palette is Cmd/Ctrl+K only.)

const ICONS = {
 dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 watchlists:'M5 3h14v18l-7-4-7 4z', brief:'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5',
 markets:'M3 18l6-7 5 3 7-10 M16 4h5v5', portfolio:'M3 7h18v13H3z M8 7V3h8v4 M3 12h18',
 screen:'M3 5h18 M6 12h12 M9 19h6', alerts:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5z M10 21h4',
 wire:'M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h4', chat:'M3 4h18v13H9l-6 4z M7 8h10 M7 12h6',
 symbol:'M4 19V5 M4 19h16 M8 15l4-5 4 2 4-7', list:'M8 5h13 M8 12h13 M8 19h13 M3 5h1 M3 12h1 M3 19h1',
 command:'M5 5l7 7-7 7 M13 19h6',
}
function EntryIcon({entry}) {
 return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS[entry.section]||ICONS[entry.kind]||ICONS.command}/></svg>
}

export function Palette({ onClose, seed = '' }) {
  const namesReady = useZhNames()
  // `seed`: text already typed into a phone search field before it handed
  // off to the sheet — never lose the user's first keystroke
  const [query, setQuery] = useState(seed)
  const [symbols, setSymbols] = useState([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const resultsRef = useRef(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    // Overlay puts focus here on open; this only fixes the caret, which must
    // land after the seed rather than before it
    try { el.setSelectionRange(el.value.length, el.value.length) } catch { /* not a text input */ }
  }, [])

  useEffect(() => {
    let active = true
    setSymbols([])
    if (!query.trim()) return
    const timer = setTimeout(() => {
      searchSymbols(query).then(value => {if(active) setSymbols(value)}).catch(() => {if(active) setSymbols([])})
    }, 250)
    return () => {active=false;clearTimeout(timer)}
  }, [query])

  const cmd = query.trim()
  const local = useMemo(() => searchLocal(cmd, zhName), [cmd, namesReady])
  const plan = useMemo(() => parseCommand(cmd), [cmd])

  const entries = []
  // A bare ticker already has its own rows below (and `verify` marks exactly
  // that plan) — a "run: NVDA" row on top of them would just be noise.
  if (plan && !plan.verify) {
    entries.push({
      kind: 'command',
      label: cmd,
      detail: describePlan(plan),
      plan,
    })
  }
  const localSyms = new Set(local.filter((e) => e.kind === 'symbol').map((e) => e.symbol))
  entries.push(
    ...local,
    ...[...zhAliasHits(cmd), ...symbols]
      .filter((s) => {const sym=s.symbol.toUpperCase();if(localSyms.has(sym))return false;localSyms.add(sym);return true})
      .map((s) => ({
        kind: 'symbol',
        label: s.symbol,
        detail: [localName(s.symbol, s.name), s.type, s.exchange].filter(Boolean).join(' · '),
        flag: venueFlag({ exch: s.exchange, symbol: s.symbol }),
        href: hrefFor('research', s.symbol.toLowerCase()),
      })),
    ...filterNav(query, tl),
  )
  const sel = Math.min(selected, Math.max(0, entries.length - 1))

  useEffect(() => {resultsRef.current?.querySelector(`[data-index="${sel}"]`)?.scrollIntoView?.({block:'nearest'})}, [sel])

  const go = (entry) => {
    if (!entry) return
    if (entry.kind === 'command') executePlan(entry.plan, cmd)
    else location.hash = entry.href
    onClose()
  }

  const onKey = (e) => {
    if(e.isComposing || e.keyCode===229) return
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
    <Overlay onClose={onClose} label={tt('palette.title')} initialFocus={inputRef}
      backdropClass="fixed inset-0 z-50 bg-black/70 flex items-start justify-center pt-[10vh] px-4 pb-4 max-sm:p-0 max-sm:bg-surface-0"
      class="command-palette w-full max-w-lg bg-surface-1 border border-line rounded-xl shadow-2xl overflow-hidden flex flex-col max-sm:max-w-none max-sm:h-full max-sm:rounded-none max-sm:border-0 font-anth">
      <div class="flex items-center gap-3 px-4 border-b border-line max-sm:pt-[env(safe-area-inset-top)]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="text-muted shrink-0" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg>
        <input ref={inputRef} value={query} onInput={e=>{setQuery(e.currentTarget.value);setSelected(0)}} onKeyDown={onKey}
          role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="palette-results" aria-activedescendant={entries.length ? `palette-option-${sel}` : undefined}
          aria-label={tt('palette.placeholder')} placeholder={tt('palette.placeholder')}
          autocapitalize="off" autocorrect="off" spellcheck={false} enterkeyhint="go"
          class="flex-1 min-w-0 bg-transparent py-4 text-[14px] max-sm:text-[16px] text-ink outline-none placeholder:text-muted"/>
        <button type="button" onClick={onClose} aria-label={tt('palette.close')} class="shrink-0 px-1.5 py-1 rounded border border-line text-muted hover:text-ink text-[10px] font-mono">Esc</button>
      </div>
      <div ref={resultsRef} id="palette-results" role="listbox" aria-label={tt('palette.title')} class="command-palette-results overflow-y-auto p-2 min-h-0">
        {entries.length===0 && <div class="px-3 py-6 text-[12px] text-muted">{tt('palette.no_match')}</div>}
        {entries.map((entry,i)=><div key={`${entry.kind}:${entry.href||entry.label}`}>
          {(i===0 || entries[i-1].kind!==entry.kind) && <div class="px-3 pt-3 pb-1.5 text-[9px] uppercase tracking-wider text-muted">{tt(`palette.${entry.kind}`)}</div>}
          <button id={`palette-option-${i}`} data-index={i} type="button" role="option" aria-selected={i===sel} tabIndex={-1}
            onClick={()=>go(entry)} onMouseEnter={()=>setSelected(i)}
            class={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left ${i===sel ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-surface-2'}`}>
            <span class={`w-8 h-8 shrink-0 grid place-items-center rounded-lg border ${i===sel?'border-accent/30':'border-line text-muted'}`}><EntryIcon entry={entry}/></span>
            <span class="min-w-0 flex-1"><span class={`block text-[13px] truncate ${entry.kind==='symbol'?'font-mono':'font-medium'}`}>{entry.label}</span>
              {(entry.detail || (entry.symbol && zhName(entry.symbol))) && <span class="block text-[10px] text-muted truncate mt-0.5">{entry.detail||zhName(entry.symbol)}</span>}</span>
            {entry.flag && <img src={entry.flag} alt="" class="w-4 h-3 rounded-[1px] shrink-0"/>}
            {i===sel && <span class="text-[12px] text-muted" aria-hidden="true">↵</span>}
          </button>
        </div>)}
      </div>
      <div class="flex items-center gap-4 px-4 py-2.5 text-[10px] text-muted border-t border-line bg-surface-2 max-sm:pb-[max(.625rem,env(safe-area-inset-bottom))]">
        <span><kbd class="font-mono mr-1">↑ ↓</kbd>{tt('palette.navigate')}</span><span><kbd class="font-mono mr-1">↵</kbd>{tt('palette.open')}</span>
        <span class="ml-auto">{tt('palette.hint')}</span>
      </div>
    </Overlay>
  )
}
